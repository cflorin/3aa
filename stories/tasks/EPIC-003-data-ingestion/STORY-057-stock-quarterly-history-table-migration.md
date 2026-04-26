# STORY-057 — `stock_quarterly_history` Table Migration

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Create the `stock_quarterly_history` table that stores raw per-quarter financial data for each in-universe stock. This is the foundational storage layer for the quarterly history capability defined in RFC-008 and ADR-015.

## Story
As the **data pipeline**,
I want **a `stock_quarterly_history` table that stores one row per stock per fiscal quarter** with raw financial fields and per-quarter derived margins,
so that **downstream derived metric computation and trend analysis have a structured, queryable source of truth**.

## Outcome
- `stock_quarterly_history` table created via Prisma migration; FK to `stocks` on ticker
- Unique constraint on `(ticker, fiscal_year, fiscal_quarter, source_provider)` prevents duplicate rows
- All raw financial fields (revenue, gross_profit, operating_income, net_income, capex, cash_from_operations, free_cash_flow, share_based_compensation, depreciation_and_amortization, diluted_shares_outstanding) nullable — NULL means DataCode absent, not zero
- Per-quarter derived margin columns (gross_margin, operating_margin, net_margin, cfo_to_net_income_ratio, etc.) nullable
- Period metadata columns: fiscal_year, fiscal_quarter, fiscal_period_end_date, reported_date, calendar_year, calendar_quarter, source_provider, source_statement_type, synced_at
- Index on `(ticker, fiscal_year DESC, fiscal_quarter DESC)` for efficient per-stock retrieval

## Scope In
- Prisma schema update: new `StockQuarterlyHistory` model per ADR-015 schema
- Migration file: `prisma/migrations/NNNN_add_stock_quarterly_history/migration.sql`
- Table shape per ADR-015 §Schema: `stock_quarterly_history`
- Index: `idx_sqh_ticker_period` on `(ticker, fiscal_year DESC, fiscal_quarter DESC)`
- All raw and derived columns nullable (no NOT NULL constraints on financial fields)

## Scope Out
- `stock_derived_metrics` table (STORY-058)
- Populating the table (STORY-060)
- Derived metric computation (STORY-061, STORY-062)

## Dependencies
- **Epic:** EPIC-003
- **RFCs:** RFC-008 §Data Collected, RFC-002 Amendment 2026-04-25
- **ADRs:** ADR-015 §Schema (`stock_quarterly_history`)
- **Upstream:** STORY-004 (Prisma schema + migrations pattern established), `stocks` table exists

## Preconditions
- `stocks` table exists with `ticker` as primary key
- Prisma migration tooling configured (EPIC-001)

## Inputs
- ADR-015 schema specification
- Existing Prisma schema conventions (camelCase model fields, snake_case DB columns)

## Outputs
- New Prisma model `StockQuarterlyHistory`
- Migration file applied
- All existing tests remain passing (schema addition, no breaking changes)

## Acceptance Criteria
- [ ] `stock_quarterly_history` table created in database with correct schema
- [ ] All financial fields are nullable (NULL ≠ zero)
- [ ] Unique constraint on `(ticker, fiscal_year, fiscal_quarter, source_provider)` enforced
- [ ] FK to `stocks(ticker)` with CASCADE DELETE
- [ ] Index `idx_sqh_ticker_period` created
- [ ] `synced_at` column present (captures time of our sync, not provider timestamp)
- [ ] Prisma client regenerated; no TypeScript errors
- [ ] All existing 869 tests continue to pass

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-008 §Data Collected, RFC-002 Amendment 2026-04-25
- ADR: ADR-015 §Schema, ADR-015 §Rationale
