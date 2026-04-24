# STORY-045 — User Classification Override API

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the per-user classification override API endpoints and persistence. Users can record their own 3AA code for any stock, with a required reason explaining their view. The active code resolved per-user is `COALESCE(user_override.final_code, system.suggested_code)`. V1 semantics: overrides affect inspection and display only; alert generation uses the system suggested_code.

## Story
As a user,
I want to record my own classification code for a stock with a reason,
so that I can track my personal view alongside the system suggestion.

## Outcome
API routes exist for creating, clearing, and reading user classification overrides. The `user_classification_overrides` table is migrated. Session-protected. `override_reason` is required (minimum 10 characters) per the framework's auditability requirement.

## Scope In
- Prisma schema migration adding `user_classification_overrides` table: `(user_id, ticker) PK`, `final_code`, `override_reason TEXT NOT NULL`, `overridden_at`
- `POST /api/classification-override` (authenticated):
  - Body: `{ ticker: string, final_code: string, override_reason: string }`
  - `final_code` validated against regex `^[1-8]([ABC][ABC])?$`
  - `override_reason` required, minimum 10 characters — 422 if empty or too short
  - Upserts override row; returns 200 with resolved active classification
- `DELETE /api/classification-override/[ticker]` (authenticated):
  - Deletes override row for current user + ticker
  - **204 No Content** on success (no body)
  - 404 if no override exists for this user + ticker
- `GET /api/stocks/[ticker]/classification` (authenticated):
  - Returns: `{ ticker, system_suggested_code, system_confidence, user_override_code, user_override_reason, active_code, reason_codes, scores, override_scope }`
  - `active_code = user_override_code ?? system_suggested_code`
  - `override_scope: "display_only"` always present (V1 semantics documentation)
- Domain function: `resolveActiveCode(userId, ticker)` → active code with provenance
- Session protection via existing session middleware (STORY-012)

## Scope Out
- Alert generation using override (EPIC-006 reads system suggested_code only)
- Override history/audit trail (history is for system suggested_code changes, not user overrides)
- Admin bulk override operations
- Classification badge UI (STORY-051)

## Dependencies
- Epic: EPIC-004
- RFC: RFC-001 §User Override API; RFC-003 §Override Semantics
- ADR: ADR-007 (per-user override table, active code resolution)
- ADR: ADR-006 (session auth)
- Upstream: STORY-044 (`classification_state` and `getClassificationState`)
- Upstream: STORY-012 (session middleware)

## Preconditions
- `classification_state` table operational (STORY-044)
- Session middleware operational (STORY-012)
- `stocks` table with ticker as PK

## Inputs
- `POST`: authenticated session, `{ ticker, final_code, override_reason }` body
- `DELETE`: authenticated session, `ticker` path param
- `GET`: authenticated session, `ticker` path param

## Outputs
- `POST`: 200 `{ ticker, active_code, system_suggested_code, user_override_code, override_scope }`
- `DELETE`: 204 No Content (no body)
- `GET`: 200 full classification response

## Acceptance Criteria
- [ ] `user_classification_overrides` table created via Prisma migration with `override_reason TEXT NOT NULL`
- [ ] `POST /api/classification-override` requires authentication (401 if no session)
- [ ] Valid `final_code` with reason ≥ 10 chars → upserts override row; `active_code = final_code`
- [ ] `override_reason` empty or fewer than 10 characters → 422 validation error, no DB write
- [ ] Invalid `final_code` format → 422 with validation error
- [ ] Unknown ticker → 404
- [ ] `DELETE /api/classification-override/[ticker]` removes row → 204 No Content
- [ ] `DELETE` when no override exists → 404
- [ ] `GET /api/stocks/[ticker]/classification` returns both system and user values
- [ ] `override_scope: "display_only"` present in all responses
- [ ] Two different users can have different override codes for same ticker (row isolation by `user_id`)
- [ ] Override does not affect `classification_state.suggested_code` for other users

## Test Strategy Expectations
- **Unit tests:**
  - `resolveActiveCode`: override present → returns override; no override → system code; both null → null
- **Integration tests:**
  - Full POST → GET round-trip: set override (with reason), read back, confirm active_code
  - DELETE → GET: confirm override cleared, active_code = system code
  - Two users: user A override does not affect user B active_code
  - Unauthenticated POST → 401
  - Invalid code format `"9AA"` → 422
  - Reason too short (`"See"`, 3 chars) → 422
  - Empty reason `""` → 422
  - Unknown ticker → 404
  - DELETE non-existent override → 404
- **Contract/schema tests:**
  - GET response shape matches interface
  - `active_code = user_override_code ?? system_suggested_code`
  - `override_scope` always `"display_only"`
- **BDD acceptance tests:**
  - "Given authenticated user, when POST final_code=5BA reason='Margin expansion thesis confirmed', then GET returns active_code=5BA"
  - "Given user has override, when DELETE, then GET returns active_code=system_suggested_code"
  - "Given reason is 'Too short', when POST, then 422 error returned"

## Regression / Invariant Risks
- **Override leaking across users:** if `WHERE user_id = session.userId` guard ever removed — explicit multi-user isolation test must run in CI
- **Reason validation removed:** if min-length check is dropped, empty reasons accumulate — test zero-length reason on every build
- **Null coalesce inversion:** if `active_code` resolution order inverts — contract test for coalesce order

## Key Risks / Edge Cases
- **`system_suggested_code = null` and no override:** `active_code = null` — client must handle null gracefully
- **V1 alert scope:** EPIC-006 MUST read `suggested_code` from `classification_state`, not `active_code` — this is documented in `override_scope: "display_only"` but must also be noted in EPIC-006 dependency

## Definition of Done
- [ ] `user_classification_overrides` migration created and applied
- [ ] `POST /api/classification-override`, `DELETE /api/classification-override/[ticker]`, `GET /api/stocks/[ticker]/classification` routes implemented
- [ ] `resolveActiveCode` domain function implemented
- [ ] Integration tests covering round-trip, multi-user isolation, auth guard, reason validation
- [ ] Traceability comments reference RFC-001 §User Override API, ADR-007
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 §User Override API; RFC-003 §Override Semantics
- ADR: ADR-007 (hybrid shared/per-user state, active code resolution)
- ADR: ADR-006 (session-based authentication)
