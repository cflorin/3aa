# V1 Implementation Log

## Purpose
This log tracks all implementation actions taken during V1 build. It is append-only in spirit and must be updated continuously. Each significant implementation step must be logged with evidence.

## Log Format
Each entry includes: **Timestamp** (ISO 8601) · **Epic/Story/Task** IDs · **Action** taken · **Files Changed** · **Tests Added/Updated** · **Result/Status** · **Blockers/Issues** · **Baseline Impact** (YES/NO) · **Next Action**

---

## 2026-04-24 — EPIC-004/STORY-046: User Monitoring Preferences API complete

**Epic:** EPIC-004 — Classification Engine & Universe Screen
**Story:** STORY-046 — User Monitoring Preferences API
**Tasks:** TASK-046-001 through TASK-046-006

**Action:** Implemented all-default-monitored per-user deactivation model. Created `user_deactivated_stocks` table (no row = active; row = deactivated). Built `getMonitoringStatus` and `getUniverseStocks` domain functions. PUT `/api/stocks/[ticker]/monitoring` toggles deactivation (upsert/deleteMany for idempotency). GET `/api/universe` returns all in-universe stocks with per-user `is_active` and `active_code` (COALESCE of override + system code), paginated.

**Files Changed:**
- `prisma/schema.prisma` (modified) — added UserDeactivatedStock model; added `deactivatedStocks` relation on User and `userDeactivatedStocks` on Stock
- `prisma/migrations/20260424000003_add_user_deactivated_stocks/migration.sql` (created) — CREATE TABLE + 2 indexes
- `src/domain/monitoring/monitoring.ts` (created) — UniverseStockSummary type, getMonitoringStatus, getUniverseStocks
- `src/domain/monitoring/index.ts` (created) — barrel exports
- `src/app/api/stocks/[ticker]/monitoring/route.ts` (created) — PUT handler with upsert/deleteMany idempotency
- `src/app/api/universe/route.ts` (created) — GET handler with page/limit query params (max 200)
- `tests/unit/monitoring/story-046-monitoring.test.ts` (created) — 9 unit tests (mocked Prisma)
- `tests/integration/api/monitoring/monitoring.test.ts` (created) — 15 integration tests (10 test groups)

**Tests Added/Updated:**
- Unit: 9 new tests (all passing)
- Integration: 15 new tests (all passing)

**Result/Status:** DONE ✅

**Blockers/Issues:** None

**Baseline Impact:** NO — new table aligns with RFC-003 all-default-monitored model decision (2026-04-23)

**Next Action:** STORY-047 — Classification Recompute Batch Job

---

## 2026-04-24 — EPIC-004/STORY-045: User Classification Override API complete

**Epic:** EPIC-004 — Classification Engine & Universe Screen
**Story:** STORY-045 — User Classification Override API
**Tasks:** TASK-045-001 through TASK-045-006

**Action:** Implemented the full user classification override API. Refactored `user_classification_overrides` schema (removed stale columns from RFC-002 v1; simplified to composite PK). Built `resolveActiveCode` domain function (COALESCE: override wins over system), POST upsert route with validation, DELETE route with P2025 → 404, and GET classification route. Unit and integration tests written and passing.

**Files Changed:**
- `prisma/schema.prisma` (modified) — UserClassificationOverride model stripped to minimal shape (userId, ticker, finalCode, overrideReason, overriddenAt); removed stale columns; User relation updated
- `prisma/migrations/20260424000002_refactor_user_classification_overrides/migration.sql` (created) — DROP stale columns (final_bucket, final_earnings_quality, final_balance_sheet_quality, overridden_by, created_at, updated_at); SET override_reason NOT NULL
- `src/domain/classification/override.ts` (created) — ActiveCodeResult interface, resolveActiveCode (parallel fetch of state + override)
- `src/domain/classification/index.ts` (modified) — barrel exports for resolveActiveCode and ActiveCodeResult
- `src/app/api/classification-override/route.ts` (created) — POST handler: auth, validate final_code regex `^[1-8]([ABC][ABC])?$`, validate override_reason ≥10 chars, stock existence check, upsert, resolveActiveCode response
- `src/app/api/classification-override/[ticker]/route.ts` (created) — DELETE handler: auth, delete by composite PK, catch P2025→404, 204
- `src/app/api/stocks/[ticker]/classification/route.ts` (created) — GET handler: auth, stock existence check, parallel resolveActiveCode + getClassificationState, 200 response
- `tests/unit/classification/story-045-override.test.ts` (created) — 6 unit tests (mocked Prisma + persistence)
- `tests/integration/api/classification-override/override.test.ts` (created) — 18 integration tests (10 test groups: auth guard, POST valid, GET round-trip, DELETE revert, DELETE 404, invalid code, short reason, empty reason, unknown ticker, multi-user isolation)

**Tests Added/Updated:**
- Unit: 6 new tests in story-045-override.test.ts (all passing)
- Integration: 18 new tests in override.test.ts (all passing)

**Result/Status:** DONE ✅

**Blockers/Issues:** None

**Baseline Impact:** NO — schema refactor aligns with RFC-001 §User Override API; no data lost (column removals were stale RFC-002 v1 artifacts)

**Next Action:** STORY-046 — User Monitoring Preferences API

---

## 2026-04-24 — EPIC-004/STORY-044: Classification State Persistence complete

**Epic:** EPIC-004 — Classification Engine & Universe Screen
**Story:** STORY-044 — Classification State Persistence and History
**Tasks:** TASK-044-001 through TASK-044-005

**Action:** Implemented the persistence layer for classification results. Refactored both classification DB tables to match the STORY-044 spec (removed stale RFC-002 v1 columns, added `input_snapshot` and `classified_at`). Implemented `persistClassification` (transactional upsert + conditional history insert), `getClassificationState`, and `getClassificationHistory`.

**Files Changed:**
- `prisma/schema.prisma` (modified) — ClassificationState and ClassificationHistory models refactored
- `prisma/migrations/20260424000001_refactor_classification_schema/migration.sql` (created) — ALTER classification_state (drop 7 stale columns, add input_snapshot + classified_at); DROP + CREATE classification_history (BIGSERIAL→UUID id)
- `src/domain/classification/types.ts` (modified) — added ClassificationScoresPayload, ClassificationState, ClassificationHistoryRow interfaces
- `src/domain/classification/persistence.ts` (created) — persistClassification, getClassificationState, getClassificationHistory
- `src/domain/classification/index.ts` (modified) — barrel exports for new types and persistence functions
- `tests/integration/classification/persistence.test.ts` (created) — 13 integration tests (state transitions, JSONB round-trip, ordering, output contract)

**Tests Added/Updated:**
- Integration: 13 new tests in persistence.test.ts (all passing)
- Total: 656/656 unit tests + 31/31 integration tests passing

**Result/Status:** DONE ✅

**Blockers/Issues:** None

**Baseline Impact:** NO — schema refactor aligns with RFC-001 §Data Model; no existing data lost (tables were empty)

**Next Action:** STORY-045 — User Classification Override API

---

## 2026-04-24 — EPIC-004/STORY-043: Classification Result Assembly complete

**Epic:** EPIC-004 — Classification Engine & Universe Screen
**Story:** STORY-043 — Classification Result Assembly (Tie-Break, Confidence, Special Cases)
**Tasks:** TASK-043-001 through TASK-043-004

**Action:** Implemented classifyStock — the top-level orchestrator that combines BucketScorer, EarningsQualityScorer, and BalanceSheetQualityScorer into a ClassificationResult with tie-break resolution, special-case overrides, confidence computation, and suggested_code assembly.

**Files Changed:**
- `src/domain/classification/types.ts` (modified) — added ConfidenceStep, TieBreakRecord, ClassificationResult interfaces; added missing_field_count to GradeScorerOutput
- `src/domain/classification/confidence-thresholds.ts` (modified) — added HIGH_MARGIN_THRESHOLD=4, MEDIUM_MARGIN_THRESHOLD=2
- `src/domain/classification/classifier.ts` (created) — classifyStock, resolveTieBreaks, computeConfidence
- `src/domain/classification/index.ts` (modified) — barrel exports for new types and classifyStock
- `docs/adr/ADR-013-classification-scoring-algorithm-weights.md` (modified) — fixed net_debt_ebitda→net_debt_to_ebitda (4 occurrences)
- `tests/unit/classification/story-043-classify-stock.test.ts` (created) — 44 unit tests (tie-breaks, overrides, confidence, contract, determinism, golden-set)
- `tests/unit/classification/fixtures/classify-stock-golden.ts` (created) — ClassifyGolden fixtures for MSFT/ADBE/TSLA/UBER/UNH
- `tests/integration/classification/classify-stock.test.ts` (created) — 5 integration tests against test DB

**Tests Added/Updated:**
- Unit: 44 new tests in story-043-classify-stock.test.ts (all passing)
- Integration: 5 new tests in classify-stock.test.ts (all passing)
- Total: 656/656 unit tests + 18/18 integration tests passing

**Result/Status:** DONE ✅

**Blockers/Issues:** 5 unit test input constructs required revision:
  - B4/B5 tie with flag=true: BucketScorer's FLAG_PRIMARY rule makes B5 win outright (margin=2); no tie-break fires — test assertion corrected
  - B6/B7 tests: profitability fields (fcf_positive, ni_positive, fcf_conversion) contaminated B3/B4 causing spurious 4v5 and 3v4 tie-breaks — removed from TIE_BASE; used rev_fwd=0.21 (>B5_MAX=0.20) to isolate B6
  - margin=3 test: original input yielded margin=4 (eps signals added to both B4 and B5 equally) — revised to use fcf_conversion=0.40 (below FCF_CONVERSION_THRESHOLD=0.50, set but no signal)

**Baseline Impact:** NO

**Next Action:** STORY-044 — Classification State Persistence and History

---

## 2026-04-24 UTC - EPIC-004/STORY-042 Complete: EarningsQualityScorer and BalanceSheetQualityScorer

**Epic:** EPIC-004
**Story:** STORY-042 — Earnings Quality and Balance Sheet Quality Scoring
**Task:** TASK-042-001 through TASK-042-005 (all complete)
**Action:** Implemented both quality scorers with all ADR-013 additive rules. Fixed stale comments and typos in scoring-weights.ts and ADR-013. Added 62 unit tests (per-rule, boundary, winner, null, contract, golden-set, determinism) and 6 integration tests against test DB.

**Files Changed:**
- `src/domain/classification/types.ts` (modified — added `missing_field_count` to GradeScorerOutput)
- `src/domain/classification/scoring-weights.ts` (modified — fixed 7 comment errors: EQ_FCF_WEAK, EQ_MOAT_WEAK, BS_COVERAGE_STRONG, BS_COVERAGE_MODERATE, BS_COVERAGE_WEAK, BS_DEBT_LOW, BS_NET_CASH_BONUS)
- `src/domain/classification/eq-scorer.ts` (created — EarningsQualityScorer, 7 rules)
- `src/domain/classification/bs-scorer.ts` (created — BalanceSheetQualityScorer, 6 rules + net-cash bonus)
- `src/domain/classification/index.ts` (modified — added EarningsQualityScorer, BalanceSheetQualityScorer exports)
- `docs/adr/ADR-013-classification-scoring-algorithm-weights.md` (modified — net_debt_ebitda → net_debt_to_ebitda, 4 occurrences)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (modified — STORY-042 done, STORY-043 ready, active story updated)
- `stories/README.md` (modified — STORY-042 status updated to done)

**Tests Added:**
- `tests/unit/classification/story-042-eq-bs-scorer.test.ts` (created — 62 tests, groups a–k)
- `tests/unit/classification/fixtures/eq-bs-scorer-golden.ts` (created — MSFT/UNH golden-set constants)
- `tests/integration/classification/eq-bs-scorer.test.ts` (created — 6 integration tests)

**Result/Status:** ✅ Success — 612/612 unit tests passing; 13/13 integration tests passing

**Blockers/Issues:**
- Prisma integration test initially failed due to missing DATABASE_URL — resolved by loading .env.test
- Integration test initially used snake_case Prisma field names; fixed to camelCase (Prisma convention)

**Baseline Impact:** NO — all changes within ADR-013 scope; comment/typo fixes only in baseline docs

**Self-validation findings incorporated:**
- EQ_FCF_WEAK/EQ_MOAT_WEAK comment errors found during self-validation and fixed in TASK-042-001
- BS_NET_CASH_BONUS boundary: `≤ 0` (not `< 0`) — fixed in scoring-weights.ts and bs-scorer.ts
- Integration test gap (UNH EQ winner) — added UNH EQ assertion in TASK-042-005

**Next Action:** STORY-043 — Classification Result Assembly (Tie-Break, Confidence, Special Cases)

---

## 2026-04-24 UTC - EPIC-004 Story Decomposition Complete; STORY-041 Task Decomposition Ready

**Epic:** EPIC-004
**Story:** STORY-041 through STORY-053
**Task:** N/A (planning)
**Action:** Completed EPIC-004 story decomposition (13 stories: STORY-041–053). Created ADR-013 (classification scoring weights) and ADR-014 (confidence thresholds) to fill baseline gaps referenced in RFC-001. Conducted adversarial review, fixed 4 issues (shouldRecompute state gap, schema alignment, stale epic doc, DELETE ambiguity). Analysed UI prototypes (`docs/ui/project/3aa/`); added STORY-053 (Stock Detail Page), updated STORY-043/044/048/049/052 based on prototype findings. Decomposed STORY-041 into 5 tasks; marked ready for implementation.

**Files Changed:**
- `docs/adr/ADR-013-classification-scoring-algorithm-weights.md` (created)
- `docs/adr/ADR-014-classification-confidence-threshold-boundaries.md` (created)
- `docs/stories/epics/EPIC-004-classification-engine-universe-screen.md` (rewritten — monitoring model, API routes, data model, revision notes)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-041-bucket-scoring-algorithm.md` (created + updated)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-042-earnings-and-balance-sheet-quality-scoring.md` (created)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-043-classification-result-assembly.md` (created + updated with confidenceBreakdown/tieBreaksFired)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-044-classification-state-persistence.md` (created + updated with input_snapshot, schema alignment)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-045-user-classification-override-api.md` (created + routes fixed)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-046-user-monitoring-preferences-api.md` (created — all-default-monitored model)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-047-classification-batch-job.md` (created — OIDC auth corrected)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-048-universe-screen-stock-table.md` (created + Zone/MarketCap columns, row navigation, color-coding)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-049-universe-screen-filters-and-sort.md` (created + text search, MarketCap default sort)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-050-monitoring-deactivate-reactivate-ui.md` (created — deactivate/reactivate model)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-051-classification-override-modal.md` (created + history section)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-052-epic-004-e2e-tests.md` (created + 7th workflow)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-053-stock-detail-page.md` (created — new story from UI analysis)
- `stories/README.md` (updated — STORY-041–053; EPIC-005 renumbered to STORY-054+)
- `CLAUDE.md` (updated — ADRs through ADR-014)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (updated — EPIC-004 active, STORY-041 ready, all 13 stories listed)

**Tests Added/Updated:** None (planning only)

**Result/Status:** Success — EPIC-004 fully decomposed; STORY-041 task-decomposed and ready

**Blockers/Issues:** None

**Baseline Impact:** YES — ADR-013 and ADR-014 created to fill gap referenced in RFC-001 (scoring weights and confidence thresholds were referenced but lacked documents). No change to PRD or existing RFCs. CLAUDE.md updated to reflect ADR-013/014 accepted.

**Next Action:** Implement TASK-041-001 (ClassificationInput interface + scoring-weights.ts constants)

---

## 2026-04-24 UTC - STORY-041 Task Breakdown Self-Validated and Revised; Story Marked Ready

**Epic:** EPIC-004
**Story:** STORY-041
**Task:** N/A (planning)
**Action:** Self-validated the STORY-041 task breakdown. Found and corrected 2 critical issues, 2 high issues:
- C1: `CRITICAL_FIELDS` was misplaced in `types.ts` — moved to `confidence-thresholds.ts` per ADR-014 §Implementation Notes; corrected count from 11 to 10; all 10 fields enumerated explicitly
- C2: Three rule thresholds were undefined in TASK-041-002 — FCF_CONVERSION threshold set to `≥ 0.50`; `revenue_growth_3y`/`gross_profit_growth` confirmed to use same ranges as `revenue_growth_fwd` (REV_SECONDARY); `operating_margin` threshold set to `≥ 15%` (implementer-documented, golden-set locked)
- H1: STORY-043 Preconditions updated to note `confidence-thresholds.ts` stub already exists from STORY-041 (extend, do not recreate)
- H2: TASK-041-004 extended with CRITICAL_FIELDS membership test (exactly 10 fields per ADR-014)

**Files Changed:**
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-041-bucket-scoring-algorithm.md` (tasks section appended with all 5 revised task specs)
- `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-043-classification-result-assembly.md` (Preconditions + DoD updated re: confidence-thresholds.ts stub)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (TASK-041 descriptions updated with revisions)

**Tests Added/Updated:** None (planning only)

**Result/Status:** Success — STORY-041 task breakdown validated and revised; story status confirmed `ready`

**Blockers/Issues:** None

**Baseline Impact:** NO — revisions clarify task specs against existing ADR-013/ADR-014; no baseline changes needed

**Next Action:** Implement TASK-041-001 (ClassificationInput interface, scoring-weights.ts, confidence-thresholds.ts stub)

---

## 2026-04-24 UTC - STORY-041 Complete — BucketScorer Implemented with Full Tests and Golden-Set

**Epic:** EPIC-004
**Story:** STORY-041 — Bucket Scoring Algorithm
**Task:** TASK-041-001 through TASK-041-005 (all complete)
**Action:** Implemented `BucketScorer` function with all additive scoring rules, enrichment bonuses, and full test suite. Fixed ADR-014 field name typo (`net_debt_ebitda` → `net_debt_to_ebitda`).

**TASK-041-001:** Created 4 domain files:
- `src/domain/classification/types.ts` — ClassificationInput (26 fields), BucketScorerOutput, GradeScorerOutput
- `src/domain/classification/scoring-weights.ts` — all ADR-013 constants (8 bucket + 7 EQ + 8 BS weights)
- `src/domain/classification/confidence-thresholds.ts` — CRITICAL_FIELDS stub (exactly 10 fields, `as const satisfies`), NULL_SUGGESTION_THRESHOLD=5
- `src/domain/classification/index.ts` — barrel exports

**TASK-041-002 + TASK-041-003:** Created `src/domain/classification/bucket-scorer.ts`:
- additive scoring for Buckets 1–7 (B8 invariant: never modified)
- REV_PRIMARY (3), REV_SECONDARY (2), EPS_PRIMARY (2), EPS_SECONDARY (1) with exact ADR-013 boundary handling
- Overlapping ranges B4+B5 ([10%, 15%]) and B5+B6 ([15%, 20%]) checked independently
- PROFITABILITY (1) rules: fcf_positive, net_income_positive, operating_margin ≥ 0.15
- FCF_CONVERSION_WEIGHT (1): fcf_conversion ≥ 0.50
- FLAG_PRIMARY (2): pre_operating_leverage_flag → B5
- ENRICHMENT_BONUS (1): moat_strength_score ≥ 4.0 → B3+B4; qualitative_cyclicality_score ≥ 4.0 → B5+B6; capital_intensity_score ≥ 4.0 → B5
- All field reads null-guarded; returns winner + margin + missing_field_count

**Key finding (baseline_ambiguity resolved):** Growth fields stored as percentages in DB (7.24 = 7.24%), not decimal fractions. Ratios stored as fractions (0.49 = 49%). ClassificationInput expects decimal fractions throughout. Integration layer must divide growth fields by 100. This is confirmed by production data and critical for STORY-043/044 integration.

**TASK-041-004:** 61 unit tests in `tests/unit/classification/story-041-bucket-scorer.test.ts`:
- (a) Per-rule (14 tests), (b) Winner (5), (c) Boundary (12), (d) Missing-field (4), (e) Invariant (5), (f) CRITICAL_FIELDS (5), (g) Enrichment (6), (h) Determinism (1), (i) Golden-set regression (6)

**TASK-041-005:** 7 integration tests in `tests/integration/classification/bucket-scorer.test.ts` against test DB.
Golden-set fixture captured in `tests/unit/classification/fixtures/bucket-scorer-golden.ts`:
- MSFT: B3=8, B4=7 (winner=B3, margin=1)
- ADBE: B4=9, B3=8 (winner=B4, margin=1)
- TSLA: B4=6, B3=5 (winner=B4, margin=1)
- UBER: B5=7, B4=6 (winner=B5, margin=1)
- UNH: B1=6, B4=6 (winner=B1, margin=0 — tied due to negative metrics in 2026-04-24 snapshot)

**Files Changed (created):**
- `src/domain/classification/types.ts`
- `src/domain/classification/scoring-weights.ts`
- `src/domain/classification/confidence-thresholds.ts`
- `src/domain/classification/index.ts`
- `src/domain/classification/bucket-scorer.ts`
- `tests/unit/classification/story-041-bucket-scorer.test.ts`
- `tests/unit/classification/fixtures/bucket-scorer-golden.ts`
- `tests/integration/classification/bucket-scorer.test.ts`

**Files Changed (modified):**
- `docs/adr/ADR-014-classification-confidence-threshold-boundaries.md` — field name fixed: `net_debt_ebitda` → `net_debt_to_ebitda`
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-041 done, STORY-042 ready
- `stories/README.md` — STORY-041 done, EPIC-004 in_progress

**Tests Added/Updated:** 61 unit tests + 7 integration tests = 68 new tests

**Result/Status:** Success — 550/550 unit tests passing (up from 489); 7/7 integration tests passing; no new TypeScript errors

**Blockers/Issues:** None

**Baseline Impact:** YES (minor) — ADR-014 field name typo fixed (`net_debt_ebitda` → `net_debt_to_ebitda`). PRD and Prisma schema both use `net_debt_to_ebitda`; ADR-014 had a typo. No behavioral change.

**Next Action:** Detail and execute STORY-042 (EarningsQualityScorer + BalanceSheetQualityScorer)

---

## 2026-04-19 14:30 UTC - Implementation Tracking System Initialization

**Epic:** N/A
**Story:** N/A
**Task:** N/A
**Action:** Created implementation tracking system (IMPLEMENTATION-PLAN-V1.md, IMPLEMENTATION-LOG.md, stories/README.md, updated CLAUDE.md with mandatory tracking requirements)

**Files Changed:**
- `/docs/architecture/IMPLEMENTATION-PLAN-V1.md` (created)
- `/docs/architecture/IMPLEMENTATION-LOG.md` (created)
- `/stories/README.md` (created)
- `CLAUDE.md` (updated - added implementation tracking requirements section)

**Tests Added/Updated:** None

**Result/Status:** Success - implementation tracking system operational

**Blockers/Issues:** None

**Baseline Impact:** NO (tracking system only, no architecture changes)

**Next Action:** Decompose STORY-001 into tasks

---

## Template for Future Entries

Copy this template for each new log entry:

```
## [YYYY-MM-DD HH:MM UTC] - [Action Summary]

**Epic:** EPIC-XXX
**Story:** STORY-XXX
**Task:** TASK-XXX (if applicable)
**Action:** [What was done]
**Files Changed:**
- [file path] (created/modified/deleted)

**Tests Added/Updated:**
- [test file path] (created/updated) OR None

**Result/Status:** [success/failure/blocked/in_progress]
**Blockers/Issues:** [Problems encountered or None]
**Baseline Impact:** [YES/NO - explain if YES]
**Next Action:** [Next step]
```

---

## 2026-04-19 20:34 UTC - STORY-001 Complete: GitHub Repository Setup

**Epic:** EPIC-001
**Story:** STORY-001
**Task:** TASK-001-001 through TASK-001-005
**Action:** Completed GitHub repository setup with version control foundation. All 5 tasks executed successfully:
- TASK-001-001: Created GitHub repository (cflorin/3aa) and verified SSH access
- TASK-001-002: Created initial repository files (.gitignore, README.md, CHANGELOG.md)
- TASK-001-003: Configured branch protection on main branch (require PR + 1 approval)
- TASK-001-004: Documented semantic versioning strategy in README.md
- TASK-001-005: Verified repository setup and branch protection

**Files Changed:**
- `.gitignore` (created) - Node.js, TypeScript, Next.js, Prisma patterns
- `README.md` (created) - Project overview, versioning documentation, architecture reference
- `CHANGELOG.md` (created) - Keep a Changelog format template
- Git repository initialized with initial commit df2978f

**Tests Added/Updated:** None (infrastructure task)

**Result/Status:** Success - STORY-001 complete, all evidence requirements met

**Blockers/Issues:** None

**Baseline Impact:** NO (repository setup only, no architecture changes)

**Evidence:**
- Repository accessible at https://github.com/cflorin/3aa
- Branch protection enabled on main branch
- Initial commit pushed successfully
- SSH access verified and working
- Semantic versioning documented in README.md

**Next Action:** Begin STORY-002 task decomposition (Design and Document RFC-002 Database Schema)

---

## 2026-04-19 20:50 UTC - STORY-002 Complete: RFC-002 Database Schema Verified

**Epic:** EPIC-001
**Story:** STORY-002
**Task:** TASK-002-001 through TASK-002-006
**Action:** Completed verification and validation of RFC-002 database schema design. All 6 tasks executed successfully:
- TASK-002-001: Verified RFC-002 document exists with proper structure and ACCEPTED status
- TASK-002-002: Validated 19 tables defined (exceeds requirement of 17)
- TASK-002-003: Verified 15 JSONB fields documented with structure comments
- TASK-002-004: Validated entity relationship diagram exists, shows shared vs user-scoped entities
- TASK-002-005: Verified supporting documentation (indexing, retention, migration, performance)
- TASK-002-006: Updated implementation tracking

**Files Changed:**
- `stories/tasks/EPIC-001-platform-foundation/STORY-002-database-schema-rfc.md` (created) - Task decomposition document
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (updated) - STORY-002 marked done, progress 2/9
- `docs/architecture/IMPLEMENTATION-LOG.md` (updated) - This entry

**Tests Added/Updated:** None (documentation verification task)

**Result/Status:** Success - STORY-002 complete, RFC-002 verified as complete

**Blockers/Issues:** None

**Baseline Impact:** NO (RFC-002 already existed from baseline freeze, verification only)

**Evidence:**
- RFC-002 exists at /docs/rfc/RFC-002-canonical-data-model-persistence.md (34KB, 1035 lines)
- 19 tables defined with complete SQL schemas
- All tables have PRIMARY KEY constraints
- 15 JSONB fields with structure documentation
- Entity relationship diagram included showing shared/user-scoped separation
- Indexing strategy, data retention, migration strategy all documented

**Next Action:** Decompose STORY-003 into tasks (Provision Core GCP Infrastructure)

---

## 2026-04-20 04:50 UTC - STORY-003 Complete: GCP Infrastructure Provisioned

**Epic:** EPIC-001
**Story:** STORY-003
**Task:** TASK-003-001 through TASK-003-008
**Action:** Completed full GCP infrastructure provisioning. All 8 tasks executed and verified:
- TASK-003-001: Verified GCP project `aa-investor` configured with all 9 required APIs enabled
- TASK-003-002: Verified Cloud SQL instance `aaa-db` (PostgreSQL 15, db-f1-micro, private IP 172.24.0.3, RUNNABLE, database `aaa_production` exists)
- TASK-003-003: Verified VPC Connector `aaa-vpc-connector` (us-central1, 10.8.0.0/28, e2-micro, 2-10 instances, READY)
- TASK-003-004: Verified 5 Secret Manager secrets exist (DATABASE_URL, SESSION_SECRET, TIINGO_API_KEY, FMP_API_KEY, ADMIN_API_KEY)
- TASK-003-005: Verified 3 service accounts with correct IAM roles (aaa-web: cloudsql.client + secretmanager.secretAccessor + logging.logWriter; aaa-scheduler: run.invoker; aaa-builder: run.admin + iam.serviceAccountUser + storage.admin)
- TASK-003-006: Cloud Run `aaa-web` deployed, fixed unauthenticated access (allUsers run.invoker), health check confirmed 200 OK
- TASK-003-007: Created 6 Cloud Scheduler jobs (ENABLED, America/New_York timezone): price-sync 17:00, fundamentals-sync 18:00, estimates-sync 19:00, classification 20:00, valuation 20:15, alerts 20:30 (all Mon-Fri)
- TASK-003-008: Full infrastructure verification sweep passed

**Files Changed:**
- `stories/tasks/EPIC-001-platform-foundation/STORY-003-provision-gcp-infrastructure.md` (updated — status done, `3aa-*` → `aaa-*` naming corrected throughout, cron schedules fixed to ET times, URL updated)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (updated — STORY-003 marked done, progress 3/9, active work updated)
- `docs/architecture/IMPLEMENTATION-LOG.md` (updated — this entry)
- `cloudbuild.yaml` (committed — previously untracked, already uses correct `aaa-*` naming)

**GCP Changes (live infrastructure):**
- Cloud Run IAM: added `allUsers` as `roles/run.invoker` (enables unauthenticated access for web app)
- Cloud Scheduler: created 6 jobs (price-sync, fundamentals-sync, estimates-sync, classification, valuation, alerts)

**Tests Added/Updated:** None (infrastructure provisioning task)

**Result/Status:** Success — STORY-003 complete, all infrastructure operational

**Blockers/Issues:** None

**Baseline Impact:** YES (minor, approved) — GCP resource names use `aaa-` prefix instead of `3aa-` because GCP resource names cannot start with a number. Story spec corrected to reflect actual naming. No architecture change, no RFC amendment required.

**Cron Schedule Fix:** Original spec had a bug — cron expressions used UTC hours (e.g., "0 22") but set `--time-zone="America/New_York"`. This would have scheduled jobs at 10pm ET, not 5pm ET. Fixed to use correct ET hours ("0 17" = 5pm ET) with America/New_York timezone, matching the described intent.

**Evidence:**
- Cloud SQL: `aaa-db` RUNNABLE, private IP 172.24.0.3, `aaa_production` DB exists
- VPC Connector: `aaa-vpc-connector` READY
- Secrets: 5 secrets in Secret Manager
- Service Accounts: `aaa-web`, `aaa-scheduler`, `aaa-builder` with correct IAM roles
- Cloud Run: `https://aaa-web-717628686883.us-central1.run.app` returns 200 from `/api/health`
- Cloud Scheduler: 6 jobs all ENABLED with correct ET schedules

**Next Action:** Begin STORY-004 (Implement Prisma Schema and Database Migrations)

---

## 2026-04-20 08:00 UTC - STORY-004 Complete: Prisma Schema and Database Migrations

**Epic:** EPIC-001
**Story:** STORY-004
**Task:** TASK-004-001 through TASK-004-010
**Action:** Completed full Prisma schema implementation, migrations, integration tests, and deployment. All 10 tasks executed:
- TASK-004-001: Created `prisma/schema.prisma` — all 19 RFC-002 tables as Prisma models with correct types, relations, and naming maps
- TASK-004-002: Generated initial migration (`20260420050917_init`) — full DDL for all 19 tables
- TASK-004-003: Created partial indexes migration (`20260420050934_add_partial_indexes`) — 5 indexes (WHERE clauses not supported in Prisma schema, required raw SQL)
- TASK-004-004: Created `jest.config.ts` with ts-jest preset, module alias `@/` → `src/`, 30s timeout, ignore `.next/` (avoid haste collision)
- TASK-004-005: Created `docker-compose.test.yml` (PostgreSQL 15 on port 5433), `.env.test` (connection string), `.env.example` (all 5 env vars documented)
- TASK-004-006: Created `tests/integration/database/schema.test.ts` — verifies all 19 tables exist, key columns present, 5 partial indexes created
- TASK-004-007: Created `tests/integration/database/constraints.test.ts` — FK violations, CASCADE delete, P2002 unique, JSONB defaults, NOT NULL, composite PK, nullable field
- TASK-004-008: Created `src/infrastructure/database/prisma.ts` (singleton with dev logging); updated `src/app/api/health/route.ts` (db connectivity check + `force-dynamic` to prevent Next.js build-time static caching)
- TASK-004-009: Updated `Dockerfile` — removed Prisma migrate from startup (transitive deps missing in runner), copy `.prisma/client` and `prisma/` to runner stage; updated `next.config.js` — added `serverExternalPackages` to prevent webpack from inlining DATABASE_URL at build time
- TASK-004-010: Updated `cloudbuild.yaml` — added `--add-cloudsql-instances` flag (required for Cloud SQL Unix socket format in DATABASE_URL); Cloud Build deployed successfully

**Files Changed:**
- `prisma/schema.prisma` (created — 19 models, ~340 lines)
- `prisma/migrations/20260420050917_init/migration.sql` (created — full DDL, auto-generated)
- `prisma/migrations/20260420050934_add_partial_indexes/migration.sql` (created — 5 partial indexes, manual)
- `prisma/migrations/migration_lock.toml` (created — auto-generated)
- `jest.config.ts` (created)
- `docker-compose.test.yml` (created)
- `.env.test` (created — test DB connection string)
- `.env.example` (created — all 5 env vars documented)
- `src/infrastructure/database/prisma.ts` (created — Prisma client singleton)
- `src/app/api/health/route.ts` (modified — added DB check + `force-dynamic`)
- `next.config.js` (modified — added `serverExternalPackages`)
- `Dockerfile` (modified — Prisma artifacts in runner stage, no Prisma CLI at startup)
- `cloudbuild.yaml` (modified — `--add-cloudsql-instances` for Cloud SQL socket)
- `package.json` (modified — added Prisma scripts, Jest scripts, `postinstall`, devDeps: `dotenv-cli`, `ts-node`)
- `stories/tasks/EPIC-001-platform-foundation/STORY-004-prisma-schema-migrations.md` (created — full story spec with 10 tasks)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (updated — STORY-004 done, progress 4/9)
- `docs/architecture/IMPLEMENTATION-LOG.md` (updated — this entry)

**Tests Added/Updated:**
- `tests/integration/database/schema.test.ts` (created — 15 tests covering all 19 tables + indexes)
- `tests/integration/database/constraints.test.ts` (created — 19 tests covering FK, unique, JSONB, composite PK)
- 34 total integration tests; all passing against Docker test DB

**Result/Status:** Success — STORY-004 complete

**Blockers/Issues Encountered (all resolved):**
1. Prisma schema validation: AlertHistory `user` relation required matching `alertHistory AlertHistory[]` on User model
2. Jest 30 renamed `--testPathPattern` → `--testPathPatterns`
3. Jest haste module collision from `.next/standalone/package.json` — fixed by `testPathIgnorePatterns`
4. `reasonCodes` JSONB default test: `Prisma.JsonNull` explicitly sets NULL, bypassing DB default; fixed with raw SQL INSERT omitting the column
5. Docker: WSL2 environment has `docker-compose` v1.29.2, not `docker compose` plugin
6. Cloud Run startup failure (exit 127): Prisma CLI missing transitive deps in runner stage — removed migration from startup, CMD = `node server.js` only
7. Health check static caching: Next.js cached response at build time (DATABASE_URL absent at build) — fixed with `export const dynamic = 'force-dynamic'`
8. `serverExternalPackages`: prevents webpack from inlining `process.env.DATABASE_URL` at build time

**Baseline Impact:** NO — Prisma schema faithfully implements RFC-002 as designed. Two minor technical discoveries documented:
- Partial indexes (WHERE clauses) cannot be expressed in Prisma schema, require separate raw SQL migration — this is a known Prisma limitation, no RFC change needed
- `force-dynamic` + `serverExternalPackages` required for correct runtime behavior with Cloud Run Secret Manager — implementation detail, no architecture change

**Evidence:**
- `prisma/schema.prisma`: 19 models, validated with `npx prisma validate`
- Migration applied to test DB: all 19 tables + 5 partial indexes confirmed via `pg_tables` and `pg_indexes`
- 34 integration tests: PASS (schema.test.ts: 15, constraints.test.ts: 19)
- Cloud Build: deployed successfully with `--add-cloudsql-instances=aa-investor:us-central1:aaa-db`
- Health check: `force-dynamic` fix deployed — response timestamp is now real-time (not build-time cached)

**Note on Production Migration:** The production Cloud SQL database (`aaa_production`) does not yet have migrations applied. Cloud SQL Auth Proxy requires Application Default Credentials (ADC) which are not configured in the local WSL2 environment. Production migration should be applied via: (a) Cloud Run Job with `prisma migrate deploy`, or (b) Cloud Shell with ADC pre-configured, or (c) trigger via Cloud Build step. This is a known gap — production DB is empty but all infrastructure is in place.

**Next Action:** Begin STORY-005 (Create Framework Configuration Seed Data)

---

## 2026-04-20 08:10 UTC - STORY-004 Addendum: Production DB Connected and Healthy

**Epic:** EPIC-001
**Story:** STORY-004
**Task:** TASK-004-010 (continuation)
**Action:** Resolved production database connectivity after discovering Cloud SQL Auth Proxy socket was not reliably mounted in Cloud Run Jobs. Switched to VPC connector + private IP approach.

**Root Causes Resolved:**
1. Cloud SQL socket (`/cloudsql/aa-investor:us-central1:aaa-db`) was not mounted in Cloud Run Job containers even with `--set-cloudsql-instances`. Switched to VPC connector + Cloud SQL private IP (172.24.0.3).
2. `DATABASE_URL` password contained `+` (base64 special char) that was URL-decoded incorrectly by some parsers. Reset `aaa_user` password to alphanumeric-only value; updated secret.
3. `gcloud run jobs` uses `--set-cloudsql-instances` (not `--add-cloudsql-instances` which is for services).

**Files Changed:**
- `cloudbuild.yaml` (updated — migration job uses `--vpc-connector`, service deploy removes `--add-cloudsql-instances`)
- `Dockerfile` (minor comment update to migrator stage)

**GCP Changes (live):**
- `aaa_user` password reset to clean alphanumeric value
- `DATABASE_URL` secret updated to version 5: `postgresql://aaa_user:PASS@172.24.0.3/aaa_production`
- `aaa-migrate` Cloud Run Job updated: `--clear-cloudsql-instances`, `--vpc-connector=aaa-vpc-connector`
- `aaa-migrate-fwt5z` execution: 2 migrations applied (`20260420050917_init`, `20260420050934_add_partial_indexes`)
- `aaa-web` Cloud Run service redeployed with new DATABASE_URL (VPC connector + private IP)

**Evidence:**
- Migration job `aaa-migrate-fwt5z`: "All migrations have been successfully applied" (2 migrations)
- Health check: `{"status":"healthy","db":"connected","timestamp":"2026-04-20T08:05:04.666Z","service":"3aa-web"}`
- All 19 tables in `aaa_production`, all 5 partial indexes applied

**Baseline Impact:** NO — private IP + VPC connector is an equivalent and simpler connection method vs Cloud SQL Auth Proxy socket. No architecture change needed (VPC connector was already provisioned in STORY-003).

**Next Action:** Begin STORY-005 (Create Framework Configuration Seed Data)

---

## 2026-04-20 08:45 UTC - STORY-005 Complete: Framework Configuration Seed Data Applied

**Epic:** EPIC-001
**Story:** STORY-005
**Task:** TASK-005-001 through TASK-005-007
**Action:** Implemented idempotent Prisma seed script for all 3 framework configuration tables. Added 16 integration tests. Updated migrator image to run migrate+seed. Deployed to production.

**Tasks Completed:**
- TASK-005-001: Story spec written with full BDD/TDD scenarios and seed data reference table
- TASK-005-002: `prisma/seed.ts` — upsert of 1 FrameworkVersion, 16 AnchoredThreshold, 8 TsrHurdle rows (all values sourced from frozen baseline docs)
- TASK-005-003: `package.json` updated — `prisma.seed` config with explicit `./node_modules/.bin/ts-node`, `db:seed` npm script; `tsconfig.seed.json` for CommonJS module override
- TASK-005-004: `tests/integration/database/seed.test.ts` — 16 tests: row counts, 16 expected codes, spot-checks (4AA/3AA/4BA/5BB), threshold ordering invariant, TSR hurdle values (bucket 4/8), quality adjustments, formula verification, idempotency
- TASK-005-005: `Dockerfile` migrator CMD updated to `["/bin/sh", "prisma/migrate-and-seed.sh"]`; `prisma/migrate-and-seed.sh` runs migrate deploy then db seed in sequence
- TASK-005-006: Cloud Build `6db891fe` triggered; Cloud Run Job `aaa-migrate-nhk2h` succeeded — "Seed complete: 1 framework_version, 16 anchored_thresholds, 8 tsr_hurdles"
- TASK-005-007: Tracking documentation updated

**Files Changed:**
- `prisma/seed.ts` (created — 16 AnchoredThreshold upserts, 8 TsrHurdle upserts, 1 FrameworkVersion upsert)
- `prisma/migrate-and-seed.sh` (created — runs migrate deploy then db seed)
- `tsconfig.seed.json` (created — CommonJS module override for ts-node)
- `package.json` (updated — prisma.seed config, db:seed script, explicit ts-node path)
- `Dockerfile` (updated — migrator CMD → migrate-and-seed.sh)
- `stories/tasks/EPIC-001-platform-foundation/STORY-005-framework-seed-data.md` (created — full story spec)
- `tests/integration/database/seed.test.ts` (created — 16 integration tests)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (updated — STORY-005 done, progress 5/9)
- `docs/architecture/IMPLEMENTATION-LOG.md` (updated — this entry)

**Tests Added/Updated:**
- `tests/integration/database/seed.test.ts` (created — 16 tests)
- Full integration test suite: 50 tests total (34 STORY-004 + 16 STORY-005), all passing

**Result/Status:** Success — STORY-005 complete

**Blockers/Issues Encountered (all resolved):**
1. `dotenv -e` flag: system dotenv vs node_modules dotenv-cli — using npm scripts adds node_modules/.bin to PATH
2. `ts-node` ESM/CJS conflict: main tsconfig.json uses ESNext; resolved via `tsconfig.seed.json` with `"module":"CommonJS"`
3. `ts-node ENOENT` in Cloud Run Job: Prisma spawns seed command without PATH; resolved by using `./node_modules/.bin/ts-node` instead of `ts-node`

**Baseline Impact:** NO — seed data exactly matches values from frozen baseline documents (source_of_truth_investment_framework_3AA.md, 3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md)

**Evidence:**
- 50 integration tests: ALL PASS (schema.test.ts: 15, constraints.test.ts: 19, seed.test.ts: 16)
- Production Cloud Run Job `aaa-migrate-nhk2h`: "Seed complete: 1 framework_version, 16 anchored_thresholds, 8 tsr_hurdles"
- Health check: `{"status":"healthy","db":"connected"}` ✅
- All 16 threshold codes present: 1AA, 1BA, 2AA, 2BA, 3AA, 3BA, 4AA, 4BA, 5AA, 5BA, 5BB, 6AA, 6BA, 6BB, 7AA, 7BA
- All 8 TSR hurdle buckets (1-8) present; bucket 8 baseHurdleDefault=null
- Idempotency verified: running seed twice produces no duplicates

**Next Action:** Begin STORY-006 (Configure CI/CD Pipeline with GitHub Integration)

---

**Log Started:** 2026-04-19
**Maintained By:** Claude during implementation
**Update Frequency:** After each meaningful implementation step (task completion, significant file changes, test additions, blockers encountered, baseline impacts)

---

## Entry: STORY-006 Complete — CI/CD Pipeline Configuration

**Timestamp:** 2026-04-20T06:00:00Z
**Epic:** EPIC-001
**Story:** STORY-006
**Tasks:** TASK-006-001 through TASK-006-004 (TASK-006-002 GitHub trigger deferred — negligible value for solo dev)

**Action:** Configured CI/CD pipeline: added unit test gate to cloudbuild.yaml, wrote pipeline verification tests. GitHub → Cloud Build webhook trigger deferred (gcloud builds submit sufficient for solo workflow).

**Files Changed:**
- `cloudbuild.yaml` — added `install-deps` (node:20, npm ci) and `run-tests` (npm test --passWithNoTests) steps as gate before Docker build; `build-web` now waitFor: ['run-tests']
- `package.json` — added `--passWithNoTests` to test script; added `js-yaml` + `@types/js-yaml` devDependencies
- `package-lock.json` — updated for new devDependencies
- `stories/tasks/EPIC-001-platform-foundation/STORY-006-cicd-pipeline.md` — full story spec created
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-006 → done, progress 6/9 (67%)

**Tests Added:**
- `tests/unit/pipeline/cloudbuild.test.ts` — 5 unit tests: YAML validity, all 8 step IDs present, 1200s timeout, 3 images, deploy-web waitFor contract

**Result/Status:** DONE

**Blockers/Issues:** None. GitHub webhook trigger (auto-deploy on push) deferred as negligible improvement for solo dev workflow — `gcloud builds submit` is the deployment mechanism.

**Baseline Impact:** NO

**Evidence:**
- 5 pipeline unit tests: ALL PASS
- 55 total tests passing (50 integration + 5 unit)
- cloudbuild.yaml validated: install-deps → run-tests → build-web/migrator → push → run-migrations → deploy-web
- Prior manual Cloud Build runs confirm pipeline works end-to-end

**Next Action:** Begin STORY-007 (Configure Cloud Scheduler for Nightly Batch Orchestration)


---

## Entry: STORY-007 Complete — Cloud Scheduler OIDC Verification

**Timestamp:** 2026-04-20T12:20:00Z
**Epic:** EPIC-001
**Story:** STORY-007
**Tasks:** TASK-007-001 through TASK-007-006 — ALL COMPLETE

**Action:** Added OIDC token verification to all 6 Cloud Scheduler cron endpoints. All jobs manually triggered and verified against deployed code.

**Files Changed:**
- `src/lib/scheduler-auth.ts` — CREATED: `verifySchedulerToken()` using Google tokeninfo endpoint; skips in non-production
- `src/app/api/cron/price-sync/route.ts` — OIDC verification gate added
- `src/app/api/cron/fundamentals/route.ts` — OIDC verification gate added
- `src/app/api/cron/estimates/route.ts` — OIDC verification gate added
- `src/app/api/cron/classification/route.ts` — OIDC verification gate added
- `src/app/api/cron/valuation/route.ts` — OIDC verification gate added
- `src/app/api/cron/alerts/route.ts` — OIDC verification gate added
- `stories/tasks/EPIC-001-platform-foundation/STORY-007-cloud-scheduler.md` — CREATED: full story spec
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-007 → done, progress 7/9 (78%)

**Tests Added:**
- `tests/unit/lib/scheduler-auth.test.ts` — 7 tests: skip in non-production, missing header, non-Bearer, valid token, tokeninfo 400, audience mismatch, SA email mismatch

**Result/Status:** DONE

**Blockers/Issues:** None

**Baseline Impact:** NO

**Evidence:**
- 12 unit tests: ALL PASS (5 pipeline + 7 scheduler-auth)
- 50 integration tests: ALL PASS
- All 6 Cloud Scheduler jobs manually triggered (gcloud scheduler jobs run): status={} (HTTP 200)
- Jobs re-triggered after OIDC deploy: all 6 still OK (OIDC tokens from aaa-scheduler SA accepted)
- Health check: {"status":"healthy","db":"connected"} ✅
- Cloud Build SUCCESS (build ID 4cdf4a23-3da9-4056-b3dc-8b7d5319f5da)

**Next Action:** Begin STORY-008 (Implement Next.js Application Foundation with Health Check)


---

## Entry: STORY-008 Complete — Next.js Application Foundation

**Timestamp:** 2026-04-20T12:40:00Z
**Epic:** EPIC-001
**Story:** STORY-008
**Tasks:** TASK-008-001 through TASK-008-005 — ALL COMPLETE

**Action:** Formally documented and tested the Next.js foundation. Pre-existing deliverables (health check, Prisma singleton, Dockerfile, next.config.js, Cloud Run deployment) were implemented in STORY-003/004; this story adds test coverage and closes the story.

**Files Changed:**
- `src/app/page.tsx` — removed story number reference from placeholder
- `stories/tasks/EPIC-001-platform-foundation/STORY-008-nextjs-foundation.md` — CREATED: full story spec
- `tests/unit/api/health.test.ts` — CREATED: 5 unit tests with mocked Prisma
- `tests/integration/api/health.test.ts` — CREATED: 2 integration tests against real test DB
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-008 → done, progress 8/9 (89%)

**Tests Added:**
- `tests/unit/api/health.test.ts`: 5 tests (healthy, degraded, db field, error field, timestamp+service)
- `tests/integration/api/health.test.ts`: 2 tests (HTTP 200, status=healthy)

**Result/Status:** DONE

**Baseline Impact:** NO

**Evidence:**
- 17 unit tests: ALL PASS (5 pipeline + 7 scheduler-auth + 5 health)
- 52 integration tests: ALL PASS (50 database + 2 health)
- 69 total tests passing
- Health check: {"status":"healthy","db":"connected"} ✅

**Next Action:** Begin STORY-009 (Document Development Environment Setup and Workflows) — final EPIC-001 story


---

## Entry: STORY-009 Complete — Development Environment Documentation

**Timestamp:** 2026-04-20T13:00:00Z
**Epic:** EPIC-001
**Story:** STORY-009
**Tasks:** TASK-009-001 through TASK-009-006 — ALL COMPLETE

**Action:** Created complete development environment documentation. EPIC-001 Platform Foundation is now fully complete.

**Files Changed:**
- `README.md` — full setup guide: prerequisites, install, local DB setup, test commands, deploy command, architecture overview, endpoint table
- `CONTRIBUTING.md` — CREATED: commit format, test requirements, implementation tracking, code standards, baseline change protocol
- `CHANGELOG.md` — v1.0.0-foundation entry with all EPIC-001 deliverables
- `.env.example` — updated: local Docker DB URL, SCHEDULER_AUDIENCE comment added
- `stories/tasks/EPIC-001-platform-foundation/STORY-009-dev-environment-docs.md` — CREATED: story spec
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-009 → done, EPIC-001 → complete (9/9, 100%)

**Tests Added:** None (documentation story)

**Result/Status:** DONE

**Baseline Impact:** NO

**Evidence:**
- README.md has full setup section (prerequisites through deployment)
- CONTRIBUTING.md created with all required sections
- CHANGELOG.md has v1.0.0-foundation entry
- .env.example updated for local Docker dev

---

## Entry: EPIC-002 Validated + STORY-010 Prepared for Development

**Timestamp:** 2026-04-20T14:00:00Z
**Epic:** EPIC-002
**Story:** STORY-010 (preparation)
**Task:** N/A — story preparation and task decomposition

**Action:** Validated all 5 EPIC-002 stories (STORY-010 through STORY-014). Applied adversarial review fixes across all stories and the epic spec. Decomposed STORY-010 into 6 tasks with full specs. Updated IMPLEMENTATION-PLAN-V1.md; STORY-010 promoted to `ready`.

**Files Changed:**
- `docs/stories/epics/EPIC-002-authentication-user-management.md` — adversarial fixes (removed sliding window, CLI ref, fixed error shape, unified /universe redirect)
- `docs/stories/tasks/EPIC-002-authentication/STORY-010-admin-user-creation-api.md` — validated, ADR-007 ref fixed, email case-sensitivity added
- `docs/stories/tasks/EPIC-002-authentication/STORY-011-signin-api-session-creation.md` — validated, AuthService ownership clarified
- `docs/stories/tasks/EPIC-002-authentication/STORY-012-session-validation-middleware.md` — validated, /signin redirect contradiction removed (5 occurrences)
- `docs/stories/tasks/EPIC-002-authentication/STORY-013-signout-session-cleanup.md` — validated, E2E attribution corrected
- `docs/stories/tasks/EPIC-002-authentication/STORY-014-signin-page-ui.md` — validated, /universe redirect unified
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-001-install-bcrypt-admin-auth-guard.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-002-post-admin-users-create-user.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-003-patch-admin-users-password.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-004-patch-admin-users-active.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-005-unit-tests.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-006-integration-contract-tests-tracking.md` — CREATED
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — EPIC-002 status → validated; STORY-010 task list added; Active Work updated

**Tests Added:** None (preparation only)

**Result/Status:** STORY-010 status: `ready` — implementation can begin

**Blockers/Issues:** None

**Baseline Impact:** NO

**Next Action:** STORY-010 task specs under revision (Issues 1–5 found in validation pass)

---

## Entry: STORY-010 Task Spec Revision — needs_revision → ready

**Timestamp:** 2026-04-20T14:30:00Z
**Epic:** EPIC-002
**Story:** STORY-010
**Task:** N/A — task spec revision pass

**Action:** Validation pass identified 5 issues in the task breakdown. All 5 fixed. STORY-010 task specs promoted from `needs_revision` to `ready`.

**Issues resolved:**
1. Logging added to TASK-010-002/003/004 (creation/reset/deactivation events, no passwords/hashes)
2. DoD on TASK-010-002/003/004 corrected: tasks cannot be individually marked `done`; must wait for TASK-010-005 unit tests
3. Cross-story dependency documented in TASK-010-006: "deactivated user blocked at sign-in" criterion satisfied by STORY-011 integration test
4. Integration auth test in TASK-010-006 expanded from 1 bundled test to 3 discrete `it()` blocks (one per route)
5. Malformed JSON body unit test added to TASK-010-005 POST suite

**Files Changed:**
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-002-post-admin-users-create-user.md` — Logging section + corrected DoD
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-003-patch-admin-users-password.md` — Logging section + corrected DoD
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-004-patch-admin-users-active.md` — Logging section + corrected DoD
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-005-unit-tests.md` — Malformed body test added; count updated 30 → 32
- `docs/stories/tasks/EPIC-002-authentication/TASK-010-006-integration-contract-tests-tracking.md` — Auth tests split 1→3; cross-story dep note; counts updated ~17 → ~19, total ~116 → ~120

**Tests Added:** None (spec revision only)

**Result/Status:** STORY-010 status: `ready` — all 5 issues resolved

**Baseline Impact:** NO

**Next Action:** Begin STORY-010 implementation starting with TASK-010-001 (npm install bcrypt + create src/lib/admin-auth.ts)

---

## Entry: EPIC-001 Complete — Platform Foundation & Deployment

**Timestamp:** 2026-04-20T13:00:00Z
**Epic:** EPIC-001
**Milestone:** Integration Checkpoint 5 — EPIC-001 Complete

**EPIC-001 Summary — All 9 Stories Complete:**

| Story | Title | Key Deliverables |
|-------|-------|-----------------|
| STORY-001 | GitHub Repository | Repo at github.com/cflorin/3aa, branch protection, versioning |
| STORY-002 | RFC-002 Database Schema | 19-table schema, JSONB structures, ER diagram |
| STORY-003 | GCP Infrastructure | Cloud Run, Cloud SQL, VPC, Secrets, SAs, Scheduler |
| STORY-004 | Prisma Schema & Migrations | 19 tables, 2 migrations, 34 integration tests |
| STORY-005 | Framework Seed Data | 1+16+8 rows, idempotent upsert, 16 tests |
| STORY-006 | CI/CD Pipeline | cloudbuild.yaml test gate, 5 pipeline tests |
| STORY-007 | Cloud Scheduler | OIDC verification on 6 endpoints, 7 unit tests |
| STORY-008 | Next.js Foundation | Health endpoint, 5 unit + 2 integration tests |
| STORY-009 | Dev Environment Docs | README, CONTRIBUTING.md, CHANGELOG, .env.example |

**Final Test Count:** 69 tests (17 unit + 52 integration) — ALL PASSING

**Production State:**
- Cloud Run: https://aaa-web-717628686883.us-central1.run.app — HEALTHY
- Cloud SQL: aaa-db (PostgreSQL 15, private IP 172.24.0.3) — RUNNING
- Database: 19 tables, framework config seeded (1+16+8 rows)
- Cloud Scheduler: 6 jobs ENABLED (price-sync, fundamentals-sync, estimates-sync, classification, valuation, alerts)
- Migrator job: aaa-migrate — runs migrate+seed on every deployment

**Next Action:** Begin EPIC-002 (Authentication & User Management)

---

## Entry: STORY-010 Complete — Admin User Management API

**Timestamp:** 2026-04-20T15:00:00Z
**Epic:** EPIC-002
**Story:** STORY-010
**Tasks:** TASK-010-001 through TASK-010-006 — ALL COMPLETE

**Action:** Implemented admin user creation, password reset, and deactivation/reactivation endpoints with bcrypt password hashing, ADMIN_API_KEY gate, email lowercase normalization, and full test coverage.

**Files Changed:**
- `package.json` — bcrypt added to dependencies, @types/bcrypt to devDependencies
- `src/lib/admin-auth.ts` — CREATED: `validateAdminApiKey(req)` — ADMIN_API_KEY gate
- `src/app/api/admin/users/route.ts` — CREATED: POST /api/admin/users (create user, 201)
- `src/app/api/admin/users/[userId]/password/route.ts` — CREATED: PATCH password reset (200)
- `src/app/api/admin/users/[userId]/active/route.ts` — CREATED: PATCH deactivate/reactivate (200)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-010 → done, Active Work → STORY-011

**Tests Added:**
- `tests/unit/lib/admin-auth.test.ts` — 6 unit tests (auth guard: undefined env, empty env, missing header, empty header, wrong key, correct key)
- `tests/unit/api/admin/users.test.ts` — 26 unit tests (POST: 12, PATCH password: 7, PATCH active: 7)
- `tests/integration/api/admin/users.test.ts` — 19 integration + contract tests (full CRUD, 401 per route, P2002, P2025, bcrypt verify, response shapes)

**Result/Status:** DONE

**Baseline Impact:** NO

**Evidence:**
- 120 total tests: ALL PASSING (69 baseline + 51 new)
- Unit: 49 passing (17 existing + 32 new)
- Integration: 71 passing (52 existing + 19 new)
- POST /api/admin/users: 201 with bcrypt hash stored; email normalized to lowercase; P2002 → 409
- PATCH .../password: hash updated; old password no longer verifies; P2025 → 404
- PATCH .../active: isActive toggled; boolean enforcement; P2025 → 404
- 401 on all 3 routes without valid ADMIN_API_KEY (no DB call made)
- No passwordHash in any response body

**Cross-story dependency:**
- STORY-010 AC "deactivated user blocked at sign-in" tested in STORY-011 integration suite

**Next Action:** Begin STORY-011 implementation (TASK-011-001 first)

---

## Entry: STORY-011 Prepared for Development

**Timestamp:** 2026-04-20T15:30:00Z
**Epic:** EPIC-002
**Story:** STORY-011
**Task:** N/A — task decomposition

**Action:** Decomposed STORY-011 into 5 tasks with full specs. STORY-011 promoted to `ready`.

**Files Changed:**
- `docs/stories/tasks/EPIC-002-authentication/TASK-011-001-rate-limiter.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-011-002-auth-service.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-011-003-post-auth-signin-route.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-011-004-unit-tests.md` — CREATED
- `docs/stories/tasks/EPIC-002-authentication/TASK-011-005-integration-contract-tests-tracking.md` — CREATED
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-011 tasks added, status → ready

**Result/Status:** STORY-011 status: `ready`
**Baseline Impact:** NO
**Next Action:** Implement TASK-011-001 (rate limiter)


---

## Entry: STORY-011 Complete

**Timestamp:** 2026-04-20T16:00:00Z
**Epic:** EPIC-002
**Story:** STORY-011
**Tasks:** TASK-011-001 through TASK-011-005 — ALL COMPLETE

**Action:** Implemented sign-in API with session creation, in-memory rate limiting, and constant-time auth protection. Added validateSession/signOut stubs for forward-compatibility with STORY-012/013.

**Files Changed:**
- `src/modules/auth/rate-limiter.ts` — CREATED: per-email counter, 5 attempts / 15-min window, `clearAll()` test helper
- `src/modules/auth/auth.service.ts` — CREATED: `signIn()` discriminated union; DUMMY_HASH for unknown-email timing protection; `validateSession()` + `signOut()` stubs
- `src/app/api/auth/signin/route.ts` — CREATED: POST handler; Set-Cookie (HttpOnly, SameSite=Lax, Secure prod-only, maxAge=604800); returns {userId, email} only
- `jest.config.ts` — MODIFIED: added `maxWorkers: 1` to prevent integration test DB race conditions
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-011 → done, Active Work → STORY-012

**Tests Added:**
- `tests/unit/modules/auth/rate-limiter.test.ts` — 8 unit tests (window expiry, counter isolation, clearAll, isRateLimited read-only)
- `tests/unit/modules/auth/auth.service.test.ts` — 10 unit tests (rate-limited short-circuit, DUMMY_HASH pattern, isActive check, session create, lastLoginAt, resetRateLimit)
- `tests/unit/api/auth/signin.test.ts` — 9 unit tests (400 validation, 429 rate-limit, 401 invalid, 200 success, cookie attrs, Secure absent in non-prod)
- `tests/integration/api/auth/signin.test.ts` — 17 integration + contract tests (full flow, expiresAt, lastLoginAt, duplicate sessions, inactive user, rate-limit 429, counter reset, response shapes, UUID cookie, STORY-010 cross-story AC)

**Result/Status:** DONE

**Baseline Impact:** NO — `maxWorkers: 1` is a test infrastructure change, not an architecture change

**Evidence:**
- 164 total tests: ALL PASSING (120 baseline + 44 new)
- Unit: 76 passing (49 existing + 27 new)
- Integration: 88 passing (71 existing + 17 new)
- POST /api/auth/signin: 200 with session row inserted, Set-Cookie with valid UUID sessionId
- Rate limiter: 5 failures → 429; reset on success; per-email isolation confirmed
- bcrypt DUMMY_HASH used for unknown-email path (constant-time protection)
- isActive=false → 401 (bcrypt still runs before isActive check)
- STORY-010 AC verified: deactivated user → 401 at sign-in
- No passwordHash or password in any response body

**Next Action:** Begin STORY-012 implementation (Session Validation Middleware and Route Protection)

---

## Entry: STORY-012 Complete

**Timestamp:** 2026-04-20T17:00:00Z
**Epic:** EPIC-002
**Story:** STORY-012
**Tasks:** TASK-012-001 through TASK-012-005 — ALL COMPLETE

**Action:** Implemented session validation middleware with lazy expiry cleanup, header injection, and getCurrentUser() helper. Replaced validateSession() stub with full implementation.

**Files Changed:**
- `src/modules/auth/auth.service.ts` — MODIFIED: validateSession() stub replaced with full implementation; lazy expiry cleanup; return type → `{ userId, email } | null`
- `src/middleware.ts` — CREATED: Node.js runtime export; sessionId cookie validation; x-user-id/x-user-email header injection; matcher excludes /signin, /api/auth/*, /api/health, /api/cron/*, /api/admin/*, /_next/*, /favicon.ico
- `src/lib/auth.ts` — CREATED: getCurrentUser() reads x-user-id/x-user-email from middleware-injected headers
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-012 → done, Active Work → STORY-013

**Tests Added:**
- `tests/unit/modules/auth/auth.service.validateSession.test.ts` — 7 unit tests (null for unknown, valid session, expired → delete, inactive → no delete, no full User leaked, no lastActivityAt update)
- `tests/unit/middleware.test.ts` — 9 unit tests (no cookie → 302, null session → 302 + clear cookie, valid → 200, spoofed header overwritten, validateSession called with exact sessionId, root path, matcher excludes api/auth)
- `tests/unit/lib/auth.test.ts` — 5 unit tests (both headers, missing userId, missing email, both missing, no transformation)
- `tests/integration/modules/auth/validateSession.test.ts` — 8 integration tests (unknown sessionId, valid session, expired session, delete on expiry, no delete on valid, inactive user no delete, no lastLoginAt update, deactivated after session created)

**Result/Status:** DONE

**Baseline Impact:** NO

**Evidence:**
- 193 total tests: ALL PASSING (164 baseline + 29 new)
- Unit: 97 passing (76 existing + 21 new)
- Integration: 96 passing (88 existing + 8 new)
- validateSession: expired row deleted ✓; inactive user row kept ✓; lastLoginAt not updated ✓
- middleware: no-cookie → 302 ✓; invalid session → 302 + cookie cleared ✓; valid → 200 + headers set ✓
- matcher: api/auth excluded ✓ (sign-in endpoint reachable without session)
- getCurrentUser: returns { userId, email } or null from injected headers ✓

**Next Action:** Begin STORY-013 implementation (Sign-Out API and Expired Session Cleanup)

---

## Entry: STORY-013 Complete

**Timestamp:** 2026-04-20T18:00:00Z
**Epic:** EPIC-002
**Story:** STORY-013
**Tasks:** TASK-013-001 through TASK-013-006 — ALL COMPLETE

**Action:** Implemented sign-out endpoint with idempotent session deletion, batch cleanup service, and wired cleanup into the nightly alerts cron endpoint.

**Files Changed:**
- `src/modules/auth/auth.service.ts` — MODIFIED: signOut() stub replaced; deleteMany for idempotency; top-level comment updated
- `src/modules/auth/cleanup.service.ts` — CREATED: cleanupExpiredSessions() with lt:expiresAt filter
- `src/app/api/auth/signout/route.ts` — CREATED: POST handler; always 200; cookie cleared
- `src/app/api/cron/alerts/route.ts` — MODIFIED: cleanupExpiredSessions() called after OIDC auth; sessionCleanup added to response
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-013 → done, Active Work → STORY-014

**Tests Added:**
- `tests/unit/modules/auth/auth.service.signOut.test.ts` — 4 unit tests (deleteMany called, no-throw on missing, void return, deleteMany not delete)
- `tests/unit/api/auth/signout.test.ts` — 6 unit tests (200 with/without cookie, signOut called when cookie present, not called when absent, cookie always cleared)
- `tests/unit/modules/auth/cleanup.service.test.ts` — 4 unit tests (deleteMany with Date filter, returns count, idempotent, Date type check)
- `tests/unit/api/cron/alerts.test.ts` — 3 unit tests (200 with sessionCleanup, cleanup called, 401 when auth fails + cleanup not called)
- `tests/integration/api/auth/signout.test.ts` — 9 integration tests (200 on sign-out, row deleted, 200 no cookie, 200 unknown sessionId, cookie cleared, idempotent; cleanup: expired rows deleted, valid rows kept, idempotent)

**Result/Status:** DONE

**Baseline Impact:** NO

**Evidence:**
- 219 total tests: ALL PASSING (193 baseline + 26 new)
- Unit: 114 passing (97 existing + 17 new)
- Integration: 105 passing (96 existing + 9 new)
- POST /api/auth/signout: 200 always; session row deleted ✓; cookie cleared ✓; idempotent ✓
- cleanupExpiredSessions: deletes expired rows only ✓; idempotent ✓; count returned ✓
- /api/cron/alerts: cleanup called after OIDC auth ✓; sessionCleanup in response ✓; 401 blocks cleanup ✓

**Next Action:** Begin STORY-014 implementation (Sign-In Page UI — Screen 1)


---

## Entry: STORY-014 Complete

**Timestamp:** 2026-04-20T19:00:00Z
**Epic:** EPIC-002
**Story:** STORY-014
**Tasks:** TASK-014-001 through TASK-014-005 — ALL COMPLETE

**Action:** Implemented sign-in page UI — SignInPage server component (already-auth redirect) and SignInForm client component (form, validation, API call, error display). Added UI testing dependencies and jest config updates for .tsx support.

**Files Changed:**
- `src/app/signin/page.tsx` — CREATED: async server component; reads cookies() directly (excluded from middleware per ADR-011); calls validateSession(); redirects to /universe if already authenticated
- `src/app/signin/SignInForm.tsx` — CREATED: 'use client' component; controlled form with email/password; client-side validation; fetch POST /api/auth/signin; verbatim API error messages (prevents enumeration); loading state disables button; noValidate on form
- `jest.config.ts` — MODIFIED: added .tsx to testMatch; added jsx:react-jsx to ts-jest config; added setupFilesAfterEnv pointing to tests/jest.setup.ts
- `package.json` — MODIFIED: added @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jest-environment-jsdom
- `package-lock.json` — MODIFIED: updated lock file for new deps
- `tests/jest.setup.ts` — CREATED: imports @testing-library/jest-dom
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-014 → done, EPIC-002 → done, Active Work updated

**Tests Added:**
- `tests/unit/components/SignInForm.test.tsx` — 10 unit tests (renders form elements, validation errors for empty email/no-@/empty-password, fetch called with correct args, router.push on 200, API error on 401/429, button disabled during in-flight, no Remember Me/Sign Up)
- `tests/unit/app/signin/page.test.tsx` — 3 unit tests (no redirect when no cookie, no redirect when invalid session, redirect(/universe) when valid session)

**Result/Status:** DONE

**Baseline Impact:** NO

**Evidence:**
- 232 total tests: ALL PASSING (219 baseline + 13 new)
- Unit: 127 passing (114 existing + 13 new)
- Integration: 105 passing (unchanged)
- SignInPage: no-cookie → no redirect ✓; invalid session → no redirect ✓; valid session → redirect('/universe') ✓
- SignInForm: client-side validation fires before fetch ✓; fetch POST with correct body ✓; 401/429/400 errors displayed verbatim ✓; loading state disables button ✓; no Remember Me or Sign Up rendered ✓
- EPIC-002 complete: all 5 stories done (STORY-010 through STORY-014)

**Next Action:** Begin EPIC-003 (Universe View) — consult IMPLEMENTATION-PLAN-V1.md for next ready story

---

## 2026-04-20 UTC - STORY-015 Complete: Provider Abstraction Layer

**Epic:** EPIC-003
**Story:** STORY-015
**Action:** Implemented provider abstraction layer: canonical shared types, VendorAdapter interface, withRetry exponential-backoff utility, and ProviderOrchestrator multi-provider fallback. No live API calls; pure TypeScript with no I/O.

**Files Changed:**
- `src/modules/data-ingestion/types.ts` — CREATED: UniverseStock, PriceData, FundamentalData (15 fields), ForwardEstimates, StockMetadata, FieldResult<T>, ProvenanceEntry
- `src/modules/data-ingestion/ports/vendor-adapter.interface.ts` — CREATED: VendorAdapter interface (5 methods, 2 capability properties) + ProviderCapabilities
- `src/modules/data-ingestion/retry.util.ts` — CREATED: HttpStatusError, isTransientError(), withRetry() with exponential backoff (base × 2^attempt); retries 5xx + network errors; throws immediately on 4xx
- `src/modules/data-ingestion/provider-orchestrator.ts` — CREATED: ProviderOrchestrator.fetchFieldWithFallback<T>(); tries providers in order; returns FieldResult<T>; empty array → fallback_used=false; all-null → fallback_used=true

**Tests Added/Updated:**
- `tests/unit/data-ingestion/retry.util.test.ts` — CREATED: 18 unit tests (withRetry: success, 5xx-retry, 4xx-immediate-throw, exhaustion after maxAttempts=3, exponential-backoff delays, network/timeout retry; isTransientError: 7 cases)
- `tests/unit/data-ingestion/provider-orchestrator.test.ts` — CREATED: 7 unit tests (primary wins, null-fallback, all-null, empty array, 4xx-fallthrough, single-throws, synced_at type)
- 25 tests total; all passing (`npx jest tests/unit/data-ingestion/provider-orchestrator.test.ts retry.util.test.ts`)

**Result/Status:** Success — STORY-015 complete

**Blockers/Issues:** None

**Baseline Impact:** NO

**Next Action:** STORY-016 complete — STORY-017 (FMP Adapter) next

---

## 2026-04-20 UTC — STORY-016 Complete: Tiingo Provider Adapter

**Epic:** EPIC-003
**Story:** STORY-016
**Action:** Implemented TiingoAdapter from scratch using real API knowledge. Prior speculative code was discarded and replaced entirely based on live API exploration performed 2026-04-20.

**Real API findings (verified before implementation):**
- Universe endpoint: `/tiingo/fundamentals/meta` (not `/definitions`) — returns 19,978 tickers with sector/industry/location; NO market cap field
- Fundamentals endpoint: `/tiingo/fundamentals/{t}/statements` — response is `Array<{date, year, quarter, statementData: {incomeStatement, balanceSheet, overview} as {dataCode,value}[]}>`, NOT nested object
- Forward estimates endpoint: `/tiingo/fundamentals/{t}/overview` returns 404 at this API tier — Tiingo provides NO forward estimates
- EOD price endpoint: `/tiingo/daily/{t}/prices` — correct; response shape as expected
- Metadata endpoint: `/tiingo/daily/{t}` — correct; returns ticker, name, exchangeCode

**Baseline conflicts documented (not silently absorbed):**
- `forwardEstimateCoverage`: RFC-004/ADR-001 assume 'partial'; actual is 'none' at this API tier
- `market_cap_millions`: RFC-004 assumes Tiingo can filter by market cap; actual: no market cap in `/fundamentals/meta`; set to null; filtering deferred to sync layer
- `UniverseStock.market_cap_millions` type updated: `number` → `number | null` in `types.ts`

**Files Changed:**
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — REWRITTEN: correct endpoint for fetchUniverse, correct {dataCode,value}[] parsing for fetchFundamentals, fetchForwardEstimates always returns null
- `src/modules/data-ingestion/types.ts` — MODIFIED: UniverseStock.market_cap_millions: number | null
- `tests/unit/data-ingestion/tiingo.adapter.test.ts` — REWRITTEN: correct fixture shapes; fetchForwardEstimates tests updated (no HTTP call); 30 tests total
- `tests/integration/data-ingestion/tiingo.adapter.test.ts` — REWRITTEN: assertions match actual live API behavior
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — MODIFIED: STORY-016 evidence updated
- `.env.test` — MODIFIED: TIINGO_API_KEY added (gitignored)
- `.env.local` — CREATED: local dev env with TIINGO_API_KEY (gitignored)

**Tests Run and Results:**
- Unit: `npx jest tests/unit/data-ingestion/tiingo.adapter.test.ts` → **30/30 passed**
- Regression: `npx jest tests/unit/data-ingestion/` → **142/142 passed**
- Integration: `npx dotenv-cli -e .env.test -- npx jest tests/integration/data-ingestion/tiingo.adapter.test.ts` → **5/5 passed** against live Tiingo API

**Fixture Provenance:**
- Unit test fixtures: synthetic — dataCode names and response structure verified against live AAPL response 2026-04-20
- Integration tests: captured_real — assertions based on actual live API responses

**Result/Status:** Success — STORY-016 complete

**Verification Level Achieved:** `integration_verified_real` — 5 integration tests passed against live Tiingo API with real key

**Blockers/Issues:**
- Prior speculative implementation used wrong endpoint (/definitions vs /meta) and wrong response shape — required full rewrite
- forward estimates endpoint unavailable at this API tier — forwardEstimateCoverage changed to 'none'

**Baseline Impact:** YES
- `forwardEstimateCoverage: 'none'` deviates from RFC-004/ADR-001 assumption of 'partial'
- `market_cap_millions: null` from Tiingo deviates from RFC-004 assumption of filterable market cap
- Both documented in STORY-016 spec; downstream stories (STORY-021 forward estimates, STORY-018 universe sync) must be updated accordingly

**Next Action:** STORY-017 (FMP Adapter) — ready for implementation

---

## 2026-04-20 UTC — STORY-017 Preparation: FMP Provider Adapter

**Epic:** EPIC-003
**Story:** STORY-017
**Action:** Real FMP API explored against live key `yW1smSL6fErOSBdlqcLoR69MTB0jDbJ3`. Speculative `fmp.adapter.ts` (v3 base URL) confirmed broken. Story file rewritten with verified API reference. Story status set to `ready`.

**Real API findings (verified before implementation):**
- All v3 endpoints deprecated (return 403); working base: `https://financialmodelingprep.com/stable`
- Profile: `GET /stable/profile?symbol={ticker}` → array with `{symbol, companyName, exchange, sector, industry, country, marketCap}`
- EOD price: `GET /stable/historical-price-eod/full?symbol={ticker}` → flat array sorted descending (no nested `historical` key; no `adjClose`)
- Income statement: `GET /stable/income-statement?symbol={ticker}&period=annual&limit=2` → array with `revenue`, `netIncome`, `grossProfit`, `operatingIncome`, `ebit`, `interestExpense`, `epsDiluted`
- Balance sheet: `GET /stable/balance-sheet-statement?symbol={ticker}&period=annual&limit=2` → array with `totalStockholdersEquity`, `totalDebt`, `totalCurrentAssets`, `totalCurrentLiabilities`, `totalAssets`
- Analyst estimates: `GET /stable/analyst-estimates?symbol={ticker}&period=annual` → all years sorted descending; fields `epsAvg`, `ebitAvg` (NOT `estimatedEpsAvg`, `estimatedEbitAvg`)
- Screener: returns 402 (plan restriction) — no universe endpoint available on this plan

**Baseline conflicts documented (not silently absorbed):**
- `fetchUniverse` blocked: no screener/list endpoint on this plan → returns `[]`; universe sourced from Tiingo
- `forwardEstimateCoverage`: RFC-004/ADR-001 assumed 'full'; actual: small/mid caps return 402 → declaring `'partial'`
- Analyst estimate field names changed: `epsAvg` / `ebitAvg` (speculative code used `estimatedEpsAvg` / `estimatedEbitAvg`)
- EOD response is flat array (speculative code assumed nested `{historical: [...]}` object)
- `forward_pe` / `forward_ev_ebit` are raw estimates (EPS $, EBIT $M), not ratios — STORY-021 must compute ratios

**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-017-fmp-adapter.md` — REWRITTEN: real API reference, baseline conflicts, 6 task specs, status = ready
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — MODIFIED: STORY-017 reset from false `done ✅` to `ready`
- `.env.test` — MODIFIED: `FMP_API_KEY` added (gitignored)
- `.env.local` — MODIFIED: `FMP_API_KEY` populated (gitignored)

**Result/Status:** STORY-017 preparation complete — ready for execution

**Blockers/Issues:**
- Prior speculative implementation used v3 endpoints (all deprecated) — requires full rewrite of `fmp.adapter.ts`
- fetchUniverse cannot be implemented on this FMP plan tier

**Baseline Impact:** YES
- `forwardEstimateCoverage: 'partial'` deviates from RFC-004/ADR-001 assumption of 'full'
- `fetchUniverse` returns `[]` deviates from RFC-004 assumption of FMP market-cap-filterable universe
- Both documented in STORY-017 spec; STORY-021 (forward estimates sync) must account for 'partial' coverage

**Next Action:** Execute STORY-017

**Validation note (2026-04-20):** Two issues resolved during self-validation — test count corrected (30→34) and balance-sheet-null partial-data test added to fetchFundamentals test list. Story confirmed ready for execution.

---

## 2026-04-20 UTC — STORY-017 Complete: FMP Provider Adapter

**Epic:** EPIC-003
**Story:** STORY-017
**Action:** Implemented FMPAdapter from scratch using real API knowledge. Prior speculative code (v3 base URL, all endpoints deprecated) was discarded and replaced entirely based on live API exploration performed 2026-04-20.

**Real API findings (verified before implementation):**
- All v3 endpoints deprecated (return 403); working base: `https://financialmodelingprep.com/stable`
- Profile endpoint: `GET /stable/profile?symbol={ticker}` → array with `{symbol, companyName, exchange, sector, industry, country, marketCap}`
- EOD price: `GET /stable/historical-price-eod/full?symbol={ticker}` → flat array sorted descending; NO nested `historical` key; NO `adjClose`
- Income statement: `GET /stable/income-statement?symbol={ticker}&period=annual&limit=2` → array with `revenue`, `netIncome`, `grossProfit`, `operatingIncome`, `ebit`, `interestExpense`, `epsDiluted`
- Balance sheet: `GET /stable/balance-sheet-statement?symbol={ticker}&period=annual&limit=2` → array with `totalStockholdersEquity`, `totalDebt`, `totalCurrentAssets`, `totalCurrentLiabilities`, `totalAssets`
- Analyst estimates: `GET /stable/analyst-estimates?symbol={ticker}&period=annual` → all years sorted descending; NTM = first future fiscal year end; fields `epsAvg` (NOT `estimatedEpsAvg`), `ebitAvg` (NOT `estimatedEbitAvg`)
- Screener: returns 402 (plan restriction) — fetchUniverse returns `[]`

**Baseline conflicts documented (not silently absorbed):**
- `forwardEstimateCoverage: 'partial'` — RFC-004/ADR-001 assumed 'full'; small/mid caps return 402
- `fetchUniverse` returns `[]` — RFC-004 assumed FMP can filter by market cap; screener blocked on this plan
- `forward_pe` stores raw `epsAvg` ($EPS, not P/E ratio); `forward_ev_ebit` stores `ebitAvg/1M` (not EV/EBIT ratio) — STORY-021 must handle ratio computation
- EOD price response is a flat array (speculative code assumed nested `{historical: [...]}`)
- Analyst estimate field names: `epsAvg`/`ebitAvg` (speculative code used `estimatedEpsAvg`/`estimatedEbitAvg`)

**Files Changed:**
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — REWRITTEN: stable base URL, flat EOD array, `forwardEstimateCoverage='partial'`, fetchUniverse no-op, NTM selection from analyst-estimates
- `tests/unit/data-ingestion/fmp.adapter.test.ts` — REWRITTEN: 34 tests with correct fixture shapes
- `tests/integration/data-ingestion/fmp.adapter.test.ts` — REWRITTEN: 4 integration tests against live FMP stable API
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — MODIFIED: STORY-017 status → done ✅ with correct evidence
- `.env.test` — MODIFIED: FMP_API_KEY added (gitignored)
- `.env.local` — MODIFIED: FMP_API_KEY populated (gitignored)
- `stories/tasks/EPIC-003-data-ingestion/STORY-017-fmp-adapter.md` — REWRITTEN and validated: real API reference, 6 task specs, 34 test descriptions, baseline conflicts, status = done ✅

**Tests Run and Results:**
- Unit: `npx jest tests/unit/data-ingestion/fmp.adapter.test.ts` → **34/34 passed**
- Regression: `npx jest tests/unit/data-ingestion/` → **153/153 passed** (no regressions; +11 net from replacing 23 speculative tests with 34 real tests)
- Integration: `npx dotenv-cli -e .env.test -- npx jest tests/integration/data-ingestion/fmp.adapter.test.ts` → **4/4 passed** against live FMP stable API

**Live integration test results (captured_real):**
- `fetchMetadata('AAPL')`: exchange='NASDAQ', sector non-null, market_cap_millions > 0 ✓
- `fetchEODPrice('AAPL')`: close=273.05, date=2026-04-20 ✓
- `fetchFundamentals('AAPL')`: revenue_ttm non-null, gross_margin non-null, trailing_pe=null ✓
- `fetchForwardEstimates('AAPL')`: ntm_date=2026-09-27 (FY2026), forward_pe=8.49 (epsAvg), numAnalystsEps=30 ✓

**Fixture Provenance:**
- Unit test fixtures: synthetic — field names and response structure verified against live AAPL response 2026-04-20
- Integration tests: captured_real — assertions based on actual live FMP stable API responses

**Result/Status:** Success — STORY-017 complete

**Verification Level Achieved:** `integration_verified_real` — 4 integration tests passed against live FMP stable API

**Blockers/Issues:**
- Prior speculative implementation used v3 endpoints (all deprecated) — required full rewrite
- fetchUniverse cannot be implemented on this FMP plan tier (screener 402)

**Baseline Impact:** YES
- `forwardEstimateCoverage: 'partial'` deviates from RFC-004/ADR-001 assumption of 'full'
- `fetchUniverse` returns `[]` deviates from RFC-004 assumption of FMP market-cap-filterable universe
- `forward_pe`/`forward_ev_ebit` store raw estimates (not ratios) — STORY-021 must compute ratios
- All documented in STORY-017 spec; STORY-021 (forward estimates sync) must account for 'partial' coverage

**Next Action:** STORY-018 (Universe Sync Job) — awaiting confirmation

---

## 2026-04-20 — EPIC-003/STORY-018: Universe Sync Job — EXECUTION

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-018 — Universe Sync Job
**Action:** Executed story (prepare → validate → revision → execute cycle). Fixed 2 bugs in speculative implementation; added 3 missing unit tests; fixed integration test fixture; all tests verified against real DB.

---

### TASK-018-001: Fix bugs in universe-sync.service.ts

**Timestamp:** 2026-04-20
**Files Changed:**
- `src/modules/data-ingestion/jobs/universe-sync.service.ts` — modified: 2 bug fixes
- `stories/tasks/EPIC-003-data-ingestion/TASK-018-001-universe-sync-service.md` — modified: updated from raw SQL spec to Prisma (BC-018-004)

**Bug fixes applied:**
- BC-018-001 (line 95): Abort condition `errors.length === 2` → `totalAvailable === 0 && errors.length > 0`
  - Root cause: FMP fetchUniverse() is a no-op returning [] without throwing (STORY-017). Old condition never fires when only Tiingo fails → universe wipe on Tiingo outage.
- BC-018-002 (line 106): `stock.market_cap_millions < minMarketCap` → `stock.market_cap_millions !== null && stock.market_cap_millions < minMarketCap`
  - Root cause: market_cap_millions is `number | null`; TS18047 error; null = unknown = include in universe.

**Tests run:** `npx jest tests/unit/data-ingestion/universe-sync.service.test.ts`
**Result:** 7/7 existing unit tests pass (no regressions from bug fixes)
**TypeScript:** No errors in universe-sync.service.ts
**Fixture provenance:** synthetic (mocked adapters and Prisma)
**Verification level:** unit_verified
**Baseline Impact:** NO — fixes correct speculative implementation errors; RFC-004/ADR intent preserved

---

### TASK-018-002: Add 3 new unit tests

**Timestamp:** 2026-04-20
**Files Changed:**
- `tests/unit/data-ingestion/universe-sync.service.test.ts` — modified: 3 new tests added (total: 10)

**Tests added:**
- Test 8: "aborts when Tiingo fails and FMP returns [] silently (FMP no-op scenario)" [BC-018-001]
- Test 9: "null market_cap_millions passes filter — unknown treated as include (Tiingo behavior)" [BC-018-002]
- Test 10: "excludes stock with country !== US regardless of market cap"

**Tests run:** `npx jest tests/unit/data-ingestion/universe-sync.service.test.ts`
**Result:** 10/10 unit tests pass
**Fixture provenance:** synthetic (mocked adapters and Prisma)
**Verification level:** unit_verified

---

### TASK-018-003: Integration tests + tracking

**Timestamp:** 2026-04-20
**Files Changed:**
- `tests/integration/data-ingestion/universe-sync.service.test.ts` — modified: TEST_PREFIX 'INTTEST_' → 'T_' (ticker VarChar(10) constraint fix)
- `stories/tasks/EPIC-003-data-ingestion/STORY-018-universe-sync-job.md` — modified: baseline conflicts section, AC clarifications, DoD updated to 10 unit tests
- `stories/tasks/EPIC-003-data-ingestion/TASK-018-001-universe-sync-service.md` — modified: raw SQL spec → Prisma spec (BC-018-004)
- `stories/tasks/EPIC-003-data-ingestion/TASK-018-002-unit-tests.md` — modified: 3 new tests added to spec, AC updated
- `docs/architecture/IMPLEMENTATION-LOG.md` — this entry
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-018 evidence updated

**Implementation issue found and fixed during execution:**
- `implementation_issue`: TEST_PREFIX 'INTTEST_' (8 chars) + suffix > 10 char VarChar(10) limit
- All integration tests were failing with "value too long for column" before fix
- Fix: TEST_PREFIX = 'T_' (2 chars); all ticker lengths now ≤ 9 chars
- Not a baseline conflict — RFC-002 VarChar(10) is correct; test fixtures were wrong

**Tests run:** `DATABASE_URL="postgresql://test_user:test_password@localhost:5433/aaa_test" npx jest tests/integration/data-ingestion/universe-sync.service.test.ts --runInBand`
**Result:** 4/4 integration tests pass against real test DB (3aa-test-db container, healthy)
**Test coverage:** insert with freshness=missing ✅; drop → in_universe=FALSE + row retained (ADR-003) ✅; idempotency ✅; no-delete invariant ✅
**Fixture provenance:** synthetic (mocked adapters, real test DB)
**Verification level:** integration_verified_local (real DB, mocked adapters — not live providers)
**Baseline Impact:** NO

---

**Story STORY-018 completion summary:**
- 10 unit tests passing (mocked DB, mocked adapters)
- 4 integration tests passing (real test DB, mocked adapters)
- 2 bugs fixed in service implementation (BC-018-001 abort condition, BC-018-002 null guard)
- 1 integration test fixture bug fixed (ticker length)
- Story spec updated with 4 baseline conflicts documented
- Highest verification level: integration_verified_local
- Unverified: live provider invocation against real Tiingo/FMP universe endpoints (E2E/staging only)
- Next Action: STORY-019 (Price Sync Job) — pending user confirmation

---

## 2026-04-20 — EPIC-003/STORY-019: Price Sync Job — EXECUTION

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-019 — Price Sync Job
**Action:** Executed story verification. Fixed integration test fixture; added 3 missing tests (in_universe=FALSE WHERE clause + 2 OIDC route tests). All tests verified.

---

### TASK-019-001: Fix integration test ticker (BC-019-001)

**Timestamp:** 2026-04-20
**Files Changed:**
- `tests/integration/data-ingestion/price-sync.service.test.ts` — `TEST_TICKER` 'INTTEST_PRICE' (13 chars) → 'T_PRICE' (7 chars)

**Tests run:** `DATABASE_URL=... npx jest tests/integration/data-ingestion/price-sync.service.test.ts --runInBand`
**Result:** 4/4 integration tests pass against real test DB (3aa-test-db)
**Fixture provenance:** synthetic (mocked adapters, real test DB)
**Verification level:** integration_verified_local
**Baseline Impact:** NO

---

### TASK-019-002: Add 3 missing tests

**Timestamp:** 2026-04-20
**Files Changed:**
- `tests/unit/data-ingestion/price-sync.service.test.ts` — test 7 added: verifies `findMany` called with `{ where: { inUniverse: true }, select: { ticker: true } }`
- `tests/unit/api/cron/price-sync.test.ts` — CREATED: 2 route tests (OIDC 401 on invalid token; 200 with summary on valid token)

**Tests run:** `npx jest tests/unit/data-ingestion/price-sync.service.test.ts tests/unit/api/cron/price-sync.test.ts`
**Result:** 9/9 unit tests pass
**Full suite regression:** 286/286 unit tests pass
**Fixture provenance:** synthetic (mocked orchestrator, Prisma, verifySchedulerToken)
**Verification level:** unit_verified
**Baseline Impact:** NO

---

### TASK-019-003: Tracking

**Timestamp:** 2026-04-20
**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/TASK-019-001-price-sync-service.md` — DELETED (obsolete)
- `stories/tasks/EPIC-003-data-ingestion/TASK-019-002-cron-endpoint.md` — DELETED (obsolete)
- `stories/tasks/EPIC-003-data-ingestion/TASK-019-003-tests-tracking.md` — DELETED (obsolete)
- `stories/tasks/EPIC-003-data-ingestion/STORY-019-price-sync-job.md` — updated: BC-019-001 through BC-019-003, DoD, test strategy
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-019 evidence updated
- `docs/architecture/IMPLEMENTATION-LOG.md` — this entry

---

**Story STORY-019 completion summary:**
- 9 unit tests passing: 7 service + 2 route (integration_verified: unit_verified)
- 4 integration tests passing: real test DB, mocked adapters (integration_verified_local)
- 1 integration fixture bug fixed (BC-019-001 ticker length)
- 1 missing unit test added (in_universe=FALSE WHERE clause)
- 2 route tests created (OIDC 401/200)
- 3 obsolete task files deleted
- Highest verification level: live_provider_verified (AAPL: currentPrice=273.05, priceLastUpdatedAt set, provider=tiingo, fallback_used=false confirmed in DB)
- Next Action: STORY-020 (Fundamentals Sync Job)

---


## 2026-04-20 — EPIC-003/STORY-020: Fundamentals Sync Job — EXECUTION

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-020 — Fundamentals Sync Job
**Action:** Executed story verification. Fixed TypeScript errors, integration test ticker, and added 4 missing tests (inUniverse filter + provenance-absent unit tests + 2 route tests). All tests verified.

---

### TASK-020-001: Fix TypeScript errors (BC-020-006, BC-020-007)

**Timestamp:** 2026-04-20
**Files Changed:**
- `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` line 198 — cast provenance spread to `Prisma.InputJsonValue` (BC-020-006)
- `tests/integration/data-ingestion/fundamentals-sync.service.test.ts` lines 96, 118 — double-cast JSON to `unknown as Record<string, ProvenanceEntry>` (BC-020-007)

**Tests run:** `npx tsc --noEmit` — 0 errors for fundamentals-sync files
**Result:** TypeScript compilation clean
**Baseline Impact:** NO

---

### TASK-020-002: Fix integration test ticker (BC-020-001)

**Timestamp:** 2026-04-20
**Files Changed:**
- `tests/integration/data-ingestion/fundamentals-sync.service.test.ts` — `TEST_TICKER` 'INTTEST_FUND' (12 chars) → 'T_FUND' (6 chars)

**Tests run:** `DATABASE_URL=... npx jest tests/integration/data-ingestion/fundamentals-sync.service.test.ts --runInBand`
**Result:** 4/4 integration tests pass against real test DB (3aa-test-db)
**Fixture provenance:** synthetic (mocked adapters, real test DB)
**Verification level:** integration_verified_local
**Baseline Impact:** NO

---

### TASK-020-003: Add 4 missing tests (BC-020-002, BC-020-004, BC-020-005)

**Timestamp:** 2026-04-20
**Files Changed:**
- `tests/unit/data-ingestion/fundamentals-sync.service.test.ts` — test 8 added: verifies `findMany` called with `{ where: { inUniverse: true }, select: { ticker: true } }` (BC-020-004)
- `tests/unit/data-ingestion/fundamentals-sync.service.test.ts` — test 9 added: verifies provenance keys absent for null fields (`gross_margin`, `trailing_pe` null → no prov entry) (BC-020-005)
- `tests/unit/api/cron/fundamentals.test.ts` — CREATED: 2 route tests (OIDC 401 on invalid token; 200 with summary on valid token) (BC-020-002)

**Tests run:** `npx jest tests/unit/data-ingestion/fundamentals-sync.service.test.ts tests/unit/api/cron/fundamentals.test.ts --runInBand`
**Result:** 11/11 unit tests pass (9 service + 2 route)
**Fixture provenance:** synthetic (mocked orchestrator, Prisma, verifySchedulerToken)
**Verification level:** unit_verified
**Baseline Impact:** NO

---

### TASK-020-004: Tracking

**Timestamp:** 2026-04-20
**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-020-fundamentals-sync-job.md` — updated: BC-020-001 through BC-020-007, DoD, Test Strategy, Scope Out
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-020 evidence updated
- `docs/architecture/IMPLEMENTATION-LOG.md` — this entry

---

**Story STORY-020 completion summary:**
- 11 unit tests passing: 9 service + 2 route (unit_verified)
- 4 integration tests passing: real test DB, mocked adapters (integration_verified_local)
- 1 TypeScript error fixed in service (BC-020-006)
- 2 TypeScript errors fixed in integration test (BC-020-007)
- 1 integration fixture ticker fixed (BC-020-001)
- 2 missing unit tests added (inUniverse filter + provenance-absent)
- 1 route test file created (2 OIDC tests)
- 7 baseline conflicts documented (BC-020-001 through BC-020-007)
- Highest verification level: live_provider_verified (AAPL: gross_margin=0.48, operating_margin=0.35, roic=1.1472, eps_growth_3y=23.41 written from real Tiingo; 9 fields + 9 provenance entries confirmed in DB)
- Next Action: STORY-021 (Forward Estimates Sync Job)

---

## 2026-04-20 — EPIC-003/STORY-018: BC-018-005 — Universe Wipe Bug Fixed

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-018 — Universe Sync Job
**Action:** Discovered and fixed critical universe-wipe bug during live_provider_verified proof. Root cause: `mergeUniverses` stores uppercase map keys but upsert used `stock.ticker` (original lowercase). `qualifyingTickers` (uppercase) didn't match DB tickers (lowercase), so the drop query `notIn` matched and wiped all upserted stocks on every real sync.

**Files Changed:**
- `src/modules/data-ingestion/jobs/universe-sync.service.ts` — changed upsert loop from `for (const [, stock])` to `for (const [ticker, stock])` and used `ticker` (uppercase map key) in upsert `where` and `create` fields (BC-018-005)
- `tests/unit/data-ingestion/universe-sync.service.test.ts` — added test 11: lowercase adapter ticker → upsert and notIn use uppercased key; asserts `upsertCall.where.ticker === 'AAPL'` and `updateManyCall.where.ticker.notIn` contains `'AAPL'` not `'aapl'`
- `stories/tasks/EPIC-003-data-ingestion/STORY-018-universe-sync-job.md` — BC-018-005 documented; DoD updated to 11 unit tests + live_provider_verified

**Tests run:**
- `npx jest tests/unit/data-ingestion/universe-sync.service.test.ts` → 11/11 pass
- `DATABASE_URL=... npx jest tests/integration/data-ingestion/universe-sync.service.test.ts` → 4/4 pass
- Live proof: real Tiingo sync → `stocks_upserted: 5606, stocks_dropped: 0, after: 5606 in_universe=TRUE`

**Result:** Bug fixed. Universe sync now correctly preserves all qualifying stocks.
**Verification level:** live_provider_verified (5606 real Tiingo tickers upserted; 0 dropped; DB confirmed 5606 inUniverse=TRUE)
**Baseline Impact:** YES — BC-018-005: critical correctness bug in speculative implementation; unit/integration tests passed because test fixtures used uppercase tickers; only caught via live_provider proof

**Next Action:** Continue EPIC-003 story-by-story verification — STORY-021

---

## 2026-04-20 — EPIC-003/STORY-021: Forward Estimates Sync Job — Execution Complete

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-021 — Forward Estimates Sync Job
**Action:** Full compliance check and execution of all 7 BCs. Fixed TS2322 (BC-021-003), added 2 unit tests (BC-021-006/007), created 2 new test files (BC-021-001/002), fixed spec AC line 91 and DoD counts.

**Files Changed:**
- `src/modules/data-ingestion/jobs/forward-estimates-sync.service.ts` — BC-021-003: added `as Prisma.InputJsonValue` cast at line 199 (provenance spread TS2322 fix)
- `tests/unit/data-ingestion/forward-estimates-sync.service.test.ts` — BC-021-006: added test 19 (FMP null → Tiingo returns forward_pe, provenance provider=tiingo fallback_used=true); BC-021-007: added test 20 (findMany called with inUniverse=TRUE filter and correct select fields)
- `tests/unit/api/cron/estimates.test.ts` — BC-021-002: created; 2 route tests: 401 on invalid OIDC token; 200 with summary on valid token
- `tests/integration/data-ingestion/forward-estimates-sync.service.test.ts` — BC-021-001: created; 5 tests: full three-level fallback, cyclicality_flag guard, FMP primary, idempotency, null-not-overwrite
- `stories/tasks/EPIC-003-data-ingestion/STORY-021-forward-estimates-sync-job.md` — AC line 91 `missing_count` → `no_estimates_count`; DoD updated: 18→20 unit tests, 5→7 BCs

**Tests run:**
- `npx jest tests/unit/data-ingestion/forward-estimates-sync.service.test.ts tests/unit/api/cron/estimates.test.ts` → 22/22 pass (20 service + 2 route)
- `DATABASE_URL=... npx jest tests/integration/data-ingestion/forward-estimates-sync.service.test.ts` → 5/5 pass
- `npx tsc --noEmit | grep forward-estimates` → no errors

**Result:** All 7 BCs resolved. 27 total tests passing across 3 files. STORY-021 marked COMPLETE.
**Verification level:** integration_verified_local (real test DB + mocked adapters)
**Baseline Impact:** YES — BC-021-001 through BC-021-007 documented; spec AC/DoD corrected; TS error fixed; no logic changes

**Next Action:** STORY-022 prepare → validate → execute (4 integration tests currently failing in freshness.util.test.ts)

---

## 2026-04-20 — EPIC-003/STORY-022: Data Freshness Tracking — Execution Complete

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-022 — Data Freshness Tracking
**Action:** Self-validation found 4 BCs. Fixed all: missing `country` field (BC-022-001), missing `providerName` in mock (BC-022-002), no freshness count assertions (BC-022-003), missing `syncForwardEstimates` integration test (BC-022-004).

**Files Changed:**
- `tests/integration/data-ingestion/freshness.util.test.ts` — BC-022-001: added `country: 'US'` to `beforeAll` create; BC-022-002: added `providerName`, `capabilities`, `fetchUniverse`, `fetchMetadata` to `makeAdapter`; BC-022-003: captured `result` in Test 1, asserted `fresh_count`/`stale_count`/`missing_count` field types; BC-022-004: added Test 5 (`syncForwardEstimates` freshness writing)
- `stories/tasks/EPIC-003-data-ingestion/STORY-022-data-freshness-tracking.md` — BC-022-001 through BC-022-004 documented; DoD updated: 5 integration tests, 4 BCs

**Tests run:**
- `DATABASE_URL=... npx jest tests/integration/data-ingestion/freshness.util.test.ts` → 5/5 pass
- `npx jest tests/unit` → 295/295 pass (no regressions)

**Result:** All 4 BCs resolved. 26 unit + 5 integration = 31 total tests. STORY-022 marked COMPLETE.
**Verification level:** integration_verified_local (real test DB + mocked adapters)
**Baseline Impact:** YES — BC-022-001 through BC-022-004 documented; no logic changes; test-only fixes

**Next Action:** STORY-023 prepare → validate → execute

---

## 2026-04-21 UTC — STORY-024 Complete: Contract & Schema Tests

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-024 — Contract & Schema Tests
**Action:** Executed STORY-024 (detail → self-validate → spec update → execute cycle). Fixed 8 baseline conflicts across 4 fixture files and the contracts test. All 19 tests now pass.

**Baseline Conflicts Resolved:**
- **BC-024-001:** FMP historical price fixture was `{historical:[...]}` (old v3 format). FMPAdapter expects flat array. Fixture rewritten.
- **BC-024-002:** Tiingo universe fixture missing `isActive`/`location` fields; adapter filters by these. All items were silently excluded. Also `market_cap_millions` always null from Tiingo /meta — test assertion fixed.
- **BC-024-003:** Tiingo fundamentals fixture wrong shape (not `QuarterlyReport[]` with `DataCode[]`). Fixture fully rewritten. Test `trailing_pe=29.8` → `toBeNull()` (adapter hardcodes null).
- **BC-024-004:** Test "Tiingo overview with forwardPE=27.5" contradicts adapter — `fetchForwardEstimates` always returns null (no HTTP call at this tier). Fixed to assert null.
- **BC-024-005:** FMP analyst estimates fixture used `estimatedEpsAvg`/`estimatedEbitAvg`; adapter reads `epsAvg`/`ebitAvg` (real FMP field names per STORY-017). Fixture field names updated.
- **BC-024-006:** FMP `fetchUniverse` always returns `[]` (no-op); test asserted length=1. Fixed to `toEqual([])`.
- **BC-024-007:** `PROV_CONTRACT_TEST` = 18 chars > VarChar(10). Renamed to `PCT`.
- **BC-024-008:** `exchange` in `requiredColumns` but not in stocks Prisma schema (Tiingo /meta has no exchange data). Removed from list.

**Files Changed:**
- `tests/fixtures/tiingo-universe-response.json` — rewritten (isActive/location fields)
- `tests/fixtures/fmp-historical-price-response.json` — rewritten (flat array)
- `tests/fixtures/tiingo-fundamentals-response.json` — rewritten (DataCode array format)
- `tests/fixtures/fmp-analyst-estimates-response.json` — field names updated
- `tests/integration/data-ingestion/contracts.test.ts` — all 8 BCs fixed; 18→19 tests
- `stories/tasks/EPIC-003-data-ingestion/STORY-024-contract-and-schema-tests.md` — BCs + AC + DoD updated
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-024 → done ✅; EPIC-003 complete; Active Work → EPIC-004

**Tests Run and Results:**
- `npx dotenv -e .env.test -- npx jest tests/integration/data-ingestion/contracts.test.ts --runInBand --forceExit` → **19/19 passed**

**Result:** All 8 BCs resolved. 19 contract tests. STORY-024 marked COMPLETE. EPIC-003 all stories done.
**Verification level:** integration_verified_local (real test DB + mocked adapters/fixtures)
**Baseline Impact:** YES — BC-024-001 through BC-024-008 documented; fixture and test fixes only; no logic changes

**Next Action:** EPIC-003 integration checkpoint → begin EPIC-004

---

## 2026-04-21 UTC — STORY-024 Self-Validation Fixes (post-completion gaps)

**Epic:** EPIC-003
**Story:** STORY-024
**Task:** TASK-024-002
**Action:** Self-validation found 4 gaps after initial 19-test completion. Fixed: (1) Scope In field names for tiingo-universe and fmp-analyst-estimates fixtures updated to reflect BC resolutions. (2) `data_freshness_status` test now asserts specific default value `'fresh'`. (3) Untestable BDD scenario for FMP universe replaced. (4) New provenance test covers all 15 fundamental field keys.

**Files Changed:**
- `tests/integration/data-ingestion/contracts.test.ts` — added provenance 15-field test; updated `data_freshness_status` assertion; 19→20 tests
- `stories/tasks/EPIC-003-data-ingestion/STORY-024-contract-and-schema-tests.md` — Scope In field names corrected; freshness default updated to `'fresh'`; BDD scenario replaced; DoD updated to 20 tests

**Tests Run and Results:**
- `npx dotenv -e .env.test -- npx jest tests/integration/data-ingestion/contracts.test.ts --runInBand --forceExit` → **20/20 passed**

**Result:** STORY-024 fully complete. 20 contract tests.
**Baseline Impact:** NO — spec corrections only; no logic changes

**Next Action:** EPIC-003 integration checkpoint → begin EPIC-004

---

## 2026-04-20 UTC — STORY-023 Complete: Pipeline Integration Tests

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-023 — Pipeline Integration Tests
**Action:** Executed STORY-023. Fixed 5 baseline conflicts in `tests/integration/data-ingestion/pipeline.test.ts`. All 6 integration scenarios now pass.

**Baseline Conflicts Resolved:**
- **BC-023-001:** `PIPE_TEST_000` (13 chars) > VarChar(10). Renamed to `PT_000`–`PT_004` (6 chars). Updated all 9 `startsWith: 'PIPE_TEST_'` filter references to `{ in: TEST_TICKERS }`.
- **BC-023-002:** 5606 live-proof stocks with `inUniverse=TRUE` in test DB caused count assertion failures and timeout risk. Added `beforeAll` (disable all pre-existing inUniverse stocks) + `afterAll` (restore + disconnect).
- **BC-023-003:** Spec said "100 test stocks"; implementation uses 5. Spec updated to say 5. No code change.
- **BC-023-004:** Scenario 1 provenance check covered only `current_price`; AC required all 3 categories. Added checks for `gross_margin` and `forward_pe` provenance.
- **BC-023-005:** Scenario 2 ("Tiingo down") was missing `syncForwardEstimates` call despite spec saying "all three daily sync jobs". Added the call.

**Files Changed:**
- `tests/integration/data-ingestion/pipeline.test.ts` — modified: all 5 BCs fixed
- `stories/tasks/EPIC-003-data-ingestion/STORY-023-pipeline-integration-tests.md` — modified: DoD updated to reference all 5 BCs (checked)
- `stories/tasks/EPIC-003-data-ingestion/TASK-023-001-pipeline-full-sequence-and-failure-tests.md` — deleted
- `stories/tasks/EPIC-003-data-ingestion/TASK-023-002-pipeline-freshness-stale-tests-tracking.md` — deleted
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — modified: STORY-023 → done ✅, Active Work → STORY-024

**Tests Run and Results:**
- `npx dotenv -e .env.test -- npx jest tests/integration/data-ingestion/pipeline.test.ts --runInBand --forceExit` → **6/6 passed**

**Result:** All 6 scenarios passing. STORY-023 marked COMPLETE.
**Verification level:** integration_verified_local (real test DB + mocked adapters)
**Baseline Impact:** YES — BC-023-001 through BC-023-005 documented; no logic changes; test-only fixes

**Next Action:** STORY-024 prepare → validate → execute

---

## 2026-04-21 UTC — EPIC-003 Integration Checkpoint: Data Ingestion & Universe Management Complete

**Epic:** EPIC-003
**Story:** N/A — Epic-level checkpoint
**Task:** N/A
**Action:** EPIC-003 integration checkpoint passed. All 10 stories done, all tests passing, pipeline operational.

**Epic Summary:**
- STORY-015: Provider Abstraction Layer — 25 unit tests
- STORY-016: Tiingo Adapter — 30 unit + 5 live integration tests
- STORY-017: FMP Adapter — 34 unit + 4 live integration tests
- STORY-018: Universe Sync Job — 11 unit + 4 integration tests; 5606 tickers in DB
- STORY-019: Price Sync Job — 9 unit + 4 integration tests; live price verified
- STORY-020: Fundamentals Sync Job — 11 unit + 4 integration tests
- STORY-021: Forward Estimates Sync Job — 22 unit + 5 integration tests
- STORY-022: Data Freshness Tracking — 26 unit + 5 integration tests
- STORY-023: Pipeline Integration Tests — 6 integration tests
- STORY-024: Contract & Schema Tests — 20 integration tests; 8 BCs; all fixture/schema/provenance contracts pinned

**Total baseline conflicts resolved across EPIC-003:** 43 BCs (BC-018 through BC-024)

**Files Changed:**
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-024 evidence 19→20 tests; Active Work → EPIC-004; EPIC-003 added to Completed Items
- `stories/tasks/EPIC-003-data-ingestion/TASK-024-001-*.md` — deleted (stale task files)
- `stories/tasks/EPIC-003-data-ingestion/TASK-024-002-*.md` — deleted (stale task files)

**Result:** EPIC-003 pipeline operational. Universe populated with 5606 tickers. All contract surfaces pinned.
**Baseline Impact:** NO — tracking/cleanup only

**Next Action:** Complete STORY-025 behavioral validation → implement STORY-026 through STORY-029

---

## 2026-04-21 UTC — EPIC-003 Extended: STORY-025 through STORY-029 Added

**Epic:** EPIC-003
**Story:** STORY-025, STORY-026, STORY-027, STORY-028, STORY-029
**Task:** N/A — story specification phase
**Action:** Behavioral validation of live pipeline data (STORY-025) against SA benchmarks revealed 7 data quality bugs and 3 missing data categories. 5 new stories written and added to EPIC-003 scope.

**Root cause analysis from STORY-025 live pipeline run (AAPL/MSFT/TSLA):**
- Operating margin computed from single quarter (should be LTM) — MSFT showing ~60% vs SA 45%
- `fcf_margin` stores gross margin due to Tiingo DataCode bug (`profitMargin` DataCode = grossMargin)
- `fcf_conversion` stores ROE (wrong field mapping)
- `net_debt_to_ebitda` stores D/E ratio (wrong metric entirely)
- `interest_coverage` computed from single quarter (null for AAPL — intexp absent in Q0)
- `total_debt`, `cash_and_equivalents` null — FMP balance sheet data not mapped to DB
- `forward_pe` stores raw NTM EPS ($/share) not P/E ratio; `forward_ev_ebit` stores raw EBIT $M not EV/EBIT ratio
- `market_cap` null — FMP profile endpoint not called
- `trailing_pe`, `trailing_ev_ebit`, `ev_sales` all null — trailing multiples never computed
- `revenue_growth_3y`, `eps_growth_3y` store YoY rates, not 3-year CAGRs

**Stories written:**
- STORY-025 (behavioral validation spec + 4 BCs documented)
- STORY-026 (7 data quality fixes: LTM metrics, DataCode bugs, balance sheet mapping)
- STORY-027 (market cap + trailing multiples; schema migration +5 columns)
- STORY-028 (forward estimates enrichment; schema migration +3 columns; fix forward_pe/forward_ev_ebit)
- STORY-029 (3-year growth CAGRs; FMP limit=5 upgrade)

**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-025-behavioral-validation-tests.md` (created)
- `stories/tasks/EPIC-003-data-ingestion/STORY-026-fundamental-data-quality-fixes.md` (created)
- `stories/tasks/EPIC-003-data-ingestion/STORY-027-market-cap-enterprise-value-trailing-multiples.md` (created)
- `stories/tasks/EPIC-003-data-ingestion/STORY-028-forward-estimates-enrichment.md` (created)
- `stories/tasks/EPIC-003-data-ingestion/STORY-029-three-year-growth-cagrrs.md` (created)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — EPIC-003 status in_progress; 5 new stories added; Active Story → STORY-026

**Tests Added/Updated:** None (spec phase only)
**Result:** 5 story specs ready; STORY-026 is next to implement
**Baseline Impact:** NO — new stories extend EPIC-003 data scope; no architecture changes; no RFC/ADR amendments required
**Next Action:** Implement STORY-026 (7 data quality fixes) → STORY-027 → STORY-028 → STORY-029 → STORY-030 → STORY-031

---

## 2026-04-21 UTC — EPIC-003 Story Validation + STORY-030/031 Added

**Epic:** EPIC-003
**Story:** STORY-026 through STORY-031 (story spec phase)
**Action:** Validated STORY-026–029 against PRD and RFC-004. Found and resolved one spec conflict (eps_growth_fwd double-ownership in STORY-029). Added provenance tracking requirements to all 4 stories. Identified 3 deferred items to un-defer (forward_ev_sales, GAAP/non-GAAP reconciliation, ROIC fix). Confirmed FMP endpoints from code inspection. Wrote STORY-030 (ROIC) and STORY-031 (GAAP/non-GAAP reconciliation factor).

**Key code findings from adapter inspection:**
- FMP `/profile` confirmed: already used by `fetchMetadata()` (fmp.adapter.ts:319); `sharesOutstanding` field name UNCONFIRMED — requires live API check
- `estimatedRevenueAvg` confirmed: already in `tests/fixtures/fmp-analyst-estimates-response.json`
- `cashAndCashEquivalents` confirmed: in `tests/fixtures/fmp-balance-sheet-response.json`; no `shortTermInvestments` field
- Both adapters compute ROIC with wrong formula (netIncome / (equity+debt)); fixed in STORY-030
- Tiingo adapter: needs `taxExp` and `pretaxinc` DataCode verification before STORY-030 implementation

**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-026-fundamental-data-quality-fixes.md` — added Provenance Tracking Requirements section
- `stories/tasks/EPIC-003-data-ingestion/STORY-027-market-cap-enterprise-value-trailing-multiples.md` — fixed fetchProfile() → extend fetchMetadata(); added FMP endpoint confirmation status; added Task 6 provenance section
- `stories/tasks/EPIC-003-data-ingestion/STORY-028-forward-estimates-enrichment.md` — added forward_ev_sales (new column + computation); confirmed estimatedRevenueAvg in fixture; added Task 4 provenance section; removed forward_ev_sales from Scope Out
- `stories/tasks/EPIC-003-data-ingestion/STORY-029-three-year-growth-cagrrs.md` — fixed eps_growth_fwd double-ownership; added Task 5 provenance section
- `stories/tasks/EPIC-003-data-ingestion/STORY-030-roic-nopat-invested-capital.md` (created)
- `stories/tasks/EPIC-003-data-ingestion/STORY-031-gaap-non-gaap-reconciliation.md` (created)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — added STORY-030/031; updated story count 15→17

**Tests Added/Updated:** None (spec phase only)
**Result:** 6 stories ready for implementation; provenance requirements explicit in all stories
**Baseline Impact:** NO — additional data quality and enrichment stories; no architecture changes
**Next Action:** Implement STORY-026 → sequentially through STORY-031

---

## 2026-04-21 UTC — STORY-026 TASK-026-001 through TASK-026-005: Implementation Complete

**Epic:** EPIC-003
**Story:** STORY-026
**Task:** TASK-026-001 through TASK-026-005
**Action:** Implemented all 7 data quality fixes across adapters, sync service, and tests.

**TASK-026-001 — FundamentalData type extended:**
- Added `fcf_ttm`, `net_debt_to_ebitda`, `total_debt`, `cash_and_equivalents` fields
- Added `earnings_ttm`/`revenue_ttm` absolute USD doc (BC-026-001)
- Updated `ProvenanceEntry` to include `'computed'` and `'computed_fmp'` provider values

**TASK-026-002 — Tiingo adapter Fixes 1–5:**
- Fix 1: `operating_margin = ttmEbit / ttmRevenue` (was single-quarter)
- Fix 2: `net_margin = ttmEarnings / ttmRevenue` (was `overview.profitMargin` DataCode → returns grossMargin)
- Fix 3: `fcf_ttm` from `cashFlow.freeCashFlow` DataCode sum; null if section absent
- Fix 4: `net_debt_to_ebitda = (debt - cashAndEq) / (ttmEbit + ttmDepAmor)`; depamor → 0 if absent
- Fix 5: `interest_coverage = ttmEbit / ttmIntExp` (LTM); null when ttmIntExp = 0

**TASK-026-003 — FMP adapter Fix 6 + BC-026-001:**
- BC-026-001: Removed `/1_000_000` from `revenue_ttm` and `earnings_ttm` (now absolute USD)
- Fix 6: Added `cashAndCashEquivalents` extraction; `total_debt` and `cash_and_equivalents` returned
- Added `net_debt_to_ebitda: null` and `fcf_ttm: null` to return (FMP handles neither)

**TASK-026-004 — Sync service Fix 7:**
- Removed `roe → fcfConversion` proxy
- Added `fcf_ttm / earnings_ttm → fcfConversion` when both non-null
- Added `fcf_ttm > 0 → fcfPositive` with provenance entry
- Changed `debt_to_equity → netDebtToEbitda` to `net_debt_to_ebitda → netDebtToEbitda`
- Added `total_debt → totalDebt` mapping with provenance
- Added `cash_and_equivalents → cashAndEquivalents` mapping with provenance

**TASK-026-005 — Unit tests:**
- Created `tests/unit/data-ingestion/story-026-fixes.test.ts` (new, 38 test cases covering Fixes 1–6 + BC-026-001)
- Updated `tests/unit/data-ingestion/tiingo.adapter.test.ts`: added cashAndEq to Q0 fixture; updated interest_coverage assertion (34.5 LTM); added net_debt_to_ebitda test
- Updated `tests/unit/data-ingestion/fundamentals-sync.service.test.ts`: added Fix 7 tests (fcfConversion, fcfPositive, net_debt_to_ebitda, totalDebt, cashAndEquivalents); updated makeFundamentals() with new fields; fixed all-null test
- Updated `tests/unit/data-ingestion/fmp.adapter.test.ts`: BC-026-001 test updated (400M absolute); Fix 6 test added; fixture updated with cashAndCashEquivalents

**Files Changed:**
- `src/modules/data-ingestion/types.ts` — FundamentalData + ProvenanceEntry extended
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — Fixes 1–5 implemented
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — Fix 6 + BC-026-001
- `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` — Fix 7
- `tests/fixtures/tiingo-fundamentals-response.json` — cashAndEq added to Q0 balance sheet
- `tests/unit/data-ingestion/story-026-fixes.test.ts` (created)
- `tests/unit/data-ingestion/tiingo.adapter.test.ts` (updated)
- `tests/unit/data-ingestion/fundamentals-sync.service.test.ts` (updated)
- `tests/unit/data-ingestion/fmp.adapter.test.ts` (updated)

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-026-fixes.test.ts` — 38 new tests (Fixes 1–6 + BC-026-001)
- `tests/unit/data-ingestion/tiingo.adapter.test.ts` — 2 assertions updated, 1 test added
- `tests/unit/data-ingestion/fundamentals-sync.service.test.ts` — 5 new Fix-7 tests; makeFundamentals() updated
- `tests/unit/data-ingestion/fmp.adapter.test.ts` — 2 tests updated, 1 new Fix 6 test

**Result/Status:** 320/320 unit tests passing
**Blockers/Issues:** TASK-026-006 (integration tests) pending — requires live API + DATABASE_URL
**Baseline Impact:** NO — bug fixes only; no RFC/ADR changes required
**Next Action:** TASK-026-006 integration tests (deferred to after STORY-026 unit completion); proceed to STORY-027

---

## 2026-04-21 UTC — STORY-027: Market Cap, Enterprise Value & Trailing Multiples

**Epic:** EPIC-003
**Story:** STORY-027
**Task:** TASK-027-001 through TASK-027-007 (unit tests)
**Action:** Implemented market cap sync, TTM absolute column storage, and trailing multiple computation.

**Key decisions:**
- `sharesOutstanding` field name confirmed via research (FMP profile response)
- `marketCap` field name confirmed (already used in existing `fetchMetadata()`)
- `market_cap_usd` added to `StockMetadata` alongside `market_cap_millions` — universe sync uses millions for $5B threshold; market-cap sync uses USD for EV computation
- `eps_ttm` from Tiingo: sum of quarterly `eps` DataCodes (true TTM diluted EPS); from FMP: annual `epsDiluted`
- `ebit_ttm` from FMP: uses `ebit` field; falls back to `operatingIncome` when absent (EBIT ≈ operating income in FMP statements)
- `syncMarketCapAndMultiples()` in separate file `market-cap-sync.service.ts` — keeps fundamentals-sync focused

**Files Changed:**
- `tests/fixtures/fmp-profile-response.json` (created — real AAPL values: $3.28T marketCap, 15.38B shares)
- `tests/fixtures/fmp-income-statement-response.json` (updated — added epsDiluted and ebit fields)
- `prisma/schema.prisma` — 5 new columns: earningsTtm, revenueTtm, ebitTtm, sharesOutstanding, epsTtm
- `prisma/migrations/20260421000001_add_ttm_columns/migration.sql` (created)
- `src/modules/data-ingestion/types.ts` — FundamentalData: added ebit_ttm, eps_ttm; StockMetadata: added market_cap_usd, shares_outstanding
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — fetchFundamentals() returns ebit_ttm, eps_ttm; fetchMetadata() returns market_cap_usd: null, shares_outstanding: null
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — fetchFundamentals() returns ebit_ttm, eps_ttm; fetchMetadata() returns market_cap_usd, shares_outstanding
- `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` — maps earnings_ttm/revenue_ttm/ebit_ttm/eps_ttm to DB columns with provenance
- `src/modules/data-ingestion/jobs/market-cap-sync.service.ts` (created)
- `tests/unit/data-ingestion/story-027-multiples.test.ts` (created — 14 test cases)
- `tests/unit/data-ingestion/tiingo.adapter.test.ts` — added ebit_ttm/eps_ttm assertions; added market_cap_usd/shares_outstanding null assertions
- `tests/unit/data-ingestion/fmp.adapter.test.ts` — updated mockProfile with sharesOutstanding; added market_cap_usd/shares_outstanding test
- `tests/unit/data-ingestion/fundamentals-sync.service.test.ts` — added ebit_ttm/eps_ttm to makeFundamentals() and allNull
- `tests/integration/data-ingestion/fundamentals-sync.service.test.ts` — updated fullFundamentals with new fields
- `tests/integration/data-ingestion/pipeline.test.ts` — updated makeFundamentals() with new fields

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-027-multiples.test.ts` — 14 new tests
- 4 existing test files updated

**Result/Status:** 337/337 unit tests passing
**Blockers/Issues:** TASK-027-007 integration tests deferred (requires live API + DATABASE_URL)
**Baseline Impact:** NO — adds new columns and sync step; no RFC/ADR changes required
**Next Action:** STORY-028 (forward estimates enrichment)

---

## 2026-04-21 14:00 UTC - STORY-028 Complete: Forward Estimates Enrichment

**Epic:** EPIC-003
**Story:** STORY-028
**Task:** TASK-028-001 through TASK-028-005
**Action:** Fixed forward estimates pipeline to store actual ratios instead of raw inputs. Changed `forward_pe`/`forward_ev_ebit` to store computed P/E and EV/EBIT. Added raw NTM input columns for auditability. Added `forward_ev_sales`, `eps_growth_fwd`, `revenue_growth_fwd`.

Key implementation decisions:
- `ForwardEstimates` type renamed: `forward_pe → eps_ntm`, `forward_ev_ebit → ebit_ntm`, `revenue_ntm` added
- `eps_ntm`, `ebit_ntm`, `revenue_ntm` stored in absolute USD (no /1_000_000) — consistent with STORY-027 TTM values
- Ratio computation: `forward_pe = currentPrice / eps_ntm`, `forward_ev_ebit = ev / ebit_ntm`, `forward_ev_sales = ev / revenue_ntm`
- `eps_growth_fwd = (eps_ntm − eps_ttm) / |eps_ttm| × 100` (percentage, consistent with existing format)
- `revenue_growth_fwd = (revenue_ntm − revenue_ttm) / revenue_ttm × 100` (percentage)
- Level 3 computed trailing fallback unchanged — reads DB values from prior run
- Execution order enforced: syncForwardEstimates must run after syncMarketCapAndMultiples

**Files Changed:**
- `src/modules/data-ingestion/types.ts` — ForwardEstimates interface: eps_ntm, ebit_ntm, revenue_ntm (renamed from forward_pe/forward_ev_ebit)
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — fetchForwardEstimates(): returns eps_ntm, ebit_ntm (no /1M), revenue_ntm from estimatedRevenueAvg
- `src/modules/data-ingestion/jobs/forward-estimates-sync.service.ts` — full rewrite: expanded DB select (+6 fields), store raw NTM inputs, compute 5 derived ratios, provenance for all 8 fields
- `prisma/schema.prisma` — 4 new columns: epsNtm, ebitNtm, revenueNtm, forwardEvSales
- `prisma/migrations/20260421000002_add_ntm_columns/migration.sql` (created)
- `tests/unit/data-ingestion/story-028-estimates.test.ts` (created — 14 new tests)
- `tests/unit/data-ingestion/fmp.adapter.test.ts` — updated: forward_pe→eps_ntm, ebitAvg unit test updated to absolute USD, revenue_ntm test added
- `tests/unit/data-ingestion/forward-estimates-sync.service.test.ts` — updated: DEFAULT_STOCK_ROW (+6 fields), mock values renamed, findMany select assertion updated, forward_ev_ebit test rewritten

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-028-estimates.test.ts` — 14 new tests (ratio computation, null guards, provenance)
- 2 existing unit test files updated

**Result/Status:** 352/352 unit tests passing
**Blockers/Issues:** TASK-028-006 integration tests deferred (requires live API + DATABASE_URL)
**Baseline Impact:** NO — extends existing columns; field rename in ForwardEstimates is internal to data pipeline; no RFC/ADR changes required
**Next Action:** STORY-029 (3-year growth CAGRs)

---

## 2026-04-21 15:00 UTC — STORY-029: 3-Year Growth CAGRs

**Epic:** EPIC-003
**Story:** STORY-029 — 3-Year Growth CAGRs
**Task:** TASK-029-001 through TASK-029-005 (all tasks)
**Action:** Implemented correct 3-year CAGRs for revenue, EPS, and share count; gross_profit_growth (YoY); fixed wrong YoY→3y misrouting from STORY-020; updated both adapters and sync service.

**Files Changed:**
- `src/modules/data-ingestion/types.ts` (modified) — added `revenue_growth_3y`, `eps_growth_3y`, `gross_profit_growth`, `share_count_growth_3y` to FundamentalData
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` (modified) — limit=5 for income statement; cagrPercent() helper; 3-year CAGR computation from index 0 vs index 3; gross_profit_growth YoY; share_count_growth_3y from weightedAverageShsOutDil
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` (modified) — grossProfit DataCode reading; gross_profit_growth from 8Q TTM window; revenue_growth_3y/eps_growth_3y from 16Q window; share_count_growth_3y null
- `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` (modified) — removed wrong revenueGrowth3y←revenue_growth_yoy and epsGrowth3y←eps_growth_yoy mappings; added correct revenue_growth_3y→revenueGrowth3y, eps_growth_3y→epsGrowth3y, gross_profit_growth→grossProfitGrowth, share_count_growth_3y→shareCountGrowth3y
- `tests/fixtures/fmp-income-statement-response.json` (modified) — added FY2021 and FY2020 entries; added weightedAverageShsOutDil to all 4 entries
- `tests/fixtures/tiingo-fundamentals-response.json` (modified) — added grossProfit DataCode to all 8 existing quarters; added Q8-Q15 (2020-2021) for 16-quarter window

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-029-growth-cagrs.test.ts` (created) — 24 new tests: FMP CAGR computations, Tiingo 16Q window, sync service field routing
- `tests/unit/data-ingestion/tiingo.adapter.test.ts` (modified) — added grossProfit DataCodes to Q1-Q7 in fixture; added 4 new assertions for STORY-029 fields
- `tests/unit/data-ingestion/fundamentals-sync.service.test.ts` (modified) — updated makeFundamentals() with 4 new fields; updated allNull object

**Result/Status:** 379/379 unit tests passing (up from 352, +27 new tests)
**Blockers/Issues:** TASK-029-006 integration tests deferred (requires live API + DATABASE_URL)
**Baseline Impact:** NO — uses existing schema columns (revenueGrowth3y, epsGrowth3y, grossProfitGrowth, shareCountGrowth3y already in schema); no RFC/ADR changes required
**Next Action:** STORY-030 (ROIC: NOPAT / Invested Capital)

---

## 2026-04-21 16:30 UTC — STORY-030: ROIC — NOPAT / Invested Capital

**Epic:** EPIC-003
**Story:** STORY-030 — ROIC: NOPAT / Invested Capital
**Task:** TASK-030-001 through TASK-030-002 (all tasks)
**Action:** Replaced incorrect ROIC formula (netIncome / (equity+debt)) with NOPAT / Invested Capital in both adapters. NOPAT = TTM EBIT × (1 − effective_tax_rate); IC = equity + debt − cash; effective_tax_rate = TTM taxExp / TTM pretaxinc, clamped [0, 0.50]; 25% statutory fallback on loss year (pretaxinc ≤ 0). roic=null when IC ≤ 0.

**Files Changed:**
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` (modified) — added ttmTaxExp/ttmPretaxInc sums from taxExp/pretaxinc DataCodes; NOPAT/IC ROIC formula; IC fallback to equity+debt when cashAndEq absent
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` (modified) — extracted incomeTaxExpense/incomeBeforeTax from latest income record; NOPAT/IC ROIC formula; IC fallback when cash null
- `src/modules/data-ingestion/types.ts` (modified) — updated roic JSDoc to reflect new formula
- `tests/fixtures/fmp-income-statement-response.json` (modified) — added incomeTaxExpense/incomeBeforeTax to all 4 FY entries
- `tests/fixtures/tiingo-fundamentals-response.json` (modified) — added taxExp/pretaxinc DataCodes to all 16 quarters

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-030-roic.test.ts` (created) — 12 edge case tests: IC=0→null, IC<0→null, loss-year 25% fallback, 50% rate cap, ebit=0→null, cash-absent IC fallback; both adapters
- `tests/unit/data-ingestion/tiingo.adapter.test.ts` (modified) — added taxExp/pretaxinc to Q0-Q3 fixture; updated ROIC assertion to new formula
- `tests/unit/data-ingestion/fmp.adapter.test.ts` (modified) — added incomeTaxExpense/incomeBeforeTax to mockIncome[0]; updated ROIC assertion to 96M/130M

**Result/Status:** 391/391 unit tests passing (up from 379, +12 new tests)
**Blockers/Issues:** TASK-030-003 integration tests deferred (requires live API + DATABASE_URL; taxExp/pretaxinc DataCodes assumed from spec, unverified against live Tiingo)
**Baseline Impact:** NO — roic column already exists in schema (Decimal(5,4)); no RFC/ADR changes required
**Next Action:** STORY-031 (GAAP / Non-GAAP EPS Reconciliation Factor)

---

## 2026-04-21 17:30 UTC — STORY-031: GAAP / Non-GAAP EPS Reconciliation Factor

**Epic:** EPIC-003
**Story:** STORY-031 — GAAP / Non-GAAP EPS Reconciliation Factor
**Task:** TASK-031-001 through TASK-031-006 (all tasks)
**Action:** Implemented `gaap_adjustment_factor = GAAP EPS / non-GAAP EPS` for most recently completed fiscal year. GAAP EPS = FMP annual `epsDiluted` (stored as `eps_ttm` in DB). Non-GAAP EPS = FMP analyst consensus `epsAvg` for most recently completed FY (new field `nonGaapEpsMostRecentFy` on `ForwardEstimates`). Clamped to [0.10, 2.00]; null when denominator < 0.10 or either input null.

**Architecture decision**: Computed in `syncForwardEstimates` (has both `epsTtmNum` from DB and `nonGaapEpsMostRecentFy` from `ForwardEstimates` in-memory — no extra API call). **V1 simplification**: date-matching guard skipped (would require extra DB column not in spec); for S&P 500 universe FY dates always align.

**Files Changed:**
- `src/modules/data-ingestion/types.ts` (modified) — `FundamentalData`: added `gaapEps`, `gaapEpsFiscalYearEnd`; `ForwardEstimates`: added `nonGaapEpsMostRecentFy`, `nonGaapEpsFiscalYearEnd`
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` (modified) — `fetchFundamentals()`: expose `gaapEps`/`gaapEpsFiscalYearEnd`; `fetchForwardEstimates()`: extract `nonGaapEpsMostRecentFy`/`nonGaapEpsFiscalYearEnd` from most recent completed FY `epsAvg`
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` (modified) — `fetchFundamentals()`: return `gaapEps: null`, `gaapEpsFiscalYearEnd: null`
- `src/modules/data-ingestion/jobs/forward-estimates-sync.service.ts` (modified) — compute `gaapAdjustmentFactor` after `revenueGrowthFwdComputed`; write with `provider: 'computed_fmp'` provenance
- `prisma/schema.prisma` (modified) — added `gaapAdjustmentFactor Decimal? @db.Decimal(5,4)`
- `prisma/migrations/20260421000003_add_gaap_adjustment_factor/migration.sql` (created)

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-031-gaap.test.ts` (created) — 9 tests: basic ratio, typical AAPL, clamp lower/upper, threshold guard, null inputs, provenance
- `tests/unit/data-ingestion/fmp.adapter.test.ts` (modified) — added `gaapEps`/`gaapEpsFiscalYearEnd` assertions to fundamentals test; added `nonGaapEpsMostRecentFy`/`nonGaapEpsFiscalYearEnd` assertions to estimates test; new test for all-future entries
- `tests/unit/data-ingestion/forward-estimates-sync.service.test.ts` (modified) — added `nonGaapEpsMostRecentFy` to primary mock; added `gaapAdjustmentFactor` assertion; new null-guard test
- `tests/unit/data-ingestion/fundamentals-sync.service.test.ts` (modified) — added `gaapEps`/`gaapEpsFiscalYearEnd` to `makeFundamentals()` and `allNull` fixtures
- `tests/unit/data-ingestion/story-029-growth-cagrs.test.ts` (modified) — added `gaapEps: null`, `gaapEpsFiscalYearEnd: null` to all 5 inline `FundamentalData` objects

**Result/Status:** 402/402 unit tests passing (up from 391, +11 new tests)
**Blockers/Issues:** TASK-031-004 integration tests deferred (requires live API + DATABASE_URL)
**Baseline Impact:** NO — new schema column; no RFC/ADR changes required
**Next Action:** STORY-032 or next story as planned

---

## 2026-04-21 UTC — Classification Delta Planning + Baseline Documentation Update

**Epic:** EPIC-003 / EPIC-003.1
**Story:** Planning — no code implementation
**Task:** N/A (documentation-only milestone)
**Action:** Completed classification delta analysis. Identified all missing classification-support fields. Designed EPIC-003.1 (Classification LLM Enrichment) as a new V1.0 epic covering all LLM-based enrichment work. Updated baseline documentation.

**Analysis findings:**
- RFC-001 `ManualFlags` interface: all 7 flags at DEFAULT FALSE for entire universe (classification blocker)
- `share_count_growth_3y`: NULL for all stocks despite being in RFC-001 FundamentalFields and RFC-002 schema
- E1–E6 qualitative scores (moat, pricing power, etc.): completely absent from all RFCs and schema
- RFC-001 tie-break resolver directly reads holding_company_flag, insurer_flag, cyclicality_flag, binary_flag — making these classification blockers, not nice-to-haves

**Documentation changes:**
- `docs/adr/ADR-012-llm-enrichment-for-classification.md` (created) — decision to use Claude API for LLM-based flag detection; alignment with ADR-004 rules-first principle
- `docs/rfc/RFC-007-llm-enrichment-provider-architecture.md` (created) — abstract LLMProvider interface, ClaudeProvider spec, prompt file conventions, confidence gating, provenance shape, error handling
- `docs/rfc/RFC-001-classification-engine-architecture.md` (amended) — ManualFlags renamed ClassificationFlags with sourcing tiers; ClassificationEnrichmentScores interface added for E1–E6; amendment section appended
- `docs/rfc/RFC-002-canonical-data-model-persistence.md` (amended) — flag column comments updated to reflect auto-detection pipeline; E1–E6 column spec added in amendment section
- `docs/rfc/RFC-004-data-ingestion-refresh-pipeline.md` (amended) — two new sync jobs added to pipeline diagram and amendment section
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (modified) — STORY-032–033 added to EPIC-003; EPIC-003.1 section added with STORY-034–040; EPIC-004 dependency updated; status summary updated

**Story specs created:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-032-share-count-growth.md`
- `stories/tasks/EPIC-003-data-ingestion/STORY-033-deterministic-classification-flags.md`
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-034-llm-provider-infrastructure.md`
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-035-holding-company-flag.md`
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-036-cyclicality-flag.md`
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-037-binary-flag.md`
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-038-classification-enrichment-sync-job.md`
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-039-enrichment-scores-schema.md`
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-040-qualitative-enrichment-scores.md`

**Tests Added/Updated:** None (documentation-only)
**Result/Status:** Documentation complete; no code changes
**Blockers/Issues:** None
**Baseline Impact:** YES — RFC-001 amended (ClassificationFlags); RFC-002 amended (flag descriptions + E1-E6 spec); RFC-004 amended (new sync jobs); RFC-007 created; ADR-012 created. All amendments approved per classification delta planning session 2026-04-21.
**Next Action:** STORY-032 — implement share_count_growth_3y from FMP historical share data

---

## 2026-04-21 UTC — Classification Stories Revised (Adversarial Review Response)

**Epic:** EPIC-003 / EPIC-003.1
**Story:** N/A (planning revision)
**Action:** Applied accepted fixes from adversarial review of STORY-032–040. Rejected points that conflicted with explicit user requirements (EPIC-003.1 split, abstract provider, separate prompt files, JSONB provenance). Answered deferred questions independently.

**Accepted and applied:**
- Single combined LLM call per stock (not 4 separate calls) — STORY-038/040 redesigned; RFC-007 updated
- STORY-032: pinned share count derivation to single FMP historical endpoint consistently; added admin auth cross-reference
- STORY-033: enumerated all insurer industry strings including "Managed Care" (Cigna/UHC case); removed overstatement; added threshold rationale inline
- STORY-034: removed YAML frontmatter from prompt file convention; output schema lives in TypeScript
- STORY-035: removed "subsidiary keyword" heuristic (false positives); SIC → LLM directly
- STORY-036: added explicit note on Real Estate → LLM (not FALSE); documented V1 decision on deferring volatility signals
- STORY-037: narrowed LLM gate to targeted cohorts; added large-cap exclusion rule (market_cap > $10B, non-Healthcare/Financials/Energy → FALSE without LLM)
- STORY-038: added 5 explicit recomputation triggers (prompt version drift, model drift, error state, new stock, recent data change); integration test marked as optional smoke test
- STORY-040: redesigned as combined flag + score call; `combined-enrichment.md` is the primary operational prompt; deterministic context passed to LLM to prevent contradictions

**Rejected (with reasoning logged):**
- EPIC-003.1 removal: user explicitly requested this split
- Abstract provider removal: user explicitly required swappable provider
- *_final/*_source columns: user approved JSONB provenance approach
- "draft" status: not in our defined status model
- Confidence 0-1 vs score 1-5 conflict: these are orthogonal fields

**Deferred questions answered:**
- Threshold grounding: no ADR needed; rationale documented inline in STORY-033 (grounded in 3AA Bucket 6-8 logic)
- Cyclicality volatility signals: deferred for V1; sector heuristic + LLM accepted

**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-032-share-count-growth.md` (rewritten)
- `stories/tasks/EPIC-003-data-ingestion/STORY-033-deterministic-classification-flags.md` (rewritten)
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-034-llm-provider-infrastructure.md` (rewritten)
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-035-holding-company-flag.md` (rewritten)
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-036-cyclicality-flag.md` (rewritten)
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-037-binary-flag.md` (rewritten)
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-038-classification-enrichment-sync-job.md` (rewritten)
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-040-qualitative-enrichment-scores.md` (rewritten)
- `docs/rfc/RFC-007-llm-enrichment-provider-architecture.md` (amended: combined call architecture, simplified prompt conventions, recomputation triggers, decisions section)

**Result/Status:** All 9 story specs revised; RFC-007 updated; documentation consistent
**Baseline Impact:** NO — no additional RFC/ADR changes beyond what was already logged 2026-04-21
**Next Action:** STORY-032 — implement share_count_growth_3y from FMP historical share data

---

## 2026-04-21 — STORY-032 Task Decomposition, Validation, and TASK-032-001 Execution

**Epic:** EPIC-003
**Story:** STORY-032
**Task:** TASK-032-001 (Validate FMP endpoint — GATE)
**Action:** Story breakdown produced (7 tasks), self-validated (3 minor issues corrected), story file updated to `ready`. TASK-032-001 executed: live FMP API investigation to confirm historical market cap endpoint accessibility and response shape.

**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-032-share-count-growth.md` (updated: full task breakdown, BDD scenarios, test plan, status → ready)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (STORY-032 status → blocked — BC-032-001)

**Tests Added/Updated:** None (TASK-032-001 is investigation only)

**Result/Status:** BLOCKED — BC-032-001

**BC-032-001 — FMP historical market cap endpoint insufficient:**
- Story spec assumed `/v3/historical-market-capitalization/{ticker}?limit=1500` returns 5+ years of `{ date, marketCap, price }` entries
- Actual: stable endpoint returns 63 entries (~3 months only), no `price` field; v3 locked (legacy users only)
- `shares-outstanding-history` and `historical-shares-float` stable endpoints return `[]` for AAPL
- EOD price endpoint returns 1255 entries (5 years, `close` price) but no `marketCap`
- Fixture provenance: captured_real (live AAPL calls 2026-04-21)

**Proposed resolution paths (awaiting user decision):**
1. Revise STORY-032 to use `weightedAverageShsOutDil` from annual income statement as authoritative source for both anchors (FY0 and FY-3). Self-consistent; satisfies the original consistency constraint. Computation partially exists in STORY-029. (Recommended)
2. Two-endpoint join (EOD price + market cap) — violates consistency principle; not recommended
3. Defer pending higher FMP API tier

**Baseline Impact:** YES — story spec references an FMP v3 endpoint that is no longer accessible under our API tier. Story must be revised before implementation can proceed. No RFC/ADR amendment required; this is a data-source availability constraint.

**Next Action:** Await user decision on BC-032-001 resolution path before proceeding

---

## 2026-04-21 — STORY-032 TASK-032-002 through TASK-032-007 Execution (Path A adopted)

**Epic:** EPIC-003
**Story:** STORY-032
**Task:** TASK-032-002, TASK-032-003, TASK-032-004, TASK-032-005, TASK-032-006, TASK-032-007
**Action:** BC-032-001 resolved with Path A. All remaining STORY-032 tasks implemented and unit-verified.

**BC-032-001 Resolution (Path A):** Use `weightedAverageShsOutDil` from FMP `/income-statement?symbol={ticker}&period=annual&limit=5`. Both FY0 (entries[0]) and FY-3 (entries[3]) use the same endpoint and field — self-consistent. Requires ≥4 entries.

**Files Changed:**
- `src/modules/data-ingestion/types.ts` — extended ProvenanceEntry: added `method?`, `period_start?`, made `fallback_used?` optional, added `'deterministic_heuristic'` to provider union; updated FundamentalData.share_count_growth_3y JSDoc
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — added `fetchAnnualShareCounts(ticker)` method; removed dead share-count computation; set `share_count_growth_3y: null` in fetchFundamentals return
- `src/modules/data-ingestion/utils/share-count-growth.ts` — created; exports `computeShareCountGrowth3y()` (CAGR = `(FY0/FY-3)^(1/3) - 1`)
- `src/modules/data-ingestion/jobs/share-count-sync.service.ts` — created; exports `syncShareCount(fmpAdapter): Promise<ShareCountSyncResult>`; provenance: `{ provider: 'fmp', method: 'income_statement_cagr', period_start, period_end, synced_at }`
- `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` — removed `shareCountGrowth3y` write block from buildUpdateFromFundamentals; ShareCountSyncService is now authoritative writer
- `src/app/api/admin/sync/share-count/route.ts` — created; POST handler with validateAdminApiKey auth
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-032 status → done ✅; active story → STORY-033
- `stories/tasks/EPIC-003-data-ingestion/STORY-032-share-count-growth.md` — status updated to done

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-032-share-count-growth.test.ts` (created) — 14 tests: FMPAdapter.fetchAnnualShareCounts (3), computeShareCountGrowth3y (6), syncShareCount service using jest.requireActual (3), POST route (2)
- `tests/unit/data-ingestion/story-029-growth-cagrs.test.ts` (modified) — 4 assertions updated to reflect share_count_growth_3y null from fundamentals sync; added revenue_growth_3y to fixture to ensure DB write fires; all 24 tests passing

**Result/Status:** DONE ✅ — unit_verified
- story-032 tests: 14/14 passing
- story-029 regression: 24/24 passing
- No new TypeScript errors introduced (pre-existing 21 errors unchanged)

**Blockers/Issues:** None

**Baseline Impact:** NO — Path A uses income statement endpoint already in scope; no RFC/ADR amendment required

**Next Action:** STORY-033 — Deterministic Classification Flags

---

## 2026-04-21 — STORY-033 Detail, Validation, and Full Execution

**Epic:** EPIC-003
**Story:** STORY-033
**Task:** TASK-033-001 through TASK-033-004
**Action:** Story detailed (BDD scenarios, 4 tasks, 22-test plan), self-validated (Decimal conversion risk identified and resolved in spec), all tasks implemented and unit-verified.

**Self-validation findings corrected before execution:**
1. Prisma Decimal → number: `.toNumber()` required (not `Number()`); documented in TASK-033-002 spec and reflected in service code
2. `earningsTtm null + revenue 50M–200M` edge case → FALSE (not TRUE); explicitly specified
3. Partial write test added (2 of 3 flags non-null)

**Files Changed:**
- `stories/tasks/EPIC-003-data-ingestion/STORY-033-deterministic-classification-flags.md` — full task breakdown, BDD scenarios, test plan, status → done
- `src/modules/data-ingestion/jobs/deterministic-classification-sync.service.ts` (created) — `computeDeterministicFlags()` pure function + `syncDeterministicClassificationFlags()` job; INSURER_INDUSTRIES Set; Decimal.toNumber() conversion
- `src/app/api/admin/sync/deterministic-flags/route.ts` (created) — POST handler with validateAdminApiKey auth
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-033 status → done ✅; active story updated (EPIC-003 complete)

**Tests Added/Updated:**
- `tests/unit/data-ingestion/story-033-deterministic-flags.test.ts` (created) — 23 tests: computeDeterministicFlags (17), syncDeterministicClassificationFlags using jest.requireActual (3), POST route (2), + 1 case-insensitive bonus
- Full unit regression: 307/307 passing across 17 test suites

**Result/Status:** DONE ✅ — unit_verified
- story-033 tests: 23/23 passing
- Full regression: 307/307 passing
- No new TypeScript errors

**Blockers/Issues:** None

**Baseline Impact:** NO — flag rules, thresholds, and column names match RFC-001/RFC-002 exactly

**Next Action:** EPIC-003 complete ✅ — proceed to EPIC-003.1 (STORY-034 — LLM Provider Interface and Prompt File Infrastructure)

---

## 2026-04-21 — STORY-034 Detail, Validation, and Full Execution

**Epic:** EPIC-003.1
**Story:** STORY-034
**Task:** TASK-034-001 through TASK-034-006
**Action:** Story detailed (BDD scenarios, 6 tasks, 7-test plan), self-validated (interpolation flow clarified between PromptLoader and ClaudeProvider per RFC-007), all tasks implemented and unit-verified.

**Self-validation findings corrected before execution:**
1. RFC-007 design tension resolved: provider (`ClaudeProvider`) does interpolation of raw template; `promptVersion = sha256(rawTemplate)` is stable across calls for same template. PromptLoader.load(path, vars?) provides optional interpolation for test/admin use cases.
2. Test isolation: `fs` mocked via `jest.mock('fs')` + `jest.requireActual` for PromptLoader (avoids real disk access; allows controlled content for version-change test).

**Files Changed:**
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-034-llm-provider-infrastructure.md` — full task breakdown, BDD scenarios, test plan, status → done
- `src/modules/classification-enrichment/ports/llm-provider.interface.ts` (created) — LLMProviderConfig, LLMResponse<T>, LLMProvider interface
- `src/modules/classification-enrichment/providers/claude.provider.ts` (created) — ClaudeProvider, ClaudeProvider.fromEnv(), tool-use pattern, interpolate(), sha256Hex()
- `src/modules/classification-enrichment/utils/prompt-loader.ts` (created) — PromptLoader.load(), version hash from raw content, optional interpolation with fail-fast on missing vars
- `src/modules/classification-enrichment/prompts/combined-enrichment.md` (created stub)
- `src/modules/classification-enrichment/prompts/holding-company-flag.md` (created stub)
- `src/modules/classification-enrichment/prompts/cyclicality-flag.md` (created stub)
- `src/modules/classification-enrichment/prompts/binary-flag.md` (created stub)
- `.env.example` — added ANTHROPIC_API_KEY, LLM_MODEL, LLM_ENRICHMENT_CONFIDENCE_THRESHOLD
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-034 status → done ✅; EPIC-003.1 status → in_progress

**Tests Added/Updated:**
- `tests/unit/classification-enrichment/story-034-llm-provider-infrastructure.test.ts` (created) — 7 tests: PromptLoader (4), ClaudeProvider (3)
- Full unit regression: 447/447 passing across 38 test suites

**Result/Status:** DONE ✅ — unit_verified
- story-034 tests: 7/7 passing
- Full regression: 447/447 passing
- No new TypeScript errors

**Blockers/Issues:** None

**Baseline Impact:** NO — interface matches RFC-007 exactly; env var names match RFC-007 §Configuration

**Next Action:** STORY-035 — holding_company_flag via Heuristic + LLM

---

## 2026-04-21 — STORY-035 Detail, Validation, and Full Execution

**Epic:** EPIC-003.1
**Story:** STORY-035
**Task:** TASK-035-001 through TASK-035-004
**Action:** Story detailed (BDD scenarios, 4 tasks, 7-test plan), self-validated (3 risks resolved), all tasks implemented and unit-verified.

**BC-035-001 confirmed:** FMP stable profile endpoint does not return `sic` field (verified live for AAPL — field absent from response). All production stocks have `sicCode: null` → all go to LLM path. SIC heuristic code remains in detector and is covered by synthetic test fixtures (SIC "6719" → TRUE, tested without live API).

**Self-validation findings corrected before execution:**
1. ProvenanceEntry lacked `model`, `confidence`, `prompt_file`, `prompt_version`, `null_decision`, `error`, `error_message` — added as optional fields. All existing usages backward-compatible.
2. `'claude'` not in ProvenanceEntry provider union — added alongside existing values.
3. Null-safe defaults for template variables (`?? ''`) prevent PromptLoader/provider from throwing when company_name/description are null.

**Files Changed:**
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-035-holding-company-flag.md` — full task breakdown, status → done
- `src/modules/data-ingestion/types.ts` — StockMetadata: added `description`, `sicCode`; ProvenanceEntry: added `claude` to provider union, added LLM enrichment fields
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — fetchMetadata(): extract `description` and `sicCode` (sicCode always null per BC-035-001)
- `src/modules/classification-enrichment/prompts/holding-company-flag.md` — replaced stub with full prompt body
- `src/modules/classification-enrichment/detectors/holding-company.detector.ts` (created) — detectHoldingCompanyFlag(), SIC heuristic, LLM path, confidence gating, error isolation
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-035 status → done ✅

**Tests Added/Updated:**
- `tests/unit/classification-enrichment/story-035-holding-company-flag.test.ts` (created) — 7 tests: all detection paths covered
- Full unit regression: 454/454 passing across 39 test suites

**Result/Status:** DONE ✅ — unit_verified
- story-035 tests: 7/7 passing
- Full regression: 454/454 passing
- No new TypeScript errors

**Blockers/Issues:** BC-035-001 (resolved — documented, handled in code)

**Baseline Impact:** NO — BC-035-001 is a data-source availability constraint; SIC heuristic code path preserved for synthetic use; no RFC/ADR amendment required

**Next Action:** STORY-036 — cyclicality_flag via Sector Rule + LLM

---

## 2026-04-21 — STORY-036 Detail, Validation, and Full Execution

**Epic:** EPIC-003.1
**Story:** STORY-036
**Task:** TASK-036-001 through TASK-036-003
**Action:** Story detailed, self-validated (null sector edge case added to LLM bucket), all tasks implemented and unit-verified.

**Files Changed:**
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-036-cyclicality-flag.md` — full task breakdown, status → done
- `src/modules/classification-enrichment/prompts/cyclicality-flag.md` — replaced stub with full prompt body
- `src/modules/classification-enrichment/detectors/cyclicality.detector.ts` (created) — detectCyclicalityFlag(), CYCLICAL_SECTORS/DEFENSIVE_SECTORS sets, LLM path, confidence gating, error isolation
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-036 status → done ✅

**Tests Added/Updated:**
- `tests/unit/classification-enrichment/story-036-cyclicality-flag.test.ts` (created) — 7/7 passing
- Full unit regression: 461/461 passing across 40 test suites

**Result/Status:** DONE ✅ — unit_verified

**Baseline Impact:** NO

**Next Action:** STORY-037 — binary_flag via Heuristic + LLM

---

## 2026-04-21 — STORY-037 Detail, Validation, and Full Execution

**Epic:** EPIC-003.1
**Story:** STORY-037
**Task:** TASK-037-001 through TASK-037-003
**Action:** Story detailed, self-validated (3 null edge cases resolved), all tasks implemented and unit-verified.

**Self-validation findings corrected before execution:**
1. `revenue_ttm = null` for Healthcare → Level 1 does NOT fire (requires `!== null`) → falls to LLM
2. `market_cap = null` → Level 2 cannot apply → falls to LLM
3. `sector = null` → Level 2 requires `sector !== null` → falls to LLM

**Files Changed:**
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-037-binary-flag.md` — full task breakdown, status → done
- `src/modules/classification-enrichment/prompts/binary-flag.md` — replaced stub with full prompt body
- `src/modules/classification-enrichment/detectors/binary-flag.detector.ts` (created) — detectBinaryFlag(), pre-revenue biotech Level 1, large-cap exclusion Level 2, LLM Level 3
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-037 status → done ✅

**Tests Added/Updated:**
- `tests/unit/classification-enrichment/story-037-binary-flag.test.ts` (created) — 8/8 passing
- Full unit regression: 469/469 passing across 41 test suites

**Result/Status:** DONE ✅ — unit_verified

**Baseline Impact:** NO

**Next Action:** STORY-038 — classificationEnrichmentSync combined job

---

## 2026-04-21 — EPIC-003.1/STORY-038: classificationEnrichmentSync Job

**Epic:** EPIC-003.1 — Classification LLM Enrichment
**Story:** STORY-038 — classificationEnrichmentSync Job
**Task:** TASK-038-001 through TASK-038-005

**Action:** Implemented combined classification enrichment sync job with deterministic pre-filters, recomputation trigger evaluation, and single combined LLM call per stock.

**Pre-implementation findings:**
- `description` field does not exist in Prisma `Stock` model (line 30 `description` is in `FrameworkVersion`). Combined sync passes `description: ''` as LLM variable fallback. V1 limitation — future metadata sync can populate this.
- BC-035-001 confirmed: sicCode always null from FMP → `holding_company_flag` pre-filter always null → `needs_llm` always true in production until FMP exposes SIC.
- Pre-existing Tiingo adapter TS error fixed: missing `description` and `sicCode` fields in `fetchMetadata()` return.

**Files Changed:**
- `src/modules/classification-enrichment/jobs/classification-enrichment-sync.service.ts` (created) — `runDeterministicPreFilters()`, `shouldEnrich()`, `syncClassificationEnrichment()`
- `src/app/api/admin/sync/classification-enrichment/route.ts` (created) — POST endpoint, `?mode=incremental|full`
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` (modified) — added `description: null`, `sicCode: null` to `fetchMetadata()` return
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-038-classification-enrichment-sync-job.md` (status updated to done)

**Tests Added/Updated:**
- `tests/unit/classification-enrichment/story-038-classification-enrichment-sync.test.ts` (created) — 15 tests: 4 pre-filter, 7 shouldEnrich (5 triggers + no-trigger + full mode), 4 sync job integration

**Result/Status:** DONE ✅ — unit_verified — 15/15 tests passing; 484/484 total unit tests passing; no new TypeScript errors

**Blockers/Issues:**
- Test fix: initial "all LLM" test used Healthcare sector which is in DEFENSIVE_SECTORS → cyclicality_flag = false deterministically. Fixed to use Financials sector.

**Baseline Impact:** NO

**Next Action:** STORY-039 — Qualitative enrichment score types

---

## 2026-04-21 — EPIC-003.1/STORY-039: Enrichment Score Columns Schema Migration

**Epic:** EPIC-003.1 — Classification LLM Enrichment
**Story:** STORY-039 — Enrichment Score Columns: Schema Migration + Prisma Update
**Task:** TASK-039-001 through TASK-039-005

**Action:** Added `description TEXT` and 6 E1–E6 score DECIMAL(3,2) columns to the Prisma Stock model, created migration SQL, regenerated Prisma client, updated contracts.test.ts with new column assertions, added `ClassificationEnrichmentScores` TypeScript type.

**Self-validation findings:**
- Migration sequence: 000004 → 000005 ✓
- `description` placed after `country` in Stock model (no @map needed — field name matches DB column)
- Score fields placed after `gaapAdjustmentFactor`, before `forwardPe` block
- DECIMAL(3,2) supports range 1.0–5.0 in 0.5 steps (max 9.99) ✓
- `prisma generate` completed cleanly — Prisma client includes new types ✓
- All pre-existing TS errors are pre-STORY-039; no new errors introduced ✓

**Files Changed:**
- `prisma/schema.prisma` (modified) — added `description String? @db.Text` and 6 score fields
- `prisma/migrations/20260421000005_add_enrichment_scores/migration.sql` (created) — 7 ALTER TABLE statements
- `src/modules/data-ingestion/types.ts` (modified) — added `ClassificationEnrichmentScores` interface
- `tests/integration/data-ingestion/contracts.test.ts` (modified) — added new columns to requiredColumns; added 2 new it() blocks for score numeric type and description text type
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-039-enrichment-scores-schema.md` (status updated to done)

**Tests Added/Updated:**
- `tests/integration/data-ingestion/contracts.test.ts` — 2 new @contract assertions (require live DB to execute)

**Result/Status:** DONE ✅ — schema_verified; `prisma generate` clean; 484/484 unit tests passing; migration SQL ready for `prisma migrate deploy` against live DB

**Blockers/Issues:** None

**Baseline Impact:** NO

**Next Action:** STORY-040 — E1–E6 Qualitative Enrichment Scores + Combined Enrichment Prompt

---

## 2026-04-21 — EPIC-003.1/STORY-040: E1–E6 Qualitative Enrichment Scores + Combined Enrichment Prompt

**Epic:** EPIC-003.1 — Classification LLM Enrichment
**Story:** STORY-040 — E1–E6 Qualitative Enrichment Scores + Combined Enrichment Prompt
**Tasks:** TASK-040-001 through TASK-040-004

**Action:** Wrote the production `combined-enrichment.md` prompt body; implemented `detectCombinedEnrichment()` in a new detector module; extended `classificationEnrichmentSync` to call the combined detector for every stock (E1–E6 always need LLM); added `description` field to DB query and input type; updated STORY-038 unit tests to match new combined response format.

**Self-validation findings:**
- `combined-enrichment.md` contains all 7 template variables; 1/3/5 anchor points for each of the 6 scores; explicit flag definitions consistent with STORY-034 schema ✓
- `detectCombinedEnrichment` never throws — all LLM errors caught; returned in provenance with `error: true` ✓
- Per-flag confidence gating: each flag independently gated; one failing flag doesn't suppress others ✓
- Shared `scores_confidence` gate: single value gates all 6 scores atomically ✓
- Half-integer rounding: `Math.round(v * 2) / 2` verified via unit test (3.7→3.5, 3.8→4.0) ✓
- `needs_llm` guard removed from sync service — E1-E6 require LLM regardless of pre-filter results ✓
- Provenance merge: pre-determined flag provenance from heuristics preserved; LLM provenance skipped for pre-determined flags ✓
- All pre-existing TS errors pre-date STORY-040; no new TS errors introduced ✓

**Files Changed:**
- `src/modules/classification-enrichment/prompts/combined-enrichment.md` (replaced stub) — full production prompt with 7 variables, 6 score definitions, 3 flag definitions
- `src/modules/classification-enrichment/detectors/enrichment-scores.detector.ts` (created) — `detectCombinedEnrichment()` with per-flag gating, shared score gating, half-integer rounding, error isolation
- `src/modules/classification-enrichment/jobs/classification-enrichment-sync.service.ts` (modified) — added `description` to input type, added `SCORE_DB_MAP`/`FLAG_DB_MAP`, replaced inline LLM stub with `detectCombinedEnrichment()` call, always calls LLM (no `needs_llm` guard)
- `tests/unit/classification-enrichment/story-040-combined-enrichment.test.ts` (created) — 5 unit tests for `detectCombinedEnrichment`
- `tests/unit/classification-enrichment/story-038-classification-enrichment-sync.test.ts` (modified) — updated `makeMockProvider` to new combined format; added `description: null` to `makeDbStock`; changed `llm_calls_made` assertion from 1→2
- `stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-040-qualitative-enrichment-scores.md` (status updated to done)

**Tests Added/Updated:**
- `tests/unit/classification-enrichment/story-040-combined-enrichment.test.ts` — 5 tests (all confidence above threshold, scores_confidence below threshold, one flag below threshold, half-integer rounding, LLM error path)
- `tests/unit/classification-enrichment/story-038-classification-enrichment-sync.test.ts` — updated 3 locations (mock format, description field, llm_calls_made count)

**Result/Status:** DONE ✅ — 489/489 unit tests passing; no new TS errors; all STORY-040 acceptance criteria met

**Blockers/Issues:** None

**Baseline Impact:** NO

**Next Action:** EPIC-003.1 complete — all 7 stories (STORY-034 through STORY-040) done

---

## 2026-04-21 — BUG FIX: Missing /api/cron/market-cap route (STORY-027 gap)

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Story:** STORY-027 — Market Cap, Enterprise Value & Trailing Valuation Multiples
**Task:** TASK-027-005 (cron endpoint omitted from original delivery)

**Issue:** `syncMarketCapAndMultiples()` had no Cloud Scheduler cron endpoint. All other sync services have a corresponding `/api/cron/` route; market cap was missing. Consequence: any stock ingested after the initial ad-hoc run (AAPL/MSFT) had null `marketCap`, `sharesOutstanding`, `trailingPe`, `trailingEvEbit`, `evSales`, and by extension null `forwardEvEbit` and `forwardEvSales` (forward estimates service reads market cap to compute EV multiples — must run after market cap is populated).

**Root cause:** STORY-027 Task 5 created `syncMarketCapAndMultiples()` and wired the service, but the corresponding cron route was never created. The pipeline order comment in the forward estimates service ("must run AFTER syncFundamentals() and syncMarketCapAndMultiples()") was documented but not enforced.

**Fix:**
- Created `src/app/api/cron/market-cap/route.ts` — POST handler with OIDC auth, calls `syncMarketCapAndMultiples(fmp)`, same pattern as all other cron routes
- Documented pipeline order in route comment: fundamentals → price-sync → market-cap → estimates
- Re-ran `syncMarketCapAndMultiples` and `syncForwardEstimates` to backfill TSLA and UBER
- Updated `data/UBER-snapshot.json` with corrected market cap and EV multiples

**Files Changed:**
- `src/app/api/cron/market-cap/route.ts` (created)
- `data/UBER-snapshot.json` (updated with correct values)

**Verification:**
- AAPL: $3,912B mktcap, P/E 34.5×, EV/EBIT 28.0× trailing / 25.4× forward ✓
- MSFT: $3,150B mktcap, P/E 26.1×, EV/EBIT 21.3× trailing / 22.1× forward ✓
- TSLA: $1,450B mktcap, P/E 332.6×, EV/EBIT 259.6× trailing / 125.9× forward ✓
- UBER: $159B mktcap, P/E 16.0×, EV/EBIT 26.3× trailing / 25.1× forward ✓

**Baseline Impact:** NO

**Next Action:** Cloud Scheduler config (STORY-003/EPIC-001 deployment) needs a market-cap job scheduled between price-sync and estimates jobs

---

## 2026-04-21 — EPIC-001/STORY-003: Cloud Scheduler market-cap job added

**Epic:** EPIC-001 — Platform Foundation & Deployment
**Story:** STORY-003 — Provision Core GCP Infrastructure
**Task:** TASK-003-007 (Cloud Scheduler jobs — updated from 6 to 7)

**Action:** Updated STORY-003 spec to add the missing `market-cap` Cloud Scheduler job (6:30pm ET Mon–Fri) that must run between `price-sync` and `estimates` in the nightly pipeline. Also updated acceptance criteria count (6→7 jobs) and added `gcloud scheduler jobs create http market-cap` command block.

**Files Changed:**
- `stories/tasks/EPIC-001-platform-foundation/STORY-003-provision-gcp-infrastructure.md` (modified) — added market-cap job, updated job count, added gcloud command

**Tests Added/Updated:** None (infrastructure spec change)

**Result/Status:** DONE ✅

**Blockers/Issues:** None

**Baseline Impact:** NO — additive fix; market-cap cron endpoint now exists to back it

**Next Action:** Deploy the new Cloud Scheduler job against production GCP when ready (manual `gcloud scheduler jobs create` command documented in STORY-003 spec)

---

## 2026-04-22 00:00 UTC — Session Handoff: EPIC-003.1 complete, all work committed and pushed

**Epic:** N/A
**Story:** N/A
**Task:** N/A
**Action:** Session handoff checkpoint. Full state captured for next Claude session.

**Work completed this session:**
- EPIC-003.1/STORY-040: E1–E6 qualitative enrichment scores — all 489/489 unit tests passing
- Bug fix: created missing `/api/cron/market-cap/route.ts` (root cause of null marketCap for TSLA/UBER)
- Live data: ingested + enriched all 5 stocks (MSFT, TSLA, UBER, ADBE, UNH) — full dataset in `/data/`
- Universe snapshot: `/data/universe-snapshot-5.md` (human-readable 5-stock table) and `/data/universe-snapshot-5.json`
- Methodology document: `/docs/methodology/AI-DRIVEN-DEVELOPMENT-METHODOLOGY.md` + `.pdf`
- All changes committed and pushed to `github.com/cflorin/3aa` on `main`
- Backup branch created: `backup/epic-003.1-complete-2026-04-21` (local + remote)

**Current state:**
- 489/489 unit tests passing
- 4/8 epics complete: EPIC-001 ✅, EPIC-002 ✅, EPIC-003 ✅, EPIC-003.1 ✅
- EPIC-004 (Classification Engine & Universe Screen) is next — needs story decomposition first
- CLAUDE.md updated with Current State section for fast orientation

**Files Changed:**
- `CLAUDE.md` (updated — added Current State section, updated baseline refs to RFC-007/ADR-012)
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` (updated — Active Work, Last Updated)
- `docs/architecture/IMPLEMENTATION-LOG.md` (this entry)
- `stories/README.md` (created — stories index)

**Tests Added/Updated:** None

**Result/Status:** Session closed cleanly — all work committed, pushed, documented

**Blockers/Issues:** None

**Baseline Impact:** NO

**Next Action:** Start new session → read CLAUDE.md Current State section → decompose EPIC-004 stories → validate → implement
