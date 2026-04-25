# STORY-075 — Valuation Engine Domain Layer

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Purpose
Implement the core deterministic domain logic that takes a classification code + stock data and produces a complete valuation result: primary metric, current multiple, thresholds (anchored or derived), TSR hurdle, secondary adjustments, and valuation zone. This is a pure domain layer with no I/O — all components are independently unit-testable.

## Story
As the system,
I want a deterministic valuation computation function that maps a 3AA code + stock fundamentals to a complete valuation result,
so that every classified stock can be placed into a valuation zone with full audit traceability of every decision.

## Outcome
A `computeValuation(input: ValuationInput): ValuationResult` function exists in `src/domain/valuation/` that correctly implements all stages from RFC-003: metric selection, multiple computation, threshold assignment (anchored + derived), secondary adjustments (gross margin, dilution, cyclicality), TSR hurdle calculation, and zone assignment. All sub-components are pure functions testable in isolation.

## Scope In
- `MetricSelector`: bucket + flag → `primary_metric`, `metric_reason`
- `ThresholdAssigner`: code → anchored lookup (DB) → or mechanical derivation per threshold derivation spec
- `TsrHurdleCalculator`: bucket + EQ grade + BS grade + DB lookup → base + adjusted hurdle + reason codes
- `SecondaryAdjustments`: gross margin (B6/B7), dilution (B5–B7), cyclicality context flag
- `ZoneAssigner`: current multiple + thresholds → `valuation_zone`
- `computeValuation()` orchestrator: chains all components, returns `ValuationResult`
- `shouldRecompute(current: ValuationInput, priorState: ValuationState | null): boolean` — compares current input against persisted state fields (`activeCode`, `currentMultiple`, `primaryMetric`, `adjustedTsrHurdle`); no prior-state snapshot table needed
- `ValuationInput` and `ValuationResult` TypeScript interfaces
- Floor enforcement: P/E ≥ 1.0x, EV/EBIT ≥ 1.0x, EV/Sales ≥ 0.5x; descending order invariant
- All 6 valuation state statuses: `ready`, `manual_required`, `classification_required`, `not_applicable`, `manual_required_insurer`, `missing_data`
- Forward multiple fallback computation (trailing P/E × growth, with cyclicality and negative-earnings guardrails)
- Unit tests: golden-set for all 16 anchored codes; per-component contract tests; derivation examples from spec; edge cases (B8, missing multiple, negative earnings, cyclicality flag)

## Scope Out
- Persistence (reading/writing valuation_state) — STORY-076
- Batch job execution — STORY-077
- User override API — STORY-078
- UI rendering — STORY-079, STORY-080
- `forward_operating_earnings_ex_excess_cash` manual input workflow — STORY-078
- Admin seeding of anchored_thresholds (already done in STORY-005)

## Dependencies
- Epic: EPIC-005
- PRD: `docs/prd/3_aa_valuation_threshold_workflow_prd_v_1.md`; `docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md`
- RFCs: RFC-003 (Valuation Engine Architecture — complete spec); RFC-002 §valuation_state schema
- ADRs: ADR-005 (Threshold Management — anchored + mechanical derivation); ADR-007 (Multi-user: system vs user state)
- Upstream stories: STORY-004 (anchored_thresholds + tsr_hurdles tables exist); STORY-005 (tables seeded with 16 anchored codes + 8 TSR hurdles); STORY-041–043 (classification engine — provides active_code input)
- No V1 schema migration needed: all domain types are in-memory; DB access only via dependency injection in ThresholdAssigner/TsrHurdleCalculator

## Preconditions
- `anchored_thresholds` table seeded with 18 codes (STORY-005 confirmed)
- `tsr_hurdles` table seeded with 8 bucket rows (STORY-005 confirmed)
- Classification engine producing `suggested_code` (EPIC-004 complete)
- Stock fundamentals populated: `forward_pe`, `forward_ev_ebit`, `ev_sales`, `gross_margin`, `share_count_growth_3y`, `operating_margin`, `trailing_pe` (EPIC-003 complete)

## Inputs
- `active_code`: resolved by caller — `final_code` from `UserClassificationOverride` if one exists for this user, otherwise `suggested_code` from `ClassificationState`. System batch always uses `suggested_code`; personalized user API uses `final_code` if present. The domain function itself is code-source-agnostic.
- `primary_metric_override?`: optional manual override (STORY-078 provides this; consumed here)
- `stock_data`: `{ forward_pe, forward_ev_ebit, ev_sales, forward_operating_earnings_ex_excess_cash, gross_margin, share_count_growth_3y, material_dilution_flag, trailing_pe, trailing_eps, trailing_ev_ebit, cyclicality_flag, holding_company_flag, insurer_flag, pre_operating_leverage_flag }`
- `anchored_thresholds[]`: from DB (injected)
- `tsr_hurdles[]`: from DB (injected)

## Outputs
`ValuationResult`:
- `active_code`, `primary_metric`, `metric_reason`
- `current_multiple | null`, `current_multiple_basis`, `metric_source`
- `max_threshold`, `comfortable_threshold`, `very_good_threshold`, `steal_threshold`
- `threshold_source` (`anchored | derived | manual_override`), `derived_from_code?`, `threshold_adjustments[]`
- `base_tsr_hurdle_label`, `base_tsr_hurdle_default`, `adjusted_tsr_hurdle`, `hurdle_source`, `tsr_reason_codes[]`
- `valuation_zone`
- `valuation_state_status`
- `gross_margin_adjustment_applied`, `dilution_adjustment_applied`, `cyclicality_context_flag`

## Acceptance Criteria
- [ ] `MetricSelector`: Buckets 1–4 → `forward_pe`; Bucket 5 → `forward_ev_ebit` (or `ev_sales` if pre_op_leverage); Buckets 6–7 → `ev_sales`; Bucket 8 → `no_stable_metric`; 3AA holding_company/insurer → `forward_operating_earnings_ex_excess_cash`
- [ ] `ThresholdAssigner`: returns anchored thresholds for all 18 seeded codes with `threshold_source='anchored'`; for any other code, derives mechanically from nearest anchor using spec-defined adjustment tables, returning `threshold_source='derived'` and `derived_from_code`
- [ ] Derived thresholds satisfy: descending order `max > comfortable > very_good > steal`; floors enforced (P/E ≥ 1.0, EV/Sales ≥ 0.5)
- [ ] `TsrHurdleCalculator`: base hurdle by bucket (1=15%, 2=10.5%, 3=11.5%, 4=12.5%, 5=15%, 6=19%, 7=25%, 8=null); EQ-A −1.0%, EQ-C +2.5%; BS-A −0.5%, BS-C +1.75%
- [ ] `ZoneAssigner`: correct assignment across all 6 zones; `not_applicable` for B8 and `no_stable_metric`
- [ ] Gross margin adjustment fires only for B6/B7 with `ev_sales` metric: >80% → +1.0x, <60% → −1.5x
- [ ] Dilution adjustment fires for B5–B7 when `share_count_growth_3y > 5%` OR `material_dilution_flag = true`: −1 turn for P/E/EV/EBIT; −1.0x for EV/Sales
- [ ] Forward P/E fallback: uses `trailing_pe / (1 + eps_growth_fwd)` only when primary is null, not cyclical, and trailing_eps > 0
- [ ] `computeValuation()` is deterministic: same inputs → identical outputs
- [ ] `shouldRecompute(current, priorState)`: priorState=null → true; active_code changed → true; currentMultiple changed ≥5% → true; primaryMetric changed → true; priorState exists and nothing changed → false. Comparison uses `ValuationState` persisted fields — no separate input snapshot table required.
- [ ] Golden-set: all 16 anchored codes produce correct zone given representative multiples; verified against threshold derivation spec examples (4AA, 4BA, 3AA, 5BB, 6BA, etc.)
- [ ] Bucket 8: `valuation_zone='not_applicable'`, no thresholds assigned, no TSR hurdle
- [ ] `manual_required` returned when: primary metric is null and no fallback applies; holding company/insurer with missing `forward_operating_earnings_ex_excess_cash`
- [ ] All components individually unit-testable with no DB dependency (thresholds injected as arrays)

## Test Strategy Expectations
- Unit tests:
  - `MetricSelector`: all 8 buckets × all special-case flag combinations → verify primary_metric and metric_reason
  - `ThresholdAssigner`: all 16 anchored codes return expected values; 10+ derived code examples from spec (4BB, 4AC, 3CA, 5BC, 6BC, 7BB, etc.) — verify values and derivation_basis; floor enforcement; descending order invariant
  - `TsrHurdleCalculator`: all 8 buckets × 9 EQ+BS combinations → verify adjusted_hurdle formula; boundary cases
  - `ZoneAssigner`: multiple just above/below each threshold boundary; all 6 zones; not_applicable
  - `SecondaryAdjustments`: all gross-margin bands; dilution trigger conditions; cyclicality flag passthrough
  - `computeValuation()`: golden-set tests; B8 bypass; missing-multiple → manual_required; cascaded adjustments
  - `shouldRecompute(current, priorState)`: priorState=null→true; code changed→true; multiple changed≥5%→true; metric changed→true; all equal→false
- Integration tests:
  - `ThresholdAssigner` against real test DB: confirm anchored lookup returns seeded values
  - `TsrHurdleCalculator` against real test DB: confirm base hurdles match seeded rows
- Contract/schema tests:
  - `ValuationResult` shape matches what `ValuationState` Prisma model expects (field names, types, nullability)
- BDD acceptance tests:
  - Scenario: "4AA stock at forward P/E 18x → comfortable_zone" (verify all output fields)
  - Scenario: "3CA stock with missing forward_pe, cyclicality_flag → manual_required, no fallback"
  - Scenario: "6BA stock at EV/Sales 4.5x, gross_margin 75% → no gross_margin_adjustment, very_good_zone"
  - Scenario: "7BA stock at EV/Sales 12x, dilution flag → adjusted thresholds, above_max"
- E2E tests: not applicable at this layer (domain only)

## Regression / Invariant Risks
- Threshold descending order must never be violated (P/E anchors: 22/20/18/16 for 4AA — must not be reordered by adjustments)
- Derivation rules must not change silently — any change to adjustment tables changes every derived code's thresholds; golden-set catches this
- `computeValuation()` determinism: concurrent invocations for same stock must return identical results
- Floor enforcement: derived thresholds for C-grade stocks (especially 1CC, 2CC) must not go negative

## Key Risks / Edge Cases
- 3AA holding company/insurer: `forward_operating_earnings_ex_excess_cash` may be null → `manual_required`; NOT a fallback to `forward_pe`
- Negative trailing EPS: forward P/E fallback must be skipped, returning `manual_required` (not a computed negative multiple)
- Cyclical stocks: forward P/E fallback must be skipped if `cyclicality_flag = true` (peak earnings distortion)
- Pre-op-leverage flag for B5: switches metric family from EV/EBIT to EV/Sales, which requires using B6-style threshold derivation
- Derivation for B5 pre-op-leverage: if `pre_operating_leverage_flag = true`, the derivation must use the EV/Sales bucket rules (6AA, 6BA anchors) even though the stock is classified as B5
- Missing anchored reference: if `{bucket}AA` does not exist in anchored_thresholds, derivation fails → `manual_required` (log warning)

## Definition of Done
- [ ] All domain components implemented in `src/domain/valuation/`
- [ ] Unit tests for all components passing (target: ≥50 unit tests)
- [ ] Integration tests for DB-dependent components passing
- [ ] Golden-set verified against threshold derivation spec examples
- [ ] `ValuationResult` interface matches `ValuationState` Prisma model field names (verified by TypeScript compilation)
- [ ] Traceability comments in all new files (`// EPIC-005: ... STORY-075: ...`)
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- PRD: `docs/prd/3_aa_valuation_threshold_workflow_prd_v_1.md` §Metric Selection Rules, §Threshold Rules, §TSR Hurdle Rules, §Secondary Adjustments, §Valuation Zone Rules
- PRD: `docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md` (complete derivation spec)
- RFC: RFC-003 — Valuation & Threshold Engine Architecture (all components; §Metric Selector, §Threshold Assigner, §TSR Hurdle Calculator, §Secondary Adjustments, §Zone Assigner)
- ADR: ADR-005 — Threshold Management Strategy (anchored + mechanical derivation)
- ADR: ADR-007 — Multi-User Architecture (system suggested_code drives valuation, not user override)
