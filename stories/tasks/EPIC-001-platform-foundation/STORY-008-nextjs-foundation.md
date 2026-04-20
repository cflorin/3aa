# STORY-008 — Implement Next.js Application Foundation with Health Check

## Metadata
- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **Story ID:** STORY-008
- **Status:** in_progress
- **Priority:** High
- **Dependencies:** STORY-003 (Cloud Run), STORY-004 (Prisma schema)
- **Estimated Effort:** Small (half day — most deliverables already exist from STORY-003/004)
- **Assigned:** Claude (implementation)

---

## Story Description

As the development team, we need a running Next.js application deployed to Cloud Run — with a health check endpoint that verifies database connectivity — so that the platform has a verified foundation for all subsequent feature epics.

The core deliverables were implemented incrementally across STORY-003 and STORY-004. This story formally documents, tests, and closes those deliverables.

---

## Pre-existing Deliverables (implemented in earlier stories)

| Deliverable | File | Story |
|-------------|------|-------|
| Next.js App Router foundation | `src/app/layout.tsx`, `src/app/page.tsx` | STORY-003 |
| Health check endpoint | `src/app/api/health/route.ts` | STORY-003/004 |
| Prisma client singleton | `src/infrastructure/database/prisma.ts` | STORY-004 |
| Dockerfile (multi-stage standalone) | `Dockerfile` | STORY-004 |
| next.config.js (standalone + serverExternalPackages) | `next.config.js` | STORY-004 |
| Cloud Run deployment | aaa-web service | STORY-003 |

---

## Acceptance Criteria

- [ ] `GET /api/health` returns HTTP 200 with `{"status":"healthy","db":"connected",...}`
- [ ] Health endpoint returns `status:"degraded"` (not 503) when DB is unreachable — Cloud Run never marks instance unhealthy due to DB transience
- [ ] Home page `page.tsx` does not reference story numbers (clean placeholder)
- [ ] 5 unit tests for health endpoint pass (mocked DB)
- [ ] 1 integration test for health endpoint passes (real test DB)
- [ ] TypeScript compiles without errors (`next build` succeeds)
- [ ] Tracking documentation updated

---

## Task Breakdown

### TASK-008-001: Write story spec
- **Status:** done
- **Output:** This document

### TASK-008-002: Update home page
- **Status:** done
- **Description:** Remove story number reference from `page.tsx` placeholder
- **File:** `src/app/page.tsx`

### TASK-008-003: Write health endpoint unit tests
- **Status:** done
- **Description:** Unit tests for `src/app/api/health/route.ts` with mocked Prisma
- **File:** `tests/unit/api/health.test.ts`
- **Tests:** 5
  - Returns 200 with status=healthy when DB query succeeds
  - Returns 200 with status=degraded when DB throws
  - Response includes `db: connected` when healthy
  - Response includes `db: disconnected` and `error` field when degraded
  - Response always includes `timestamp` and `service` fields

### TASK-008-004: Write health endpoint integration test
- **Status:** done
- **Description:** Integration test calling route handler against real test DB
- **File:** `tests/integration/api/health.test.ts`
- **Tests:** 2
  - Returns 200 OK
  - Response body has status=healthy and db=connected

### TASK-008-005: Update implementation tracking
- **Status:** done

---

## BDD Scenarios

```
Feature: Health check endpoint
  Scenario: Database connected
    When GET /api/health is called
    And the database is reachable
    Then HTTP 200 is returned
    And response body status = 'healthy'
    And response body db = 'connected'
    And response body has timestamp (ISO 8601)
    And response body service = '3aa-web'

  Scenario: Database unreachable
    When GET /api/health is called
    And the database throws an error
    Then HTTP 200 is still returned (Cloud Run must not get 5xx)
    And response body status = 'degraded'
    And response body db = 'disconnected'
    And response body has error message

  Scenario: TypeScript compiles
    When npm run build is executed
    Then it completes with exit code 0
    And the standalone output is produced in .next/standalone
```

---

## Traceability
- **RFC:** /docs/rfc/RFC-006-platform-deployment-architecture.md (health endpoint spec)
- **STORY-003:** Initial Next.js app and Cloud Run deployment
- **STORY-004:** Prisma singleton, health check DB integration, force-dynamic
- **Cloud Run:** https://aaa-web-717628686883.us-central1.run.app
