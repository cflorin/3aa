# STORY-044 — Classification State Persistence and History

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the persistence layer for classification results: write `ClassificationResult` to the `classification_state` table (upsert) and record a `classification_history` row whenever the `suggested_code` changes. This makes the system's classification visible across sessions and queryable by the API and UI stories that follow.

## Story
As the classification system,
I want to persist the suggested code, confidence, scores, and reason codes for each stock,
so that the classification is durable across application restarts and queryable by all downstream consumers.

## Outcome
A `persistClassification(ticker, result: ClassificationResult)` function exists. It upserts `classification_state` and conditionally inserts `classification_history`. The schema for both tables is migrated. A `getClassificationState(ticker)` query function also exists for use by the API.

## Scope In
- Prisma schema migration adding:
  - `classification_state` table: `ticker PK`, `suggested_code`, `confidence_level`, `reason_codes JSONB`, `scores JSONB`, `classified_at`, `updated_at`
  - `classification_history` table: `id PK`, `ticker`, `suggested_code`, `confidence_level`, `classified_at`, `previous_code`
- `persistClassification(ticker: string, result: ClassificationResult, tx?: PrismaTransaction)` function:
  - Upserts `classification_state` (always overwrites scores, reason_codes, confidence)
  - Compares incoming `suggested_code` to existing; if changed → inserts `classification_history` row
  - No history row written when `suggested_code` is null (uncertain classification)
  - Transactional: upsert + conditional insert in single DB transaction
- `getClassificationState(ticker: string)` → `ClassificationState | null`
- `getClassificationHistory(ticker: string, limit?: number)` → `ClassificationHistory[]`
- Exported from `src/domain/classification/`
- Type definitions exported from `src/domain/classification/types.ts`

## Scope Out
- Reading back state in API routes (STORY-045, STORY-046 reference this)
- User classification overrides (STORY-045)
- Batch job orchestration (STORY-047)
- History UI (deferred to EPIC-005 or later)

## Dependencies
- Epic: EPIC-004
- RFC: RFC-001 §Classification State, §Classification History, §Data Model
- ADR: ADR-007 (hybrid shared/per-user state — `classification_state` is shared/system)
- ADR: ADR-001 (Prisma + Cloud SQL)
- Upstream: STORY-043 (`ClassificationResult` type)
- DB migration prerequisite: existing Prisma schema and migrations (STORY-004 baseline)

## Preconditions
- `ClassificationResult` interface defined (STORY-043)
- Prisma schema and migration tooling operational (STORY-004)
- Cloud SQL accessible (STORY-003)

## Inputs
- `ticker: string`
- `result: ClassificationResult` (from `classifyStock()`)

## Outputs
- Side effects: `classification_state` row upserted; `classification_history` row inserted on code change
- Query functions: `getClassificationState`, `getClassificationHistory`

## Acceptance Criteria
- [ ] `classification_state` table created via Prisma migration
- [ ] `classification_history` table created via Prisma migration
- [ ] `persistClassification` function implemented and exported
- [ ] Calling `persistClassification` twice with same `suggested_code` → 1 `classification_state` row, 0 new `classification_history` rows
- [ ] Calling `persistClassification` with changed `suggested_code` → `classification_history` row inserted with `previous_code`
- [ ] `suggested_code = null` → `classification_state` updated, no `classification_history` row inserted
- [ ] `getClassificationState` returns current state or `null` for unknown ticker
- [ ] `getClassificationHistory` returns rows ordered by `classified_at DESC`
- [ ] All operations run in a single DB transaction (upsert + conditional insert atomic)
- [ ] Migration runs without error on a clean database and on existing database (idempotent forward migration)

## Test Strategy Expectations
- **Unit tests:**
  - First classification → state row created, no history
  - Second identical classification → state updated, no new history row
  - Classification code change → history row inserted with correct `previous_code`
  - `suggested_code = null` → no history inserted
- **Integration tests:**
  - Run against test DB; verify row counts and field values after each scenario
  - Transaction rollback: simulate error mid-transaction → neither state nor history row committed
- **Contract/schema tests:**
  - `getClassificationState` return type matches `ClassificationState` interface
  - `scores` field round-trips through JSONB without precision loss
- **Migration tests:**
  - Migration applies cleanly on empty schema
  - `classification_state` and `classification_history` tables exist with expected columns after migration

## Regression / Invariant Risks
- **History duplication:** if transaction boundary is wrong, history rows can duplicate on retry — idempotency test required
- **JSONB truncation:** if `scores` object has more keys than expected, JSONB must still persist all — round-trip contract test
- **Null code persisted as empty string:** `suggested_code` null must not become `""` in DB — explicit null test

## Key Risks / Edge Cases
- **Concurrent writes:** batch job and manual re-trigger could race on same ticker; Prisma upsert with `updatedAt` guard prevents data loss
- **Large `reason_codes` array:** no practical limit, but JSONB handles it; test with 20+ reason codes
- **Schema version drift:** if `ClassificationResult` shape changes post-migration, JSONB cast in `getClassificationState` must not fail silently

## Definition of Done
- [ ] Prisma migration for `classification_state` and `classification_history` created, reviewed, and applied
- [ ] `persistClassification`, `getClassificationState`, `getClassificationHistory` implemented and exported
- [ ] Unit + integration + migration tests added and passing
- [ ] Transaction atomicity test passing
- [ ] Traceability comments reference RFC-001 §Data Model, ADR-007, ADR-001
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 §Classification State, §Classification History, §Data Model
- ADR: ADR-007 (hybrid shared/per-user classification state); ADR-001 (Prisma/Cloud SQL data layer)
