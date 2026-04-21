# STORY-015: Provider Abstraction Layer

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Status:** done ✅
**Dependencies:** EPIC-001 STORY-004 (database schema), EPIC-001 STORY-008 (TypeScript project)
**Estimated Complexity:** Medium
**Completed:** 2026-04-20

## Story Overview

Define the `VendorAdapter` interface that all provider implementations must satisfy, and implement the `ProviderOrchestrator` service that coordinates provider selection, field-level fallback, provenance recording, and exponential-backoff retry. This is the foundation every sync job and every provider adapter in EPIC-003 depends on.

## Acceptance Criteria

1. `VendorAdapter` interface exported with all five methods and both capability properties
2. Canonical shared types (`UniverseStock`, `PriceData`, `FundamentalData`, `ForwardEstimates`, `StockMetadata`, `FieldResult<T>`, `ProvenanceEntry`) defined and exported
3. `fetchFieldWithFallback` returns first non-null value with `fallback_used: false` when primary succeeds
4. If primary returns null, next provider tried and `fallback_used: true`
5. All providers null → `{ value: null, source_provider: 'none', fallback_used: true }`
6. Empty providers array → `{ value: null, source_provider: 'none', fallback_used: false }` without throwing
7. `withRetry` retries on 5xx and network errors; throws immediately on 4xx
8. Exponential backoff: `baseDelayMs × 2^attempt`; configurable max attempts
9. After all attempts exhausted, original error re-thrown
10. Structured log emitted per fallback event and per retry attempt

## Evidence Required

- [x] 25 unit tests passing (`npx jest tests/unit/data-ingestion/provider-orchestrator.test.ts retry.util.test.ts`)
- [x] No live API calls — pure logic, no I/O
- [x] TypeScript compiles without errors

## Task Breakdown

### TASK-015-001: Define Canonical Types and VendorAdapter Interface ✅

**Description:** Create all shared TypeScript types used across the data ingestion module and define the `VendorAdapter` interface contract.

**Acceptance Criteria:**
- `src/modules/data-ingestion/types.ts` exports: `UniverseStock`, `PriceData`, `FundamentalData` (15 fields), `ForwardEstimates`, `StockMetadata`, `FieldResult<T>`, `ProvenanceEntry`
- `src/modules/data-ingestion/ports/vendor-adapter.interface.ts` exports: `VendorAdapter` (5 methods), `ProviderCapabilities`
- `FieldResult<T>` shape: `{ value: T | null; source_provider: string; synced_at: Date; fallback_used: boolean }`
- `FundamentalData` has all 15 RFC-001 canonical fields

**Files Created:**
- `src/modules/data-ingestion/types.ts`
- `src/modules/data-ingestion/ports/vendor-adapter.interface.ts`

**Completed:** 2026-04-20
**Evidence:** TypeScript compiles; all dependent files import without error

---

### TASK-015-002: Implement withRetry Exponential Backoff Utility ✅

**Description:** Implement `withRetry<T>()` with exponential backoff, transient error detection, and structured logging.

**Acceptance Criteria:**
- Retries on `HttpStatusError` with status >= 500
- Retries on network/timeout errors (message contains "network" or "timeout")
- Throws immediately on 4xx without retrying
- Backoff: `baseDelayMs × 2^attempt` (100ms → 200ms → 400ms for baseDelayMs=100)
- Re-throws original error after `maxAttempts` exhausted
- Structured log: `{ event: 'provider_retry', attempt, maxAttempts, delayMs, error }`
- `isTransientError()` exported as standalone testable function

**Files Created:**
- `src/modules/data-ingestion/retry.util.ts` — `HttpStatusError`, `isTransientError()`, `withRetry()`

**Completed:** 2026-04-20
**Evidence:** 18 unit tests passing; backoff delays verified with fake timers

---

### TASK-015-003: Implement ProviderOrchestrator ✅

**Description:** Implement `ProviderOrchestrator.fetchFieldWithFallback<T>()` with provider iteration, fallback logic, and provenance tracking.

**Acceptance Criteria:**
- Tries providers in array order; returns first non-null result immediately
- Each provider call wrapped in `withRetry`
- `fallback_used: true` iff at least one provider was skipped before the successful one
- Empty providers array returns `fallback_used: false` (no providers were skipped)
- All providers null/failed returns `{ value: null, source_provider: 'none', fallback_used: true }`
- Structured log on fallback: `{ event: 'provider_fallback', ticker, fieldName, failedProvider, nextProvider }`

**Files Created:**
- `src/modules/data-ingestion/provider-orchestrator.ts` — `ProviderOrchestrator` class

**Completed:** 2026-04-20
**Evidence:** 7 unit tests passing; all fallback/provenance edge cases covered

---

### TASK-015-004: Unit Tests ✅

**Description:** Write unit tests for `withRetry`, `isTransientError`, and `ProviderOrchestrator.fetchFieldWithFallback`.

**Acceptance Criteria:**
- `withRetry`: success path, 5xx retry, 4xx immediate throw, exhaustion after maxAttempts, exponential backoff (fake timers), maxAttempts=1, network retry, timeout retry, 403 no-retry
- `isTransientError`: 500/503 → true; 400/401/404 → false; network/timeout message → true; generic Error → false; non-Error → false
- `ProviderOrchestrator`: primary wins (fallback_used=false, secondary not called), null triggers fallback (fallback_used=true), all-null result, empty array no-throw, 4xx fallthrough to next provider, single provider throws, synced_at is valid Date

**Files Created:**
- `tests/unit/data-ingestion/retry.util.test.ts` — 18 tests
- `tests/unit/data-ingestion/provider-orchestrator.test.ts` — 7 tests

**Completed:** 2026-04-20
**Evidence:** 25 tests total, all passing

---

### TASK-015-005: Update Implementation Log and Plan ✅

**Description:** Update tracking documents to record STORY-015 completion.

**Acceptance Criteria:**
- Implementation log entry for STORY-015 with files changed, test counts, result
- Implementation plan STORY-015 status → done ✅

**Files Modified:**
- `docs/architecture/IMPLEMENTATION-LOG.md`
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md`

**Completed:** 2026-04-20

---

## Summary

**Total Tasks:** 5
**Status:** All tasks complete ✅
**Duration:** Single session (2026-04-20)

**Evidence Provided:**
- 25 unit tests passing (18 retry + 7 orchestrator)
- No live API calls — no credentials required
- TypeScript compiles cleanly
- All 10 acceptance criteria satisfied

---

## Traceability

**PRD Reference:** Section 15 (Data Requirements)
**RFC Reference:** RFC-004 §Provider Abstraction Layer
**ADR References:**
- ADR-001 (Multi-Provider Data Architecture)
- ADR-009 (Modular Monolith)
- ADR-010 (TypeScript)

---

**Created:** 2026-04-20
**Last Updated:** 2026-04-20
