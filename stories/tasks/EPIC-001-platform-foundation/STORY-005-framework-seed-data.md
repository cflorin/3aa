# STORY-005 — Create Framework Configuration Seed Data

## Metadata
- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **Story ID:** STORY-005
- **Status:** done
- **Priority:** High
- **Dependencies:** STORY-004 (database tables exist)
- **Estimated Effort:** Medium (1 day)
- **Assigned:** Claude (implementation)

---

## Story Description

As the system owner, I need the database to be pre-populated with the canonical framework configuration data — anchored valuation thresholds, TSR hurdles, and the framework version record — so that the valuation engine and monitoring alerts can operate from day one without requiring manual data entry.

This seed data is derived from the frozen baseline documents (source_of_truth_investment_framework_3AA.md, 3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md) and must exactly match those specifications.

---

## Acceptance Criteria

- [ ] `framework_version` table contains exactly 1 row: version `v1.0`
- [ ] `anchored_thresholds` table contains exactly 16 rows matching the spec
- [ ] `tsr_hurdles` table contains exactly 8 rows (one per bucket 1–8) matching the spec
- [ ] Seed script is idempotent — running it twice produces no duplicates, no errors
- [ ] Seed runs automatically in the Cloud Build pipeline (after `prisma migrate deploy`)
- [ ] All 10 integration tests pass against the test database
- [ ] All 16 threshold rows pass the ordering invariant: `max > comfortable > very_good > steal`
- [ ] Bucket 8 TSR hurdle has `baseHurdleDefault = null`
- [ ] TSR hurdle adjustments match spec exactly: EQ_A=-1.0, EQ_B=0.0, EQ_C=+2.5, BS_A=-0.5, BS_B=0.0, BS_C=+1.75
- [ ] Production seed applied and verified via Cloud Run Job
- [ ] Tracking documentation updated

---

## Task Breakdown

### TASK-005-001: Write story spec
- **Status:** done
- **Description:** Document story, acceptance criteria, tasks, BDD scenarios, and seed data values
- **Output:** This document

### TASK-005-002: Create Prisma seed script (`prisma/seed.ts`)
- **Status:** planned
- **Description:** Implement idempotent seed using Prisma upsert for all 3 tables
- **Acceptance Criteria:**
  - Uses `prisma.frameworkVersion.upsert` on `version`
  - Uses `prisma.anchoredThreshold.upsert` on `code` (16 rows)
  - Uses `prisma.tsrHurdle.upsert` on `bucket` (8 rows)
  - Script runs with `ts-node prisma/seed.ts`
  - No errors on first or subsequent runs (idempotent)

### TASK-005-003: Configure Prisma seed in package.json
- **Status:** planned
- **Description:** Add `prisma.seed` config so `npx prisma db seed` works
- **Acceptance Criteria:**
  - `package.json` has `"prisma": { "seed": "ts-node prisma/seed.ts" }`
  - `npm run db:seed` script added
  - `npm run db:seed:prod` script added for production (via dotenv)

### TASK-005-004: Create seed integration tests
- **Status:** planned
- **Description:** Integration tests verifying all seed rows exist with correct values
- **File:** `tests/integration/database/seed.test.ts`
- **Test Count:** 16 tests
- **Coverage:**
  - framework_version: 1 row exists, version=v1.0
  - anchored_thresholds: exactly 16 rows, all 16 codes present
  - spot-check 4 anchor values (3AA, 4AA, 4BA, 5BB)
  - threshold ordering invariant holds for all 16 rows
  - tsr_hurdles: exactly 8 rows, all buckets 1-8
  - spot-check TSR hurdle values (bucket 4=12.5, bucket 8=null)
  - adjustments match spec (EQ_A=-1.0, EQ_C=+2.5, BS_A=-0.5, BS_C=+1.75)
  - idempotency: run seed twice, still 16/8/1 rows

### TASK-005-005: Update migrator to run seed after migrations
- **Status:** planned
- **Description:** Modify Dockerfile migrator CMD to run `migrate deploy && db seed`
- **Acceptance Criteria:**
  - Migrator CMD: `sh -c "node .../prisma migrate deploy && npx prisma db seed"`
  - Or: separate shell script `migrate-and-seed.sh`
  - Dockerfile migrator stage updated

### TASK-005-006: Apply seed to production, verify
- **Status:** planned
- **Description:** Trigger Cloud Build or execute Cloud Run Job to seed production
- **Acceptance Criteria:**
  - Cloud Run Job `aaa-migrate` execution succeeds with both migrate + seed
  - Query `SELECT COUNT(*) FROM anchored_thresholds` = 16 (verified via health endpoint or log)
  - Query `SELECT COUNT(*) FROM tsr_hurdles` = 8

### TASK-005-007: Update implementation tracking
- **Status:** planned
- **Description:** Update IMPLEMENTATION-PLAN-V1.md and IMPLEMENTATION-LOG.md
- **Acceptance Criteria:**
  - STORY-005 status → done
  - Progress: 5/9 stories complete (56%)
  - Implementation log entry with all evidence

---

## BDD Scenarios

### Feature: Framework Version Seeding
```
Feature: Framework version record exists
  Background:
    Given the seed script has been run at least once

  Scenario: Framework version v1.0 exists
    When I query the framework_version table
    Then there is exactly 1 row
    And the row has version = 'v1.0'
    And the row has description = '3AA Investment Classification and Monitoring Framework - Initial V1'
    And effective_until IS NULL

  Scenario: Seed is idempotent
    When I run the seed script a second time
    Then there is still exactly 1 row in framework_version
    And no duplicate or error is raised
```

### Feature: Anchored Threshold Seeding
```
Feature: Anchored thresholds seeded from framework spec
  Background:
    Given the seed script has been run at least once

  Scenario: Exactly 16 threshold anchors exist
    When I query the anchored_thresholds table
    Then there are exactly 16 rows
    And all codes are: 1AA, 1BA, 2AA, 2BA, 3AA, 3BA, 4AA, 4BA, 5AA, 5BA, 5BB, 6AA, 6BA, 6BB, 7AA, 7BA

  Scenario: 4AA threshold matches source of truth
    When I look up code = '4AA'
    Then bucket = 4
    And earnings_quality = 'A'
    And balance_sheet_quality = 'A'
    And primary_metric = 'forward_pe'
    And max_threshold = 22.00
    And comfortable_threshold = 20.00
    And very_good_threshold = 18.00
    And steal_threshold = 16.00

  Scenario: 3AA uses special Berkshire metric
    When I look up code = '3AA'
    Then primary_metric = 'forward_operating_earnings_ex_excess_cash'
    And max_threshold = 18.50
    And comfortable_threshold = 17.00
    And very_good_threshold = 15.50
    And steal_threshold = 14.00

  Scenario: 4BA Adobe-archetype threshold matches spec
    When I look up code = '4BA'
    Then max_threshold = 14.50
    And comfortable_threshold = 13.00
    And very_good_threshold = 11.50
    And steal_threshold = 10.00

  Scenario: 5BB EV/EBIT threshold matches spec
    When I look up code = '5BB'
    Then primary_metric = 'forward_ev_ebit'
    And max_threshold = 15.00
    And comfortable_threshold = 13.00
    And very_good_threshold = 11.00
    And steal_threshold = 9.00

  Scenario: Threshold ordering invariant holds for all rows
    When I query all anchored_thresholds rows
    Then for every row: max > comfortable > very_good > steal

  Scenario: No Bucket 8 anchors exist
    When I query anchored_thresholds where bucket = 8
    Then the result is empty

  Scenario: Seed is idempotent
    When I run the seed script a second time
    Then there are still exactly 16 rows
    And no duplicate or error is raised
```

### Feature: TSR Hurdle Seeding
```
Feature: TSR hurdles seeded from framework spec
  Background:
    Given the seed script has been run at least once

  Scenario: Exactly 8 TSR hurdle rows exist (one per bucket)
    When I query the tsr_hurdles table
    Then there are exactly 8 rows
    And buckets 1 through 8 are all present

  Scenario: Bucket 4 TSR hurdle matches spec
    When I look up bucket = 4
    Then base_hurdle_label = '12-13%'
    And base_hurdle_default = 12.50

  Scenario: Bucket 8 has null base hurdle (no normal hurdle for speculation)
    When I look up bucket = 8
    Then base_hurdle_label = 'No normal hurdle'
    And base_hurdle_default IS NULL

  Scenario: Quality adjustments match spec for all buckets
    When I query any TSR hurdle row
    Then earnings_quality_a_adjustment = -1.00
    And earnings_quality_b_adjustment = 0.00
    And earnings_quality_c_adjustment = 2.50
    And balance_sheet_a_adjustment = -0.50
    And balance_sheet_b_adjustment = 0.00
    And balance_sheet_c_adjustment = 1.75

  Scenario: TSR hurdle formula produces correct adjusted hurdles
    Given bucket = 4, base_hurdle_default = 12.50
    When earnings_quality = 'A' and balance_sheet_quality = 'A'
    Then adjusted_tsr_hurdle = 12.50 + (-1.00) + (-0.50) = 11.00
    # Note: adjusted_hurdle is computed at query time, not stored in this table

  Scenario: Seed is idempotent
    When I run the seed script a second time
    Then there are still exactly 8 rows in tsr_hurdles
    And no duplicate or error is raised
```

---

## Seed Data Reference

### framework_version (1 row)
| version | description |
|---------|-------------|
| v1.0 | 3AA Investment Classification and Monitoring Framework - Initial V1 |

### anchored_thresholds (16 rows)
| code | bucket | earningsQuality | balanceSheetQuality | primaryMetric | max | comfortable | veryGood | steal |
|------|--------|-----------------|---------------------|---------------|-----|-------------|----------|-------|
| 1AA | 1 | A | A | forward_pe | 10.00 | 8.50 | 7.00 | 5.50 |
| 1BA | 1 | B | A | forward_pe | 8.50 | 7.00 | 5.50 | 4.00 |
| 2AA | 2 | A | A | forward_pe | 16.00 | 14.00 | 12.50 | 11.00 |
| 2BA | 2 | B | A | forward_pe | 13.50 | 12.00 | 10.50 | 9.00 |
| 3AA | 3 | A | A | forward_operating_earnings_ex_excess_cash | 18.50 | 17.00 | 15.50 | 14.00 |
| 3BA | 3 | B | A | forward_pe | 15.00 | 13.50 | 12.00 | 10.50 |
| 4AA | 4 | A | A | forward_pe | 22.00 | 20.00 | 18.00 | 16.00 |
| 4BA | 4 | B | A | forward_pe | 14.50 | 13.00 | 11.50 | 10.00 |
| 5AA | 5 | A | A | forward_ev_ebit | 20.00 | 17.00 | 14.50 | 12.00 |
| 5BA | 5 | B | A | forward_ev_ebit | 17.00 | 15.00 | 13.00 | 11.00 |
| 5BB | 5 | B | B | forward_ev_ebit | 15.00 | 13.00 | 11.00 | 9.00 |
| 6AA | 6 | A | A | ev_sales | 12.00 | 10.00 | 8.00 | 6.00 |
| 6BA | 6 | B | A | ev_sales | 9.00 | 7.00 | 5.50 | 4.00 |
| 6BB | 6 | B | B | ev_sales | 7.00 | 5.50 | 4.50 | 3.00 |
| 7AA | 7 | A | A | ev_sales | 18.00 | 15.00 | 11.00 | 8.00 |
| 7BA | 7 | B | A | ev_sales | 14.00 | 11.00 | 8.50 | 6.00 |

### tsr_hurdles (8 rows, uniform adjustments across all buckets)
| bucket | baseHurdleLabel | baseHurdleDefault | EQ_A | EQ_B | EQ_C | BS_A | BS_B | BS_C |
|--------|-----------------|-------------------|------|------|------|------|------|------|
| 1 | 14-16%+ | 15.00 | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |
| 2 | 10-11% | 10.50 | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |
| 3 | 11-12% | 11.50 | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |
| 4 | 12-13% | 12.50 | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |
| 5 | 14-16% | 15.00 | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |
| 6 | 18-20%+ | 19.00 | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |
| 7 | 25%+ | 25.00 | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |
| 8 | No normal hurdle | NULL | -1.00 | 0.00 | 2.50 | -0.50 | 0.00 | 1.75 |

---

## Implementation Notes

### Idempotency Strategy
Use Prisma `upsert` with the unique key as the `where` clause. On conflict, update all fields to the spec values. This allows re-running the seed after spec corrections without manual cleanup.

### Execution Order
1. `framework_version` first (no dependencies)
2. `anchored_thresholds` second
3. `tsr_hurdles` third

None of these tables have FK relationships to each other, so order is for clarity only.

### Production Deployment
The migrator Cloud Run Job CMD is updated to run:
```
prisma migrate deploy && prisma db seed
```

This ensures migrations and seed data are always applied together in the correct order during each deployment.

### Decimal Comparison in Tests
Prisma returns `Decimal` objects (not native JS numbers) for decimal fields. Tests must use `.toNumber()` or `Number()` for comparison, or compare with `new Decimal(value)`.

---

## Traceability
- **PRD:** /docs/prd/source_of_truth_investment_framework_3AA.md
- **Threshold Spec:** /docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md
- **RFC:** /docs/rfc/RFC-002-canonical-data-model-persistence.md (anchored_thresholds, tsr_hurdles, framework_version tables)
- **Schema:** /prisma/schema.prisma (AnchoredThreshold, TsrHurdle, FrameworkVersion models)
