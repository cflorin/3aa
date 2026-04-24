# STORY-042 — Earnings Quality and Balance Sheet Quality Scoring

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement Stage 1 quality scorers: `EarningsQualityScorer` and `BalanceSheetQualityScorer`. Given a stock's fundamental fields and enrichment scores, each scorer outputs a grade (A/B/C), a numeric score map, and reason codes. Together with `BucketScorer` (STORY-041), these three scorers produce all inputs needed for the final `ClassificationResult` assembly in STORY-043.

## Story
As the classification system,
I want to score a stock's earnings quality and balance sheet quality using additive rules,
so that the highest-scoring grade for each dimension is available before final assembly.

## Outcome
Two deterministic scorer functions exist: `EarningsQualityScorer` and `BalanceSheetQualityScorer`. Both follow the same conservative null-handling and determinism guarantees as `BucketScorer`. Missing fields do not cause errors. Output is consumed directly by STORY-043.

## Scope In
- `EarningsQualityScorer(input: ClassificationInput)` → `{scores: Record<'A'|'B'|'C', number>, reason_codes: string[], missing_field_count: number}`
- `BalanceSheetQualityScorer(input: ClassificationInput)` → `{scores: Record<'A'|'B'|'C', number>, reason_codes: string[], missing_field_count: number}`
- EQ scoring rules per `3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1 and `source_of_truth_investment_framework_3AA.md` §Part II:
  - **EQ-A:** `fcf_conversion > 0.80` → strong boost; `moat_strength_score >= 4.0` → boost; `net_income_positive = true` → boost; per-rule reason codes
  - **EQ-B:** `fcf_conversion` in `[0.50, 0.80]` → boost; `moat_strength_score` in `[2.5, 4.0)` → moderate boost
  - **EQ-C:** `fcf_conversion < 0.50` or `fcf_positive = false` → boost; weak moat penalty contributor
- BS scoring rules per framework §Part II:
  - **BS-A:** `net_debt_ebitda < 1.0` → strong boost; `interest_coverage > 12.0` → boost; per-rule reason codes
  - **BS-B:** `net_debt_ebitda` in `[1.0, 2.5]` → boost; `interest_coverage` in `[5.0, 12.0]` → boost
  - **BS-C:** `net_debt_ebitda > 2.5` → boost; `interest_coverage < 5.0` → boost
- Enrichment inputs: `moat_strength_score` (EQ), `capital_intensity_score` (BS-C direction)
- Conservative null-handling: missing field → rule does not fire
- Both functions exported from `src/domain/classification/`

## Scope Out
- Final grade selection and tie-break resolution (STORY-043)
- Bucket scoring (STORY-041)
- ClassificationResult assembly (STORY-043)
- Persistence, API, UI

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/source_of_truth_investment_framework_3AA.md` §Part II; `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1
- RFC: RFC-001 §Earnings Quality Scorer, §Balance Sheet Quality Scorer
- ADR: ADR-004 (rules-first, conservative defaults)
- Upstream: STORY-041 (`ClassificationInput` interface established)

## Preconditions
- `ClassificationInput` interface defined (RFC-001, established in STORY-041)
- `stocks` table populated with BS fields: `net_debt_ebitda`, `interest_coverage`
- `stocks` table populated with FCF fields: `fcf_conversion`, `fcf_positive`, `net_income_positive`

## Inputs
- `ClassificationInput.fundamentals`: `fcf_conversion`, `fcf_positive`, `net_income_positive`, `net_debt_ebitda`, `interest_coverage`, `operating_margin`
- `ClassificationInput.enrichment` (optional): `moat_strength_score`, `capital_intensity_score`

## Outputs
- `EarningsQualityScorer`: `{ scores: Record<'A'|'B'|'C', number>, reason_codes: string[], missing_field_count: number }`
- `BalanceSheetQualityScorer`: `{ scores: Record<'A'|'B'|'C', number>, reason_codes: string[], missing_field_count: number }`

## Acceptance Criteria
- [ ] `EarningsQualityScorer` implemented and exported from `src/domain/classification/`
- [ ] `BalanceSheetQualityScorer` implemented and exported from `src/domain/classification/`
- [ ] `fcf_conversion > 0.80` → EQ-A score boosted with reason code `high_fcf_conversion`
- [ ] `fcf_conversion` in `[0.50, 0.80]` → EQ-B score boosted
- [ ] `fcf_conversion < 0.50` → EQ-C score boosted with reason code `weak_fcf_conversion`
- [ ] `net_debt_ebitda < 1.0` → BS-A score boosted with reason code `low_leverage`
- [ ] `net_debt_ebitda > 2.5` → BS-C score boosted with reason code `high_leverage`
- [ ] `interest_coverage < 5.0` → BS-C score boosted with reason code `weak_interest_coverage`
- [ ] Missing field → rule does not fire, no error thrown
- [ ] All-null inputs → all scores = 0, no exception
- [ ] Deterministic: identical inputs → identical output across 100 consecutive calls
- [ ] All emitted `reason_codes` match defined vocabulary from rules engine spec

## Test Strategy Expectations
- **Unit tests:**
  - `fcf_conversion=1.43, moat_strength_score=5.0` → EQ-A score highest (MSFT-like)
  - `fcf_conversion=0.65, moat_strength_score=4.5` → EQ-A/B boundary — A edges ahead on moat
  - `fcf_conversion=0.64, net_income_positive=false` → EQ-C score highest
  - `net_debt_ebitda=0.22, interest_coverage=56.4` → BS-A score highest (MSFT-like)
  - `net_debt_ebitda=3.01, interest_coverage=4.5` → BS-C score highest (UNH-like)
  - All fields null → all scores 0, no error
  - `capital_intensity_score=4.5` → BS-C direction boosted
  - Determinism: 100× same input → identical output
- **Integration tests:**
  - Read MSFT fundamentals → EQ-A highest, BS-A highest
  - Read UNH fundamentals → BS-C highest (3.01× ND/EBITDA, 4.5× coverage)
- **Contract/schema tests:**
  - Output shape: `{scores: object, reason_codes: string[], missing_field_count: number}`
  - `scores` keys are exactly `A`, `B`, `C`; values non-negative numbers
- **BDD acceptance tests:**
  - "Given stock with `fcf_conversion=1.43`, when EQ scorer runs, then EQ-A score is highest"
  - "Given stock with `net_debt_ebitda=3.01` and `interest_coverage=4.5`, when BS scorer runs, then BS-C score is highest"

## Regression / Invariant Risks
- **Boundary drift:** FCF conversion 80% threshold; net_debt 1.0/2.5 thresholds; interest coverage 5.0/12.0 thresholds — protect with golden-set tests
- **Grade inversion:** if A-boosting rule accidentally fires C-grade accumulator — contract test: `scores.A + scores.B + scores.C` must equal sum of all fired rule weights
- **Null safety removed:** any accidental null-guard removal causes rules to fire on null → all-null regression test required

## Key Risks / Edge Cases
- **Negative net_debt_ebitda:** net cash position (negative value) should score even better than BS-A — rule must handle ≤0 case
- **FCF conversion > 100%:** common in asset-light businesses (ADBE 143%); must not error or cap
- **Missing interest_coverage:** many data sources omit this; BS scorer must work with net_debt alone
- **EQ-A/B boundary at 80%:** `fcf_conversion = 0.80` exactly — must have documented inclusive/exclusive rule

## Definition of Done
- [ ] `EarningsQualityScorer` and `BalanceSheetQualityScorer` implemented under `src/domain/classification/`
- [ ] Unit + integration + contract tests added and passing
- [ ] 100-run determinism test passing for both scorers
- [ ] Golden-set regression test for MSFT (EQ-A, BS-A) and UNH (BS-C)
- [ ] All-null input test passing for both scorers
- [ ] Traceability comments reference RFC-001, `source_of_truth_investment_framework_3AA.md` §Part II, `3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/source_of_truth_investment_framework_3AA.md` §Part II; `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1
- RFC: RFC-001 §Earnings Quality Scorer, §Balance Sheet Quality Scorer
- ADR: ADR-004 (rules-first with manual override)
