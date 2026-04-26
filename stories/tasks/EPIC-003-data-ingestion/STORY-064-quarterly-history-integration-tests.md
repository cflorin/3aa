# STORY-064 — Quarterly History Pipeline Integration & Regression Tests

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Validate the end-to-end quarterly history pipeline (STORY-057 through STORY-063) with integration tests covering the full data flow from Tiingo adapter through sync service, derived metrics computation, trend computation, and cron route. Ensures no regression against the existing 489-test suite.

## Story
As the **engineering team**,
I want **integration tests that verify the full quarterly history pipeline across all its stages**,
so that **we can confidently ship and maintain the quarterly history capability without breaking existing functionality**.

## Outcome
- Integration test suite in `tests/integration/quarterly-history-pipeline.test.ts`
- Tests cover: fetch → sync → TTM computation → trend computation → cron route orchestration
- Regression guard: full existing test suite (489 tests) continues to pass after all STORY-057–063 code is in place
- Test fixtures: mock `TiingoAdapter.fetchQuarterlyStatements` responses with realistic quarterly data (8–12 quarters); NULL DataCode scenarios; 404/empty scenarios
- At least one end-to-end happy-path test: 3 stocks × 8 quarters → sync upserts → TTM computed → trend slopes non-null → `stock_derived_metrics` rows present with `derived_as_of` set

## Scope In
- `tests/integration/quarterly-history-pipeline.test.ts`
- Integration scenarios: happy path (multiple stocks, multiple quarters), change-detection skip, forceFullScan override, NULL DataCode handling, cron route 401, cron route summary shape
- Regression: run full existing test suite; assert count ≥ 489 (no removed tests)
- Database: uses test database or Prisma mock consistent with existing integration test pattern

## Scope Out
- Classification scorer integration with quarterly data (STORY-072)
- UI integration tests (STORY-070, STORY-071)
- Performance benchmarks

## Dependencies
- **Epic:** EPIC-003
- **Upstream:** STORY-057 through STORY-063 (all quarterly history implementation stories)

## Preconditions
- All STORY-057–063 implementations complete
- Existing test infrastructure available (Jest, Prisma test client or mock)

## Inputs
- Mock `QuarterlyReport[]` responses
- Test database seeded with in-universe stocks

## Outputs
- `tests/integration/quarterly-history-pipeline.test.ts` — all tests passing
- Regression confirmation: existing ≥ 489 tests still pass

## Acceptance Criteria
- [ ] Integration happy path: sync detects new quarter → upserts rows → TTM computation writes `stock_derived_metrics` → trend metrics non-null for ≥ 8-quarter series
- [ ] Change-detection: stock with unchanged `reported_date` is skipped (no upsert, no derivation)
- [ ] `forceFullScan = true`: stock skipped by change-detection is still processed
- [ ] NULL DataCode handling: revenue = null → all margin fields null, not zero
- [ ] 404 from adapter: stock logged as skipped, no error thrown, batch continues
- [ ] Cron route returns 401 with invalid token; returns 200 with valid token and correct summary shape
- [ ] `derived_as_of` updated after each successful derivation run
- [ ] `quarters_available` correctly reflects stored row count
- [ ] All existing ≥ 489 tests continue to pass (no regression)

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-008 §Ingestion Sync Architecture
- ADR: ADR-015, ADR-016
