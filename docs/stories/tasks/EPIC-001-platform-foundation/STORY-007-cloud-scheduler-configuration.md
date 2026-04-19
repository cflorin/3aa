# STORY-007 — Configure Cloud Scheduler for Nightly Batch Orchestration

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Configure Cloud Scheduler jobs to trigger nightly batch data processing (price sync, fundamentals sync, estimates sync, classification, valuation, alerts) via HTTP endpoints with OIDC authentication.

## Story
As a **system operator**,
I want **Cloud Scheduler jobs configured to trigger nightly batch processes**,
so that **stock data, classifications, valuations, and alerts are refreshed automatically every weekday evening**.

## Outcome
- 6 Cloud Scheduler jobs created (price-sync, fundamentals, estimates, classification, valuation, alerts)
- Jobs scheduled for weekdays (Monday-Friday) in 5pm-9pm ET window
- Jobs trigger HTTP POST endpoints on Cloud Run (placeholder endpoints for STORY-007)
- Jobs use OIDC authentication (Cloud Scheduler service account verified)
- Jobs configured with retry logic (3 retries, exponential backoff)
- Manual trigger capability (can run jobs on-demand for testing)

## Scope In
- Create 6 Cloud Scheduler jobs:
  1. price-sync (5:00pm ET Mon-Fri)
  2. fundamentals-sync (6:00pm ET Mon-Fri)
  3. estimates-sync (7:00pm ET Mon-Fri)
  4. classification-recompute (8:00pm ET Mon-Fri)
  5. valuation-recompute (8:15pm ET Mon-Fri)
  6. alerts-generation (8:30pm ET Mon-Fri)
- Configure job schedules (cron expressions for ET timezone)
- Configure job targets (Cloud Run HTTP endpoints, e.g., /api/cron/price-sync)
- Configure OIDC authentication (Cloud Scheduler service account, audience: Cloud Run URL)
- Configure retry policy (retry_count: 3, retry_interval: 60s, backoff_rate: 2.0)
- Create placeholder cron endpoints (return 200 OK for STORY-007, actual implementation in later epics)
- Test manual job trigger (gcloud scheduler jobs run price-sync → endpoint called → 200 OK)
- Document job schedules and dependencies (price-sync before fundamentals, etc.)

## Scope Out
- Actual batch processing logic (EPIC-003 for data sync, EPIC-004 for classification, EPIC-005 for valuation, EPIC-006 for alerts)
- Job monitoring and alerting (Cloud Scheduler logs to Cloud Logging, custom alerts deferred)
- Dynamic job scheduling (V1 uses fixed schedule, no user-configurable schedules)
- Job dependency orchestration (jobs run sequentially by schedule, no explicit DAG)
- Parallel job execution (jobs run one at a time in scheduled order)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 16 (Data Freshness Rules - nightly batch schedule)
- **RFCs:** RFC-004 (Data Ingestion & Refresh Pipeline - batch orchestration)
- **ADRs:** ADR-002 (Nightly Batch Orchestration), ADR-008 (Google Cloud - Cloud Scheduler)
- **Upstream stories:** STORY-003 (Cloud Run service provisioned), STORY-008 (Next.js app with placeholder cron endpoints)

## Preconditions
- Cloud Run service exists (STORY-003)
- Cloud Scheduler API enabled
- Cloud Scheduler service account created (or use default service account)
- Cloud Run endpoints exist (placeholder endpoints return 200 OK)
- Understanding of ET timezone (America/New_York, UTC-5 or UTC-4 during DST)

## Inputs
- Cloud Run service URL (e.g., https://monitoring-app-abc123-uc.a.run.app)
- Cron schedule expressions (ET timezone)
- Cloud Scheduler service account email
- Retry policy parameters (retry count, interval, backoff rate)

## Outputs
- 6 Cloud Scheduler jobs created and enabled
- Jobs visible in GCP Cloud Scheduler console
- Job execution logs (Cloud Logging captures job runs, success/failure)
- Placeholder cron endpoint responses (200 OK, JSON payload: {status: "ok", job: "price-sync"})

## Acceptance Criteria
- [ ] 6 Cloud Scheduler jobs created (price-sync, fundamentals-sync, estimates-sync, classification-recompute, valuation-recompute, alerts-generation)
- [ ] Job schedules configured (cron expressions for ET timezone):
  - price-sync: `0 17 * * 1-5` (5:00pm ET Mon-Fri)
  - fundamentals-sync: `0 18 * * 1-5` (6:00pm ET Mon-Fri)
  - estimates-sync: `0 19 * * 1-5` (7:00pm ET Mon-Fri)
  - classification-recompute: `0 20 * * 1-5` (8:00pm ET Mon-Fri)
  - valuation-recompute: `15 20 * * 1-5` (8:15pm ET Mon-Fri)
  - alerts-generation: `30 20 * * 1-5` (8:30pm ET Mon-Fri)
- [ ] Job targets configured (Cloud Run HTTP POST endpoints):
  - price-sync → POST /api/cron/price-sync
  - fundamentals-sync → POST /api/cron/fundamentals-sync
  - estimates-sync → POST /api/cron/estimates-sync
  - classification-recompute → POST /api/cron/classification-recompute
  - valuation-recompute → POST /api/cron/valuation-recompute
  - alerts-generation → POST /api/cron/alerts-generation
- [ ] OIDC authentication configured (Cloud Scheduler service account, audience: Cloud Run URL)
- [ ] Retry policy configured (retry_count: 3, retry_interval: 60s, backoff_rate: 2.0)
- [ ] Jobs enabled (state: ENABLED, not paused)
- [ ] Placeholder cron endpoints return 200 OK (integration test: trigger job manually → endpoint returns 200 OK)
- [ ] Manual job trigger tested (gcloud scheduler jobs run price-sync → success)
- [ ] Job execution logs visible (Cloud Logging shows job execution, HTTP request/response)
- [ ] Timezone validated (jobs run at correct ET time, accounting for DST)

## Test Strategy Expectations

**Unit tests:**
- Cron expression validation (cron expressions parse correctly, schedule correct times)
- Timezone conversion (5:00pm ET → UTC cron expression correct for DST/standard time)

**Integration tests:**
- Manual job trigger (gcloud scheduler jobs run price-sync → POST /api/cron/price-sync → 200 OK)
- OIDC authentication (job triggered → OIDC token included in request → Cloud Run verifies token)
- Retry logic (endpoint returns 500 → job retries up to 3 times → exponential backoff between retries)
- Job success logging (job triggered → 200 OK → Cloud Logging shows success)
- Job failure logging (endpoint returns 500 → Cloud Logging shows failure, retries)

**Contract/schema tests:**
- Cloud Scheduler job configuration schema (all required fields present: schedule, target, auth, retry_config)
- OIDC token structure (token includes audience, service account, expiration)
- Cron endpoint response schema (200 OK, JSON payload: {status: "ok", job: string})

**BDD acceptance tests:**
- "Given Cloud Scheduler job created, when manual trigger invoked, then Cloud Run endpoint called and returns 200 OK"
- "Given OIDC authentication configured, when job triggered, then OIDC token included in request"
- "Given job target returns 500, when job triggered, then job retries 3 times with exponential backoff"
- "Given job scheduled for 5:00pm ET, when time is 5:00pm ET, then job triggers"

**E2E tests:**
- Full batch orchestration (wait for 5:00pm ET → price-sync job triggers → fundamentals-sync at 6:00pm → ... → alerts-generation at 8:30pm)

## Regression / Invariant Risks

**Timezone misconfiguration:**
- Risk: Jobs scheduled in UTC instead of ET (jobs run at wrong times)
- Protection: Integration test validates jobs run at expected ET times, document timezone in job description

**OIDC authentication failure:**
- Risk: Cloud Run rejects request (missing or invalid OIDC token)
- Protection: Integration test validates OIDC token present and valid, Cloud Run middleware verifies token

**Retry loop exhaustion:**
- Risk: Endpoint returns 500 indefinitely, job retries forever (not true, retry limit is 3)
- Protection: Retry policy enforces max 3 retries, integration test validates retry count

**Job not enabled:**
- Risk: Job created but paused (state: PAUSED, job never triggers)
- Protection: Integration test validates job state is ENABLED, document job state in acceptance criteria

**Cron expression error:**
- Risk: Cron expression invalid (e.g., `0 17 * * Mon-Fri` instead of `0 17 * * 1-5`)
- Protection: Unit test validates cron expression syntax, manual trigger test validates job can run

**Invariants to protect:**
- Jobs always run in correct order (price-sync at 5pm → fundamentals at 6pm → ... → alerts at 8:30pm)
- Jobs always use OIDC authentication (no API key, no unauthenticated requests)
- Jobs always retry on failure (max 3 retries, exponential backoff)
- Jobs always target Cloud Run (not localhost, not placeholder URL)
- Jobs always run Mon-Fri only (no weekend runs for V1)

## Key Risks / Edge Cases

**Scheduling edge cases:**
- Daylight Saving Time transition (ET timezone shifts, cron schedule must account for DST)
- Leap seconds (cron scheduler may skip or duplicate jobs, very rare)
- Holiday handling (jobs run on holidays if Mon-Fri, acceptable for V1)
- Job overlap (valuation job takes >15 min, overlaps with alerts job, sequential execution enforced)

**OIDC authentication edge cases:**
- Service account deleted (OIDC token generation fails, job fails)
- Cloud Run URL changed (audience mismatch, OIDC verification fails)
- Token expiration (OIDC token expires during request, Cloud Run rejects)

**Retry edge cases:**
- Endpoint times out (Cloud Run cold start >60s, retry triggered)
- Endpoint returns 429 (rate limit, retry with backoff)
- Endpoint returns 200 but processing fails (job marked success, but data not synced, monitoring needed)

**Job execution edge cases:**
- Multiple jobs triggered simultaneously (Cloud Scheduler queues jobs, runs sequentially)
- Manual trigger during scheduled run (two instances of same job run, acceptable if idempotent)
- Job disabled mid-run (current execution completes, future runs paused)

**Timezone edge cases:**
- ET vs UTC confusion (5:00pm ET is 21:00 UTC in winter, 22:00 UTC in summer)
- Cron expression in UTC (Cloud Scheduler uses UTC, must convert ET → UTC for cron)
- DST transition (spring forward: 2am-3am skipped, fall back: 1am-2am repeated)

## Definition of Done

- [ ] 6 Cloud Scheduler jobs created and enabled
- [ ] Job schedules validated (cron expressions correct for ET timezone)
- [ ] Job targets configured (Cloud Run endpoints)
- [ ] OIDC authentication tested (manual trigger succeeds with OIDC token)
- [ ] Retry policy tested (endpoint returns 500 → retries 3 times)
- [ ] Manual triggers tested (all 6 jobs can be triggered manually and return 200 OK)
- [ ] Job execution logs visible in Cloud Logging
- [ ] Job configuration documented (schedule, target, auth, retry policy in README or runbook)
- [ ] Placeholder cron endpoints implemented (STORY-008 creates endpoints)
- [ ] Traceability links recorded (job descriptions reference RFC-004, ADR-002)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 16 (Data Freshness Rules - nightly batch schedule)
- **RFC:** RFC-004 (Data Ingestion & Refresh Pipeline - batch orchestration)
- **ADR:** ADR-002 (Nightly Batch Orchestration), ADR-008 (Google Cloud - Cloud Scheduler)

---

**END STORY-007**
