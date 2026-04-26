# STORY-060 — Quarterly History Sync Service

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Implement the quarterly history sync service that detects when new quarterly earnings data has arrived for a stock and upserts raw rows into `stock_quarterly_history`. Implements the earnings-triggered detection logic defined in ADR-016: compare the `reported_date` of Tiingo's most recent quarter against the most recent stored row; only upsert when new data is present.

## Story
As the **data pipeline**,
I want **a quarterly history sync service that detects newly posted quarters and upserts raw financial rows into `stock_quarterly_history`**,
so that **the derived metrics computation step has current, accurate source data for every in-universe stock**.

## Outcome
- `syncQuarterlyHistory(opts?)` job service in `src/modules/data-ingestion/jobs/quarterly-history-sync.service.ts`
- Per in-universe stock: calls `TiingoAdapter.fetchQuarterlyStatements(ticker)`; compares `reported_date` of the most recent returned quarter against the most recent stored row in `stock_quarterly_history`
- If new quarter detected (reported_date newer, or no stored rows): upserts all returned quarters using the Prisma `upsert` pattern (unique key: ticker + fiscal_year + fiscal_quarter + source_provider)
- All 10 raw financial fields written per quarter row; NULL stored when Tiingo DataCode is absent (not zero)
- Per-quarter derived margins computed inline and written alongside raw fields (gross_margin, operating_margin, net_margin, cfo_to_net_income_ratio, fcf_margin, sbc_as_pct_revenue, dilution_yoy where derivable)
- Returns summary: `{ stocks_processed, stocks_updated, quarters_upserted, stocks_skipped, errors, duration_ms }`
- Structured logging per stock (`quarterly_history_sync_updated`, `quarterly_history_sync_skipped`, `quarterly_history_sync_error`)
- Weekly full scan mode (`opts?.forceFullScan = true`): bypasses change-detection comparison, upserts all returned quarters for all stocks unconditionally (Sunday backstop per ADR-016)

## Scope In
- `src/modules/data-ingestion/jobs/quarterly-history-sync.service.ts` — `syncQuarterlyHistory()`
- Earnings-triggered detection: query most recent `reported_date` from `stock_quarterly_history` for ticker; compare against Tiingo response
- Upsert pattern: `prisma.stockQuarterlyHistory.upsert` on `(ticker, fiscal_year, fiscal_quarter, source_provider)` unique key
- Inline per-quarter derived margin computation (simple arithmetic; NULL denominator → NULL margin)
- `forceFullScan` option for Sunday backstop
- Error isolation: per-stock try/catch; errors do not halt the batch; errors count incremented
- Provenance: `source_provider = 'tiingo'`, `source_statement_type = 'quarterly_statements'`, `synced_at = NOW()`

## Scope Out
- Derived trend/trajectory metrics computation (STORY-061, STORY-062) — runs separately after this stage
- Cron job and route (STORY-063)
- `shouldRecompute` trigger (handled by comparing `stock_derived_metrics.derived_as_of` vs `classification_state.classification_last_updated_at` — no flag column needed)

## Dependencies
- **Epic:** EPIC-003
- **RFCs:** RFC-008 §Ingestion Sync Architecture, RFC-004 Amendment 2026-04-25
- **ADRs:** ADR-016 §Primary Trigger (earnings detection), ADR-015 §Schema
- **Upstream:** STORY-057 (`stock_quarterly_history` table), STORY-059 (`fetchQuarterlyStatements`)

## Preconditions
- `stock_quarterly_history` table exists (STORY-057)
- `TiingoAdapter.fetchQuarterlyStatements` implemented (STORY-059)
- `stocks` table has in-universe stocks

## Inputs
- `opts?: { tickerFilter?: string; forceFullScan?: boolean }` — ticker filter for ad-hoc runs; forceFullScan for Sunday backstop
- In-universe tickers from `stocks` table
- `QuarterlyReport[]` from `TiingoAdapter.fetchQuarterlyStatements`

## Outputs
- `stock_quarterly_history` rows upserted for changed stocks
- `{ stocks_processed, stocks_updated, quarters_upserted, stocks_skipped, errors, duration_ms }`
- Structured logs per stock

## Acceptance Criteria
- [ ] Service processes only `in_universe = TRUE` stocks
- [ ] Change detection: stock skipped when Tiingo's most recent `reported_date` matches stored most recent `reported_date`
- [ ] Full upsert triggered when new `reported_date` detected or no stored rows exist
- [ ] All 10 required raw fields written (NULL stored for absent DataCodes, not zero)
- [ ] Per-quarter margin derivatives computed inline where denominator is non-null and non-zero
- [ ] NULL denominator or absent DataCode yields NULL margin (no fabricated values)
- [ ] `source_provider = 'tiingo'`, `synced_at` written for each upserted row
- [ ] `forceFullScan = true` bypasses change detection and upserts all quarters
- [ ] Per-stock error isolation: one stock failure does not halt the batch
- [ ] Returns summary object with all 6 fields
- [ ] Unit tests cover: new quarter detected → upsert; unchanged → skip; null response → skip; forceFullScan → always upsert; margin derivation with null denominator → null margin

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-008 §Ingestion Sync Architecture, RFC-004 Amendment 2026-04-25
- ADR: ADR-016 §Primary Trigger, ADR-015 §Schema, ADR-001 Amendment 2026-04-25
