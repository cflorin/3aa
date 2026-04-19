# V1 Architecture Baseline

**Baseline Name:** 3AA Monitoring Product V1 Architecture Baseline
**Version:** 1.0
**Freeze Date:** 2026-04-19
**Status:** 🔒 FROZEN

---

## Purpose

This document establishes the official V1 architecture baseline for the 3AA Monitoring Product. All implementation work must conform to this baseline. Changes to the baseline require explicit approval and documented justification.

---

## Baseline Scope

This baseline includes all architectural, product, and platform decisions documented in the following PRD, RFC, and ADR set:

### Product Requirements Document (PRD)

| Document | Path | Description |
|----------|------|-------------|
| **3AA Product Full V1 PRD** | `/docs/prd/3_aa_product_full_v_1_prd_v_1.md` | Complete V1 product specification including workflows, data requirements, UX, authentication, deployment |

### Requests for Comments (RFCs)

| RFC | Document | Status | Description |
|-----|----------|--------|-------------|
| **RFC-001** | `RFC-001-classification-engine-architecture.md` | ACCEPTED | Classification engine architecture (bucket + quality scoring) |
| **RFC-002** | `RFC-002-canonical-data-model-persistence.md` | ACCEPTED | Complete data model (Postgres schemas, multi-user tables) |
| **RFC-003** | `RFC-003-valuation-threshold-engine-architecture.md` | ACCEPTED | Valuation engine (metric selection, thresholds, TSR hurdles) |
| **RFC-004** | `RFC-004-data-ingestion-refresh-pipeline.md` | ACCEPTED | Data ingestion (multi-provider, Tiingo + FMP, nightly batch) |
| **RFC-005** | `RFC-005-monitoring-alerts-engine-architecture.md` | ACCEPTED | Monitoring & alerts (state diffs, alert generation, per-user) |
| **RFC-006** | `RFC-006-platform-deployment-architecture.md` | ACCEPTED | Platform architecture (GCP, Cloud Run, deployment pipeline) |

### Architecture Decision Records (ADRs)

| ADR | Document | Status | Description |
|-----|----------|--------|-------------|
| **ADR-001** | `ADR-001-multi-provider-data-architecture.md` | ACCEPTED | Multi-provider data strategy (Tiingo + FMP) |
| **ADR-002** | `ADR-002-v1-orchestration-nightly-batch.md` | ACCEPTED | Nightly batch orchestration (Cloud Scheduler) |
| **ADR-003** | `ADR-003-audit-trail-full-state-snapshots.md` | ACCEPTED | Audit trail strategy (full state snapshots) |
| **ADR-004** | `ADR-004-classification-automation-rules-first-manual-override.md` | ACCEPTED | Classification automation (rules-first + manual override) |
| **ADR-005** | `ADR-005-threshold-management-anchored-mechanical-derivation.md` | ACCEPTED | Threshold management (anchored + derived) |
| **ADR-006** | `ADR-006-alert-generation-zone-entry-deduplication.md` | ACCEPTED | Alert generation (zone-entry only + deduplication) |
| **ADR-007** | `ADR-007-multi-user-architecture-shared-vs-user-state.md` | ACCEPTED | Multi-user architecture (shared system state + per-user overrides) |
| **ADR-008** | `ADR-008-platform-choice-google-cloud.md` | ACCEPTED | Platform choice (Google Cloud Platform) |
| **ADR-009** | `ADR-009-application-architecture-modular-monolith.md` | ACCEPTED | Application architecture (modular monolith) |
| **ADR-010** | `ADR-010-technology-stack-typescript-nextjs-prisma.md` | ACCEPTED | Technology stack (TypeScript + Next.js + Prisma) |
| **ADR-011** | `ADR-011-authentication-strategy-custom-email-password.md` | ACCEPTED | Authentication strategy (custom email/password) |

---

## Key Architectural Decisions

### Cloud Platform (ADR-008)
- **Platform:** Google Cloud Platform
- **Services:** Cloud Run, Cloud SQL (Postgres), Cloud Scheduler, Secret Manager, Cloud Build
- **Region:** us-central1

### Application Architecture (ADR-009)
- **Pattern:** Modular Monolith
- **Deployment:** Single Next.js application, single Cloud Run service
- **Modules:** classification, valuation, monitoring, data-ingestion, auth, shared

### Technology Stack (ADR-010)
- **Language:** TypeScript 5.x
- **Framework:** Next.js 14+ (App Router)
- **ORM:** Prisma 5.x
- **Database:** PostgreSQL 15
- **Runtime:** Node.js 20.x LTS

### Multi-User Architecture (ADR-007)
- **Shared State:** Classification suggestions, valuation computations, framework config
- **Per-User State:** Monitored stocks, classification overrides, valuation overrides, alerts, preferences
- **Critical Semantic:** User overrides affect inspection display only, NOT operational alert generation (V1)

### Data Architecture (ADR-001, RFC-002)
- **Multi-Provider:** Tiingo (primary) + FMP (forward estimates)
- **Field Provenance:** JSONB metadata for each metric
- **Audit Trail:** Full state snapshots (ADR-003)

### Orchestration (ADR-002)
- **Pattern:** Nightly batch (sequential pipeline)
- **Scheduler:** Cloud Scheduler (6 jobs: price-sync, fundamentals, estimates, classification, valuation, alerts)
- **Schedule:** 5:00pm - 9:00pm ET (Mon-Fri)

### Authentication (ADR-011)
- **Strategy:** Custom email/password (bcrypt + session cookies)
- **Session Duration:** 7 days
- **User Management:** Admin-created accounts (no self-service signup)

---

## V1 Product Scope

### In Scope
- ✅ Classification engine (bucket + quality, rules-first + manual override)
- ✅ Valuation engine (metric selection, threshold assignment, TSR hurdles)
- ✅ Monitoring engine (state diffs, alert generation per user)
- ✅ Data ingestion (multi-provider, nightly batch)
- ✅ Authentication (email/password, multi-user)
- ✅ Core UX (5 screens: Sign-in, Universe, Alerts, Inspection, Settings)
- ✅ Alert inspection view (read-only, full context)

### Out of Scope (V1)
- ❌ Manual 5-year TSR estimation in screening/alerts
- ❌ Entry permission / technical stabilization rules
- ❌ Portfolio construction tools
- ❌ Decision journaling workflows
- ❌ Trade execution integration
- ❌ Email/SMS notifications (in-app only)
- ❌ Social login (email/password only)
- ❌ 2FA, SSO, passwordless auth

---

## Baseline Freeze Rules

### 1. Implementation Must Conform to Baseline

All code implementation must adhere to the frozen baseline architecture. This includes:
- Module structure (per ADR-009)
- Database schema (per RFC-002)
- Multi-user semantics (per ADR-007)
- Alert generation logic (per RFC-005)
- Data ingestion pipeline (per RFC-004)
- Deployment model (per RFC-006)

### 2. No Silent Architecture Changes

During implementation, do NOT:
- Change module boundaries without approval
- Add new engines or subsystems without approval
- Change database schema without approval
- Expand scope beyond V1 boundaries
- Change multi-user semantics (shared vs per-user state)
- Add out-of-scope features (TSR estimation, portfolio tools, etc.)

### 3. Change Control Process

If implementation reveals a problem, ambiguity, contradiction, or better option:

**STOP and follow this process:**

#### Step 1: Identify the Issue
- What is the problem? (ambiguity, contradiction, missing detail, better option)
- Which document(s) are affected?
- What is the current baseline state?

#### Step 2: Classify the Change
- **Clarification:** Fills in missing implementation detail without changing architecture
  - Examples: Code comment style, error message text, UI label wording
  - **Approval:** Can proceed, document in code comments

- **Minor Architecture Change:** Affects implementation but not core decisions
  - Examples: Add database index for performance, change log format, adjust rate limit
  - **Approval:** Document in BASELINE-V1.md Approved Changes Log, update affected RFC/ADR section

- **Material Architecture Change:** Changes core architectural decision
  - Examples: Switch from Prisma to TypeORM, add microservice, change multi-user semantics
  - **Approval:** STOP, create change request, wait for explicit approval before proceeding

#### Step 3: Document the Change Request
Create a change request with:
- Change ID (sequential: V1-CR-001, V1-CR-002, etc.)
- Date
- Affected documents (PRD/RFC/ADR)
- Problem statement (why change is needed)
- Proposed solution
- Impact analysis (what breaks, what must be updated)
- Classification (clarification / minor / material)

#### Step 4: Get Approval
- **Clarifications:** Proceed, log in code
- **Minor changes:** Log in Approved Changes section below, update docs
- **Material changes:** STOP, await explicit approval from product owner

#### Step 5: Update Baseline
If approved:
- Update affected RFC/ADR
- Log in Approved Changes section below
- Increment baseline version if material change

### 4. Prefer Implementation Over Redesign

When facing implementation challenges:
- ✅ Prefer implementing against the frozen design
- ✅ Accept minor imperfections in V1 (can improve in V2)
- ❌ Do not redesign during coding
- ❌ Do not gold-plate or over-engineer

---

## Approved Changes Log

### V1.0 (Baseline Freeze)
**Date:** 2026-04-19
**Description:** Initial baseline freeze. No changes yet.
**Status:** FROZEN

---

### (Future Changes Logged Here)

**Format:**
```
### V1.x (Change Description)
**Change ID:** V1-CR-XXX
**Date:** YYYY-MM-DD
**Classification:** Clarification / Minor / Material
**Affected Documents:** List RFCs/ADRs
**Reason:** Why change was needed
**Solution:** What was changed
**Approved By:** Name/Role
```

---

## Baseline Integrity Checks

### Pre-Implementation Checklist
- [ ] All RFCs have status = ACCEPTED
- [ ] All ADRs have status = ACCEPTED
- [ ] PRD Section 9C references RFC-006 and ADR-008/009/010/011
- [ ] No ADR reference numbering conflicts
- [ ] Multi-user architecture consistent across all docs
- [ ] Alert generation semantics consistent (shared system state)
- [ ] No scope drift (V1 excludes TSR, portfolio, execution)

### Post-Implementation Checklist
- [ ] Code module structure matches ADR-009
- [ ] Database schema matches RFC-002
- [ ] Prisma schema generates expected TypeScript types
- [ ] Cloud Run deployment follows RFC-006
- [ ] Cloud Scheduler jobs match ADR-002 schedule
- [ ] Authentication follows ADR-011 (bcrypt + session cookies)
- [ ] Multi-user isolation works per ADR-007
- [ ] Alert generation uses shared system state (RFC-005)
- [ ] No out-of-scope features implemented

---

## Document Version Control

### Baseline Documents Are Immutable
Once frozen, baseline documents should NOT be edited directly during implementation.

**Exception:** Only for approved changes logged in this document.

### How to Handle New Information
- Implementation details → Code comments, inline documentation
- Clarifications → Update this baseline document's Approved Changes section
- Architecture changes → Create change request, get approval, then update baseline

---

## Related Documents

- **CLAUDE.md:** Project overview and implementation guidelines
- **PLATFORM-DEPLOYMENT-COMPLETION.md:** Platform architecture completion report
- **ADVERSARIAL-REVIEW-COMPLETION.md:** Adversarial review resolution report
- **MULTI-USER-PATCH-COMPLETION.md:** Multi-user architecture patch completion

---

## Baseline Maintainer

**Primary:** Claude (autonomous implementation)
**Authority:** Product Owner (human)

**Change Approval Authority:**
- Clarifications: Claude (autonomous)
- Minor changes: Claude (autonomous, logged)
- Material changes: Product Owner (explicit approval required)

---

**END BASELINE V1**
