# V1 Implementation Plan

## Baseline Reference
- **Version:** V1.0 (frozen 2026-04-19; amendments below)
- **PRD:** /docs/prd/PRD.md
- **RFCs:** RFC-001 through RFC-008 (accepted; RFC-001/002/004 amended 2026-04-21; RFC-007 added 2026-04-21; RFC-008 added 2026-04-25; RFC-001/002/004 amended again 2026-04-25)
- **ADRs:** ADR-001 through ADR-016 (accepted; ADR-012 added 2026-04-21; ADR-013/ADR-014 added 2026-04-23; ADR-013/ADR-014 amended 2026-04-25; ADR-015/ADR-016 added 2026-04-25; ADR-001/ADR-002 amended 2026-04-25)
- **Validated Epics:** EPIC-001 ✅, EPIC-002 ✅, EPIC-003 ✅, EPIC-003.1 ✅, EPIC-004 (in_progress — quarterly history additions pending)
- **Validated Stories:** STORY-001 through STORY-056 complete; STORY-057–072 ready (quarterly history data layer)

## Status Summary
- **Current Phase:** EPIC-003 Quarterly History Additions + EPIC-004 Quarterly History Classification
- **Active Epic:** EPIC-003 (quarterly history additions); then EPIC-004 (quarterly history classification)
- **Active Story:** STORY-057 — `stock_quarterly_history` Table Migration (first to execute)
- **Overall Progress:** 4 epics fully done; EPIC-004 in_progress; 16 new stories (STORY-057–072) ready for execution
- **Baseline Status:** RFC-008 added 2026-04-25 (quarterly history); ADR-015/016 added 2026-04-25; RFC-001/002/004/ADR-001/002/013/014 amended 2026-04-25
- **Unit Tests at Start:** 855/855 passing (2026-04-24 baseline)

## Status Model
- **planned**: Work identified, not yet validated
- **validated**: Validated against baseline, approved for implementation
- **ready**: Tasks decomposed, dependencies clear, ready to start
- **in_progress**: Active implementation underway
- **blocked**: Cannot proceed due to dependency or issue
- **in_review**: Implementation complete, awaiting review/testing
- **done**: Completed with evidence (tests passing, docs updated, traceable)

## Epic Execution Order

### EPIC-001 — Platform Foundation & Deployment
- **Status:** validated
- **Dependencies:** None (foundational)
- **Stories:** 9 (STORY-001 through STORY-009)
- **Integration Checkpoint:** Cloud Run deployed, health check passing, CI/CD functional
- **Deployment Milestone:** Infrastructure operational, Next.js app deployed

### EPIC-002 — Authentication & User Management
- **Status:** done ✅
- **Dependencies:** EPIC-001 (database tables, Cloud Run deployment)
- **Stories:** 5 (STORY-010 through STORY-014) — ALL COMPLETE ✅
- **Integration Checkpoint:** Sign-in screen functional, session management working ✅
- **Deployment Milestone:** User authentication operational ✅

### EPIC-003 — Data Ingestion & Universe Management
- **Status:** done ✅ (2026-04-21)
- **Dependencies:** EPIC-001 (database, Cloud Scheduler)
- **Stories:** STORY-015 through STORY-033 (19 stories) — ALL COMPLETE ✅
- **Integration Checkpoint:** Nightly batch pipeline running; all deterministic classification fields populated; EPIC-003.1 unblocked ✅
- **Deployment Milestone:** Stock data syncing nightly with correct metrics and deterministic flags

#### STORY-015 — Provider Abstraction Layer
- **Status:** done ✅
- **Tasks:** TASK-015-001 through TASK-015-005 — ALL COMPLETE
- **Evidence:** 25 unit tests passing (provider-orchestrator + retry.util)

#### STORY-016 — Tiingo Adapter
- **Status:** done ✅
- **Tasks:** TASK-016-001 through TASK-016-006 — ALL COMPLETE
- **Evidence:** 30 unit tests passing; 5 integration tests passing against live Tiingo API
- **Baseline conflicts documented:** forwardEstimateCoverage='none' (not 'partial'); market_cap_millions=null from universe endpoint

#### STORY-017 — FMP Adapter
- **Status:** done ✅
- **Tasks:** TASK-017-001 through TASK-017-006 — ALL COMPLETE
- **Evidence:** 34 unit tests passing; 4 integration tests passing against live FMP stable API (key verified 2026-04-20)
- **Baseline conflicts documented:** v3 deprecated (stable base used); fetchUniverse returns [] (screener 402); forwardEstimateCoverage='partial'; EOD flat array; epsAvg/ebitAvg field names

#### STORY-018 — Universe Sync Job
- **Status:** done ✅
- **Tasks:** TASK-018-001 through TASK-018-003 — ALL COMPLETE
- **Evidence:** 11 unit tests passing; 4 integration tests passing; live_provider_verified (5606 real Tiingo tickers, 0 dropped, 5606 inUniverse=TRUE confirmed in DB)
- **Bugs fixed:** BC-018-001 abort condition (FMP no-op); BC-018-002 null market_cap guard; BC-018-005 ticker case mismatch universe-wipe bug
- **Baseline conflicts documented:** BC-018-001 through BC-018-005 in STORY-018 spec

#### STORY-019 — Price Sync Job
- **Status:** done ✅
- **Tasks:** TASK-019-001 through TASK-019-003 — ALL COMPLETE
- **Evidence:** 9 unit tests passing (7 service + 2 route); 4 integration tests passing against real test DB; live_provider_verified (AAPL: currentPrice=273.05 written from real Tiingo)
- **Bugs fixed:** BC-019-001 integration ticker length; BC-019-003 missing route tests added
- **Baseline conflicts documented:** BC-019-001 through BC-019-003 in STORY-019 spec

#### STORY-020 — Fundamentals Sync Job
- **Status:** done ✅
- **Tasks:** TASK-020-001 through TASK-020-004 — ALL COMPLETE
- **Evidence:** 11 unit tests (9 service + 2 route) + 4 integration tests (integration_verified_local); 3 TS errors fixed; ticker fix (BC-020-001); 4 missing tests added; 7 BCs documented

#### STORY-021 — Forward Estimates Sync Job
- **Status:** done ✅
- **Tasks:** TASK-021-001 through TASK-021-002 — ALL COMPLETE
- **Evidence:** 20 unit tests (18 existing + 2 new: BC-021-006/007) + 2 route unit tests + 5 integration tests; all passing; TS2322 fixed (BC-021-003); dataLastSyncedAt used as proxy for estimates_last_updated_at (BC-021-005); 7 BCs documented
- **Verification level:** integration_verified_local

#### STORY-022 — Data Freshness Tracking
- **Status:** done ✅
- **Evidence:** 26 unit tests ✅ + 5 integration tests ✅; 4 BCs fixed (country field, providerName, freshness count assertions, syncForwardEstimates coverage); integration_verified_local

#### STORY-023 — Pipeline Integration Tests
- **Status:** done ✅
- **Evidence:** 6 integration tests ✅; 5 BCs fixed (ticker length, DB isolation, spec count, provenance coverage, Scenario 2 completeness); integration_verified_local

#### STORY-024 — Contract & Schema Tests
- **Status:** done ✅
- **Evidence:** 20 integration tests ✅; 8 BCs fixed (fixture shapes, adapter behavior, ticker length, missing schema column); integration_verified_local

#### STORY-025 — Behavioral Validation Tests
- **Status:** done ✅ (spec written; live pipeline run confirmed data flow; ACs pending final SA validation)
- **Evidence:** Live demo run for AAPL/MSFT/TSLA; 4 BCs documented (MSFT revenue growth, forward fields naming, JPM gross margin, fcf_margin DataCode bug)
- **Outcome:** Identified 7 data quality bugs driving STORY-026; identified 3 new data stories (027–029)

#### STORY-026 — Fix Fundamental Metrics Data Quality
- **Status:** done ✅ (TASK-026-001–005 complete; 320/320 unit tests passing; TASK-026-006 integration tests deferred)
- **Dependencies:** STORY-025 (bugs identified)
- **Tasks:** 7 fixes implemented — Fix 1 LTM operating margin, Fix 2 net margin DataCode, Fix 3 fcf_ttm, Fix 4 net_debt_to_ebitda, Fix 5 LTM interest coverage, Fix 6 FMP total_debt/cash, Fix 7 fcf_positive/fcf_conversion
- **Files:** tiingo.adapter.ts, fmp.adapter.ts, fundamentals-sync.service.ts, types.ts

#### STORY-027 — Market Cap, Enterprise Value & Trailing Multiples
- **Status:** done ✅ (TASK-027-001–006 complete; 337/337 unit tests passing; integration tests deferred)
- **Dependencies:** STORY-026 Fix 6 (total_debt, cash populated); FMP /profile endpoint
- **Tasks:** Schema migration (+5 columns), FMP fetchProfile(), store absolute TTM values, compute trailing_pe/trailing_ev_ebit/ev_sales
- **Files:** fmp.adapter.ts, tiingo.adapter.ts, fundamentals-sync.service.ts, prisma/schema.prisma

#### STORY-028 — Forward Estimates Enrichment
- **Status:** done ✅ (TASK-028-001–005 complete; 352/352 unit tests passing; integration tests deferred)
- **Dependencies:** STORY-027 (needs current_price, market_cap, eps_ttm, revenue_ttm)
- **Tasks:** Schema migration (+4 columns), ForwardEstimates type rename (forward_pe→eps_ntm, forward_ev_ebit→ebit_ntm, +revenue_ntm), extend FMP fetchForwardEstimates(), rewrite syncForwardEstimates() to compute actual ratios, provenance for 8 fields
- **Files:** types.ts, fmp.adapter.ts, forward-estimates-sync.service.ts, prisma/schema.prisma, migration SQL

#### STORY-029 — 3-Year Growth CAGRs
- **Status:** done ✅ (TASK-029-001–005 complete 2026-04-21)
- **Dependencies:** STORY-026 (TTM pattern); STORY-027 (eps_ttm for eps_growth_fwd)
- **Tasks:** Upgrade FMP to limit=5 annual periods, compute revenue/eps/share CAGR, gross_profit_growth from Tiingo 8-quarter window; provenance tracking for all new fields
- **Files:** fmp.adapter.ts, tiingo.adapter.ts, fundamentals-sync.service.ts

#### STORY-030 — ROIC: NOPAT / Invested Capital
- **Status:** done ✅ (TASK-030-001–002 complete 2026-04-21)
- **Dependencies:** STORY-026 Fix 4 (cashAndEq DataCode confirmed); Tiingo taxExp/pretaxinc DataCode verification
- **Tasks:** Fixed NOPAT/IC formula in both adapters; added taxExp/pretaxinc DataCodes to fixtures; 12 edge case tests (IC=0/negative, loss-year, 50% cap, ebit=0, cash-absent)
- **Evidence:** 391/391 unit tests passing

#### STORY-031 — GAAP / Non-GAAP EPS Reconciliation Factor
- **Status:** done ✅ (TASK-031-001–006 complete 2026-04-21)
- **Dependencies:** STORY-028 (ForwardEstimates type extension); FMP epsDiluted in income statement fixture
- **Tasks:** Schema migration (+1 column); FundamentalData/ForwardEstimates type extensions; FMP adapter exposes gaapEps + nonGaapEpsMostRecentFy; Tiingo returns null for gaapEps; computation in syncForwardEstimates with clamp [0.10, 2.00]; 11 new tests
- **Evidence:** 402/402 unit tests passing

#### STORY-032 — Share Count Growth (3-Year CAGR)
- **Status:** done ✅ (2026-04-21)
- **Dependencies:** STORY-027 (shares_outstanding in pipeline); STORY-029 (income-statement CAGR write path removed in TASK-032-005)
- **Tasks:** TASK-032-001 ✅ (investigation, BC-032-001 found), TASK-032-002 ✅ (ProvenanceEntry extension), TASK-032-003 ✅ (fetchAnnualShareCounts), TASK-032-004 ✅ (computeShareCountGrowth3y), TASK-032-005 ✅ (remove from fundamentals-sync), TASK-032-006 ✅ (admin route), TASK-032-007 ✅ (14/14 unit tests passing)
- **BC-032-001 resolved:** Path A adopted — `weightedAverageShsOutDil` from FMP annual income statement used for both FY0 and FY-3 anchors (positional indexing, requires ≥4 entries)
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-032-share-count-growth.md

#### STORY-033 — Deterministic Classification Flags
- **Status:** done ✅ (2026-04-21)
- **Dependencies:** STORY-032 ✅; STORY-018 ✅; STORY-027/028 ✅
- **Tasks:** TASK-033-001 ✅ (computeDeterministicFlags), TASK-033-002 ✅ (sync job), TASK-033-003 ✅ (admin route), TASK-033-004 ✅ (23/23 unit tests passing)
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-033-deterministic-classification-flags.md

### EPIC-003 Quarterly History Additions (2026-04-25)
- **Status:** ready — all 8 stories decomposed and validated against RFC-008, ADR-015, ADR-016
- **Baseline:** RFC-008 (new), ADR-015 (new), ADR-016 (new); RFC-002/004/ADR-001/002 amended 2026-04-25
- **Execution order:** STORY-057 → 058 → 059 → 060 → 061 → 062 → 063 → 064
- **Integration Checkpoint:** Full quarterly history pipeline running (sync → TTM → trends → cron); `stock_derived_metrics` rows populated for all in-universe stocks

#### STORY-057 — `stock_quarterly_history` Table Migration
- **Status:** ready
- **Dependencies:** STORY-004 (Prisma/migration pattern), `stocks` table exists
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-057-stock-quarterly-history-table-migration.md

#### STORY-058 — `stock_derived_metrics` Table Migration
- **Status:** ready
- **Dependencies:** STORY-057 (ordering; can be same or sequential migration)
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-058-stock-derived-metrics-table-migration.md

#### STORY-059 — `TiingoAdapter.fetchQuarterlyStatements` Method
- **Status:** ready
- **Dependencies:** STORY-016 (TiingoAdapter established)
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-059-tiingo-fetch-quarterly-statements.md

#### STORY-060 — Quarterly History Sync Service
- **Status:** ready
- **Dependencies:** STORY-057 (table), STORY-059 (adapter method)
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-060-quarterly-history-sync-service.md

#### STORY-061 — Derived Metrics Computation Service (TTM Rollups)
- **Status:** ready
- **Dependencies:** STORY-057, STORY-058, STORY-060
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-061-derived-metrics-computation-service.md

#### STORY-062 — Trend & Trajectory Metrics Computation Service
- **Status:** ready
- **Dependencies:** STORY-057, STORY-058, STORY-061
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-062-trend-trajectory-metrics-computation.md

#### STORY-063 — Quarterly History Cron Route & Cloud Scheduler Job
- **Status:** ready
- **Dependencies:** STORY-060, STORY-061, STORY-062, STORY-003 (Cloud Scheduler pattern)
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-063-quarterly-history-cron-route.md

#### STORY-064 — Quarterly History Pipeline Integration & Regression Tests
- **Status:** ready
- **Dependencies:** STORY-057–063 all complete
- **Spec:** /stories/tasks/EPIC-003-data-ingestion/STORY-064-quarterly-history-integration-tests.md

### EPIC-003.1 — Classification LLM Enrichment
- **Status:** done ✅ (2026-04-21 — all 7 stories complete, 489/489 unit tests passing)
- **Dependencies:** EPIC-003 ✅ (complete 2026-04-21); ADR-012 (accepted); RFC-007 (accepted)
- **Stories:** STORY-034 through STORY-040 (7 stories)
- **Integration Checkpoint:** All 7 classification flags populated with provenance; E1–E6 scores populated; classificationEnrichmentSync job running on weekly schedule
- **Deployment Milestone:** Classification enrichment operational; EPIC-004 unblocked

#### STORY-034 — LLM Provider Interface and Prompt File Infrastructure
- **Status:** done ✅ (2026-04-21)
- **Dependencies:** None within EPIC-003.1 (foundation story)
- **Tasks:** TASK-034-001 ✅ (LLMProvider interface), TASK-034-002 ✅ (ClaudeProvider), TASK-034-003 ✅ (PromptLoader), TASK-034-004 ✅ (prompt stubs), TASK-034-005 ✅ (.env.example), TASK-034-006 ✅ (7/7 unit tests passing)
- **Spec:** /stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-034-llm-provider-infrastructure.md

#### STORY-035 — holding_company_flag via Heuristic + LLM
- **Status:** done ✅ (2026-04-21)
- **Dependencies:** STORY-034 ✅
- **Tasks:** TASK-035-001 ✅ (StockMetadata+ProvenanceEntry extensions, BC-035-001 confirmed), TASK-035-002 ✅ (prompt body), TASK-035-003 ✅ (HoldingCompanyDetector), TASK-035-004 ✅ (7/7 unit tests)
- **Spec:** /stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-035-holding-company-flag.md

#### STORY-036 — cyclicality_flag via Sector Heuristic + LLM
- **Status:** done ✅ (2026-04-21)
- **Dependencies:** STORY-034 ✅, STORY-035 ✅
- **Tasks:** TASK-036-001 ✅ (prompt body), TASK-036-002 ✅ (CyclicalityDetector), TASK-036-003 ✅ (7/7 unit tests)
- **Spec:** /stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-036-cyclicality-flag.md

#### STORY-037 — binary_flag via Heuristic + LLM
- **Status:** done ✅ (2026-04-21)
- **Dependencies:** STORY-034
- **Tasks:** Write binary-flag.md prompt; BinaryFlagDetector; unit tests
- **Spec:** /stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-037-binary-flag.md

#### STORY-038 — classificationEnrichmentSync Job
- **Status:** done ✅ (2026-04-21, unit_verified — 15/15 tests passing)
- **Dependencies:** STORY-035, STORY-036, STORY-037
- **Tasks:** syncClassificationEnrichment() service (incremental + full modes); admin route; unit tests — ALL COMPLETE
- **Spec:** /stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-038-classification-enrichment-sync-job.md

#### STORY-039 — Enrichment Score Columns: Schema Migration
- **Status:** done ✅ (2026-04-21, schema_verified — prisma generate clean; migration SQL ready for deploy)
- **Dependencies:** STORY-031 (migration numbering sequence)
- **Tasks:** `description TEXT` + 6 score DECIMAL(3,2) columns — ALL COMPLETE
- **Spec:** /stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-039-enrichment-scores-schema.md

#### STORY-040 — E1–E6 Qualitative Enrichment Scores via LLM Batch Call
- **Status:** done ✅ (2026-04-21, unit_verified — 489/489 tests passing)
- **Dependencies:** STORY-034 (LLMProvider), STORY-038 (sync job to extend), STORY-039 (schema)
- **Tasks:** Write combined-enrichment.md prompt ✅; detectCombinedEnrichment() detector ✅; extend classificationEnrichmentSync with description + score writes ✅; 5 unit tests ✅
- **Spec:** /stories/tasks/EPIC-003.1-classification-llm-enrichment/STORY-040-qualitative-enrichment-scores.md

### EPIC-004 — Classification Engine & Universe Screen
- **Status:** in_progress (STORY-041 ✅, STORY-042 ✅, STORY-043 ✅, STORY-044 ✅, STORY-045 ✅, STORY-046 ✅, STORY-047 ✅, STORY-048 ✅, STORY-049 next)
- **Dependencies:** EPIC-002 ✅, EPIC-003 ✅, EPIC-003.1 ✅
- **Stories:** STORY-041 through STORY-053 (13 stories — decomposed 2026-04-23/24)
- **Integration Checkpoint:** Classification engine running, Universe screen functional, Stock Detail screen functional
- **Deployment Milestone:** Users can view and manage classified stocks

#### STORY-041 — Bucket Scoring Algorithm
- **Status:** ✅ done (2026-04-24)
- **Dependencies:** EPIC-003 ✅ (stocks table populated), EPIC-003.1 ✅ (E1–E6 enrichment scores)
- **Tasks:** TASK-041-001 through TASK-041-005 — all complete
  - TASK-041-001 ✅: types.ts, scoring-weights.ts (all ADR-013 constants), confidence-thresholds.ts stub, index.ts
  - TASK-041-002 ✅: BucketScorer — primary fundamental scoring rules; FCF_CONVERSION ≥ 0.50; operating_margin ≥ 0.15
  - TASK-041-003 ✅: BucketScorer — enrichment bonus rules (E1/E5/E6, threshold ≥ 4.0)
  - TASK-041-004 ✅: 61 unit tests (per-rule, contract, determinism, boundary, CRITICAL_FIELDS, enrichment, golden-set)
  - TASK-041-005 ✅: 7 integration tests; golden-set fixtures captured; tracking updated
- **Key findings:** Growth fields stored as percentages in DB (7.24 = 7.24%); ratios stored as fractions (0.49 = 49%). ClassificationInput uses decimal fractions throughout — integration layer must divide growth fields by 100.
- **Evidence:** 550/550 unit tests + 7 integration tests passing
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-041-bucket-scoring-algorithm.md`

#### STORY-042 — Earnings Quality and Balance Sheet Quality Scoring
- **Status:** ✅ done (2026-04-24)
- **Dependencies:** STORY-041 (ClassificationInput interface, scoring-weights.ts)
- **Tasks:** TASK-042-001 through TASK-042-005 — all complete
  - TASK-042-001 ✅: GradeScorerOutput + missing_field_count; scoring-weights.ts comment fixes; ADR-013 field name fix
  - TASK-042-002 ✅: EarningsQualityScorer (7 rules, null-safe, winner tie-break A>B>C)
  - TASK-042-003 ✅: BalanceSheetQualityScorer (6 rules + net-cash bonus, null-safe)
  - TASK-042-004 ✅: 62 unit tests (groups a–k: per-rule, winner, boundary, null, contract, golden-set, determinism)
  - TASK-042-005 ✅: 6 integration tests; golden-set fixtures; tracking updated; git commit
  - BUG-CE-004 ✅ (2026-04-25): EQ_FCF_STRONG lowered 3→2; 3 new EQ-C volatility signals added (EPS_DECLINING, EPS_REV_SPREAD_MODERATE/SEVERE); ADR-013 amended; 10 new tests; golden fixtures updated; 859/859 passing
  - BS_DEBT_HIGH ✅ (2026-04-25): raised 2→3 (high-debt tie-break fix); ADR-013 amended; golden UNH_BS C:4→5
- **Evidence:** 859/859 unit tests passing (post BUG-CE-004 + BS_DEBT_HIGH fixes)
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-042-earnings-and-balance-sheet-quality-scoring.md`

#### STORY-043 — Classification Result Assembly (Tie-Break, Confidence, Special Cases)
- **Status:** done ✅ (2026-04-24)
- **Dependencies:** STORY-041, STORY-042 (scorers)
- **Tasks:**
  - TASK-043-001 ✅: ClassificationResult/ConfidenceStep/TieBreakRecord types; confidence-thresholds extended
  - TASK-043-002 ✅: classifyStock (classifier.ts) — tie-break resolution, special-case overrides, confidence computation, code assembly
  - TASK-043-003 ✅: 44 unit tests (story-043-classify-stock.test.ts); golden-set fixtures (classify-stock-golden.ts)
  - TASK-043-004 ✅: 5 integration tests (classify-stock.test.ts); tracking updated; git commit
- **Evidence:** 656/656 unit tests + 18 integration tests passing
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-043-classification-result-assembly.md`

#### STORY-044 — Classification State Persistence and History
- **Status:** done ✅ (2026-04-24)
- **Dependencies:** STORY-043 (ClassificationResult type)
- **Tasks:**
  - TASK-044-001 ✅: Prisma schema — refactored ClassificationState + ClassificationHistory models
  - TASK-044-002 ✅: Migration 20260424000001_refactor_classification_schema applied
  - TASK-044-003 ✅: ClassificationState/ClassificationHistoryRow/ClassificationScoresPayload types in types.ts
  - TASK-044-004 ✅: persistence.ts — persistClassification, getClassificationState, getClassificationHistory
  - TASK-044-005 ✅: 13 integration tests in persistence.test.ts; tracking + commit
- **Evidence:** 656/656 unit tests + 31 integration tests passing
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-044-classification-state-persistence.md`

#### STORY-045 — User Classification Override API
- **Status:** done ✅
- **Evidence:** 6 unit tests + 18 integration tests passing; domain/classification/override.ts, POST/DELETE/GET routes, schema migration
- **Dependencies:** STORY-044 (classification_state table)
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-045-user-classification-override-api.md`

#### STORY-046 — User Monitoring Preferences API
- **Status:** done ✅
- **Evidence:** 9 unit tests + 15 integration tests passing; UserDeactivatedStock model + migration, domain layer, PUT/GET routes
- **Dependencies:** STORY-004 (user_deactivated_stocks migration)
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-046-user-monitoring-preferences-api.md`

#### STORY-047 — Classification Recompute Batch Job
- **Status:** done ✅
- **Evidence:** 15 unit tests + 6 integration tests passing; shouldRecompute, input-mapper, batch service, cron route (placeholder replaced)
- **Dependencies:** STORY-043, STORY-044
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-047-classification-batch-job.md`

#### STORY-048 — Universe Screen: Stock Table
- **Status:** done ✅
- **Evidence:** 27 component unit tests passing; ClassificationBadge, ConfidenceBadge, MonitoringBadge, PaginationControls, StockTable, UniversePageClient; /universe route
- **Dependencies:** STORY-046 (GET /api/universe), STORY-012 (auth middleware)
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-048-universe-screen-stock-table.md`

#### STORY-049 — Universe Screen: Filters and Sort
- **Status:** done ✅
- **Dependencies:** STORY-048
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-049-universe-screen-filters-and-sort.md`

#### STORY-050 — Monitoring: Deactivate/Reactivate UI
- **Status:** done ✅
- **Dependencies:** STORY-048, STORY-046
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-050-monitoring-deactivate-reactivate-ui.md`

#### STORY-051 — Classification Override Modal (with history section)
- **Status:** done ✅
- **Dependencies:** STORY-045, STORY-044 (history), STORY-048
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-051-classification-override-modal.md`

#### STORY-052 — EPIC-004 End-to-End Tests
- **Status:** done ✅ (2026-04-24, integration_verified_real — 37/37 E2E tests passing)
- **Dependencies:** STORY-041–051 and STORY-053 all complete
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-052-epic-004-e2e-tests.md`

#### STORY-053 — Stock Detail Page
- **Status:** done ✅ (2026-04-24, unit_verified)
- **Dependencies:** STORY-043, STORY-044, STORY-045, STORY-048, STORY-051
- **Tasks:**
  - TASK-053-001 ✅: GET /api/stocks/[ticker]/detail — comprehensive single-call endpoint; all 4-tab data; 7 flags; E1–E6; 404 for unknown/out-of-universe
  - TASK-053-002 ✅: 5 sub-components — ScoreBar, ConfidenceSteps, TieBreakList, FlagPill, StarRating
  - TASK-053-003 ✅: /stocks/[ticker] page + StockDetailClient — 4 tabs; back nav; override modal reuse
  - TASK-053-004 ✅: 35 unit tests + 7 integration tests; 793/793 passing; 0 regressions
- **Evidence:** 793/793 unit tests passing (2026-04-24); unit_verified
- **V1 data gaps (documented):** net_margin → fcf_margin; enterprise_value/ev_ebitda → forward_ev_ebit
- **Spec:** `stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-053-stock-detail-page.md`

### EPIC-004 Quarterly History Additions (2026-04-25)
- **Status:** ready — all 8 stories decomposed and validated against RFC-001/RFC-008, ADR-013/014/015/016
- **Baseline:** RFC-001/008 amended/added 2026-04-25; ADR-013/014 amended 2026-04-25; ADR-015/016 added 2026-04-25
- **Execution order:** STORY-065 → 066 → 067 → 068 → 069 → 070 → 071 → 072
- **Dependency:** All EPIC-003 quarterly history stories (STORY-057–064) must be complete first
- **Integration Checkpoint:** Classification engine uses quarterly trend data; universe screen and stock detail page expose quarterly metrics

#### STORY-065 — Classification Trend Metrics Integration
- **Status:** ready
- **Dependencies:** STORY-058 (stock_derived_metrics), STORY-062 (trend fields populated), STORY-044, STORY-047
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-065-classification-trend-metrics-integration.md

#### STORY-066 — EQ Scorer v2: Quarterly-Driven Signals
- **Status:** ready
- **Dependencies:** STORY-065 (ClassificationTrendMetrics wired)
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-066-eq-scorer-v2-quarterly-signals.md

#### STORY-067 — BS Scorer Dilution Trend Enhancement
- **Status:** ready
- **Dependencies:** STORY-065 (ClassificationTrendMetrics wired)
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-067-bs-scorer-dilution-trend-enhancement.md

#### STORY-068 — Bucket Scorer Quarterly Growth Context
- **Status:** ready
- **Dependencies:** STORY-065 (ClassificationTrendMetrics wired)
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-068-bucket-scorer-quarterly-growth-context.md

#### STORY-069 — Confidence Step 5: Trajectory Quality Penalty
- **Status:** ready
- **Dependencies:** STORY-065 (ClassificationTrendMetrics wired), STORY-043
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-069-confidence-trajectory-quality-penalty.md

#### STORY-070 — Universe Screen: Quarterly Trend Metrics Columns & Filters
- **Status:** ready
- **Dependencies:** STORY-048, STORY-049, STORY-058, STORY-062
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-070-universe-screen-quarterly-trend-metrics.md

#### STORY-071 — Stock Detail Page: Quarterly Financial History Section
- **Status:** ready
- **Dependencies:** STORY-053, STORY-057, STORY-058, STORY-062
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-071-stock-detail-quarterly-history-section.md

#### STORY-072 — Quarterly History Classification Engine Regression & Coherence Tests
- **Status:** ready
- **Dependencies:** STORY-065–071 all complete
- **Spec:** /stories/tasks/EPIC-004-classification-engine-universe-screen/STORY-072-quarterly-history-classification-regression-tests.md

### EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- **Status:** in_progress
- **Dependencies:** EPIC-004 (classification state, all quarterly history stories complete)
- **Stories:** STORY-075 through STORY-081 (decomposed 2026-04-25)
- **Active Story:** STORY-079 — Stock Detail Page: Valuation Tab (done ✅)
- **Integration Checkpoint:** Valuation engine running, zones displayed
- **Deployment Milestone:** Users can view valuation zones

#### STORY-075 — Valuation Engine Domain Layer
- **Status:** done
- **Spec:** /stories/tasks/EPIC-005-valuation-threshold-engine/STORY-075-valuation-engine-domain-layer.md
- **Tasks:** TASK-075-001 through TASK-075-007 (all done)
- **Evidence:** 195/195 unit tests passing; zero regressions in pre-existing suite

#### STORY-076 — Valuation State Persistence & History
- **Status:** done
- **Spec:** /stories/tasks/EPIC-005-valuation-threshold-engine/STORY-076-valuation-state-persistence.md
- **Tasks:** TASK-076-001 through TASK-076-005 (all done)
- **Evidence:** 214/214 unit tests passing; migration applied; UserValuationOverride extended

#### STORY-077 — Valuation Recompute Batch Job
- **Status:** done
- **Spec:** /stories/tasks/EPIC-005-valuation-threshold-engine/STORY-077-valuation-recompute-batch-job.md
- **Tasks:** TASK-077-001 through TASK-077-004 (all done)
- **Evidence:** 225/225 unit tests passing; add-stock pipeline Stage 11 added; TOTAL_STAGES=11

#### STORY-078 — User Valuation Override API
- **Status:** done
- **Spec:** /stories/tasks/EPIC-005-valuation-threshold-engine/STORY-078-user-valuation-override-api.md
- **Tasks:** TASK-078-001 through TASK-078-003 (all done)
- **Evidence:** 239/239 unit tests passing; GET/PUT/DELETE endpoints; schema migration already applied in STORY-076

#### STORY-079 — Stock Detail Page: Valuation Tab
- **Status:** done
- **Spec:** /stories/tasks/EPIC-005-valuation-threshold-engine/STORY-079-stock-detail-valuation-tab.md
- **Tasks:** TASK-079-001 through TASK-079-003 (all done)
- **Evidence:** 252/252 unit tests passing; ValuationTab component + valuation history endpoint

#### STORY-080 — Universe Screen: Valuation Zone Columns & Filters
- **Status:** ready
- **Spec:** /stories/tasks/EPIC-005-valuation-threshold-engine/STORY-080-universe-screen-valuation-columns.md

#### STORY-081 — EPIC-005 Regression & Integration Tests
- **Status:** ready
- **Spec:** /stories/tasks/EPIC-005-valuation-threshold-engine/STORY-081-epic-005-regression-integration-tests.md

### EPIC-006 — Monitoring & Alerts Engine with Alerts UI
- **Status:** planned
- **Dependencies:** EPIC-005 (valuation state)
- **Stories:** [To be decomposed]
- **Integration Checkpoint:** Alerts generating, Alerts Feed functional
- **Deployment Milestone:** Users receive personalized alerts

### EPIC-007 — User Preferences & Settings
- **Status:** planned
- **Dependencies:** EPIC-006 (alert preferences)
- **Stories:** [To be decomposed]
- **Integration Checkpoint:** Settings screen functional, preferences persisting
- **Deployment Milestone:** V1 feature-complete

## EPIC-001 Story Execution Order

### STORY-001 — Setup GitHub Repository
- **Status:** done
- **Dependencies:** None
- **Tasks:** 5 (TASK-001-001 through TASK-001-005) ✅ ALL COMPLETE
  - TASK-001-001: Create GitHub Repository and Configure SSH Access ✅
  - TASK-001-002: Create Initial Repository Files (.gitignore, README, CHANGELOG) ✅
  - TASK-001-003: Configure Branch Protection on Main Branch ✅
  - TASK-001-004: Document Semantic Versioning Strategy ✅
  - TASK-001-005: Verify Repository Setup and Branch Protection ✅
- **Evidence Required:** Repository accessible, branch protection enabled, versioning documented ✅
- **Evidence Provided:** Repository at https://github.com/cflorin/3aa, initial commit df2978f pushed, branch protection configured, README.md contains versioning strategy

### STORY-002 — Design and Document RFC-002 Database Schema
- **Status:** done
- **Dependencies:** None
- **Tasks:** 6 (TASK-002-001 through TASK-002-006) ✅ ALL COMPLETE
  - TASK-002-001: Verify RFC-002 Document Exists and Structure ✅
  - TASK-002-002: Validate All Required Tables Are Defined ✅
  - TASK-002-003: Verify JSONB Structures Are Documented ✅
  - TASK-002-004: Validate Entity Relationships and Diagrams ✅
  - TASK-002-005: Verify Supporting Documentation ✅
  - TASK-002-006: Update Implementation Tracking ✅
- **Evidence Required:** RFC-002 document created, all 17 tables defined, JSONB structures documented ✅
- **Evidence Provided:** RFC-002 at /docs/rfc/RFC-002-canonical-data-model-persistence.md, 19 tables defined, 15 JSONB fields documented, entity relationship diagram included, indexing strategy documented, migration strategy outlined

### STORY-003 — Provision Core GCP Infrastructure
- **Status:** done
- **Dependencies:** STORY-001 (for IaC scripts in repo)
- **Tasks:** 8 (TASK-003-001 through TASK-003-008) ✅ ALL COMPLETE
  - TASK-003-001: GCP project aa-investor configured, all 9 APIs enabled ✅
  - TASK-003-002: Cloud SQL instance aaa-db (PostgreSQL 15, db-f1-micro, private IP 172.24.0.3, aaa_production DB) ✅
  - TASK-003-003: VPC Connector aaa-vpc-connector (READY, 10.8.0.0/28, e2-micro, 2-10 instances) ✅
  - TASK-003-004: Secret Manager secrets created (DATABASE_URL, SESSION_SECRET, TIINGO_API_KEY, FMP_API_KEY, ADMIN_API_KEY) ✅
  - TASK-003-005: Service accounts aaa-web, aaa-scheduler, aaa-builder with correct IAM roles ✅
  - TASK-003-006: Cloud Run service aaa-web deployed, health check 200 OK ✅
  - TASK-003-007: 6 Cloud Scheduler jobs created (price-sync, fundamentals-sync, estimates-sync, classification, valuation, alerts) ✅
  - TASK-003-008: Infrastructure verified, tracking updated ✅
- **Evidence Required:** Cloud Run deployed, Cloud SQL running, VPC Connector functional, Secret Manager configured ✅
- **Evidence Provided:** aaa-web at https://aaa-web-717628686883.us-central1.run.app, health check 200, Cloud SQL RUNNABLE, VPC Connector READY, 5 secrets, 3 SAs, 6 scheduler jobs ENABLED

### STORY-004 — Implement Prisma Schema and Database Migrations
- **Status:** done
- **Dependencies:** STORY-002 (RFC-002), STORY-003 (Cloud SQL)
- **Tasks:** 10 (TASK-004-001 through TASK-004-010) ✅ ALL COMPLETE
  - TASK-004-001: Write Prisma schema (all 19 RFC-002 tables) ✅
  - TASK-004-002: Add initial migration (DDL for all 19 tables) ✅
  - TASK-004-003: Add partial indexes migration (5 indexes) ✅
  - TASK-004-004: Configure Jest and ts-jest for integration tests ✅
  - TASK-004-005: Create Docker Compose test environment (PostgreSQL 15) ✅
  - TASK-004-006: Create schema integration tests (19 tables, indexes) ✅
  - TASK-004-007: Create constraints integration tests (FK, unique, JSONB defaults) ✅
  - TASK-004-008: Create Prisma client singleton, update health check (force-dynamic) ✅
  - TASK-004-009: Update Dockerfile and next.config.js for Prisma standalone ✅
  - TASK-004-010: Update cloudbuild.yaml (--add-cloudsql-instances), deploy ✅
- **Evidence Required:** Prisma schema created, migrations applied, 19 tables exist, tests passing ✅
- **Evidence Provided:** prisma/schema.prisma (19 models), 2 migrations applied to test DB, 34 integration tests passing, Dockerfile updated, cloudbuild.yaml deployed with Cloud SQL socket attachment, health check force-dynamic fix deployed

### STORY-005 — Create Framework Configuration Seed Data
- **Status:** done
- **Dependencies:** STORY-004 (tables exist)
- **Tasks:** 7 (TASK-005-001 through TASK-005-007) ✅ ALL COMPLETE
  - TASK-005-001: Story spec with full BDD/TDD ✅
  - TASK-005-002: Prisma seed script (prisma/seed.ts) — idempotent upsert, 1+16+8 rows ✅
  - TASK-005-003: package.json prisma.seed config + db:seed script ✅
  - TASK-005-004: 16 integration tests (all passing) ✅
  - TASK-005-005: Dockerfile migrator CMD → migrate-and-seed.sh ✅
  - TASK-005-006: Production seed applied via Cloud Run Job ✅
  - TASK-005-007: Tracking updated ✅
- **Evidence Required:** Anchored thresholds seeded, TSR hurdles seeded, validation tests passing ✅
- **Evidence Provided:** production seed confirmed ("Seed complete: 1 framework_version, 16 anchored_thresholds, 8 tsr_hurdles"), 16 integration tests passing, health check healthy

### STORY-006 — Configure CI/CD Pipeline with GitHub Integration
- **Status:** done
- **Dependencies:** STORY-001 (GitHub), STORY-003 (Cloud Run), STORY-008 (Dockerfile — satisfied by STORY-004)
- **Tasks:** 4 of 6 completed (GitHub webhook trigger deferred — negligible for solo workflow)
  - TASK-006-001: Story spec ✅
  - TASK-006-002: GitHub trigger — deferred (gcloud builds submit sufficient)
  - TASK-006-003: Unit test gate in cloudbuild.yaml ✅
  - TASK-006-004: Pipeline verification tests (5 tests, all passing) ✅
- **Evidence Required:** cloudbuild.yaml has test gate, pipeline tests pass ✅
- **Evidence Provided:** 5 unit tests passing, cloudbuild.yaml install-deps→run-tests→build→migrate→deploy; prior manual runs confirm pipeline works end-to-end

### STORY-007 — Configure Cloud Scheduler for Nightly Batch Orchestration
- **Status:** done
- **Dependencies:** STORY-003 (Cloud Scheduler API), STORY-008 (placeholder endpoints — satisfied by STORY-003)
- **Tasks:** 6 (TASK-007-001 through TASK-007-006) ✅ ALL COMPLETE
  - TASK-007-001: Story spec ✅
  - TASK-007-002: `src/lib/scheduler-auth.ts` — OIDC verification via tokeninfo endpoint ✅
  - TASK-007-003: All 6 cron endpoints updated with OIDC verification gate (401 on unauthorized) ✅
  - TASK-007-004: 7 unit tests for scheduler-auth, all passing ✅
  - TASK-007-005: All 6 Cloud Scheduler jobs manually triggered, all HTTP 200 ✅
  - TASK-007-006: Tracking updated ✅
- **Evidence Required:** 6 jobs triggered, OIDC auth working ✅
- **Evidence Provided:** All 6 jobs status={} (success) × 2 triggers (before and after OIDC deploy); health check healthy; 12 unit tests + 50 integration tests passing

### STORY-008 — Implement Next.js Application Foundation with Health Check
- **Status:** done
- **Dependencies:** STORY-003 (Cloud Run), STORY-004 (Prisma schema)
- **Tasks:** 5 (TASK-008-001 through TASK-008-005) ✅ ALL COMPLETE
  - TASK-008-001: Story spec ✅
  - TASK-008-002: page.tsx updated (removed story number reference) ✅
  - TASK-008-003: 5 unit tests for health endpoint (mocked Prisma), all passing ✅
  - TASK-008-004: 2 integration tests for health endpoint (real test DB), all passing ✅
  - TASK-008-005: Tracking updated ✅
- **Evidence Required:** Health check passes, tests passing ✅
- **Evidence Provided:** 17 unit + 52 integration tests passing (69 total); health check {"status":"healthy","db":"connected"} ✅

### STORY-009 — Document Development Environment Setup and Workflows
- **Status:** done
- **Dependencies:** STORY-001 through STORY-008 (all prior setup complete)
- **Tasks:** 6 (TASK-009-001 through TASK-009-006) ✅ ALL COMPLETE
  - TASK-009-001: Story spec ✅
  - TASK-009-002: README.md — full setup guide (prerequisites, install, local DB, tests, deploy) ✅
  - TASK-009-003: CONTRIBUTING.md — commit format, test requirements, implementation tracking ✅
  - TASK-009-004: CHANGELOG.md — v1.0.0-foundation entry with full EPIC-001 summary ✅
  - TASK-009-005: .env.example — accurate local Docker dev setup ✅
  - TASK-009-006: Tracking updated ✅
- **Evidence Required:** README, CONTRIBUTING, CHANGELOG, .env.example all complete ✅

## EPIC-002 Story Execution Order

### STORY-010 — Admin User Creation, Password Reset, and User Deactivation API
- **Status:** done
- **Dependencies:** STORY-004 (users table), STORY-003 (ADMIN_API_KEY secret)
- **Tasks:** 6 (TASK-010-001 through TASK-010-006) ✅ ALL COMPLETE
  - TASK-010-001: Install bcrypt + create admin auth guard (`src/lib/admin-auth.ts`) ✅
  - TASK-010-002: POST /api/admin/users — create user with bcrypt hash ✅
  - TASK-010-003: PATCH /api/admin/users/[userId]/password — reset password ✅
  - TASK-010-004: PATCH /api/admin/users/[userId]/active — deactivate/reactivate ✅
  - TASK-010-005: Unit tests — auth guard (6) + routes (26) = 32 unit tests ✅
  - TASK-010-006: Integration + contract tests (19) + tracking update ✅
- **Evidence:** 120 total tests passing (69 baseline + 51 new); all 3 endpoints verified against real test DB

### STORY-011 — Sign-In API with Session Creation and Rate Limiting
- **Status:** done
- **Dependencies:** STORY-010 (user record exists for integration tests), STORY-004 (user_sessions table)
- **Tasks:** 5 (TASK-011-001 through TASK-011-005) ✅ ALL COMPLETE
  - TASK-011-001: In-memory rate limiter (`src/modules/auth/rate-limiter.ts`) ✅
  - TASK-011-002: AuthService — `signIn()` fully implemented; `validateSession()` + `signOut()` stubs ✅
  - TASK-011-003: POST /api/auth/signin route — cookie setting + logging ✅
  - TASK-011-004: Unit tests — rate limiter (8) + AuthService (10) + route (9) = 27 unit tests ✅
  - TASK-011-005: Integration + contract tests (17) + tracking update ✅
- **Evidence:** 164 total tests passing (120 baseline + 44 new); full sign-in flow, rate limiting, STORY-010 cross-story AC verified against real test DB; jest.config.ts maxWorkers=1 added to prevent DB race conditions

### STORY-012 — Session Validation Middleware and Route Protection
- **Status:** done
- **Dependencies:** STORY-011 (AuthService.validateSession() available)
- **Tasks:** 5 (TASK-012-001 through TASK-012-005) ✅ ALL COMPLETE
  - TASK-012-001: validateSession() — replaces stub; lazy expiry cleanup; inactive user check ✅
  - TASK-012-002: `src/middleware.ts` — Node.js runtime; header injection; matcher config ✅
  - TASK-012-003: `src/lib/auth.ts` — getCurrentUser() reads x-user-id/x-user-email ✅
  - TASK-012-004: Unit tests — validateSession (7) + middleware (9) + getCurrentUser (5) = 21 unit tests ✅
  - TASK-012-005: Integration tests — validateSession (8) + tracking update ✅
- **Evidence:** 193 total tests passing (164 baseline + 29 new); validateSession lazy-delete and inactive-user invariants verified against real DB

### STORY-013 — Sign-Out API and Expired Session Cleanup
- **Status:** done
- **Dependencies:** STORY-011 (AuthService module), STORY-007 (cron endpoints)
- **Tasks:** 6 (TASK-013-001 through TASK-013-006) ✅ ALL COMPLETE
  - TASK-013-001: signOut() — replaces stub; deleteMany for idempotency ✅
  - TASK-013-002: POST /api/auth/signout — always 200; cookie cleared ✅
  - TASK-013-003: cleanupExpiredSessions() in `src/modules/auth/cleanup.service.ts` ✅
  - TASK-013-004: Cleanup wired into `/api/cron/alerts`; sessionCleanup in response ✅
  - TASK-013-005: Unit tests — signOut (4) + route (6) + cleanup (4) + cron alerts (3) = 17 unit tests ✅
  - TASK-013-006: Integration tests — signout (6) + cleanup (3) = 9 integration tests + tracking ✅
- **Evidence:** 219 total tests passing (193 baseline + 26 new); idempotent sign-out, batch cleanup, cron wiring verified

### STORY-014 — Sign-In Page UI (Screen 1)
- **Status:** done
- **Dependencies:** STORY-011 (POST /api/auth/signin), STORY-012 (middleware, validateSession)
- **Tasks:** 5 (TASK-014-001 through TASK-014-005) ✅ ALL COMPLETE
  - TASK-014-001: Install React Testing Library + jsdom; jest.config.ts `setupFilesAfterEnv` + `.tsx` testMatch ✅
  - TASK-014-002: `src/app/signin/page.tsx` — Server Component; direct cookie read + validateSession; redirect to /universe ✅
  - TASK-014-003: `src/app/signin/SignInForm.tsx` — client component; validation, fetch, error, loading state ✅
  - TASK-014-004: Unit tests — SignInForm (10) + page (3) = 13 unit tests ✅
  - TASK-014-005: Tracking update ✅
- **Evidence:** 232 total tests passing (219 baseline + 13 new); already-auth redirect, client validation, error handling verified

## Active Work
- **Current Epic:** EPIC-004 — Classification Engine & Universe Screen
- **Current Story:** STORY-042 — Earnings Quality and Balance Sheet Quality Scoring (ready to begin)
- **Last Completed:** STORY-041 ✅ (BucketScorer — 61 unit tests + 7 integration tests, golden-set locked, 2026-04-24)
- **Next Action:** Detail and execute STORY-042 (EarningsQualityScorer + BalanceSheetQualityScorer)

## Blocked Items
- None currently

## Completed Items
- ✅ V1 baseline frozen (PRD, RFCs 001-006, ADRs 001-011)
- ✅ EPIC-001 validated
- ✅ STORY-001 through STORY-009 validated
- ✅ Implementation tracking system created
- ✅ EPIC-002 validated (5 stories: STORY-010 through STORY-014)
- ✅ STORY-010 through STORY-014 validated and adversarial review fixes applied
- ✅ STORY-010 task decomposition complete (6 tasks) — status: ready
- ✅ **STORY-010 COMPLETE** (Admin user creation, password reset, deactivation — 51 new tests, 120 total) - 2026-04-20
- ✅ STORY-011 task decomposition complete (5 tasks) — status: ready
- ✅ **STORY-011 COMPLETE** (Sign-In API with session creation, rate limiting, constant-time auth — 44 new tests, 164 total) - 2026-04-20
- ✅ STORY-012 task decomposition complete (5 tasks) — status: ready
- ✅ **STORY-012 COMPLETE** (Session validation middleware and route protection — 29 new tests, 193 total) - 2026-04-20
- ✅ STORY-013 task decomposition complete (6 tasks) — status: ready
- ✅ **STORY-013 COMPLETE** (Sign-out API and expired session cleanup — 26 new tests, 219 total) - 2026-04-20
- ✅ STORY-014 task decomposition complete (5 tasks) — status: ready
- ✅ **STORY-014 COMPLETE** (Sign-in page UI — 13 new tests, 232 total) - 2026-04-20
- ✅ **EPIC-002 COMPLETE** — Authentication & User Management (all 5 stories done, 232 tests passing) - 2026-04-20
- ✅ STORY-001 task decomposition complete (5 tasks)
- ✅ STORY-001 validated and marked ready
- ✅ **STORY-001 COMPLETE** (GitHub repository setup with version control foundation) - 2026-04-19
- ✅ STORY-002 task decomposition complete (6 tasks)
- ✅ **STORY-002 COMPLETE** (RFC-002 database schema verified - 19 tables, JSONB structures, ER diagram) - 2026-04-19
- ✅ STORY-003 task decomposition complete (8 tasks)
- ✅ **STORY-003 COMPLETE** (GCP infrastructure operational: Cloud SQL, VPC Connector, Secret Manager, Service Accounts, Cloud Run, Cloud Scheduler) - 2026-04-20
- ✅ STORY-004 task decomposition complete (10 tasks)
- ✅ **STORY-004 COMPLETE** (Prisma schema 19 tables, migrations applied, 34 integration tests passing, Dockerfile + Cloud Build updated) - 2026-04-20
- ✅ STORY-005 task decomposition complete (7 tasks)
- ✅ **STORY-005 COMPLETE** (Framework seed data: 1 framework_version, 16 anchored_thresholds, 8 tsr_hurdles applied to production; 16 integration tests passing) - 2026-04-20
- ✅ STORY-006 task decomposition complete (4 active tasks; GitHub trigger deferred)
- ✅ **STORY-006 COMPLETE** (cloudbuild.yaml unit test gate; 5 pipeline tests passing; GitHub webhook deferred as negligible for solo workflow) - 2026-04-20
- ✅ STORY-007 task decomposition complete (6 tasks)
- ✅ **STORY-007 COMPLETE** (OIDC verification on 6 cron endpoints; all 6 Cloud Scheduler jobs triggered successfully; 7 unit tests) - 2026-04-20
- ✅ STORY-008 task decomposition complete (5 tasks)
- ✅ **STORY-008 COMPLETE** (health endpoint unit + integration tests; 69 total tests passing) - 2026-04-20
- ✅ STORY-009 task decomposition complete (6 tasks)
- ✅ **STORY-009 COMPLETE** (README setup guide, CONTRIBUTING.md, CHANGELOG v1.0.0-foundation, .env.example updated) - 2026-04-20
- ✅ **EPIC-001 COMPLETE** — Platform Foundation & Deployment (all 9 stories done, 69 tests passing, Cloud Run deployed, Cloud SQL seeded) - 2026-04-20
- ✅ **STORY-015 COMPLETE** (Provider Abstraction Layer — VendorAdapter interface, ProviderOrchestrator, retry util; 25 unit tests) - 2026-04-20
- ✅ **STORY-016 COMPLETE** (Tiingo Adapter — universe, EOD price, fundamentals, forward estimates, metadata; 30 unit + 5 live integration tests) - 2026-04-20
- ✅ **STORY-017 COMPLETE** (FMP Adapter — stable API base, universe no-op documented, EOD price, fundamentals; 34 unit + 4 live integration tests) - 2026-04-20
- ✅ **STORY-018 COMPLETE** (Universe Sync Job — 11 unit + 4 integration tests; 3 bugs fixed BC-018-001/002/005; live_provider_verified 5606 Tiingo tickers; 5 BCs documented) - 2026-04-20
- ✅ **STORY-019 COMPLETE** (Price Sync Job — 9 unit + 4 integration tests; live_provider_verified AAPL $273.05; 3 BCs documented) - 2026-04-20
- ✅ **STORY-020 COMPLETE** (Fundamentals Sync Job — 11 unit + 4 integration tests; live_provider_verified AAPL 9 fields; 7 BCs documented) - 2026-04-20
- ✅ **STORY-021 COMPLETE** (Forward Estimates Sync Job — 20 unit + 2 route + 5 integration tests; TS2322 fixed; 7 BCs documented; integration_verified_local) - 2026-04-20
- ✅ **STORY-022 COMPLETE** (Data Freshness Tracking — 26 unit + 5 integration tests; 4 BCs fixed; integration_verified_local) - 2026-04-20
- ✅ **STORY-023 COMPLETE** (Pipeline Integration Tests — 6 integration tests; 5 BCs fixed; integration_verified_local) - 2026-04-21
- ✅ **STORY-024 COMPLETE** (Contract & Schema Tests — 20 integration tests; 8 BCs fixed; integration_verified_local) - 2026-04-21
- ✅ **EPIC-003 COMPLETE** — Data Ingestion & Universe Management (all 10 stories done; nightly batch pipeline operational; 5606 tickers in universe) - 2026-04-21

## Known Risks
1. **Framework seed data dependency**: STORY-005 requires canonical anchor codes/TSR hurdles from RFC-002 (generated in STORY-002)
2. **Cloud SQL sizing**: Initial db-f1-micro may be insufficient, monitor and adjust
3. **Prisma migration failures**: No automatic rollback, manual recovery procedure required
4. **OIDC authentication complexity**: Token validation requires Google public keys, caching, rotation handling

## Open Questions
1. Should testing framework (Jest configuration) be added as STORY-010, or handled incrementally in later epics? **Decision:** Defer to later epics, acceptable.
2. Branch protection workflow: Manual PR review or auto-merge? **Decision:** Defer to implementation, keep recommended practice for now.
3. Infrastructure-as-Code tool: Terraform or gcloud scripts? **Decision:** Defer to STORY-003 implementation.

## Integration Checkpoints
- **Checkpoint 1 (STORY-003):** GCP infrastructure provisioned, Cloud Run + Cloud SQL operational
- **Checkpoint 2 (STORY-004):** Database schema implemented, all 17 tables created, migrations working
- **Checkpoint 3 (STORY-008):** Next.js application deployed, health check passing, database connectivity verified
- **Checkpoint 4 (STORY-006):** CI/CD pipeline functional, automated deployment working
- **Checkpoint 5 (EPIC-001 Complete):** All stories done, infrastructure operational, documentation complete

## Deployment Milestones
- **Milestone 1:** Cloud Run service accessible via HTTPS (STORY-003)
- **Milestone 2:** Database populated with framework config (STORY-005)
- **Milestone 3:** Automated deployment functional (STORY-006)
- **Milestone 4:** Nightly batch orchestration configured (STORY-007)
- **Milestone 5:** EPIC-001 complete, ready for EPIC-002 (STORY-009)

## Baseline Change Protocol
If implementation reveals needed architecture changes:
1. **STOP implementation** of current story/task
2. **Document the conflict** in IMPLEMENTATION-LOG.md
3. **Create an issue** describing: conflict, current baseline assumption, proposed change, impact
4. **Propose RFC amendment or ADR update** if architecture change needed
5. **DO NOT proceed** until baseline change is approved
6. **Update implementation plan** after baseline change accepted

---

**Last Updated:** 2026-04-24 UTC
**Updated By:** Claude (EPIC-004 decomposed: STORY-041–053; ADR-013/014 added; STORY-041 task-decomposed and marked ready)
