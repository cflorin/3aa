# STORY-052 — EPIC-004 End-to-End Tests

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Consolidate and implement the full EPIC-004 end-to-end test suite. Each UI story (STORY-048 through STORY-051) includes E2E tests at its own scope; this story adds cross-story workflows and epic-level regression coverage that span multiple components. It is the final story in EPIC-004 and serves as the integration gate before epic sign-off.

## Story
As the development team,
I want an automated E2E test suite that exercises the full EPIC-004 user journey,
so that future changes to any part of the classification engine or universe UI cannot silently break the user experience.

## Outcome
A comprehensive E2E test suite exists in `tests/e2e/epic-004/` covering: sign-in → universe screen → classification inspection → override → deactivation → filter → re-classification job trigger. All tests pass and are wired into CI.

## Scope In
- **Cross-story E2E workflows:**
  1. **Full classification journey:** Sign in → universe screen loads with paginated stocks → click stock badge → classification modal opens with scores, history, reason codes → set override with reason → badge updates → clear override → badge reverts
  2. **Deactivation workflow:** Sign in → universe screen → deactivate stock → stock shows `Inactive` badge → filter to `Inactive only` → stock appears → reactivate → filter cleared → stock back to Active
  3. **Filter + sort workflow:** Apply sector filter → stocks narrow → apply code prefix filter → stocks narrow further → sort by Rev Growth Fwd descending → verify top stock has highest value → clear filters → all stocks return
  4. **Pagination workflow:** Navigate to page 2 → verify different stocks from page 1 → apply filter → pagination resets to page 1
  5. **Multi-user isolation:** Two test users — user A overrides MSFT to `3AA`; user B sees `4AA` (system code) for MSFT; user B overrides MSFT to `5BA`; user A still sees `3AA`
  6. **Nightly batch simulation:** Trigger `POST /api/cron/classification` in test environment (OIDC bypass) → verify all test stocks have `classification_state` rows → navigate to universe screen → stocks have codes
- **Regression invariants tested E2E:**
  - Universe screen inaccessible without session (redirects to sign-in)
  - `confidence_level` never null in API response or UI
  - `Bucket 8` stock: `suggested_code = "8"`, no EQ/BS grade shown in modal
  - Override reason <10 chars: Save button disabled, no API call
  - `override_scope: "display_only"` disclaimer visible in modal on every override

## Scope Out
- Unit and integration tests (owned by each individual story)
- EPIC-005 valuation features (not available in EPIC-004)
- EPIC-006 alert workflows (not available in EPIC-004)
- Load/performance testing

## Dependencies
- Epic: EPIC-004
- All prior EPIC-004 stories complete: STORY-041–051 all done
- Test infrastructure: Playwright or equivalent E2E framework; test DB with MSFT, ADBE, TSLA, UBER, UNH fixture data; two test user accounts

## Preconditions
- All STORY-041–051 implemented and unit/integration tests passing
- E2E framework configured (Playwright recommended — existing framework if already in use)
- Test database seeded with 5-stock fixture and pre-computed `classification_state` rows
- Two test users created in test DB
- OIDC bypass for `POST /api/cron/classification` working in test environment (already bypassed in non-production per `scheduler-auth.ts`)

## Acceptance Criteria
- [ ] All 6 cross-story E2E workflows implemented and passing
- [ ] Universe screen auth guard E2E test passing (unauthenticated → redirect)
- [ ] Confidence-level non-null E2E invariant test passing
- [ ] Bucket 8 E2E test: stock with `binary_flag=true` shows `"8"` code, no EQ/BS in modal
- [ ] Override reason validation E2E test: reason too short → Save disabled
- [ ] Override scope disclaimer E2E test: disclaimer visible in modal
- [ ] Multi-user isolation E2E test passing
- [ ] Pagination E2E test passing
- [ ] All E2E tests run in CI pipeline on every PR

## Test Strategy Expectations
- **E2E framework:** Playwright (preferred) or existing test framework in the repo
- **Test data:** Use fixture stocks (MSFT, ADBE, TSLA, UBER, UNH) pre-seeded in test DB
- **Isolation:** Each E2E test signs in fresh and uses a dedicated test user; tests should not share mutable state
- **Reporting:** E2E failures block PR merges; test report includes screenshot on failure

## Definition of Done
- [ ] `tests/e2e/epic-004/` directory created with all E2E test files
- [ ] All 6 cross-story workflow tests implemented
- [ ] All 5 regression invariant tests implemented
- [ ] All tests passing in CI on test DB
- [ ] CI configuration updated to run E2E suite on PR
- [ ] Implementation log updated with EPIC-004 completion entry
- [ ] `stories/README.md` updated: all STORY-041–052 marked `done`
- [ ] EPIC-004 marked `done` in `IMPLEMENTATION-PLAN-V1.md`

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §E2E Testing; §Screen 2 — Universe / Monitor List
- RFC: RFC-001 §Classification Engine; RFC-003 §Universe Screen
