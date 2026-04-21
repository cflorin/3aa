# STORY-021 — Forward Estimates Sync Job

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Implement the daily forward estimates sync with a three-level fallback chain: FMP primary → Tiingo fallback → computed trailing fallback (forward PE derived from trailing PE and EPS growth estimate). This is the most complex sync job; it is critical for the valuation engine which requires `forward_pe` and `forward_ev_ebit` for zone assignment.

## Story
As the **data pipeline**,
I want **a daily forward estimates sync job with a three-level fallback chain**,
so that **the valuation engine has forward PE and EV/EBIT estimates for as many stocks as possible, with transparent provenance showing whether data came from a provider or was derived from trailing actuals**.

## Outcome
- `syncForwardEstimates()` updates `forward_pe` and `forward_ev_ebit` for all in-universe stocks
- Provider priority for forward estimates: FMP primary, Tiingo fallback (per ADR-001 — FMP has superior forward coverage)
- When both providers return null for `forward_pe` AND safe preconditions are met, computes: `forward_pe = trailing_pe / (1 + eps_growth_fwd / 100)` where `eps_growth_fwd` is stored as a percentage (e.g. 10 means 10%)
- Safety guardrails prevent computed fallback in unsafe conditions
- `forward_ev_ebit` has no computed fallback in V1
- Provenance records which level of the fallback chain was used; `provider: 'computed_trailing'` for computed fallback
- `POST /api/cron/estimates` endpoint triggers the job; OIDC-protected
- Cloud Scheduler daily job: Monday–Friday, 7:00 PM ET

## Scope In
- `src/modules/data-ingestion/jobs/forward-estimates-sync.service.ts` — `syncForwardEstimates()` function:
  - Queries `SELECT ticker, trailing_pe, eps_growth_fwd, cyclicality_flag FROM stocks WHERE in_universe = TRUE`
  - Level 1+2 (FMP primary, Tiingo fallback): `orchestrator.fetchFieldWithFallback('forward_pe', [FMPAdapter, TiingoAdapter])`
  - Level 3 — computed trailing fallback, invoked only when Levels 1+2 return null:
    - Formula: `forward_pe = trailing_pe / (1 + eps_growth_fwd / 100)`
    - `eps_growth_fwd` is stored as a percentage (10 = 10%); confirmed storage format
    - Safety guardrails — skip computed fallback (leave `forward_pe` null) if ANY of:
      - `trailing_pe` is null
      - `trailing_pe <= 0` (negative earnings or exactly breakeven)
      - `eps_growth_fwd` is null
      - `cyclicality_flag === TRUE`
    - Provenance: `{ provider: 'computed_trailing', synced_at: now, fallback_used: true }`
    - Log WARN when computed fallback skipped due to guardrail: `{ event: 'computed_fallback_skipped', reason, ticker }`
  - `forward_ev_ebit`: Level 1+2 only (FMP primary, Tiingo fallback); no Level 3
  - Does NOT overwrite existing non-null value with null
  - Updates `stocks.forward_pe`, `stocks.forward_ev_ebit`, `stocks.data_provider_provenance.forward_pe`, `stocks.data_provider_provenance.forward_ev_ebit`, `stocks.data_last_synced_at` (V1 proxy for `estimates_last_updated_at` — see BC-021-005)
  - Returns `{ stocks_updated, provider_count, computed_fallback_count, no_estimates_count, errors, duration_ms }` (see BC-021-004)
  - Structured logging: per-stock outcome; guardrail events at WARN
- `src/app/api/cron/estimates/route.ts` — `POST /api/cron/estimates`:
  - OIDC auth via `verifySchedulerToken()`; 401 if invalid
  - Returns 200 with summary JSON; 500 on uncaught error
- Cloud Scheduler job: Mon–Fri 7:00 PM ET, target `POST /api/cron/estimates`, OIDC service account

## Scope Out
- EV/EBIT computed fallback (only PE has computed fallback in V1)
- `estimates_last_updated_at` as a dedicated column — V1 uses `data_last_synced_at` as proxy (BC-021-005)
- Modifying `cyclicality_flag` (read-only here; set by classification engine in EPIC-004)
- Other forward metrics beyond `forward_pe` and `forward_ev_ebit`
- Historical estimate time series
- Alerting based on estimate changes (EPIC-006)
- Triggering valuation recompute (EPIC-005)

## Dependencies
- **Epic:** EPIC-003 — Data Ingestion & Universe Management
- **PRD:** Section 15 (Data Requirements — `forward_pe`, `forward_ev_ebit`)
- **RFCs:** RFC-002 (`stocks` table — `forward_pe`, `forward_ev_ebit`, `trailing_pe`, `eps_growth_fwd`, `cyclicality_flag`, `estimates_last_updated_at`, provenance), RFC-004 §Forward Estimates Sync
- **ADRs:** ADR-001 (FMP primary for forward estimates — strongest coverage), ADR-002 (daily 7pm ET slot), ADR-008 (Cloud Scheduler)
- **Upstream stories:** STORY-015 (ProviderOrchestrator), STORY-016 (TiingoAdapter), STORY-017 (FMPAdapter), STORY-018 (universe populated), STORY-020 (`trailing_pe` and `eps_growth_fwd` populated by fundamentals sync before this job runs at 7pm)

## Preconditions
- `stocks` table has `forward_pe`, `forward_ev_ebit`, `trailing_pe`, `eps_growth_fwd`, `cyclicality_flag`, `estimates_last_updated_at`, `data_provider_provenance` columns
- `trailing_pe` and `eps_growth_fwd` populated by fundamentals sync (STORY-020 runs at 6pm, before this job at 7pm)
- `cyclicality_flag` defaults to `NULL` for new stocks; null treated as "not cyclical" (computed fallback will run unless explicitly set TRUE by classification engine later)

## Inputs
- Cloud Scheduler POST with OIDC token
- `trailing_pe`, `eps_growth_fwd`, `cyclicality_flag` from `stocks` table (for computed fallback decision)
- Forward estimates from FMP (primary) and Tiingo (fallback)

## Outputs
- `stocks.forward_pe` updated where non-null (from provider or computed)
- `stocks.forward_ev_ebit` updated where non-null (from provider only)
- `stocks.data_provider_provenance.forward_pe`: `{ provider: 'fmp' | 'tiingo' | 'computed_trailing', synced_at, fallback_used }`
- `stocks.data_provider_provenance.forward_ev_ebit`: `{ provider: 'fmp' | 'tiingo', synced_at, fallback_used }`
- `stocks.data_last_synced_at` updated after any write (V1 proxy for `estimates_last_updated_at` — BC-021-005)
- Response: `{ stocks_updated, provider_count, computed_fallback_count, no_estimates_count, errors, duration_ms }` (see BC-021-004)

## Acceptance Criteria
- [ ] FMP tried first for `forward_pe`; Tiingo tried only if FMP returns null
- [ ] Computed trailing fallback invoked only when both FMP and Tiingo return null for `forward_pe`
- [ ] Computed fallback formula: `forward_pe = trailing_pe / (1 + eps_growth_fwd / 100)` where `eps_growth_fwd` is a percentage value (e.g. 10 → divide by 1.10)
- [ ] Computed fallback SKIPPED (forward_pe left as-is) when: `trailing_pe` null, `trailing_pe <= 0`, `eps_growth_fwd` null, or `cyclicality_flag === TRUE`
- [ ] WARN log emitted when computed fallback skipped: `{ event: 'computed_fallback_skipped', reason, ticker }`
- [ ] `forward_ev_ebit`: FMP primary, Tiingo fallback; no computed fallback; null left as-is
- [ ] Provenance for computed fallback: `{ provider: 'computed_trailing', synced_at, fallback_used: true }`
- [ ] `computed_fallback_count` reflects number of stocks where computed fallback was used
- [ ] `no_estimates_count` reflects stocks where `forward_pe` is still null after all three levels
- [ ] Existing non-null `forward_pe` not overwritten with null
- [ ] `data_last_synced_at` updated only when at least one estimate field written (V1 proxy — BC-021-005)
- [ ] `POST /api/cron/estimates` without valid OIDC token → 401
- [ ] `POST /api/cron/estimates` with valid token → 200 with summary JSON
- [ ] Cloud Scheduler Mon–Fri 7:00 PM ET job configured

## Test Strategy Expectations
- Service unit tests (mocked orchestrator + mocked DB) — 18 tests (already passing):
  - Pure guardrail tests (no DB): null trailing_pe; non-positive trailing_pe; null eps_growth_fwd; cyclicality_flag=TRUE; all pass → returns null
  - Pure formula test: `computeForwardPe(25, 10)` → 22.727...
  - syncForwardEstimates: FMP returns forward_pe → written; provenance `provider: 'fmp', fallback_used: false`
  - syncForwardEstimates: FMP null, Tiingo returns → provenance `provider: 'tiingo', fallback_used: true`
  - syncForwardEstimates: both null, guardrails pass → computed; provenance `provider: 'computed_trailing', fallback_used: true`
  - syncForwardEstimates: both null, trailing_pe null → skipped; WARN logged
  - syncForwardEstimates: both null, trailing_pe ≤ 0 → skipped
  - syncForwardEstimates: both null, cyclicality_flag=TRUE → skipped; WARN logged
  - syncForwardEstimates: both null, eps_growth_fwd null → skipped
  - syncForwardEstimates: forward_ev_ebit from Tiingo fallback → written; no computed fallback
  - syncForwardEstimates: forward_ev_ebit both null → not written, not errored
  - syncForwardEstimates: null-not-overwrite; `findMany` inUniverse=TRUE filter
- Route unit tests (mocked verifySchedulerToken + mocked syncForwardEstimates) — 2 tests (to add, BC-021-002):
  - Invalid OIDC token → 401; syncForwardEstimates not called
  - Valid OIDC token → 200 with summary JSON
- Integration tests (real test DB + mocked adapters) — 5 tests (to create, BC-021-001):
  - Full three-level: FMP null → Tiingo null → computed from trailing → correct DB value and provenance
  - Computed fallback safety: `cyclicality_flag = TRUE` → not computed; provenance not written
  - FMP provides forward_pe → written with `fallback_used: false`; `data_last_synced_at` updated
  - Idempotency: run twice with same data → forward_pe stable
  - Ticker > VarChar(10) guard: use `T_EST` (5 chars) as TEST_TICKER (BC-021-001 sub-issue)
- Contract/schema tests (STORY-024):
  - `data_provider_provenance.forward_pe` shape valid
- E2E tests (staging only):
  - `computed_fallback_count > 0` for real universe

## Regression / Invariant Risks
- **Computed fallback on negative earnings:** Negative `trailing_pe` produces meaningless `forward_pe`. Protection: `trailing_pe <= 0` guardrail unit test.
- **Cyclicality guardrail bypassed:** Code change removes flag check. Protection: explicit unit test for `cyclicality_flag = TRUE` → fallback not used.
- **EV/EBIT gets computed fallback:** Future code accidentally applies trailing PE formula to `forward_ev_ebit`. Protection: unit test verifies no `forward_ev_ebit` computed fallback is ever attempted.
- **Wrong provenance on computed path:** Provenance shows `provider: 'tiingo'` instead of `provider: 'computed_trailing'`. Protection: integration test reads provenance JSONB and asserts `provider: 'computed_trailing'` after computed-fallback path.
- **eps_growth_fwd percentage interpretation:** `eps_growth_fwd` is confirmed stored as a percentage (10 = 10%). Unit test with known values pins this: trailing_pe=25, eps_growth_fwd=10 → expected 22.73 (= 25 / 1.10). If the field were ever migrated to decimal storage, this test would fail and catch the mismatch.

## Key Risks / Edge Cases
- `eps_growth_fwd` storage format: confirmed as percentage (10 = 10%); formula `trailing_pe / (1 + eps_growth_fwd / 100)` is correct. STORY-020 stores the field in this format.
- `trailing_pe = 0` (exactly breakeven): treated as ≤ 0; computed fallback skipped; acceptable edge case
- FMP and Tiingo may have materially different forward estimates for the same stock; no reconciliation in V1 — first provider wins
- `cyclicality_flag` is null for all stocks initially (classification engine hasn't run); null treated as "not cyclical" meaning computed fallback will run for all eligible stocks on first EPIC-003 batch — this is expected behaviour

## Baseline Conflicts (discovered 2026-04-20)

### BC-021-001 — Missing integration test file
- **Baseline assumption:** Speculative implementation included no `tests/integration/data-ingestion/forward-estimates-sync.service.test.ts`
- **Conflict:** Story Test Strategy requires 5 integration scenarios; file does not exist
- **Resolution:** Create file with 5 integration tests; use `TEST_TICKER = 'T_EST'` (5 chars, within VarChar(10))
- **Impact:** New test file only

### BC-021-002 — Missing route unit test
- **Baseline assumption:** Speculative implementation included no `tests/unit/api/cron/estimates.test.ts`
- **Conflict:** Story AC requires OIDC 401/200 coverage; pattern established in STORY-019/020
- **Resolution:** Create `tests/unit/api/cron/estimates.test.ts` with 2 tests (401/200)
- **Impact:** New test file only

### BC-021-003 — TypeScript error: provenance spread not assignable to Prisma InputJsonValue
- **Baseline assumption:** Service line 199 `dataProviderProvenance: { ...currentProv, ...provenanceUpdates }` compiles cleanly
- **Conflict:** TS2322 — same pattern as BC-020-006 and BC-019-002
- **Resolution:** Cast to `Prisma.InputJsonValue`
- **Impact:** One-line fix in service; no logic change

### BC-021-004 — Return shape: spec says `missing_count`, service returns `no_estimates_count`
- **Baseline assumption (story spec Outputs):** Response includes `missing_count` = stocks where `forward_pe` still null after all three levels
- **Conflict:** Service returns `no_estimates_count` for this concept; `missing_count` is used separately as a freshness counter with different semantics
- **Resolution (V1 accepted):** `no_estimates_count` is the correct field name for "stocks where forward_pe still null after all fallbacks"; spec updated to use `no_estimates_count`. The freshness counters (`fresh_count`, `stale_count`, `missing_count`) are separate internal fields not surfaced in the API response.
- **Impact:** Spec update only; no service change

### BC-021-006 — Missing unit test: Tiingo fallback path for forward_pe
- **Baseline assumption:** Story AC "FMP tried first; Tiingo tried only if FMP returns null" has test coverage
- **Conflict:** All 18 unit tests use `source_provider: 'fmp'` or `'none'`; the "FMP null → Tiingo returns forward_pe with fallback_used=true" path is never exercised in unit tests
- **Resolution:** Add unit test 19: `source_provider: 'tiingo', fallback_used: true` → `provider_count=1`, `provenance.forward_pe.provider='tiingo'`, `fallback_used=true`
- **Impact:** New unit test only

### BC-021-007 — Missing unit test: inUniverse=TRUE filter assertion
- **Baseline assumption:** Story AC "syncForwardEstimates() processes only in_universe = TRUE stocks" has test coverage
- **Conflict:** No test verifies `findMany` called with `{ where: { inUniverse: true } }`; same gap fixed in STORY-019 (test 7) and STORY-020 (test 8)
- **Resolution:** Add unit test 20 asserting `findMany` called with `{ where: { inUniverse: true }, select: { ticker: true, trailingPe: true, epsGrowthFwd: true, cyclicalityFlag: true } }`
- **Impact:** New unit test only

### BC-021-005 — `estimates_last_updated_at` column not in V1 schema; proxy used
- **Baseline assumption (story spec):** `stocks.estimates_last_updated_at` column exists
- **Conflict:** Prisma schema has no `estimatesLastUpdatedAt` field; service uses `dataLastSyncedAt` as a V1 proxy with a comment explaining the gap
- **Resolution (V1 accepted):** `dataLastSyncedAt` used as proxy; spec and scope-out updated; integration test asserts on `dataLastSyncedAt` instead
- **Impact:** Spec update only; integration test must assert `dataLastSyncedAt` not `estimatesLastUpdatedAt`

## Definition of Done
- [ ] `syncForwardEstimates()` implemented with all three levels and all guardrails
- [ ] `POST /api/cron/estimates` endpoint with OIDC auth implemented
- [ ] Cloud Scheduler Mon–Fri 7pm ET job configured
- [ ] 20 service unit tests passing (18 existing + 2 new: BC-021-006, BC-021-007)
- [ ] 2 route unit tests passing (new file: `tests/unit/api/cron/estimates.test.ts`) (BC-021-002)
- [ ] 5 integration tests passing against real test DB (new file) (BC-021-001)
- [ ] TypeScript error fixed: provenance cast to `Prisma.InputJsonValue` (BC-021-003)
- [ ] 7 baseline conflicts documented (BC-021-001 through BC-021-007)
- [ ] Regression coverage: null-not-overwrite, computed-fallback safety, provenance provider value, eps_growth_fwd percentage interpretation
- [ ] Traceability comments referencing EPIC-003, STORY-021, RFC-004, ADR-001, ADR-002
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- PRD: Section 15 (Data Requirements — `forward_pe`, `forward_ev_ebit`)
- RFC: RFC-002 (stocks schema — forward_pe, forward_ev_ebit, cyclicality_flag), RFC-004 §Forward Estimates Sync
- ADR: ADR-001 (FMP primary for forward estimates), ADR-002 (daily 7pm ET slot), ADR-008 (Cloud Scheduler)
