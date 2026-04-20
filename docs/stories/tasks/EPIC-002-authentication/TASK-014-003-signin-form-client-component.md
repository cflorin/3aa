# TASK-014-003 — SignInForm Client Component

## Parent Story
STORY-014 — Sign-In Page UI (Screen 1)

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create `src/app/signin/SignInForm.tsx` — the `'use client'` React component that renders the email/password form, handles client-side validation, submits to `POST /api/auth/signin`, and displays inline errors or navigates to `/universe` on success.

## Traceability
- ADR-011: no "Remember me" checkbox; no self-service reset; admin-assisted only
- PRD §9A / Screen 1: email/password form, "Forgot password?" note, submit button

## File
`src/app/signin/SignInForm.tsx` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-003: SignInForm client component — form, validation, submit, error display
// ADR-011: no Remember Me; no self-service reset; admin-assisted only
// PRD §9A / Screen 1: email/password form with inline errors

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Client-side validation before fetch
    if (!email) {
      setError('Email is required');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push('/universe');
        return;
      }

      const body = await res.json();
      if (res.status === 401 || res.status === 429 || res.status === 400) {
        setError(body.error ?? 'Something went wrong. Please try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Sign in">
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={loading}
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={loading}
        />
      </div>
      {error && (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      )}
      <button type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p>
        Forgot password?{' '}
        <span>Contact your administrator to reset your password.</span>
      </p>
    </form>
  );
}
```

## Error Message Contract
Errors are displayed verbatim from the API response (`body.error`). The UI does NOT substitute its own messages. This prevents user enumeration (no "that email is not registered" style messages).

| API response | Displayed error |
|-------------|----------------|
| 401 `{ error: "Invalid email or password" }` | "Invalid email or password" |
| 429 `{ error: "Too many sign-in attempts. Please try again later." }` | "Too many sign-in attempts. Please try again later." |
| 400 `{ error: "Email and password are required" }` | "Email and password are required" |
| Network error | "Something went wrong. Please try again." |
| 5xx | "Something went wrong. Please try again." |

## Key Constraints
- No "Remember me" checkbox — explicitly omitted per ADR-011 and epic scope-out
- No "Sign up" or "Create account" link — no self-service registration
- "Forgot password?" is static text (not a link, not a form) — admin-assisted only
- `aria-live="assertive"` on error paragraph for screen reader announcement
- Submit button disabled AND text changes to "Signing in…" during in-flight request
- Error is cleared on each new submit attempt (`setError('')` at top of handleSubmit)

## Acceptance Criteria
- [ ] Form renders email input, password input, submit button
- [ ] Empty email before submit → "Email is required" shown; fetch not called
- [ ] Email without @ → "Enter a valid email address" shown; fetch not called
- [ ] Empty password → "Password is required" shown; fetch not called
- [ ] On 200: `router.push('/universe')` called
- [ ] On 401: API error message displayed
- [ ] On 429: API rate limit message displayed
- [ ] Submit button disabled and shows "Signing in…" during in-flight request
- [ ] No "Remember me" checkbox rendered
- [ ] No "Sign up" link rendered
- [ ] Error element has `role="alert"` or `aria-live`

## Definition of Done
- [ ] `src/app/signin/SignInForm.tsx` created with traceability comments
- [ ] **Cannot be marked `done` independently; promote with TASK-014-004 tests passing**

---

**END TASK-014-003**
