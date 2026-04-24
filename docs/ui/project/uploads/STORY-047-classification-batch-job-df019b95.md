# STORY-047 — Classification Recompute Batch Job

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the nightly batch job that runs `classifyStock()` for every `in_universe=TRUE` stock and persists results via `persistClassification()`. The job runs after the fundamentals and enrichment pipeline completes (target: 8 PM ET). It includes `shouldRecompute()` logic to skip re-classification when no material fundamental change has occurred, and fills the existing `/api/cron/classification` placeholder.

## Story
As the classification system,
I want a nightly batch job to classify all in-universe stocks and persist the results,
so that the universe screen always shows up-to-date classifications.

## Outcome
The existing `POST /api/cron/classification` placeholder is implemented. It iterates all `in_universe=TRUE` stocks, calls `classifyStock()`, conditionally persists via `persistClassification()`, and reports a summary. Cloud Scheduler already has this job configured (from STORY-007); this story provides the implementation.

## Scope In
- Implement `POST /api/cron/classification` handler (replaces placeholder in `src/app/api/cron/classification/route.ts`)
- Authentication: OIDC via existing `verifySchedulerToken` (already in placeholder — do NOT change to bearer secret)
- `shouldRecompute(current: ClassificationInput, previous: ClassificationInput | null)` → `boolean`:
  - `true` if: previous is null (never classified), `revenue_growth_fwd` delta > 5%, `eps_growth_fwd` delta > 5%, any flag changed
  - `false` if all critical fields within tolerance (no re-classify, reduce DB writes)
  - 5% threshold is per user decision (2026-04-23); documented in code and ADR-013 notes
  - **Previous input source:** read from `classification_state.input_snapshot` (persisted by STORY-044). The `shouldRecompute` caller passes `getClassificationState(ticker)?.input_snapshot` as the `previous` argument. This is the ONLY source of prior input — do NOT read historical stock records.
- Batch loop: `WHERE in_universe = TRUE` stocks only:
  - Do NOT re-classify `in_universe = FALSE` stocks; their `classification_state` is preserved for audit but not updated
  - For each in-universe stock: build current `ClassificationInput` from `stocks` row + enrichment; read `previous = getClassificationState(ticker)?.input_snapshot`; call `shouldRecompute(current, previous)`; if true → `classifyStock(current)` → `persistClassification(ticker, result, current)`
- Error isolation: failure on one stock does not abort batch; log error and continue
- Job summary response: `{ processed: n, recomputed: n, skipped: n, errors: n, duration_ms: n }`
- Structured log per stock outcome (recomputed / skipped / error)

## Scope Out
- Manual single-stock reclassify trigger (post-V1)
- User-triggered reclassification
- Cloud Scheduler YAML (already configured in STORY-007 for 8 PM ET at `/api/cron/classification`)

## Dependencies
- Epic: EPIC-004
- RFC: RFC-001 §Classification Batch Job, §shouldRecompute
- ADR: ADR-008 (cron job security — OIDC via `verifySchedulerToken`, not bearer secret)
- ADR: ADR-002 (nightly batch pipeline order — classification runs at 8 PM ET, after fundamentals pipeline)
- Upstream: STORY-043 (`classifyStock`)
- Upstream: STORY-044 (`persistClassification`, `getClassificationState`)
- Upstream: EPIC-003.1 (E1–E6 scores available in `stocks` table)
- Infrastructure: existing `/api/cron/classification` placeholder (STORY-008)

## Preconditions
- `classifyStock()` implemented (STORY-043)
- `persistClassification()` implemented (STORY-044)
- `stocks` table with `in_universe` boolean column populated (EPIC-003)
- `stocks` table populated with fundamentals and enrichment (EPIC-003, EPIC-003.1)

## Inputs
- `POST /api/cron/classification`: OIDC Bearer token from Cloud Scheduler service account
- Reads all `in_universe = TRUE` rows from `stocks` table
- Reads `classification_state` for delta comparison via `getClassificationState`

## Outputs
- Upserts to `classification_state`, conditional inserts to `classification_history`
- HTTP 200 with JSON summary: `{ processed, recomputed, skipped, errors, duration_ms }`
- Structured logs per stock

## Acceptance Criteria
- [ ] `POST /api/cron/classification` implemented (replaces placeholder)
- [ ] Authentication: `verifySchedulerToken` used (OIDC, not bearer secret) — matches existing pattern
- [ ] Invalid or missing OIDC token → 401
- [ ] Batch query uses `WHERE in_universe = TRUE` — dropped stocks are not re-classified
- [ ] `shouldRecompute()` returns `true` when `revenue_growth_fwd` changes by > 5%
- [ ] `shouldRecompute()` returns `false` when no critical field changes exceed threshold
- [ ] `shouldRecompute()` returns `true` when previous is null (first classification)
- [ ] `shouldRecompute()` returns `true` when any flag changes (`binary_flag`, `holding_company_flag`, etc.)
- [ ] Single stock error during batch → logged, other stocks continue, `errors` count incremented
- [ ] Job summary response: `{ processed, recomputed, skipped, errors, duration_ms }` all present
- [ ] After job runs against test DB with 5 in-universe stocks → all 5 have `classification_state` rows
- [ ] `in_universe=FALSE` stock skipped and NOT in `classification_state` updated rows

## Test Strategy Expectations
- **Unit tests:**
  - `shouldRecompute`: null previous → true
  - `shouldRecompute`: revenue_growth_fwd change 10% → 16% (delta 6%) → true
  - `shouldRecompute`: revenue_growth_fwd change 10% → 10.2% (delta 0.2%) → false
  - `shouldRecompute`: flag change (`binary_flag` true → false) → true
  - Error isolation: mock one stock to throw → batch continues, summary.errors = 1
- **Integration tests:**
  - Run endpoint against test DB (dev OIDC bypass) with 5 in-universe stocks, no prior state → all 5 processed, 5 recomputed
  - Run twice with no data change → second run: 0 recomputed, 5 skipped
  - Run with one stock's `revenue_growth_fwd` changed by 6% → second run recomputes only that stock
  - `in_universe=FALSE` stock: verify it does not appear in recomputed count
  - Unauthenticated request (in prod mode) → 401
- **Contract/schema tests:**
  - Response shape: `{ processed: number, recomputed: number, skipped: number, errors: number, duration_ms: number }`
- **BDD acceptance tests:**
  - "Given 5 in-universe stocks with no prior classification, when POST /api/cron/classification, then all 5 have suggested_code"
  - "Given MSFT data unchanged, when batch runs twice, then second run skips MSFT"
  - "Given stock with in_universe=FALSE, when batch runs, then its classification_state is not updated"

## Regression / Invariant Risks
- **in_universe filter removed:** if `WHERE in_universe = TRUE` is dropped, dropped stocks get reclassified (wasting compute, overwriting audit state) — explicit test that in_universe=FALSE stocks are skipped
- **Auth pattern change:** if `verifySchedulerToken` is replaced with bearer secret, Cloud Scheduler jobs fail in production — contract test that route uses the OIDC pattern
- **shouldRecompute always-true bug:** if threshold comparison logic is wrong, every run re-classifies everything — log `skipped` count; test that unchanged data results in skipped > 0

## Key Risks / Edge Cases
- **Large universe (1000+ stocks):** batch loop must not time out Cloud Run request; if total processing exceeds 55s (Cloud Run max before scheduler timeout), implement chunked processing. For V1, log a warning if duration_ms > 45000.
- **Missing enrichment scores:** E1–E6 null for some stocks — `classifyStock()` handles this via optional enrichment (STORY-041/043)
- **Concurrent triggering:** Cloud Scheduler fires twice (e.g., retry on timeout) — Prisma upsert is idempotent; double-run produces same state

## Definition of Done
- [ ] `POST /api/cron/classification` implemented (placeholder replaced)
- [ ] `shouldRecompute()` implemented and exported from `src/domain/classification/`
- [ ] Unit + integration tests for `shouldRecompute` and batch endpoint
- [ ] Error isolation test passing
- [ ] `in_universe=FALSE` skip test passing
- [ ] Traceability comments reference RFC-001 §Classification Batch Job, ADR-008, ADR-002
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 §Classification Batch Job, §shouldRecompute
- ADR: ADR-008 (cron job security — OIDC); ADR-002 (nightly batch pipeline)
