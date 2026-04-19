# ADR-010: Technology Stack - TypeScript + Next.js + Prisma

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-006 (Platform Architecture), ADR-008 (GCP), ADR-009 (Modular Monolith)

---

## Context

The 3AA Monitoring Product V1 requires a technology stack for:
- Web application (authenticated, 5 screens)
- Backend API (user management, data queries, background jobs)
- Database access (Postgres, RFC-002 schemas)
- Background job processing (nightly batch, ADR-002)

**The Question:** What language, framework, and ORM should V1 use?

### V1 Requirements

- **Type safety:** Complex business logic (classification scoring, threshold derivation)
- **Full-stack:** Frontend + backend in single codebase (modular monolith, ADR-009)
- **Database:** Postgres with type-safe queries (ADR-008)
- **Deployment:** Cloud Run containers (ADR-008)
- **Autonomy:** Claude should be able to develop with minimal guidance
- **Developer velocity:** Fast iteration, good DX

### Stack Options

**Language:**
- TypeScript (type safety, JavaScript ecosystem)
- Python (data science friendly, simpler syntax)
- Go (performance, concurrency)

**Framework:**
- Next.js (React + API routes, full-stack)
- Express.js (Node.js backend, separate React frontend)
- FastAPI (Python backend, separate React frontend)

**ORM:**
- Prisma (TypeScript-first, type-safe)
- TypeORM (TypeScript, decorator-based)
- Drizzle (TypeScript, lightweight)
- Raw SQL (no ORM)

---

## Decision

V1 shall use:

- **Language:** TypeScript
- **Framework:** Next.js 14+ (App Router)
- **ORM:** Prisma
- **Database:** Postgres 15+ (confirmed from RFC-002)

### Stack Details

| Component | Choice | Version |
|-----------|--------|---------|
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

### Technology Rationale

**TypeScript:**
- Type safety for complex business logic (classification, valuation, threshold derivation)
- Catch errors at compile time (not runtime)
- Excellent IDE support (autocomplete, refactoring)
- Large ecosystem (npm packages)

**Next.js:**
- Full-stack framework (frontend + backend in one codebase)
- App Router: Server components, streaming, RSC architecture
- API routes: RESTful endpoints for background jobs, user actions
- Built-in auth patterns
- Excellent deployment to Cloud Run (official Next.js + GCP guides)

**Prisma:**
- Type-safe database access (queries return typed objects)
- Schema-first: Define models in `schema.prisma`, auto-generate TypeScript types
- Excellent migrations (declarative schema changes)
- Query performance (generates efficient SQL)
- Great DX (autocomplete for queries)

---

## Rationale

### Why TypeScript?

**1. Type Safety for Complex Logic**

The 3AA framework has complex business rules:
- Classification engine: 8 buckets × scoring rules × confidence levels
- Valuation engine: Metric selection × threshold derivation × TSR hurdles
- Monitoring engine: State diffs × alert generation × deduplication

**Without types:**
```javascript
// ❌ JavaScript: Easy to pass wrong data
function deriveThresholds(code) {
  const bucket = code[0]; // String or number? Who knows.
  const adjustments = calculateAdjustments(code);
  return { max: adjustments.max }; // Typo? Runtime error.
}
```

**With types:**
```typescript
// ✅ TypeScript: Compile-time errors
interface ClassificationCode {
  bucket: number; // 1-8
  earningsQuality: 'A' | 'B' | 'C';
  balanceSheetQuality: 'A' | 'B' | 'C';
}

function deriveThresholds(code: ClassificationCode): Thresholds {
  const bucket = code.bucket; // number
  const adjustments = calculateAdjustments(code);
  return { max: adjustments.max }; // Autocomplete, type-checked
}
```

**2. Large Ecosystem**
- npm: 2 million+ packages
- Any library needed is available (data providers, charting, auth, etc.)
- Active community, extensive documentation

**3. Familiar to Claude**
- TypeScript is common in Claude's training data
- Well-documented patterns, best practices
- Easier for autonomous development (autonomy goal)

### Why NOT Python?

**Weaker Type System:**
- Python has optional typing (`mypy`), but not enforced at runtime
- Type hints are less robust than TypeScript (no structural typing)
- Easy to skip types (defeats the purpose)

**No Full-Stack Framework:**
- FastAPI is backend-only (would need separate React frontend)
- Django is monolithic but not ideal for modern React apps
- Would require 2 codebases (backend + frontend) = more complexity

**Not Best for V1:**
- Python excels at data science, ML, notebooks
- V1 doesn't have ML/data science (deterministic rules, RFC-001/003)
- Could consider Python for V2 if ML classification added

### Why NOT Go?

**Learning Curve:**
- Go syntax unfamiliar to many developers
- Smaller ecosystem than JavaScript/TypeScript
- Less common for web apps (more common for infrastructure)

**No Full-Stack Framework:**
- Go is backend-only (would need separate React frontend)
- Would require 2 codebases

**Overkill for V1:**
- Go excels at performance, concurrency
- V1 is nightly batch (sequential), not high-throughput real-time
- Performance is not a bottleneck

---

### Why Next.js?

**1. Full-Stack Framework**
- **Frontend:** React components (UI for 5 screens)
- **Backend:** API routes (background jobs, user actions)
- **Single codebase:** No need for separate frontend/backend repos

**2. App Router (Next.js 14+)**
- Server components: Render on server, reduce client JS
- Streaming: Progressive page rendering (better UX)
- Layouts: Shared layouts for authenticated routes
- File-based routing: Intuitive route structure

**3. Built-In Features**
- Image optimization
- Font optimization
- Code splitting (automatic)
- SEO-friendly (server-side rendering)

**4. Excellent Cloud Run Deployment**
- Official Next.js + GCP guides
- Docker support (standalone output mode)
- Works great with Cloud Run (serverless containers)

**5. Auth Patterns**
- Easy to implement custom auth (middleware, server components)
- Session cookies, protected routes

### Why NOT Express.js?

**Requires Separate Frontend:**
- Express is backend-only
- Would need separate React app (Vite, Create React App)
- Two codebases = more complexity

**No Built-In Features:**
- No SSR, no code splitting, no optimizations
- Would need to build from scratch

**Not Full-Stack:**
- Violates modular monolith goal (ADR-009)

### Why NOT Other Frameworks?

**Remix:**
- Similar to Next.js, but smaller ecosystem
- Next.js more mature, better Cloud Run support

**SvelteKit:**
- Smaller ecosystem than React
- Less familiar to Claude (autonomy goal)

**Nuxt (Vue):**
- Vue ecosystem smaller than React
- React more common in enterprise/production apps

---

### Why Prisma?

**1. Type-Safe Queries**

**Without Prisma:**
```typescript
// ❌ Raw SQL: No types, easy to make mistakes
const result = await db.query('SELECT * FROM stocks WHERE ticker = $1', [ticker]);
const stock = result.rows[0]; // Type: any (no autocomplete)
```

**With Prisma:**
```typescript
// ✅ Prisma: Type-safe, autocomplete
const stock = await prisma.stock.findUnique({
  where: { ticker },
  include: { classificationState: true }
});
// stock is typed! Autocomplete for stock.ticker, stock.marketCap, etc.
```

**2. Schema-First Workflow**

Define schema once, auto-generate TypeScript types:

```prisma
// prisma/schema.prisma
model Stock {
  ticker    String @id
  name      String
  marketCap Decimal
  sector    String
  classificationState ClassificationState?
}

model ClassificationState {
  ticker         String @id
  suggestedCode  String
  confidenceLevel String
  stock          Stock @relation(fields: [ticker], references: [ticker])
}
```

Prisma auto-generates:
- TypeScript types (`Stock`, `ClassificationState`)
- Type-safe client (`prisma.stock.findMany()`)

**3. Excellent Migrations**

Declarative schema changes:

```bash
# Modify schema.prisma (e.g., add column)
# Generate migration
npx prisma migrate dev --name add_override_reason

# Prisma auto-generates SQL migration
# Apply to database
```

Migrations are versioned, reproducible, safe.

**4. Query Performance**

Prisma generates efficient SQL:
- Automatic joins (via `include`)
- Query batching (reduce round-trips)
- Connection pooling (PgBouncer-compatible)

### Why NOT TypeORM?

**Decorator-Based (Less Intuitive):**
```typescript
// TypeORM: Decorators everywhere
@Entity()
class Stock {
  @PrimaryColumn()
  ticker: string;

  @Column()
  name: string;

  @OneToOne(() => ClassificationState)
  classificationState: ClassificationState;
}
```

**Migrations Less Smooth:**
- TypeORM migrations require manual SQL writing
- Prisma auto-generates migrations from schema changes

**Less Active Development:**
- Prisma has more momentum, better DX
- TypeORM development slower in recent years

### Why NOT Drizzle?

**Newer, Less Mature:**
- Drizzle is excellent, but newer (less battle-tested)
- Prisma more mature, larger community

**Good Alternative:**
- If Prisma performance becomes issue, Drizzle is good fallback
- But V1 scale doesn't require this

### Why NOT Raw SQL?

**No Type Safety:**
- Queries return `any`
- Easy to make mistakes (typos, wrong column names)

**Manual Migrations:**
- Would need custom migration system
- Prisma migrations are automatic, safe

**More Boilerplate:**
- Need to write SQL for every query
- Prisma generates SQL from schema

---

## Consequences

### Positive ✅

**Type Safety:**
- Catch errors at compile time (not runtime)
- Autocomplete for database queries, API responses, domain logic
- Refactoring is safe (TypeScript finds all usages)

**Developer Velocity:**
- Next.js full-stack = single codebase
- Prisma migrations = declarative schema changes
- Hot module reloading (fast iteration)

**Database Access:**
- Type-safe queries (no SQL injection, no typos)
- Excellent performance (Prisma generates efficient SQL)
- Connection pooling (handles Cloud Run scaling)

**Deployment:**
- Next.js standalone output mode → Docker → Cloud Run
- Official guides for Next.js + GCP
- Simple deployment (`gcloud run deploy`)

**Autonomy:**
- TypeScript/Next.js/Prisma are common, well-documented
- Claude familiar with this stack
- Easy to develop autonomously

**Testing:**
- Vitest: Fast, modern test runner
- Testing Library: User-centric component tests
- Prisma: In-memory Postgres for fast integration tests

### Negative ⚠️

**JavaScript Ecosystem Churn:**
- npm packages update frequently (breaking changes)
- Next.js releases new major versions (migration effort)
- **Mitigation:** Pin versions, update incrementally

**Build Complexity:**
- TypeScript compilation, bundling, minification
- Next.js build process (can be slow for large apps)
- **Mitigation:** V1 is small, builds are fast (<1 min)

**Prisma Limitations:**
- Not ideal for extremely complex SQL (raw queries available as escape hatch)
- **Mitigation:** V1 queries are straightforward (no complex joins)

**Node.js Performance:**
- Slower than Go for CPU-intensive tasks
- **Mitigation:** V1 is I/O-bound (database, API calls), not CPU-bound

---

## Alternatives Considered

### Alternative 1: Python + FastAPI + SQLAlchemy

**Approach:**
- Python 3.11+
- FastAPI for backend API
- SQLAlchemy for ORM
- Separate React frontend (Vite)

**Rejected Because:**
- ❌ Two codebases (backend + frontend)
- ❌ Weaker type system (mypy optional, not enforced)
- ❌ No full-stack framework (FastAPI is backend-only)
- ❌ Less ideal for V1 (Python better for data science, which V1 doesn't have)
- ✅ Would be appropriate for V2 if ML classification added

---

### Alternative 2: Go + Gin + GORM

**Approach:**
- Go 1.21+
- Gin web framework for backend API
- GORM for ORM
- Separate React frontend (Vite)

**Rejected Because:**
- ❌ Two codebases (backend + frontend)
- ❌ Go less familiar (autonomy goal)
- ❌ Overkill for V1 (Go best for high-performance/concurrent systems)
- ❌ Smaller ecosystem than JavaScript/TypeScript
- ✅ Would be appropriate for V2 if extreme performance needed

---

### Alternative 3: TypeScript + Express + TypeORM

**Approach:**
- TypeScript + Express.js for backend
- TypeORM for ORM
- Separate React frontend (Vite)

**Rejected Because:**
- ❌ Two codebases (backend + frontend)
- ❌ TypeORM less polished than Prisma (migrations, DX)
- ❌ Express requires more boilerplate than Next.js
- ✅ Next.js gives full-stack in single codebase (simpler)

---

### Alternative 4: Next.js + Drizzle

**Approach:**
- Same as chosen stack, but Drizzle ORM instead of Prisma

**Rejected for V1 Because:**
- ❌ Drizzle newer, less mature (Prisma more battle-tested)
- ❌ Smaller community, fewer resources
- ✅ Good alternative if Prisma performance becomes issue (unlikely for V1)
- ✅ Can migrate to Drizzle later if needed

---

## Implementation Notes

### Project Structure

```
3aa-monitoring/
├── src/
│   ├── modules/           # Domain modules (ADR-009)
│   ├── app/               # Next.js App Router
│   └── lib/               # Shared utilities
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── migrations/        # SQL migrations
│   └── seed.ts            # Database seeding
├── public/                # Static assets
├── package.json
├── tsconfig.json
├── next.config.js
└── Dockerfile
```

### Database Schema (Prisma)

Prisma schema will match RFC-002 SQL schemas:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Stock {
  ticker    String @id @db.VarChar(10)
  name      String @db.VarChar(255)
  marketCap Decimal @db.Decimal(20, 2)
  sector    String @db.VarChar(100)
  inUniverse Boolean @default(true)

  classificationState ClassificationState?
  valuationState      ValuationState?

  @@map("stocks")
}

model ClassificationState {
  ticker           String @id @db.VarChar(10)
  suggestedCode    String @db.VarChar(5)
  confidenceLevel  String @db.VarChar(10)
  reasonCodes      Json   @db.JsonB
  scores           Json   @db.JsonB

  stock Stock @relation(fields: [ticker], references: [ticker])

  @@map("classification_state")
}

// ... (all other tables from RFC-002)
```

### Next.js Configuration

```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // For Docker deployment
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

### Development Workflow

```bash
# Setup
npm install
npx prisma migrate dev   # Create database schema
npx prisma generate      # Generate Prisma client
npm run dev              # Start dev server

# Testing
npm run test             # Run tests
npm run test:watch       # Watch mode

# Production build
npm run build            # Build for production
npm start                # Start production server

# Database
npx prisma studio        # GUI database browser
npx prisma migrate dev   # Create migration
npx prisma db push       # Sync schema (dev only)
```

---

## Migration Path (If Needed)

If V1 needs to migrate stack (unlikely):

**To Python:**
- Rewrite TypeScript modules to Python
- Use FastAPI for API layer
- Use SQLAlchemy for ORM (Prisma schema → SQLAlchemy models)
- Database schema remains same (Postgres)

**To Go:**
- Rewrite TypeScript modules to Go
- Use Gin/Echo for API layer
- Use GORM for ORM
- Database schema remains same (Postgres)

**To Microservices:**
- Extract modules to separate services (ADR-009 migration path)
- Each service can use different language if needed
- Database schema shared or split by service

**Estimated Effort:** 4-8 weeks for full rewrite (significant, but possible if justified)

---

## Related Decisions

- **ADR-009:** Modular monolith (single Next.js app)
- **ADR-008:** Google Cloud Platform (Cloud Run deployment)
- **RFC-002:** Database schema (Prisma schema will match)
- **ADR-011:** Authentication strategy (custom auth in Next.js middleware)

---

## Notes

- TypeScript + Next.js + Prisma is a **well-established, production-proven stack**
- Used by companies like Vercel, GitHub, Twitch, Netflix
- Excellent documentation, active community
- Strong fit for V1 requirements (type safety, full-stack, autonomy)

---

**END ADR-010**
