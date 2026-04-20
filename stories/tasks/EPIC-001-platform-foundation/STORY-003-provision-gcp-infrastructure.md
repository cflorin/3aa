# STORY-003: Provision Core GCP Infrastructure

**Epic:** EPIC-001 — Platform Foundation & Deployment
**Status:** done
**Dependencies:** STORY-001 (GitHub repository)
**Estimated Complexity:** High

## Story Overview

Provision core Google Cloud Platform infrastructure for the 3AA Monitoring Product, including Cloud SQL (PostgreSQL), VPC Connector, Secret Manager, Service Accounts, Cloud Run service placeholder, and Cloud Scheduler jobs for nightly batch processing.

> **Naming Convention Note:** GCP resource names cannot begin with a number. The product is "3AA" but all GCP resource names use the `aaa-` prefix (e.g., `aaa-web`, `aaa-db`). The GCP project ID is `aa-investor`. This is an intentional, approved deviation from the `3aa-` naming used in non-GCP contexts.

## Acceptance Criteria

1. GCP project is created and configured
2. Cloud SQL PostgreSQL 15 instance is provisioned and accessible
3. VPC Connector is created for private Cloud Run → Cloud SQL connection
4. Secret Manager secrets are created for database credentials and API keys
5. Service accounts are created with appropriate IAM roles
6. Cloud Run service is deployed with health check endpoint
7. Cloud Scheduler jobs are created for nightly batch orchestration (6 jobs)
8. All infrastructure is verified and accessible

## Evidence Required

- [x] Cloud SQL instance running (db-f1-micro, PostgreSQL 15, private IP)
- [x] VPC Connector created and functional
- [x] Secret Manager configured with required secrets
- [x] Service accounts created with IAM roles assigned
- [x] Cloud Run service deployed and accessible via HTTPS
- [x] Cloud Scheduler jobs created and configured

## Task Breakdown

### TASK-003-001: Create GCP Project and Enable Required APIs

**Description:** Create or configure the GCP project and enable all required Google Cloud APIs.

**Acceptance Criteria:**
- GCP project exists with a valid project ID
- Required APIs are enabled:
  - Cloud SQL Admin API
  - Cloud Run API
  - Cloud Scheduler API
  - Secret Manager API
  - Serverless VPC Access API
  - Cloud Build API
  - Artifact Registry API
  - Cloud Logging API
  - Cloud Monitoring API
- Billing is enabled on the project
- Default region is set to `us-central1`

**BDD Scenario:**
```gherkin
Given I need to run the 3AA Monitoring Product on GCP
When I create/configure the GCP project
Then all required APIs should be enabled
And the project should have billing enabled
And the default region should be us-central1
```

**Implementation Commands:**
```bash
# Create project (if needed)
gcloud projects create PROJECT_ID --name="3AA Monitoring"

# Set default project
gcloud config set project PROJECT_ID

# Enable required APIs
gcloud services enable sqladmin.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable vpcaccess.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable monitoring.googleapis.com

# Set default region
gcloud config set run/region us-central1
```

**Verification:**
```bash
gcloud services list --enabled | grep -E '(sql|run|scheduler|secret|vpc|build|artifact|logging|monitoring)'
```

---

### TASK-003-002: Provision Cloud SQL PostgreSQL Instance

**Description:** Create and configure the Cloud SQL PostgreSQL 15 instance with appropriate sizing and backup configuration.

**Acceptance Criteria:**
- Cloud SQL instance created with name `aaa-db`
- PostgreSQL version 15
- Tier: db-f1-micro (1 vCPU, 3.75 GB RAM)
- Region: us-central1
- Storage: 10GB SSD with auto-increase enabled
- Private IP enabled (no public IP)
- Automated backups enabled (daily, 7-day retention)
- Point-in-time recovery enabled
- Database created: `aaa_production`

**BDD Scenario:**
```gherkin
Given I need a managed PostgreSQL database
When I provision the Cloud SQL instance
Then the instance should be running PostgreSQL 15
And the instance should have private IP only
And automated backups should be enabled
And the aaa_production database should exist
```

**Implementation Commands:**
```bash
# Create Cloud SQL instance
gcloud sql instances create aaa-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --network=default \
  --no-assign-ip \
  --storage-type=SSD \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup \
  --backup-start-time=06:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=6

# Create database
gcloud sql databases create aaa_production --instance=aaa-db

# Create database user
gcloud sql users create aaa_user --instance=aaa-db --password=GENERATED_PASSWORD
```

**Verification:**
```bash
gcloud sql instances describe aaa-db
gcloud sql databases list --instance=aaa-db
```

---

### TASK-003-003: Create VPC Connector for Cloud Run

**Description:** Create a Serverless VPC Access connector to enable private connectivity between Cloud Run and Cloud SQL.

**Acceptance Criteria:**
- VPC Connector created with name `aaa-vpc-connector`
- Region: us-central1
- Network: default VPC
- IP range: 10.8.0.0/28 (16 IPs)
- Machine type: e2-micro
- Min/max instances: 2/10
- Connector is in READY state

**BDD Scenario:**
```gherkin
Given Cloud Run needs to connect to Cloud SQL privately
When I create the VPC Connector
Then the connector should be in READY state
And Cloud Run should be able to use it for Cloud SQL connections
```

**Implementation Commands:**
```bash
# Create VPC Connector
gcloud compute networks vpc-access connectors create aaa-vpc-connector \
  --region=us-central1 \
  --network=default \
  --range=10.8.0.0/28 \
  --min-instances=2 \
  --max-instances=10 \
  --machine-type=e2-micro
```

**Verification:**
```bash
gcloud compute networks vpc-access connectors describe aaa-vpc-connector --region=us-central1
```

---

### TASK-003-004: Configure Secret Manager with Required Secrets

**Description:** Create secrets in Secret Manager for database credentials, API keys, and session secrets.

**Acceptance Criteria:**
- Secret Manager API enabled
- Secrets created:
  - `DATABASE_URL` - Cloud SQL connection string
  - `SESSION_SECRET` - Session cookie signing key
  - `TIINGO_API_KEY` - Tiingo API key (placeholder)
  - `FMP_API_KEY` - FMP API key (placeholder)
  - `ADMIN_API_KEY` - Admin API key (generated)
- All secrets have latest version set

**BDD Scenario:**
```gherkin
Given the application needs secure secret storage
When I create secrets in Secret Manager
Then all required secrets should exist
And secrets should be accessible only to authorized service accounts
```

**Implementation Commands:**
```bash
# Generate SESSION_SECRET
SESSION_SECRET=$(openssl rand -base64 32)

# Generate ADMIN_API_KEY
ADMIN_API_KEY=$(openssl rand -base64 32)

# Create DATABASE_URL secret
echo -n "postgresql://aaa_user:PASSWORD@/aaa_production?host=/cloudsql/PROJECT_ID:us-central1:aaa-db" | \
  gcloud secrets create DATABASE_URL --data-file=-

# Create SESSION_SECRET
echo -n "$SESSION_SECRET" | gcloud secrets create SESSION_SECRET --data-file=-

# Create API key placeholders
echo -n "PLACEHOLDER_TIINGO_KEY" | gcloud secrets create TIINGO_API_KEY --data-file=-
echo -n "PLACEHOLDER_FMP_KEY" | gcloud secrets create FMP_API_KEY --data-file=-

# Create ADMIN_API_KEY
echo -n "$ADMIN_API_KEY" | gcloud secrets create ADMIN_API_KEY --data-file=-
```

**Verification:**
```bash
gcloud secrets list
gcloud secrets versions access latest --secret=SESSION_SECRET
```

---

### TASK-003-005: Create Service Accounts and Assign IAM Roles

**Description:** Create service accounts for Cloud Run, Cloud Scheduler, and Cloud Build with appropriate IAM role assignments.

**Acceptance Criteria:**
- Service accounts created:
  - `aaa-web@PROJECT_ID.iam.gserviceaccount.com` (Cloud Run)
  - `aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com` (Cloud Scheduler)
  - `aaa-builder@PROJECT_ID.iam.gserviceaccount.com` (Cloud Build)
- IAM roles assigned:
  - aaa-web: `cloudsql.client`, `secretmanager.secretAccessor`, `logging.logWriter`
  - aaa-scheduler: `run.invoker`
  - aaa-builder: `run.admin`, `iam.serviceAccountUser`, `storage.admin`

**BDD Scenario:**
```gherkin
Given services need appropriate permissions
When I create service accounts with IAM roles
Then each service account should have only the required permissions
And services should be able to access their required resources
```

**Implementation Commands:**
```bash
# Create service accounts
gcloud iam service-accounts create aaa-web \
  --display-name="3AA Web Application"

gcloud iam service-accounts create aaa-scheduler \
  --display-name="3AA Cloud Scheduler"

gcloud iam service-accounts create aaa-builder \
  --display-name="3AA Cloud Build"

# Grant IAM roles to aaa-web
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:aaa-web@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:aaa-web@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:aaa-web@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Grant IAM roles to aaa-scheduler
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# Grant IAM roles to aaa-builder
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:aaa-builder@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:aaa-builder@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:aaa-builder@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

**Verification:**
```bash
gcloud iam service-accounts list --filter="email:aaa-*"
gcloud projects get-iam-policy aa-investor --flatten="bindings[].members" --filter="bindings.members:aaa-web OR bindings.members:aaa-scheduler OR bindings.members:aaa-builder"
```

---

### TASK-003-006: Deploy Initial Cloud Run Service with Health Check

**Description:** Deploy a minimal Cloud Run service with a health check endpoint to validate infrastructure connectivity.

**Acceptance Criteria:**
- Cloud Run service named `aaa-web` is deployed
- Service has health check endpoint at `/api/health`
- Service uses `aaa-web` service account
- Service has VPC connector attached
- Service has secrets mounted as environment variables
- Service is accessible via HTTPS
- Health check returns 200 OK

**BDD Scenario:**
```gherkin
Given I need to verify Cloud Run infrastructure
When I deploy a minimal service with health check
Then the service should be accessible via HTTPS
And the health check endpoint should return 200 OK
And the service should be able to connect to Cloud SQL
```

**Implementation Approach:**
This task will create a minimal Dockerfile and Next.js app with health check endpoint, build the Docker image, and deploy to Cloud Run. Full implementation will be done in STORY-008, but this task creates the initial deployment to verify infrastructure.

**Verification:**
```bash
gcloud run services describe aaa-web --region=us-central1
curl https://aaa-web-717628686883.us-central1.run.app/api/health
# Expected: {"status":"healthy","timestamp":"...","service":"3aa-web"}
```

---

### TASK-003-007: Configure Cloud Scheduler Jobs for Nightly Batch

**Description:** Create 6 Cloud Scheduler jobs to orchestrate the nightly batch processing pipeline.

**Acceptance Criteria:**
- 6 Cloud Scheduler jobs created:
  - `price-sync` - Daily 5pm ET (Mon-Fri)
  - `fundamentals-sync` - Daily 6pm ET (Mon-Fri)
  - `estimates-sync` - Daily 7pm ET (Mon-Fri)
  - `classification` - Daily 8pm ET (Mon-Fri)
  - `valuation` - Daily 8:15pm ET (Mon-Fri)
  - `alerts` - Daily 8:30pm ET (Mon-Fri)
- All jobs use OIDC authentication with `aaa-scheduler` service account
- All jobs target placeholder Cloud Run endpoints
- All jobs are in ENABLED state

**BDD Scenario:**
```gherkin
Given the nightly batch pipeline needs orchestration
When I create Cloud Scheduler jobs
Then 6 jobs should be created with correct schedules
And all jobs should use OIDC authentication
And all jobs should be enabled
```

**Implementation Commands:**
```bash
# Get Cloud Run service URL
SERVICE_URL=$(gcloud run services describe aaa-web --region=us-central1 --format='value(status.url)')

# Create price-sync job (5pm ET Mon-Fri)
gcloud scheduler jobs create http price-sync \
  --location=us-central1 \
  --schedule="0 17 * * 1-5" \
  --time-zone="America/New_York" \
  --uri="${SERVICE_URL}/api/cron/price-sync" \
  --http-method=POST \
  --oidc-service-account-email=aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com \
  --oidc-token-audience="${SERVICE_URL}" \
  --description="Daily price sync after market close (5pm ET Mon-Fri)"

# Create fundamentals-sync job (6pm ET Mon-Fri)
gcloud scheduler jobs create http fundamentals-sync \
  --location=us-central1 \
  --schedule="0 18 * * 1-5" \
  --time-zone="America/New_York" \
  --uri="${SERVICE_URL}/api/cron/fundamentals" \
  --http-method=POST \
  --oidc-service-account-email=aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com \
  --oidc-token-audience="${SERVICE_URL}" \
  --description="Daily fundamentals sync (6pm ET Mon-Fri)"

# Create estimates-sync job (7pm ET Mon-Fri)
gcloud scheduler jobs create http estimates-sync \
  --location=us-central1 \
  --schedule="0 19 * * 1-5" \
  --time-zone="America/New_York" \
  --uri="${SERVICE_URL}/api/cron/estimates" \
  --http-method=POST \
  --oidc-service-account-email=aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com \
  --oidc-token-audience="${SERVICE_URL}" \
  --description="Daily estimates sync (7pm ET Mon-Fri)"

# Create classification job (8pm ET Mon-Fri)
gcloud scheduler jobs create http classification \
  --location=us-central1 \
  --schedule="0 20 * * 1-5" \
  --time-zone="America/New_York" \
  --uri="${SERVICE_URL}/api/cron/classification" \
  --http-method=POST \
  --oidc-service-account-email=aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com \
  --oidc-token-audience="${SERVICE_URL}" \
  --description="Daily classification run (8pm ET Mon-Fri)"

# Create valuation job (8:15pm ET Mon-Fri)
gcloud scheduler jobs create http valuation \
  --location=us-central1 \
  --schedule="15 20 * * 1-5" \
  --time-zone="America/New_York" \
  --uri="${SERVICE_URL}/api/cron/valuation" \
  --http-method=POST \
  --oidc-service-account-email=aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com \
  --oidc-token-audience="${SERVICE_URL}" \
  --description="Daily valuation run (8:15pm ET Mon-Fri)"

# Create alerts job (8:30pm ET Mon-Fri)
gcloud scheduler jobs create http alerts \
  --location=us-central1 \
  --schedule="30 20 * * 1-5" \
  --time-zone="America/New_York" \
  --uri="${SERVICE_URL}/api/cron/alerts" \
  --http-method=POST \
  --oidc-service-account-email=aaa-scheduler@PROJECT_ID.iam.gserviceaccount.com \
  --oidc-token-audience="${SERVICE_URL}" \
  --description="Daily alerts run (8:30pm ET Mon-Fri)"
```

**Verification:**
```bash
gcloud scheduler jobs list --location=us-central1
```

---

### TASK-003-008: Verify Infrastructure and Update Implementation Tracking

**Description:** Verify all infrastructure components are operational and update implementation tracking documents.

**Acceptance Criteria:**
- Cloud SQL instance is accessible and responsive
- VPC Connector is in READY state
- Secret Manager secrets are accessible
- Service accounts have correct IAM roles
- Cloud Run service returns 200 from health check
- All 6 Cloud Scheduler jobs are created and enabled
- IMPLEMENTATION-PLAN-V1.md updated with STORY-003 status = done
- IMPLEMENTATION-LOG.md updated with completion entry
- stories/README.md updated with progress (3/9 complete)
- Git commit created with proper traceability tags

**BDD Scenario:**
```gherkin
Given all infrastructure components have been provisioned
When I verify the infrastructure
Then all components should be operational
And the health check should pass
And implementation tracking should be updated
```

**Verification Commands:**
```bash
# Verify Cloud SQL
gcloud sql instances describe aaa-db --format="value(state)"

# Verify VPC Connector
gcloud compute networks vpc-access connectors describe aaa-vpc-connector --region=us-central1 --format="value(state)"

# Verify Secret Manager
gcloud secrets list --format="table(name)"

# Verify Service Accounts
gcloud iam service-accounts list --filter="email:3aa-*"

# Verify Cloud Run
SERVICE_URL=$(gcloud run services describe aaa-web --region=us-central1 --format='value(status.url)')
curl -s -o /dev/null -w "%{http_code}" ${SERVICE_URL}/api/health

# Verify Cloud Scheduler
gcloud scheduler jobs list --location=us-central1 --format="table(name,state,schedule)"
```

---

## Traceability

**PRD Reference:** Section 9C (Deployment & Platform Architecture)
**RFC Reference:** RFC-006 (Platform & Deployment Architecture)
**ADR References:**
- ADR-008 (Platform Choice - Google Cloud)
- ADR-009 (Application Architecture - Modular Monolith)
- ADR-010 (Technology Stack - TypeScript + Next.js + Prisma)
- ADR-002 (V1 Orchestration - Nightly Batch)

---

**Created:** 2026-04-19
**Last Updated:** 2026-04-20 04:50 UTC
**Completed:** 2026-04-20 04:50 UTC
