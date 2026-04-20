# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How to Update This Changelog

### For Each Version
- Create a new version heading: `## [X.Y.Z] - YYYY-MM-DD`
- Categorize changes under:
  - **Added**: New features
  - **Changed**: Changes to existing functionality
  - **Deprecated**: Soon-to-be removed features
  - **Removed**: Removed features
  - **Fixed**: Bug fixes
  - **Security**: Security fixes
- Update comparison links at bottom

### Version Numbering
- MAJOR version: Breaking changes
- MINOR version: New features (backward-compatible)
- PATCH version: Bug fixes (backward-compatible)

---

## [Unreleased]

## [1.0.0-foundation] - 2026-04-20

EPIC-001: Platform Foundation & Deployment complete. All infrastructure operational, database seeded, CI/CD pipeline active.

### Added
- **GCP Infrastructure:** Cloud Run (aaa-web), Cloud SQL PostgreSQL 15, VPC connector, Secret Manager (5 secrets), 3 service accounts, 6 Cloud Scheduler jobs, Artifact Registry
- **Database Schema:** 19 tables per RFC-002 (stocks, classification, valuation, monitoring, alerts, users, framework config); 2 Prisma migrations applied
- **Framework Configuration Seed Data:** 1 framework_version (v1.0), 16 anchored_thresholds (valuation zones), 8 tsr_hurdles — idempotent Prisma upsert seed
- **Next.js Application:** App Router foundation, health check endpoint (`GET /api/health` with DB connectivity check), Prisma client singleton, 6 Cloud Scheduler cron endpoint placeholders
- **OIDC Authentication:** Cloud Scheduler cron endpoints protected by Google OIDC token verification (`src/lib/scheduler-auth.ts`)
- **CI/CD Pipeline:** `cloudbuild.yaml` — unit test gate → Docker build (web + migrator) → push to Artifact Registry → migrate+seed Cloud Run Job → deploy web service
- **Test Suite:** 69 tests (17 unit + 52 integration) — schema, constraints, seed data, health endpoint, scheduler auth, pipeline structure
- **Documentation:** README.md setup guide, CONTRIBUTING.md, CHANGELOG.md, `.env.example`, story specs for all 9 EPIC-001 stories

### Infrastructure Details
- Cloud Run service: `aaa-web` at `https://aaa-web-717628686883.us-central1.run.app`
- Cloud SQL: `aaa-db` (PostgreSQL 15, db-f1-micro, private IP 172.24.0.3)
- VPC connector: `aaa-vpc-connector` (10.8.0.0/28) for Cloud Run → Cloud SQL
- Migrator job: `aaa-migrate` (Cloud Run Job) — runs `prisma migrate deploy && prisma db seed`

[Unreleased]: https://github.com/cflorin/3aa/compare/v1.0.0-foundation...HEAD
[1.0.0-foundation]: https://github.com/cflorin/3aa/releases/tag/v1.0.0-foundation
