# 3AA Monitoring Product

## Overview
The 3AA Monitoring Product is a systematic stock monitoring and alerting system based on the 3AA investment framework. This application tracks stocks meeting quality criteria, monitors valuation zones, and generates personalized alerts for investment opportunities.

## Versioning

This project follows [Semantic Versioning](https://semver.org/) (SemVer).

### Version Format
- Format: `vMAJOR.MINOR.PATCH`
- Example: `v1.0.0`, `v1.2.3`, `v2.0.0`

### Version Increment Rules
- **MAJOR**: Breaking changes (incompatible API changes)
- **MINOR**: New features (backward-compatible functionality)
- **PATCH**: Bug fixes (backward-compatible bug fixes)

### Pre-release Versions
- Format: `vMAJOR.MINOR.PATCH-LABEL`
- Examples: `v1.0.0-alpha`, `v1.0.0-beta`, `v1.0.0-rc.1`

### Version Tags
All releases are tagged in Git with the version number:
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### Changelog
See [CHANGELOG.md](CHANGELOG.md) for version history.

## Local Development Setup

### Prerequisites
- Node.js 20+ and npm 10+
- Docker (for local test database)
- gcloud CLI (for deployment)

### Install

```bash
git clone https://github.com/cflorin/3aa.git
cd 3aa
npm install
```

### Environment Variables

```bash
cp .env.example .env.local
# Edit .env.local — fill in DATABASE_URL and API keys
```

For integration tests, `.env.test` is pre-configured for the local Docker test database (no changes needed).

### Start Local Database

```bash
npm run db:test:up          # Start Docker PostgreSQL on port 5433
dotenv -e .env.test -- npx prisma migrate deploy   # Apply migrations
npm run db:seed             # Seed framework config (16 thresholds, 8 TSR hurdles)
```

### Run Dev Server

```bash
npm run dev                 # http://localhost:3000
```

### Run Tests

```bash
npm test                    # Unit tests (tests/unit/)
npm run test:integration    # Integration tests against local Docker DB (tests/integration/)
npm run test:all            # Both
```

### Deploy to Production

```bash
gcloud builds submit --config cloudbuild.yaml --project=aa-investor
```

This builds the Docker image, runs migrations + seed, and deploys to Cloud Run.

---

## Architecture

- **Platform:** Google Cloud Platform (Cloud Run, Cloud SQL, Cloud Scheduler)
- **Framework:** Next.js 14 with TypeScript 5.x (App Router)
- **Database:** PostgreSQL 15 with Prisma ORM
- **Architecture Style:** Modular Monolith (ADR-009)

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Health check — DB connectivity, always returns HTTP 200 |
| `POST /api/cron/price-sync` | Cloud Scheduler: nightly price sync (EPIC-003) |
| `POST /api/cron/fundamentals` | Cloud Scheduler: fundamentals sync (EPIC-003) |
| `POST /api/cron/estimates` | Cloud Scheduler: estimates sync (EPIC-003) |
| `POST /api/cron/classification` | Cloud Scheduler: classification run (EPIC-004) |
| `POST /api/cron/valuation` | Cloud Scheduler: valuation run (EPIC-005) |
| `POST /api/cron/alerts` | Cloud Scheduler: alert generation (EPIC-006) |

Cron endpoints require a valid Cloud Scheduler OIDC token (service account: `aaa-scheduler@aa-investor.iam.gserviceaccount.com`).

### Database

19 tables defined in `/prisma/schema.prisma` (RFC-002). Framework config seeded on every deployment:
- 1 `framework_version` row (v1.0)
- 16 `anchored_thresholds` rows (valuation zones per classification code)
- 8 `tsr_hurdles` rows (TSR hurdle rates per bucket)

---

## Documentation

- **PRD:** `/docs/prd/PRD.md`
- **RFCs:** `/docs/rfc/` (RFC-001 through RFC-006)
- **ADRs:** `/docs/adr/` (ADR-001 through ADR-011)
- **Implementation Plan:** `/docs/architecture/IMPLEMENTATION-PLAN-V1.md`
- **Implementation Log:** `/docs/architecture/IMPLEMENTATION-LOG.md`
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

---

**Last Updated:** 2026-04-20
