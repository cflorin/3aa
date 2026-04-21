# Next Steps - 3AA Monitoring Product V1

**Date:** 2026-04-19
**Status:** Tier 1 Core Architecture Complete ✅

---

## What's Complete

All 5 Tier 1 RFCs defining V1 core architecture are complete:

1. ✅ Classification Engine Architecture (RFC-001)
2. ✅ Canonical Data Model & Persistence Layer (RFC-002)
3. ✅ Valuation & Threshold Engine Architecture (RFC-003)
4. ✅ Data Ingestion & Refresh Pipeline (RFC-004)
5. ✅ Monitoring & Alerts Engine Architecture (RFC-005)

Plus supporting ADR:
- ✅ Multi-Provider Data Architecture (ADR-015)

**Full Status:** See `/docs/architecture/v1-architecture-status.md`

---

## Recommended Path Forward

### Option A: Start Implementation (Recommended for V1)

**Why:** All core architectural decisions are made. V1 can be built from existing RFCs without additional architecture work.

**Implementation Order:**

1. **Database Setup** (RFC-002)
   - Create Postgres database
   - Run DDL scripts for all tables
   - Seed framework config (anchored_thresholds, tsr_hurdles)
   - Create indexes

2. **Data Ingestion** (RFC-004, ADR-015)
   - Implement VendorAdapter interface
   - Build TiingoAdapter implementation
   - Build FMPAdapter implementation
   - Implement ProviderOrchestrator
   - Create Universe Sync job
   - Create Price Sync job
   - Create Fundamentals Sync job
   - Create Forward Estimates Sync job

3. **Classification Engine** (RFC-001)
   - Implement bucket scoring algorithm
   - Implement quality scoring algorithm
   - Implement tie-break rules
   - Implement confidence computation
   - Build manual override handling
   - Create classification persistence layer

4. **Valuation Engine** (RFC-003)
   - Implement metric selection logic
   - Implement current multiple computation
   - Implement threshold lookup (anchored)
   - Implement threshold derivation (mechanical)
   - Implement TSR hurdle calculation
   - Implement valuation zone assignment
   - Create valuation persistence layer

5. **Monitoring & Alerts Engine** (RFC-005)
   - Implement state snapshot capture
   - Implement state diff detection
   - Implement alert generation for 3 families
   - Implement deduplication filter
   - Implement priority assignment
   - Create alert persistence layer
   - Build alert inspection view (read-only UI)

**Tech Stack Decisions Required:**
- Database: Postgres (recommended based on RFC-002 JSONB usage)
- Backend: Node.js/TypeScript, Python, or Go
- Frontend: React, Vue, or simple server-rendered HTML
- Deployment: Docker container, single-process app for V1

---

### Option B: Create Implementation Specs (Optional)

**Why:** Extract detailed algorithm specifications from RFCs for easier implementation reference.

**Files to Create:**

```
/specs/engines/
  - classification-scoring-rules.md
  - bucket-tie-break-rules.md
  - valuation-metric-selection.md
  - threshold-derivation-algorithm.md
  - tsr-hurdle-calculation.md
  - alert-generation-rules.md

/specs/schemas/
  - stocks-schema.sql (extracted from RFC-002)
  - classification-schema.sql
  - valuation-schema.sql
  - alerts-schema.sql
  - framework-config-schema.sql

/specs/contracts/
  - classification-engine.ts (TypeScript interfaces)
  - valuation-engine.ts
  - monitoring-engine.ts
  - data-ingestion.ts
  - vendor-adapter.ts
```

**Effort:** ~2-4 hours to extract and format from existing RFCs

---

### Option C: Write Tier 2 Supporting RFCs/ADRs (Not Recommended for V1)

**Why:** Tier 2 RFCs refine operational characteristics, but V1 can proceed with simple defaults.

**Potential Tier 2 Documents:**

- **ADR: V1 Workflow Orchestration** - Document nightly batch processing strategy
- **ADR: Framework Config Storage** - Document YAML vs DB table for anchored thresholds
- **ADR: V1 Observability Strategy** - Document structured logging approach
- **ADR: V1 Deployment Architecture** - Document single-process Docker container
- **ADR: V1 Performance Assumptions** - Document 1000 stocks, <2s latency targets

**Recommendation:** Skip Tier 2 for now. Create ADRs only when implementation raises specific questions.

---

### Option D: Create User Stories and Task Breakdown

**Why:** Break RFCs into granular implementation tasks for project tracking.

**Epic Structure:**

```
/stories/epics/
  - EPIC-001-database-setup.md
  - EPIC-002-data-ingestion-pipeline.md
  - EPIC-003-classification-engine.md
  - EPIC-004-valuation-engine.md
  - EPIC-005-monitoring-alerts.md
  - EPIC-006-alert-inspection-ui.md

/stories/tasks/
  - TASK-001-create-database-schema.md (refs: RFC-002)
  - TASK-002-seed-framework-config.md (refs: RFC-002)
  - TASK-003-implement-tiingo-adapter.md (refs: RFC-004, ADR-015)
  - TASK-004-implement-fmp-adapter.md (refs: RFC-004, ADR-015)
  - TASK-005-implement-provider-orchestrator.md (refs: RFC-004)
  - TASK-006-implement-universe-sync.md (refs: RFC-004)
  - TASK-007-implement-classification-scoring.md (refs: RFC-001)
  ... (50-100 tasks total)
```

**Effort:** ~4-8 hours to create full task breakdown

---

## Decision Matrix

| Option | Effort | Value for V1 | When to Do |
|--------|--------|-------------|-----------|
| **A. Start Implementation** | High | **Critical** | **NOW** |
| **B. Implementation Specs** | Low | Medium | Optional, before implementation |
| **C. Tier 2 RFCs/ADRs** | Medium | Low | Only if questions arise during implementation |
| **D. User Stories** | Medium | Medium | If using project management tools |

---

## Recommended: Start with Option A

**Minimal path to working V1:**

1. Set up Postgres database
2. Run RFC-002 SQL schemas
3. Implement Tiingo + FMP adapters (RFC-004)
4. Implement classification engine (RFC-001)
5. Implement valuation engine (RFC-003)
6. Implement monitoring engine (RFC-005)
7. Build simple alert inspection UI

**Defer:**
- Tier 2 RFCs (create ADRs only if questions arise)
- Detailed specs (extract from RFCs as needed)
- Formal user stories (use RFCs as implementation guide)

---

## API Keys Required for V1

Before starting implementation, obtain:

- **TIINGO_API_KEY** - https://api.tiingo.com/
  - Used for: Historical fundamentals, EOD prices, fallback forward estimates

- **FMP_API_KEY** - https://financialmodelingprep.com/
  - Used for: Primary forward estimates, fallback fundamentals

---

## Reference Documents

- **Architecture Status:** `/docs/architecture/v1-architecture-status.md`
- **RFC Governance:** `/docs/architecture/v1-rfc-structure.md`
- **All RFCs:** `/docs/rfc/RFC-001.md` through `/docs/rfc/RFC-005.md`
- **Multi-Provider Decision:** `/docs/adr/ADR-015-multi-provider-data-architecture.md`
- **Product Requirements:** `/docs/prd/` (7 PRD documents)

---

**Bottom Line:** V1 architecture is complete. Ready to build.
