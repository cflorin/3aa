# STORY-005 — Create Framework Configuration Seed Data

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Populate anchored thresholds, TSR hurdles, and framework version tables with V1.0 configuration data, ensuring valuation and classification engines have the static framework parameters they require.

## Story
As a **system operator**,
I want **framework configuration data seeded (anchored thresholds, TSR hurdles, framework version)**,
so that **classification and valuation engines can operate with correct V1.0 parameters**.

## Outcome
- anchored_thresholds table populated with 16 codes (4AA, 4BA, 5AA, etc.)
- tsr_hurdles table populated with 7 buckets (Buckets 1-7)
- framework_version table populated with V1.0 metadata
- Seed data validated (thresholds descending, buckets complete)
- Seed migration created and applied
- Framework config immutable for V1 (no runtime modifications)

## Scope In
- Generate anchored thresholds data (canonical codes and threshold values from RFC-002, based on 3AA framework source)
- Generate TSR hurdles data (7 buckets from 3AA framework source, canonical values from RFC-002)
- Create framework_version metadata (version: '1.0.0', created_at, description)
- Write seed data migration (`prisma/migrations/YYYYMMDDHHMMSS_seed_framework_config/migration.sql`)
- Validate seed data (integration tests verify correct code count, bucket count, thresholds descending)
- Document framework config provenance (source document, date, version)
- Commit seed migration to GitHub repository

**Note:** Exact anchor codes, threshold values, and TSR hurdle values will be based on RFC-002 canonical definitions (created in STORY-002). This story implements seed migration using those canonical values.

## Scope Out
- Dynamic threshold updates (V1 framework config is immutable, frozen at deployment)
- User-defined thresholds (V2+ feature)
- Framework version upgrades (V1.1+ migrations)
- Threshold derivation logic (handled in valuation engine EPIC-005, not seed data)
- TSR hurdle computation logic (handled in valuation engine EPIC-005, not seed data)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 3 (3AA Framework - anchored thresholds), Section 3 (TSR Hurdles)
- **RFCs:** RFC-002 (Data Model - anchored_thresholds, tsr_hurdles, framework_version tables)
- **ADRs:** ADR-010 (Prisma migrations)
- **Upstream stories:** STORY-004 (Prisma schema and migrations - tables created)

## Preconditions
- Prisma schema and initial migration applied (STORY-004 completed)
- anchored_thresholds, tsr_hurdles, framework_version tables exist in database
- 3AA framework source document available (anchored thresholds table, TSR hurdles table)
- Understanding of V1 framework semantics (16 anchored codes, 7 TSR buckets)

## Inputs
- 3AA framework source document (anchored thresholds table with 16 codes)
- 3AA framework source document (TSR hurdles table with 7 buckets)
- Framework version metadata (version: '1.0.0', release date, description)

## Outputs
- `prisma/migrations/YYYYMMDDHHMMSS_seed_framework_config/migration.sql` (seed data migration)
- anchored_thresholds table populated (16 rows)
- tsr_hurdles table populated (7 rows)
- framework_version table populated (1 row: v1.0.0)
- Seed data validation tests (`tests/integration/framework-seed-validation.test.ts`)

## Acceptance Criteria
- [ ] Seed migration created (`prisma migrate dev --name seed_framework_config --create-only`)
- [ ] Migration SQL contains INSERT statements for anchored_thresholds (exact row count per RFC-002)
- [ ] Migration SQL contains INSERT statements for tsr_hurdles (7 rows)
- [ ] Migration SQL contains INSERT statement for framework_version (version: '1.0.0')
- [ ] Anchored thresholds data matches RFC-002 canonical codes exactly (all codes from RFC-002 present)
- [ ] Each anchored threshold has: code, bucket, earnings_quality, balance_sheet_quality, primary_metric, max_threshold, comfortable_threshold, very_good_threshold, steal_threshold
- [ ] Thresholds in descending order for each code (max > comfortable > very_good > steal)
- [ ] TSR hurdles data includes all 7 buckets (1, 2, 3, 4, 5, 6, 7)
- [ ] Each TSR hurdle has: bucket, base_hurdle_default, incremental_adjustment_for_A_earnings, incremental_adjustment_for_A_balance_sheet
- [ ] TSR hurdle values match RFC-002 canonical values
- [ ] Framework version metadata: version='1.0.0', description='V1 baseline framework', created_at=NOW()
- [ ] Seed migration applied to database (rows inserted)
- [ ] Seed data validation test passes (correct code count per RFC-002, 7 TSR buckets present)
- [ ] Threshold descending order validated (integration test: for each code, verify max > comfortable > very_good > steal)
- [ ] TSR hurdles completeness validated (integration test: query tsr_hurdles → 7 rows, buckets 1-7 all present)
- [ ] Migration idempotent (re-applying migration safe, uses INSERT ... ON CONFLICT DO NOTHING or equivalent)

## Test Strategy Expectations

**Unit tests:**
- Seed data structure validation (anchored thresholds array has 16 elements)
- Threshold ordering validation (for each code, max > comfortable > very_good > steal)
- TSR hurdles completeness (buckets 1-7 all present, no gaps)

**Integration tests:**
- Seed migration application (prisma migrate deploy → 16 anchored thresholds inserted, 7 TSR hurdles inserted, 1 framework version inserted)
- Anchored thresholds query (SELECT * FROM anchored_thresholds WHERE code='4AA' → returns max=22, comfortable=20, very_good=18, steal=16)
- TSR hurdles query (SELECT * FROM tsr_hurdles WHERE bucket=4 → returns base_hurdle_default=12.5, incremental_adjustment_for_A_earnings=2.0, incremental_adjustment_for_A_balance_sheet=1.5)
- Framework version query (SELECT * FROM framework_version → version='1.0.0', created_at set)
- Threshold descending order check (for all 16 codes, verify max > comfortable > very_good > steal)
- Seed data completeness (count rows: anchored_thresholds=16, tsr_hurdles=7, framework_version=1)

**Contract/schema tests:**
- Anchored thresholds schema compliance (all required columns present: code, bucket, earnings_quality, balance_sheet_quality, primary_metric, thresholds)
- TSR hurdles schema compliance (all required columns present: bucket, base_hurdle_default, adjustments)
- Framework version schema compliance (version, created_at, description columns present)

**BDD acceptance tests:**
- "Given seed migration applied, when querying anchored_thresholds, then 16 codes present"
- "Given seed migration applied, when querying tsr_hurdles, then 7 buckets present"
- "Given anchored threshold for code 4AA, when checking thresholds, then max > comfortable > very_good > steal"
- "Given TSR hurdle for bucket 4, when checking base hurdle, then base_hurdle_default=12.5"

**E2E tests:**
- Full framework config workflow (apply seed migration → query anchored thresholds → query TSR hurdles → valuation engine uses thresholds)

## Regression / Invariant Risks

**Seed data corruption:**
- Risk: Manual edit changes thresholds, violates descending order (max < comfortable)
- Protection: CHECK constraint in database (STORY-004), integration test validates ordering

**Incomplete seed data:**
- Risk: Missing anchored codes (only 15 codes inserted, code 8CB missing)
- Protection: Integration test counts rows, validates all 16 codes present

**Seed data overwrite:**
- Risk: Re-running seed migration overwrites existing framework config (thresholds changed)
- Protection: Migration uses INSERT ... ON CONFLICT DO NOTHING (idempotent), or guard with IF NOT EXISTS

**Framework version mismatch:**
- Risk: Code expects v1.1.0 framework, but database has v1.0.0 (schema mismatch)
- Protection: Application startup validates framework_version matches expected version

**Threshold value errors:**
- Risk: Typo in seed data (4AA max_threshold=220 instead of 22)
- Protection: Integration test validates known threshold values, code review of seed migration

**Invariants to protect:**
- Anchored thresholds always 16 codes (complete coverage for V1)
- TSR hurdles always 7 buckets (Buckets 1-7, no gaps)
- Thresholds always descending (max > comfortable > very_good > steal)
- Framework config immutable (no UPDATE statements on anchored_thresholds, tsr_hurdles in V1)
- Framework version always v1.0.0 for V1 (no version upgrades in V1)

## Key Risks / Edge Cases

**Framework source data edge cases:**
- Source document has 17 anchored codes (V1 only uses 16, exclude 1 code)
- Source document thresholds not descending (data error, fix before seeding)
- TSR hurdles missing bucket (source has buckets 1-6 only, bucket 7 missing)

**Seed migration edge cases:**
- Migration run twice (INSERT ... ON CONFLICT DO NOTHING prevents duplicates)
- Seed migration run before schema migration (tables don't exist, migration fails)
- Seed data inserted manually (migration detects existing rows, skips)

**Threshold value edge cases:**
- Threshold values with decimals (max_threshold=22.5, comfortable=20.0, acceptable for V1)
- Threshold values equal (max_threshold=22, comfortable=22, violates descending order, reject)
- Negative thresholds (steal_threshold=-5, invalid, reject in validation)

**TSR hurdle edge cases:**
- Negative adjustment values (incremental_adjustment_for_A_earnings=-1.0, check if valid)
- Zero base hurdle (base_hurdle_default=0 for bucket 8, acceptable)
- Adjustment precision (incremental_adjustment=2.5 vs 2.50, both acceptable)

**Framework version edge cases:**
- Version format (v1.0.0 vs 1.0.0 vs V1, use canonical format: '1.0.0')
- Multiple framework versions (V1 has only 1 version row, no multiple versions in V1)
- Version upgrade migration (V1.1 migration updates framework_version.version, out of scope for STORY-005)

## Definition of Done

- [ ] Seed migration created with INSERT statements for anchored_thresholds (16 rows), tsr_hurdles (7 rows), framework_version (1 row)
- [ ] Seed migration applied to database (all rows inserted)
- [ ] Seed data validation tests added and passing (16 codes, 7 buckets, thresholds descending)
- [ ] Integration tests verify known threshold values (4AA max=22, comfortable=20, very_good=18, steal=16)
- [ ] Integration tests verify TSR hurdles (bucket 4 base_hurdle_default=12.5)
- [ ] Framework version validated (version='1.0.0' present in database)
- [ ] Seed migration idempotence tested (apply twice, no errors)
- [ ] Seed migration committed to GitHub repository
- [ ] Framework config provenance documented (source document referenced in migration comments)
- [ ] Traceability links recorded (migration comments reference PRD Section 3, RFC-002)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 3 (3AA Framework - anchored thresholds, TSR hurdles)
- **RFC:** RFC-002 (Data Model - anchored_thresholds, tsr_hurdles, framework_version tables)
- **ADR:** ADR-010 (Prisma migrations)

---

**END STORY-005**
