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

---

## Tasks

### TASK-041-001 — ClassificationInput Interface, Scoring-Weights Constants, and confidence-thresholds.ts Stub

**Purpose:** Create all shared TypeScript types and constants consumed by the three scorers. Creates `confidence-thresholds.ts` as a stub (CRITICAL_FIELDS + NULL_SUGGESTION_THRESHOLD only); STORY-043 extends it with the full confidence computation.

**Scope In:**

`src/domain/classification/types.ts` — exports:
- `ClassificationInput` interface (all fields nullable except `ticker`):
  ```typescript
  interface ClassificationInput {
    ticker: string;
    // Fundamentals (EPIC-003)
    revenue_growth_fwd: number | null;
    revenue_growth_3y: number | null;
    eps_growth_fwd: number | null;
    eps_growth_3y: number | null;
    gross_profit_growth: number | null;
    fcf_conversion: number | null;
    fcf_positive: boolean | null;
    net_income_positive: boolean | null;
    operating_margin: number | null;
    // Balance sheet — used by STORY-042 BS scorer
    net_debt_ebitda: number | null;
    interest_coverage: number | null;
    // Deterministic flags (STORY-033)
    holding_company_flag: boolean | null;
    insurer_flag: boolean | null;
    binary_flag: boolean | null;
    cyclicality_flag: boolean | null;
    optionality_flag: boolean | null;
    pre_operating_leverage_flag: boolean | null;
    material_dilution_flag: boolean | null;
    // LLM enrichment scores (STORY-040; null if not yet run)
    moat_strength_score: number | null;            // E1, range 1.0–5.0
    pricing_power_score: number | null;            // E2
    revenue_recurrence_score: number | null;       // E3
    margin_durability_score: number | null;        // E4
    capital_intensity_score: number | null;        // E5
    qualitative_cyclicality_score: number | null;  // E6
  }
  ```
- `BucketScorerOutput` interface: `{ scores: Record<1|2|3|4|5|6|7|8, number>, reason_codes: string[], missing_field_count: number }`

`src/domain/classification/scoring-weights.ts` — exports all ADR-013 integer constants:
- Bucket scorer: `REV_PRIMARY=3`, `REV_SECONDARY=2`, `EPS_PRIMARY=2`, `EPS_SECONDARY=1`, `PROFITABILITY=1`, `FCF_CONVERSION_WEIGHT=1`, `FLAG_PRIMARY=2`, `ENRICHMENT_BONUS=1`
- EQ scorer: `EQ_FCF_STRONG=3`, `EQ_FCF_MODERATE=2`, `EQ_FCF_WEAK=2`, `EQ_MOAT_STRONG=2`, `EQ_MOAT_MODERATE=1`, `EQ_MOAT_WEAK=1`, `EQ_NI_POSITIVE=1`
- BS scorer: `BS_DEBT_LOW=3`, `BS_DEBT_MODERATE=2`, `BS_DEBT_HIGH=2`, `BS_COVERAGE_STRONG=2`, `BS_COVERAGE_MODERATE=1`, `BS_COVERAGE_WEAK=2`, `BS_CAPITAL_INTENSITY=1`, `BS_NET_CASH_BONUS=1`

`src/domain/classification/confidence-thresholds.ts` — **stub only** (STORY-043 adds computation constants and functions):
```typescript
// EPIC-004: STORY-041 — stub; STORY-043 extends with confidence computation constants
// ADR-014 §Critical Fields Definition — exactly these 10 fields, no more, no less
export const CRITICAL_FIELDS = [
  'revenue_growth_fwd',
  'revenue_growth_3y',
  'eps_growth_fwd',
  'eps_growth_3y',
  'fcf_conversion',
  'fcf_positive',
  'net_income_positive',
  'operating_margin',
  'net_debt_ebitda',
  'interest_coverage',
] as const satisfies ReadonlyArray<keyof ClassificationInput>;

// ADR-014: missing_field_count > NULL_SUGGESTION_THRESHOLD → suggested_code = null
export const NULL_SUGGESTION_THRESHOLD = 5;
```

`src/domain/classification/index.ts` — barrel re-export of public API.

**Scope Out:** `ClassificationResult` (STORY-043), `ClassificationState` (STORY-044); full confidence computation constants (`HIGH_MARGIN_THRESHOLD`, `MEDIUM_MARGIN_THRESHOLD`) and logic (STORY-043).

**Implementation Notes:**
- Enrichment field names use DB column names confirmed in Prisma schema: `moat_strength_score`, `capital_intensity_score`, `qualitative_cyclicality_score` — **not** the `e1_`/`e2_` shorthand used in UI stories
- `CRITICAL_FIELDS` must be exactly the 10 fields listed above per ADR-014; flags and enrichment scores are excluded from the null count
- Add header comment to `confidence-thresholds.ts`: `// STORY-043 extends this file — do not recreate it`
- `tsc --noEmit` must pass after this task with no new errors

**Definition of Done:**
- [ ] `src/domain/classification/types.ts` created with `ClassificationInput` and `BucketScorerOutput`
- [ ] `src/domain/classification/scoring-weights.ts` created with all ADR-013 integer constants
- [ ] `src/domain/classification/confidence-thresholds.ts` stub created with `CRITICAL_FIELDS` (exactly 10 fields) and `NULL_SUGGESTION_THRESHOLD = 5`
- [ ] `src/domain/classification/index.ts` barrel export created
- [ ] `CRITICAL_FIELDS` uses `as const satisfies` to enforce the tuple matches `keyof ClassificationInput`
- [ ] Header comment in `confidence-thresholds.ts` warns STORY-043 to extend, not recreate
- [ ] `tsc --noEmit` passes with no new errors
- [ ] Traceability comments reference RFC-001 §ClassificationInput and ADR-013 §Scoring Weights and ADR-014 §Critical Fields
- [ ] Implementation log updated

---

### TASK-041-002 — BucketScorer: Primary Fundamental Scoring Rules (Buckets 1–7)

**Purpose:** Implement the core `BucketScorer` function with all additive rules for Buckets 1–7. Missing fields must not cause errors.

**Scope In:**

`src/domain/classification/bucket-scorer.ts` — exports `BucketScorer(input: ClassificationInput): BucketScorerOutput`.

Score map initialized: `{ 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0 }`. All rules are additive; higher-scoring buckets can accumulate points from multiple rules.

**Bucket growth ranges per ADR-013** (applied to `revenue_growth_fwd` for `REV_PRIMARY=3`):

| Bucket | revenue_growth_fwd range | Boundary handling |
|---|---|---|
| 1 | ≤ 2% | inclusive upper bound |
| 2 | (2%, 3%] | exclusive 2%, inclusive 3% |
| 3 | (3%, 8%) | exclusive both ends |
| 4 | [8%, 15%] | **8.0% fires Bucket 4** (inclusive lower); 15% inclusive |
| 5 | [10%, 20%] | overlaps with 4 and 6 by design |
| 6 | (15%, 35%] | exclusive 15%, inclusive 35% |
| 7 | > 35% | strict |

**Secondary revenue rules** (`REV_SECONDARY=2`): `revenue_growth_3y` and `gross_profit_growth` use **the same per-bucket ranges** as `revenue_growth_fwd`. They contribute 2 points (not 3) to reflect lower reliability as secondary signals.

**EPS rules**: `eps_growth_fwd` → `EPS_PRIMARY=2`; `eps_growth_3y` → `EPS_SECONDARY=1`. Apply the same bucket ranges.

**Profitability rules** (each adds `PROFITABILITY=1` independently):
- `fcf_positive = true` → +1 to Buckets 3 and 4
- `net_income_positive = true` → +1 to Buckets 3 and 4
- `operating_margin` threshold: fires when `operating_margin ≥ 0.15` (15%) for Buckets 3/4. **Implementer must document the chosen threshold with a rationale comment** referencing the PRD bucket profile. This value is locked by the golden-set regression test after implementation.

**FCF_CONVERSION rule** (`FCF_CONVERSION_WEIGHT=1`): fires when `fcf_conversion ≥ 0.50` for Buckets 3 and 4. Rationale: 50% is the lower bound of "moderate FCF quality" per the PRD Bucket 3 profile ("strong FCF"). The EQ scorer uses stricter thresholds (>80% for EQ-A) — these are separate concerns.

**Flag rule**: `pre_operating_leverage_flag = true` → `FLAG_PRIMARY=2` added to Bucket 5.

**Reason-code-only rules** (no score change):
- `insurer_flag = true` → emit `insurer_flag_applied`
- `optionality_flag = true` → emit `optionality_flag_applied`

**`missing_field_count`**: count of nulls in `CRITICAL_FIELDS` (imported from `confidence-thresholds.ts`). Computed once at the start of the function.

**Bucket 8 invariant**: `scores[8]` must never be modified by this function. `binary_flag` is not read here.

**Scope Out:** Enrichment bonus rules (TASK-041-003), EQ/BS scoring (STORY-042), tie-break (STORY-043).

**Implementation Notes:**
- Every field read must be guarded: `if (value === null || value === undefined) return;`
- Define bucket ranges as named constants at the top of the file (not inline literals)
- Comment every boundary case: `// 8.0% inclusive lower bound for Bucket 4 — ADR-013 §Bucket-Specific Growth Ranges`
- Reason code vocabulary must match `3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Reason Codes exactly
- Traceability header: `// RFC-001 §Bucket Scorer // ADR-013 §Bucket Scorer Point Weights`

**Definition of Done:**
- [ ] `BucketScorer` implemented in `src/domain/classification/bucket-scorer.ts`
- [ ] All 8 bucket score maps initialized to 0; Bucket 8 never modified
- [ ] `REV_PRIMARY` range rules implemented for all 7 buckets with correct boundary handling
- [ ] `REV_SECONDARY` rules for `revenue_growth_3y` and `gross_profit_growth` (same ranges, 2 pts)
- [ ] `EPS_PRIMARY` and `EPS_SECONDARY` rules implemented
- [ ] `PROFITABILITY` rules: `fcf_positive`, `net_income_positive`, `operating_margin ≥ 15%` for Buckets 3/4
- [ ] `FCF_CONVERSION_WEIGHT` rule: `fcf_conversion ≥ 0.50` for Buckets 3/4
- [ ] `FLAG_PRIMARY` rule for `pre_operating_leverage_flag` → Bucket 5
- [ ] Reason-code-only rules for `insurer_flag` and `optionality_flag`
- [ ] `missing_field_count` computed from `CRITICAL_FIELDS`
- [ ] All null fields handled without exception
- [ ] Chosen `operating_margin` threshold documented in code comment with rationale
- [ ] `tsc --noEmit` passes; no new TypeScript errors
- [ ] Implementation log updated

---

### TASK-041-003 — BucketScorer: Enrichment Bonus Rules (E1/E5/E6 Optional)

**Purpose:** Extend `BucketScorer` with optional enrichment bonus scoring from E1 (moat), E5 (capital intensity), and E6 (qualitative cyclicality). All rules are null-safe; the scorer behaves identically to TASK-041-002 when enrichment scores are absent.

**Scope In:**

Extension of `bucket-scorer.ts`, added as a clearly demarcated section: `// ── Enrichment bonus rules (E1/E5/E6) ──`

**Enrichment bonus rules** (each adds `ENRICHMENT_BONUS=1`; threshold is `≥ 4.0`, inclusive):
- `moat_strength_score ≥ 4.0` → +1 to Bucket 3 AND +1 to Bucket 4
- `qualitative_cyclicality_score ≥ 4.0` → +1 to Bucket 5 AND +1 to Bucket 6
- `capital_intensity_score ≥ 4.0` → +1 to Bucket 5

Maximum enrichment bonuses per bucket: 3 (ADR-013). With 3 sources, the cap is structurally always met in V1 — add a TODO comment for future extension.

E2 (`pricing_power_score`), E3 (`revenue_recurrence_score`), E4 (`margin_durability_score`) are **not used** in the bucket scorer — they contribute to EQ scoring (STORY-042).

Enrichment reason codes: `moat_enrichment_bonus`, `cyclicality_enrichment_bonus`, `capital_intensity_enrichment_bonus`.

**Scope Out:** E2, E3, E4 (STORY-042); EQ/BS scoring; tie-break; confidence.

**Definition of Done:**
- [ ] Enrichment bonus rules for E1, E5, E6 implemented as demarcated section in `bucket-scorer.ts`
- [ ] All enrichment rules null-safe
- [ ] Threshold exactly `≥ 4.0` (4.0 fires, 3.999 does not)
- [ ] Enrichment reason codes emitted when bonus fires
- [ ] TODO comment for enrichment cap enforcement on future extension
- [ ] `tsc --noEmit` passes
- [ ] Implementation log updated

---

### TASK-041-004 — Unit Tests: Per-Rule, Contract/Schema, Determinism, Boundary, CRITICAL_FIELDS

**Purpose:** Full unit test suite for `BucketScorer`. No DB, no external dependencies. Covers all BDD scenarios, boundary values, contract/schema invariants, CRITICAL_FIELDS membership, and 100-run determinism.

**Test file:** `tests/unit/classification/story-041-bucket-scorer.test.ts`

**Test groups:**

**(a) Per-rule tests** — one test per rule per bucket proving the exact point contribution:
- `revenue_growth_fwd=0.10` → `scores[4]` includes exactly `REV_PRIMARY` (3 pts)
- `revenue_growth_fwd=0.05` → `scores[3]` includes `REV_PRIMARY`
- `revenue_growth_fwd=0.25` → `scores[6]` includes `REV_PRIMARY`
- `revenue_growth_fwd=-0.05` → `scores[1]` includes `REV_PRIMARY`
- `revenue_growth_fwd=0.60` → `scores[7]` includes `REV_PRIMARY`
- `revenue_growth_3y=0.10` → `scores[4]` includes `REV_SECONDARY` (2 pts)
- `gross_profit_growth=0.10` → `scores[4]` includes `REV_SECONDARY`
- `eps_growth_fwd=0.14` → `scores[4]` includes `EPS_PRIMARY` (2 pts)
- `eps_growth_3y=0.07` → `scores[3]` includes `EPS_SECONDARY` (1 pt)
- `fcf_positive=true` → `scores[3]` and `scores[4]` each +`PROFITABILITY`
- `net_income_positive=true` → `scores[3]` and `scores[4]` each +`PROFITABILITY`
- `operating_margin=0.20` → `scores[3]` and `scores[4]` each +`PROFITABILITY`
- `fcf_conversion=0.60` → `scores[3]` and `scores[4]` each +`FCF_CONVERSION_WEIGHT`
- `pre_operating_leverage_flag=true` → `scores[5]` += `FLAG_PRIMARY` (2 pts)

**(b) Bucket winner tests** — clear synthetic inputs produce unambiguous winner:
- Bucket 4 winner: `revenue_growth_fwd=0.10, eps_growth_fwd=0.14, fcf_positive=true`
- Bucket 3 winner: `revenue_growth_fwd=0.05, eps_growth_3y=0.07`
- Bucket 6 winner: `revenue_growth_fwd=0.25`
- Bucket 7 winner: `revenue_growth_fwd=0.60`
- Bucket 1 winner: `revenue_growth_fwd=-0.05`

**(c) Boundary tests** — exact edge values:
- `revenue_growth_fwd=0.08` → REV_PRIMARY fires Bucket 4, **not** Bucket 3
- `revenue_growth_fwd=0.079999` → REV_PRIMARY fires Bucket 3, not Bucket 4
- `revenue_growth_fwd=0.03` → Bucket 3 fires (exclusive lower of Bucket 3), Bucket 2 does not
- `revenue_growth_fwd=0.02` → Bucket 1 or 2 fires (boundary); Bucket 3 does not
- `moat_strength_score=4.0` → enrichment bonus fires
- `moat_strength_score=3.9999` → enrichment bonus does not fire

**(d) Missing-field tests:**
- All fields null → all scores 0, `missing_field_count = 10`, no exception
- `revenue_growth_fwd=0.10` only → `scores[4] = REV_PRIMARY`; all others 0 or less; `missing_field_count = 9`
- `pre_operating_leverage_flag=null` → FLAG_PRIMARY does not fire for Bucket 5

**(e) Invariant / contract tests:**
- `scores[8] === 0` for every input tested, including `binary_flag=true`
- `reason_codes` is always an array of non-empty strings
- Output shape: `scores` keys are 1–8, `reason_codes` array, `missing_field_count` number ≥ 0

**(f) CRITICAL_FIELDS membership test** *(revision C1 fix)*:
- `CRITICAL_FIELDS.length === 10`
- `CRITICAL_FIELDS` contains exactly: `revenue_growth_fwd`, `revenue_growth_3y`, `eps_growth_fwd`, `eps_growth_3y`, `fcf_conversion`, `fcf_positive`, `net_income_positive`, `operating_margin`, `net_debt_ebitda`, `interest_coverage`
- `CRITICAL_FIELDS` does not contain any flag or enrichment field

**(g) Enrichment bonus tests:**
- `moat_strength_score=4.5` → Bucket 3 score +1 and Bucket 4 score +1 (relative to no-enrichment baseline)
- `moat_strength_score=3.5` → no enrichment bonus
- `moat_strength_score=null` → no crash, no bonus
- `capital_intensity_score=4.0` → Bucket 5 score +1
- `qualitative_cyclicality_score=4.0` → Bucket 5 score +1 AND Bucket 6 score +1

**(h) Determinism test:**
- Run `BucketScorer` 100 times with identical MSFT-like fixture → serialize all 100 outputs → all equal first

**Test naming convention:** `describe('EPIC-004/STORY-041/TASK-041-004: BucketScorer', ...)`

**Definition of Done:**
- [ ] `tests/unit/classification/story-041-bucket-scorer.test.ts` created
- [ ] Groups (a)–(h) all implemented with named `it()` statements matching BDD scenario language
- [ ] `CRITICAL_FIELDS` membership test passing (exactly 10 fields, exact field names)
- [ ] `scores[8] === 0` invariant tested in every winner test
- [ ] 100-run determinism test passing
- [ ] All new tests pass: `npx jest tests/unit/classification/`
- [ ] Existing 489 tests unaffected
- [ ] Implementation log updated

---

### TASK-041-005 — Integration Tests, Golden-Set Fixture Capture, Tracking Update

**Purpose:** Verify `BucketScorer` against real test DB data. Capture and lock the golden-set bucket score maps so future weight changes trigger regression failures.

**Scope In:**

`tests/integration/classification/bucket-scorer.test.ts`:
- Read MSFT from test DB via Prisma; convert Decimal fields with `.toNumber()`; call `BucketScorer`; assert `scores[4]` is strictly the highest score; assert `scores[8] === 0`
- Read UNH from test DB; assert `scores[3]` is strictly highest (skip with `test.skip` + TODO if UNH absent from test DB)
- Each test is isolated; no shared mutable state

`tests/unit/classification/fixtures/bucket-scorer-golden.ts`:
- **Capture process**: run `BucketScorer` once against each of the 5 test DB stocks (MSFT, ADBE, TSLA, UBER, UNH); record the exact `scores` output as a typed constant; commit
- **Regression tests**: `expect(BucketScorer(MSFT_GOLDEN_INPUT).scores).toEqual(MSFT_GOLDEN_SCORES)` — one per stock; these lock in the scoring outputs against future weight drift

**Tracking update:**
- `docs/architecture/IMPLEMENTATION-LOG.md`: entry for STORY-041 complete (evidence: test counts, files created)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md`: STORY-041 → `done`, STORY-042 → `ready`
- `stories/README.md`: STORY-041 → `done`
- Git commit: `[EPIC-004/STORY-041] Implement BucketScorer with additive scoring rules and golden-set regression`

**Definition of Done:**
- [ ] `tests/integration/classification/bucket-scorer.test.ts` created and passing against test DB
- [ ] MSFT integration test: `scores[4]` is highest
- [ ] UNH integration test: `scores[3]` is highest (or `test.skip` with TODO if absent)
- [ ] `tests/unit/classification/fixtures/bucket-scorer-golden.ts` created with 5-stock constants
- [ ] Golden-set regression tests passing
- [ ] All tests: `npx jest` → cumulative count ≥ 540 passing
- [ ] Implementation plan: STORY-041 → `done`, STORY-042 → `ready`
- [ ] `stories/README.md`: STORY-041 → `done`
- [ ] Implementation log entry for STORY-041 completion
- [ ] Git commit created with correct message format
