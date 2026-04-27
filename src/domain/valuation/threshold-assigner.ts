// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-003: ThresholdAssigner — anchored lookup + mechanical derivation
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 2 & 3
// EPIC-008/STORY-093: ThresholdAssigner Regime Decoupling
// TASK-093-003/004/005: Growth tier, cyclical overlay, regime-driven 6-step pipeline

import type {
  AnchoredThresholdRow,
  MetricFamily,
  ThresholdSource,
  ThresholdAdjustment,
  ValuationRegime,
  ValuationRegimeThresholdRow,
  CyclePosition,
  GrowthTier,
  ValuationStateStatus,
} from './types';
import { parseBucket } from './metric-selector';

export interface ThresholdResult {
  maxThreshold: number | null;
  comfortableThreshold: number | null;
  veryGoodThreshold: number | null;
  stealThreshold: number | null;
  thresholdSource: ThresholdSource;
  derivedFromCode: string | null;
  metricFamily: MetricFamily;
  // EPIC-008 optional fields — populated by assignThresholdsRegimeDriven
  thresholdFamily?: string | null;
  growthTier?: GrowthTier | null;
  cyclicalOverlayApplied?: boolean;
  cyclicalOverlayValue?: number | null;
  valuationStateStatus?: ValuationStateStatus;
  thresholdAdjustments?: ThresholdAdjustment[];
}

// Per-step quality downgrade adjustments by metric family.
// EQ: A→B, B→C shifts (applied to each threshold value)
// BS: A→B, B→C shifts
const SHIFTS: Record<MetricFamily, { eq: [number, number]; bs: [number, number] }> = {
  pe:       { eq: [-2.5, -2.0], bs: [-1.0, -2.0] },
  ev_ebit:  { eq: [-2.0, -2.0], bs: [-1.25, -2.0] },
  ev_sales: { eq: [-2.0, -1.75], bs: [-1.0, -1.75] },
};

const FLOORS: Record<MetricFamily, number> = {
  pe: 1.0,
  ev_ebit: 1.0,
  ev_sales: 0.5,
};

const GRADE_ORDER = ['A', 'B', 'C'] as const;
type Grade = 'A' | 'B' | 'C';

function gradeIndex(g: string): number {
  return GRADE_ORDER.indexOf(g as Grade);
}

function qualityAdjustment(
  fromGrade: string,
  toGrade: string,
  steps: [number, number],
): number {
  const from = gradeIndex(fromGrade);
  const to = gradeIndex(toGrade);
  if (to <= from) return 0;
  let total = 0;
  for (let i = from; i < to; i++) {
    total += steps[i] ?? 0;
  }
  return total;
}

function metricFamilyForBucket(bucket: number, preOpLev?: boolean): MetricFamily {
  if (bucket >= 1 && bucket <= 4) return 'pe';
  if (bucket === 5) return preOpLev ? 'ev_sales' : 'ev_ebit';
  return 'ev_sales'; // 6, 7
}

function codeEq(code: string): string { return code.charAt(1); }
function codeBs(code: string): string { return code.charAt(2); }

function selectReferenceAnchor(
  bucket: number,
  targetEq: string,
  targetBs: string,
  anchors: AnchoredThresholdRow[],
  family: MetricFamily,
): AnchoredThresholdRow | null {
  // For pre-op-leverage B5 (ev_sales family), use B6 anchors
  const effectiveBucket = (bucket === 5 && family === 'ev_sales') ? 6 : bucket;
  const candidates = anchors.filter(a => a.bucket === effectiveBucket);
  if (candidates.length === 0) return null;

  // Priority 1: same EQ grade (derive only BS delta)
  const sameEq = candidates.filter(a => a.earningsQuality === targetEq);
  if (sameEq.length > 0) {
    // Among same EQ, pick the one with closest BS (lowest BS index ≤ target BS)
    const closest = sameEq.reduce((best, a) => {
      const aDist = Math.abs(gradeIndex(a.balanceSheetQuality) - gradeIndex(targetBs));
      const bDist = Math.abs(gradeIndex(best.balanceSheetQuality) - gradeIndex(targetBs));
      return aDist < bDist ? a : best;
    });
    return closest;
  }

  // Priority 2: same BS grade (derive only EQ delta)
  const sameBs = candidates.filter(a => a.balanceSheetQuality === targetBs);
  if (sameBs.length > 0) {
    return sameBs.reduce((best, a) => {
      const aDist = Math.abs(gradeIndex(a.earningsQuality) - gradeIndex(targetEq));
      const bDist = Math.abs(gradeIndex(best.earningsQuality) - gradeIndex(targetEq));
      return aDist < bDist ? a : best;
    });
  }

  // Priority 3: AA anchor as last resort
  return candidates.find(a => a.earningsQuality === 'A' && a.balanceSheetQuality === 'A') ?? candidates[0];
}

function enforceFloorAndOrder(
  vals: [number, number, number, number],
  floor: number,
): [number, number, number, number] {
  // Apply floor
  let [max, comfortable, veryGood, steal] = vals.map(v => Math.max(v, floor)) as [number, number, number, number];

  // Ensure descending order: clamp each to be strictly less than the one above it
  // Use 0.25 as minimum gap (spec doesn't specify, pragmatic choice)
  const GAP = 0.25;
  steal = Math.max(floor, steal);
  veryGood = Math.max(steal + GAP, veryGood);
  comfortable = Math.max(veryGood + GAP, comfortable);
  max = Math.max(comfortable + GAP, max);

  // Round to 2 decimal places
  return [max, comfortable, veryGood, steal].map(v => Math.round(v * 100) / 100) as [number, number, number, number];
}

export function assignThresholds(
  activeCode: string,
  anchors: AnchoredThresholdRow[],
  preOpLev = false,
): ThresholdResult {
  const bucket = parseBucket(activeCode);

  // B8: no thresholds
  if (bucket === 8) {
    return {
      maxThreshold: null,
      comfortableThreshold: null,
      veryGoodThreshold: null,
      stealThreshold: null,
      thresholdSource: 'anchored',
      derivedFromCode: null,
      metricFamily: 'pe', // irrelevant
    };
  }

  const family = metricFamilyForBucket(bucket, preOpLev);

  // Exact anchored match
  const exact = anchors.find(a => a.code === activeCode);
  if (exact) {
    return {
      maxThreshold: exact.maxThreshold,
      comfortableThreshold: exact.comfortableThreshold,
      veryGoodThreshold: exact.veryGoodThreshold,
      stealThreshold: exact.stealThreshold,
      thresholdSource: 'anchored',
      derivedFromCode: null,
      metricFamily: family,
    };
  }

  // Derive from nearest anchor
  const targetEq = codeEq(activeCode);
  const targetBs = codeBs(activeCode);
  const ref = selectReferenceAnchor(bucket, targetEq, targetBs, anchors, family);

  if (!ref) {
    // No reference found: cannot derive
    return {
      maxThreshold: null,
      comfortableThreshold: null,
      veryGoodThreshold: null,
      stealThreshold: null,
      thresholdSource: 'derived',
      derivedFromCode: null,
      metricFamily: family,
    };
  }

  const shifts = SHIFTS[family];
  const eqAdj = qualityAdjustment(ref.earningsQuality, targetEq, shifts.eq);
  const bsAdj = qualityAdjustment(ref.balanceSheetQuality, targetBs, shifts.bs);
  const totalAdj = eqAdj + bsAdj;
  const floor = FLOORS[family];

  const [max, comfortable, veryGood, steal] = enforceFloorAndOrder(
    [
      ref.maxThreshold + totalAdj,
      ref.comfortableThreshold + totalAdj,
      ref.veryGoodThreshold + totalAdj,
      ref.stealThreshold + totalAdj,
    ],
    floor,
  );

  return {
    maxThreshold: max,
    comfortableThreshold: comfortable,
    veryGoodThreshold: veryGood,
    stealThreshold: steal,
    thresholdSource: 'derived',
    derivedFromCode: ref.code,
    metricFamily: family,
  };
}

// ── EPIC-008/STORY-093: Regime-driven threshold pipeline ─────────────────────

interface ThresholdQuad {
  max: number;
  comfortable: number;
  veryGood: number;
  steal: number;
}

// Growth tier base thresholds for profitable_growth_pe (ADR-005 §2.2 amended 2026-04-27)
const GROWTH_TIER_CONFIG: Record<GrowthTier, { minGrowth: number; base: ThresholdQuad }> = {
  high:     { minGrowth: 0.35, base: { max: 36, comfortable: 30, veryGood: 24, steal: 18 } },
  mid:      { minGrowth: 0.25, base: { max: 30, comfortable: 25, veryGood: 21, steal: 17 } },
  standard: { minGrowth: 0.20, base: { max: 26, comfortable: 22, veryGood: 19, steal: 16 } },
};

// Per-regime quality downgrade turns (ADR-018 §3)
// eqAb/eqBc: turns subtracted per EQ step (A→B / B→C); bsAb/bsBc: same for BS
const REGIME_DOWNGRADE_CONFIG: Record<string, { eqAb: number; eqBc: number; bsAb: number; bsBc: number }> = {
  mature_pe:                 { eqAb: 2.5,  eqBc: 2.0,  bsAb: 1.0,  bsBc: 2.0  },
  profitable_growth_pe:      { eqAb: 4.0,  eqBc: 4.0,  bsAb: 2.0,  bsBc: 3.0  },
  profitable_growth_ev_ebit: { eqAb: 3.0,  eqBc: 3.0,  bsAb: 1.5,  bsBc: 2.0  },
  cyclical_earnings:         { eqAb: 2.0,  eqBc: 2.0,  bsAb: 1.0,  bsBc: 1.5  },
  sales_growth_standard:     { eqAb: 2.0,  eqBc: 1.75, bsAb: 1.0,  bsBc: 1.75 },
  sales_growth_hyper:        { eqAb: 2.0,  eqBc: 1.75, bsAb: 1.0,  bsBc: 1.75 },
};

// revenueGrowthFwd is guaranteed non-null when regime === 'profitable_growth_pe'
// (selectRegime Step 2 gate requires rev_growth ≥ 0.20 to reach this path)
export function resolveGrowthTier(revenueGrowthFwd: number): GrowthTier {
  if (revenueGrowthFwd >= GROWTH_TIER_CONFIG.high.minGrowth) return 'high';
  if (revenueGrowthFwd >= GROWTH_TIER_CONFIG.mid.minGrowth) return 'mid';
  return 'standard';
}

function computeQualityDowngrade(
  eq: string,
  bs: string,
  config: { eqAb: number; eqBc: number; bsAb: number; bsBc: number },
): number {
  let total = 0;
  if (eq === 'B' || eq === 'C') total += config.eqAb;
  if (eq === 'C') total += config.eqBc;
  if (bs === 'B' || bs === 'C') total += config.bsAb;
  if (bs === 'C') total += config.bsBc;
  return total;
}

// Case A: profitable_growth_pe + score 1–2 (score=3 routes to cyclical_earnings upstream)
export function computeProfitableGrowthCyclicalOverlay(score: number, position: CyclePosition): number {
  if (score === 0 || score === 3) return 0;
  if (score === 1) return (position === 'elevated' || position === 'peak') ? 4.0 : 2.0;
  if (score === 2) return (position === 'elevated' || position === 'peak') ? 6.0 : 4.0;
  return 0;
}

// Case B: cyclical_earnings — depressed/normal/insufficient_data → no tightening
export function computeCyclicalEarningsOverlay(position: CyclePosition): number {
  if (position === 'elevated') return 2.0;
  if (position === 'peak') return 3.5;
  return 0;
}

function metricFamilyForPrimaryMetric(primaryMetric: string): MetricFamily {
  if (primaryMetric === 'ev_sales') return 'ev_sales';
  if (primaryMetric === 'forward_ev_ebit') return 'ev_ebit';
  return 'pe';
}

export interface RegimeDrivenThresholdInput {
  regime: ValuationRegime;
  thresholds: ValuationRegimeThresholdRow[];
  activeCode: string;                  // used to extract bucket + EQ/BS chars
  revenueGrowthFwd: number | null;     // for growth tier (profitable_growth_pe only)
  structuralCyclicalityScore: number;  // 0–3
  cyclePosition: CyclePosition;
  grossMarginTtm: number | null;       // step 5a
  shareCountGrowth3y?: number | null;  // step 5b
  materialDilutionFlag?: boolean;      // step 5b
}

export function assignThresholdsRegimeDriven(input: RegimeDrivenThresholdInput): ThresholdResult {
  const { regime } = input;

  // Non-applicable regimes: return null thresholds immediately
  if (regime === 'not_applicable' || regime === 'manual_required' || regime === 'financial_special_case') {
    const status: ValuationStateStatus = regime === 'not_applicable' ? 'not_applicable' : 'manual_required';
    return {
      maxThreshold: null,
      comfortableThreshold: null,
      veryGoodThreshold: null,
      stealThreshold: null,
      thresholdSource: 'anchored',
      derivedFromCode: null,
      metricFamily: 'pe',
      thresholdFamily: null,
      growthTier: null,
      cyclicalOverlayApplied: false,
      cyclicalOverlayValue: null,
      valuationStateStatus: status,
      thresholdAdjustments: [],
    };
  }

  // Step 1: base quad from valuation_regime_thresholds row
  const row = input.thresholds.find(r => r.regime === regime);
  if (!row || row.maxThreshold === null) {
    return {
      maxThreshold: null,
      comfortableThreshold: null,
      veryGoodThreshold: null,
      stealThreshold: null,
      thresholdSource: 'anchored',
      derivedFromCode: null,
      metricFamily: 'pe',
      thresholdFamily: null,
      growthTier: null,
      cyclicalOverlayApplied: false,
      cyclicalOverlayValue: null,
      valuationStateStatus: 'manual_required',
      thresholdAdjustments: [],
    };
  }

  const metricFamily = metricFamilyForPrimaryMetric(row.primaryMetric);
  const eq = codeEq(input.activeCode);
  const bs = codeBs(input.activeCode);

  let quad: ThresholdQuad = {
    max: row.maxThreshold!,
    comfortable: row.comfortableThreshold!,
    veryGood: row.veryGoodThreshold!,
    steal: row.stealThreshold!,
  };

  // Step 2: growth tier substitution (profitable_growth_pe only)
  let growthTier: GrowthTier | null = null;
  if (regime === 'profitable_growth_pe') {
    const tier = resolveGrowthTier(input.revenueGrowthFwd ?? 0.20);
    growthTier = tier;
    quad = { ...GROWTH_TIER_CONFIG[tier].base };
  }

  // Step 3: quality downgrade
  const downgradeConfig = REGIME_DOWNGRADE_CONFIG[regime];
  if (downgradeConfig) {
    const d = computeQualityDowngrade(eq, bs, downgradeConfig);
    if (d > 0) {
      quad = { max: quad.max - d, comfortable: quad.comfortable - d, veryGood: quad.veryGood - d, steal: quad.steal - d };
    }
  }

  // Step 4: cyclical overlay
  const adjustments: ThresholdAdjustment[] = [];
  let overlayValue = 0;

  if (regime === 'profitable_growth_pe') {
    overlayValue = computeProfitableGrowthCyclicalOverlay(input.structuralCyclicalityScore, input.cyclePosition);
  } else if (regime === 'cyclical_earnings') {
    overlayValue = computeCyclicalEarningsOverlay(input.cyclePosition);
    if (input.cyclePosition === 'depressed') {
      adjustments.push({ type: 'cyclical_warning', delta: 0, reason: 'depressed_cycle_spot_earnings_basis_warning' });
    }
  }

  if (overlayValue > 0) {
    quad = { max: quad.max - overlayValue, comfortable: quad.comfortable - overlayValue, veryGood: quad.veryGood - overlayValue, steal: quad.steal - overlayValue };
  }

  // Step 5a: gross margin adjustment (ev_sales metric, B6/B7 only)
  const bucket = parseBucket(input.activeCode);
  const floor = metricFamily === 'ev_sales' ? 0.5 : 1.0;

  if ((bucket === 6 || bucket === 7) && metricFamily === 'ev_sales' && input.grossMarginTtm != null) {
    const gm = input.grossMarginTtm;
    let delta = 0;
    let reason = '';
    if (gm > 0.80) { delta = +1.0; reason = 'gross_margin_above_80pct'; }
    else if (gm < 0.60) { delta = -1.5; reason = 'gross_margin_below_60pct'; }
    if (delta !== 0) {
      quad = { max: quad.max + delta, comfortable: quad.comfortable + delta, veryGood: quad.veryGood + delta, steal: quad.steal + delta };
      adjustments.push({ type: 'gross_margin', delta, reason });
    }
  }

  // Step 5b: dilution adjustment (B5–B7)
  if (bucket >= 5 && bucket <= 7) {
    const dilutionTriggered =
      (input.shareCountGrowth3y != null && input.shareCountGrowth3y > 0.05) ||
      input.materialDilutionFlag === true;
    if (dilutionTriggered) {
      quad = { max: quad.max - 1.0, comfortable: quad.comfortable - 1.0, veryGood: quad.veryGood - 1.0, steal: quad.steal - 1.0 };
      adjustments.push({ type: 'dilution', delta: -1.0, reason: input.materialDilutionFlag ? 'material_dilution_flag' : 'share_count_growth_above_5pct' });
    }
  }

  // Step 6: floor and ordering invariant
  const [max, comfortable, veryGood, steal] = enforceFloorAndOrder(
    [quad.max, quad.comfortable, quad.veryGood, quad.steal],
    floor,
  );

  const thresholdFamily =
    regime === 'profitable_growth_pe' && growthTier
      ? `profitable_growth_pe_${growthTier}_${eq}${bs}`
      : `${regime}_${eq}${bs}`;

  return {
    maxThreshold: max,
    comfortableThreshold: comfortable,
    veryGoodThreshold: veryGood,
    stealThreshold: steal,
    thresholdSource: 'anchored',
    derivedFromCode: null,
    metricFamily,
    thresholdFamily,
    growthTier,
    cyclicalOverlayApplied: overlayValue > 0,
    cyclicalOverlayValue: overlayValue > 0 ? overlayValue : null,
    valuationStateStatus: 'computed',
    thresholdAdjustments: adjustments,
  };
}
