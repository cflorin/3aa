# STORY-093 — ThresholdAssigner Regime Decoupling (Growth Tier + Cyclical Overlay)

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Refactor `ThresholdAssigner` from code-keyed anchor lookup to regime-driven lookup with growth tier overlay and cyclical overlay. This is the largest domain change in EPIC-008: it replaces the `anchored_thresholds` table lookup with the `valuation_regime_thresholds` table and implements the two-dimensional threshold computation pipeline specified in ADR-005 (amended), ADR-017, and ADR-018.

The computation order is: (1) lookup base row → (2) growth tier substitution → (3) quality downgrade → (4) cyclical overlay → (5a) gross margin adj → (5b) dilution adj → (6) floor / ordering.

## Story
As the system,
I want `ThresholdAssigner` to be regime-driven,
so that a semiconductor stock and a mature industrial with the same quality grades but different earnings structures receive appropriately differentiated thresholds.

## Outcome
`ThresholdAssigner` reads from `valuation_regime_thresholds` (not `anchored_thresholds`), applies growth tier substitution for `profitable_growth_pe`, applies cyclical overlay, and produces a fully annotated `ThresholdResult`. `ValuationInput` and `ValuationResult` interfaces are updated to carry all new fields.

## Scope In

### Updated `ValuationInput` interface additions
(Added to `src/domain/valuation/types.ts`)

```typescript
// NEW: regime selector inputs
netIncomeTtm: number | null;
freeCashFlowTtm: number | null;
operatingMarginTtm: number | null;
grossMarginTtm: number | null;
fcfConversionTtm: number | null;
revenueGrowthFwd: number | null;
bankFlag: boolean;

// NEW: cyclical score inputs (pre-computed by CyclicalScoreService, read from stock table)
structuralCyclicalityScore: number;   // 0–3
cyclePosition: CyclePosition;
cyclicalConfidence: 'high' | 'medium' | 'low' | 'insufficient_data';  // passed through, not recomputed here

// NEW: regime (pre-computed by selectRegime(); injected)
valuationRegime: ValuationRegime;

// REPLACED: ValuationRegimeThresholdRow[] replaces AnchoredThresholdRow[]
valuationRegimeThresholds: ValuationRegimeThresholdRow[];
```

**Backward compat:** `anchoredThresholds` is deprecated. `ValuationInput.anchoredThresholds` can remain for legacy calls but is ignored when `valuationRegime` is set.

### Updated `ValuationResult` interface additions
```typescript
valuationRegime: ValuationRegime;
growthTier: GrowthTier | null;
structuralCyclicalityScoreSnapshot: number;
cyclePositionSnapshot: CyclePosition;
cyclicalOverlayApplied: boolean;
cyclicalOverlayValue: number | null;
cyclicalConfidence: 'high' | 'medium' | 'low' | 'insufficient_data';
thresholdFamily: string;   // e.g. 'profitable_growth_pe_mid_BA'
```

### Growth tier config (runtime constant)

```typescript
const GROWTH_TIER_CONFIG: Record<GrowthTier, { minGrowth: number; base: ThresholdQuad }> = {
  high:     { minGrowth: 0.35, base: { max: 36, comfortable: 30, veryGood: 24, steal: 18 } },
  mid:      { minGrowth: 0.25, base: { max: 30, comfortable: 25, veryGood: 21, steal: 17 } },
  standard: { minGrowth: 0.20, base: { max: 26, comfortable: 22, veryGood: 19, steal: 16 } },
};
```

### `resolveGrowthTier(revenueGrowthFwd: number): GrowthTier`
- Called only when `valuationRegime === 'profitable_growth_pe'`
- `revenueGrowthFwd` is guaranteed non-null in this context (Step 2 gate)
- No null handling needed; comment explaining invariant

### Cyclical overlay (ADR-018)

**Case A: `profitable_growth_pe` + score ≥ 1**

```typescript
function computeProfitableGrowthCyclicalOverlay(
  score: number,
  position: CyclePosition,
): number {  // turns to subtract
  if (score === 0 || score === 3) return 0;   // score=3 handled upstream (cyclical_earnings)
  if (score === 1) return (position === 'elevated' || position === 'peak') ? 4.0 : 2.0;
  if (score === 2) return (position === 'elevated' || position === 'peak') ? 6.0 : 4.0;
  return 0;
}
```

**Case B: `cyclical_earnings`**

```typescript
function computeCyclicalEarningsOverlay(position: CyclePosition): number {
  if (position === 'elevated') return 2.0;
  if (position === 'peak') return 3.5;
  return 0;   // depressed: no tightening; normal/insufficient_data: no tightening
}
```

Note for `cyclical_earnings + depressed`: no tightening applied. System surfaces a basis warning in `threshold_adjustments`: `"depressed_cycle_spot_earnings_basis_warning"`. User may manually set `current_multiple_basis = 'mid_cycle'`.

### Threshold computation pipeline

```
1. Base quad  = valuation_regime_thresholds[regime]
2. Growth tier (profitable_growth_pe only): replace base with GROWTH_TIER_CONFIG[tier]
3. Quality downgrade: subtract REGIME_DOWNGRADE_CONFIG[regime] × (EQ_steps + BS_steps)
4. Cyclical overlay: subtract Case A or Case B turns
5a. Gross margin adj (ev_sales only, B6/B7): ±1.0/1.5×
5b. Dilution adj (B5–B7): −1 turn
6. Floor (≥ 0.5×) and ordering invariant (steal ≤ veryGood ≤ comfortable ≤ max, min 0.5 gap)
```

### `threshold_family` label

Format: `{regime}_{tier}_{EQ}{BS}` for `profitable_growth_pe`; `{regime}_{EQ}{BS}` for all others.

Examples:
- `profitable_growth_pe_high_AA`
- `profitable_growth_pe_mid_BA`
- `cyclical_earnings_AA`
- `mature_pe_CA`

### `REGIME_DOWNGRADE_CONFIG` (runtime constant)

```
mature_pe:                  eqAb=2.5, eqBc=2.0, bsAb=1.0, bsBc=2.0
profitable_growth_pe:       eqAb=4.0, eqBc=4.0, bsAb=2.0, bsBc=3.0
profitable_growth_ev_ebit:  eqAb=3.0, eqBc=3.0, bsAb=1.5, bsBc=2.0
cyclical_earnings:          eqAb=2.0, eqBc=2.0, bsAb=1.0, bsBc=1.5
sales_growth_standard:      eqAb=2.0, eqBc=1.75, bsAb=1.0, bsBc=1.75
sales_growth_hyper:         eqAb=2.0, eqBc=1.75, bsAb=1.0, bsBc=1.75
```

No config for `not_applicable`, `manual_required`, `financial_special_case` — these return null thresholds.

### Non-applicable regimes
For `not_applicable`, `manual_required`, `financial_special_case`: return `null` thresholds, set `valuationStateStatus` appropriately, skip all overlay steps.

## Scope Out
- `selectRegime()` implementation — STORY-092
- CyclicalScoreService — STORY-091
- Persistence — STORY-094
- `MetricSelector` — NOT deleted; still used as a fallback for legacy paths

## Dependencies
- STORY-089 ✅ (`ValuationRegimeThresholdRow` type + table exists)
- STORY-092 ✅ (`selectRegime()` available for injection pattern; regime passed as input)

## Tasks

### TASK-093-001: Update `ValuationInput` interface
- Add all new fields listed above
- Deprecate `anchoredThresholds` with `@deprecated` JSDoc comment
- Add `valuationRegimeThresholds: ValuationRegimeThresholdRow[]`

### TASK-093-002: Update `ValuationResult` interface
- Add all new output fields listed above
- `thresholdFamily: string` replaces `derivedFromCode` as primary label (retain `derivedFromCode` for backward compat, set to null)

### TASK-093-003: Growth tier implementation
- In `src/domain/valuation/threshold-assigner.ts`:
  - Add `GROWTH_TIER_CONFIG` constant
  - Add `resolveGrowthTier(revenueGrowthFwd: number): GrowthTier`
  - Add `applyGrowthTierOverlay(regime, revenueGrowthFwd, baseFromTable): { base, tier }`
  - Comment: null revenueGrowthFwd is invariant (cannot occur for profitable_growth_pe)

### TASK-093-004: Cyclical overlay implementation
- In `src/domain/valuation/threshold-assigner.ts`:
  - Add `REGIME_DOWNGRADE_CONFIG` constant
  - Add `computeProfitableGrowthCyclicalOverlay(score, position): number`
  - Add `computeCyclicalEarningsOverlay(position): number`
  - Add depressed-cycle basis warning to `threshold_adjustments` array

### TASK-093-005: Refactor `ThresholdAssigner` to regime-driven
- Update `src/domain/valuation/threshold-assigner.ts`:
  - When `input.valuationRegime` is present: use `ValuationRegimeThresholdRow` lookup
  - Apply 6-step pipeline in order
  - Build `thresholdFamily` label
  - Populate all new `ValuationResult` fields
  - Set `valuationStateStatus` correctly for not_applicable/manual_required/financial_special_case/computed
  - Existing code-keyed path (via `anchoredThresholds`) retained as fallback for legacy callers

### TASK-093-006: `ValuationStateStatus` normalisation in domain
- Update all places in domain code that set or compare `valuationStateStatus`
- Replace: `'ready'` → `'computed'`, `'missing_data'` → `'manual_required'`, `'manual_required_insurer'` → `'manual_required'`
- Add backward-compat read guard: `if (status === 'ready') status = 'computed'`

### TASK-093-007: Unit tests — threshold computation golden-set
- File: `tests/unit/domain/valuation/threshold-assigner-regime.test.ts`

**Golden-set cases:**

| Stock | Regime | Tier | Score | Pos | EQ | BS | Expected max | Expected steal |
|---|---|---|---|---|---|---|---|---|
| NVDA-normal | profitable_growth_pe | high | 2 | normal | A | A | 36−4=32 | 18−4=14 |
| NVDA-elevated | profitable_growth_pe | high | 2 | elevated | A | A | 36−6=30 | 18−6=12 |
| NVDA-A/B | profitable_growth_pe | high | 2 | normal | A | B | 32−2=30 | 14−2=12 |
| Mid-tier stock | profitable_growth_pe | mid | 0 | normal | A | A | 30 | 17 |
| Standard-tier stock | profitable_growth_pe | standard | 0 | normal | B | A | 26−4=22 | 16−4=12 |
| MU-normal | cyclical_earnings | — | — | normal | A | A | 16 | 7 |
| MU-elevated | cyclical_earnings | — | — | elevated | A | A | 16−2=14 | 7−2=5 |
| WMT | mature_pe | — | — | — | A | A | 22 | 16 |
| WMT-B/B | mature_pe | — | — | — | B | B | 22−2.5−1=18.5 | 16−2.5−1=12.5 |
| not_applicable | not_applicable | — | — | — | — | — | null | null |
| manual_required | manual_required | — | — | — | — | — | null | null |

- Test floor/ordering: after overlay, steal ≥ 0.5×; descending order maintained
- Test depressed-cycle warning: `cyclical_earnings + depressed` → 0 overlay + warning in adjustments[]
- Test `thresholdFamily` labels are correctly formatted

## Acceptance Criteria
- [ ] NVDA (score=2, normal, A/A): max=32, comfortable=26, veryGood=20, steal=14
- [ ] NVDA (score=2, elevated, A/A): max=30, comfortable=24, veryGood=18, steal=12
- [ ] MU (cyclical_earnings, elevated, A/A): max=14, comfortable=11, veryGood=8, steal=5
- [ ] WMT (mature_pe, A/A): max=22, comfortable=20, veryGood=18, steal=16
- [ ] `not_applicable` / `manual_required` → null thresholds, correct `valuationStateStatus`
- [ ] `thresholdFamily` label correctly formatted for profitable_growth_pe tiers
- [ ] `depressed` cycle in `cyclical_earnings` → no overlay, basis warning in adjustments
- [ ] Floor enforced: no threshold < 0.5×; ordering maintained after overlay
- [ ] Growth tier null-case invariant: `resolveGrowthTier` never called with null
- [ ] All unit tests pass

## Test Strategy
- Unit tests: golden-set above + floor/ordering edge cases
- Backward compat test: legacy call with `anchoredThresholds` (no regime set) still produces valid output
- Type check: `ValuationResult` fields match `ValuationState` Prisma model expected types
