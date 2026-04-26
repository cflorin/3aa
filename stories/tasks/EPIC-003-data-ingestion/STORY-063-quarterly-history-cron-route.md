# STORY-063 — Quarterly History Cron Route & Cloud Scheduler Job

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Implement the `POST /api/cron/quarterly-history` route and the corresponding Cloud Scheduler job at 6:45 PM ET. The route orchestrates the full quarterly history pipeline: sync → TTM derivation → trend computation. Supports `?force=true` for Sunday full-scan mode and `?ticker=AAPL` for ad-hoc single-stock runs.

## Story
As the **nightly batch pipeline**,
I want **a cron-authenticated POST route at `/api/cron/quarterly-history` that orchestrates the quarterly history sync and derived metrics computation in sequence**,
so that **the full quarterly history pipeline runs automatically at 6:45 PM ET and can also be triggered on demand**.

## Outcome
- `POST /api/cron/quarterly-history` route in `src/app/api/cron/quarterly-history/route.ts`
- Authenticates via `verifySchedulerToken` (same pattern as all other cron routes)
- Query params: `?force=true` (full scan mode, bypasses change detection), `?ticker=AAPL` (ad-hoc single-stock)
- Orchestration: calls `syncQuarterlyHistory({ forceFullScan, tickerFilter })` → for each updated ticker, calls `computeDerivedMetrics(ticker)` + `computeTrendMetrics(ticker)`
- Returns JSON: `{ ok: true, summary: { stocks_processed, stocks_updated, quarters_upserted, stocks_skipped, errors, duration_ms } }`
- Structured logging: `quarterly_history_cron_started`, `quarterly_history_cron_complete` with summary
- Cloud Scheduler job: `quarterly-history-sync` at 6:45 PM ET Mon–Sun (OIDC-authenticated, same pattern as existing jobs)
- STORY-003 task file updated to include this 8th Cloud Scheduler job
- `cloudbuild.yaml` scheduler stanza added for `quarterly-history-sync`

## Scope In
- `src/app/api/cron/quarterly-history/route.ts`
- Route wires together STORY-060 sync + STORY-061 TTM computation + STORY-062 trend computation
- `verifySchedulerToken` guard (existing utility)
- Cloud Scheduler job definition (`cloudbuild.yaml` or deployment config)
- Ad-hoc `?force=true` param for Sunday backstop or manual reruns
- `?ticker=AAPL` param for ad-hoc single-stock runs without cycling all in-universe stocks

## Scope Out
- The sync service implementation (STORY-060)
- The TTM computation service (STORY-061)
- The trend computation service (STORY-062)
- Admin UI trigger for this route (can be called via existing admin infrastructure)

## Dependencies
- **Epic:** EPIC-003
- **RFCs:** RFC-004 Amendment 2026-04-25 (pipeline stage position), RFC-008 §Ingestion Sync Architecture
- **ADRs:** ADR-002 Amendment 2026-04-25 (6:45 PM ET slot), ADR-016 §Pipeline Position
- **Upstream:** STORY-060, STORY-061, STORY-062 (services to orchestrate), STORY-003 (Cloud Scheduler pattern)

## Preconditions
- `syncQuarterlyHistory`, `computeDerivedMetrics`, `computeTrendMetrics` services implemented
- `verifySchedulerToken` utility available
- Cloud Scheduler OIDC pattern established (STORY-003)

## Inputs
- HTTP POST from Cloud Scheduler (OIDC token in Authorization header)
- Optional: `?force=true` (full scan), `?ticker=AAPL` (single stock)

## Outputs
- HTTP 200 with JSON summary on success
- HTTP 401 on invalid/missing scheduler token
- HTTP 500 on unexpected error (per-stock errors are captured in summary, not surfaced as 500)
- Cloud Scheduler job created at 6:45 PM ET

## Acceptance Criteria
- [ ] Route returns 401 if scheduler token is missing or invalid
- [ ] Without `?force=true`, change-detection mode is used (only changed stocks trigger derivation)
- [ ] With `?force=true`, all in-universe stocks are synced and derived unconditionally
- [ ] With `?ticker=AAPL`, only that stock is processed (regardless of force flag)
- [ ] Derivation (TTM + trend) runs only for stocks where sync reported `updated = true` (or force mode)
- [ ] Summary JSON matches `{ stocks_processed, stocks_updated, quarters_upserted, stocks_skipped, errors, duration_ms }`
- [ ] Cloud Scheduler job created at `0 45 23 * * *` UTC (6:45 PM ET) with OIDC auth
- [ ] Route protected identically to existing cron routes (`/api/cron/fundamentals`, etc.)
- [ ] Unit tests cover: valid token → orchestration called; invalid token → 401; force param passed through; ticker filter passed through

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-004 Amendment 2026-04-25, RFC-008 §Ingestion Sync Architecture
- ADR: ADR-002 Amendment 2026-04-25 (6:45 PM ET slot), ADR-016 §Pipeline Position
