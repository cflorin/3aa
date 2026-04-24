# STORY-046 — User Monitoring Preferences API

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the per-user stock monitoring preferences API. All stocks in the universe are **monitored by default** — they are considered for alerts. Users can deactivate individual stocks to stop receiving alerts for them. The Universe Screen shows all stocks; the API provides the per-user active/deactivated status for each.

> **Model note:** This replaces the original "add/remove monitor list" concept from earlier decomposition. The correct model per user decision (2026-04-23): all-default-monitored, per-user deactivation. This aligns with EPIC-006 alert generation which reads monitoring status to skip deactivated stocks.

## Story
As a user,
I want to deactivate individual stocks so I stop receiving alerts for them,
and reactivate them at any time to resume monitoring,
so that my alert noise is under my control without losing universe visibility.

## Outcome
A `PUT /api/stocks/[ticker]/monitoring` endpoint exists (authenticated) to toggle a stock's monitoring status. A `GET /api/universe` endpoint returns all in-universe stocks with each stock's monitoring status for the current user. The `user_deactivated_stocks` table stores only explicit deactivations (no row = active).

## Scope In
- Prisma schema migration adding `user_deactivated_stocks` table: `(user_id, ticker) PK`, `deactivated_at`
- `PUT /api/stocks/[ticker]/monitoring` (authenticated):
  - Body: `{ is_active: boolean }`
  - `is_active = false` → insert row into `user_deactivated_stocks` (idempotent on duplicate)
  - `is_active = true` → delete row from `user_deactivated_stocks` (idempotent if not present)
  - Returns 200 with `{ ticker, is_active, updated_at }`
  - Unknown ticker → 404
- `GET /api/universe` (authenticated):
  - Returns all `in_universe = TRUE` stocks with fundamental snapshot fields, classification, and per-user `is_active` status
  - `is_active` derived as: no row in `user_deactivated_stocks` → true; row present → false
  - Ordered by `ticker` ascending by default
  - Pagination: `?page=1&limit=50` (default limit 50)
- Domain functions:
  - `getMonitoringStatus(userId, ticker)` → `boolean`
  - `getUniverseStocks(userId, paginationOpts)` → `{ stocks: UniverseStockSummary[], total: number }`
- Session protection via existing session middleware (STORY-012)

## Scope Out
- Filters, sort, search (STORY-049)
- Universe screen table UI (STORY-048)
- Deactivation UI controls in table (STORY-050)
- EPIC-006: alert generation reading `user_deactivated_stocks` (consuming this table, not owned here)

## Dependencies
- Epic: EPIC-004
- RFC: RFC-003 §Monitor List API (original spec — model updated per 2026-04-23 decision)
- ADR: ADR-007 (per-user stock state)
- ADR: ADR-006 (session auth)
- Upstream: STORY-044 (`classification_state` for active_code join)
- Upstream: STORY-045 (`user_classification_overrides` for active_code resolution)
- Upstream: STORY-012 (session middleware)

## Preconditions
- `stocks` table with `in_universe` boolean column (EPIC-003)
- `classification_state` table operational (STORY-044)
- `user_classification_overrides` table operational (STORY-045)
- Session middleware operational (STORY-012)

## Inputs
- `PUT` body: `{ is_active: boolean }`; path param: `ticker`; authenticated session
- `GET /api/universe` query: optional `page`, `limit`; authenticated session

## Outputs
- `PUT`: 200 `{ ticker, is_active, updated_at }`
- `GET`: `{ stocks: UniverseStockSummary[], total: number, page: number, limit: number }`
  - Each `UniverseStockSummary` includes: `ticker`, `company_name`, `sector`, `is_active`, `active_code`, `confidence_level`, fundamental snapshot fields

## Acceptance Criteria
- [ ] `user_deactivated_stocks` table created via Prisma migration
- [ ] `PUT /api/stocks/[ticker]/monitoring` requires authentication (401 if no session)
- [ ] `PUT` with `{ is_active: false }` → row inserted; subsequent GET shows `is_active: false`
- [ ] `PUT` with `{ is_active: true }` → row deleted; subsequent GET shows `is_active: true`
- [ ] Deactivating already-deactivated ticker → 200 (idempotent, no error)
- [ ] Reactivating already-active ticker → 200 (idempotent, no error)
- [ ] Unknown ticker PUT → 404
- [ ] `GET /api/universe` returns ALL `in_universe=TRUE` stocks (not just deactivated ones)
- [ ] `GET /api/universe` `is_active` field reflects per-user deactivations correctly
- [ ] Two users deactivate different stocks → each GET reflects only their own deactivations
- [ ] `GET /api/universe` pagination: `page=2&limit=50` returns correct slice
- [ ] New stock added to universe (by pipeline) → automatically appears as `is_active: true` for all users, no DB change required

## Test Strategy Expectations
- **Unit tests:**
  - `getMonitoringStatus(userId, ticker)`: no row → true; row present → false
  - `getUniverseStocks`: all stocks returned with correct `is_active` per user
  - `is_active` derivation: LEFT JOIN `user_deactivated_stocks` — null join = active
- **Integration tests:**
  - Full lifecycle: PUT false → GET (is_active=false) → PUT true → GET (is_active=true)
  - Idempotency: PUT false twice → no error, no duplicate row
  - Multi-user isolation: user A deactivation invisible to user B
  - New universe stock: appears `is_active: true` for all users without any PUT calls
  - Unauthenticated PUT → 401; Unauthenticated GET → 401
  - Unknown ticker PUT → 404
  - Pagination: 60 stocks total, GET page=2&limit=50 → 10 stocks, total=60
- **Contract/schema tests:**
  - GET response: `{ stocks: [], total: number, page: number, limit: number }`
  - Each stock has `is_active: boolean`, `ticker: string`, `active_code: string | null`
- **BDD acceptance tests:**
  - "Given user deactivates MSFT, when GET universe, then MSFT appears with is_active=false and is still visible in table"
  - "Given new stock NVDA added to stocks table, when user calls GET universe, then NVDA appears with is_active=true"

## Regression / Invariant Risks
- **Cross-user leak:** if `WHERE user_id` filter dropped → multi-user isolation test
- **Stock disappears on deactivation:** deactivated stocks must still appear in GET — only `is_active` changes, not visibility
- **New stock defaults:** any stock added to universe should be active for all users without seeding rows — LEFT JOIN semantics test

## Key Risks / Edge Cases
- **Stock removed from universe (`in_universe=FALSE`):** `GET /api/universe` filters `in_universe=TRUE`; deactivation row for a removed stock is orphaned but harmless — no FK violation since `user_deactivated_stocks.ticker` references `stocks.ticker`
- **Large universe (1000+ stocks):** pagination must work; no unbounded query
- **Classification not yet computed:** `active_code: null` is valid for new stocks — not an error

## Definition of Done
- [ ] `user_deactivated_stocks` migration created and applied
- [ ] `PUT /api/stocks/[ticker]/monitoring` and `GET /api/universe` routes implemented
- [ ] `getMonitoringStatus` and `getUniverseStocks` domain functions implemented
- [ ] Integration tests covering lifecycle, idempotency, isolation, pagination, auth guard
- [ ] Traceability comments reference RFC-003, ADR-007
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-003 §Monitor List API (model updated 2026-04-23: all-default-monitored, per-user deactivation)
- ADR: ADR-007 (per-user stock state)
- ADR: ADR-006 (session auth)
