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

---

## Tasks

### TASK-042-001 — Update GradeScorerOutput + Fix Stale Constants and ADR-013 Field Name

**Purpose:** Add `missing_field_count` to `GradeScorerOutput` (required by Scope In), fix scoring-weights.ts comments to match ADR-013 exact thresholds, and fix the `net_debt_ebitda` typo in ADR-013 (same issue fixed in ADR-014 during STORY-041).

**Scope In:**

`src/domain/classification/types.ts` — update `GradeScorerOutput`:
```typescript
export interface GradeScorerOutput {
  scores: Record<GradeLevel, number>;
  winner: GradeLevel | null;  // highest-scoring grade; null when all scores = 0
  reason_codes: string[];
  missing_field_count: number; // count of scorer-relevant fundamental fields that are null
}
```

`src/domain/classification/scoring-weights.ts` — fix comments to match ADR-013 exactly:
- `BS_COVERAGE_STRONG = 2` comment: `interest_coverage > 12.0` (NOT 10×)
- `BS_COVERAGE_MODERATE = 1` comment: `interest_coverage [5.0, 12.0]` (NOT 3–10×)
- `BS_COVERAGE_WEAK = 2` comment: `interest_coverage < 5.0` (NOT < 3×)
- `BS_DEBT_LOW = 3` comment: `net_debt_to_ebitda < 1.0` strict (NOT ≤ 1.0)

`docs/adr/ADR-013-classification-scoring-algorithm-weights.md` — fix field name:
- Lines 72–80 and net-cash note: `net_debt_ebitda` → `net_debt_to_ebitda` (Prisma and PRD both use `net_debt_to_ebitda`)

`src/domain/classification/index.ts` — no new exports needed yet (added in TASK-042-002/003).

**Definition of Done:**
- [ ] `GradeScorerOutput` has `missing_field_count: number`
- [ ] `scoring-weights.ts` comments match ADR-013 thresholds exactly
- [ ] ADR-013 field name fixed to `net_debt_to_ebitda`
- [ ] `tsc --noEmit` passes with no new errors

---

### TASK-042-002 — EarningsQualityScorer Implementation

**Purpose:** Implement the EQ scorer with all ADR-013 additive rules.

**Scope In:**

`src/domain/classification/eq-scorer.ts` — exports `EarningsQualityScorer(input: ClassificationInput): GradeScorerOutput`.

Score map initialized: `{ A:0, B:0, C:0 }`. All rules are additive; missing fields skip silently.

**EQ scoring rules (ADR-013 §Earnings Quality Scorer Point Weights):**

FCF rules — mutually exclusive by range; `fcf_positive=false` is independent:
| Rule | Condition | Points to | Reason code |
|---|---|---|---|
| FCF Strong | `fcf_conversion > 0.80` (strictly greater) | +EQ_FCF_STRONG (3) to **A** | `high_fcf_conversion` |
| FCF Moderate | `fcf_conversion` in `[0.50, 0.80]` (0.80 inclusive → B, not A) | +EQ_FCF_MODERATE (2) to **B** | `moderate_fcf_conversion` |
| FCF Weak (conversion) | `fcf_conversion < 0.50` | +EQ_FCF_WEAK (2) to **C** | `weak_fcf_conversion` |
| FCF Weak (flag) | `fcf_positive = false` | +EQ_FCF_WEAK (2) to **C** | `fcf_not_positive` |

**EQ-A/B boundary documented in code:** `fcf_conversion == 0.80` is Moderate (≥ 0.50 AND ≤ 0.80 → fires Moderate). Strong requires strictly > 0.80.

Moat rules — mutually exclusive by range:
| Rule | Condition | Points to | Reason code |
|---|---|---|---|
| Moat Strong | `moat_strength_score ≥ 4.0` | +EQ_MOAT_STRONG (2) to **A** | `elite_moat` |
| Moat Moderate | `moat_strength_score` in `[2.5, 4.0)` | +EQ_MOAT_MODERATE (1) to **B** | `good_franchise` |
| Moat Weak | `moat_strength_score < 2.5` | +EQ_MOAT_WEAK (1) to **C** | `weak_moat` |

Net Income rule:
| Rule | Condition | Points to | Reason code |
|---|---|---|---|
| NI Positive | `net_income_positive = true` | +EQ_NI_POSITIVE (1) to **A** AND +EQ_NI_POSITIVE (1) to **B** | `real_earnings` |

**`missing_field_count`:** count of primary EQ fundamental fields that are null: `fcf_conversion`, `fcf_positive`, `net_income_positive` (3 fields; moat is optional enrichment, not counted).

**Winner determination:** grade with highest score. Tie-break: A > B > C (prefer higher quality; STORY-043 documents the same preference per Key Risks). If all scores = 0, winner = null.

**Scope Out:** Grade tie-break final resolution for STORY-043; EQ grade selection in ClassificationResult (STORY-043).

**Definition of Done:**
- [ ] `EarningsQualityScorer` implemented in `src/domain/classification/eq-scorer.ts`
- [ ] All 7 rules implemented, null-safe, with exact ADR-013 weights and thresholds
- [ ] FCF boundary documented: `fcf_conversion == 0.80` fires Moderate (B), not Strong (A)
- [ ] `missing_field_count` counts exactly `fcf_conversion`, `fcf_positive`, `net_income_positive`
- [ ] Exported from `src/domain/classification/index.ts`
- [ ] `tsc --noEmit` passes

---

### TASK-042-003 — BalanceSheetQualityScorer Implementation

**Purpose:** Implement the BS scorer with all ADR-013 additive rules.

**Scope In:**

`src/domain/classification/bs-scorer.ts` — exports `BalanceSheetQualityScorer(input: ClassificationInput): GradeScorerOutput`.

Score map initialized: `{ A:0, B:0, C:0 }`. All rules are additive; missing fields skip silently.

**BS scoring rules (ADR-013 §Balance Sheet Scorer Point Weights):**

Leverage rules — mutually exclusive:
| Rule | Condition | Points to | Reason code |
|---|---|---|---|
| Debt Low | `net_debt_to_ebitda < 1.0` (strict) | +BS_DEBT_LOW (3) to **A** | `low_leverage` |
| Net Cash Bonus | `net_debt_to_ebitda ≤ 0` (applied IN ADDITION to Debt Low) | +BS_NET_CASH_BONUS (1) to **A** | `net_cash_position` |
| Debt Moderate | `net_debt_to_ebitda` in `[1.0, 2.5]` | +BS_DEBT_MODERATE (2) to **B** | `manageable_leverage` |
| Debt High | `net_debt_to_ebitda > 2.5` | +BS_DEBT_HIGH (2) to **C** | `high_leverage` |

Net-cash implementation: check `< 1.0` first (fires A); then additionally check `≤ 0` (fires bonus to A). These stack: net cash = A gets 3+1=4.

Coverage rules — mutually exclusive:
| Rule | Condition | Points to | Reason code |
|---|---|---|---|
| Coverage Strong | `interest_coverage > 12.0` (strictly greater) | +BS_COVERAGE_STRONG (2) to **A** | `high_interest_coverage` |
| Coverage Moderate | `interest_coverage` in `[5.0, 12.0]` (12.0 inclusive → B) | +BS_COVERAGE_MODERATE (1) to **B** | `adequate_interest_coverage` |
| Coverage Weak | `interest_coverage < 5.0` (strict) | +BS_COVERAGE_WEAK (2) to **C** | `weak_interest_coverage` |

Enrichment rule (independent):
| Rule | Condition | Points to | Reason code |
|---|---|---|---|
| Capital Intensity | `capital_intensity_score ≥ 4.0` | +BS_CAPITAL_INTENSITY (1) to **C** | `high_capital_intensity` |

**Coverage boundary documented in code:** `interest_coverage == 12.0` fires Moderate (≥ 5.0 AND ≤ 12.0). Strong requires strictly > 12.0. `interest_coverage == 5.0` fires Moderate. Weak requires strictly < 5.0.

**`missing_field_count`:** count of primary BS fundamental fields that are null: `net_debt_to_ebitda`, `interest_coverage` (2 fields; capital_intensity_score is enrichment, not counted).

**Winner determination:** same as EQ: grade with highest score, tie A > B > C; null if all = 0.

**Definition of Done:**
- [ ] `BalanceSheetQualityScorer` implemented in `src/domain/classification/bs-scorer.ts`
- [ ] All 6 rules + net-cash bonus implemented, null-safe
- [ ] Net-cash bonus stacks on top of Debt Low (net cash = A gets 3+1=4)
- [ ] Coverage boundary documented: 12.0 exact → Moderate; > 12.0 → Strong
- [ ] `missing_field_count` counts exactly `net_debt_to_ebitda`, `interest_coverage`
- [ ] Exported from `src/domain/classification/index.ts`
- [ ] `tsc --noEmit` passes

---

### TASK-042-004 — Unit Tests: Per-Rule, Boundary, Winner, Contract, Golden-Set, Determinism

**Purpose:** Full unit test suite for both scorers. No DB, no external dependencies.

**Test file:** `tests/unit/classification/story-042-eq-bs-scorer.test.ts`

**Test groups (EQ scorer):**

**(a) EQ per-rule tests:**
- `fcf_conversion=0.90` → scores.A includes EQ_FCF_STRONG (3)
- `fcf_conversion=0.65` → scores.B includes EQ_FCF_MODERATE (2)
- `fcf_conversion=0.40` → scores.C includes EQ_FCF_WEAK (2)
- `fcf_positive=false` → scores.C includes EQ_FCF_WEAK (2), reason code `fcf_not_positive`
- `moat_strength_score=4.5` → scores.A includes EQ_MOAT_STRONG (2)
- `moat_strength_score=3.0` → scores.B includes EQ_MOAT_MODERATE (1)
- `moat_strength_score=2.0` → scores.C includes EQ_MOAT_WEAK (1)
- `net_income_positive=true` → scores.A and scores.B each +EQ_NI_POSITIVE (1)

**(b) EQ winner tests:**
- EQ-A winner: `fcf_conversion=1.43, moat_strength_score=5.0, net_income_positive=true` → winner='A'
- EQ-B winner: `fcf_conversion=0.65, moat_strength_score=3.0` → winner='B'
- EQ-C winner: `fcf_conversion=0.40, moat_strength_score=2.0` → winner='C'

**(c) EQ boundary tests:**
- `fcf_conversion=0.80` → fires Moderate (scores.B += 2), NOT Strong (scores.A unchanged)
- `fcf_conversion=0.8001` → fires Strong (scores.A += 3), NOT Moderate
- `fcf_conversion=0.50` → fires Moderate (scores.B += 2), NOT Weak (scores.C unchanged)
- `fcf_conversion=0.4999` → fires Weak (scores.C += 2), NOT Moderate
- `moat_strength_score=4.0` → fires Strong (scores.A += 2), NOT Moderate
- `moat_strength_score=2.5` → fires Moderate (scores.B += 1), NOT Weak
- `moat_strength_score=2.4999` → fires Weak (scores.C += 1), NOT Moderate

**(d) EQ null and all-null tests:**
- All fields null → scores.A = scores.B = scores.C = 0, missing_field_count = 3, no exception
- `fcf_conversion=null` → FCF rules do not fire
- `moat_strength_score=null` → moat rules do not fire
- `fcf_positive=null` → fcf_not_positive rule does not fire
- `missing_field_count`: 0 when all 3 primary EQ fields present; 3 when all null

**(e) EQ contract tests:**
- scores keys are exactly 'A', 'B', 'C'
- all score values ≥ 0
- reason_codes is always array of non-empty strings
- winner is null when all scores 0; otherwise one of 'A', 'B', 'C'

**Test groups (BS scorer):**

**(f) BS per-rule tests:**
- `net_debt_to_ebitda=0.22` → scores.A includes BS_DEBT_LOW (3)
- `net_debt_to_ebitda=-1.46` → scores.A includes BS_DEBT_LOW (3) + BS_NET_CASH_BONUS (1) = 4
- `net_debt_to_ebitda=1.5` → scores.B includes BS_DEBT_MODERATE (2)
- `net_debt_to_ebitda=3.01` → scores.C includes BS_DEBT_HIGH (2)
- `interest_coverage=56.4` → scores.A includes BS_COVERAGE_STRONG (2)
- `interest_coverage=8.0` → scores.B includes BS_COVERAGE_MODERATE (1)
- `interest_coverage=4.5` → scores.C includes BS_COVERAGE_WEAK (2)
- `capital_intensity_score=4.5` → scores.C includes BS_CAPITAL_INTENSITY (1)

**(g) BS winner tests:**
- BS-A: `net_debt_to_ebitda=0.22, interest_coverage=56.4` → winner='A' (MSFT-like)
- BS-A (net cash): `net_debt_to_ebitda=-1.46, interest_coverage=16.43` → winner='A', scores.A=6
- BS-C: `net_debt_to_ebitda=3.01, interest_coverage=4.48` → winner='C' (UNH-like)

**(h) BS boundary tests:**
- `net_debt_to_ebitda=1.0` exactly → Moderate fires (scores.B += 2), Low does NOT (< 1.0 is false)
- `net_debt_to_ebitda=0.9999` → Low fires (scores.A += 3), Moderate does NOT
- `net_debt_to_ebitda=0.0` exactly → Low fires (3) + Net Cash Bonus fires (1) → A gets 4
- `net_debt_to_ebitda=2.5` exactly → Moderate fires (scores.B += 2), High does NOT
- `net_debt_to_ebitda=2.5001` → High fires (scores.C += 2), Moderate does NOT
- `interest_coverage=12.0` exactly → Moderate fires (scores.B += 1), Strong does NOT
- `interest_coverage=12.0001` → Strong fires (scores.A += 2), Moderate does NOT
- `interest_coverage=5.0` exactly → Moderate fires (scores.B += 1), Weak does NOT
- `interest_coverage=4.9999` → Weak fires (scores.C += 2), Moderate does NOT

**(i) BS null tests:**
- All fields null → scores.A = B = C = 0, missing_field_count = 2, no exception
- `net_debt_to_ebitda=null` → leverage rules do not fire
- `interest_coverage=null` → coverage rules do not fire
- `capital_intensity_score=null` → capital intensity rule does not fire

**(j) Golden-set regression (TASK-042-005 fixtures):**
- MSFT: EQ scores match MSFT_EQ_GOLDEN_SCORES; BS scores match MSFT_BS_GOLDEN_SCORES
- UNH: EQ scores match UNH_EQ_GOLDEN_SCORES; BS scores match UNH_BS_GOLDEN_SCORES

**(k) Determinism:**
- 100 runs with MSFT-like fixture → identical output for EarningsQualityScorer
- 100 runs with UNH-like fixture → identical output for BalanceSheetQualityScorer

**Test naming:** `describe('EPIC-004/STORY-042/TASK-042-004: EQ and BS Scorers', ...)`

**Definition of Done:**
- [ ] `tests/unit/classification/story-042-eq-bs-scorer.test.ts` created with groups (a)–(k)
- [ ] All boundary conditions tested with exact values (0.80, 0.50, 4.0, 2.5, 1.0, 2.5, 5.0, 12.0)
- [ ] `missing_field_count` tested for both scorers: 3 for EQ, 2 for BS
- [ ] 100-run determinism tests passing for both scorers
- [ ] All new tests pass: `npx jest tests/unit/classification/`
- [ ] Existing 550 tests unaffected

---

### TASK-042-005 — Integration Tests, Golden-Set Fixture Capture, Tracking Update

**Purpose:** Verify both scorers against real test DB data. Capture and lock the golden-set score maps.

**Scope In:**

`tests/integration/classification/eq-bs-scorer.test.ts`:
- Read MSFT from test DB; convert fields (growth÷100, ratios as-is); assert EQ winner='A', BS winner='A', `scores[8]` invariant does not apply (EQ/BS have no bucket 8)
- Read UNH from test DB; assert BS winner='C' (net_debt=3.01, coverage=4.48)
- Each test isolated; no shared mutable state

`tests/unit/classification/fixtures/eq-bs-scorer-golden.ts`:
- Capture EQ and BS score maps for MSFT and UNH from real test DB inputs
- Lock as typed constants; regression tests assert exact equality

**Tracking update:**
- `docs/architecture/IMPLEMENTATION-LOG.md`: entry for STORY-042 complete
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md`: STORY-042 → `done`, STORY-043 → `ready`
- `stories/README.md`: STORY-042 → `done`
- Git commit: `[EPIC-004/STORY-042] Implement EQ and BS quality scorers with golden-set regression`

**Definition of Done:**
- [ ] `tests/integration/classification/eq-bs-scorer.test.ts` created and passing
- [ ] MSFT EQ-A winner asserted from test DB data
- [ ] UNH BS-C winner asserted from test DB data
- [ ] `tests/unit/classification/fixtures/eq-bs-scorer-golden.ts` created with MSFT and UNH constants
- [ ] Golden-set regression tests passing
- [ ] All tests: `npx jest tests/unit/classification/` → cumulative count ≥ 600 passing
- [ ] Implementation plan: STORY-042 → `done`, STORY-043 → `ready`
- [ ] `stories/README.md`: STORY-042 → `done`
- [ ] Implementation log entry for STORY-042 completion
- [ ] Git commit created with correct message format
