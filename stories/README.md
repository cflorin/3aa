# Stories Index

Complete index of all epics and stories for the 3AA Monitoring Product V1.

**Last updated:** 2026-04-23 (EPIC-004 revised after UI analysis: STORY-053 added; STORY-041–052 updated)

---

## Epic Status Overview

| Epic | Title | Status | Stories |
|------|-------|--------|---------|
| EPIC-001 | Platform Foundation & Deployment | ✅ done | STORY-001–009 (9 stories) |
| EPIC-002 | Authentication & User Management | ✅ done | STORY-010–014 (5 stories) |
| EPIC-003 | Data Ingestion & Universe Management | ✅ done | STORY-015–033 (19 stories) |
| EPIC-003.1 | Classification LLM Enrichment | ✅ done | STORY-034–040 (7 stories) |
| EPIC-004 | Classification Engine & Universe Screen | 🔄 in_progress | STORY-041–053 (13 stories) |
| EPIC-005 | Valuation Threshold Engine & Enhanced Universe | planned | TBD |
| EPIC-006 | Monitoring & Alerts Engine with Alerts UI | planned | TBD |
| EPIC-007 | User Preferences & Settings | planned | TBD |

---

## EPIC-001 — Platform Foundation & Deployment

Specs: `stories/epics/` (no file; see implementation plan)

| Story | Title | Status |
|-------|-------|--------|
| STORY-001 | Setup GitHub Repository | ✅ done |
| STORY-002 | Design and Document RFC-002 Database Schema | ✅ done |
| STORY-003 | Provision Core GCP Infrastructure | ✅ done |
| STORY-004 | Implement Prisma Schema and Database Migrations | ✅ done |
| STORY-005 | Create Framework Configuration Seed Data | ✅ done |
| STORY-006 | Configure CI/CD Pipeline with GitHub Integration | ✅ done |
| STORY-007 | Configure Cloud Scheduler for Nightly Batch Orchestration | ✅ done |
| STORY-008 | Implement Next.js Application Foundation with Health Check | ✅ done |
| STORY-009 | Document Development Environment Setup and Workflows | ✅ done |

---

## EPIC-002 — Authentication & User Management

| Story | Title | Status |
|-------|-------|--------|
| STORY-010 | Admin User Creation, Password Reset, and User Deactivation API | ✅ done |
| STORY-011 | Sign-In API with Session Creation and Rate Limiting | ✅ done |
| STORY-012 | Session Validation Middleware and Route Protection | ✅ done |
| STORY-013 | Sign-Out API and Expired Session Cleanup | ✅ done |
| STORY-014 | Sign-In Page UI (Screen 1) | ✅ done |

---

## EPIC-003 — Data Ingestion & Universe Management

| Story | Title | Status |
|-------|-------|--------|
| STORY-015 | Provider Abstraction Layer | ✅ done |
| STORY-016 | Tiingo Adapter | ✅ done |
| STORY-017 | FMP Adapter | ✅ done |
| STORY-018 | Universe Sync Job | ✅ done |
| STORY-019 | Price Sync Job | ✅ done |
| STORY-020 | Fundamentals Sync Job | ✅ done |
| STORY-021 | Forward Estimates Sync Job | ✅ done |
| STORY-022 | Data Freshness Tracking | ✅ done |
| STORY-023 | Pipeline Integration Tests | ✅ done |
| STORY-024 | Contract & Schema Tests | ✅ done |
| STORY-025 | Behavioral Validation Tests | ✅ done |
| STORY-026 | Fix Fundamental Metrics Data Quality | ✅ done |
| STORY-027 | Market Cap, Enterprise Value & Trailing Multiples | ✅ done |
| STORY-028 | Forward Estimates Enrichment | ✅ done |
| STORY-029 | 3-Year Growth CAGRs | ✅ done |
| STORY-030 | ROIC: NOPAT / Invested Capital | ✅ done |
| STORY-031 | GAAP / Non-GAAP EPS Reconciliation Factor | ✅ done |
| STORY-032 | Share Count Growth (3-Year CAGR) | ✅ done |
| STORY-033 | Deterministic Classification Flags | ✅ done |

Story specs: `stories/tasks/EPIC-003-data-ingestion/`

---

## EPIC-003.1 — Classification LLM Enrichment

Epic spec: `stories/epics/EPIC-003.1-classification-llm-enrichment.md`

| Story | Title | Status |
|-------|-------|--------|
| STORY-034 | LLM Provider Interface and Prompt File Infrastructure | ✅ done |
| STORY-035 | holding_company_flag via Heuristic + LLM | ✅ done |
| STORY-036 | cyclicality_flag via Sector Heuristic + LLM | ✅ done |
| STORY-037 | binary_flag via Heuristic + LLM | ✅ done |
| STORY-038 | classificationEnrichmentSync Job | ✅ done |
| STORY-039 | Enrichment Score Columns: Schema Migration | ✅ done |
| STORY-040 | E1–E6 Qualitative Enrichment Scores via LLM Batch Call | ✅ done |

Story specs: `stories/tasks/EPIC-003.1-classification-llm-enrichment/`

**Evidence:** 489/489 unit tests passing (2026-04-21)

---

## EPIC-004 — Classification Engine & Universe Screen

**Status:** 🔄 in_progress — STORY-041, STORY-042, STORY-043, STORY-044, STORY-045, STORY-046, STORY-047, STORY-048 done

**Dependencies:** EPIC-002 ✅, EPIC-003 ✅, EPIC-003.1 ✅

Story specs: `stories/tasks/EPIC-004-classification-engine-universe-screen/`

| Story | Title | Status |
|-------|-------|--------|
| STORY-041 | Bucket Scoring Algorithm | ✅ done |
| STORY-042 | Earnings Quality and Balance Sheet Quality Scoring | ✅ done |
| STORY-043 | Classification Result Assembly (Tie-Break, Confidence, Special Cases) | ✅ done |
| STORY-044 | Classification State Persistence and History | ✅ done |
| STORY-045 | User Classification Override API | ✅ done |
| STORY-046 | User Monitoring Preferences API (all-default-monitored, per-user deactivation) | ✅ done |
| STORY-047 | Classification Recompute Batch Job | ✅ done |
| STORY-048 | Universe Screen: Stock Table (all in-universe stocks, paginated) | ✅ done |
| STORY-049 | Universe Screen: Filters and Sort | ✅ done |
| STORY-050 | Monitoring: Deactivate/Reactivate UI | planned |
| STORY-051 | Classification Override Modal (with history section) | planned |
| STORY-052 | EPIC-004 End-to-End Tests | planned |
| STORY-053 | Stock Detail Page (4-tab drill-down: Classification, Fundamentals, Valuation, History) | planned |

**Evidence:** 724/724 unit tests passing + 37 new integration tests passing (2026-04-24)

---

## EPIC-005 — Valuation Threshold Engine & Enhanced Universe

**Status:** planned — stories not yet decomposed

**Dependencies:** EPIC-004

---

## EPIC-006 — Monitoring & Alerts Engine with Alerts UI

**Status:** planned — stories not yet decomposed

**Dependencies:** EPIC-005

---

## EPIC-007 — User Preferences & Settings

**Status:** planned — stories not yet decomposed

**Dependencies:** EPIC-006

---

## Numbering Convention

Stories are numbered sequentially across epics (not reset per epic):
- EPIC-001: STORY-001–009
- EPIC-002: STORY-010–014
- EPIC-003: STORY-015–033
- EPIC-003.1: STORY-034–040
- EPIC-004: STORY-041–053
- EPIC-005: STORY-054+ (TBD)

Tasks follow `TASK-{story}-{seq}` format, e.g. `TASK-034-001`.
