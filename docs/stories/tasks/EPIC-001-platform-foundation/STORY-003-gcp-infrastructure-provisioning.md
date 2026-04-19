# STORY-003 — Provision Core GCP Infrastructure

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Establish foundational Google Cloud Platform infrastructure to host the modular monolith, including compute (Cloud Run), database (Cloud SQL), secrets management, and network connectivity.

## Story
As a **platform engineer**,
I want **GCP infrastructure provisioned (Cloud Run, Cloud SQL, Secret Manager, VPC Connector)**,
so that **the application can deploy, connect to the database, and access secrets securely**.

## Outcome
- GCP project created and configured
- Cloud Run service provisioned (auto-scaling, HTTPS enabled)
- Cloud SQL Postgres 15 instance provisioned (private IP, sufficient capacity for V1)
- VPC Connector established (Cloud Run → Cloud SQL private connection)
- Secret Manager configured with database credentials
- IAM service accounts created with least-privilege permissions
- Infrastructure ready for application deployment (STORY-008) and CI/CD (STORY-006)

## Scope In
- Create GCP project (or use existing project, configure billing)
- Provision Cloud Run service (region: us-central1, min instances: 0, max instances: 10, concurrency: 80)
- Provision Cloud SQL Postgres 15 instance (suggested starting point: db-f1-micro or db-g1-small for V1 development, adjust based on load testing, private IP enabled)
- Create database within Cloud SQL instance (database name: "monitoring_v1")
- Configure VPC Connector (Serverless VPC Access, connect Cloud Run to Cloud SQL private network)
- Setup Secret Manager (create secrets: DATABASE_URL, TIINGO_API_KEY placeholder, FMP_API_KEY placeholder)
- Create service accounts (Cloud Run service account, Cloud Scheduler service account, Cloud Build service account)
- Configure IAM roles (Cloud Run service account: Cloud SQL Client, Secret Manager Secret Accessor; Cloud Scheduler: Cloud Run Invoker; Cloud Build: Cloud Run Admin, Cloud SQL Client for migrations)
- Configure network settings (private IP for Cloud SQL, VPC peering if needed)
- Enable required GCP APIs (Cloud Run API, Cloud SQL Admin API, Secret Manager API, VPC Access API, Cloud Build API, Cloud Scheduler API)

## Scope Out
- Application deployment (STORY-008)
- Database schema creation (STORY-004)
- CI/CD pipeline configuration (STORY-006)
- Cloud Scheduler job configuration (STORY-007)
- Multi-region deployment (V1 is single-region: us-central1)
- Cloud CDN or Load Balancer (Cloud Run handles this)
- Cloud Armor (DDoS protection deferred to V2)
- Monitoring dashboards (Cloud Logging enabled by default, custom dashboards deferred)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFCs:** RFC-006 (Platform & Deployment Architecture)
- **ADRs:** ADR-008 (Google Cloud), ADR-009 (Modular Monolith - Cloud Run deployment)
- **Upstream stories:** STORY-001 (GitHub repository for infrastructure-as-code scripts)

## Preconditions
- GCP account exists with billing enabled
- User has Owner or Editor role on GCP project (or permissions to create projects)
- gcloud CLI installed locally (or Cloud Shell available)
- Terraform installed (optional, if using Terraform for IaC)

## Inputs
- GCP project ID (user-provided or generated)
- GCP billing account ID
- Region selection (default: us-central1)
- Cloud SQL instance tier (suggested starting point: db-f1-micro for development, db-g1-small for V1, adjust based on actual load)
- Database name (default: "monitoring_v1")
- Database user credentials (postgres user password, securely generated)

## Outputs
- GCP project ID (documented)
- Cloud Run service URL (HTTPS endpoint, e.g., https://3aa-monitoring-abc123-uc.a.run.app)
- Cloud SQL instance connection name (project:region:instance)
- Cloud SQL private IP address
- VPC Connector name (for Cloud Run configuration)
- Secret Manager secret paths (DATABASE_URL, TIINGO_API_KEY, FMP_API_KEY)
- Service account emails (Cloud Run, Cloud Scheduler, Cloud Build)
- Infrastructure provisioning script (Terraform config or gcloud script, committed to GitHub)

## Acceptance Criteria
- [ ] GCP project created and billing enabled
- [ ] Required APIs enabled (Cloud Run, Cloud SQL Admin, Secret Manager, VPC Access, Cloud Build, Cloud Scheduler)
- [ ] Cloud Run service created (region: us-central1, name: "monitoring-app", placeholder container deployed)
- [ ] Cloud Run service accessible via HTTPS (URL resolves, returns 404 or placeholder response)
- [ ] Cloud SQL Postgres 15 instance created (private IP enabled, instance tier: db-f1-micro or db-g1-small)
- [ ] Cloud SQL database created (name: "monitoring_v1")
- [ ] Cloud SQL postgres user password set (stored in Secret Manager, never logged)
- [ ] VPC Connector created (name: "cloud-run-sql-connector", connects Cloud Run VPC to Cloud SQL private network)
- [ ] Secret Manager secrets created (DATABASE_URL with postgres connection string, TIINGO_API_KEY placeholder, FMP_API_KEY placeholder)
- [ ] DATABASE_URL format correct (postgresql://USER:PASSWORD@PRIVATE_IP:5432/monitoring_v1)
- [ ] Service accounts created (monitoring-app-sa for Cloud Run, scheduler-sa for Cloud Scheduler, cloudbuild-sa for Cloud Build)
- [ ] IAM roles granted (monitoring-app-sa: roles/cloudsql.client, roles/secretmanager.secretAccessor; scheduler-sa: roles/run.invoker; cloudbuild-sa: roles/run.admin, roles/cloudsql.client)
- [ ] Cloud Run configured to use VPC Connector (network egress uses VPC Connector for Cloud SQL access)
- [ ] Cloud SQL connectivity tested (Cloud Run placeholder app can connect to Cloud SQL via private IP)
- [ ] Infrastructure-as-code script created (Terraform or gcloud script, committed to GitHub repository)

## Test Strategy Expectations

**Note:** For infrastructure provisioning stories, many "tests" are actually **one-time environment verification checks** (scripted gcloud commands to verify provisioning succeeded) rather than repeatable automated tests run in CI/CD. These verification checks should be scripted and documented, but may not be part of the standard test suite.

**Unit tests:**
- N/A (infrastructure provisioning uses IaC scripts, not application code)

**Environment verification checks (one-time, post-provisioning):**
- Cloud Run service reachable (HTTP GET to Cloud Run URL → 200 OK or 404, not connection refused)
- Cloud SQL instance running (gcloud sql instances describe → status: RUNNABLE)
- VPC Connector functional (Cloud Run can resolve Cloud SQL private IP)
- Secret Manager access (Cloud Run service account can read DATABASE_URL secret)

**Integration tests (repeatable, can be automated):**
- Database connection from Cloud Run (deploy test app that connects to Postgres → connection succeeds)

**Contract/schema tests:**
- DATABASE_URL format validation (postgresql://USER:PASSWORD@IP:PORT/DATABASE)
- Service account IAM roles verification (monitoring-app-sa has cloudsql.client role)
- Cloud Run configuration validation (VPC Connector configured, min instances: 0, max instances: 10)

**BDD acceptance tests:**
- "Given Cloud Run service deployed, when accessing HTTPS URL, then response received (not connection timeout)"
- "Given Cloud SQL instance provisioned, when checking instance status, then status is RUNNABLE"
- "Given VPC Connector configured, when Cloud Run app connects to Cloud SQL private IP, then connection succeeds"
- "Given Secret Manager DATABASE_URL, when Cloud Run app reads secret, then connection string returned"

**E2E tests:**
- Full infrastructure test: Deploy test Next.js app to Cloud Run → app reads DATABASE_URL from Secret Manager → connects to Cloud SQL → queries database → returns success

## Regression / Invariant Risks

**VPC Connector misconfiguration:**
- Risk: Cloud Run cannot reach Cloud SQL private IP (connection timeout)
- Protection: Integration test validates connectivity, document VPC Connector setup

**Secret Manager access denied:**
- Risk: Cloud Run service account lacks Secret Manager access (app cannot read DATABASE_URL)
- Protection: IAM role verification test, document required roles

**Cloud SQL instance undersized:**
- Risk: db-f1-micro insufficient for V1 load (connections exhausted, queries slow)
- Protection: Document expected load (1000 stocks, <100 concurrent users), monitor connection pool

**Cloud Run cold start timeout:**
- Risk: First request after idle exceeds timeout (>60s)
- Protection: Acceptable for V1 (min instances: 0), monitor cold start latency

**Database credentials exposed:**
- Risk: Database password logged or committed to repository
- Protection: Use Secret Manager, never log DATABASE_URL, .gitignore .env files

**Invariants to protect:**
- Cloud SQL always private IP only (no public IP exposed)
- DATABASE_URL always in Secret Manager (never hardcoded, never logged)
- Cloud Run always uses VPC Connector for Cloud SQL access (no direct public IP access)
- Service accounts follow least privilege (Cloud Run cannot delete Cloud SQL, Cloud Scheduler cannot modify Cloud Run)
- All GCP resources in single region (us-central1 for V1)

## Key Risks / Edge Cases

**Provisioning failure edge cases:**
- GCP quota exceeded (Cloud Run instances, Cloud SQL instances, VPC connectors)
- Billing account disabled (infrastructure provisioning fails)
- API not enabled (Cloud Run API disabled, provisioning script fails)
- Region unavailable (us-central1 maintenance, choose us-east1 fallback)

**Cloud SQL edge cases:**
- Database name collision (monitoring_v1 already exists, use different name or drop existing)
- Postgres user password requirements (min 8 chars, complexity enforced by Cloud SQL)
- Connection pool exhaustion (Prisma default pool size 10, Cloud SQL db-f1-micro supports 25 connections)
- Cloud SQL maintenance window (weekly automated maintenance, brief downtime acceptable for V1)

**Secret Manager edge cases:**
- Secret version management (DATABASE_URL updated, Cloud Run uses old version until redeployed)
- Secret rotation (database password changed, update Secret Manager, redeploy Cloud Run)
- Secret access latency (first Secret Manager read slow, cached afterward)

**VPC Connector edge cases:**
- VPC Connector IP range conflict (chosen IP range overlaps with existing VPC)
- VPC Connector throughput limit (default: 200-300 Mbps, sufficient for V1)
- Multiple Cloud Run services sharing VPC Connector (acceptable, no isolation issues)

**IAM edge cases:**
- Service account key creation (not needed for Cloud Run workload identity, but needed for local development)
- Role propagation delay (IAM role granted, takes 1-2 minutes to propagate)
- Service account deletion (delete monitoring-app-sa, Cloud Run fails to start)

## Definition of Done

- [ ] GCP project created and APIs enabled
- [ ] Cloud Run service deployed and accessible via HTTPS
- [ ] Cloud SQL Postgres 15 instance running with private IP
- [ ] VPC Connector configured and Cloud Run connectivity tested
- [ ] Secret Manager secrets created (DATABASE_URL, API key placeholders)
- [ ] Service accounts created with correct IAM roles
- [ ] Database connection from Cloud Run tested (integration test passes)
- [ ] Infrastructure-as-code script committed to GitHub
- [ ] Cloud Run URL documented (in epic completion notes, README)
- [ ] Cloud SQL instance connection name documented
- [ ] Traceability links recorded (IaC script comments reference ADR-008, RFC-006)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFC:** RFC-006 (Platform & Deployment Architecture)
- **ADR:** ADR-008 (Google Cloud), ADR-009 (Modular Monolith - Cloud Run)

---

**END STORY-003**
