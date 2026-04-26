# STORY-062 — Trend & Trajectory Metrics Computation Service

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Implement the trend and trajectory metrics computation service that reads per-quarter margin rows from `stock_quarterly_history` and produces the slope-based, stability-based, flag-based, and composite metrics written into `stock_derived_metrics`. This is the second computation stage, running after STORY-061 has written TTM rollups.

## Story
As the **data pipeline**,
I want **a trend metrics computation service that derives margin trajectory slopes, stability scores, operating leverage flags, earnings quality trend scores, and dilution/SBC metrics from the quarterly history series**,
so that **classification scorers receive pre-computed trend context without querying raw quarterly rows at classification time**.

## Outcome
- `computeTrendMetrics(ticker, opts?)` service in `src/modules/data-ingestion/jobs/trend-metrics-computation.service.ts`
- Reads per-quarter margin fields from `stock_quarterly_history` (ordered newest-first); uses up to 12 quarters
- Computes 4-quarter and 8-quarter margin slope estimates (gross_margin_slope_4q, operating_margin_slope_4q, net_margin_slope_4q, gross_margin_slope_8q, operating_margin_slope_8q, net_margin_slope_8q) — expressed in percentage-point change per quarter; NULL when insufficient quarters
- Computes stability scores (operating_margin_stability_score, gross_margin_stability_score, net_margin_stability_score) as normalized inverse-dispersion over up to 8 quarters; 0.0 = highly unstable, 1.0 = perfectly stable; NULL when fewer than 4 quarters
- Computes operating leverage fields: operating_leverage_ratio (OpInc growth / revenue growth over 4 quarters), operating_income_acceleration_flag (true when 4q OpInc growth rate accelerating vs prior 4q), operating_leverage_emerging_flag (positive but sub-threshold OpLev ratio)
- Computes earnings quality trend score (earnings_quality_trend_score, range −1.0 to +1.0): composite of CFO/NI trend, accruals trend, FCF trend; NULL when insufficient quarters
- Computes cash conversion flag: deteriorating_cash_conversion_flag when CFO/NI ratio trending down across 4 quarters with net income positive
- Computes dilution metrics: diluted_shares_outstanding_change_4q (% change), diluted_shares_outstanding_change_8q (% change), material_dilution_trend_flag (true when >3% dilution over 4q)
- Computes SBC metrics: sbc_burden_score (SBC/revenue normalized 0.0–1.0 over 8 quarters)
- Computes capital intensity metrics: capex_to_revenue_ratio_avg_4q, capex_intensity_increasing_flag
- Updates `stock_derived_metrics` row (upsert); sets `derived_as_of = NOW()`
- Returns `{ ticker, slopes_computed, stability_computed, flags_computed }`
- Structured logging: `trend_metrics_computed` event

## Scope In
- `src/modules/data-ingestion/jobs/trend-metrics-computation.service.ts`
- Slope computation using simple linear regression (OLS) over ordered quarterly data points
- Stability score: coefficient of variation inverted and normalized to [0, 1]
- All derived fields written as NULL when insufficient data (no fabricated values)
- Upsert to `stock_derived_metrics` — merges trend fields alongside TTM fields already written by STORY-061
- `derived_as_of` refreshed on this upsert
- Batch variant: `computeTrendMetricsBatch(tickers[], opts?)` with per-ticker error isolation

## Scope Out
- TTM rollup fields — STORY-061
- Inline per-quarter margins — STORY-060
- Using these metrics in scorers — STORY-066, STORY-067, STORY-068, STORY-069
- ADR-014 confidence trajectory penalty — applied at classification time in STORY-069

## Dependencies
- **Epic:** EPIC-003
- **RFCs:** RFC-008 §Derived Metrics Computation, §Classifier-Facing Derived Fields
- **ADRs:** ADR-015 §Schema (`stock_derived_metrics`), ADR-016 §Derived Metrics Recompute Trigger
- **Upstream:** STORY-057 (`stock_quarterly_history`), STORY-058 (`stock_derived_metrics`), STORY-061 (TTM fields already written)

## Preconditions
- `stock_quarterly_history` rows present for ticker with per-quarter margin fields
- `stock_derived_metrics` row exists (written by STORY-061) or upsert will create it
- Prisma client includes `StockDerivedMetrics` model with all trend fields

## Inputs
- `ticker: string`
- Per-quarter rows from `stock_quarterly_history` with margin fields (gross_margin, operating_margin, net_margin, cfo_to_net_income_ratio, etc.)
- Raw financial fields (for dilution, SBC, capex computations)

## Outputs
- `stock_derived_metrics` row updated with all trend/trajectory fields
- `derived_as_of = NOW()`
- `{ ticker, slopes_computed: boolean, stability_computed: boolean, flags_computed: boolean }`

## Acceptance Criteria
- [ ] 4-quarter slope requires ≥ 4 non-null data points; returns NULL otherwise
- [ ] 8-quarter slope requires ≥ 8 non-null data points; returns NULL otherwise
- [ ] Stability score is 0.0–1.0; NULL when fewer than 4 quarters
- [ ] `earnings_quality_trend_score` is −1.0 to +1.0; NULL when insufficient quarters
- [ ] `material_dilution_trend_flag` = true when diluted shares grew >3% over 4 quarters
- [ ] `deteriorating_cash_conversion_flag` = true only when NI > 0 and CFO/NI ratio declining over 4 quarters
- [ ] `operating_income_acceleration_flag` = true when 4q OpInc CAGR is higher than prior-4q OpInc CAGR
- [ ] NULL denominator or insufficient data → NULL flag (no guessing)
- [ ] `derived_as_of` updated on every upsert
- [ ] Batch error isolation: one ticker exception does not halt the batch
- [ ] Unit tests: slope with 4q / 8q / insufficient data; stability score edge cases; dilution flag boundary (3% threshold); deteriorating cash conversion flag; EQ trend score sign cases

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-008 §Derived Metrics Computation, §Classifier-Facing Derived Fields
- ADR: ADR-015 §Schema, ADR-016 §Derived Metrics Recompute Trigger
