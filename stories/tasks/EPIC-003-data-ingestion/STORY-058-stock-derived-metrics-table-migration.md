# STORY-058 — `stock_derived_metrics` Table Migration

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Create the `stock_derived_metrics` table that stores one computed row per ticker — the classifier-facing derived fields produced by the quarterly history computation pipeline. This is the publication layer that EPIC-004 scorers consume via `toClassificationInput()`.

## Story
As the **classification engine**,
I want **a `stock_derived_metrics` table with one row per stock containing all trend/trajectory fields derived from quarterly history**,
so that **classification scorers can access trend context without querying raw quarter rows directly**.

## Outcome
- `stock_derived_metrics` table created via Prisma migration; ticker is primary key (FK to `stocks`)
- All ~40 classifier-facing derived fields present as nullable columns: margin trajectory slopes, stability scores, operating leverage ratios and flags, earnings quality trend score and flags, dilution/SBC metrics, capital intensity metrics, TTM rollups from quarterly history
- `quarters_available` integer column tracks how many quarters underlie the current derivation
- `derived_as_of` timestamp column: the key field used by `shouldRecompute` to detect whether quarterly data is newer than the last classification run
- `provenance` JSONB column for per-field audit trail

## Scope In
- Prisma schema update: new `StockDerivedMetrics` model per ADR-015 schema
- Migration file: `prisma/migrations/NNNN_add_stock_derived_metrics/migration.sql`
- Table shape per ADR-015 §Schema: `stock_derived_metrics`
- `derived_as_of TIMESTAMPTZ NOT NULL DEFAULT NOW()` — updated each time derivation runs
- `quarters_available INTEGER NOT NULL DEFAULT 0`
- All derived trend fields nullable
- `provenance JSONB NOT NULL DEFAULT '{}'`

## Scope Out
- `stock_quarterly_history` table (STORY-057)
- Populating the table (STORY-061, STORY-062)
- `toClassificationInput()` extension (STORY-065)

## Dependencies
- **Epic:** EPIC-003
- **RFCs:** RFC-008 §Classifier-Facing Derived Fields, RFC-002 Amendment 2026-04-25
- **ADRs:** ADR-015 §Schema (`stock_derived_metrics`)
- **Upstream:** STORY-057 (`stock_quarterly_history` established), STORY-004 (migrations pattern)

## Preconditions
- `stocks` table exists
- STORY-057 applied (ordering: both can be in same migration or sequential)

## Inputs
- ADR-015 schema specification
- RFC-008 `StockDerivedMetrics` interface (canonical field list)

## Outputs
- New Prisma model `StockDerivedMetrics`
- Migration file applied
- All existing tests remain passing

## Acceptance Criteria
- [ ] `stock_derived_metrics` table created with ticker as primary key
- [ ] `derived_as_of` column present with `DEFAULT NOW()`
- [ ] `quarters_available` column present
- [ ] All ~40 derived fields from RFC-008 `StockDerivedMetrics` interface present as nullable columns
- [ ] `provenance JSONB` column present
- [ ] FK to `stocks(ticker)` with CASCADE DELETE
- [ ] Prisma client regenerated; no TypeScript errors
- [ ] All existing tests continue to pass

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-008 §Classifier-Facing Derived Fields, RFC-002 Amendment 2026-04-25
- ADR: ADR-015 §Schema, ADR-016 §Derived Metrics Recompute Trigger
