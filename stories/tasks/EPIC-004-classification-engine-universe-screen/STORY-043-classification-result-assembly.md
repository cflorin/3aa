# STORY-043 — Classification Result Assembly: Tie-Break, Confidence, Special Cases

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement Stage 2 and Stage 3 of the 3-layer classification algorithm: resolve bucket and grade ties, apply special-case overrides (binary_flag → Bucket 8, holding_company_flag → Bucket 3), compute confidence level, and assemble the final `ClassificationResult` from the three scorer outputs (STORY-041, STORY-042). This is the function that produces the system's suggested 3AA code.

## Story
As the classification system,
I want to resolve ties, apply overrides, and compute confidence from scorer outputs,
so that the final suggested 3AA code (e.g., `4AA`) is deterministic, explainable, and ready to persist.

## Outcome
A `classifyStock(input: ClassificationInput)` function exists. It orchestrates `BucketScorer`, `EarningsQualityScorer`, and `BalanceSheetQualityScorer`, applies tie-break rules, applies special-case overrides, computes confidence per ADR-014, and returns a `ClassificationResult`. The output is consumed by STORY-044 for persistence.

## Scope In
- `classifyStock(input: ClassificationInput)` → `ClassificationResult`
- `ClassificationResult` shape:
  ```typescript
  {
    suggested_code: string | null,
    bucket: 1|2|3|4|5|6|7|8 | null,
    eq_grade: 'A'|'B'|'C' | null,
    bs_grade: 'A'|'B'|'C' | null,
    confidence_level: 'high'|'medium'|'low',
    reason_codes: string[],
    scores: { bucket: Record<1|2|3|4|5|6|7|8, number>, eq: Record<'A'|'B'|'C', number>, bs: Record<'A'|'B'|'C', number> },
    missing_field_count: number,
    // Structured audit trail for UI display (STORY-053)
    confidenceBreakdown: {
      steps: Array<{
        step: number,
        label: string,
        note: string,
        band: 'high' | 'medium' | 'low',
        tieBreaks?: string[],
        missing?: number
      }>
    },
    tieBreaksFired: Array<{
      rule: string,
      description: string,
      winner: number | string,
      condition: string,
      values: Record<string, number | null>,
      outcome: string,
      marginAtTrigger: number
    }>
  }
  ```
- `confidenceBreakdown.steps` is the ordered sequence of ADR-014 confidence derivation steps applied during classification; populated even when `suggested_code = null` (step 1 gate fires)
- `tieBreaksFired` records each tie-break evaluation that fired; empty array when no tie-breaks applied
- **Tie-break rules** per `3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 2:
  - Bucket 3 vs 4: choose 4 only if `fcf_conversion > 0.85` AND `roic > 0.20`; else choose 3
  - Bucket 4 vs 5: choose 5 if `pre_operating_leverage_flag = true`; else choose 4
  - Bucket 5 vs 6: choose 5 if `pre_operating_leverage_flag = true`; else choose 6
  - Bucket 6 vs 7: choose 7 if `revenue_growth_fwd >= 35%`; else choose 6
  - Tie-break triggers when winning margin ≤ 1 point (scores within 1 point of each other)
- **Special-case overrides** (applied after tie-break, before confidence):
  - `binary_flag = true` → force `bucket = 8`, override any scorer result
  - `holding_company_flag = true` AND bucket scorer suggests Bucket 3/4 → keep Bucket 3
  - `cyclicality_flag = true` → does not override bucket; adds reason code `cyclicality_flag_applied`
  - `insurer_flag = true` → adds reason code `insurer_flag_applied`; no bucket override in V1
  - `optionality_flag = true` → adds reason code `optionality_flag_applied`; no bucket override in V1
- **Confidence computation** per ADR-014:
  - Step 1 (null-suggestion gate): `missing_field_count > 5` → `suggested_code = null`, `confidence_level = 'low'`
  - Step 2 (score margin): margin ≥ 4 → high; ≥ 2 → medium; < 2 → low
  - Step 3 (tie-break penalty): each tie-break degrades confidence one level; ≥ 2 tie-breaks → force low
  - Step 4 (missing-field penalty): missing 3–4 → degrade one level; missing 5 → force low
  - Note: `confidence_level` is ALWAYS one of `'high'|'medium'|'low'` — **never null**. When `suggested_code = null`, `confidence_level = 'low'` (meaning "we are confident the data is insufficient")
- `suggested_code` assembled as `"${bucket}${eq_grade}${bs_grade}"` (e.g., `"4AA"`)
- `suggested_code = null` only when `missing_field_count > 5`
- Bucket 8 `suggested_code` format: `"8"` (no EQ/BS grades — binary stocks are not quality-graded; `eq_grade = null`, `bs_grade = null` for Bucket 8)
- Exported from `src/domain/classification/`

## Scope Out
- Persistence of ClassificationResult (STORY-044)
- User classification overrides (STORY-045)
- Individual scorer implementations (STORY-041, STORY-042)
- UI, API, batch job

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 2 (tie-break), §Stage 3 (confidence)
- RFC: RFC-001 §ClassificationResult, §Tie-Break Rules, §Confidence Computation, §Special Cases
- ADR: ADR-004 (rules-first, conservative defaults)
- **ADR-013**: Classification Scoring Algorithm Weights — defines point values consumed by scorers
- **ADR-014**: Classification Confidence Threshold Boundaries — defines exact margin and missing-field thresholds
- Upstream: STORY-041 (`BucketScorer`), STORY-042 (`EarningsQualityScorer`, `BalanceSheetQualityScorer`)

## Preconditions
- `BucketScorer` implemented and passing (STORY-041)
- `EarningsQualityScorer` and `BalanceSheetQualityScorer` implemented and passing (STORY-042)
- `ClassificationInput` interface defined in `src/domain/classification/types.ts` (created by STORY-041 TASK-041-001)
- `src/domain/classification/confidence-thresholds.ts` **stub already exists** from STORY-041 TASK-041-001 with `CRITICAL_FIELDS` (10 fields) and `NULL_SUGGESTION_THRESHOLD = 5` — **extend this file, do not recreate it**
- ADR-013 and ADR-014 accepted (scoring weights and confidence thresholds settled)

## Inputs
- `ClassificationInput` (full struct: fundamentals, flags, enrichment)
- Internally calls STORY-041 and STORY-042 scorers

## Outputs
- `ClassificationResult` per schema above

## Acceptance Criteria
- [ ] `classifyStock` function implemented and exported from `src/domain/classification/`
- [ ] `ClassificationResult` interface defined and exported
- [ ] Bucket 3 vs 4 tie-break: when margin ≤ 1 and `fcf_conversion ≤ 0.85` OR `roic ≤ 0.20` → Bucket 3 chosen
- [ ] Bucket 3 vs 4 tie-break: when margin ≤ 1 and `fcf_conversion > 0.85` AND `roic > 0.20` → Bucket 4 chosen
- [ ] `pre_operating_leverage_flag = true` causes Bucket 5 to win over 4 or 6 when margin ≤ 1
- [ ] `binary_flag = true` → `suggested_code = "8"`, `eq_grade = null`, `bs_grade = null`, regardless of scorer outputs
- [ ] `binary_flag = true` AND `holding_company_flag = true` → binary_flag wins (Bucket 8)
- [ ] `missing_field_count > 5` → `suggested_code = null`, `confidence_level = 'low'`
- [ ] `confidence_level` is always one of `'high' | 'medium' | 'low'` — **never null**
- [ ] `confidence_level = 'high'` only when margin ≥ 4 AND ≤ 0 tie-breaks AND missing ≤ 2 (per ADR-014)
- [ ] Each applied tie-break degrades confidence one level (per ADR-014)
- [ ] `reason_codes` in result is union of all scorer reason codes plus tie-break codes and flag codes
- [ ] `scores` in result contains all three scorer score maps
- [ ] Deterministic: identical inputs → identical output across 100 consecutive calls
- [ ] `suggested_code` format: `"${1-8}${'A'|'B'|'C'}${'A'|'B'|'C'}"` for buckets 1-7, `"8"` for Bucket 8

## Test Strategy Expectations

> **Important:** Fixture tests for specific stocks (MSFT, ADBE, etc.) should test the **classification rules and confidence computation**, not hard-coded final codes that depend on live data. Use synthetic inputs with known characteristics for the core logic tests. The golden-set regression tests validate against a fixture snapshot taken after ADR-013 scoring weights are implemented.

- **Unit tests (synthetic inputs with defined characteristics):**
  - Input: `revenue_growth_fwd=10%, revenue_growth_3y=14%, eps_growth_3y=18%, operating_margin=49%, moat_strength=5.0, fcf_positive=true, net_income_positive=true` → Bucket 4 score clear winner; `suggested_code` starts with `"4"`
  - Input: `revenue_growth_fwd=5%, revenue_growth_3y=8%` only → Bucket 3 score highest; confidence `low` or `medium` (limited fields)
  - Input: `revenue_growth_fwd=25%` → Bucket 6 score highest; `suggested_code` starts with `"6"`
  - Input: `binary_flag=true` on any input → `suggested_code = "8"`
  - Input: all fields null → `suggested_code = null`, `confidence_level = 'low'`, no error
  - Tie-break 3v4: bucket scores tied, `fcf_conversion=0.65, roic=0.15` → Bucket 3 chosen
  - Tie-break 3v4: bucket scores tied, `fcf_conversion=0.90, roic=0.25` → Bucket 4 chosen
  - Tie-break 4v5: scores tied, `pre_operating_leverage_flag=true` → Bucket 5 chosen
  - Confidence: margin=5, tie_breaks=0, missing=0 → `'high'`
  - Confidence: margin=3, tie_breaks=1, missing=0 → `'medium'` (tie-break degrades from medium)
  - Confidence: margin=1, tie_breaks=0, missing=0 → `'low'`
  - Confidence: margin=5, missing_field_count=4 → `'medium'` (missing-field penalty)
  - 100-run determinism check
- **Integration tests:**
  - Read MSFT fundamentals from test DB → `suggested_code` starts with `"4"`, `confidence_level` is `'low'` or `'medium'` (tie-break applied; see ADR-014)
  - Read UNH fundamentals from test DB → `suggested_code` starts with `"3"`, `confidence_level` is `'low'` or `'medium'`
- **Golden-set regression tests (locked after ADR-013 implementation):**
  - `classifyStock(MSFT_fixture)` → expected full output snapshot (scores + code + confidence) captured and locked post-implementation
  - Same for ADBE, TSLA, UBER, UNH fixtures
- **Contract/schema tests:**
  - `suggested_code` matches regex `^[1-8]([ABC][ABC])?$` or is null
  - `confidence_level` is always `'high' | 'medium' | 'low'` — never null, never undefined
  - `scores.bucket` has keys 1–8, `scores.eq` has keys A/B/C, `scores.bs` has keys A/B/C
- **BDD acceptance tests:**
  - "Given stock with clear Bucket 4 signals and margin ≥ 4, when classifyStock runs, then confidence_level is high"
  - "Given binary_flag=true, when classifyStock runs, then suggested_code is '8'"
  - "Given more than 5 critical fields null, when classifyStock runs, then suggested_code is null and confidence_level is 'low'"

## Regression / Invariant Risks
- **Golden-set drift:** if scoring weights change, 5-stock golden-set regresses — lock with fixture regression test (captured after ADR-013 implementation)
- **null confidence emitted:** `confidence_level = null` must never occur — contract test verifies this invariant on every output
- **Override ordering bug:** if hold_company and binary_flag interaction inverts — explicit priority test
- **Code format regression:** if EQ/BS grades appear on Bucket 8 output — contract regex test
- **Tie-break threshold drift:** if tie-break trigger margin changes from ≤ 1 — unit test with margin = exactly 1 and margin = 2

## Key Risks / Edge Cases
- **Three-way bucket tie:** e.g., buckets 3, 4, and 5 all equal score — tie-break chain: apply 4v5 first (since overlap at top is most common), then 3v4. Document the chain order explicitly in code.
- **All-zero scores:** legitimate for fully-null input; `missing_field_count > 5` → null suggestion, `confidence = 'low'`
- **EQ/BS grade tie:** EQ-A = EQ-B — prefer higher grade when tied (A > B > C). Document in code.
- **TSLA/UBER ambiguity:** with current data, these stocks may score similar to multiple buckets. Tests should assert `confidence_level = 'low'` rather than pinning exact bucket, until golden-set is locked.

## Definition of Done
- [ ] `classifyStock` and `ClassificationResult` implemented and exported under `src/domain/classification/`
- [ ] `src/domain/classification/confidence-thresholds.ts` extended with `HIGH_MARGIN_THRESHOLD=4`, `MEDIUM_MARGIN_THRESHOLD=2`, and the 5-step confidence computation function (stub from STORY-041 already has `CRITICAL_FIELDS` and `NULL_SUGGESTION_THRESHOLD`)
- [ ] `ClassificationResult` includes `confidenceBreakdown` and `tieBreaksFired` fields
- [ ] `confidenceBreakdown.steps` populated for every call (including null-suggestion path)
- [ ] `tieBreaksFired` is empty array (not null/undefined) when no tie-breaks fired
- [ ] Unit + integration + contract tests added and passing
- [ ] 100-run determinism test passing
- [ ] Confidence invariant test: `confidence_level` never null
- [ ] Bucket 8 format test passing: `suggested_code = "8"`, `eq_grade = null`, `bs_grade = null`
- [ ] All-null input test passing (null suggestion + 'low' confidence, no error)
- [ ] Binary_flag override test passing
- [ ] Contract test: `tieBreaksFired` is always an array (never null/undefined)
- [ ] Contract test: `confidenceBreakdown.steps` is always an array with at least one step
- [ ] Traceability comments reference RFC-001 §ClassificationResult, §Tie-Break Rules, §Confidence Computation; ADR-013; ADR-014
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 2–3; `docs/prd/source_of_truth_investment_framework_3AA.md` §Part I–II
- RFC: RFC-001 §ClassificationResult, §Tie-Break Rules, §Confidence Computation, §Special Cases
- ADR: ADR-004 (rules-first); ADR-013 (scoring weights); ADR-014 (confidence thresholds)
