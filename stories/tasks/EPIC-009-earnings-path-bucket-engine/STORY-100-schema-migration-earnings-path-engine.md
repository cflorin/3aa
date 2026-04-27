# STORY-100 — Schema Migration: Earnings Path Engine Fields

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Extend the Prisma schema with the new persistent fields required by the RFC-009 Earnings Path Engine. Without this migration, no downstream story (STORY-101–111) can persist or query engine outputs. This story creates the durable data contract that all subsequent EPIC-009 stories implement against.

## Story
As a system,
I want the database schema to include all fields needed by the Earnings Path Engine,
so that engine outputs, confidence scores, and operating leverage state can be stored, queried, and audited.

## Outcome
The database schema is extended with: a new `OperatingLeverageState` enum; new columns on `ClassificationState` (numeric bucket confidence, expected EPS growth, operating leverage state, fallback level); and `epsFy2Avg` on the `Stock` table. All migrations run cleanly and all existing tests continue to pass.

## Scope In
- Add Prisma enum `OperatingLeverageState`: `none | gradual | emerging_now | cyclical_rebound | deteriorating`
- Add to `ClassificationState`:
  - `bucketConfidence` Decimal(4,3) nullable — numeric confidence 0.000–1.000
  - `expectedNormalizedEpsGrowth` Decimal(8,4) nullable — final formula result
  - `operatingLeverageState` OperatingLeverageState nullable — engine classification
  - `fwdEpsFallbackLevel` Int nullable — 1=FY2 direct, 2=extrapolation, 3=NTM only, 4=excluded
- Add to `Stock`:
  - `epsFy2Avg` Decimal(10,4) nullable — FY+2 analyst consensus EPS (persisted by STORY-101)
- Write and apply the Prisma migration
- Seed script updates if needed (no data seeding required — all new fields nullable)

## Scope Out
- No changes to `EarningsQuality` or `BalanceSheet` scoring (unchanged from V1)
- No changes to `StockQuarterlyHistory` (all quarterly data already present)
- No changes to `StockDerivedMetrics` (existing fields are inputs, not outputs, of the engine)
- Component breakdown fields (normalized revenue growth, penalty values, reason codes expansion) are stored in the existing `scores` Json column — no new columns for those
- `confidence_level` String (high/medium/low) is NOT changed — it remains as the UI-friendly label derived from the numeric `bucketConfidence`
- No TypeScript type changes in this story (story 102–108 handle service types)
- No data backfill — all new columns nullable; existing rows remain valid

## Dependencies
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md` (§Persistence / Data Model)
- RFC: RFC-009 §17 (Output Fields), RFC-002 (forward estimates schema)
- ADR: ADR-013 (superseded — V2 formula), ADR-019 (OperatingLeverageState enum definition)
- Framework: `3AA-FRAMEWORK-MODEL-REFERENCE-V2.md` §3.11, §3.12
- Upstream stories: EPIC-008 complete (STORY-089–096 done); STORY-100 has no EPIC-009 upstream

## Preconditions
- EPIC-008 migrations applied and passing
- Prisma CLI accessible in dev environment
- `prisma/schema.prisma` has no pending unapplied migrations

## Inputs
- Prisma schema file at `prisma/schema.prisma`
- RFC-009 §17 output fields table
- ADR-019 OperatingLeverageState enum definition
- Framework V2.1 §3.11 engine output fields table

## Outputs
- Updated `prisma/schema.prisma` with new enum and fields
- New migration file in `prisma/migrations/`
- Updated `@prisma/client` types (generated)
- Schema contract test verifying column presence

## Acceptance Criteria
- [ ] `OperatingLeverageState` enum defined in schema with all 5 values
- [ ] `ClassificationState.bucketConfidence` column exists as Decimal(4,3) nullable
- [ ] `ClassificationState.expectedNormalizedEpsGrowth` column exists as Decimal(8,4) nullable
- [ ] `ClassificationState.operatingLeverageState` column exists with OperatingLeverageState type nullable
- [ ] `ClassificationState.fwdEpsFallbackLevel` column exists as Int nullable
- [ ] `Stock.epsFy2Avg` column exists as Decimal(10,4) nullable
- [ ] `prisma migrate deploy` succeeds on a clean database
- [ ] All 1803+ existing tests continue to pass after migration
- [ ] New schema contract test verifies all 6 new columns exist and have correct nullable/type constraints
- [ ] Prisma Client regenerated; TypeScript types updated and compile without errors

## Test Strategy Expectations
- Unit tests:
  - No new unit tests for migration itself (schema changes are structural)
- Integration tests:
  - Schema contract test: verify `ClassificationState` has `bucketConfidence`, `expectedNormalizedEpsGrowth`, `operatingLeverageState`, `fwdEpsFallbackLevel` columns
  - Schema contract test: verify `Stock` has `epsFy2Avg` column
  - Schema contract test: verify `OperatingLeverageState` enum values are valid
  - Migration smoke test: insert a `ClassificationState` row with all new fields null; verify no constraint violation
  - Migration smoke test: insert a `Stock` row with `epsFy2Avg` null and with a value
- Contract/schema tests:
  - Prisma schema lint passes: `prisma validate`
  - TypeScript compilation passes after `prisma generate`
- BDD acceptance tests:
  - Given the EPIC-009 schema migration is applied; when a ClassificationState record is created with new fields populated; then all fields persist and retrieve correctly
- E2E tests: N/A (schema migration only)

## Regression / Invariant Risks
- Existing `ClassificationState` rows must remain valid — all new columns nullable, no defaults that could silently change existing data
- `confidence_level` String column MUST NOT be removed or changed — UI and existing classification code depends on it
- `Stock` model with 40+ fields: adding `epsFy2Avg` must not break existing `input-mapper.ts` which maps the full Stock row
- `ClassificationScoresPayload` TypeScript type is currently used across multiple services — must not be broken by type generation changes

## Key Risks / Edge Cases
- If `OperatingLeverageState` enum name conflicts with existing Prisma enum naming conventions, rename to `OlState` or similar (prefer full name)
- Decimal precision for `bucketConfidence` (4,3): stores values like 0.850 — verify Prisma decimal handling doesn't round unexpectedly
- If any existing service does a raw `SELECT *` on ClassificationState, the new nullable columns will be included; must not cause parsing failures

## Definition of Done
- [ ] Capability implemented
- [ ] Tests added and passing
- [ ] Regression coverage: all pre-migration tests still passing
- [ ] Docs/specs updated: implementation log entry
- [ ] Migrations applied and committed
- [ ] `prisma generate` run; updated client committed or regenerated in CI

## Traceability
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md`
- RFC: RFC-009 §17, RFC-002
- ADR: ADR-019, ADR-013
