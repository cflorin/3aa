# STORY-004: Implement Prisma Schema and Database Migrations

**Epic:** EPIC-001 — Platform Foundation & Deployment
**Status:** in_progress
**Dependencies:** STORY-002 (RFC-002 schema), STORY-003 (Cloud SQL operational)
**Estimated Complexity:** High

## Story Overview

Implement the full Prisma schema from RFC-002 (19 tables), install and configure Jest for testing, generate the initial migration, apply it to the `aaa_production` Cloud SQL database, create the Prisma client singleton, update the health check endpoint with database connectivity verification, and write integration tests that confirm all tables, constraints, and indexes exist correctly.

> **Local Dev / Test DB:** Cloud SQL has private IP only. Local development and CI tests use a Docker PostgreSQL container. Production migrations are applied via `prisma migrate deploy` in Cloud Build/Cloud Run.

## Acceptance Criteria

1. Prisma schema defines all 19 RFC-002 tables with correct types, relations, and indexes
2. Initial migration SQL generated and committed
3. Migration applied to `aaa_production` (via Cloud SQL Auth Proxy or Cloud Build)
4. `prisma generate` produces typed client
5. Prisma client singleton exported from `src/infrastructure/database/prisma.ts`
6. Health check at `/api/health` includes database connectivity verification
7. Jest configured with `ts-jest` for TypeScript tests
8. Integration tests pass against Docker test DB (all 19 tables, FK constraints, JSONB defaults)
9. All scripts added to `package.json` (`db:migrate`, `db:generate`, `db:studio`, `test`, `test:integration`)

## Evidence Required

- [ ] `prisma/schema.prisma` exists with all 19 model definitions
- [ ] `prisma/migrations/` directory with initial migration SQL
- [ ] `prisma migrate deploy` success against `aaa_production`
- [ ] `src/infrastructure/database/prisma.ts` singleton exists
- [ ] `tests/integration/database/schema.test.ts` passes
- [ ] `tests/integration/database/constraints.test.ts` passes
- [ ] `jest.config.ts` exists and Jest runs successfully
- [ ] Health check returns `{"status":"healthy","db":"connected",...}`

---

## Task Breakdown

### TASK-004-001: Install Dependencies and Configure Jest + Package Scripts

**Description:** Install Prisma, `@prisma/client`, Jest, `ts-jest`, and related type packages. Configure `jest.config.ts`. Add all required scripts to `package.json`. Create `.env.example` and `docker-compose.test.yml` for local test database. Create `.env.test` pointing to local Docker DB.

**Acceptance Criteria:**
- `prisma`, `@prisma/client` installed as production dependencies
- `jest`, `ts-jest`, `@types/jest` installed as dev dependencies
- `jest.config.ts` created with `ts-jest` transformer and `testEnvironment: node`
- `docker-compose.test.yml` created with PostgreSQL 15 service
- `.env.example` documents all required env vars
- `.env.test` created for local test database connection
- `package.json` scripts:
  - `test`: run unit tests
  - `test:integration`: run integration tests with test DB
  - `test:all`: run all tests
  - `db:generate`: `prisma generate`
  - `db:migrate`: `prisma migrate dev`
  - `db:migrate:deploy`: `prisma migrate deploy`
  - `db:studio`: `prisma studio`
  - `db:test:up`: start test Docker DB
  - `db:test:down`: stop test Docker DB
- `postinstall` script added: `prisma generate`

**BDD Scenario:**
```gherkin
Given the project needs a test framework
When I install and configure Jest with ts-jest
Then I can run `npm test` and all tests execute
And `npm run test:integration` runs against the Docker test DB
```

---

### TASK-004-002: Write Prisma Schema — Framework Config Tables

**Description:** Create `prisma/schema.prisma` with datasource, generator, and framework configuration models: `FrameworkVersion`, `AnchoredThreshold`, `TsrHurdle`.

**Acceptance Criteria:**
- `prisma/schema.prisma` created with:
  - `datasource db { provider = "postgresql" }`
  - `generator client { provider = "prisma-client-js" }`
  - `FrameworkVersion` model (maps to `framework_version`)
  - `AnchoredThreshold` model (maps to `anchored_thresholds`)
  - `TsrHurdle` model (maps to `tsr_hurdles`, `base_hurdle_default` nullable for bucket 8)
- All RFC-002 column types, nullability, and defaults preserved
- Prisma model names are PascalCase; table names snake_case via `@@map`
- `prisma validate` passes

**RFC-002 Reference:** `framework_version`, `anchored_thresholds`, `tsr_hurdles` sections

---

### TASK-004-003: Write Prisma Schema — Stocks Table

**Description:** Add the `Stock` model to `prisma/schema.prisma`. This is the central entity; all other domain tables reference it.

**Acceptance Criteria:**
- `Stock` model (maps to `stocks`) with all 45+ columns from RFC-002
- NUMERIC columns use `Decimal @db.Decimal(m, n)`
- JSONB columns use `Json` type
- VARCHAR with limited length use `@db.VarChar(n)`
- `data_provider_provenance Json @default("{}")` (nullable)
- `data_quality_issues Json @default("[]")`
- Indexes defined via `@@index` matching RFC-002 index definitions
- `prisma validate` passes

**RFC-002 Reference:** `stocks` table (includes all growth/profitability/balance-sheet/valuation metric columns)

---

### TASK-004-004: Write Prisma Schema — Classification and Valuation State Tables

**Description:** Add `ClassificationState`, `ClassificationHistory`, `ValuationState`, `ValuationHistory` models to `prisma/schema.prisma`.

**Acceptance Criteria:**
- `ClassificationState` model (maps to `classification_state`) with FK to `Stock`
- `ClassificationHistory` model (maps to `classification_history`) with FK to `Stock`
- `ValuationState` model (maps to `valuation_state`) with FK to `Stock`
- `ValuationHistory` model (maps to `valuation_history`) with FK to `Stock`
- `reason_codes Json`, `scores Json`, `context_snapshot Json` defined correctly
- `suggested_bucket Int?` (nullable until classification runs)
- Indexes matching RFC-002 for all four tables
- Prisma relations defined with `@relation`
- `prisma validate` passes

**RFC-002 Reference:** `classification_state`, `classification_history`, `valuation_state`, `valuation_history` sections

---

### TASK-004-005: Write Prisma Schema — User Tables

**Description:** Add all nine user-scoped models to `prisma/schema.prisma`: `User`, `UserSession`, `UserMonitoredStock`, `UserClassificationOverride`, `UserValuationOverride`, `UserAlertPreferences`, `UserPreferences`, `UserOverrideHistory`, `UserMonitoringHistory`.

**Acceptance Criteria:**
- `User` model (maps to `users`), `user_id` is UUID with `@default(uuid())`
- `UserSession` with FK to `User`, `expires_at` indexed
- `UserMonitoredStock` with composite PK `(user_id, ticker)` and FKs to `User` and `Stock`
- `UserClassificationOverride` with composite PK and self-referential FK (`overridden_by`)
- `UserValuationOverride` with composite PK
- `UserAlertPreferences` with `muted_alert_families Json @default("[]")`
- `UserPreferences` with `default_filters Json @default("{}")`, `preferences Json @default("{}")`
- `UserOverrideHistory` with `BigInt @id @default(autoincrement())`
- `UserMonitoringHistory` with `BigInt @id @default(autoincrement())`
- Indexes matching RFC-002 for all nine tables
- `prisma validate` passes

**RFC-002 Reference:** All user-scoped table sections

---

### TASK-004-006: Write Prisma Schema — Alert Tables and Complete Schema

**Description:** Add `Alert` and `AlertHistory` models. Add `@@relation` names where needed. Complete the schema file and validate.

**Acceptance Criteria:**
- `Alert` model (maps to `alerts`) with FKs to `User` and `Stock`
- `AlertHistory` model (maps to `alert_history`) with FKs to `Alert`, `User`, `Stock`
- `detail_payload Json`, `alert_snapshot Json` defined correctly
- Dedup unique index: `@@unique([dedup_key])` with a `where` condition for partial uniqueness (raw SQL in migration)
- `@@index` for all RFC-002 indexes
- `prisma validate` passes (run `npx prisma validate`)
- Final schema covers all 19 tables

**RFC-002 Reference:** `alerts`, `alert_history` sections

---

### TASK-004-007: Generate Initial Migration and Apply to Test DB

**Description:** Start the Docker test database, run `prisma migrate dev --name init` to generate the initial migration SQL, verify it matches RFC-002, then add the partial indexes and alert dedup partial unique index via a second migration (raw SQL). Apply migrations to Docker test DB and verify all 19 tables created.

**Acceptance Criteria:**
- `prisma/migrations/TIMESTAMP_init/migration.sql` created
- `prisma/migrations/TIMESTAMP_add_partial_indexes/migration.sql` created with:
  - `CREATE INDEX CONCURRENTLY idx_stocks_in_universe ON stocks(in_universe) WHERE in_universe = TRUE`
  - `CREATE INDEX CONCURRENTLY idx_stocks_market_cap ON stocks(market_cap) WHERE in_universe = TRUE`
  - `CREATE UNIQUE INDEX CONCURRENTLY idx_alerts_dedup_active ON alerts(dedup_key) WHERE alert_state = 'active' AND suppressed = FALSE`
  - `CREATE INDEX CONCURRENTLY idx_alerts_user_active ON alerts(user_id, alert_state, triggered_at DESC) WHERE alert_state = 'active'`
  - `CREATE INDEX CONCURRENTLY idx_valuation_zone_interested ON valuation_state(valuation_zone) WHERE valuation_zone IN ('steal_zone', 'very_good_zone', 'comfortable_zone')`
- Docker test DB starts and migrations apply cleanly
- All 19 tables exist in test DB after migration

**Commands:**
```bash
# Start test DB
docker compose -f docker-compose.test.yml up -d

# Generate migration (uses DATABASE_URL from .env.test)
npx dotenv -e .env.test -- prisma migrate dev --name init

# Second migration for partial indexes
npx dotenv -e .env.test -- prisma migrate dev --name add_partial_indexes
```

---

### TASK-004-008: Create Prisma Client Singleton and Update Health Check

**Description:** Create the Prisma client singleton at `src/infrastructure/database/prisma.ts`. Update the health check endpoint to verify database connectivity by running `prisma.$queryRaw\`SELECT 1\``. Update Dockerfile to run `prisma generate` during build and `prisma migrate deploy` before app start.

**Acceptance Criteria:**
- `src/infrastructure/database/prisma.ts` exports singleton `PrismaClient` (handles hot-reload in dev)
- Traceability comment at top of file
- Health check endpoint updated to include `db` field:
  - `{"status":"healthy","db":"connected","timestamp":"...","service":"3aa-web"}` on success
  - `{"status":"degraded","db":"disconnected","error":"...","timestamp":"...","service":"3aa-web"}` on failure (returns 200 to not trip load balancer)
- `Dockerfile` updated: `RUN npx prisma generate` in build stage; `CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]`
- `postinstall` script runs `prisma generate` automatically

---

### TASK-004-009: Write Integration Tests — Schema and Constraint Verification

**Description:** Write two integration test files that verify the database schema is correct after migration. Tests run against the Docker test DB. Tests use the Prisma client to verify tables, insert/query to test constraints, and verify JSONB defaults.

**Test Files:**
- `tests/integration/database/schema.test.ts` — table and column verification
- `tests/integration/database/constraints.test.ts` — FK, JSONB, and unique constraint verification

**Acceptance Criteria for `schema.test.ts`:**
- `describe('EPIC-001/STORY-004: Database Schema — All 19 tables exist')` block
- Query `information_schema.tables` to verify each of the 19 table names exists
- Query `information_schema.columns` to verify key columns per table (at least 3 per table)
- Query `pg_indexes` to verify at least one index exists per table beyond PK
- All assertions pass against Docker test DB

**Acceptance Criteria for `constraints.test.ts`:**
- `describe('EPIC-001/STORY-004: Database Constraints')` block
- FK constraint: inserting `classification_state` for non-existent ticker throws (tests CASCADE behavior)
- Unique constraint: inserting duplicate `users.email` throws `P2002`
- JSONB default: creating `UserPreferences` without `preferences` field yields `{}` default
- JSONB array default: creating `UserAlertPreferences` without `muted_alert_families` yields `[]`
- NULL constraint: inserting `Stock` without `ticker` throws
- All assertions pass

**Setup/Teardown:**
- `beforeAll`: connect Prisma client to test DB
- `afterAll`: disconnect Prisma client, clean up test data
- `afterEach`: clean up rows inserted during test (in reverse FK order)

---

### TASK-004-010: Apply Migration to Production Cloud SQL and Update Tracking

**Description:** Apply the migration to the `aaa_production` Cloud SQL database using Cloud SQL Auth Proxy. Verify all 19 tables exist in production. Update IMPLEMENTATION-PLAN-V1.md and IMPLEMENTATION-LOG.md. Commit all changes.

**Acceptance Criteria:**
- Cloud SQL Auth Proxy started against `aaa-db` instance
- `prisma migrate deploy` runs successfully against `aaa_production`
- `SELECT tablename FROM pg_tables WHERE schemaname='public'` returns all 19 tables
- IMPLEMENTATION-PLAN-V1.md: STORY-004 status → done, progress → 4/9
- IMPLEMENTATION-LOG.md: completion entry added with full evidence
- Git commit: `[EPIC-001/STORY-004/TASK-004-010] Complete STORY-004: Prisma schema and migrations`
- No untracked files related to STORY-004

**Cloud SQL Auth Proxy Commands:**
```bash
# Download proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Start proxy (uses ADC credentials)
./cloud-sql-proxy aa-investor:us-central1:aaa-db --port=5433 &

# Run migration against production
DATABASE_URL="postgresql://aaa_user:PASSWORD@127.0.0.1:5433/aaa_production" npx prisma migrate deploy

# Verify tables
psql -h 127.0.0.1 -p 5433 -U aaa_user -d aaa_production -c "\dt"
```

---

## Traceability

**PRD Reference:** Section 4 (Data Model), Section 9C (Deployment)
**RFC Reference:** RFC-002 (Canonical Data Model & Persistence Layer)
**ADR References:**
- ADR-007 (Multi-User Architecture — shared vs user state)
- ADR-010 (Technology Stack — TypeScript + Next.js + Prisma)
- ADR-003 (Audit Trail — full state snapshots)

---

**Created:** 2026-04-20
**Last Updated:** 2026-04-20 05:00 UTC
