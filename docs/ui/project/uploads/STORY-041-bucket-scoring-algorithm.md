# STORY-041 — Bucket Scoring Algorithm

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement Stage 1 of the 3-layer classification algorithm: the additive bucket scorer. Given a stock's fundamental fields, enrichment scores, and flags, it outputs a score map `{1→n, 2→n, ..., 8→n}` and reason codes indicating which bucket profile the stock most resembles. This is the foundation on which tie-break and confidence logic (STORY-043) will operate.

## Story
As the classification system,
I want to score a stock against all 8 bucket profiles using additive rules,
so that the highest-scoring bucket is available as the candidate before tie-break resolution.

## Outcome
A deterministic `BucketScorer` function exists. Given identical inputs it always returns identical scores. All 8 bucket profiles are scored. Missing fields do not cause errors — rules that require a missing field simply do not fire. The output is consumed directly by STORY-043.

## Scope In
- `BucketScorer(input: ClassificationInput)` → `{scores: Record<1|2|3|4|5|6|7|8, number>, reason_codes: string[], missing_field_count: number}`
- Additive scoring rules for all 8 buckets per `3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1 and `source_of_truth_investment_framework_3AA.md` §Part I
- Inputs used: `revenue_growth_fwd`, `revenue_growth_3y`, `eps_growth_fwd`, `eps_growth_3y`, `gross_profit_growth`, `fcf_conversion`, `fcf_positive`, `net_income_positive`, `operating_margin`
- Flag inputs: `pre_operating_leverage_flag` contributes to Bucket 5 vs 6 differentiation; `insurer_flag` and `optionality_flag` contribute reason codes only in V1 (no bucket override — override logic reserved for future epic); `binary_flag` and `holding_company_flag` are inputs to assembly (STORY-043), not the bucket scorer
- Enrichment inputs (optional): `moat_strength_score`, `qualitative_cyclicality_score`, `capital_intensity_score` contribute additional scoring weight where specified in the rules
- Per-rule reason codes: e.g., `rev_growth_8_15_pct`, `high_fcf_conversion`, `operating_leverage_story`
- Conservative missing-field handling: if a field required by a rule is null/undefined, the rule does not fire; score stays at prior value
- Bucket 8 score never set here — binary_flag force-override is a special case handled in STORY-043

## Scope Out
- Tie-break resolution (STORY-043)
- Confidence computation (STORY-043)
- Special case overrides including `binary_flag → Bucket 8` (STORY-043)
- Earnings quality or balance sheet quality scoring (STORY-042)
- Persistence, API, UI

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/source_of_truth_investment_framework_3AA.md` §Bucket 1–8; `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1
- RFCs: RFC-001 (Bucket Scorer, Scoring Algorithm)
- ADRs: ADR-004 (rules-first, conservative defaults)
- Upstream stories: EPIC-003 (fundamentals data in `stocks` table), EPIC-003.1 (E1–E6 scores in `stocks` table)
- **ADR-013**: `docs/adr/ADR-013-classification-scoring-algorithm-weights.md` — defines all additive point values for this scorer. Must be read before implementation. Import weight constants from `src/domain/classification/scoring-weights.ts`.

## Preconditions
- `stocks` table populated with fundamental fields by EPIC-003
- E1–E6 enrichment scores populated by EPIC-003.1 (optional inputs — scorer must work without them)
- `ClassificationInput` interface defined (RFC-001)

## Inputs
- `ClassificationInput.fundamentals`: `revenue_growth_fwd`, `revenue_growth_3y`, `eps_growth_fwd`, `eps_growth_3y`, `gross_profit_growth`, `fcf_conversion`, `fcf_positive`, `net_income_positive`, `operating_margin`
- `ClassificationInput.flags`: `pre_operating_leverage_flag`, `insurer_flag`, `optionality_flag` (these last two add reason codes only; no point weights in V1 bucket scorer)
- `ClassificationInput.enrichment` (optional): `moat_strength_score`, `qualitative_cyclicality_score`, `capital_intensity_score`

## Outputs
- `{ scores: Record<1|2|3|4|5|6|7|8, number>, reason_codes: string[], missing_field_count: number }`

## Acceptance Criteria
- [ ] `BucketScorer` function implemented and exported from `src/domain/classification/`
- [ ] Scoring rules implemented for all 8 bucket profiles
- [ ] `revenue_growth_fwd` in `[8%, 15%]` contributes to Bucket 4 score with reason code `rev_growth_8_15_pct`
- [ ] `revenue_growth_fwd` in `[3%, 8%)` contributes to Bucket 3 score
- [ ] `revenue_growth_fwd` in `[20%, 35%+]` contributes to Bucket 6 score
- [ ] `revenue_growth_fwd <= 2%` contributes to Bucket 1 score
- [ ] `revenue_growth_fwd >= 40%` contributes to Bucket 7 score
- [ ] `pre_operating_leverage_flag = true` boosts Bucket 5 score relative to Bucket 6
- [ ] E1–E6 enrichment scores contribute to bucket scoring when present (moat boosts Bucket 3/4; high cyclicality boosts Bucket 5/6; high capital intensity boosts Bucket 5)
- [ ] Missing field → rule does not fire, no error thrown
- [ ] All-null inputs → all scores = 0, `missing_field_count` = number of critical fields, no exception
- [ ] Bucket 8 score never set by this scorer (remains 0)
- [ ] Deterministic: identical inputs → identical output across 100 consecutive calls
- [ ] All emitted `reason_codes` match the defined vocabulary from the rules engine spec

## Test Strategy Expectations
- **Unit tests:**
  - `revenue_growth_fwd=10%, eps_growth_fwd=14%` → Bucket 4 score highest
  - `revenue_growth_fwd=5%, eps_growth_fwd=8%` → Bucket 3 score highest
  - `revenue_growth_fwd=25%` → Bucket 6 score highest
  - `revenue_growth_fwd=-5%` → Bucket 1 score highest
  - `revenue_growth_fwd=60%` → Bucket 7 score highest
  - All fields null → all scores 0, no error, `missing_field_count` = n
  - `pre_operating_leverage_flag=true`, `revenue_growth_fwd=12%` → Bucket 5 score boosted vs Bucket 4
  - E1–E6 high values → relevant bucket scores increase
  - E1–E6 all null → scores still computed from fundamentals alone
  - Determinism: call scorer 100× with same input → output hash identical
  - Reason codes: specific codes appear for specific rule fires
  - Bucket 8 score = 0 always
- **Integration tests:**
  - Read MSFT fundamentals from test DB → Bucket 4 scores highest
  - Read UNH fundamentals from test DB → Bucket 3 scores highest
- **Contract/schema tests:**
  - Output shape: `{scores: object, reason_codes: string[], missing_field_count: number}`
  - `scores` keys are `1`–`8`, values are non-negative numbers
  - `reason_codes` is array of non-empty strings
- **BDD acceptance tests:**
  - "Given stock with `revenue_growth_fwd=10%` and `eps_growth_fwd=14%`, when bucket scorer runs, then Bucket 4 score is highest"
  - "Given stock with all null growth fields, when bucket scorer runs, then all scores are zero and no error is thrown"
  - "Given stock with `revenue_growth_fwd=5%`, when bucket scorer runs, then reason code `moderate_durable_growth` appears in output"
- **E2E tests:** Not applicable at this level

## Regression / Invariant Risks
- **Threshold boundary drift:** if bucket range boundaries are silently changed, many stocks reclassify — protect with a golden-set regression test (`classifyBuckets(MSFT_fixture)` → expected scores)
- **Null safety removed:** if a null-guard is accidentally dropped, null-field rules fire incorrectly — test all-null input and individual-field-null inputs explicitly
- **Determinism break:** if any randomness or map-iteration order dependency is introduced — 100-run determinism test
- **Bucket 8 accidentally scored:** if binary_flag logic leaks into this scorer — assert scores[8] === 0 always

## Key Risks / Edge Cases
- **Range boundary ambiguity:** Bucket 3 covers `[3%, 8%]` and Bucket 4 covers `[8%, 15%]` — the boundary value `8.0%` must have a defined inclusive/exclusive rule; document this in code
- **Negative EPS with positive revenue:** fires Bucket 1 EPS rule but may also fire Bucket 4 revenue rule — multi-bucket scoring is correct and expected; highest total score wins in STORY-043
- **Enrichment absent:** E1–E6 null — scorer must not break; enrichment rules are additive bonuses only
- **Extreme outlier values:** `revenue_growth_fwd = 500%` — must score Bucket 7, not error or overflow

## Definition of Done
- [ ] `BucketScorer` function implemented under `src/domain/classification/`
- [ ] Unit + integration + contract tests added and passing
- [ ] 100-run determinism test passing
- [ ] Golden-set regression test for MSFT, ADBE, TSLA, UBER, UNH fixtures
- [ ] All-null input test passing
- [ ] Traceability comments in code reference RFC-001 (Bucket Scoring), `source_of_truth_investment_framework_3AA.md` §Part I, `3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1
- [ ] No new TypeScript compilation errors introduced
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/source_of_truth_investment_framework_3AA.md` §Bucket 1–8; `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1
- RFC: RFC-001 §Bucket Scorer, §Scoring Algorithm
- ADR: ADR-004 (rules-first with manual override)
