# STORY-014 — Sign-In Page UI (Screen 1)

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Deliver Sign-In screen (PRD Screen 1) as the first user-facing UI in the product. Provides an email/password form that submits to `POST /api/auth/signin`, displays validation errors inline, and redirects to the application home on success.

## Story
As a **user**,
I want **a sign-in page where I can enter my email and password**,
so that **I can authenticate and access the application**.

## Outcome
- Sign-in page at `/signin` with email/password form, submit button, and inline error display
- Client-side validation before submission (non-empty, email format)
- On success: browser navigates to `/universe` (session cookie set by API response)
- On failure: inline error message displayed ("Invalid email or password", rate limit message, or generic fallback)
- Already-authenticated users visiting `/signin` redirected to `/universe` server-side — the page Server Component reads the `sessionId` cookie directly via `cookies()` and calls `validateSession()` directly (middleware does not run on `/signin`, so `getCurrentUser()` cannot be used here)
- "Forgot password?" shown as static contact-admin note (no self-service reset in V1)
- No "Remember me" checkbox (out of scope per ADR-011 and epic scope)
- No "Sign up" link (no self-service registration per PRD)

## Scope In
- `src/app/signin/page.tsx` — Next.js App Router page (Server Component wrapper)
- `src/app/signin/SignInForm.tsx` — client component (`'use client'`); handles form state, fetch, error display
- Email input (type="email"), password input (type="password"), submit button
- Client-side validation before fetch: non-empty email, non-empty password, email must contain `@`
- Form submission: `fetch('POST /api/auth/signin', { body: JSON.stringify({ email, password }) })`
- Success: navigate to `/universe` using `router.push('/universe')`
- 401 response: display "Invalid email or password"
- 429 response: display "Too many sign-in attempts. Please try again later."
- Other failure: display "Something went wrong. Please try again."
- Submit button disabled and shows "Signing in…" while request is in flight
- "Forgot password?" static note: "Contact your administrator to reset your password."
- Server-side redirect for already-authenticated users: the page Server Component reads the `sessionId` cookie directly via `cookies()` and calls `validateSession()` — NOT `getCurrentUser()`, which depends on middleware-injected headers that are absent on `/signin`

## Scope Out
- "Remember me" checkbox (ADR-011: V2; epic scope out; PRD mentions it but ADR-011 is authoritative)
- Animated or complex UI styling beyond functional form
- Password visibility toggle
- "Sign up" / "Create account" link (no self-service registration)
- Self-service password reset flow (V2; admin-assisted in V1)
- OAuth / social sign-in buttons
- CSRF tokens (SameSite=Lax covers V1 per ADR-011)
- i18n / localization

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A, Screen 1 (email/password form, forgot password link)
- **ADRs:** ADR-011 (no self-service, admin-assisted password reset, no "Remember me" in V1)
- **Upstream stories:**
  - STORY-011 (`POST /api/auth/signin` returns 200/401/429)
  - STORY-012 (middleware excludes `/signin`; `AuthService.validateSession()` available for direct cookie read)

## Preconditions
- `POST /api/auth/signin` returns 200 + Set-Cookie on success, 401/429/400 on failure
- `/signin` is excluded from auth middleware matcher (reachable unauthenticated)
- `AuthService.validateSession()` available (Server Component reads `sessionId` cookie directly for already-auth redirect)

## Inputs
- User-entered email and password
- Response from `POST /api/auth/signin`

## Outputs
- Rendered HTML sign-in form at `/signin`
- On success: browser navigates to `/universe` (session cookie set by API)
- On failure: inline error message below the form
- On load for authenticated user: server redirect to `/universe`

## Acceptance Criteria
- [ ] `/signin` renders email input, password input, and submit button
- [ ] Submitting with valid credentials navigates to `/universe`
- [ ] Submitting with wrong credentials shows "Invalid email or password" inline
- [ ] Submitting while rate-limited shows "Too many sign-in attempts. Please try again later."
- [ ] Submit button is disabled while the request is in flight
- [ ] An already-authenticated user visiting `/signin` is redirected to `/universe` (server-side, via direct cookie read + validateSession)
- [ ] "Forgot password?" note reads "Contact your administrator to reset your password."
- [ ] No "Remember me" checkbox is rendered
- [ ] No "Sign up" or "Create account" link is rendered
- [ ] Page is accessible without a session cookie (not blocked by middleware)
- [ ] Email and password inputs have associated labels or aria-labels

## Test Strategy Expectations

**Unit tests:**
- Client-side validation: empty email → error shown before fetch; empty password → error before fetch; email without `@` → error before fetch
- Form submit calls fetch to `/api/auth/signin` with body `{ email, password }`
- 200 response → `router.push('/')` called
- 401 response → "Invalid email or password" displayed
- 429 response → rate limit message displayed
- Submit button disabled during in-flight request, re-enabled after response

**Integration tests:**
- GET /signin without session cookie → 200, form rendered
- GET /signin with valid session cookie → redirect to `/universe` (Server Component reads cookie directly, calls validateSession)

**E2E tests:**
- Render /signin → fill email + password → submit → verify redirect to /
- Render /signin → fill wrong password → submit → verify error message displayed
- Render /signin without auth → verify form visible, not redirected
- Navigate to protected route without auth → verify redirect to /signin

**Accessibility:**
- Email and password inputs have associated labels (for/id or aria-label)
- Error messages announced via aria-live region or aria-describedby

## Regression / Invariant Risks

**Session cookie not applied:**
- Risk: Browser does not receive Set-Cookie (missing `credentials: 'include'` in fetch or cross-origin issue); user redirects but session not established, immediately bounced back to /signin
- Protection: Integration test verifies cookie set and accepted after successful form submission

**"Remember me" accidentally added:**
- Risk: Checkbox added without implementing variable session duration; acts as no-op and misleads user
- Protection: Acceptance criterion explicitly checks checkbox is absent

**Error message divergence:**
- Risk: UI displays more specific message than the API returns (e.g., "That email is not registered"), enabling user enumeration
- Protection: UI must display the message text returned by the API verbatim, not a client-derived message

**Invariants to protect:**
- "Forgot password?" is always a static admin-contact note (never a link to self-service reset)
- No "Sign up" link ever appears on this page
- Submit button always disabled during in-flight request (prevents double-submission)
- Already-authenticated users always redirected away from /signin server-side

## Key Risks / Edge Cases

**"Remember me" checkbox: PRD vs ADR-011 conflict:**
- PRD Screen 1 lists it; ADR-011 says V2; epic scope-out explicitly excludes it
- This story omits it; ADR-011 is authoritative for implementation

**Server Component vs Client Component boundary:**
- Already-auth redirect requires reading the `sessionId` cookie directly via `cookies()` in the Server Component page, then calling `AuthService.validateSession()`. `getCurrentUser()` cannot be used (it reads middleware-injected headers; middleware does not run on `/signin`).
- Form state, fetch, and error display require `'use client'`
- Resolution: Server Component page handles the already-auth redirect, then renders a `'use client'` SignInForm child component

**HTTPS in local development:**
- `Secure` cookie flag only set in production; cookie works without it in local dev
- No special handling needed in the sign-in UI

**fetch credentials mode:**
- `fetch` to a same-origin API in Next.js App Router does not require `credentials: 'include'`
- Cookie is set by the server response header; verify this works correctly in dev and production

## Definition of Done

- [ ] `/signin` page implemented at `src/app/signin/page.tsx` (Server Component with already-auth redirect)
- [ ] `SignInForm` client component implemented at `src/app/signin/SignInForm.tsx`
- [ ] Tests added and passing (unit, integration, E2E)
- [ ] Accessibility: inputs labeled, errors announced
- [ ] Traceability comments in source: ADR-011, PRD Section 9A / Screen 1
- [ ] No password logged or echoed in any error state

## Traceability

- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A, Screen 1 (Sign-In / Access)
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (no self-service, admin-assisted password reset, no Remember Me in V1)

---

**END STORY-014**
