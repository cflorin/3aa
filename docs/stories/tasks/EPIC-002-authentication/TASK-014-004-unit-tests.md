# TASK-014-004 — Unit Tests

## Parent Story
STORY-014 — Sign-In Page UI (Screen 1)

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write unit tests for `SignInForm` (React Testing Library + jsdom) and the sign-in page Server Component (mocked cookies + validateSession). Total: ~12 unit tests.

## Traceability
- ADR-011: no Remember Me, no Sign Up link, admin-only password reset

## Test Files

### File 1: `tests/unit/components/SignInForm.test.tsx`
**Environment:** `/** @jest-environment jsdom */`

```typescript
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Use jest.spyOn for fetch (Jest 30 / Node 18+ native fetch)
const mockFetch = jest.spyOn(global, 'fetch');
```

**Tests (10):**
1. `renders email input, password input, and submit button — no Remember Me, no Sign Up link`
2. `shows "Email is required" without calling fetch when email is empty on submit`
3. `shows "Enter a valid email address" without calling fetch when email has no @`
4. `shows "Password is required" without calling fetch when password is empty`
5. `calls fetch POST /api/auth/signin with email and password on valid submit`
6. `calls router.push("/universe") on 200 response`
7. `displays API error message on 401 response`
8. `displays rate limit message on 429 response`
9. `submit button is disabled and shows "Signing in…" while request is in flight`
10. `does not render Remember Me checkbox or Sign Up link`

---

### File 2: `tests/unit/app/signin/page.test.tsx`
**Environment:** `/** @jest-environment jsdom */` (needed for React rendering)

```typescript
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));
jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));
jest.mock('@/app/signin/SignInForm', () => ({
  default: () => <div data-testid="signin-form" />,
}));
```

**Tests (3):**
1. `renders SignInForm when no sessionId cookie present`
2. `renders SignInForm when sessionId present but validateSession returns null (invalid session)`
3. `calls redirect("/universe") when validateSession returns a user`

---

## Total Unit Test Count
10 + 3 = **13 new unit tests**

## Running Unit Tests
```
npx jest "tests/unit" --no-coverage
```

Expected: 127 tests passing (114 baseline + 13 new)

## Notes on Server Component Testing
Testing async Server Components in Jest requires calling the component as an async function:
```typescript
import SignInPage from '../../../../src/app/signin/page';
// ...
const element = await SignInPage();
const { container } = render(element as JSX.Element);
```

If this approach is fragile, simplify to just test the redirect logic in a plain function test (no render needed):
```typescript
// Just verify redirect is called when validateSession returns a user
mockCookies.mockReturnValue({ get: () => ({ value: 'valid-session' }) });
mockValidateSession.mockResolvedValue({ userId: 'uuid', email: 'a@b.com' });
await SignInPage();
expect(mockRedirect).toHaveBeenCalledWith('/universe');
```

## Acceptance Criteria
- [ ] All 13 unit tests pass
- [ ] SignInForm tests use `@testing-library/react`
- [ ] Error messages verified to match API response verbatim
- [ ] No "Remember Me" checkbox rendered (test 1 implicitly verifies)

## Definition of Done
- [ ] 2 test files created with traceability comments
- [ ] 127 unit tests passing
- [ ] **Promotes TASK-014-002 and TASK-014-003 to `done`**

---

**END TASK-014-004**
