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

---

## Tasks

### TASK-043-001 — ClassificationResult Interface + Confidence-Thresholds Extension

**Purpose:** Define the `ClassificationResult` output interface and extend the existing `confidence-thresholds.ts` stub (STORY-041) with `HIGH_MARGIN_THRESHOLD` and `MEDIUM_MARGIN_THRESHOLD` constants needed by `classifyStock`.

**Scope In:**

`src/domain/classification/types.ts` — add after existing interfaces:

```typescript
export interface ConfidenceStep {
  step: number;
  label: string;
  note: string;
  band: 'high' | 'medium' | 'low';
  tieBreaks?: string[];
  missing?: number;
}

export interface TieBreakRecord {
  rule: string;               // e.g. "3v4", "4v5"
  description: string;        // human-readable explanation
  winner: number | string;    // resolved bucket number
  condition: string;          // text of the deciding condition
  values: Record<string, number | null>; // actual input values tested
  outcome: string;            // e.g. "Bucket 4 chosen: strong FCF and ROIC"
  marginAtTrigger: number;    // BucketScorer margin when this rule fired
}

export interface ClassificationResult {
  suggested_code: string | null;                 // "4AA", "8", or null
  bucket: BucketNumber | null;                   // null only when missing_field_count > 5
  eq_grade: GradeLevel | null;                   // null for Bucket 8 or missing data
  bs_grade: GradeLevel | null;                   // null for Bucket 8 or missing data
  confidence_level: 'high' | 'medium' | 'low';  // NEVER null
  reason_codes: string[];                        // union of all scorer codes + tie-break + flag codes
  scores: {
    bucket: Record<BucketNumber, number>;
    eq: Record<GradeLevel, number>;
    bs: Record<GradeLevel, number>;
  };
  missing_field_count: number;
  confidenceBreakdown: { steps: ConfidenceStep[] };
  tieBreaksFired: TieBreakRecord[];              // empty array (never null) when no tie-breaks
}
```

`src/domain/classification/confidence-thresholds.ts` — append (do not recreate; stub from TASK-041-001 already has `CRITICAL_FIELDS` and `NULL_SUGGESTION_THRESHOLD`):
```typescript
// High confidence requires margin ≥ 4 (ADR-014 §Step 2)
export const HIGH_MARGIN_THRESHOLD = 4;

// Medium confidence requires margin ≥ 2 (ADR-014 §Step 2)
export const MEDIUM_MARGIN_THRESHOLD = 2;
```

`src/domain/classification/index.ts` — add exports for `ClassificationResult`, `ConfidenceStep`, `TieBreakRecord`, `HIGH_MARGIN_THRESHOLD`, `MEDIUM_MARGIN_THRESHOLD`, and `classifyStock` (forward reference — added after TASK-043-002).

**Definition of Done:**
- [ ] `ClassificationResult`, `ConfidenceStep`, `TieBreakRecord` exported from `src/domain/classification/`
- [ ] `HIGH_MARGIN_THRESHOLD = 4` and `MEDIUM_MARGIN_THRESHOLD = 2` exported from confidence-thresholds.ts
- [ ] `tsc --noEmit` passes with no new errors

---

### TASK-043-002 — `classifyStock` Implementation

**Purpose:** Implement the assembly function that orchestrates the three scorers, resolves ties, applies special-case overrides, computes confidence, and returns `ClassificationResult`.

**Scope In:**

`src/domain/classification/classifier.ts` — exports `classifyStock(input: ClassificationInput): ClassificationResult`.

**Algorithm (execute in this exact order):**

**Step 0 — Run all three scorers:**
```typescript
const bucketResult = BucketScorer(input);
const eqResult     = EarningsQualityScorer(input);
const bsResult     = BalanceSheetQualityScorer(input);
const missing      = bucketResult.missing_field_count;
```

**Step 1 — Null-suggestion gate (ADR-014):**
```
if (missing > NULL_SUGGESTION_THRESHOLD):
  return { suggested_code: null, bucket: null, eq_grade: null, bs_grade: null,
           confidence_level: 'low', ..., tieBreaksFired: [],
           confidenceBreakdown: { steps: [{ step: 1, label: 'null-suggestion gate',
             note: 'missing_field_count > 5 — data too sparse', band: 'low', missing }] } }
```

**Step 2 — Tie-break resolution:**

Compute a `sortedBuckets` array: buckets 1–7 sorted by score descending. The `topScore` is the highest score.

Tie-break trigger: a pair `(p, q)` fires when **both** `scores[p]` and `scores[q]` are within 1 point of `topScore` (i.e., `topScore - scores[p] ≤ 1` and `topScore - scores[q] ≤ 1`).

Process tie-break pairs in this priority order (handles three-way ties correctly):

| Priority | Pair | Rule: when to prefer the higher bucket |
|---|---|---|
| 1 | 4v5 | prefer B5 if `pre_operating_leverage_flag = true`; else prefer B4 |
| 2 | 5v6 | prefer B5 if `pre_operating_leverage_flag = true`; else prefer B6 |
| 3 | 3v4 | prefer B4 if `fcf_conversion > 0.85` AND `roic > 0.20`; else prefer B3 |
| 4 | 6v7 | prefer B7 if `revenue_growth_fwd >= 0.35`; else prefer B6 |

For each pair in priority order:
- Check if both buckets are within 1 point of `topScore` (the current `topScore` after any prior tie-break in this call)
- If yes: apply rule, record `TieBreakRecord`, and **eliminate the losing bucket from contention** (set its effective score to -∞ for future checks in this call)
- After processing all applicable pairs, winner = highest-score contender among 1–7

**Three-way tie example ({3,4,5} all equal):** Priority 1 fires first (4v5), resolves to 4 or 5. Then priority 3 (3v4) may fire if 3 is still within 1. Two `TieBreakRecord` entries recorded.

**For pairs with no applicable rule** (e.g., {1,2}, {2,3}, {1,3}): no tie-break fires; winner stays the lower-numbered bucket (conservative default, per BucketScorer's existing left-wins behavior).

**Step 3 — Special-case overrides (in priority order, highest first):**

1. **`binary_flag = true`** → `resolvedBucket = 8`; `eq_grade = null`; `bs_grade = null`; add reason code `binary_flag_override`. Overrides tie-break result.
2. **`holding_company_flag = true` AND resolvedBucket ∈ {3, 4}** → `resolvedBucket = 3`; add reason code `holding_company_flag_applied`. (Does NOT fire if binary_flag already set bucket = 8.)
3. **`cyclicality_flag = true`** → add reason code `cyclicality_flag_applied`. No bucket change.
4. **`insurer_flag = true`** → add reason code `insurer_flag_applied`. No bucket change.
5. **`optionality_flag = true`** → add reason code `optionality_flag_applied`. No bucket change.

**Step 4 — Confidence computation (ADR-014 steps 2–4):**

```
margin       = bucketResult.margin   // original BucketScorer margin (pre-tie-break)
tieBreaks    = tieBreaksFired.length
steps        = []

// Step 2: score margin
if margin >= HIGH_MARGIN_THRESHOLD (4): band = 'high'
else if margin >= MEDIUM_MARGIN_THRESHOLD (2): band = 'medium'
else: band = 'low'
steps.push({ step: 2, label: 'score margin', note: `margin = ${margin}`, band })

// Step 3: tie-break penalty
if tieBreaks >= 2: degrade to 'low'
else if tieBreaks === 1: degrade one level (high→medium, medium→low, low stays low)
steps.push({ step: 3, label: 'tie-break penalty', ..., band: after-penalty })

// Step 4: missing-field penalty
if missing === 5: degrade to 'low'
else if missing >= 3: degrade one level
steps.push({ step: 4, label: 'missing-field penalty', ..., band: after-penalty, missing })

// Step 5: final
confidence_level = current band
steps.push({ step: 5, label: 'final', note: confidence_level, band: confidence_level })
```

**Step 5 — Code assembly:**

```typescript
const eq_grade  = resolvedBucket === 8 ? null : eqResult.winner;
const bs_grade  = resolvedBucket === 8 ? null : bsResult.winner;

let suggested_code: string | null = null;
if (resolvedBucket !== null) {
  if (resolvedBucket === 8) {
    suggested_code = '8';
  } else {
    // Append grades only if both are present; else omit (e.g., "4" if grades unknown)
    suggested_code = eq_grade && bs_grade
      ? `${resolvedBucket}${eq_grade}${bs_grade}`
      : `${resolvedBucket}`;
  }
}
```

**Step 6 — Assemble `ClassificationResult`:**
- `reason_codes`: `[...bucketResult.reason_codes, ...eqResult.reason_codes, ...bsResult.reason_codes, ...flagCodes]` (no duplicates needed; order: bucket → eq → bs → flags)
- `tieBreaksFired`: array of `TieBreakRecord` objects (empty array if none)
- `confidenceBreakdown.steps`: always at least 1 step (step 1 if gate fired; steps 2–5 otherwise)

**Definition of Done:**
- [ ] `classifyStock` implemented in `src/domain/classification/classifier.ts`
- [ ] Tie-break pair priority order `[4v5, 5v6, 3v4, 6v7]` documented in code
- [ ] Binary_flag override applied before holding_company_flag (priority documented in code)
- [ ] `tieBreaksFired` is always an array (never null/undefined)
- [ ] `confidenceBreakdown.steps` always populated (≥ 1 step)
- [ ] `confidence_level` never null — invariant enforced by TypeScript type
- [ ] Exported from `src/domain/classification/index.ts`
- [ ] `tsc --noEmit` passes

---

### TASK-043-003 — Unit Tests: Tie-Breaks, Overrides, Confidence, Contract, Determinism

**Purpose:** Full unit test suite for `classifyStock`. No DB. All inputs synthetic with known properties.

**Test file:** `tests/unit/classification/story-043-classify-stock.test.ts`

**Helper:** `makeInput(overrides)` — same pattern as STORY-042 tests.

---

**(a) Clear bucket winner (no tie-break):**
- `revenue_growth_fwd=0.10, revenue_growth_3y=0.14, eps_growth_3y=0.18, operating_margin=0.49, moat_strength_score=5.0, fcf_positive=true, net_income_positive=true` → `suggested_code` starts with `"4"`, `tieBreaksFired=[]`
- `revenue_growth_fwd=0.25` only → `suggested_code` starts with `"6"`

**(b) Tie-break: B3v4:**
- B3 and B4 exactly tied (artificially achieve via inputs that fire exactly equal scores for both) + `fcf_conversion=0.65, roic=0.15` → Bucket 3 chosen; `tieBreaksFired[0].rule = '3v4'`
- Same tie + `fcf_conversion=0.90, roic=0.25` → Bucket 4 chosen

**Note:** These tests construct inputs that produce exactly-tied B3/B4 scores. Use `revenue_growth_fwd=0.07` (B3 zone: 3–8%) + `revenue_growth_3y=0.09` (B4 zone: 8–15%) to produce equal scores of 3+2=5 for both buckets.

**(c) Tie-break: B4v5:**
- B4 and B5 tied + `pre_operating_leverage_flag=false` → Bucket 4 chosen; `tieBreaksFired[0].rule = '4v5'`
- B4 and B5 tied + `pre_operating_leverage_flag=true` → Bucket 5 chosen

**(d) Tie-break: B5v6:**
- B5 and B6 tied + `pre_operating_leverage_flag=false` → Bucket 6 chosen
- B5 and B6 tied + `pre_operating_leverage_flag=true` → Bucket 5 chosen

**(e) Tie-break: B6v7:**
- B6 and B7 tied + `revenue_growth_fwd=0.30` → Bucket 6 chosen
- B6 and B7 tied + `revenue_growth_fwd=0.35` → Bucket 7 chosen (≥ 0.35)

**(f) Tie-break margin boundary:**
- Winner margin = 2 (B4 wins by 2 over B3) → tie-break does NOT fire; `tieBreaksFired=[]`
- Winner margin = 1 (B4 wins by 1 over B3, but no applicable rule pair) → no rule fires; margin is exact

**(g) Special-case overrides:**
- `binary_flag=true` + any input → `suggested_code='8'`, `bucket=8`, `eq_grade=null`, `bs_grade=null`, `reason_codes` contains `'binary_flag_override'`
- `binary_flag=true` + `holding_company_flag=true` → `suggested_code='8'` (binary wins)
- `holding_company_flag=true` + B4 scorer winner → `bucket=3`, reason `'holding_company_flag_applied'`
- `holding_company_flag=true` + B3 scorer winner → `bucket=3` (no change), reason `'holding_company_flag_applied'`
- `holding_company_flag=true` + B5 scorer winner → `bucket=5` (no change; only applies to B3/B4)
- `cyclicality_flag=true` → `reason_codes` contains `'cyclicality_flag_applied'`; bucket unchanged
- `insurer_flag=true` → `reason_codes` contains `'insurer_flag_applied'`; bucket unchanged
- `optionality_flag=true` → `reason_codes` contains `'optionality_flag_applied'`; bucket unchanged

**(h) Confidence computation (synthetic inputs with known margins):**
- margin=5, tie_breaks=0, missing=0 → `'high'`
- margin=4, tie_breaks=0, missing=0 → `'high'`
- margin=4, tie_breaks=1, missing=0 → `'medium'` (tie-break degrades high → medium)
- margin=3, tie_breaks=0, missing=0 → `'medium'`
- margin=2, tie_breaks=0, missing=0 → `'medium'`
- margin=2, tie_breaks=1, missing=0 → `'low'` (tie-break degrades medium → low)
- margin=5, tie_breaks=2, missing=0 → `'low'` (≥ 2 tie-breaks forces low)
- margin=4, tie_breaks=0, missing=3 → `'medium'` (missing-field penalty: high → medium)
- margin=4, tie_breaks=0, missing=4 → `'medium'`
- margin=4, tie_breaks=0, missing=5 → `'low'` (missing=5 forces low)
- margin=1, tie_breaks=0, missing=0 → `'low'`
- `missing_field_count=6` → `suggested_code=null`, `confidence_level='low'` (null-suggestion gate)

**Note:** To test confidence with a given margin, construct a synthetic input that produces the desired margin from BucketScorer. The easiest approach: provide `revenue_growth_fwd` only (gives REV_PRIMARY=3 to one bucket, 0 to all others) for margin=3; add `revenue_growth_3y` in same range for margin=5; etc.

**(i) All-null input:**
- All fields null → `suggested_code=null`, `confidence_level='low'`, `bucket=null`, `tieBreaksFired=[]`, no exception, `confidenceBreakdown.steps.length >= 1`

**(j) Output contract:**
- `confidence_level` is always `'high' | 'medium' | 'low'` (never null, never undefined) — checked for 5 distinct inputs
- `suggested_code` matches regex `^[1-8]([ABC][ABC])?$` or is null
- `scores.bucket` has keys 1–8, `scores.eq` has keys A/B/C, `scores.bs` has keys A/B/C
- `tieBreaksFired` is always an array (never null/undefined)
- `confidenceBreakdown.steps` is always an array with ≥ 1 entry
- `reason_codes` is always an array

**(k) Determinism:**
- 100 runs with MSFT-like input → identical `classifyStock` output

**Test naming:** `describe('EPIC-004/STORY-043/TASK-043-003: classifyStock', ...)`

**Definition of Done:**
- [ ] `tests/unit/classification/story-043-classify-stock.test.ts` created with groups (a)–(k)
- [ ] All tie-break pairs tested with both outcomes (B3/B4, B4/B5, B5/B6, B6/7)
- [ ] Tie-break margin boundary tested (margin=1 fires; margin=2 does NOT)
- [ ] All 5 special-case flags tested
- [ ] All ADR-014 confidence boundary values tested with exact thresholds
- [ ] `confidence_level` never-null invariant verified
- [ ] `npx jest tests/unit/classification/story-043-classify-stock.test.ts` → all pass
- [ ] Existing 612 tests unaffected

---

### TASK-043-004 — Integration Tests, Golden-Set Fixture, Tracking Update

**Purpose:** Verify `classifyStock` against real test DB data. Lock golden-set outputs as regression fixtures.

**Scope In:**

`tests/unit/classification/fixtures/classify-stock-golden.ts`:
- MSFT: `{ suggested_code, bucket, eq_grade, bs_grade, confidence_level }` captured from scorer run
- ADBE, TSLA, UBER, UNH: same fields captured
- All values locked as typed constants; regression tests assert exact equality per field

`tests/integration/classification/classify-stock.test.ts`:
- Read each of MSFT, ADBE, TSLA, UBER, UNH from test DB
- Convert (growth fields ÷ 100; ratios as-is) using existing `toClassificationInput` pattern from bucket-scorer integration test
- Assert: MSFT `suggested_code` starts with `'4'` OR `'3'` (boundary zone); MSFT `eq_grade = 'A'`; MSFT `bs_grade = 'A'`
- Assert: UNH `bs_grade = 'C'` (expected from STORY-042 integration evidence)
- Assert: `binary_flag` stocks (if any) → `suggested_code = '8'`
- Invariant: `confidence_level` is never null for any test stock
- Invariant: `tieBreaksFired` is always an array
- Invariant: `suggested_code` matches regex or is null

**Tracking update:**
- `docs/architecture/IMPLEMENTATION-LOG.md`: entry for STORY-043 completion
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md`: STORY-043 → `done`, STORY-044 → `ready`, active story updated
- `stories/README.md`: STORY-043 → `done`
- Git commit: `[EPIC-004/STORY-043] Implement classifyStock with tie-break, overrides, and confidence`

**Definition of Done:**
- [ ] `tests/integration/classification/classify-stock.test.ts` created and passing
- [ ] MSFT `eq_grade='A'` and `bs_grade='A'` asserted from test DB
- [ ] UNH `bs_grade='C'` asserted from test DB
- [ ] `confidence_level` never-null invariant passing for all 5 test stocks
- [ ] `tests/unit/classification/fixtures/classify-stock-golden.ts` created with 5-stock constants
- [ ] All tests passing: `npx jest tests/unit/classification/ tests/integration/classification/`
- [ ] Cumulative count ≥ 650 unit tests
- [ ] Implementation plan: STORY-043 → `done`, STORY-044 → `ready`
- [ ] `stories/README.md`: STORY-043 → `done`
- [ ] Implementation log entry for STORY-043 completion
- [ ] Git commit created with correct message format
