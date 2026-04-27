# STORY-104 — Operating Leverage Engine Service

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the Operating Leverage Engine as a standalone pure-function service that classifies a stock into one of five operating leverage states (`none`, `gradual`, `emerging_now`, `cyclical_rebound`, `deteriorating`) and returns the corresponding numeric contribution to `expected_normalized_eps_growth`. This is the most important modifying layer in the entire engine: `emerging_now` (+8%) is the strongest positive signal; `deteriorating` (−4%) is the strongest negative. Getting this state right is the difference between bucket 4 and bucket 6 for a genuine structural leverage inflection.

## Story
As the Earnings Path Engine,
I want an Operating Leverage Engine service that classifies operating leverage state from quarterly metrics,
so that structural leverage inflections are distinguished from cyclical rebounds and assigned the correct contribution.

## Outcome
`OperatingLeverageEngineService.compute(input)` returns the classified `OperatingLeverageState` enum value and the corresponding numeric `operatingLeverageContribution`. The `cyclical_rebound` rule only fires at `cycle_position = normal` (not elevated/peak) per the V2.1 amendment. All derived metrics are computed from the quarterly history input; no pre-computed metric is required from `StockDerivedMetrics`.

## Scope In
- Service: `src/domain/classification/engines/operating-leverage-engine.service.ts`
- Required derived metric computations (from quarterly history):
  - `opex_ttm_q = gross_profit_ttm_q − operating_income_ttm_q` (rolling)
  - `gross_profit_growth_hist_recent`: 8-quarter CAGR/OLS of rolling TTM gross profit
  - `opex_growth_hist_recent`: 8-quarter CAGR/OLS of rolling TTM opex
  - `gross_profit_minus_opex_growth_spread_recent`: GP growth − opex growth
  - `incremental_operating_margin`: `Δoperating_income_ttm / Δrevenue_ttm` (trailing 4Q)
  - `gross_profit_drop_through`: `Δoperating_income_ttm / Δgross_profit_ttm` (trailing 4Q)
  - `operating_margin_expansion`: `operating_margin_ttm_now − operating_margin_ttm_4Q_ago`
  - `fcf_conversion_trend`: sign of OLS slope of `fcf_conversion` over 6 most recent quarters
  - `operating_income_growth_hist_recent`: 8-quarter CAGR/OLS of rolling TTM operating income
- State classification in precedence order: `deteriorating` → `emerging_now` → `cyclical_rebound` → `gradual` → `none`
- `cyclical_rebound` requires **both** `opMarginExpansion >= 0.02` AND `gpMinusOpexSpreadRecent > 0` AND `cyclePosition === 'normal'` (V2.1 tightening)
- Numeric contributions per state (from ADR-019): none=0, gradual=+3%, emerging_now=+8%, cyclical_rebound=+2%, deteriorating=−4%
- Output includes all derived metric values for audit/scoring Json

## Scope Out
- Not responsible for the cyclical peak penalty (STORY-105)
- Not responsible for DB writes
- Not responsible for interpreting `structural_cyclicality_score` for bucket purposes (that is STORY-105)
- `gradual` state persistence requirement ("persisted ≥ 3 consecutive quarters"): defer to V2 if not already detectable from the quarterly series passed in; for V1, fire `gradual` if current window meets criteria regardless of history

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §9 (Operating Leverage State Engine)
- ADR: ADR-019 (Operating Leverage State Engine — full state definitions)
- Framework: V2.1 §3.4 (including cyclical_rebound tightening amendment)
- Upstream: STORY-100 (enum type); STORY-102, STORY-103 not required at runtime (independent inputs)

## Preconditions
- `StockQuarterlyHistory` has `gross_profit`, `operating_income`, `revenue`, `free_cash_flow` per quarter
- `cycle_position` is available on the Stock row (from EPIC-008 CyclicalScoreService)
- `structural_cyclicality_score` is available (from EPIC-008)

## Inputs
```typescript
interface OperatingLeverageEngineInput {
  // Quarterly history series (ascending chronological)
  grossProfitSeries: (number | null)[];
  operatingIncomeSeries: (number | null)[];
  revenueSeries: (number | null)[];
  fcfConversionSeries: (number | null)[];  // 6 most recent quarters
  // From EPIC-008
  structuralCyclicalityScore: number;    // 0–3
  cyclePosition: string;                 // normal | elevated | peak | depressed | insufficient_data
  // From revenue engine (for op income > revenue growth check)
  normalizedRevenueGrowth: number;
}
```

## Outputs
```typescript
interface OperatingLeverageEngineResult {
  operatingLeverageState: OperatingLeverageState;  // enum
  operatingLeverageContribution: number;
  // Derived metrics for audit
  opMarginExpansion: number | null;
  incrementalOpMargin: number | null;
  gpMinusOpexSpreadRecent: number | null;
  grossProfitDropThrough: number | null;
  opIncomeGrowthRecent: number | null;
  fcfConversionTrend: number | null;  // sign: positive = improving
}
```

## Acceptance Criteria
- [ ] `emerging_now` fires when ALL 6 conditions hold (margin expansion ≥ 6pp, incremental OM ≥ 0.35, GP-opex spread ≥ 8%, op income > revenue growth, FCF trend positive, cyclicality score < 2)
- [ ] `cyclical_rebound` fires when cyclicality ≥ 2 AND `cycle_position = 'normal'` AND BOTH margin conditions met (not just one)
- [ ] `cyclical_rebound` does NOT fire when `cycle_position = 'elevated'` or `'peak'`
- [ ] `deteriorating` fires on any single negative trigger (margin ≤ −2pp, opex > GP spread, incremental OM < 0)
- [ ] `deteriorating` takes precedence over all other states
- [ ] `emerging_now` check is bypassed when cyclicality ≥ 2 (routes to `cyclical_rebound` instead)
- [ ] `gradual` fires on modest but real margin improvement (2–6pp expansion, incremental OM 0.15–0.35)
- [ ] `none` is the default when no other state fires
- [ ] Numeric contributions exactly match ADR-019: 0/+3%/+8%/+2%/−4%
- [ ] Unit test coverage ≥ 80%

## Test Strategy Expectations
- Unit tests (`tests/unit/classification/engines/operating-leverage-engine.service.test.ts`):
  - `emerging_now`: all 6 conditions met, cyclicality < 2 → state + +8% contribution
  - `emerging_now` → `cyclical_rebound` deflection: same 6 conditions but cyclicality = 2
  - `cyclical_rebound` (V2.1 tightened): cyclicality ≥ 2, cycle_position = 'normal', both margin conditions → state + +2%
  - `cyclical_rebound` does NOT fire at cycle_position = 'elevated' → falls to `gradual` or `none`
  - `deteriorating`: margin compression ≥ 2pp → −4%, takes precedence over `emerging_now` metrics
  - `gradual`: modest improvement meeting 2–6pp and 0.15–0.35 incremental → +3%
  - `none`: flat margins → 0 contribution
  - Uber-like scenario: high margin expansion + emerging leverage + low cyclicality → `emerging_now`
  - Ford-like scenario: normal cycle, cyclicality = 3, moderate margin improvement → `cyclical_rebound`
- Integration tests: N/A (pure function)
- Contract tests: enum output matches OperatingLeverageState Prisma enum
- BDD:
  - `Given` op margin expanded 8pp and incremental OM = 0.40 and GP-opex spread = 9% and op income faster than revenue and FCF trend improving and cyclicality score = 1; `When` OL engine runs; `Then` state = `emerging_now` and contribution = +0.08
  - `Given` same metrics but cycle_position = 'elevated' and cyclicality = 2; `When` OL engine runs; `Then` state = `cyclical_rebound` and contribution = +0.02
- E2E: N/A

## Regression / Invariant Risks
- `cyclical_rebound` tightening (V2.1 amendment) must be correctly implemented — the pseudocode in V2.0 was broader; V2.1 requires `cycle_position === 'normal'` AND both margin conditions (not OR)
- `emerging_now` +8% is the maximum positive contribution — no code path should produce a larger positive modifier before the qualitative modifier (which is capped at +2%)
- `deteriorating` must dominate — no other state should override it once it fires

## Key Risks / Edge Cases
- Very new companies with 4 quarters only: insufficient data for 8Q CAGR → return `none` with reason code
- Cyclical at depressed cycle: `cyclical_rebound` does NOT fire (cycle_position not 'normal' at this point); likely `none` or `gradual` if margins are improving from very low base
- Company with negative gross profit: `opex` derived as `gross_profit − operating_income` would be undefined — return `none` with data gap reason code

## Definition of Done
- [ ] Service implemented at `src/domain/classification/engines/operating-leverage-engine.service.ts`
- [ ] Unit tests passing, ≥ 80% coverage
- [ ] `cyclical_rebound` tightening (V2.1) explicitly tested
- [ ] All existing classifier tests still passing
- [ ] Implementation log updated
- [ ] Traceability comments in file

## Traceability
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md` §Inputs (operating_leverage_state)
- RFC: RFC-009 §9
- ADR: ADR-019 (Operating Leverage State Engine)
- Framework: V2.1 §3.4 (including cyclical_rebound tightening)
