# TASK-011-003 — Implement POST /api/auth/signin Route

## Parent Story
STORY-011 — Sign-In API with Session Creation and Rate Limiting

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create the thin `POST /api/auth/signin` route handler at `src/app/api/auth/signin/route.ts`. Parses the request, delegates to `AuthService.signIn()`, sets the session cookie, and returns the appropriate HTTP response. All auth logic lives in AuthService — this handler is purely HTTP plumbing.

## Traceability
- ADR-011: Cookie attributes — HttpOnly, Secure (production only), SameSite=Lax, maxAge=604800, Path=/
- PRD §9A: 7-day session cookie

## File
`src/app/api/auth/signin/route.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-003: POST /api/auth/signin — HTTP handler; auth logic in AuthService
// ADR-011: Cookie attributes: HttpOnly, Secure (prod only), SameSite=Lax, Max-Age=604800, Path=/
// PRD §9A: Returns { userId, email } on success; never returns password or hash

import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/modules/auth/auth.service';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { email, password } = body ?? {};

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const ipAddress = req.headers.get('x-forwarded-for') ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  const result = await signIn(email, password, ipAddress, userAgent);

  if (result.status === 'rate-limited') {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Please try again later.' },
      { status: 429 }
    );
  }

  if (result.status === 'invalid-credentials') {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const { sessionId, userId, email: userEmail } = result;

  const response = NextResponse.json({ userId, email: userEmail }, { status: 200 });
  response.cookies.set('sessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 604800, // 7 days
    path: '/',
  });

  console.log(`[STORY-011] sign-in success: userId=${userId} email=${userEmail}`);

  return response;
}
```

## Cookie Attributes

| Attribute | Value | Note |
|-----------|-------|------|
| `httpOnly` | true | Not accessible via document.cookie |
| `secure` | true in production, false in dev | Set via `NODE_ENV === 'production'` |
| `sameSite` | lax | CSRF protection for V1 (no CSRF tokens per ADR-011) |
| `maxAge` | 604800 | 7 days in seconds |
| `path` | / | Available to all routes |

## Logging
- Success: `[STORY-011] sign-in success: userId=<uuid> email=<email>`
- No password, no hash, no session ID in logs

## Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Missing email or password in body |
| 401 | Invalid credentials or inactive user |
| 429 | Rate limit exceeded |

## Acceptance Criteria
- [ ] Route exists at `src/app/api/auth/signin/route.ts`
- [ ] 400 when email or password is missing
- [ ] 401 when signIn returns `invalid-credentials`
- [ ] 429 when signIn returns `rate-limited`
- [ ] 200 with `{ userId, email }` — no passwordHash, no password
- [ ] `sessionId` cookie set with correct attributes
- [ ] `Secure` flag only present when `NODE_ENV === 'production'`
- [ ] Logging on success: userId + email only (no password, no sessionId)
- [ ] Traceability comments in source

## Definition of Done
- [ ] Route created at correct path
- [ ] Cookie attributes match ADR-011 spec
- [ ] No password or hash in any response or log line
- [ ] **Cannot be marked `done` independently; promote to `done` with TASK-011-004 unit tests passing**

---

**END TASK-011-003**
