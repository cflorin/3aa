# TASK-010-003 — Implement PATCH /api/admin/users/[userId]/password

## Parent Story
STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create the `PATCH /api/admin/users/[userId]/password` route that validates the API key, hashes the new password with bcrypt, and updates the user's password_hash in the database.

## Traceability
- ADR-011: bcrypt 10 rounds, ADMIN_API_KEY gate
- PRD §9A: Admin-assisted password reset

## File
`src/app/api/admin/users/[userId]/password/route.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation API
// TASK-010-003: PATCH /api/admin/users/[userId]/password — admin password reset
// ADR-011: bcrypt 10 rounds; ADMIN_API_KEY gate
// PRD §9A: Admin-assisted password reset (no self-service)

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { validateAdminApiKey } from '@/lib/admin-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = params;
  const body = await req.json().catch(() => null);
  const { newPassword } = body ?? {};

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  try {
    const user = await prisma.user.update({
      where: { userId },
      data: { passwordHash },
    });
    return NextResponse.json({ userId: user.userId, updatedAt: user.updatedAt });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw err;
  }
}
```

## Error Responses
| Status | Condition |
|--------|-----------|
| 400 | newPassword missing or < 8 characters |
| 401 | Missing, empty, or wrong `x-api-key` |
| 404 | userId not found in DB (Prisma P2025) |

## Success Response — 200
```json
{ "userId": "uuid", "updatedAt": "ISO8601" }
```

## Acceptance Criteria
- [ ] Route exists at `src/app/api/admin/users/[userId]/password/route.ts`
- [ ] 401 returned before any DB call when API key invalid
- [ ] bcrypt.hash called with rounds=10 on newPassword
- [ ] P2025 Prisma error caught and returned as 404
- [ ] 400 on missing or short newPassword
- [ ] 200 response contains `{ userId, updatedAt }` only
- [ ] Old password hash no longer verifies after update
- [ ] Traceability comments present in source file

## Logging
On successful password reset, log at INFO level:
```
console.log(`[STORY-010] password reset: userId=${user.userId}`);
```
- Log `userId` only — no password, no hash, no email
- Log is emitted after successful Prisma update, before returning 200

## Definition of Done
- [ ] Route created with correct dynamic segment path `[userId]`
- [ ] All error paths handled (400, 401, 404)
- [ ] No password or hash in any response or log line
- [ ] Logging on success: userId only (no password, no hash)
- [ ] **Cannot be marked `done` independently. Mark `in_review` when implementation is committed; promote to `done` together with TASK-010-005 once its unit tests for this route pass.**

---

**END TASK-010-003**
