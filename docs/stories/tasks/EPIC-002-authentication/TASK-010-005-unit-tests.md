# TASK-010-005 — Unit Tests: Admin Auth Guard + All Three Route Handlers

## Parent Story
STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write unit tests for the admin auth guard (`src/lib/admin-auth.ts`) and all three admin route handlers with Prisma mocked. Unit tests run without a real database and must cover all validation and error paths.

## Traceability
- ADR-011: bcrypt 10 rounds, API key gate, no self-service
- CLAUDE.md: unit test naming format `describe('EPIC-002/STORY-010/TASK-010-005: ...')`

## Test Files
- `tests/unit/lib/admin-auth.test.ts` — CREATED
- `tests/unit/api/admin/users.test.ts` — CREATED

---

## `tests/unit/lib/admin-auth.test.ts`

```typescript
// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation API
// TASK-010-005: Unit tests — admin auth guard
// ADR-011: ADMIN_API_KEY gate enforced; empty string never valid

import { validateAdminApiKey } from '@/lib/admin-auth';
import { NextRequest } from 'next/server';

function makeReq(apiKey?: string): NextRequest {
  const headers = new Headers();
  if (apiKey !== undefined) headers.set('x-api-key', apiKey);
  return new NextRequest('http://localhost/api/admin/users', { method: 'POST', headers });
}

describe('EPIC-002/STORY-010/TASK-010-005: validateAdminApiKey', () => {
  const originalKey = process.env.ADMIN_API_KEY;

  afterEach(() => {
    process.env.ADMIN_API_KEY = originalKey;
  });

  it('returns false when ADMIN_API_KEY env var is undefined', () => {
    delete process.env.ADMIN_API_KEY;
    expect(validateAdminApiKey(makeReq('any-key'))).toBe(false);
  });

  it('returns false when ADMIN_API_KEY env var is empty string', () => {
    process.env.ADMIN_API_KEY = '';
    expect(validateAdminApiKey(makeReq('any-key'))).toBe(false);
  });

  it('returns false when x-api-key header is missing', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq(undefined))).toBe(false);
  });

  it('returns false when x-api-key header is empty string', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq(''))).toBe(false);
  });

  it('returns false when x-api-key does not match ADMIN_API_KEY', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq('wrong-key'))).toBe(false);
  });

  it('returns true when x-api-key exactly matches ADMIN_API_KEY', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq('valid-key'))).toBe(true);
  });
});
```

---

## `tests/unit/api/admin/users.test.ts`

### POST /api/admin/users tests
```typescript
// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation API
// TASK-010-005: Unit tests — POST /api/admin/users, PATCH password, PATCH active
// ADR-011: bcrypt 10 rounds; email lowercase normalization; P2002/P2025 handling

describe('EPIC-002/STORY-010/TASK-010-005: POST /api/admin/users', () => {
  // Prisma mock: prisma.user.create returns { userId, email, fullName, createdAt }
  // bcrypt mock: spy to verify hash(password, 10) called

  it('returns 401 without DB call when API key is missing')
  it('returns 401 without DB call when API key is wrong')
  it('normalizes email to lowercase before calling prisma.user.create')
  it('calls bcrypt.hash with rounds=10')
  it('returns 201 with { userId, email, fullName, createdAt } — no passwordHash')
  it('returns 400 when email is missing')
  it('returns 400 when email has no @ sign')
  it('returns 400 when password is missing')
  it('returns 400 when password is shorter than 8 characters')
  it('returns 400 when request body is malformed JSON')
  it('returns 409 with { error: "Email already exists" } when Prisma throws P2002')
  it('does not include passwordHash in the 201 response body')
});
```

### PATCH /api/admin/users/[userId]/password tests
```typescript
describe('EPIC-002/STORY-010/TASK-010-005: PATCH /api/admin/users/[userId]/password', () => {
  it('returns 401 without DB call when API key is missing')
  it('calls bcrypt.hash with rounds=10 on newPassword')
  it('returns 200 with { userId, updatedAt } on success')
  it('returns 400 when newPassword is shorter than 8 characters')
  it('returns 400 when newPassword is missing')
  it('returns 404 when Prisma throws P2025 (user not found)')
  it('does not include passwordHash in the 200 response body')
});
```

### PATCH /api/admin/users/[userId]/active tests
```typescript
describe('EPIC-002/STORY-010/TASK-010-005: PATCH /api/admin/users/[userId]/active', () => {
  it('returns 401 without DB call when API key is missing')
  it('returns 200 with { userId, isActive: false, updatedAt } when isActive=false')
  it('returns 200 with { userId, isActive: true, updatedAt } when isActive=true')
  it('returns 400 when isActive is a string "false" (not a boolean)')
  it('returns 400 when isActive is a string "true" (not a boolean)')
  it('returns 400 when isActive is missing from body')
  it('returns 404 when Prisma throws P2025 (user not found)')
});
```

## Expected Test Count
- `admin-auth.test.ts`: 6 tests
- `users.test.ts`: 12 (POST) + 7 (PATCH password) + 7 (PATCH active) = **26 tests**
- **Total new unit tests: 32**

## Acceptance Criteria
- [ ] All 30 unit tests pass (`npm test -- --testPathPattern=unit`)
- [ ] No real DB connection used (Prisma mocked via jest.mock)
- [ ] bcrypt.hash verified to be called with rounds=10
- [ ] Email normalization verified (lowercase before DB call)
- [ ] All error paths covered (400, 401, 404, 409)
- [ ] Response shape verified for each endpoint (no passwordHash leak)

## Definition of Done
- [ ] `tests/unit/lib/admin-auth.test.ts` created and passing
- [ ] `tests/unit/api/admin/users.test.ts` created and passing
- [ ] Test count: 32 new unit tests
- [ ] No test file imports real Prisma client

---

**END TASK-010-005**
