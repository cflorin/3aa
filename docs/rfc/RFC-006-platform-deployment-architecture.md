# RFC-006: Application Platform & Deployment Architecture

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-19
**Dependencies:** RFC-002 (Data Model), ADR-008 (GCP), ADR-009 (Modular Monolith), ADR-010 (Tech Stack), ADR-011 (Auth)
**Creates New Decisions:** YES (platform, deployment, orchestration)
**Refines Existing:** ADR-002 (Nightly Batch)

---

## Context / Problem

The 3AA Monitoring Product V1 has defined:
- **Product requirements** (PRD)
- **Domain architecture** (RFCs 001-005: Classification, Valuation, Monitoring, Data Ingestion, Alerts)
- **Data model** (RFC-002: Postgres schemas)
- **Multi-user architecture** (ADR-007)

**Missing:** Platform, stack, and deployment architecture needed to run the system live.

**The Question:** How should V1 be deployed, orchestrated, and operated?

### V1 Requirements

**Constraints:**
- Autonomous Claude deployment (minimal manual intervention)
- Minimal operational burden (no server management)
- Appropriate scale (10-100 users, potentially 10K later)
- Simple, reliable, low-ops

**Product:**
- Authenticated web app (5 screens: Sign-in, Universe, Alerts, Inspection, Settings)
- Nightly batch processing (classify → value → monitor → alert)
- Multi-user with user isolation (ADR-007)

**Architecture:**
- Modular monolith (ADR-009: single deployment unit)
- Postgres database (RFC-002 schemas)
- Background jobs (nightly batch, ADR-002)

---

## Goals

1. Define cloud platform and core services
2. Specify application technology stack
3. Design deployment pipeline (build, test, deploy)
4. Specify background job orchestration (nightly batch)
5. Define observability baseline (logging, monitoring, error tracking)
6. Document development workflow
7. Specify security configuration
8. Define environment strategy (dev, prod)

---

## Non-Goals

1. Microservices architecture (ADR-009: modular monolith)
2. Kubernetes/GKE (Cloud Run sufficient for V1)
3. Complex CI/CD (Cloud Build sufficient)
4. Advanced observability (distributed tracing, APM) - V1 uses GCP built-ins
5. Multi-region deployment (V1 is single-region US)

---

## Platform Architecture

### Cloud Platform: Google Cloud (ADR-008)

**Core Services:**

| Service | Purpose | Why |
|---------|---------|-----|
| **Cloud Run** | Web app + background jobs | Serverless containers, auto-scaling, pay-per-use |
| **Cloud SQL (Postgres)** | Database | Managed Postgres, automatic backups, HA |
| **Cloud Scheduler** | Nightly batch triggers | Managed cron, triggers Cloud Run jobs |
| **Secret Manager** | API keys, secrets | Secure secret storage, integrates with Cloud Run |
| **Cloud Build** | CI/CD | Docker builds, auto-deploy to Cloud Run |
| **Cloud Logging** | Application logs | Automatic with Cloud Run |
| **Cloud Monitoring** | Metrics, uptime | Automatic with Cloud Run |
| **Artifact Registry** | Docker images | Docker image storage |
| **VPC** | Private networking | Cloud SQL → Cloud Run private connection |

**Architecture Diagram:**

```
┌─────────────────────────────────────────────────────────────────┐
│                         Google Cloud                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                      Cloud Run                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │  3aa-web (Next.js App)                               │ │ │
│  │  │                                                      │ │ │
│  │  │  ├─ Frontend (React Server Components)              │ │ │
│  │  │  ├─ API Routes (/api/*)                             │ │ │
│  │  │  ├─ Auth (Middleware, Session Management)           │ │ │
│  │  │  └─ Background Job Endpoints (/api/cron/*)          │ │ │
│  │  │                                                      │ │ │
│  │  │  Modules:                                            │ │ │
│  │  │  ├─ classification/                                  │ │ │
│  │  │  ├─ valuation/                                       │ │ │
│  │  │  ├─ monitoring/                                      │ │ │
│  │  │  ├─ data-ingestion/                                  │ │ │
│  │  │  └─ auth/                                            │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                           │ VPC Connector                        │
│                           ↓                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │             Cloud SQL (Postgres 15)                       │ │
│  │                                                           │ │
│  │  Database: 3aa_monitoring                                 │ │
│  │  Instance: db-f1-micro (1 vCPU, 3.75 GB RAM)            │ │
│  │  Storage: 10 GB SSD                                      │ │
│  │  Backups: Automated (daily, 7-day retention)            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Cloud Scheduler                         │ │
│  │                                                           │ │
│  │  Jobs:                                                    │ │
│  │  ├─ price-sync         → /api/cron/price-sync (5pm ET)  │ │
│  │  ├─ fundamentals-sync  → /api/cron/fundamentals (6pm)   │ │
│  │  ├─ estimates-sync     → /api/cron/estimates (7pm)      │ │
│  │  ├─ classification     → /api/cron/classification (8pm) │ │
│  │  ├─ valuation          → /api/cron/valuation (8:15pm)   │ │
│  │  └─ alerts             → /api/cron/alerts (8:30pm)      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  Secret Manager                           │ │
│  │                                                           │ │
│  │  Secrets:                                                 │ │
│  │  ├─ DATABASE_URL                                         │ │
│  │  ├─ SESSION_SECRET                                       │ │
│  │  ├─ TIINGO_API_KEY                                       │ │
│  │  ├─ FMP_API_KEY                                          │ │
│  │  └─ ADMIN_API_KEY                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Cloud Build                             │ │
│  │                                                           │ │
│  │  Trigger: git push to main                                │ │
│  │  Steps:                                                   │ │
│  │  1. npm install                                           │ │
│  │  2. npm run test                                          │ │
│  │  3. npx prisma generate                                   │ │
│  │  4. npm run build                                         │ │
│  │  5. docker build -t gcr.io/PROJECT_ID/3aa-web:$SHORT_SHA │ │
│  │  6. docker push gcr.io/PROJECT_ID/3aa-web:$SHORT_SHA     │ │
│  │  7. gcloud run deploy 3aa-web --image=...                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │            Cloud Logging + Monitoring                     │ │
│  │                                                           │ │
│  │  - Application logs (stdout/stderr)                       │ │
│  │  - Request logs (HTTP access logs)                        │ │
│  │  - Error logs (exceptions, failures)                      │ │
│  │  - Metrics (request count, latency, errors)              │ │
│  │  - Uptime checks                                          │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

External:
├─ GitHub (source code repository)
├─ Tiingo API (market data provider)
├─ FMP API (market data provider)
└─ (Optional) Sentry (error tracking)
```

---

## Application Stack (ADR-010)

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Language** | TypeScript | 5.x |
| **Runtime** | Node.js | 20.x LTS |
| **Framework** | Next.js (App Router) | 14.x+ |
| **UI Library** | React | 18.x |
| **ORM** | Prisma | 5.x |
| **Database** | PostgreSQL | 15.x |
| **Package Manager** | npm | 10.x |
| **CSS** | Tailwind CSS | 3.x |
| **Testing** | Vitest + Testing Library | Latest |
| **Linting** | ESLint + Prettier | Latest |

### Application Structure (ADR-009: Modular Monolith)

```
3aa-monitoring/
├── src/
│   ├── modules/              # Domain modules
│   │   ├── classification/
│   │   │   ├── classification.service.ts
│   │   │   ├── classification.repository.ts
│   │   │   ├── classification.types.ts
│   │   │   └── classification.test.ts
│   │   ├── valuation/
│   │   ├── monitoring/
│   │   ├── data-ingestion/
│   │   ├── auth/
│   │   └── shared/
│   │
│   ├── app/                  # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── signin/
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── universe/
│   │   │   ├── alerts/
│   │   │   ├── stock/[ticker]/
│   │   │   ├── settings/
│   │   │   └── layout.tsx
│   │   └── api/
│   │       ├── cron/         # Background job endpoints
│   │       │   ├── price-sync/
│   │       │   ├── fundamentals/
│   │       │   ├── estimates/
│   │       │   ├── classification/
│   │       │   ├── valuation/
│   │       │   └── alerts/
│   │       └── admin/        # Admin endpoints
│   │           └── users/
│   │
│   ├── lib/                  # Shared utilities
│   │   ├── db.ts            # Prisma client singleton
│   │   ├── auth.ts          # Get current user helper
│   │   ├── logger.ts        # Logging utility
│   │   └── errors.ts        # Error types
│   │
│   └── middleware.ts         # Auth middleware
│
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── migrations/           # SQL migrations
│   └── seed.ts              # Database seeding
│
├── public/                   # Static assets
├── package.json
├── tsconfig.json
├── next.config.js
├── Dockerfile
└── cloudbuild.yaml
```

---

## Deployment Pipeline

### Build Process (Cloud Build)

**Trigger:** Push to `main` branch in GitHub

**cloudbuild.yaml:**
```yaml
steps:
  # Install dependencies
  - name: 'node:20'
    entrypoint: npm
    args: ['ci']

  # Run tests
  - name: 'node:20'
    entrypoint: npm
    args: ['run', 'test']

  # Generate Prisma client
  - name: 'node:20'
    entrypoint: npx
    args: ['prisma', 'generate']

  # Build Next.js app
  - name: 'node:20'
    entrypoint: npm
    args: ['run', 'build']
    env:
      - 'DATABASE_URL=postgresql://placeholder' # Build-time placeholder

  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/3aa-web:$SHORT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/3aa-web:latest'
      - '.'

  # Push Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/3aa-web:$SHORT_SHA']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/3aa-web:latest']

  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - '3aa-web'
      - '--image=gcr.io/$PROJECT_ID/3aa-web:$SHORT_SHA'
      - '--region=us-central1'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--max-instances=10'
      - '--memory=2Gi'
      - '--cpu=2'
      - '--timeout=300'
      - '--set-secrets=DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,TIINGO_API_KEY=TIINGO_API_KEY:latest,FMP_API_KEY=FMP_API_KEY:latest,ADMIN_API_KEY=ADMIN_API_KEY:latest'
      - '--vpc-connector=3aa-vpc-connector'

  # Run database migrations
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'jobs'
      - 'execute'
      - '3aa-migrate'
      - '--region=us-central1'
      - '--wait'

timeout: '1200s' # 20 minutes
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### Database Migrations

**Migration Strategy:**
- Prisma migrations (declarative schema changes)
- Run migrations as separate Cloud Run job before deploying new app version
- Migrations run in Cloud Build pipeline (step above)

**Migration Job (`3aa-migrate`):**
```bash
#!/bin/sh
# migrate.sh
npx prisma migrate deploy
```

**Cloud Run Job Configuration:**
```yaml
# 3aa-migrate job (Cloud Run job, not service)
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: 3aa-migrate
spec:
  template:
    spec:
      template:
        spec:
          containers:
            - image: gcr.io/PROJECT_ID/3aa-web:latest
              command: ["/bin/sh"]
              args: ["-c", "npx prisma migrate deploy"]
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: DATABASE_URL
                      key: latest
```

---

## Background Job Orchestration (ADR-002 Refinement)

### Nightly Batch Schedule

**Cloud Scheduler Configuration:**

| Job Name | Schedule (ET) | Endpoint | Purpose |
|----------|--------------|----------|---------|
| `price-sync` | `0 22 * * 1-5` (5pm ET daily Mon-Fri) | `/api/cron/price-sync` | Sync EOD prices from Tiingo/FMP |
| `fundamentals-sync` | `0 23 * * 1-5` (6pm ET) | `/api/cron/fundamentals` | Sync fundamentals from providers |
| `estimates-sync` | `0 0 * * 2-6` (7pm ET) | `/api/cron/estimates` | Sync forward estimates |
| `classification` | `0 1 * * 2-6` (8pm ET) | `/api/cron/classification` | Recompute classification for all stocks |
| `valuation` | `15 1 * * 2-6` (8:15pm ET) | `/api/cron/valuation` | Recompute valuation for all stocks |
| `alerts` | `30 1 * * 2-6` (8:30pm ET) | `/api/cron/alerts` | Generate per-user alerts |

**Note:** Cron times are in UTC. `0 22 * * 1-5` = 5pm ET (UTC-5, or UTC-4 during DST).

### Cloud Scheduler Job Configuration

**Example: price-sync job:**
```yaml
name: price-sync
description: Sync EOD prices from Tiingo/FMP
schedule: "0 22 * * 1-5" # 5pm ET Mon-Fri
time_zone: America/New_York
http_target:
  uri: https://3aa-web-XXXXX-uc.a.run.app/api/cron/price-sync
  http_method: POST
  oidc_token:
    service_account_email: 3aa-scheduler@PROJECT_ID.iam.gserviceaccount.com
    audience: https://3aa-web-XXXXX-uc.a.run.app
```

**Security:** Cloud Scheduler uses OIDC token for authentication. Cron endpoints verify the token.

### Background Job Endpoint Pattern

**Example: /api/cron/price-sync/route.ts**
```typescript
import { NextResponse } from 'next/server';
import { DataIngestionService } from '@/modules/data-ingestion/ingestion.service';
import { verifySchedulerToken } from '@/lib/scheduler-auth';

export async function POST(request: Request) {
  // Verify Cloud Scheduler OIDC token
  try {
    await verifySchedulerToken(request);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Run price sync
  try {
    const result = await DataIngestionService.syncPrices();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Price sync failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const maxDuration = 300; // 5 minutes timeout (Cloud Run limit)
```

### Sequential Pipeline Orchestration

**Approach:** Cloud Scheduler jobs run at staggered times (5pm, 6pm, 7pm, etc.), naturally creating sequential pipeline.

**No workflow orchestrator needed** (Airflow, Temporal, etc.) - sequential timing is sufficient for V1.

**Dependency Checking:**
Each job checks prerequisites before running:

```typescript
// Example: Classification job checks that price sync completed
export async function POST(request: Request) {
  await verifySchedulerToken(request);

  // Check prerequisite: prices must be fresh
  const pricesFresh = await checkDataFreshness('prices', { maxAgeHours: 2 });
  if (!pricesFresh) {
    return NextResponse.json(
      { error: 'Prerequisites not met: prices not fresh' },
      { status: 412 } // Precondition Failed
    );
  }

  // Run classification
  const result = await ClassificationService.recomputeAllStocks();
  return NextResponse.json({ success: true, result });
}
```

---

## Database Configuration

### Cloud SQL Instance

**Configuration:**
```yaml
Instance ID: 3aa-db
Database version: PostgreSQL 15
Tier: db-f1-micro (1 vCPU, 3.75 GB RAM) # V1 start, scale up as needed
Storage type: SSD
Storage capacity: 10 GB (auto-increase enabled)
Region: us-central1
Zone: us-central1-a
High availability: No (V1), Yes (V2 if needed)
Backups: Automated (daily, 7-day retention)
Point-in-time recovery: Enabled
Maintenance window: Sunday 2-6am ET
```

**Private IP:** Enabled (VPC connection to Cloud Run)

**Connection:**
- Cloud Run → Cloud SQL via VPC connector (private IP)
- No public IP needed (more secure)

### Prisma Configuration

**prisma/schema.prisma:**
```prisma
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"] # For Alpine Docker image
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Models match RFC-002 schemas
model Stock {
  ticker    String  @id @db.VarChar(10)
  name      String  @db.VarChar(255)
  marketCap Decimal @db.Decimal(20, 2)
  // ... (full schema from RFC-002)

  @@map("stocks")
}

// ... (all other tables from RFC-002)
```

**DATABASE_URL Format:**
```
postgresql://USER:PASSWORD@/DATABASE?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_ID
```

(Cloud SQL uses Unix socket connection via `/cloudsql/...`)

---

## Security Configuration

### Secrets Management (Secret Manager)

**Secrets:**
- `DATABASE_URL` - Cloud SQL connection string
- `SESSION_SECRET` - Session cookie signing key (generate with `openssl rand -base64 32`)
- `TIINGO_API_KEY` - Tiingo API key
- `FMP_API_KEY` - FMP API key
- `ADMIN_API_KEY` - Admin API key for user creation

**Access:**
- Cloud Run service account has `secretmanager.secretAccessor` role
- Secrets injected as environment variables at runtime

### Authentication (ADR-011)

**Strategy:** Custom email/password auth

**Session Security:**
- HTTP-only cookies (prevent XSS)
- Secure flag (HTTPS only in production)
- SameSite=Lax (CSRF protection)
- 7-day expiration (per PRD)

**Password Security:**
- bcrypt hashing (salt rounds: 10)
- Rate limiting (5 attempts per 15 min)

### Network Security

**VPC Connector:**
- Cloud Run → Cloud SQL via private VPC
- No public database access

**HTTPS:**
- Cloud Run provides automatic HTTPS (Let's Encrypt)
- Custom domain (optional): Configure Cloud Run custom domain + SSL

### IAM (Service Accounts)

**Service Accounts:**
1. **3aa-web** (Cloud Run service account)
   - Roles: `cloudsql.client`, `secretmanager.secretAccessor`, `logging.logWriter`

2. **3aa-scheduler** (Cloud Scheduler service account)
   - Roles: `run.invoker` (can invoke Cloud Run endpoints)

3. **3aa-builder** (Cloud Build service account)
   - Roles: `run.admin`, `iam.serviceAccountUser`, `storage.admin`

---

## Observability

### Logging (Cloud Logging)

**Automatic Logs:**
- Request logs (HTTP access logs)
- Application logs (stdout/stderr)
- Error logs (uncaught exceptions)

**Structured Logging:**
```typescript
// src/lib/logger.ts
export function log(level: 'info' | 'warn' | 'error', message: string, metadata?: object) {
  console.log(JSON.stringify({
    severity: level.toUpperCase(),
    message,
    ...metadata,
    timestamp: new Date().toISOString(),
  }));
}

// Usage
log('info', 'Classification complete', { ticker: 'AAPL', code: '4AA', duration: 120 });
```

**Log Queries:**
```sql
-- View recent errors
severity="ERROR"
timestamp>="2026-04-18T00:00:00Z"

-- View price sync logs
jsonPayload.message=~"Price sync"

-- View slow requests
httpRequest.latency > "1s"
```

### Monitoring (Cloud Monitoring)

**Automatic Metrics:**
- Request count
- Request latency (p50, p95, p99)
- Error rate (5xx responses)
- CPU usage
- Memory usage
- Instance count (auto-scaling)

**Custom Metrics:**
```typescript
// Example: Track classification duration
import { MetricServiceClient } from '@google-cloud/monitoring';

const metricsClient = new MetricServiceClient();

export async function recordClassificationDuration(durationMs: number) {
  const dataPoint = {
    interval: {
      endTime: {
        seconds: Date.now() / 1000,
      },
    },
    value: {
      doubleValue: durationMs,
    },
  };

  await metricsClient.createTimeSeries({
    name: metricsClient.projectPath(PROJECT_ID),
    timeSeries: [{
      metric: {
        type: 'custom.googleapis.com/classification/duration',
      },
      resource: {
        type: 'cloud_run_revision',
        labels: {
          service_name: '3aa-web',
          location: 'us-central1',
        },
      },
      points: [dataPoint],
    }],
  });
}
```

### Error Tracking (Optional: Sentry)

**Setup:**
```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of requests traced
});
```

**Cost:** Sentry free tier: 5K errors/month (sufficient for V1)

### Uptime Monitoring

**Cloud Monitoring Uptime Check:**
```yaml
display_name: "3AA Web App Uptime"
monitored_resource:
  type: cloud_run_revision
  labels:
    service_name: 3aa-web
http_check:
  path: /api/health
  port: 443
  use_ssl: true
period: 300s # Check every 5 minutes
timeout: 10s
```

**Health Endpoint:**
```typescript
// src/app/api/health/route.ts
export async function GET() {
  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    return Response.json(
      { status: 'unhealthy', database: 'disconnected', error: error.message },
      { status: 503 }
    );
  }
}
```

---

## Environments

### Development (Local)

**Setup:**
```bash
# .env.local
DATABASE_URL="postgresql://postgres:password@localhost:5432/3aa_dev"
SESSION_SECRET="dev-secret-change-in-production"
TIINGO_API_KEY="your-dev-key"
FMP_API_KEY="your-dev-key"
ADMIN_API_KEY="dev-admin-key"
NODE_ENV="development"
```

**Run:**
```bash
# Start Postgres (Docker)
docker run --name 3aa-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npx prisma db seed

# Start dev server
npm run dev
```

### Production (Cloud Run)

**Configuration:**
- Region: `us-central1`
- Max instances: 10 (prevent runaway scaling costs)
- Min instances: 0 (scale to zero when idle)
- Memory: 2 GiB
- CPU: 2
- Timeout: 300s (5 minutes)
- Concurrency: 80 (default)

**Environment Variables (from Secret Manager):**
- `DATABASE_URL`
- `SESSION_SECRET`
- `TIINGO_API_KEY`
- `FMP_API_KEY`
- `ADMIN_API_KEY`
- `NODE_ENV=production`

### Staging (Optional, V2)

**If needed:**
- Separate Cloud Run service: `3aa-web-staging`
- Separate Cloud SQL instance: `3aa-db-staging`
- Separate secrets
- Same code, different environment

---

## Development Workflow

### Local Development

```bash
# Clone repository
git clone https://github.com/USER/3aa-monitoring.git
cd 3aa-monitoring

# Install dependencies
npm install

# Setup database
docker run --name 3aa-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15

# Create .env.local (see Environments section)
cp .env.example .env.local
# Edit .env.local with your API keys

# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Start dev server
npm run dev

# Open browser: http://localhost:3000
```

### Testing

```bash
# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type check
npm run type-check

# Lint
npm run lint

# Format code
npm run format
```

### Database Management

```bash
# Create migration
npx prisma migrate dev --name add_new_field

# Reset database (development only)
npx prisma migrate reset

# View database (GUI)
npx prisma studio

# Seed database
npx prisma db seed
```

### Deployment

```bash
# Automatic: Push to main branch triggers Cloud Build
git push origin main

# Manual: Deploy from local
gcloud builds submit --config cloudbuild.yaml

# Check deployment status
gcloud run services describe 3aa-web --region us-central1

# View logs
gcloud logs tail --service=3aa-web

# Rollback to previous version
gcloud run services update-traffic 3aa-web --to-revisions=PREVIOUS_REVISION=100
```

---

## Cost Estimation

### V1 (100 users, 1000 stocks)

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| Cloud Run (web) | 10K requests/day, avg 200ms | ~$10 |
| Cloud SQL (db-f1-micro) | 1 vCPU, 10GB storage | ~$20 |
| Cloud Scheduler | 6 jobs | Free |
| Secret Manager | 5 secrets | Free |
| Cloud Build | 10 builds/day | Free tier |
| Cloud Logging | 10GB/month | Free tier |
| VPC Connector | 1 connector | ~$10 |
| **Total** | | **~$40/month** |

### V1 (1000 users, 1000 stocks)

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| Cloud Run (web) | 100K requests/day | ~$50 |
| Cloud SQL (db-g1-small) | 1 vCPU, 25GB storage | ~$50 |
| Cloud Scheduler | 6 jobs | Free |
| Secret Manager | 5 secrets | Free |
| Cloud Build | 20 builds/day | Free tier |
| Cloud Logging | 50GB/month | ~$20 |
| VPC Connector | 1 connector | ~$10 |
| **Total** | | **~$130/month** |

**Scaling:** Cost scales sub-linearly with users (Cloud Run auto-scales, Cloud SQL can scale vertically).

---

## Performance Targets

### Web Application

- **Page Load Time:** <1s (p95)
- **API Response Time:** <200ms (p95)
- **Time to First Byte (TTFB):** <500ms (p95)

### Background Jobs

- **Price Sync:** <5 min for 1000 stocks
- **Classification:** <10 min for 1000 stocks
- **Valuation:** <10 min for 1000 stocks
- **Alert Generation:** <5 min for 100 users × 100 monitored stocks/user

**Total Nightly Batch:** <30 min (fits within 5pm-9pm ET window)

---

## Disaster Recovery

### Backups

**Cloud SQL Automated Backups:**
- Frequency: Daily
- Retention: 7 days
- Point-in-time recovery: Yes (transaction logs)

**Manual Backups:**
- Before major schema changes
- Before V1 → V2 migration

### Recovery Procedures

**Database Restore:**
```bash
# Restore from backup
gcloud sql backups restore BACKUP_ID --backup-instance=3aa-db

# Restore to specific point in time
gcloud sql backups restore --backup-instance=3aa-db \
  --restore-instance=3aa-db --backup-id=BACKUP_ID
```

**Application Rollback:**
```bash
# List recent revisions
gcloud run revisions list --service=3aa-web --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic 3aa-web \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

**Estimated Recovery Time Objective (RTO):** <1 hour
**Estimated Recovery Point Objective (RPO):** <24 hours (daily backups)

---

## Migration Path

### Scaling Beyond Cloud Run

**When to Consider:**
- Consistent >10K concurrent users
- Background jobs exceed 5-minute timeout
- Need for advanced orchestration (complex workflows)

**Migration Options:**
1. **Google Kubernetes Engine (GKE):**
   - More control, more complexity
   - Can run same Docker container
   - Migration effort: 2-3 weeks

2. **Cloud Run Jobs (for background jobs):**
   - Separate Cloud Run jobs for each background task
   - Better isolation, independent scaling
   - Migration effort: 1 week

3. **Microservices (extract modules):**
   - Extract high-load modules (e.g., classification) to separate services
   - Follows ADR-009 module boundaries
   - Migration effort: 2-4 weeks per service

---

## Related Decisions

- **ADR-008:** Platform choice (Google Cloud)
- **ADR-009:** Modular monolith architecture
- **ADR-010:** Technology stack (TypeScript, Next.js, Prisma)
- **ADR-011:** Authentication strategy (custom email/password)
- **ADR-002:** Nightly batch orchestration (Cloud Scheduler implementation)
- **RFC-002:** Database schema (Prisma schema)

---

## Open Questions

1. **Custom domain:** Should V1 use custom domain (e.g., 3aa-monitoring.com) or Cloud Run default (`*.run.app`)?
   - Decision: Start with Cloud Run default, add custom domain if needed

2. **Staging environment:** Should V1 have staging environment or deploy directly to prod?
   - Decision: Start without staging (deploy to prod, use feature flags if needed)

3. **Email notifications:** Should V1 send email notifications (in addition to in-app alerts)?
   - Decision: Deferred to V2 (PRD specifies in-app only for V1)

---

**END RFC-006**
