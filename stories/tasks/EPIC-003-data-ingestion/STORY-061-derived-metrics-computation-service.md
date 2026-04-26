# STORY-061 — Derived Metrics Computation Service (Per-Quarter Margins & TTM Rollups)

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Implement the derived metrics computation service that reads raw quarterly rows from `stock_quarterly_history` and computes per-quarter margin fields (already written inline by STORY-060 during upsert) plus TTM rollups (summing the 4 most recent quarters) and fiscal-year rollups. Writes the TTM and aggregated fields into `stock_derived_metrics`.

## Story
As the **data pipeline**,
I want **a derived metrics computation service that produces TTM rollups and fiscal-year aggregates from the most recent quarters in `stock_quarterly_history`**,
so that **`stock_derived_metrics` holds ready-to-use aggregate fields for the classification scorers without requiring them to query raw quarterly rows**.

## Outcome
- `computeDerivedMetrics(ticker, opts?)` service in `src/modules/data-ingestion/jobs/derived-metrics-computation.service.ts`
- Reads latest N quarters from `stock_quarterly_history` for ticker (ordered by fiscal_year DESC, fiscal_quarter DESC)
- Computes TTM values: sums 4 most recent quarters for each raw financial field (revenue_ttm, gross_profit_ttm, operating_income_ttm, net_income_ttm, capex_ttm, cash_from_operations_ttm, free_cash_flow_ttm, share_based_compensation_ttm, depreciation_and_amortization_ttm)
- Computes TTM-level margin ratios from TTM sums (gross_margin_ttm, operating_margin_ttm, net_margin_ttm, fcf_margin_ttm, sbc_as_pct_revenue_ttm, cfo_to_net_income_ratio_ttm) — NULL when TTM revenue is null or zero
- Records `quarters_available` (total number of rows returned for ticker)
- Upserts one `stock_derived_metrics` row per ticker; sets `derived_as_of = NOW()`
- Returns `{ ticker, quarters_available, ttm_computed: boolean }`
- Structured logging: `derived_metrics_computed` event with `{ ticker, quarters_available }`
- Batch variant: `computeDerivedMetricsBatch(tickers[], opts?)` iterates over list with per-ticker error isolation

## Scope In
- `src/modules/data-ingestion/jobs/derived-metrics-computation.service.ts`
- TTM field computation from latest 4 quarters (skip NULL fields — do not coerce to 0)
- TTM ratio computation: NULL if denominator is null or zero
- Upsert to `stock_derived_metrics` using Prisma `upsert` on ticker PK
- `derived_as_of` set to `NOW()` on each upsert
- `quarters_available` count written
- Per-ticker error isolation in batch variant

## Scope Out
- Trend/trajectory metrics (slopes, stability scores, flags) — STORY-062
- Change detection / earnings-trigger logic — STORY-060 (already handled upstream)
- Cron route — STORY-063
- Inline per-quarter margin derivation — already done in STORY-060 sync upsert

## Dependencies
- **Epic:** EPIC-003
- **RFCs:** RFC-008 §Classifier-Facing Derived Fields
- **ADRs:** ADR-015 §Schema (`stock_derived_metrics`)
- **Upstream:** STORY-057 (`stock_quarterly_history`), STORY-058 (`stock_derived_metrics`), STORY-060 (sync service that triggers this)

## Preconditions
- `stock_quarterly_history` rows exist (written by STORY-060)
- `stock_derived_metrics` table exists (STORY-058)
- Prisma client includes `StockDerivedMetrics` model

## Inputs
- `ticker: string` — target stock
- Rows from `stock_quarterly_history` for ticker (all quarters, ordered newest-first)

## Outputs
- `stock_derived_metrics` row upserted with TTM fields and `derived_as_of = NOW()`
- `{ ticker, quarters_available, ttm_computed: boolean }`

## Acceptance Criteria
- [ ] TTM values computed by summing 4 most recent quarters; NULL field in any quarter skips that field (sum of non-null only, or NULL if all 4 are null)
- [ ] TTM margin ratios: NULL when revenue_ttm is null or zero
- [ ] `quarters_available` reflects actual count of stored rows for ticker
- [ ] `derived_as_of` is written to `NOW()` on every upsert
- [ ] `ttm_computed = false` when fewer than 4 quarters available; TTM fields written as NULL
- [ ] Batch variant: one ticker error does not halt the batch
- [ ] Unit tests: normal TTM sum; partial NULLs; <4 quarters; zero-revenue TTM margin; batch error isolation

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-008 §Classifier-Facing Derived Fields (TTM rollup fields)
- ADR: ADR-015 §Schema (`stock_derived_metrics`)
