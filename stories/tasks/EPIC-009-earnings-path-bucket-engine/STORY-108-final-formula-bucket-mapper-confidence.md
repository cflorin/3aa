# STORY-108 — Final Formula, Bucket Mapper, and Confidence Model

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the Final Formula assembly, Bucket Mapper, and Confidence Model as the top-level Earnings Path Engine service. This service calls STORY-102–107 sub-services, assembles `expected_normalized_eps_growth`, maps to bucket, applies the confidence model (§3.12), and replaces the V1 `BucketScorer`. This is the core algorithmic story of EPIC-009. The V1 BucketScorer must be retired but preserved as a legacy reference until STORY-111 regression tests confirm parity.

## Story
As the classification system,
I want a Final Formula service that assembles all engine components, maps to a bucket, and produces a confidence score,
so that every stock in the universe receives a deterministic, formula-based, auditable bucket assignment.

## Outcome
`EarningsPathEngineService.classify(input)` returns a complete `BucketEngineOutput` including: `bucket_suggested` (1–8), `expected_normalized_eps_growth`, `bucket_confidence` (decimal 0–1), all component values, `bucket_reason_codes`, and `fwd_eps_fallback_level`. The service replaces `BucketScorer` as the bucket computation method. The confidence model aggregates all reductions from all sub-services. The `ClassificationState.scores` Json is extended with the full engine output breakdown.

## Scope In
- Service: `src/domain/classification/engines/earnings-path-engine.service.ts`
- Assembles: `base_expected_earnings_growth = 0.45 × rev + 0.35 × eps_fwd + 0.20 × eps_hist`
- L4 fallback base formula: `0.60 × rev + 0.40 × eps_hist` (when no forward EPS)
- Full formula: `base + op_leverage_contribution + qualitative_modifier − cyclical_peak_penalty − dilution_penalty − sbc_penalty`
- Bucket Mapper: half-open intervals (< 0 → B1; 0–5% → B2; 5–10% → B3; 10–18% → B4; 18–30% → B5; 30–50% → B6; ≥50% → B7; binary_flag → B8)
- Bucket 8 invariant: check `binary_flag` BEFORE any computation
- Confidence Model (§3.12):
  - Baseline = 1.0
  - Aggregate all confidence reductions from STORY-102–107 sub-services
  - Apply `revenue_eps_divergence` reduction (−0.15) when `normalized_revenue_growth < 5%` and formula suggests Bucket ≥ 4
  - Add `revenue_eps_divergence` to `bucket_reason_codes`
  - Floor at 0.0
  - Low-confidence threshold: `bucket_confidence < 0.60`
- `ClassificationState.scores` Json extended with bucket engine breakdown (component values)
- Write `bucketConfidence`, `expectedNormalizedEpsGrowth`, `operatingLeverageState`, `fwdEpsFallbackLevel` to `ClassificationState` (new columns from STORY-100)
- Write confidence_level String (high/medium/low) derived from numeric bucketConfidence:
  - ≥ 0.80 → "high"; 0.60–0.80 → "medium"; < 0.60 → "low"
- Retire V1 `BucketScorer` from the active classification path. **Archive** the file to `src/domain/classification/_deprecated/bucket-scorer.ts` — do NOT delete it. STORY-111 regression tests use it for V1 vs V2 comparison. Deletion is gated on STORY-111 passing.
- `ClassificationInput` types extended to carry quarterly history arrays needed by sub-services

## Scope Out
- EQ and BS scoring unchanged — this service only replaces the bucket component
- No changes to `EqScorer` or `BsScorer`
- No changes to `Classifier.ts` top-level entry point (wiring is STORY-110)
- No UI changes
- `BucketScorer` file is not deleted in this story — just no longer called by active path

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §13 (Final Formula), §14 (Bucket Mapper), §18 (Guardrails)
- ADR: ADR-013 V2 (formula weights), ADR-014 (confidence thresholds update)
- Framework: V2.1 §3.8 (Final Formula), §3.10 (Guardrails), §3.12 (Confidence Model)
- Upstream: STORY-100 (schema/types), STORY-102, STORY-103, STORY-104, STORY-105, STORY-106, STORY-107 (all sub-services must be complete)

## Preconditions
- All sub-services (STORY-102–107) implemented and unit-tested
- `ClassificationState` has new columns from STORY-100 migration

## Inputs
```typescript
interface EarningsPathEngineInput {
  // From Stock
  ticker: string;
  binaryFlag: boolean;
  structuralCyclicalityScore: number;
  cyclePosition: string;
  shareCountGrowth3y: number | null;
  revenueGrowthFwd: number | null;
  epsNtm: number | null;
  epsFy2Avg: number | null;           // STORY-101
  gaapEpsCompletedFy: number | null;  // FY0
  moatStrengthScore: number | null;
  pricingPowerScore: number | null;
  revenueRecurrenceScore: number | null;
  marginDurabilityScore: number | null;
  capitalIntensityScore: number | null;
  // From StockQuarterlyHistory (20 quarters)
  revenueSeries: (number | null)[];
  grossProfitSeries: (number | null)[];
  operatingIncomeSeries: (number | null)[];
  netIncomeSeries: (number | null)[];
  dilutedSharesSeries: (number | null)[];
  fcfConversionSeries: (number | null)[];
  // From StockDerivedMetrics
  sbcAsPctRevenueTtm: number | null;
}
```

## Outputs
```typescript
interface BucketEngineOutput {
  bucketSuggested: number;             // 1–8
  expectedNormalizedEpsGrowth: number;
  bucketConfidence: number;            // 0.0–1.0
  fwdEpsFallbackLevel: 1 | 2 | 3 | 4;
  operatingLeverageState: OperatingLeverageState;
  // Full breakdown (written to scores Json)
  normalizedRevenueGrowth: number;
  normalizedEpsHistGrowth: number | null;
  normalizedEpsFwdGrowth: number | null;
  operatingLeverageContribution: number;
  cyclicalPeakPenalty: number;
  dilutionPenalty: number;
  sbcPenalty: number;
  qualitativeVisibilityModifier: number;
  bucketReasonCodes: string[];
  revenueEpsDivergenceFlag: boolean;
}
```

## Acceptance Criteria
- [ ] Formula result correct for a full-data stock: `0.45×rev + 0.35×eps_fwd + 0.20×eps_hist + opLev + qual − cycPenalty − dilution − sbc`
- [ ] L4 fallback base formula (`0.60×rev + 0.40×hist`) fires when `normalizedEpsFwdGrowth` is null
- [ ] Bucket 8 invariant: `binary_flag = true` assigns bucket 8 before any computation runs
- [ ] Bucket mapper correct at all boundaries (test at 0%, 5%, 10%, 18%, 30%, 50%)
- [ ] Confidence model aggregates all sub-service reductions and floors at 0.0
- [ ] `revenue_eps_divergence` fires and adds −0.15 when rev < 5% but formula → Bucket ≥ 4
- [ ] `confidence_level` String correctly derived: ≥ 0.80 → "high", 0.60–0.80 → "medium", < 0.60 → "low"
- [ ] `ClassificationState.bucketConfidence` persisted as Decimal after classification run
- [ ] `ClassificationState.expectedNormalizedEpsGrowth` persisted
- [ ] `ClassificationState.operatingLeverageState` persisted
- [ ] `ClassificationState.fwdEpsFallbackLevel` persisted
- [ ] `ClassificationState.scores` Json extended with full breakdown
- [ ] V1 BucketScorer no longer called by classification path (but file not deleted)
- [ ] Unit test coverage ≥ 80%

## Test Strategy Expectations
- Unit tests (`tests/unit/classification/engines/earnings-path-engine.service.test.ts`):
  - Full formula assembly: all components present → correct final number
  - L4 base formula substitution: null fwd EPS → 0.60/0.40 reweighting
  - Bucket 8 shortcut: binary_flag → returns immediately
  - Bucket boundary tests: expected values at 0%, 5%, 10%, 18%, 30%, 50% map to correct buckets
  - Revenue-EPS divergence: rev = 3%, formula says 12% (Bucket 4) → confidence −0.15 + flag
  - Confidence aggregation: L3 (−0.15) + revenue gap (−0.10) + rev-eps divergence (−0.15) = 0.60 (boundary)
  - confidence_level derivation: 0.85 → "high"; 0.70 → "medium"; 0.55 → "low"
  - Worked examples from Appendix D (NVIDIA, MSFT, Uber, Ford): expected bucket verified
- Integration tests:
  - End-to-end with real quarterly history format: full input → verify bucket and confidence stored in ClassificationState
- Contract tests:
  - `ClassificationState.bucketConfidence` is Decimal(4,3) range
  - `BucketEngineOutput` interface matches schema columns
- BDD (from Appendix D of V2.1 framework):
  - NVIDIA scenario: expected bucket 5 or 6, emerging_now leverage
  - MSFT scenario: expected bucket 4 or 5, gradual leverage
  - Ford scenario: expected bucket 1 or 2, cyclical_rebound with significant penalty
- E2E: covered by STORY-111

## Regression / Invariant Risks
- V1 EQ and BS scoring MUST NOT change — `EqScorer` and `BsScorer` are untouched
- `confidence_level` String semantics preserved (UI reads "high"/"medium"/"low") — must not become null
- `suggested_code` still derived as `{bucket}{eq}{bs}` — bucket component from new engine
- All existing classification state tests must continue to pass
- The `BucketScorer` file must remain compilable (do not break its exports) — STORY-111 regression tests compare V1 vs V2 outputs

## Key Risks / Edge Cases
- Binary flag pre-check: if `binary_flag = true` AND formula would give Bucket 5, still assigns Bucket 8 — no exceptions
- Very negative `expected_normalized_eps_growth` (e.g. −40%): maps to Bucket 1 — no floor
- Very positive (e.g. +120%): maps to Bucket 7 — no ceiling except Bucket 8 invariant
- Confidence floor: if 5 concurrent bad signals fire, total reduction could be > 1.0 → floor at 0.0 (not negative)

## Definition of Done
- [ ] Service implemented and assembling all sub-service results
- [ ] V1 BucketScorer removed from active classification path
- [ ] New schema fields populated on classification runs
- [ ] Unit tests passing, ≥ 80% coverage
- [ ] Worked example tests from Appendix D passing
- [ ] All existing classifier and EQ/BS tests still passing
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md`
- RFC: RFC-009 §13, §14, §17, §18
- ADR: ADR-013 (V2 formula), ADR-014 (confidence model update), ADR-019
- Framework: V2.1 §3.8, §3.10, §3.12
