# STORY-014 — Sign-In Page UI (Screen 1)

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Deliver the Sign-In screen (PRD Screen 1) as the first user-facing UI in the product. Provides an email/password form that submits to `POST /api/auth/signin`, displays validation errors inline, and redirects to the application home on success. This is the entry point for all authenticated user workflows.

## Story
As a user,
I want a sign-in page where I can enter my email and password,
so that I can authenticate and access the application.

## Outcome
A server-rendered sign-in page at `/signin` with an email/password form. Client-side validation runs before submission. On success, the user is redirected to `/`. On failure, a generic error message is displayed. The page is publicly accessible (excluded from the auth middleware matcher). A "Forgot password?" note informs users to contact the admin. No "Remember me" checkbox is rendered (out of scope per the epic and ADR-011).

## Scope In
- `src/app/signin/page.tsx` — Next.js App Router sign-in page
- Email input (type="email"), password input (type="password"), submit button
- Client-side validation before fetch: non-empty email, non-empty password; email must contain `@`
- Form submission: `fetch('POST /api/auth/signin', { body: JSON.stringify({ email, password }) })`
- Success: redirect to `/` using `window.location.href` or `router.push('/')`
- Failure (401): display "Invalid email or password" below the form
- Failure (429): display "Too many sign-in attempts. Please try again later."
- Failure (400 or network error): display "Something went wrong. Please try again."
- "Forgot password?" static text: "Contact your administrator to reset your password." (no link; admin-assisted per PRD)
- Loading state: submit button disabled and shows "Signing in..." while request is in flight
- Redirect already-authenticated users to `/` (server-side check using `getCurrentUser()` in the page component)

## Scope Out
- "Remember me" checkbox (epic scope out; ADR-011: V2; PRD lists it but ADR-011 overrides — see Section D boundary question 2)
- Animated or complex UI (minimal functional form for V1)
- Password visibility toggle
- "Sign up" link (no self-service registration per PRD/ADR-011)
- Self-service password reset flow (V2; admin-assisted in V1)
- OAuth / social sign-in buttons
- CSRF tokens (SameSite=Lax covers V1 per ADR-011)
- i18n / localization

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A, Screen 1 (email/password form, session persistence note, forgot password link)
- **ADRs:** ADR-011 (no self-service, admin-assisted password reset, no "Remember me" in V1)
- **Upstream stories:**
  - STORY-011 (`POST /api/auth/signin` endpoint returning 200/401/429)
  - STORY-012 (middleware excludes `/signin`; `getCurrentUser()` available for already-auth redirect)

## Preconditions
- `POST /api/auth/signin` returns 200 with Set-Cookie on success, 401/429 on failure
- `/signin` is excluded from auth middleware matcher (so the page is reachable unauthenticated)
- `getCurrentUser()` is available to redirect already-authenticated users

## Inputs
- User-entered email and password
- Response from `POST /api/auth/signin`

## Outputs
- Rendered HTML sign-in form at `/signin`
- On success: browser navigates to `/` (session cookie set by API response)
- On failure: inline error message rendered below the form
- On load for authenticated user: redirect to `/` (no form rendered)

## Acceptance Criteria
- [ ] `/signin` renders an email input, password input, and submit button
- [ ] Submitting with valid credentials navigates to `/`
- [ ] Submitting with wrong credentials shows "Invalid email or password" inline
- [ ] Submitting with rate-limited credentials shows "Too many sign-in attempts. Please try again later."
- [ ] Submit button is disabled while the request is in flight
- [ ] An already-authenticated user visiting `/signin` is redirected to `/`
- [ ] "Forgot password?" note is present and reads: "Contact your administrator to reset your password."
- [ ] No "Remember me" checkbox is rendered
- [ ] No "Sign up" or "Create account" link is rendered
- [ ] Page is accessible without a session cookie (not redirected by middleware)
- [ ] Email and password fields are accessible (correct input types, labels or aria-labels present)

## Test Strategy Expectations
- **Unit tests:**
  - Client-side validation: empty email → error shown before fetch; empty password → error shown before fetch; email without `@` → error shown
  - Form submit triggers fetch to `/api/auth/signin` with correct body `{ email, password }`
  - 200 response → redirect called with `/`
  - 401 response → "Invalid email or password" displayed
  - 429 response → rate limit message displayed
  - Submit button disabled during in-flight request, re-enabled on response
- **Integration tests:**
  - GET /signin without session cookie → 200, form rendered
  - GET /signin with valid session cookie → 302 to `/` (server-side redirect for already-auth user)
  - POST /api/auth/signin with valid credentials (from this page's fetch) → 200 + Set-Cookie
- **E2E tests (Playwright or similar):**
  - Render /signin → fill email + password → submit → verify redirect to /
  - Render /signin → fill wrong password → submit → verify error message displayed
  - Render /signin without auth → verify form is visible (not redirected)
  - Navigate to /universe without auth → verify redirect to /signin
- **Accessibility:**
  - Email and password inputs have associated labels (for/id or aria-label)
  - Error messages linked to the form (aria-live region or aria-describedby)

## Regression / Invariant Risks
- **Session cookie not applied:** If the browser does not receive the Set-Cookie header from `/api/auth/signin` (e.g., due to a missing `credentials: 'include'` in the fetch or a cross-origin issue in dev), the form redirects but the session is not established, and the next page immediately redirects back to `/signin`. Integration test must verify cookie is set and accepted.
- **"Remember me" accidentally added:** If a "Remember me" checkbox is added without implementing a longer session duration, the checkbox is a no-op and misleads the user. The acceptance criterion explicitly checks that the checkbox is absent.
- **Error message divergence:** If the sign-in UI shows more specific error text than "Invalid email or password" (e.g., "That email is not registered"), it exposes user enumeration. UI must display the exact message returned by the API, not a more specific derived message.

## Key Risks / Edge Cases
- **"Remember me" checkbox in PRD vs ADR-011 conflict:** PRD Screen 1 lists "Session persistence ('Remember me' checkbox)" as a feature. ADR-011 states "Sliding window: No" and "Can add 'Remember me' checkbox in V2 if desired." The epic scope-out section explicitly excludes the checkbox. This story omits it. See Section D boundary question 2 for resolution request.
- **HTTPS in local development:** The `Secure` cookie flag is only set in production. In local dev, the cookie will be set without `Secure`, which is correct. The sign-in page does not need special handling for this.
- **Form submission method:** Using `fetch` (not a native form POST) to submit credentials allows the client to handle the response and show error messages without a full page reload. This requires `'use client'` on the page component.
- **Server Component vs Client Component boundary:** The redirect-if-authenticated check needs to run server-side (using `getCurrentUser()` in a Server Component). The form interaction (state, fetch, error display) needs to run client-side. Use a Server Component page that renders a `'use client'` SignInForm child component.

## Definition of Done
- [ ] `/signin` page implemented at `src/app/signin/page.tsx` (Server Component wrapper)
- [ ] `SignInForm` client component implemented (form, validation, fetch, error display)
- [ ] Tests added and passing (unit, integration, E2E)
- [ ] Accessibility: inputs labeled, errors announced
- [ ] Traceability comments in source: ADR-011, PRD Section 9A / Screen 1
- [ ] No password logged or echoed in any error state

## Traceability
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A, Screen 1 (Sign-In / Access)
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (no self-service, admin-assisted password reset, no Remember Me in V1)
