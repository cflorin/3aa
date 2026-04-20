# TASK-010-004 — Implement PATCH /api/admin/users/[userId]/active

## Parent Story
STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create the `PATCH /api/admin/users/[userId]/active` route that validates the API key, then sets `isActive` to the provided boolean on the user record. Deactivation does NOT delete sessions — STORY-012 middleware rejects them lazily via the `isActive` check.

## Traceability
- ADR-011: ADMIN_API_KEY gate; deactivation does not delete sessions
- ADR-007: Multi-user architecture; isActive is the application-layer access gate
- PRD §9A: Admin can deactivate and reactivate users

## File
`src/app/api/admin/users/[userId]/active/route.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation API
// TASK-010-004: PATCH /api/admin/users/[userId]/active — deactivate/reactivate user
// ADR-011: ADMIN_API_KEY gate; no session deletion on deactivation (lazy middleware cleanup)
// ADR-007: isActive flag is the access gate; middleware checks it on each request

import { NextRequest, NextResponse } from 'next/server';
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
  const { isActive } = body ?? {};

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { userId },
      data: { isActive },
    });
    return NextResponse.json({ userId: user.userId, isActive: user.isActive, updatedAt: user.updatedAt });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw err;
  }
}
```

## Validation Rules
- `isActive`: required, must be a JavaScript boolean (`true` or `false`)
- String "true" / "false" must be rejected (400) — type strictness intentional

## Error Responses
| Status | Condition |
|--------|-----------|
| 400 | `isActive` missing, not a boolean, or is a string |
| 401 | Missing, empty, or wrong `x-api-key` |
| 404 | userId not found in DB (Prisma P2025) |

## Success Response — 200
```json
{ "userId": "uuid", "isActive": false, "updatedAt": "ISO8601" }
```

## Key Behaviour
- Deactivation sets `isActive=false` — does NOT delete `user_sessions` rows
- Existing sessions for deactivated users are rejected by STORY-012 middleware on next access (lazy cleanup)
- This is the correct V1 behaviour; immediate session termination is a V2 enhancement if needed

## Acceptance Criteria
- [ ] Route exists at `src/app/api/admin/users/[userId]/active/route.ts`
- [ ] 401 returned before any DB call when API key invalid
- [ ] `isActive: false` sets DB row `isActive=false`; response contains `{ userId, isActive: false, updatedAt }`
- [ ] `isActive: true` sets DB row `isActive=true`; response contains `{ userId, isActive: true, updatedAt }`
- [ ] `isActive: "false"` (string) → 400 (must be boolean, not string)
- [ ] P2025 Prisma error caught and returned as 404
- [ ] Sessions NOT deleted on deactivation (lazy middleware cleanup handles this)
- [ ] Traceability comments present in source file

## Logging
On successful deactivation or reactivation, log at INFO level:
```
console.log(`[STORY-010] user active status changed: userId=${user.userId} isActive=${user.isActive}`);
```
- Log `userId` and `isActive` only — no email, no password, no hash
- Log is emitted after successful Prisma update, before returning 200

## Definition of Done
- [ ] Route created with correct dynamic segment path `[userId]`
- [ ] Boolean type enforcement in place (rejects string "true"/"false")
- [ ] All error paths handled (400, 401, 404)
- [ ] Logging on success: userId + isActive (no PII beyond userId)
- [ ] **Cannot be marked `done` independently. Mark `in_review` when implementation is committed; promote to `done` together with TASK-010-005 once its unit tests for this route pass.**

---

**END TASK-010-004**
