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

## Setup
[To be completed in STORY-009]

## Architecture
- **Platform:** Google Cloud Platform (Cloud Run, Cloud SQL, Cloud Scheduler)
- **Framework:** Next.js 14+ with TypeScript 5.x
- **Database:** PostgreSQL 15 with Prisma ORM
- **Architecture Style:** Modular Monolith

## Documentation
- **PRD:** `/docs/prd/PRD.md`
- **RFCs:** `/docs/rfc/`
- **ADRs:** `/docs/adr/`
- **Implementation Plan:** `/docs/architecture/IMPLEMENTATION-PLAN-V1.md`

## Traceability
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFC-006:** Platform & Deployment Architecture
- **ADR-010:** TypeScript + Next.js + Prisma

---

**Last Updated:** 2026-04-19
