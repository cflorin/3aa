# STORY-096 — EPIC-008 Regression & Integration Tests

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Comprehensive validation of EPIC-008: golden-set BDD scenarios verifying the full pipeline from regime selection through threshold computation; regression against the EPIC-005 baseline to confirm non-cyclical non-bank stocks are unaffected; schema contract tests for new DB fields; and end-to-end pipeline smoke tests.

## Story
As a developer,
I want a comprehensive test suite that validates all EPIC-008 logic paths and confirms no regression in prior epics,
so that EPIC-008 can be safely shipped with confidence.

## Outcome
All tests in this story pass. Combined with prior epic test suites (1568+ tests), total test count increases to cover all new service paths. No test from EPIC-005 or earlier regresses.

## Scope In

### Golden-set BDD scenarios

Five canonical stock profiles validated end-to-end (regime → growth tier → cyclical overlay → final thresholds):

**NVDA-like (Scenario A): profitable_growth_pe, high tier, score=2, normal cycle, A/A**
```
Given: op_margin=0.65, rev_growth_fwd=0.70, fcf_conversion=0.81, score=2, position=normal, EQ=A, BS=A
Then: regime = profitable_growth_pe
And: growth_tier = high
And: base = 36/30/24/18
And: quality_downgrade = 0 (A/A)
And: cyclical_overlay = -4.0 (score=2, normal)
And: final_thresholds = 32/26/20/14
```

**NVDA-like elevated (Scenario B): same but position=elevated**
```
Given: (same as A but cycle_position=elevated)
Then: cyclical_overlay = -6.0 (score=2, elevated)
And: final_thresholds = 30/24/18/12
```

**WMT-like (Scenario C): mature_pe, A/A**
```
Given: op_margin=0.0447, rev_growth_fwd=0.05, net_income_positive, fcf_positive, score=0, EQ=A, BS=A
Then: regime = mature_pe
And: growth_tier = null
And: base = 22/20/18/16
And: cyclical_overlay = 0
And: final_thresholds = 22/20/18/16
```

**MU-like elevated (Scenario D): cyclical_earnings, A/A, elevated**
```
Given: op_margin=0.20, rev_growth_fwd=0.10, fcf_conversion=0.40, cyclicality_score=2, position=elevated, EQ=A, BS=A
Then: regime = cyclical_earnings (fcf_conversion < 0.60 bars Step 2; score≥1 fires Step 3)
And: base = 16/13/10/7
And: cyclical_overlay = -2.0 (Case B, elevated)
And: final_thresholds = 14/11/8/5
```

**JPM-like (Scenario E): manual_required via bank_flag**
```
Given: bank_flag=true, any other financials
Then: regime = manual_required
And: thresholds = null
And: valuation_state_status = manual_required
And: NO threshold computation runs
```

### Regression suite: EPIC-005 baseline preservation

For a basket of non-cyclical, non-bank stocks with `structural_cyclicality_score=0`:
- Run the EPIC-008 pipeline
- Assert `valuation_regime` is set appropriately
- Assert thresholds equal EPIC-005 output (same anchor values, same quality adjustments, no cyclical overlay)
- Confirm: WMT → `mature_pe`, same thresholds as EPIC-005 computed; MSFT (if profitable, low-growth) → same

Key invariant: **for any stock with `structural_cyclicality_score=0` and no special flags, EPIC-008 thresholds must equal EPIC-005 thresholds** for the regime that corresponds to the EPIC-005 bucket-based selection. Document any intentional divergence.

### Schema contract tests
- `valuation_state`: all 8 new columns present; `valuation_regime` accepts all 9 values; `cycle_position` accepts all 5 values; `valuation_state_status` default is 'computed'
- `stock`: `bank_flag` column exists and defaults false; `structural_cyclicality_score` nullable int; `cycle_position` nullable varchar
- `valuation_regime_thresholds`: 9 rows present; numeric values match spec; `financial_special_case` row has null thresholds

### Conservative bias regression tests

Specifically testing that the cycle position algorithm cannot be tricked into returning `elevated` or `peak` on thin evidence:
- Margin elevated by exactly 14% (< 1.15 threshold): → `normal` (not elevated)
- Margin elevated by 16% but revenue NOT trending above midpoint: → `normal` (not elevated)
- Margin elevated by 26% AND revenue at history high: → `peak`
- Only revenue at peak but margin normal: → `normal`
- < 8 quarters with elevated-looking last 4Q: → `insufficient_data`

### End-to-end pipeline smoke test
Run full pipeline sequence against test DB:
1. `CyclicalScoreService.computeAndPersist(['TEST_SEMI', 'TEST_STABLE'])`
2. `runValuationBatch(['TEST_SEMI', 'TEST_STABLE'])`
3. Assert: `TEST_SEMI.valuation_regime` set; `TEST_SEMI.threshold_family` non-null; `TEST_SEMI.cyclical_overlay_applied` set
4. Assert: `TEST_STABLE.valuation_regime` set; no cyclical overlay applied

### All prior epic tests must pass
Run full test suite: assert ≥ 1568 tests from EPIC-001–005 pass unchanged.

## Scope Out
- Performance benchmarks — post-V1
- Load testing the regime selector — post-V1
- Snapshot testing UI components — STORY-095 handles visual checks

## Dependencies
- STORY-091–094 ✅ (all domain + pipeline complete)
- STORY-095 ✅ (UI — only needed for smoke tests involving the valuation tab)
- EPIC-005 test suite ✅ (baseline reference)

## Tasks

### TASK-096-001: Golden-set BDD tests — Scenarios A + B (NVDA-like)
- File: `tests/unit/domain/valuation/epic-008-golden-set.test.ts`
- `describe('Scenario A: NVDA-like profitable_growth_pe high tier normal cycle A/A')`
- `describe('Scenario B: NVDA-like elevated cycle')`
- Pure domain function calls: `selectRegime()` + regime-driven `ThresholdAssigner`
- Assert exact threshold values

### TASK-096-002: Golden-set BDD tests — Scenarios C + D + E
- Same file
- `describe('Scenario C: WMT-like mature_pe')`
- `describe('Scenario D: MU-like cyclical_earnings elevated')`
- `describe('Scenario E: JPM-like manual_required bank_flag')`

### TASK-096-003: Regression tests — EPIC-005 baseline preservation
- File: `tests/unit/domain/valuation/epic-008-regression.test.ts`
- Build 6 non-cyclical non-bank stock inputs matching the 6 core EPIC-005 anchor codes
- Run EPIC-008 pipeline; compare thresholds to EPIC-005 expected values
- Assert: score=0, no special flags → thresholds within tolerance of EPIC-005 output

### TASK-096-004: Conservative bias tests — cycle position
- File: `tests/unit/domain/valuation/cycle-position-bias.test.ts`
- 5 test cases listed above
- `it('never returns elevated with only margin signal, no revenue signal')`
- `it('never returns peak without both conditions crossing thresholds simultaneously')`

### TASK-096-005: Schema contract tests
- File: `tests/integration/schema/epic-008-schema.test.ts`
- Assert 8 new `valuation_state` columns exist via Prisma introspect or raw query
- Assert 3 new `stock` columns exist
- Assert `valuation_regime_thresholds` has 9 rows with correct values
- Assert `mature_pe` row: max=22, steal=16; `profitable_growth_pe` row: max=36, steal=18

### TASK-096-006: End-to-end pipeline smoke test
- File: `tests/integration/pipeline/epic-008-e2e.test.ts`
- Setup: seed `TEST_SEMI` and `TEST_STABLE` with known financial characteristics
- Run CyclicalScoreService + runValuationBatch
- Assert DB state after run (regime, threshold_family, cyclical_overlay_applied, valuation_state_status)

### TASK-096-007: Full regression run
- Run entire test suite: `npm test` or equivalent
- Assert ≥ 1568 prior tests still pass
- Document final test count in implementation log

## Acceptance Criteria
- [ ] Scenario A: final_thresholds = 32/26/20/14 ✓
- [ ] Scenario B: final_thresholds = 30/24/18/12 ✓
- [ ] Scenario C: final_thresholds = 22/20/18/16 ✓
- [ ] Scenario D: final_thresholds = 14/11/8/5 ✓
- [ ] Scenario E: thresholds = null, status = manual_required ✓
- [ ] Conservative bias: 0 tests in which elevated/peak fires without both conditions ✓
- [ ] Schema: all 3+8+9 items present and correct ✓
- [ ] Regression: ≥ 1568 prior tests pass ✓
- [ ] Full test suite passes with 0 failures

## Test Strategy
- Unit tests (TASK-096-001–004): pure functions only, no DB
- Integration tests (TASK-096-005–006): test DB, isolated transactions, cleaned up post-test
- Final regression (TASK-096-007): full `npm test` run; record final count in implementation log
