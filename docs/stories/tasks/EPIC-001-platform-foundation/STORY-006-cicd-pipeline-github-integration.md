# STORY-006 — Configure CI/CD Pipeline with GitHub Integration

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Establish automated deployment pipeline that builds Docker container from GitHub source, runs tests, applies database migrations, and deploys to Cloud Run on every push to main branch.

## Story
As a **developer**,
I want **automated deployment pipeline (GitHub → Cloud Build → Cloud Run)**,
so that **code changes are tested, built, and deployed automatically without manual intervention**.

## Outcome
- Cloud Build configured with GitHub webhook integration
- cloudbuild.yaml pipeline defined (build → test → migrate → deploy)
- Push to main branch triggers automatic deployment
- Database migrations applied automatically before deployment
- Build failures prevent deployment
- Deployment completes in <10 minutes
- Cloud Run service updated with new container image
- Automated deployment replaces manual deployment from STORY-008

## Scope In
- Create cloudbuild.yaml (Cloud Build configuration, uses existing Dockerfile from STORY-008)
- Configure GitHub Cloud Build integration (webhook on push to main)
- Define build steps (install dependencies, build Next.js app, run tests, build Docker image, push to Container Registry)
- Define migration step (run Prisma migrate deploy before Cloud Run deployment)
- Define deployment step (deploy to Cloud Run, replace previous revision)
- Configure Cloud Build service account permissions (Cloud Run Admin, Cloud SQL Client, Container Registry access)
- Add build status badge to README (optional)
- Test end-to-end pipeline (push to main → build succeeds → Cloud Run updated)

## Scope Out
- Multi-environment deployments (V1 has single environment: production in us-central1)
- Staging environment (deferred to V2)
- Blue-green deployment (Cloud Run handles rollout, V1 uses default behavior)
- Rollback automation (manual rollback via Cloud Run revision management)
- Build caching optimization (use Cloud Build default caching for V1)
- Integration with GitHub Actions (using Cloud Build instead)
- Automated performance testing in pipeline (unit/integration tests only for V1)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFCs:** RFC-006 (Platform & Deployment Architecture)
- **ADRs:** ADR-008 (Google Cloud - Cloud Build), ADR-010 (Next.js)
- **Upstream stories:** STORY-001 (GitHub repository), STORY-003 (Cloud Run, Container Registry), STORY-004 (Prisma migrations), STORY-008 (Next.js application with Dockerfile)

## Preconditions
- GitHub repository created (STORY-001)
- Cloud Run service provisioned (STORY-003)
- Prisma migrations exist (STORY-004, STORY-005)
- Next.js application exists with Dockerfile (STORY-008 completed)
- Cloud Build API enabled
- Container Registry or Artifact Registry enabled

## Inputs
- GitHub repository (source code, Dockerfile, cloudbuild.yaml)
- DATABASE_URL (from Secret Manager, for migrations)
- Cloud Build service account
- Cloud Run service name and region

## Outputs
- cloudbuild.yaml (Cloud Build pipeline configuration)
- Cloud Build trigger (webhook on GitHub push to main)
- Container image in Container Registry (gcr.io/PROJECT/monitoring-app:latest and :$COMMIT_SHA)
- Cloud Run service updated (new revision deployed)
- Build logs (Cloud Build logs accessible via GCP Console or CLI)

## Acceptance Criteria
- [ ] Dockerfile exists from STORY-008 (verified before starting this story)
- [ ] cloudbuild.yaml created with build steps: install deps, build app, run tests, build Docker image, push to Container Registry, deploy to Cloud Run
- [ ] cloudbuild.yaml includes migration step (prisma migrate deploy) before deployment
- [ ] cloudbuild.yaml uses substitution variables ($PROJECT_ID, $COMMIT_SHA, $_SERVICE_NAME, $_REGION)
- [ ] Cloud Build trigger created (name: "deploy-main", event: push to main branch, GitHub repository linked)
- [ ] Cloud Build service account has required permissions (roles/run.admin, roles/cloudsql.client, roles/storage.admin for Container Registry)
- [ ] GitHub webhook configured (Cloud Build webhook URL set in GitHub repository settings)
- [ ] Build succeeds on push to main (integration test: push commit → Cloud Build triggered → build succeeds → Cloud Run updated)
- [ ] Build fails if tests fail (integration test: push commit with failing test → build fails → Cloud Run not updated)
- [ ] Database migrations applied before deployment (migration step runs, database schema updated)
- [ ] Cloud Run service updated with new container image (new revision created, traffic shifted to new revision)
- [ ] Build completes in <10 minutes (typical build time: 5-8 minutes)
- [ ] Build logs accessible (Cloud Build logs visible in GCP Console)

## Test Strategy Expectations

**Unit tests:**
- Dockerfile syntax validation (Dockerfile parses without errors)
- cloudbuild.yaml syntax validation (YAML parses, Cloud Build schema valid)
- Build steps ordering (migration step before deployment step)

**Integration tests:**
- End-to-end build (push to main → Cloud Build triggered → build succeeds → container image pushed → Cloud Run updated)
- Build failure handling (push commit with failing unit test → build fails → Cloud Run not updated)
- Migration execution (push commit with new migration → migration applied before deployment → database schema updated)
- Container image tagging (build creates two tags: latest and $COMMIT_SHA)
- Cloud Run revision creation (new build creates new Cloud Run revision)
- Environment variable propagation (DATABASE_URL from Secret Manager available during build)

**Contract/schema tests:**
- Dockerfile best practices (multi-stage build, non-root user, minimal layers)
- cloudbuild.yaml schema compliance (valid Cloud Build configuration, all required fields present)
- Container image metadata (image has correct labels, exposed port 3000)

**BDD acceptance tests:**
- "Given code pushed to main, when Cloud Build triggers, then build succeeds and Cloud Run updated"
- "Given unit tests failing, when Cloud Build triggers, then build fails and Cloud Run not updated"
- "Given new migration present, when Cloud Build triggers, then migration applied before deployment"
- "Given build succeeds, when checking Cloud Run, then new revision created with latest container image"

**E2E tests:**
- Full deployment workflow (developer pushes to main → build triggers → tests run → migrations apply → Docker image built → Cloud Run deployed → health check passes)

## Regression / Invariant Risks

**Build failure silent:**
- Risk: Build fails but Cloud Run deployment proceeds (stale container deployed)
- Protection: cloudbuild.yaml chains steps with && or uses explicit failure handling, integration test verifies build failure prevents deployment

**Migration not applied:**
- Risk: Migration step skipped, Cloud Run deployed with old schema (application crashes)
- Protection: Migration step gating (deployment step depends on migration step success), integration test verifies migration applied

**Container image tag confusion:**
- Risk: Cloud Run deploys :latest tag, but build pushes :$COMMIT_SHA (mismatch)
- Protection: Cloud Run deployment step references :$COMMIT_SHA tag explicitly, not :latest

**Database connection failure during migration:**
- Risk: Migration step cannot connect to Cloud SQL (VPC Connector not configured for Cloud Build)
- Protection: Cloud Build service account has cloudsql.client role, DATABASE_URL uses Cloud SQL proxy or VPC, integration test validates migration succeeds

**Build timeout:**
- Risk: Build exceeds Cloud Build default timeout (10 minutes), deployment never completes
- Protection: Optimize Dockerfile (layer caching, multi-stage build), integration test monitors build duration

**Invariants to protect:**
- Migrations always applied before deployment (migration step before deployment step)
- Build failures always prevent deployment (Cloud Run not updated if build fails)
- Container images always tagged with commit SHA (traceability to source code)
- Cloud Run always deploys tested code (unit/integration tests run before deployment)
- DATABASE_URL never logged (Cloud Build logs do not expose secrets)

## Key Risks / Edge Cases

**Build step edge cases:**
- Dependency installation failure (npm install fails, Cloud Build exits)
- Build failure (next build fails, Cloud Build exits)
- Test failure (unit tests fail, Cloud Build exits before deployment)
- Migration failure (prisma migrate deploy fails, Cloud Build exits before deployment)

**Cloud Build trigger edge cases:**
- Multiple commits pushed rapidly (Cloud Build queues builds, latest build wins)
- Build triggered on non-main branch (trigger configured for main only, other branches ignored)
- Manual Cloud Build trigger (manual run via GCP Console or CLI, acceptable)
- GitHub webhook delivery failure (webhook timeout, retry behavior)

**Container Registry edge cases:**
- Image push failure (Container Registry quota exceeded, build fails)
- Image size too large (>2GB, exceeds Cloud Run limit, build warns)
- Stale images accumulate (old images not garbage collected, manual cleanup needed)

**Cloud Run deployment edge cases:**
- Deployment timeout (Cloud Run takes >10 minutes to start new revision, build fails)
- New revision crashes immediately (health check fails, Cloud Run keeps old revision, build marked failed)
- Zero-downtime deployment (Cloud Run gradually shifts traffic to new revision, acceptable)

**Secret handling edge cases:**
- DATABASE_URL not available (Secret Manager read fails, migration fails)
- DATABASE_URL logged in build output (Cloud Build logs expose secret, use --no-verbose for migrations)
- Secret version mismatch (DATABASE_URL updated in Secret Manager, but build uses old version until Cloud Build cache cleared)

## Definition of Done

- [ ] Dockerfile created and committed to GitHub repository
- [ ] cloudbuild.yaml created and committed to GitHub repository
- [ ] Cloud Build trigger configured (push to main → build triggered)
- [ ] GitHub webhook integration tested (push to main → Cloud Build triggered)
- [ ] End-to-end build tested (push commit → build succeeds → Cloud Run updated → health check passes)
- [ ] Build failure tested (push failing test → build fails → Cloud Run not updated)
- [ ] Migration execution tested (push migration → migration applied before deployment → schema updated)
- [ ] Cloud Build service account permissions verified (has roles/run.admin, roles/cloudsql.client)
- [ ] Build logs inspected (no secrets exposed, build steps clear)
- [ ] Build duration measured (<10 minutes)
- [ ] Dockerfile and cloudbuild.yaml committed to GitHub
- [ ] Traceability links recorded (cloudbuild.yaml comments reference ADR-008, RFC-006)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFC:** RFC-006 (Platform & Deployment Architecture)
- **ADR:** ADR-008 (Google Cloud - Cloud Build), ADR-010 (Next.js)

---

**END STORY-006**
