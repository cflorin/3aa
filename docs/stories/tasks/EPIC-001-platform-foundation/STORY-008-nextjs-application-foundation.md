# STORY-008 — Implement Next.js Application Foundation with Health Check

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Initialize Next.js 14+ application structure with TypeScript, Prisma Client integration, health check endpoint, placeholder cron endpoints, and basic configuration to serve as foundation for all V1 features.

## Story
As a **developer**,
I want **Next.js application initialized with TypeScript, Prisma, and health check endpoint**,
so that **the application can deploy to Cloud Run, connect to database, and serve as foundation for feature development**.

## Outcome
- Next.js 14+ project initialized with TypeScript 5.x
- Prisma Client integrated and configured
- Health check endpoint functional (/api/health → 200 OK)
- Placeholder cron endpoints functional (6 endpoints return 200 OK)
- Database connectivity verified (Prisma can query database)
- Application runs locally (npm run dev)
- Dockerfile created for Cloud Run deployment
- Application deploys to Cloud Run manually (initial deployment, automated CI/CD in STORY-006)
- Environment variables configured (.env.example, Secret Manager integration)

## Scope In
- Initialize Next.js 14+ project (npx create-next-app@latest)
- Configure TypeScript 5.x (tsconfig.json)
- Install Prisma Client (`npm install @prisma/client`)
- Configure Prisma Client generation (npx prisma generate)
- Create health check endpoint (`/api/health` → GET → 200 OK, JSON: {status: "ok", timestamp, database: "connected"})
- Create 6 placeholder cron endpoints (POST /api/cron/{price-sync, fundamentals-sync, estimates-sync, classification-recompute, valuation-recompute, alerts-generation} → 200 OK, JSON: {status: "ok", job: string})
- Implement OIDC authentication middleware for cron endpoints (verify Cloud Scheduler service account)
- Configure environment variables (DATABASE_URL from Secret Manager or .env)
- Test database connectivity (health check queries database with Prisma Client)
- Create npm scripts (dev, build, start, test)
- Configure .env.example (template for local development)
- Create Dockerfile (multi-stage build for Next.js production deployment)
- Create .dockerignore (exclude node_modules, .env, .git from Docker image)
- Manual deployment to Cloud Run (initial deployment, gcloud run deploy command)

## Scope Out
- Business logic (classification, valuation, alerts - later epics)
- UI screens (Sign-In, Universe, Alerts - later epics)
- Authentication (email/password sign-in - EPIC-002)
- Data ingestion (provider adapters - EPIC-003)
- Advanced middleware (rate limiting, logging - deferred)
- Testing framework setup (Jest, Playwright - deferred to feature stories)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFCs:** RFC-006 (Platform & Deployment Architecture)
- **ADRs:** ADR-010 (TypeScript + Next.js + Prisma), ADR-008 (Google Cloud)
- **Upstream stories:** STORY-003 (Cloud SQL database), STORY-004 (Prisma schema and migrations)

## Preconditions
- Node.js 18+ installed locally
- npm or yarn installed
- Prisma schema exists (STORY-004 completed)
- DATABASE_URL available (from Secret Manager or local .env)
- Cloud SQL database running (STORY-003 completed)

## Inputs
- Prisma schema (`prisma/schema.prisma`)
- DATABASE_URL (connection string)
- Cloud Scheduler service account email (for OIDC verification)
- Cloud Run service URL (for OIDC audience validation)

## Outputs
- Next.js application in `/src` directory
- Health check endpoint (`/api/health`)
- 6 placeholder cron endpoints (`/api/cron/*`)
- OIDC authentication middleware (`/src/middleware/oidc-auth.ts`)
- Environment variable configuration (`.env.example`)
- npm scripts (dev, build, start, test in package.json)
- Application running on Cloud Run (after CI/CD deployment)

## Acceptance Criteria
- [ ] Next.js 14+ project initialized (package.json with next@14.x, react@18.x, typescript@5.x)
- [ ] TypeScript configured (tsconfig.json with strict mode enabled)
- [ ] Prisma Client installed and generated (npx prisma generate succeeds)
- [ ] Health check endpoint implemented (GET /api/health → 200 OK, JSON: {status: "ok", timestamp: ISO8601, database: "connected" | "disconnected"})
- [ ] Health check queries database (Prisma Client queries `framework_version` table to verify connectivity)
- [ ] 6 placeholder cron endpoints implemented (POST /api/cron/{price-sync, fundamentals-sync, estimates-sync, classification-recompute, valuation-recompute, alerts-generation} → 200 OK, JSON: {status: "ok", job: string, timestamp: ISO8601})
- [ ] OIDC authentication middleware implemented (verifies Cloud Scheduler service account, extracts claims, validates audience)
- [ ] Cron endpoints protected with OIDC middleware (requests without valid OIDC token → 401 Unauthorized)
- [ ] Environment variables configured (DATABASE_URL from process.env)
- [ ] .env.example created (template with DATABASE_URL, NODE_ENV)
- [ ] npm scripts functional (npm run dev starts dev server, npm run build builds production, npm run start starts production server)
- [ ] Application runs locally (npm run dev → http://localhost:3000 → Next.js default page or placeholder)
- [ ] Database connectivity tested (health check endpoint queries database successfully)
- [ ] Application deploys to Cloud Run (via STORY-006 CI/CD, health check accessible at Cloud Run URL)

## Test Strategy Expectations

**Unit tests:**
- Health check endpoint logic (returns correct JSON structure, timestamp is ISO8601)
- OIDC middleware logic (extracts token from Authorization header, validates audience, verifies signature)
- Environment variable loading (DATABASE_URL loaded from process.env)

**Integration tests:**
- Health check endpoint (GET /api/health → 200 OK, database: "connected")
- Health check with database down (Cloud SQL unreachable → 200 OK, database: "disconnected")
- Cron endpoint with valid OIDC token (POST /api/cron/price-sync with valid token → 200 OK)
- Cron endpoint with invalid OIDC token (POST /api/cron/price-sync with no token → 401 Unauthorized)
- Cron endpoint with expired OIDC token (POST /api/cron/price-sync with expired token → 401 Unauthorized)
- Database query via Prisma Client (health check queries framework_version table → version: "1.0.0" returned)

**Contract/schema tests:**
- Health check response schema (validate JSON: {status: string, timestamp: string, database: string})
- Cron endpoint response schema (validate JSON: {status: string, job: string, timestamp: string})
- OIDC token structure (validate JWT claims: iss, sub, aud, exp, iat)

**BDD acceptance tests:**
- "Given Next.js application running, when GET /api/health, then 200 OK with status 'ok' and database 'connected'"
- "Given database unreachable, when GET /api/health, then 200 OK with database 'disconnected'"
- "Given valid OIDC token, when POST /api/cron/price-sync, then 200 OK with job 'price-sync'"
- "Given no OIDC token, when POST /api/cron/price-sync, then 401 Unauthorized"

**E2E tests:**
- Full deployment workflow (push to GitHub → Cloud Build → deploy to Cloud Run → GET Cloud Run URL/api/health → 200 OK)
- Cloud Scheduler integration (manual trigger price-sync job → Cloud Run receives request with OIDC token → 200 OK)

## Regression / Invariant Risks

**Database connection failure:**
- Risk: Prisma Client cannot connect to Cloud SQL (VPC Connector misconfigured, DATABASE_URL incorrect)
- Protection: Health check endpoint tests connectivity, integration test validates database connection

**OIDC authentication bypass:**
- Risk: Cron endpoint accepts requests without OIDC token (middleware not applied)
- Protection: Integration test validates 401 Unauthorized without token, middleware applied to all /api/cron/* routes

**Environment variable missing:**
- Risk: DATABASE_URL not set, application crashes on startup
- Protection: Validation on startup (check DATABASE_URL present, exit with error if missing)

**Health check false positive:**
- Risk: Health check returns 200 OK but database is unreachable (no actual query executed)
- Protection: Health check must query database (SELECT version FROM framework_version), not just return static response

**OIDC token validation insufficient:**
- Risk: Middleware accepts tokens from wrong service account or invalid audience
- Protection: OIDC middleware validates issuer, audience, signature, integration test verifies rejection of invalid tokens

**Invariants to protect:**
- Health check always queries database (not static response)
- Cron endpoints always protected with OIDC authentication (no unauthenticated access)
- DATABASE_URL always from environment variable (never hardcoded)
- Application always starts production server on Cloud Run (not dev server)
- Prisma Client always generated from schema (npx prisma generate run before deployment)

## Key Risks / Edge Cases

**Next.js configuration edge cases:**
- App Router vs Pages Router (use App Router for Next.js 14+)
- TypeScript strict mode (enable strict, any types discouraged)
- Environment variable precedence (.env.local > .env, Secret Manager in production)

**Prisma Client edge cases:**
- Client not generated (npx prisma generate not run, import fails)
- Client version mismatch (Prisma Client version != Prisma CLI version, runtime errors)
- Connection pool exhausted (default pool size 10, Cloud SQL db-f1-micro supports 25 connections)

**OIDC authentication edge cases:**
- Token signature verification (use Google's public keys, cache keys, refresh on rotation)
- Token expiration during request (token valid when received, expired mid-processing, acceptable)
- Service account key rotation (Cloud Scheduler uses workload identity, no key rotation needed)
- Audience mismatch (token audience != Cloud Run URL, reject)

**Health check edge cases:**
- Database query timeout (Prisma query timeout, health check returns 500 or database: "timeout")
- Database read-only (Cloud SQL maintenance mode, query succeeds but writes fail, health check OK)
- Multiple database connections (health check queries multiple times, connection pooling handles)

**Cloud Run deployment edge cases:**
- Container startup timeout (application takes >60s to start, Cloud Run kills container)
- Health check during startup (Cloud Run queries /api/health before Prisma Client ready, return 503 or handle gracefully)
- Environment variable propagation delay (Secret Manager secret updated, Cloud Run uses old value until redeployed)

## Definition of Done

- [ ] Next.js 14+ application initialized with TypeScript 5.x
- [ ] Prisma Client integrated and configured
- [ ] Health check endpoint implemented and tested (GET /api/health → 200 OK, database connected)
- [ ] 6 placeholder cron endpoints implemented and tested (return 200 OK)
- [ ] OIDC authentication middleware implemented and tested (401 Unauthorized without valid token)
- [ ] Database connectivity verified (health check queries framework_version table successfully)
- [ ] Application runs locally (npm run dev → http://localhost:3000)
- [ ] Application deploys to Cloud Run (via CI/CD, accessible at Cloud Run URL)
- [ ] Environment variables configured (.env.example created, DATABASE_URL from Secret Manager in production)
- [ ] .dockerignore created (node_modules, .env, .git excluded)
- [ ] Integration tests added and passing (health check, cron endpoints, OIDC auth)
- [ ] Traceability links recorded (code comments reference ADR-010, RFC-006)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFC:** RFC-006 (Platform & Deployment Architecture)
- **ADR:** ADR-010 (TypeScript + Next.js + Prisma), ADR-008 (Google Cloud)

---

**END STORY-008**
