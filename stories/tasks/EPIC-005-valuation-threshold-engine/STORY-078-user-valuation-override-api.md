# STORY-078 — User Valuation Override API

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Purpose
Allow authenticated users to override individual valuation threshold values, metric selection, and the `forward_operating_earnings_ex_excess_cash` manual input for holding companies/insurers. Overrides are user-scoped and applied at read time — the shared system `valuation_state` is never mutated by user overrides. Also requires a schema migration to add missing columns to `user_valuation_overrides`.

## Story
As an authenticated user,
I want to manually set valuation thresholds and metric inputs for a specific stock,
so that my personal view of a stock's valuation zone reflects my own judgment without affecting other users.

## Outcome
- Schema migration adds `primary_metric_override`, `forward_operating_earnings_ex_excess_cash`, `notes` to `user_valuation_overrides`
- GET `/api/stocks/[ticker]/valuation` returns the personalized valuation result for the calling user (system computation if no override; user-adjusted in-memory computation if override exists)
- PUT `/api/stocks/[ticker]/valuation/override` upserts a `UserValuationOverride` row, then returns `getPersonalizedValuation()` for the response
- DELETE `/api/stocks/[ticker]/valuation/override` removes the override row, then returns `getPersonalizedValuation()` (which falls back to system state)
- **`valuation_state` is never written by override endpoints** — overrides are applied in-memory at read time only

## Architecture: Compute-at-Read-Time

```
GET /api/stocks/[ticker]/valuation
    │
    ├─ getPersonalizedValuation(ticker, userId)         [STORY-076]
    │       ├─ UserClassificationOverride?  → activeCode = finalCode or suggestedCode
    │       ├─ UserValuationOverride?        → merge threshold/metric/earnings overrides
    │       └─ if any override: computeValuation() in-memory, return result
    │          else: return system valuation_state row directly
    │
    └─ response: { systemState, userResult, hasUserOverride, userOverride }
```

PUT/DELETE: update `user_valuation_overrides` table only → call `getPersonalizedValuation()` for the response → return to client. No write to `valuation_state`.

## Scope In

### Schema migration (non-breaking)
Add nullable columns to `user_valuation_overrides`:
- `primary_metric_override VARCHAR(50) NULL` — forces metric selection (bypasses MetricSelector)
- `forward_operating_earnings_ex_excess_cash DECIMAL(15, 4) NULL` — manual earnings input for holding/insurer
- `notes TEXT NULL` — free-text reason

Verify no downstream code reads `user_valuation_overrides` columns before migrating (grep for `UserValuationOverride` or `user_valuation_overrides` usages — expected: none in current codebase as table exists but was never read).

### GET `/api/stocks/[ticker]/valuation`
Returns:
```json
{
  "ticker": "AAPL",
  "systemState": { ...ValuationStateRow },
  "userResult": { ...ValuationResult },
  "hasUserOverride": true,
  "userOverride": { ...UserValuationOverride | null }
}
```
- `systemState`: raw `valuation_state` row (what the system computed using `suggested_code`)
- `userResult`: result of `getPersonalizedValuation()` — same as `systemState` if no override, personalized recomputation if override exists
- `hasUserOverride`: true if any `UserValuationOverride` or `UserClassificationOverride` exists

**Response 404:** stock not in universe or `valuation_state` row not yet computed

### PUT `/api/stocks/[ticker]/valuation/override`
**Request body (all optional; at least one required):**
```json
{
  "maxThreshold": 25.0,
  "comfortableThreshold": 22.0,
  "veryGoodThreshold": 19.0,
  "stealThreshold": 16.0,
  "primaryMetricOverride": "forward_pe",
  "forwardOperatingEarningsExExcessCash": 45.2,
  "notes": "Using owner earnings estimate"
}
```
Threshold fields: if any one supplied, all four required.

**Server logic:**
1. Validate body
2. Upsert `UserValuationOverride` row for (userId, ticker)
3. Call `getPersonalizedValuation(ticker, userId)` — no DB write to `valuation_state`
4. Return `{ userResult, userOverride }`

**Response 200:** `{ userResult: ValuationResult, userOverride: UserValuationOverride }`

**Validation errors (400):**
- `missing_override_fields`: no fields provided
- `invalid_threshold_set`: threshold fields partially supplied (all 4 or none)
- `threshold_order_violation`: descending order not satisfied (max > comfortable > very_good > steal)
- `invalid_metric`: `primaryMetricOverride` not in allowed set

### DELETE `/api/stocks/[ticker]/valuation/override`
1. Delete `UserValuationOverride` row for (userId, ticker) — 404 if not found
2. Call `getPersonalizedValuation(ticker, userId)` — returns system state (no override)
3. Return `{ userResult: ValuationResult, userOverride: null }`

## Scope Out
- Admin-level overrides applying to all users
- Override audit history table (not in V1 scope)
- Writing overrides back to the shared `valuation_state` row — this is explicitly out of scope; overrides are always compute-at-read-time

## Dependencies
- STORY-075 (`computeValuation` — used by `getPersonalizedValuation` for in-memory recompute)
- STORY-076 (`getPersonalizedValuation`, `getValuationState` — called by these endpoints)
- RFC-003 §User Override API; RFC-002 §user_valuation_overrides schema
- ADR-007 (system-level shared `valuation_state`; user overrides are user-scoped and never mutate shared state)

## Preconditions
- `user_valuation_overrides` table exists with 4 threshold columns (confirmed in schema)
- `UserClassificationOverride` table exists with `finalCode` column (STORY-045, confirmed)
- `getPersonalizedValuation(ticker, userId)` exists (STORY-076)
- Session auth middleware available

## Acceptance Criteria
- [ ] Schema migration adds 3 nullable columns; existing rows and queries unaffected
- [ ] No existing code reads `user_valuation_overrides` columns (grep verified before migration)
- [ ] GET returns `systemState` (always the shared system row) and `userResult` (personalized in-memory)
- [ ] GET: user with no override → `userResult` equals `systemState`, `hasUserOverride=false`
- [ ] GET: user with `UserClassificationOverride` (final_code=4BA, system=4AA) → `userResult` computed with 4BA thresholds, `systemState` still shows 4AA anchored values
- [ ] GET: user with threshold override → `userResult` shows overridden thresholds; `systemState` unchanged
- [ ] PUT with valid 4-threshold set → upserted; `userResult.thresholdSource='manual_override'`
- [ ] PUT with `forwardOperatingEarningsExExcessCash` for holding company → `userResult.valuationStateStatus='ready'` (not `manual_required_insurer`)
- [ ] PUT with `primaryMetricOverride` → `userResult.primaryMetric` equals override value
- [ ] DELETE removes override; subsequent GET returns `userResult` = system state
- [ ] PUT: partial threshold set (only 2 of 4) → 400 `invalid_threshold_set`
- [ ] PUT: thresholds in wrong order → 400 `threshold_order_violation`
- [ ] Unauthenticated → 401
- [ ] Non-existent ticker → 404
- [ ] User A's override does not appear in User B's GET response

## Test Strategy Expectations
- Unit tests:
  - `getPersonalizedValuation`: no override → returns system state directly (no recompute); classification override only → recomputes with finalCode; threshold override only → recomputes with overridden thresholds; both overrides → recomputes with both applied
  - Validation: partial threshold → 400; wrong order → 400; no fields → 400
- Integration tests:
  - PUT → DB row inserted; GET returns `hasUserOverride=true`; DELETE → row removed, `hasUserOverride=false`
  - Two users: user A PUT override; user B GET shows system state only
  - Holding company: PUT with `forwardOperatingEarningsExExcessCash` → `userResult.status='ready'`, `systemState.status` unchanged
- BDD scenarios:
  - "User sets max=30/comfortable=27/very_good=24/steal=21 on AAPL → userResult uses override thresholds; system state unchanged"
  - "User with classification override finalCode=4BA on a system-4AA stock → userResult uses 4BA anchor thresholds"
  - "User provides forward_operating_earnings_ex_excess_cash=45.2 for a holding company → userResult.status=ready"
  - "User deletes override → userResult reverts to system computation"

## Regression / Invariant Risks
- `valuation_state` must never be written by override endpoints — integration test should assert system row is unchanged after PUT/DELETE
- `getPersonalizedValuation` must be idempotent: same inputs always produce same output

## Definition of Done
- [ ] Prisma migration file created and applied
- [ ] `user_valuation_overrides` Prisma model updated with 3 new fields
- [ ] Grep confirms no existing code reads `UserValuationOverride` columns pre-migration
- [ ] GET/PUT/DELETE endpoints implemented
- [ ] Unit + integration tests passing
- [ ] Implementation log updated
- [ ] Traceability comments in all new files (`// EPIC-005: ... STORY-078: ...`)

## Traceability
- Epic: EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- RFC: RFC-003 — Valuation & Threshold Engine Architecture §User Override API
- RFC: RFC-002 — Database Schema §user_valuation_overrides
- ADR: ADR-005 — Threshold Management (manual_override source)
- ADR: ADR-007 — Multi-User Architecture (user-scoped overrides; system valuation_state is shared and immutable from user actions)
- PRD: `docs/prd/3_aa_valuation_threshold_workflow_prd_v_1.md` §US-VAL-005, §US-VAL-006
