# STORY-006 — Configure CI/CD Pipeline with GitHub Integration

## Metadata
- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **Story ID:** STORY-006
- **Status:** in_progress
- **Priority:** High
- **Dependencies:** STORY-001 (GitHub repo), STORY-003 (Cloud Run/Cloud Build), STORY-008 (Dockerfile — satisfied by STORY-004 deliverable)
- **Estimated Effort:** Medium (1 day)
- **Assigned:** Claude (implementation)

---

## Story Description

As the development team, we need GitHub pushes to `main` to automatically trigger Cloud Build, run the full build pipeline (build → migrate+seed → deploy), and produce a verified Cloud Run deployment — so that every commit to main is automatically shipped to production without manual intervention.

The `cloudbuild.yaml` was built incrementally across STORY-003/004/005 and is fully operational when triggered manually. This story connects it to GitHub so all future work is deployed automatically.

---

## Acceptance Criteria

- [ ] Cloud Build GitHub App connected to `cflorin/3aa` repository
- [ ] Trigger `deploy-on-push-to-main` exists in Cloud Build (global region)
- [ ] Trigger fires on every push to `main` branch
- [ ] Successful build executes all 5 pipeline steps: build-web, build-migrator, push-web/migrator, run-migrations, deploy-web
- [ ] Unit test gate step added to `cloudbuild.yaml` (runs before Docker build)
- [ ] Health check returns `{"status":"healthy"}` after automated deployment
- [ ] All pipeline tests pass (5 tests)
- [ ] Push verification commit triggers end-to-end automated deployment
- [ ] Tracking documentation updated

---

## Task Breakdown

### TASK-006-001: Write story spec
- **Status:** done
- **Description:** Document story, acceptance criteria, tasks, BDD scenarios
- **Output:** This document

### TASK-006-002: Connect GitHub repository to Cloud Build
- **Status:** done
- **Description:** Authorize Cloud Build GitHub App on `cflorin/3aa`, create trigger `deploy-on-push-to-main`
- **Acceptance Criteria:**
  - GitHub App installed on `cflorin/3aa` repository (one-time browser step)
  - `gcloud builds triggers create github` succeeds
  - Trigger appears in `gcloud builds triggers list --project=aa-investor`
  - Trigger branch pattern: `^main$`
  - Trigger build config: `cloudbuild.yaml`

### TASK-006-003: Add unit test gate to `cloudbuild.yaml`
- **Status:** done
- **Description:** Add `npm ci` + `npm test --passWithNoTests` steps before Docker build
- **Acceptance Criteria:**
  - `cloudbuild.yaml` has `install-deps` step (node:20, npm ci)
  - `cloudbuild.yaml` has `run-tests` step (node:20, npm test -- --passWithNoTests)
  - Steps run before `build-web`
  - Passing with zero tests (no unit tests yet); will catch failures when tests are added

### TASK-006-004: Write pipeline verification tests
- **Status:** done
- **Description:** Unit tests validating `cloudbuild.yaml` structure and pipeline contract
- **File:** `tests/unit/pipeline/cloudbuild.test.ts`
- **Test Count:** 5 tests
- **Coverage:**
  - cloudbuild.yaml parses as valid YAML
  - All 7 required step IDs present (install-deps, run-tests, build-web, build-migrator, push-web, push-migrator, run-migrations, deploy-web)
  - timeout is set to 1200s
  - images array contains all 3 images (aaa-web:latest, aaa-web:v1.0.0, aaa-migrator:latest)
  - deploy-web waitFor includes push-web and run-migrations

### TASK-006-005: Trigger and verify end-to-end automated deployment
- **Status:** done
- **Description:** Push a commit to main, verify Cloud Build fires, build succeeds, health check passes
- **Acceptance Criteria:**
  - `git push origin main` triggers a Cloud Build execution
  - Build ID recorded in implementation log
  - All 7 steps complete with status SUCCESS
  - `curl /api/health` returns `{"status":"healthy","database":"connected"}`

### TASK-006-006: Update implementation tracking
- **Status:** done
- **Description:** Update IMPLEMENTATION-PLAN-V1.md and IMPLEMENTATION-LOG.md
- **Acceptance Criteria:**
  - STORY-006 status → done
  - Progress: 6/9 stories complete (67%)
  - Implementation log entry with trigger ID, build ID, health check evidence

---

## BDD Scenarios

### Feature: Automated CI/CD Pipeline
```
Feature: GitHub push triggers automated deployment
  Background:
    Given the Cloud Build GitHub trigger deploy-on-push-to-main exists
    And the trigger is connected to the cflorin/3aa repository
    And the trigger branch pattern is ^main$

  Scenario: Push to main triggers a build
    When a commit is pushed to the main branch
    Then Cloud Build starts a new build within 30 seconds
    And the build executes the install-deps step
    And the build executes the run-tests step
    And the build executes the build-web step
    And the build executes the run-migrations step
    And the build executes the deploy-web step
    And the build completes with status SUCCESS

  Scenario: Successful build updates Cloud Run
    Given a Cloud Build triggered by push to main completes
    When the health endpoint is queried
    Then it returns HTTP 200
    And the response body contains status = 'healthy'
    And the response body contains database = 'connected'

  Scenario: Pipeline has unit test gate
    Given cloudbuild.yaml is loaded
    When the steps are examined
    Then there is a step with id = 'run-tests'
    And it runs before build-web
    And it uses --passWithNoTests so an empty test suite passes
```

### Feature: Pipeline Contract Validation
```
Feature: cloudbuild.yaml satisfies RFC-006 pipeline contract
  Scenario: All required steps are defined
    Given the cloudbuild.yaml file is parsed
    Then it contains step ids: install-deps, run-tests, build-web, build-migrator,
         push-web, push-migrator, run-migrations, deploy-web
    And the timeout is 1200s
    And the images array contains aaa-web:latest, aaa-web:v1.0.0, aaa-migrator:latest

  Scenario: deploy-web runs after migrations and push
    Given the cloudbuild.yaml deploy-web step
    Then its waitFor list includes push-web
    And its waitFor list includes run-migrations
```

---

## Implementation Notes

### GitHub App Connection (One-Time Setup)
Cloud Build connects to GitHub via the Cloud Build GitHub App. This requires a one-time browser authorization:
1. Visit: `https://console.cloud.google.com/cloud-build/triggers;region=global/connect?project=717628686883`
2. Select GitHub as the source
3. Authorize Cloud Build to access `cflorin/3aa`
4. After authorization, triggers can be created via `gcloud builds triggers create github`

### Trigger Region
Cloud Build triggers that connect to GitHub use the `global` region (not `us-central1`). This is the default for 1st gen triggers.

### Unit Test Gate
The `npm test` command runs `jest --testPathPatterns='tests/unit'`. With `--passWithNoTests`, it passes even with zero unit tests. When EPIC-002+ adds unit tests, failing tests will automatically block deployments.

### Trigger Service Account
The trigger uses `aaa-builder@aa-investor.iam.gserviceaccount.com` which already has:
- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/storage.admin`
- `roles/secretmanager.secretAccessor`

---

## Traceability
- **RFC:** /docs/rfc/RFC-006-platform-deployment-architecture.md (Cloud Build pipeline spec)
- **ADR:** /docs/adr/ADR-008-platform-choice-google-cloud.md (GCP platform choice)
- **cloudbuild.yaml:** /cloudbuild.yaml (pipeline implementation)
- **Trigger:** Cloud Build console, project aa-investor
