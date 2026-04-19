# Platform & Deployment Architecture - COMPLETION REPORT

**Date:** 2026-04-19
**Status:** ✅ COMPLETE

---

## Executive Summary

All platform, stack, and deployment architecture documentation has been created and integrated with the existing PRD/RFC/ADR set.

**Result:** V1 is fully specified and ready for autonomous Claude deployment to Google Cloud Platform.

---

## New Documentation Created

### ADRs (4 new decisions)

1. **ADR-008: Platform Choice - Google Cloud**
   - Decision: Use Google Cloud Platform for V1
   - Services: Cloud Run, Cloud SQL, Cloud Scheduler, Secret Manager, Cloud Build
   - Rationale: Existing account, simpler managed services, appropriate scale
   - File: `/docs/adr/ADR-008-platform-choice-google-cloud.md`

2. **ADR-009: Application Architecture - Modular Monolith**
   - Decision: Build as modular monolith (not microservices)
   - Module boundaries: classification, valuation, monitoring, auth, data-ingestion
   - Rationale: V1 scale, operational simplicity, single deployment unit
   - File: `/docs/adr/ADR-009-application-architecture-modular-monolith.md`

3. **ADR-010: Technology Stack - TypeScript + Next.js + Prisma**
   - Decision: TypeScript 5.x + Next.js 14+ + Prisma 5.x + Postgres 15
   - Rationale: Type safety, full-stack framework, best-in-class ORM
   - File: `/docs/adr/ADR-010-technology-stack-typescript-nextjs-prisma.md`

4. **ADR-011: Authentication Strategy - Custom Email/Password**
   - Decision: Custom email/password auth (bcrypt + session cookies)
   - Rationale: PRD specifies email/password only, simpler than NextAuth/Clerk
   - File: `/docs/adr/ADR-011-authentication-strategy-custom-email-password.md`

### RFC (1 comprehensive specification)

5. **RFC-006: Application Platform & Deployment Architecture**
   - Comprehensive platform/stack/deployment specification
   - Cloud architecture diagram
   - Deployment pipeline (Cloud Build → Cloud Run)
   - Background job orchestration (Cloud Scheduler)
   - Observability baseline
   - Development workflow
   - Security configuration
   - Cost estimation ($40-130/month for V1)
   - File: `/docs/rfc/RFC-006-platform-deployment-architecture.md`

### Existing Docs Patched (2 files)

6. **ADR-002 (Nightly Batch Orchestration):**
   - Added "Platform Implementation" section
   - Cloud Scheduler job configuration
   - HTTP endpoint mapping
   - OIDC authentication pattern
   - Reference to RFC-006

7. **PRD (Product Requirements):**
   - Added Section 9C: Deployment & Platform Architecture
   - Brief summary of cloud platform, stack, deployment model
   - References to RFC-006 and ADR-008/009/010/011

---

## Stack Summary

### Cloud Platform
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Cloud Provider** | Google Cloud | Existing account, simpler services, appropriate scale |
| **Web Hosting** | Cloud Run | Serverless containers, auto-scaling, pay-per-use |
| **Database** | Cloud SQL (Postgres 15) | Managed, automatic backups, HA options |
| **Background Jobs** | Cloud Scheduler | Managed cron, triggers Cloud Run |
| **Secrets** | Secret Manager | Secure secret storage |
| **CI/CD** | Cloud Build | Auto-deploy on git push |
| **Observability** | Cloud Logging + Monitoring | Automatic with Cloud Run |

### Application Stack
| Component | Technology | Version |
|-----------|-----------|---------|
| **Language** | TypeScript | 5.x |
| **Runtime** | Node.js | 20.x LTS |
| **Framework** | Next.js (App Router) | 14.x+ |
| **UI Library** | React | 18.x |
| **ORM** | Prisma | 5.x |
| **Database** | PostgreSQL | 15.x |
| **CSS** | Tailwind CSS | 3.x |
| **Testing** | Vitest + Testing Library | Latest |

### Architecture Pattern
- **Modular Monolith:** Single Next.js app, single Cloud Run service, single Postgres database
- **Module Boundaries:** classification, valuation, monitoring, auth, data-ingestion, shared
- **In-Process Communication:** Direct function calls (not HTTP between modules)

---

## Deployment Pipeline

### Build & Deploy (Cloud Build)
```
git push origin main
  ↓
Cloud Build Trigger
  ↓
1. npm install
2. npm run test
3. npx prisma generate
4. npm run build
5. docker build
6. docker push (Artifact Registry)
7. gcloud run deploy
8. Run database migrations (Cloud Run job)
  ↓
Live on Cloud Run (auto-scaling, HTTPS)
```

### Background Jobs (Cloud Scheduler)
```
Cloud Scheduler (cron)
  ↓
Triggers Cloud Run HTTP endpoint (/api/cron/*)
  ↓
Verifies OIDC token
  ↓
Runs background job logic
  ↓
Returns JSON response (success/failure)
  ↓
Cloud Logging captures execution logs
```

**Schedule:**
- 5:00pm ET: Price sync
- 6:00pm ET: Fundamentals sync
- 7:00pm ET: Forward estimates sync
- 8:00pm ET: Classification recompute
- 8:15pm ET: Valuation recompute
- 8:30pm ET: Per-user alert generation

---

## Architecture Decisions Summary

### Cloud Platform (ADR-008)
**Decision:** Google Cloud Platform

**Why:**
- ✅ Existing account (lower friction)
- ✅ Simpler managed services than AWS
- ✅ "Good defaults" philosophy (fewer knobs)
- ✅ Cloud Run simpler than AWS ECS/Fargate
- ✅ Cloud Scheduler simpler than EventBridge + Lambda
- ✅ Appropriate for 10-10K users

**Why NOT AWS:**
- ❌ More complex service landscape
- ❌ No existing account
- ❌ Higher operational burden

### Application Architecture (ADR-009)
**Decision:** Modular Monolith

**Why:**
- ✅ Operational simplicity (single deployment)
- ✅ V1 scale doesn't need microservices
- ✅ Clear module boundaries (easy to extract later)
- ✅ Database transaction simplicity
- ✅ No network latency between modules

**Why NOT Microservices:**
- ❌ Adds complexity (distributed transactions, service discovery)
- ❌ V1 doesn't need independent scaling
- ❌ Higher cost (5+ services vs 1)

### Technology Stack (ADR-010)
**Decision:** TypeScript + Next.js + Prisma

**Why:**
- ✅ Type safety (critical for complex business logic)
- ✅ Full-stack framework (frontend + backend in one codebase)
- ✅ Excellent ORM (type-safe queries, declarative migrations)
- ✅ Cloud Run deployment (Next.js standalone mode)
- ✅ Familiar to Claude (autonomy goal)

**Why NOT Python:**
- ❌ Weaker type system
- ❌ No full-stack framework (FastAPI is backend-only)
- ❌ V1 doesn't need data science/ML

**Why NOT Go:**
- ❌ Learning curve, smaller ecosystem
- ❌ Overkill for V1 (performance not bottleneck)

### Authentication (ADR-011)
**Decision:** Custom email/password auth

**Why:**
- ✅ PRD specifies email/password only (no social login)
- ✅ Simpler than NextAuth.js for email/password only
- ✅ Full control (session duration, password rules)
- ✅ No external dependencies (Clerk, Auth0)
- ✅ <200 lines of code

**Why NOT NextAuth.js:**
- ❌ OAuth-first design (V1 doesn't use OAuth)
- ❌ More complexity than needed

**Why NOT Clerk:**
- ❌ External SaaS dependency
- ❌ Cost ($25/month per 1K MAU beyond free tier)
- ❌ Overkill (V1 doesn't need 2FA, SSO)

---

## Cost Estimation

### V1 (100 users)
- Cloud Run: ~$10/month
- Cloud SQL (db-f1-micro): ~$20/month
- VPC Connector: ~$10/month
- Cloud Scheduler: Free
- Secret Manager: Free
- Cloud Build: Free tier
- Cloud Logging: Free tier
- **Total: ~$40/month**

### V1 (1000 users)
- Cloud Run: ~$50/month
- Cloud SQL (db-g1-small): ~$50/month
- VPC Connector: ~$10/month
- Cloud Logging: ~$20/month
- **Total: ~$130/month**

**Scaling:** Cost scales sub-linearly with users (Cloud Run auto-scales, Cloud SQL scales vertically).

---

## Operational Characteristics

### Deployment
- **Frequency:** On-demand (git push to main)
- **Duration:** ~10-15 minutes (build + deploy)
- **Rollback:** <5 minutes (revert to previous Cloud Run revision)

### Background Jobs
- **Nightly Batch:** 5:00pm - 9:00pm ET (Monday-Friday)
- **Total Duration:** <30 minutes (1000 stocks)
- **Failure Handling:** Cloud Scheduler retry + manual operator intervention

### Observability
- **Logs:** Cloud Logging (automatic)
- **Metrics:** Cloud Monitoring (request count, latency, errors)
- **Uptime:** Cloud Monitoring uptime checks (5-minute intervals)
- **Error Tracking:** Optional Sentry integration

### Disaster Recovery
- **Database Backups:** Automated daily (7-day retention)
- **Point-in-Time Recovery:** Yes (transaction logs)
- **Application Rollback:** Cloud Run revision rollback (<5 min)
- **RTO:** <1 hour
- **RPO:** <24 hours

---

## Development Workflow

### Local Development
```bash
# Clone repository
git clone https://github.com/USER/3aa-monitoring.git
cd 3aa-monitoring

# Install dependencies
npm install

# Setup local Postgres
docker run --name 3aa-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15

# Create .env.local with API keys
cp .env.example .env.local

# Run migrations
npx prisma migrate dev

# Start dev server
npm run dev

# Open browser: http://localhost:3000
```

### Testing
```bash
npm run test              # Run tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run type-check        # TypeScript check
npm run lint              # ESLint
```

### Deployment
```bash
# Automatic: Push to main
git push origin main

# Manual: Deploy from local
gcloud builds submit --config cloudbuild.yaml

# View logs
gcloud logs tail --service=3aa-web

# Rollback
gcloud run services update-traffic 3aa-web --to-revisions=PREVIOUS_REVISION=100
```

---

## Security Configuration

### Secrets (Secret Manager)
- `DATABASE_URL` - Cloud SQL connection string
- `SESSION_SECRET` - Session cookie signing key
- `TIINGO_API_KEY` - Tiingo API key
- `FMP_API_KEY` - FMP API key
- `ADMIN_API_KEY` - Admin API key

### Authentication Security
- **Password Hashing:** bcrypt (salt rounds: 10)
- **Session Cookies:** HTTP-only, Secure, SameSite=Lax
- **Session Duration:** 7 days (per PRD)
- **Rate Limiting:** 5 sign-in attempts per 15 minutes

### Network Security
- **VPC Connector:** Cloud Run → Cloud SQL private connection
- **No Public Database:** Cloud SQL private IP only
- **HTTPS:** Automatic (Cloud Run managed SSL)

### IAM (Service Accounts)
- `3aa-web`: Cloud Run service (roles: cloudsql.client, secretmanager.secretAccessor)
- `3aa-scheduler`: Cloud Scheduler (roles: run.invoker)
- `3aa-builder`: Cloud Build (roles: run.admin, storage.admin)

---

## Alignment with User Preferences

### ✅ Autonomous Claude Deployment
- Well-documented, common patterns
- TypeScript/Next.js/GCP familiar to Claude
- Minimal manual intervention needed
- Cloud Build auto-deploys on git push

### ✅ Minimal Operational Burden
- Managed services (Cloud Run, Cloud SQL, Cloud Scheduler)
- No server management
- Auto-scaling (0-10 instances)
- Automatic backups, logging, monitoring

### ✅ Expected Scale
- Optimized for 10-100 users initially
- Headroom for 10K users (Cloud Run scales)
- Cost-effective ($40-130/month for V1)

### ✅ Cloud Preference
- Google Cloud chosen (existing account)
- Services selected for out-of-the-box simplicity
- Less operational complexity than AWS

### ✅ Product Shape
- classify → value → monitor → alert → inspect
- V1 scope preserved (no TSR, no portfolio, no execution)

### ✅ Architectural Preference
- Modular monolith (single app, single DB, single deployment)
- Simple auth (custom email/password)
- Simple scheduler (Cloud Scheduler)
- Clean deployment pipeline (Cloud Build)

---

## Documentation Consistency Verified

- [x] All platform decisions documented (ADRs 008-011)
- [x] Comprehensive deployment specification (RFC-006)
- [x] Existing ADRs patched (ADR-002 with Cloud Scheduler)
- [x] PRD patched (Section 9C deployment summary)
- [x] All references consistent (RFC ↔ ADR cross-links)
- [x] Technology stack aligned with domain architecture (RFCs 001-005)
- [x] Multi-user architecture consistent (ADR-007 ↔ RFC-006)
- [x] Nightly batch orchestration aligned (ADR-002 ↔ RFC-006)

---

## Ready for Implementation

**All platform/deployment architecture is complete.** V1 is fully specified for:

- ✅ Cloud platform (Google Cloud)
- ✅ Application stack (TypeScript + Next.js + Prisma)
- ✅ Deployment model (Cloud Run + Cloud SQL + Cloud Scheduler)
- ✅ Authentication (Custom email/password)
- ✅ Background jobs (Cloud Scheduler → Cloud Run)
- ✅ Observability (Cloud Logging + Monitoring)
- ✅ Security (Secret Manager, IAM, VPC)
- ✅ Development workflow (local dev, testing, deployment)
- ✅ Cost estimation ($40-130/month)

**Next Steps:**
1. Create GCP project (`3aa-monitoring-v1`)
2. Setup Cloud SQL instance (`3aa-db`)
3. Setup Secret Manager secrets
4. Create GitHub repository
5. Configure Cloud Build trigger
6. Begin application development (follow ADR-009 module structure)
7. Deploy to Cloud Run
8. Configure Cloud Scheduler jobs

**Estimated Setup Time:** 1-2 days (project setup, infrastructure provisioning)
**Estimated Development Time:** 4-8 weeks (full V1 implementation)

---

**END PLATFORM DEPLOYMENT COMPLETION REPORT**
