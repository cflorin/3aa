# STORY-044 — Classification State Persistence and History

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the persistence layer for classification results: write `ClassificationResult` and its source inputs to the `classification_state` table (upsert) and record a `classification_history` row whenever the `suggested_code` changes. The `input_snapshot` field stored in `classification_state` is what enables `shouldRecompute()` in STORY-047 to detect material fundamental changes without re-reading the prior stock record from a point in time.

## Story
As the classification system,
I want to persist the suggested code, confidence, scores, reason codes, and the input snapshot used to produce them,
so that classifications are durable, auditable, and the recompute trigger has the prior state it needs.

## Outcome
A `persistClassification(ticker, result, input)` function exists. It upserts `classification_state` (including `input_snapshot`) and conditionally inserts `classification_history`. The schema for both tables is migrated. Query functions expose state and history to downstream stories.

## Scope In

### Schema

**`classification_state` table** (one row per ticker, system-wide shared):
- `ticker VARCHAR PK`
- `suggested_code VARCHAR(5) NULLABLE` — null when data too sparse
- `confidence_level VARCHAR(10) NOT NULL` — always `'high'|'medium'|'low'`
- `reason_codes JSONB NOT NULL` — array of reason code strings
- `scores JSONB NOT NULL` — `{ bucket: Record<1-8, number>, eq: Record<A-C, number>, bs: Record<A-C, number>, confidenceBreakdown: { steps: Array<{step, label, note, band, tieBreaks?, missing?}> }, tieBreaksFired: Array<{rule, description, winner, condition, values, outcome, marginAtTrigger}> }` — stores full ClassificationResult scores and audit trail for UI display
- `input_snapshot JSONB NOT NULL` — serialized `ClassificationInput` (fundamentals + flags used in last run); consumed by `shouldRecompute()` in STORY-047
- `classified_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

**`classification_history` table** (append-only audit log):
- `id UUID PK DEFAULT gen_random_uuid()`
- `ticker VARCHAR NOT NULL FK → stocks.ticker`
- `old_suggested_code VARCHAR(5) NULLABLE` — code before the change
- `new_suggested_code VARCHAR(5) NULLABLE` — code after the change (null allowed)
- `context_snapshot JSONB NOT NULL` — `{ input_snapshot, scores, reason_codes }` at time of change
- `classified_at TIMESTAMPTZ NOT NULL` — timestamp of the classification that caused the change

### Functions

- `persistClassification(ticker: string, result: ClassificationResult, input: ClassificationInput, tx?: PrismaTransaction)`:
  - Reads current `classification_state` row for ticker (within transaction)
  - Upserts `classification_state` with all fields including `input_snapshot = input`
  - If `old_suggested_code !== new_suggested_code` (null-safe comparison) → inserts `classification_history` row with `old_suggested_code`, `new_suggested_code`, `context_snapshot = { input_snapshot: input, scores: result.scores, reason_codes: result.reason_codes }`
  - No history row when `suggested_code` is null AND previous was also null
  - Null → non-null transition: history row inserted (first code assignment)
  - Non-null → null transition: history row inserted (code lost)
  - Transactional: read + upsert + conditional insert in single DB transaction
- `getClassificationState(ticker: string)` → `ClassificationState | null`
- `getClassificationHistory(ticker: string, limit?: number)` → `ClassificationHistory[]` (ordered `classified_at DESC`)
- All exported from `src/domain/classification/`
- Type definitions exported from `src/domain/classification/types.ts`

## Scope Out
- Reading back state in API routes (STORY-045, STORY-046 reference this)
- User classification overrides (STORY-045)
- Batch job orchestration (STORY-047)
- History UI (STORY-051 displays history from `getClassificationHistory`)

## Dependencies
- Epic: EPIC-004
- RFC: RFC-001 §Classification State, §Classification History, §Data Model
- ADR: ADR-007 (hybrid shared/per-user state — `classification_state` is shared/system)
- ADR: ADR-001 (Prisma + Cloud SQL)
- Upstream: STORY-043 (`ClassificationResult` type and `ClassificationInput` type)
- DB migration prerequisite: Prisma schema and migrations (STORY-004 baseline)

## Preconditions
- `ClassificationResult` and `ClassificationInput` interfaces defined (STORY-043)
- Prisma schema and migration tooling operational (STORY-004)
- Cloud SQL accessible (STORY-003)

## Inputs
- `ticker: string`
- `result: ClassificationResult` (from `classifyStock()`)
- `input: ClassificationInput` (the inputs passed to `classifyStock()` for this run)

## Outputs
- Side effects: `classification_state` row upserted; `classification_history` row inserted on code change
- Query functions: `getClassificationState`, `getClassificationHistory`

## Acceptance Criteria
- [ ] `classification_state` table created via Prisma migration with `input_snapshot JSONB NOT NULL`
- [ ] `classification_history` table created with `old_suggested_code`, `new_suggested_code`, `context_snapshot JSONB`
- [ ] `persistClassification` accepts `input: ClassificationInput` and stores it in `input_snapshot`
- [ ] Calling `persistClassification` twice with same `suggested_code` → `classification_state` updated, 0 new `classification_history` rows
- [ ] Calling `persistClassification` with changed `suggested_code` → `classification_history` row inserted with `old_suggested_code` and `new_suggested_code`
- [ ] `context_snapshot` in history row contains `input_snapshot`, `scores`, `reason_codes`
- [ ] `null → non-null` transition → history row inserted
- [ ] `non-null → null` transition → history row inserted
- [ ] `null → null` (no change) → no history row
- [ ] `getClassificationState` returns full row including `input_snapshot` or `null` for unknown ticker
- [ ] `getClassificationHistory` returns rows ordered `classified_at DESC`
- [ ] All operations atomic in a single DB transaction
- [ ] Migration runs without error on clean and on existing database

## Test Strategy Expectations
- **Unit tests:**
  - First classification (no prior state) → state row created, history created with `old_suggested_code = null`
  - Wait — reconsider: first classification is `null → "4AA"`. History row inserted. ✓
  - Second identical classification → state updated (new `input_snapshot`), no new history row
  - Code change `"4AA"` → `"3AA"` → history inserted with `old = "4AA"`, `new = "3AA"`
  - `null → null` → no history row
  - `input_snapshot` stored correctly: `getClassificationState` returns input fields
- **Integration tests:**
  - Run against test DB; verify row counts and field values after each scenario
  - Transaction rollback: simulate error mid-insert → neither state update nor history row committed
  - `input_snapshot` round-trip: store ClassificationInput, read back, compare field values
- **Contract/schema tests:**
  - `getClassificationState` return type matches `ClassificationState` interface (includes `input_snapshot`)
  - `classification_history` row has `old_suggested_code`, `new_suggested_code`, `context_snapshot`
  - `scores` and `input_snapshot` fields round-trip through JSONB without precision loss
- **Migration tests:**
  - Migration applies cleanly; both tables exist with expected columns

## Regression / Invariant Risks
- **`shouldRecompute()` breakage:** if `input_snapshot` field is dropped or renamed, STORY-047 cannot compare inputs → explicit contract test that `input_snapshot` is always non-null after `persistClassification`
- **History field naming drift:** `old_suggested_code` / `new_suggested_code` must not drift to `previous_code` / `suggested_code` — contract test on history row shape
- **JSONB precision:** numeric fields in `input_snapshot` (e.g., `revenue_growth_fwd = 0.072`) must not lose precision through JSONB round-trip — explicit float field test

## Key Risks / Edge Cases
- **Concurrent writes on same ticker:** batch job + re-trigger race; Prisma upsert is last-write-wins on `updated_at`; history inserts are append-only so no data is lost
- **`input_snapshot` size:** full `ClassificationInput` is ~15 fields; JSONB handles easily; no truncation risk
- **First-ever classification history:** `null → "4AA"` is a meaningful event (first code assignment); history row should be inserted, not skipped

## Definition of Done
- [ ] Prisma migration for `classification_state` (with `input_snapshot`) and `classification_history` (with `old_suggested_code`, `new_suggested_code`, `context_snapshot`) created, reviewed, applied
- [ ] `persistClassification(ticker, result, input)` implemented and exported
- [ ] `getClassificationState`, `getClassificationHistory` implemented and exported
- [ ] Unit + integration + migration + contract tests passing
- [ ] Transaction atomicity test passing
- [ ] `input_snapshot` contract test passing
- [ ] Traceability comments reference RFC-001 §Data Model, ADR-007, ADR-001
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 §Classification State, §Classification History, §Data Model
- ADR: ADR-007 (hybrid shared/per-user classification state); ADR-001 (Prisma/Cloud SQL data layer)
