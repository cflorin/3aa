# ADR-009: Application Architecture - Modular Monolith

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-006 (Platform Architecture), ADR-008 (GCP Platform), ADR-010 (Tech Stack)

---

## Context

The 3AA Monitoring Product V1 requires an application architecture that balances:
- Simplicity (minimal operational burden)
- Modularity (clear separation of concerns)
- Scalability (room to grow from 10 → 10K users)
- Autonomy (Claude can deploy and maintain)

**The Question:** Should V1 be built as a monolith, modular monolith, or microservices?

### V1 Characteristics

- **Product scope:** classify → value → monitor → alert → inspect
- **Scale:** 10-100 users initially, 1000 stocks, nightly batch processing
- **Engines:** Classification, Valuation, Monitoring, Data Ingestion
- **User interactions:** Authenticated web app (5 screens)
- **Background jobs:** Nightly batch (sequential pipeline)
- **Database:** Single Postgres database (RFC-002)

### Architecture Options

**Monolith:**
- Single codebase, single deployment
- No clear module boundaries
- All code in one directory structure

**Modular Monolith:**
- Single codebase, single deployment
- Clear module boundaries (classification, valuation, monitoring, auth, etc.)
- Modules communicate via in-process function calls
- Can be split into services later if needed

**Microservices:**
- Multiple codebases, multiple deployments
- Independent services (classification-service, valuation-service, etc.)
- Services communicate via HTTP/gRPC
- Independent scaling, deployment

---

## Decision

V1 shall use a **modular monolith** architecture:

- **Single application** (one Next.js app)
- **Single deployment** (one Cloud Run service)
- **Single database** (one Postgres instance)
- **Clear module boundaries** (organized by domain)
- **In-process communication** (direct function calls, not HTTP)

### Module Structure

```
src/
├── modules/
│   ├── classification/
│   │   ├── classification.service.ts      # Classification engine logic
│   │   ├── classification.repository.ts   # DB access (classification_state)
│   │   ├── classification.types.ts        # TypeScript types
│   │   └── classification.test.ts         # Unit tests
│   │
│   ├── valuation/
│   │   ├── valuation.service.ts           # Valuation engine logic
│   │   ├── threshold.service.ts           # Threshold derivation
│   │   ├── valuation.repository.ts        # DB access (valuation_state)
│   │   ├── valuation.types.ts
│   │   └── valuation.test.ts
│   │
│   ├── monitoring/
│   │   ├── monitoring.service.ts          # State diff detection
│   │   ├── alert-generator.service.ts     # Alert generation
│   │   ├── alert.repository.ts            # DB access (alerts)
│   │   ├── monitoring.types.ts
│   │   └── monitoring.test.ts
│   │
│   ├── data-ingestion/
│   │   ├── ingestion.service.ts           # Sync orchestration
│   │   ├── tiingo.adapter.ts              # Tiingo API client
│   │   ├── fmp.adapter.ts                 # FMP API client
│   │   ├── provider.types.ts
│   │   └── ingestion.test.ts
│   │
│   ├── auth/
│   │   ├── auth.service.ts                # Authentication logic
│   │   ├── session.service.ts             # Session management
│   │   ├── user.repository.ts             # DB access (users)
│   │   ├── auth.middleware.ts             # Route protection
│   │   └── auth.test.ts
│   │
│   └── shared/
│       ├── db.ts                          # Prisma client singleton
│       ├── logger.ts                      # Logging utility
│       └── errors.ts                      # Error types
│
├── app/                                   # Next.js App Router
│   ├── (auth)/
│   │   ├── signin/
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/
│   │   ├── universe/
│   │   ├── alerts/
│   │   ├── stock/[ticker]/
│   │   ├── settings/
│   │   └── layout.tsx                     # Protected layout
│   │
│   └── api/
│       ├── cron/                          # Background job endpoints
│       │   ├── price-sync/
│       │   ├── classification/
│       │   └── alerts/
│       │
│       └── ...                            # Other API routes
│
└── prisma/
    └── schema.prisma                      # Database schema
```

### Module Communication

**Within Same Request:**
```typescript
// modules/valuation/valuation.service.ts
import { ClassificationService } from '../classification/classification.service';

class ValuationService {
  async computeValuation(ticker: string): Promise<ValuationResult> {
    // Get classification from classification module (in-process call)
    const classification = await ClassificationService.getClassification(ticker);

    // Use classification for valuation
    const thresholds = this.deriveThresholds(classification.suggested_code);
    return { ticker, thresholds, ... };
  }
}
```

**Background Jobs:**
```typescript
// app/api/cron/classification/route.ts
import { ClassificationService } from '@/modules/classification/classification.service';

export async function POST(request: Request) {
  // Verify Cloud Scheduler token
  await verifySchedulerToken(request);

  // Run classification for all stocks
  await ClassificationService.recomputeAllStocks();

  return Response.json({ success: true });
}
```

---

## Rationale

### Why Modular Monolith?

**1. Operational Simplicity**
- Single deployment unit (one Cloud Run service)
- Single build pipeline (one Docker image)
- Single observability surface (one set of logs/metrics)
- No network calls between modules (no latency, no retry logic)
- No distributed transaction complexity

**2. V1 Scale Doesn't Need Microservices**
- 1000 stocks × 10-100 users = small dataset
- Nightly batch (not real-time) = no extreme performance requirements
- All engines run sequentially (not concurrently)
- No independent scaling needed (classification doesn't need more resources than valuation)

**3. Clear Module Boundaries**
- Modules organized by domain (classification, valuation, monitoring)
- Each module owns its data access (repository pattern)
- Type-safe contracts between modules (TypeScript interfaces)
- Easy to reason about, test, refactor

**4. Database Transaction Simplicity**
- All modules share same Postgres connection pool
- Can use database transactions across modules
- Example: Classification + Valuation update in single transaction
- No distributed transaction complexity (no 2PC, Saga patterns)

**5. Development Velocity**
- Fast iteration (single codebase, no service coordination)
- Easy debugging (single process, can step through entire flow)
- Simple local development (run one Next.js process + Postgres)
- No inter-service API versioning

**6. Future-Proof**
- Can extract modules into services later if scale demands
- Clear module boundaries make extraction straightforward
- Example: If classification becomes CPU-heavy, extract to `classification-service`
- But V1 doesn't need this (premature optimization)

### Why NOT Microservices?

**Adds Complexity Without Benefit:**
- ❌ Network calls between services (latency, retry logic, failure modes)
- ❌ Distributed transactions (eventual consistency, saga patterns)
- ❌ Service discovery (how does valuation-service find classification-service?)
- ❌ API versioning (breaking changes require coordination)
- ❌ Multiple deployments (more CI/CD pipelines)
- ❌ Observability complexity (distributed tracing, log aggregation)

**V1 Doesn't Need It:**
- No independent scaling requirements
- No team autonomy requirements (solo/small team)
- No need for polyglot persistence (all modules use Postgres)
- No extreme performance requirements

**When Microservices Make Sense:**
- Large teams (100+ engineers) with independent ownership
- Extreme scale (millions of users, billions of records)
- Polyglot requirements (some services need Python ML, others Go performance)
- Independent scaling (one service needs 100x more resources than others)

**V1 Characteristics Don't Match Any of These.**

### Why NOT Traditional Monolith (No Modularity)?

**Lack of Structure:**
- ❌ No clear boundaries (classification logic mixed with auth logic)
- ❌ Hard to test (tight coupling, mocking difficult)
- ❌ Hard to reason about (unclear dependencies)
- ❌ Hard to refactor (changes ripple unpredictably)

**Modular Monolith Gives Structure Without Microservices Overhead.**

---

## Consequences

### Positive ✅

**Operational Simplicity:**
- One deployment (Cloud Run service)
- One build (Docker image)
- One observability surface (Cloud Logging)
- No service mesh, no API gateway, no distributed tracing

**Development Velocity:**
- Fast iteration (no multi-repo coordination)
- Easy debugging (single process)
- Simple local dev (one command: `npm run dev`)

**Performance:**
- No network latency (in-process function calls)
- No serialization overhead (direct object passing)
- Shared connection pool (fewer DB connections)

**Transaction Simplicity:**
- Database transactions work across modules
- No distributed transaction patterns needed
- Strong consistency guarantees

**Cost Efficiency:**
- Single Cloud Run instance (not 5+ services)
- Lower resource usage (no service-to-service overhead)
- Estimated cost: $30-50/month (vs $100-200+ for microservices)

**Testability:**
- Unit tests per module (isolated, fast)
- Integration tests for cross-module flows (still in-process)
- No need for service mocks, contract testing

**Future-Proof:**
- Can extract services later if needed
- Module boundaries already clear
- Example: `classification` module → `classification-service` (2-week refactor)

### Negative ⚠️

**Shared Deployment:**
- Bug in one module can bring down entire app
- Cannot deploy modules independently
- **Mitigation:** Good testing, gradual rollouts, quick rollback

**Shared Scaling:**
- Cannot scale modules independently
- If classification is CPU-heavy, entire app scales
- **Mitigation:** V1 scale doesn't need independent scaling; Cloud Run auto-scales based on total load

**Technology Lock-In:**
- All modules must use same language/framework (TypeScript/Next.js)
- Cannot use Python for ML-heavy classification
- **Mitigation:** V1 doesn't need polyglot; can extract later if ML becomes critical

**Development Coordination:**
- Multiple developers editing same codebase (merge conflicts)
- **Mitigation:** V1 is small team; module boundaries reduce conflicts

---

## Alternatives Considered

### Alternative 1: Microservices (Separate Services)

**Approach:**
```
Services:
- classification-service (Cloud Run)
- valuation-service (Cloud Run)
- monitoring-service (Cloud Run)
- web-app (Cloud Run, calls other services)
- data-ingestion-service (Cloud Run)

Database:
- Shared Postgres (or separate DBs per service)

Communication:
- HTTP/REST between services
```

**Rejected Because:**
- ❌ Operational complexity (5 deployments, 5 builds, 5 observability surfaces)
- ❌ Network overhead (classification → valuation = HTTP call, latency + retry logic)
- ❌ Distributed transactions (valuation depends on classification; how to ensure consistency?)
- ❌ No scaling benefit (V1 doesn't need independent scaling)
- ❌ Higher cost (5 Cloud Run services vs 1)
- ❌ Violates "minimal operational burden" constraint
- ✅ Would be appropriate for 100+ person team, millions of users (not V1 context)

---

### Alternative 2: Traditional Monolith (No Module Boundaries)

**Approach:**
```
src/
├── utils/
│   ├── classification.ts   # Mixed logic
│   ├── valuation.ts        # Mixed logic
│   └── ...
├── pages/                  # Next.js pages
└── api/                    # API routes
```

**Rejected Because:**
- ❌ No clear boundaries (classification logic scattered)
- ❌ Hard to test (tight coupling)
- ❌ Hard to refactor (unclear dependencies)
- ❌ Cannot extract to services later (no clear seams)
- ✅ Modular monolith gives structure without microservices overhead

---

### Alternative 3: Serverless Functions (Per-Function Deployment)

**Approach:**
- Each engine as separate serverless function (Cloud Functions / Lambda)
- Web app calls functions via HTTP
- Background jobs as separate functions

**Rejected Because:**
- ❌ Cold starts (classification function not used often, always cold)
- ❌ Distributed state (how to coordinate classification → valuation flow?)
- ❌ More complex than Cloud Run (function orchestration)
- ❌ Higher latency (HTTP calls between functions)
- ✅ Would be appropriate for event-driven, sporadic workloads (not V1 nightly batch)

---

## Implementation Notes

### Module Isolation Rules

**Each module MUST:**
1. Export a public API (service classes, types)
2. Keep implementation details private (repositories, internal utilities)
3. Not import from other modules' internals (only from public exports)
4. Own its database access (via repository pattern)

**Example:**
```typescript
// ✅ GOOD: Import from module's public API
import { ClassificationService } from '@/modules/classification/classification.service';

// ❌ BAD: Import from module's internals
import { ClassificationRepository } from '@/modules/classification/classification.repository';
```

### Dependency Direction

**Allowed:**
- `monitoring` depends on `classification`, `valuation` (needs their outputs)
- `valuation` depends on `classification` (needs classification for thresholds)
- `auth` is independent (no dependencies on domain modules)
- All modules can depend on `shared` (db, logger, errors)

**Not Allowed:**
- `classification` depends on `valuation` (creates cycle)
- `shared` depends on domain modules (creates tight coupling)

### Testing Strategy

**Unit Tests:**
- Test each module in isolation
- Mock dependencies (use dependency injection)
- Fast, focused tests

**Integration Tests:**
- Test cross-module flows (e.g., classification → valuation)
- Use in-memory Postgres for fast tests
- Test full pipeline (data ingestion → classification → valuation → alerts)

**E2E Tests:**
- Test full user flows (sign in → view alerts → inspect stock)
- Use test database
- Minimal (expensive, slow)

---

## Migration Path to Microservices (If Needed)

If V1 outgrows modular monolith (unlikely, but possible):

**Step 1: Extract High-Load Module**
- Identify bottleneck (e.g., classification is CPU-heavy)
- Extract `classification` module to `classification-service`
- Replace in-process calls with HTTP calls
- Keep other modules in monolith

**Step 2: Extract Incrementally**
- Extract one module at a time
- Each extraction is independent, low-risk
- No need to extract all modules (keep what works in monolith)

**Estimated Effort per Service:** 1-2 weeks (thanks to clear module boundaries)

---

## Related Decisions

- **ADR-008:** Google Cloud Platform (single Cloud Run service)
- **ADR-010:** TypeScript + Next.js (full-stack monolith framework)
- **ADR-002:** Nightly batch orchestration (sequential pipeline in single process)
- **RFC-006:** Platform architecture (modular monolith deployment)

---

## Notes

- Modular monolith is the **default best practice** for V1/MVP systems
- Microservices should be adopted based on **demonstrated need**, not speculation
- Clear module boundaries make future extraction straightforward if needed
- V1 characteristics (small scale, sequential processing, single team) perfectly suit modular monolith

---

**END ADR-009**
