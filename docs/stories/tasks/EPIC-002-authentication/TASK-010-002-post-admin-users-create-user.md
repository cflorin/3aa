# TASK-010-002 — Implement POST /api/admin/users (Create User)

## Parent Story
STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create the `POST /api/admin/users` route handler that validates the API key, creates a bcrypt-hashed user record, and returns 201 with the new user's data (no passwordHash).

## Traceability
- ADR-011: bcrypt 10 rounds, ADMIN_API_KEY gate, no self-service, email lowercase normalization
- ADR-007: Multi-user architecture context
- PRD §9A: Admin creates accounts
- RFC-002: users table schema (email, password_hash, full_name, is_active)

## File
`src/app/api/admin/users/route.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation API
// TASK-010-002: POST /api/admin/users — create user with bcrypt-hashed password
// ADR-011: bcrypt 10 rounds; ADMIN_API_KEY gate; email lowercase normalization
// PRD §9A: Admin-controlled account provisioning

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { validateAdminApiKey } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const { email, password, fullName } = body;

  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, fullName: fullName ?? null },
    });
    return NextResponse.json(
      { userId: user.userId, email: user.email, fullName: user.fullName, createdAt: user.createdAt },
      { status: 201 }
    );
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    throw err;
  }
}
```

## Validation Rules
- `email`: required, must contain `@` and `.`, normalized to lowercase before insert
- `password`: required, minimum 8 characters
- `fullName`: optional

## Error Responses
| Status | Condition |
|--------|-----------|
| 400 | Missing or invalid email |
| 400 | Password < 8 characters |
| 401 | Missing, empty, or wrong `x-api-key` |
| 409 | Email already exists (Prisma P2002) |

## Success Response — 201
```json
{ "userId": "uuid", "email": "alice@example.com", "fullName": "Alice", "createdAt": "ISO8601" }
```
No `passwordHash` field in response.

## Acceptance Criteria
- [ ] Route exists at `src/app/api/admin/users/route.ts`
- [ ] 401 returned before any DB call when API key invalid
- [ ] Email normalized to lowercase before insert
- [ ] bcrypt.hash called with rounds=10
- [ ] 201 response includes `{ userId, email, fullName, createdAt }` — no passwordHash
- [ ] P2002 Prisma error caught and returned as 409 with `{ error: "Email already exists" }`
- [ ] 400 on missing email, invalid email format, or password < 8 chars
- [ ] Traceability comments present in source file

## Logging
On successful creation, log at INFO level:
```
console.log(`[STORY-010] user created: userId=${user.userId} email=${user.email}`);
```
- Log `userId` and `email` only — no password, no hash, no fullName unless needed for audit
- Log is emitted after successful Prisma insert, before returning 201

## Definition of Done
- [ ] `src/app/api/admin/users/route.ts` created
- [ ] All error paths handled (400, 401, 409)
- [ ] No passwordHash in any response or log line
- [ ] Logging on success: userId + email (no password, no hash)
- [ ] **Cannot be marked `done` independently. Mark `in_review` when implementation is committed; promote to `done` together with TASK-010-005 once its unit tests for this route pass.**

---

**END TASK-010-002**
