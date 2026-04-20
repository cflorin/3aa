# Contributing to 3AA Monitoring Product

## Development Workflow

### Branch Strategy
- `main` — production branch, protected
- All work is committed directly to main during EPIC-001 (solo development phase)
- Feature branches will be introduced when multi-developer collaboration begins

### Commit Format
All commits must reference the epic, story, and task:

```
[EPIC-XXX/STORY-XXX/TASK-XXX] Brief description

Longer explanation if needed.
```

Examples:
```
[EPIC-001/STORY-005/TASK-005-002] Add Prisma seed script for framework config
[EPIC-002/STORY-010/TASK-010-001] Implement user authentication with bcrypt
```

### Deployment
```bash
gcloud builds submit --config cloudbuild.yaml --project=aa-investor
```

The pipeline: unit tests → build Docker images → run migrations + seed → deploy to Cloud Run.

---

## Testing Requirements

Every implementation must include tests. No exceptions.

### Unit Tests (`tests/unit/`)
```bash
npm test
```
- Location: `tests/unit/**/*.test.ts`
- Run in Jest with mocked dependencies
- Required for: all service functions, utilities, route handlers
- Naming: `describe('EPIC-XXX/STORY-XXX/TASK-XXX: description', ...)`

### Integration Tests (`tests/integration/`)
```bash
npm run test:integration
```
- Location: `tests/integration/**/*.test.ts`
- Run against local Docker PostgreSQL (`.env.test`)
- Required for: database operations, API endpoints with real DB
- Start test DB first: `npm run db:test:up`

### Test Coverage Expectations
- Unit tests: >80% coverage for new code
- Integration tests: all critical DB paths covered

---

## Implementation Tracking

All implementation work is tracked in:
- **Plan:** `/docs/architecture/IMPLEMENTATION-PLAN-V1.md`
- **Log:** `/docs/architecture/IMPLEMENTATION-LOG.md`
- **Story specs:** `/stories/tasks/EPIC-XXX-*/STORY-XXX-*.md`

### Before Starting Work
1. Check the implementation plan for active story/task
2. Verify dependencies are satisfied
3. Confirm story status is `ready` or `in_progress`

### During Implementation
1. Update task status as work progresses
2. Write tests alongside code (not after)
3. Add traceability comments to all new files

### After Each Task
1. Update implementation log with evidence (files changed, tests passing)
2. Mark task status as `done`

---

## Code Standards

### Traceability Comments
Every implementation file must include:
```typescript
// EPIC-001: Platform Foundation & Deployment
// STORY-005: Create Framework Configuration Seed Data
// TASK-005-002: Prisma seed script
```

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig.json)
- No `any` types in new code
- All async functions must handle errors explicitly

### File Structure
```
src/
  app/              # Next.js App Router (pages + API routes)
    api/
      cron/         # Cloud Scheduler endpoints
      health/       # Health check
  lib/              # Shared utilities (auth, logging, etc.)
  modules/          # Domain modules (classification/, valuation/, etc.) — EPIC-002+
  infrastructure/
    database/       # Prisma client singleton

tests/
  unit/             # Unit tests (mocked dependencies)
  integration/      # Integration tests (real DB)

prisma/
  schema.prisma     # Database schema (19 tables)
  migrations/       # SQL migrations
  seed.ts           # Framework config seed
```

### Environment Variables
- Production secrets: Cloud Run Secret Manager (never in code)
- Local dev: `.env.local` (gitignored)
- Test: `.env.test` (committed — test DB credentials only)
- Template: `.env.example` (committed)

---

## Baseline Change Protocol

The V1 architecture baseline is frozen (RFCs 001–006, ADRs 001–011). If implementation reveals a conflict:

1. **STOP** current work
2. Document the conflict in `IMPLEMENTATION-LOG.md` with `Baseline Impact: YES`
3. Propose RFC amendment or ADR update
4. Wait for approval before proceeding

Do not silently adjust architecture to fit implementation.
