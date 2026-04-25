// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-003: ThresholdAssigner — anchored lookup + mechanical derivation
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 2 & 3

import type { AnchoredThresholdRow, MetricFamily, ThresholdSource } from './types';
import { parseBucket } from './metric-selector';

export interface ThresholdResult {
  maxThreshold: number | null;
  comfortableThreshold: number | null;
  veryGoodThreshold: number | null;
  stealThreshold: number | null;
  thresholdSource: ThresholdSource;
  derivedFromCode: string | null;
  metricFamily: MetricFamily;
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
