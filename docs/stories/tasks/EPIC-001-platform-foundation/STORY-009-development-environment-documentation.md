# STORY-009 — Document Development Environment Setup and Workflows

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Provide comprehensive documentation for developers to set up local development environment, understand repository structure, follow Git workflow, run the application locally, and deploy to Cloud Run.

## Story
As a **new developer joining the project**,
I want **clear documentation for environment setup and development workflows**,
so that **I can clone the repository, run the application locally, and contribute code without extensive onboarding**.

## Outcome
- README.md comprehensive (project overview, setup instructions, architecture, versioning, contributing guidelines)
- Development environment setup documented (prerequisites, installation, configuration)
- Git workflow documented (branching strategy, commit conventions, PR process)
- Local development workflow documented (run locally, run tests, run migrations, connect to local/Cloud SQL database)
- Deployment workflow documented (CI/CD process, manual deployment, rollback)
- Troubleshooting guide included (common issues, solutions)
- CHANGELOG.md template created (version history format)
- CONTRIBUTING.md created (code style, testing requirements, PR guidelines)

## Scope In
- Update README.md (project overview, setup instructions, running locally, deployment, architecture overview, versioning strategy, traceability to PRD/RFCs/ADRs)
- Create .env.example (template with required environment variables: DATABASE_URL, NODE_ENV, TIINGO_API_KEY, FMP_API_KEY)
- Create CONTRIBUTING.md (code style guide, testing requirements, PR template, commit conventions)
- Create CHANGELOG.md (version history template, semantic versioning format)
- Document local development setup (install Node.js 18+, npm install, copy .env.example → .env, run Prisma migrations, run dev server)
- Document Git workflow (branch protection, feature branches, commit message format, PR review process)
- Document deployment workflow (push to main → Cloud Build → Cloud Run, manual rollback via Cloud Run console)
- Document database setup (local Postgres via Docker, or connect to Cloud SQL for development)
- Add troubleshooting section (common errors: DATABASE_URL missing, Prisma Client not generated, migration fails, Cloud Build timeout)
- Add architecture diagram (text-based or link to /docs/architecture)

## Scope Out
- Detailed architectural documentation (deferred to /docs/architecture)
- API documentation (Swagger/OpenAPI - deferred)
- Runbook documentation (operational procedures - deferred to /docs/runbooks)
- Onboarding video or interactive tutorial (documentation only for V1)
- IDE-specific setup (VS Code extensions, etc. - developers choose own IDE)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFCs:** RFC-006 (Platform & Deployment Architecture)
- **ADRs:** ADR-010 (TypeScript + Next.js + Prisma)
- **Upstream stories:** STORY-001 (GitHub repository), STORY-004 (Prisma schema), STORY-006 (CI/CD pipeline), STORY-008 (Next.js application)

## Preconditions
- GitHub repository exists (STORY-001 completed)
- Prisma schema and migrations exist (STORY-004, STORY-005 completed)
- Next.js application exists (STORY-008 completed)
- CI/CD pipeline configured (STORY-006 completed)
- Understanding of V1 scope and architecture

## Inputs
- Existing repository structure (src/, docs/, prisma/, tests/)
- CI/CD configuration (Dockerfile, cloudbuild.yaml)
- Environment variables (DATABASE_URL, API keys)
- Git workflow decisions (branch protection, semantic versioning)
- Architectural decisions (PRD, RFCs, ADRs)

## Outputs
- README.md (comprehensive project documentation)
- .env.example (environment variable template)
- CONTRIBUTING.md (contribution guidelines)
- CHANGELOG.md (version history template)
- /docs/architecture/README.md (architecture overview, links to RFCs/ADRs)
- Troubleshooting section in README.md

## Acceptance Criteria
- [ ] README.md created with following sections:
  - Project title and description (3AA Monitoring Product V1)
  - Table of contents
  - Prerequisites (Node.js 18+, npm, Docker optional)
  - Installation instructions (clone repo, npm install, copy .env.example, run migrations)
  - Running locally (npm run dev, access http://localhost:3000)
  - Running tests (npm test, npm run test:integration)
  - Environment variables (list required variables, describe purpose)
  - Deployment (CI/CD process, manual deployment)
  - Architecture overview (link to /docs/architecture, /docs/prd, /docs/rfc, /docs/adr)
  - Versioning strategy (semantic versioning, CHANGELOG format)
  - Contributing (link to CONTRIBUTING.md)
  - Troubleshooting (common issues, solutions)
  - Traceability (links to PRD Section 9C, RFC-006, ADR-010)
- [ ] .env.example created with template variables:
  - DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/monitoring_v1
  - NODE_ENV=development
  - TIINGO_API_KEY=your_tiingo_api_key_here
  - FMP_API_KEY=your_fmp_api_key_here
- [ ] CONTRIBUTING.md created with sections:
  - Code style (TypeScript strict mode, ESLint rules, Prettier formatting)
  - Testing requirements (unit tests for new functions, integration tests for new endpoints, test coverage >80%)
  - Git workflow (feature branches, commit message format: "feat:", "fix:", "docs:", etc.)
  - Pull request process (create PR, request review, CI must pass, merge to main)
  - Code review guidelines (review for correctness, tests, documentation, security)
- [ ] CHANGELOG.md created with template:
  - Version heading format: ## [1.0.0] - YYYY-MM-DD
  - Sections: Added, Changed, Deprecated, Removed, Fixed, Security
  - Example entry for v1.0.0 (initial release)
- [ ] Local development setup documented (step-by-step: install Node.js → clone repo → npm install → copy .env → run migrations → npm run dev)
- [ ] Database setup documented (option 1: local Postgres via Docker, option 2: connect to Cloud SQL with Cloud SQL Proxy)
- [ ] Git workflow documented (branch protection on main, feature branches from main, PR required for merge)
- [ ] Deployment workflow documented (push to main → Cloud Build triggered → migrations run → Cloud Run deployed)
- [ ] Troubleshooting section includes at least 5 common issues with solutions:
  1. DATABASE_URL not set (error message, solution: copy .env.example)
  2. Prisma Client not generated (error message, solution: npx prisma generate)
  3. Migration fails (error message, solution: check DATABASE_URL, check database accessible)
  4. Cloud Build timeout (error message, solution: optimize Dockerfile, check Cloud Build logs)
  5. Cloud Run deployment fails (error message, solution: check health check endpoint, check Cloud Run logs)
- [ ] Architecture diagram included (text-based Mermaid or link to /docs/architecture)

## Test Strategy Expectations

**Unit tests:**
- N/A (documentation does not require unit tests)

**Integration tests:**
- Documentation walkthrough (manual test: follow README instructions from scratch → application runs locally)
- .env.example completeness (verify all required environment variables listed)

**Contract/schema tests:**
- README.md structure validation (all required sections present)
- CONTRIBUTING.md completeness (code style, testing, Git workflow sections present)
- CHANGELOG.md format compliance (follows Keep a Changelog format)

**BDD acceptance tests:**
- "Given new developer, when following README setup instructions, then application runs locally"
- "Given .env.example, when copying to .env and filling values, then application connects to database"
- "Given CONTRIBUTING.md, when reading commit conventions, then format is clear (feat:, fix:, docs:)"

**E2E tests:**
- Full onboarding workflow (new developer clones repo → follows README → runs locally → makes change → commits → creates PR → merges → CI/CD deploys)

## Regression / Invariant Risks

**Documentation drift:**
- Risk: README.md becomes outdated (setup instructions no longer work)
- Protection: Periodic review of documentation, integration test follows README instructions

**Missing environment variables:**
- Risk: .env.example incomplete (new variable added, not documented)
- Protection: Code review checks .env.example updated when new env var added

**Broken links:**
- Risk: Links to PRD/RFCs/ADRs return 404 (files moved or deleted)
- Protection: Automated link checker (deferred), manual review during documentation updates

**Inconsistent commit conventions:**
- Risk: CONTRIBUTING.md documents one convention, but developers use different format
- Protection: PR template includes commit format reminder, code review enforces conventions

**Outdated troubleshooting:**
- Risk: Troubleshooting section has obsolete solutions (error messages changed)
- Protection: Update troubleshooting when errors encountered, link to GitHub Issues for unresolved issues

**Invariants to protect:**
- README.md always up to date (setup instructions work for new developers)
- .env.example always complete (all required environment variables documented)
- CONTRIBUTING.md always reflects current workflow (Git workflow, testing requirements accurate)
- CHANGELOG.md always updated for new releases (version history complete)
- Documentation always references correct PRD/RFC/ADR sections (traceability preserved)

## Key Risks / Edge Cases

**Setup instruction edge cases:**
- Windows vs macOS vs Linux (setup instructions differ, document for all platforms or specify platform)
- Node.js version mismatch (README says 18+, developer uses 16, errors)
- npm vs yarn vs pnpm (README uses npm, developer prefers yarn, instructions still work)

**Environment variable edge cases:**
- .env not gitignored (developer commits .env with secrets, GitHub exposes secrets)
- DATABASE_URL format incorrect (missing password, wrong port, connection fails)
- Secret Manager in production (README documents .env for local, but production uses Secret Manager)

**Git workflow edge cases:**
- Feature branch naming (no convention documented, developers use inconsistent names)
- Merge conflicts (README doesn't document merge conflict resolution)
- Rebase vs merge (CONTRIBUTING.md doesn't specify, developers choose different strategies)

**Documentation format edge cases:**
- Markdown rendering differences (GitHub Flavored Markdown vs CommonMark, syntax varies)
- Long code blocks (code blocks exceed screen width, horizontal scroll)
- Relative links (links to /docs/prd/PRD.md work on GitHub, may break locally)

**Troubleshooting edge cases:**
- Issue not covered (developer encounters new error, no troubleshooting entry)
- Troubleshooting outdated (solution no longer works, developer confused)
- Multiple solutions (one solution works for some, different solution for others)

## Definition of Done

- [ ] README.md created with all required sections (project overview, setup, running locally, deployment, architecture, versioning, contributing, troubleshooting, traceability)
- [ ] .env.example created with all required environment variables
- [ ] CONTRIBUTING.md created with code style, testing, Git workflow, PR process
- [ ] CHANGELOG.md created with v1.0.0 template entry
- [ ] Local development setup documented (step-by-step instructions)
- [ ] Database setup documented (local Postgres or Cloud SQL)
- [ ] Git workflow documented (branch protection, feature branches, PR process)
- [ ] Deployment workflow documented (CI/CD process)
- [ ] Troubleshooting section includes at least 5 common issues with solutions
- [ ] Architecture diagram or link included
- [ ] Documentation walkthrough tested (manual test: follow README → application runs locally)
- [ ] All files committed to GitHub repository (README.md, .env.example, CONTRIBUTING.md, CHANGELOG.md)
- [ ] Traceability links in README.md (references PRD Section 9C, RFC-006, ADR-010)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 9C (Deployment & Platform Architecture)
- **RFC:** RFC-006 (Platform & Deployment Architecture)
- **ADR:** ADR-010 (TypeScript + Next.js + Prisma)

---

**END STORY-009**
