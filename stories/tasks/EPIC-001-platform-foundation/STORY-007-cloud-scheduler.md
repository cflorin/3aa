# STORY-007 — Configure Cloud Scheduler for Nightly Batch Orchestration

## Metadata
- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **Story ID:** STORY-007
- **Status:** in_progress
- **Priority:** High
- **Dependencies:** STORY-003 (Cloud Scheduler API + jobs created), STORY-008 (placeholder endpoints — satisfied by STORY-003)
- **Estimated Effort:** Small (half day)
- **Assigned:** Claude (implementation)

---

## Story Description

As the system operator, I need the 6 Cloud Scheduler jobs to successfully invoke their cron endpoints with OIDC authentication — so that when the nightly batch pipeline is implemented (EPIC-003+), the orchestration layer is already secure and verified.

All 6 jobs were provisioned in STORY-003 and are ENABLED. The placeholder endpoints exist but do not yet verify the OIDC token. This story adds the verification layer and confirms the full loop works.

---

## Current State (entering this story)

| Job | Schedule (ET) | Endpoint | Status |
|-----|--------------|----------|--------|
| price-sync | 5pm Mon-Fri | /api/cron/price-sync | ENABLED |
| fundamentals-sync | 6pm Mon-Fri | /api/cron/fundamentals | ENABLED |
| estimates-sync | 7pm Mon-Fri | /api/cron/estimates | ENABLED |
| classification | 8pm Mon-Fri | /api/cron/classification | ENABLED |
| valuation | 8:15pm Mon-Fri | /api/cron/valuation | ENABLED |
| alerts | 8:30pm Mon-Fri | /api/cron/alerts | ENABLED |

All jobs use:
- Service account: `aaa-scheduler@aa-investor.iam.gserviceaccount.com`
- Audience: `https://aaa-web-717628686883.us-central1.run.app`
- Method: POST with OIDC Bearer token

---

## Acceptance Criteria

- [ ] `src/lib/scheduler-auth.ts` implements OIDC verification via Google tokeninfo endpoint
- [ ] All 6 cron endpoints call `verifySchedulerToken` and return 401 on unauthorized requests
- [ ] `verifySchedulerToken` skips in non-production (dev/test environments)
- [ ] 7 unit tests pass: auth verification happy/error paths + 6 endpoint 401-without-token checks
- [ ] Manual trigger of all 6 jobs succeeds (HTTP 200 response)
- [ ] Tracking documentation updated

---

## Task Breakdown

### TASK-007-001: Write story spec
- **Status:** done
- **Description:** Document story, acceptance criteria, tasks, BDD scenarios
- **Output:** This document

### TASK-007-002: Implement `src/lib/scheduler-auth.ts`
- **Status:** done
- **Description:** OIDC token verification using Google's tokeninfo endpoint (no new dependencies)
- **Acceptance Criteria:**
  - Exports `verifySchedulerToken(request: Request): Promise<void>`
  - Returns immediately when `NODE_ENV !== 'production'` (allows local/test usage)
  - Throws if Authorization header missing or not Bearer format
  - Calls `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=TOKEN`
  - Throws if tokeninfo returns non-200
  - Throws if `aud` does not match `SCHEDULER_AUDIENCE` env var (or default production URL)
  - Throws if `email` is not `aaa-scheduler@aa-investor.iam.gserviceaccount.com`

### TASK-007-003: Apply OIDC verification to all 6 cron endpoints
- **Status:** done
- **Description:** Update each placeholder endpoint to call `verifySchedulerToken`
- **Files:** `src/app/api/cron/*/route.ts` (6 files)
- **Acceptance Criteria:**
  - Each POST handler wraps call in try/catch
  - Returns `{ error: 'Unauthorized' }` with status 401 on `verifySchedulerToken` throw
  - Returns 200 placeholder response on success

### TASK-007-004: Write unit tests for scheduler auth
- **Status:** done
- **Description:** Unit tests mocking `fetch` to test OIDC verification paths
- **File:** `tests/unit/lib/scheduler-auth.test.ts`
- **Test Count:** 7 tests
- **Coverage:**
  - Returns immediately when NODE_ENV is 'test'
  - Throws when Authorization header is missing
  - Throws when Authorization header is not Bearer format
  - Resolves when tokeninfo returns valid payload with correct aud + email
  - Throws when tokeninfo returns non-200
  - Throws when audience does not match
  - Throws when email does not match expected service account

### TASK-007-005: Manual trigger all 6 Cloud Scheduler jobs
- **Status:** done
- **Description:** Use `gcloud scheduler jobs run` to verify full loop: scheduler → OIDC → endpoint → 200
- **Acceptance Criteria:**
  - All 6 jobs triggered manually with `--location=us-central1`
  - Execution status shows HTTP 200 for each
  - Cloud Run logs confirm requests received

### TASK-007-006: Update implementation tracking
- **Status:** done
- **Description:** Update IMPLEMENTATION-PLAN-V1.md and IMPLEMENTATION-LOG.md
- **Acceptance Criteria:**
  - STORY-007 status → done
  - Progress: 7/9 stories complete (78%)
  - Evidence: 6 jobs triggered, all 200 OK

---

## BDD Scenarios

```
Feature: Cloud Scheduler OIDC authentication
  Background:
    Given the cron endpoints are deployed to Cloud Run
    And NODE_ENV is 'production'

  Scenario: Authorized Cloud Scheduler request succeeds
    When Cloud Scheduler POSTs to /api/cron/price-sync with a valid OIDC Bearer token
    And the token audience is https://aaa-web-717628686883.us-central1.run.app
    And the token email is aaa-scheduler@aa-investor.iam.gserviceaccount.com
    Then the endpoint returns HTTP 200

  Scenario: Request without Authorization header is rejected
    When any caller POSTs to /api/cron/price-sync without an Authorization header
    Then the endpoint returns HTTP 401
    And the response body contains error = 'Unauthorized'

  Scenario: Request with wrong audience is rejected
    When a caller POSTs with a Bearer token for the wrong audience
    Then the endpoint returns HTTP 401

  Scenario: All 6 scheduler jobs execute successfully
    When each job is manually triggered via gcloud scheduler jobs run
    Then each job receives HTTP 200 from its target endpoint
    And Cloud Run logs show the request received with placeholder response
```

---

## Implementation Notes

### OIDC Verification Strategy
Rather than adding `google-auth-library` as a new dependency, verification uses Google's tokeninfo endpoint:
```
GET https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=<JWT>
```
Google verifies signature, expiry, and returns the payload. This is simple, correct, and requires no new packages. The latency (~50ms outbound HTTP) is negligible for daily cron jobs.

### Dev/Test Bypass
`NODE_ENV !== 'production'` bypasses verification entirely. This allows:
- Local development to call cron endpoints without a valid OIDC token
- Integration tests to exercise cron endpoints without a mocked OIDC flow

### Endpoint OIDC Token
Cloud Scheduler sends the token in:
```
Authorization: Bearer <Google-signed JWT>
```
The `aaa-scheduler` service account has `roles/run.invoker` on the Cloud Run service.

---

## Traceability
- **RFC:** /docs/rfc/RFC-006-platform-deployment-architecture.md (scheduler security spec)
- **STORY-003:** Cloud Scheduler jobs created with OIDC config
- **Jobs:** projects/aa-investor/locations/us-central1/jobs/{price-sync,fundamentals-sync,estimates-sync,classification,valuation,alerts}
