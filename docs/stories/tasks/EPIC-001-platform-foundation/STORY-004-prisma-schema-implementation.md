# STORY-004 — Implement Prisma Schema and Database Migrations

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Translate RFC-002 canonical database schema into executable Prisma schema and database migrations, ensuring implementation matches specification exactly and migrations are reversible and idempotent.

## Story
As a **backend engineer**,
I want **Prisma schema and migrations that match RFC-002**,
so that **the database structure is created correctly and can be versioned and evolved safely**.

## Outcome
- Prisma schema (`schema.prisma`) created matching all 17 RFC-002 tables
- Initial database migration generated (CREATE TABLE statements for all tables)
- Migration creates all tables, columns, constraints, indexes, foreign keys
- Migration is idempotent (can run multiple times safely)
- Migration is deterministic (same input → same output, fresh-db recreate tested)
- Schema validation tests ensure Prisma schema matches RFC-002
- Database ready for seed data (STORY-005)

**Note:** This story creates all 17 tables including user/auth tables (users, user_sessions, user_monitored_stocks, user_classification_overrides, user_valuation_overrides, user_alert_preferences, user_preferences). EPIC-002 (Authentication & User Management) will implement authentication business logic only, not define these schemas.

## Scope In
- Create `prisma/schema.prisma` file
- Define all 17 models (stocks, classification_state, valuation_state, alerts, users, user_sessions, user_monitored_stocks, user_classification_overrides, user_valuation_overrides, user_alert_preferences, user_preferences, classification_history, valuation_history, alert_history, anchored_thresholds, tsr_hurdles, framework_version)
- Define Prisma field types matching RFC-002 (String, Int, Float, Boolean, DateTime, Json for JSONB, Enum types)
- Define Prisma relations (@relation attributes, foreign keys)
- Define Prisma constraints (@@unique, @@index, @@id, @default, @db attributes)
- Create initial migration (`prisma migrate dev --name init`)
- Generate Prisma Client (`prisma generate`)
- Write schema validation tests (Prisma schema → RFC-002 compliance check)
- Write migration tests (apply migration, verify tables exist, test rollback)
- Add Prisma schema comments referencing RFC-002 sections

## Scope Out
- Seed data (STORY-005)
- Application code using Prisma Client (STORY-008)
- Query optimization (deferred to performance tuning)
- Database backups (handled by Cloud SQL automated backups)
- Migration deployment automation (STORY-006 CI/CD pipeline)
- Schema evolution (future migrations for V1.1+)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 15 (Data Requirements)
- **RFCs:** RFC-002 (Canonical Data Model - must be completed in STORY-002)
- **ADRs:** ADR-010 (Prisma ORM), ADR-008 (Postgres 15)
- **Upstream stories:** STORY-002 (RFC-002 database schema design), STORY-003 (Cloud SQL provisioned)

## Preconditions
- RFC-002 completed (STORY-002) with all 17 tables defined
- Cloud SQL Postgres instance running (STORY-003)
- DATABASE_URL available (from Secret Manager or local .env)
- Node.js 18+ and npm installed locally
- Prisma CLI installed (`npm install -D prisma`)

## Inputs
- RFC-002 database schema specification
- DATABASE_URL (postgresql connection string)
- Table definitions (columns, types, constraints, indexes)
- Foreign key relationships (ON DELETE CASCADE behaviors)
- JSONB field structures

## Outputs
- `prisma/schema.prisma` file (all 17 models defined)
- `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql` (initial migration)
- Prisma Client generated (`node_modules/.prisma/client`)
- Migration applied to Cloud SQL database (all 17 tables created)
- Schema validation tests (`tests/integration/schema-validation.test.ts`)
- Migration tests (`tests/integration/migration.test.ts`)

## Acceptance Criteria
- [ ] `prisma/schema.prisma` created with datasource (postgresql) and generator (prisma-client-js)
- [ ] All 17 models defined in Prisma schema (stocks, classification_state, valuation_state, alerts, users, user_sessions, user_monitored_stocks, user_classification_overrides, user_valuation_overrides, user_alert_preferences, user_preferences, classification_history, valuation_history, alert_history, anchored_thresholds, tsr_hurdles, framework_version)
- [ ] All columns from RFC-002 present in Prisma models (field names match RFC-002)
- [ ] All Prisma field types correct (String for VARCHAR, Int for INTEGER, Float for NUMERIC, DateTime for TIMESTAMPTZ, Boolean for BOOLEAN, Json for JSONB)
- [ ] All primary keys defined (@@id or @id attributes)
- [ ] All foreign keys defined (@relation attributes with onDelete: Cascade where appropriate)
- [ ] All unique constraints defined (@@unique on users.email, user_sessions.session_id, etc.)
- [ ] All indexes defined (@@index on stocks.in_universe, classification_state.suggested_code, alerts.user_id, alerts.triggered_at, etc.)
- [ ] CHECK constraints documented (Prisma doesn't support CHECK in schema, document in migration SQL comments)
- [ ] Enum types defined (alert_type ENUM: classification_change, zone_change, threshold_breach; data_freshness_status ENUM: fresh, stale, missing)
- [ ] JSONB fields typed as Json (data_provider_provenance Json, alert_details Json, default_filters Json, default_sort Json)
- [ ] Initial migration created (`prisma migrate dev --name init`)
- [ ] Migration SQL inspected (CREATE TABLE statements correct, constraints present)
- [ ] Migration applied to database (Cloud SQL or local dev database, tables created)
- [ ] Prisma Client generated (`npx prisma generate` succeeds)
- [ ] Schema validation test passes (Prisma schema has all RFC-002 tables/columns)
- [ ] Migration idempotence tested (apply migration twice, no errors on second run)
- [ ] Fresh database recreation tested (drop database, create database, re-apply migration → succeeds)
- [ ] Manual recovery procedure documented (how to recover from failed migration)

## Test Strategy Expectations

**Unit tests:**
- Prisma schema parsing (schema.prisma parses without syntax errors)
- Enum type definitions (alert_type enum has all 3 values: classification_change, zone_change, threshold_breach)
- Field type mapping (RFC-002 NUMERIC → Prisma Float, RFC-002 TIMESTAMPTZ → Prisma DateTime)

**Integration tests:**
- Migration application (prisma migrate deploy → all 17 tables created in database)
- Table existence verification (query information_schema.tables → all 17 tables present)
- Column verification (query information_schema.columns for stocks table → ticker, company_name, sector, industry, market_cap, in_universe, current_price, etc. all present)
- Foreign key verification (query information_schema.table_constraints → classification_state.ticker FK to stocks.ticker exists with ON DELETE CASCADE)
- Unique constraint verification (query information_schema.table_constraints → users.email UNIQUE constraint exists)
- Index verification (query pg_indexes → stocks.in_universe index exists)
- Prisma Client query test (connect to database, query stocks table with Prisma Client → succeeds)

**Contract/schema tests:**
- RFC-002 compliance (compare Prisma schema fields to RFC-002 spec → all tables/columns match)
- Prisma schema → SQL migration parity (compare Prisma schema to generated migration SQL → consistent)
- Foreign key cascade behavior (delete stock record → classification_state, valuation_state cascade deleted)
- JSONB structure validation (insert data_provider_provenance JSONB → structure matches RFC-002 spec)

**BDD acceptance tests:**
- "Given Prisma schema defined, when generating migration, then migration creates all 17 tables"
- "Given migration applied, when querying stocks table, then table exists with correct columns"
- "Given stocks table populated, when deleting stock, then classification_state and valuation_state cascade deleted"
- "Given users table, when inserting duplicate email, then unique constraint error raised"

**E2E tests:**
- Full migration workflow (fresh database → apply migration → seed data → query with Prisma Client → data returned)

## Regression / Invariant Risks

**Schema drift:**
- Risk: Prisma schema diverges from RFC-002 (field added to Prisma but not RFC-002)
- Protection: Contract test validates Prisma schema matches RFC-002, code review enforces updates to both

**Migration idempotence failure:**
- Risk: Running migration twice creates duplicate tables or errors
- Protection: Prisma migrations use IF NOT EXISTS, integration test verifies idempotence

**Foreign key cascade misconfiguration:**
- Risk: Deleting parent record doesn't cascade to children (orphaned records)
- Protection: Contract test validates ON DELETE CASCADE, integration test verifies cascade behavior

**CHECK constraint missing:**
- Risk: Prisma doesn't support CHECK constraints in schema, constraints not created in database
- Protection: Manually add CHECK constraints to migration SQL, document in migration comments

**JSONB structure inconsistency:**
- Risk: Application inserts JSONB with different structure than RFC-002 spec
- Protection: JSONB schema validation (application-level validation, not database constraint)

**Invariants to protect:**
- Prisma schema matches RFC-002 exactly (all tables, columns, types, constraints)
- Migrations are idempotent (can apply multiple times safely)
- Foreign keys cascade correctly (delete parent → children deleted)
- Unique constraints enforced (no duplicate emails, session IDs)
- Indexes exist for common queries (in_universe, user_id, triggered_at)
- Enum types complete (alert_type has all 3 values)

## Key Risks / Edge Cases

**Prisma type mapping edge cases:**
- RFC-002 NUMERIC → Prisma Float (precision loss for very large numbers, acceptable for V1)
- RFC-002 JSONB → Prisma Json (Prisma validates JSON syntax, not structure)
- RFC-002 VARCHAR → Prisma String (Prisma uses TEXT by default, acceptable)
- RFC-002 ENUM → Prisma enum (Prisma creates native Postgres ENUM type)

**Migration edge cases:**
- Migration fails mid-apply (database in inconsistent state, manual rollback required)
- Concurrent migrations (two developers apply different migrations, conflict)
- Migration order dependency (seed data migration depends on schema migration)
- Cloud SQL connection timeout during migration (large migration >5 minutes)

**Foreign key cascade edge cases:**
- Cascade delete propagation depth (delete stock → cascade to 5+ child tables, transaction overhead)
- Cascade delete loop (circular foreign keys, V1 doesn't have any)
- User deletion cascade (delete user → cascade to all user data: alerts, monitored stocks, overrides, preferences)

**CHECK constraint edge cases:**
- Prisma doesn't generate CHECK constraints (must manually add to migration SQL)
- CHECK constraint violation (INSERT anchored_thresholds with max < comfortable, error raised)
- CHECK constraint on JSONB fields (not supported in Postgres, enforce in application)

**Rollback edge cases:**
- Rollback with data present (rolling back migration drops tables, data lost)
- Partial rollback (rollback migration 002 but not 001, inconsistent state)
- Rollback automation (Prisma supports rollback, but requires manual intervention)

## Definition of Done

- [ ] Prisma schema created with all 17 models matching RFC-002
- [ ] Initial migration generated and applied to Cloud SQL database
- [ ] All 17 tables exist in database (verified via integration test)
- [ ] Foreign keys and unique constraints verified (contract tests pass)
- [ ] Prisma Client generated and query test passes
- [ ] Schema validation tests added and passing (Prisma schema → RFC-002 compliance)
- [ ] Migration idempotence tested (apply twice, no errors)
- [ ] Migration rollback tested (manual rollback succeeds, re-apply succeeds)
- [ ] Prisma schema comments reference RFC-002 sections
- [ ] Prisma schema committed to GitHub repository
- [ ] Migration files committed to GitHub repository
- [ ] Traceability links recorded (schema.prisma comments reference RFC-002)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 15 (Data Requirements)
- **RFC:** RFC-002 (Canonical Data Model)
- **ADR:** ADR-010 (Prisma ORM), ADR-008 (Postgres 15)

---

**END STORY-004**
