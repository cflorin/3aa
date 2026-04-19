# ADR-011: Authentication Strategy - Custom Email/Password

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-006 (Platform Architecture), ADR-010 (Tech Stack), PRD Section 9A

---

## Context

The 3AA Monitoring Product V1 requires user authentication for:
- User accounts (admin-created, no self-service signup)
- Session management (persistent login)
- Route protection (authenticated-only pages)
- User isolation (multi-user architecture, ADR-007)

**The Question:** What authentication strategy should V1 use?

### V1 Requirements (from PRD Section 9A)

- **Email/password authentication** (no social login)
- **Admin creates accounts** (no self-service signup)
- **Session management** (7-day expiration)
- **User isolation** (per-user data access)
- **Out of scope:** Social login, 2FA, SSO, passwordless

### Authentication Options

**Custom Email/Password:**
- Build custom auth (bcrypt, session cookies)
- Full control over flow
- Simple, no external dependencies

**NextAuth.js (Auth.js):**
- Popular Next.js auth library
- Primarily OAuth-focused (Google, GitHub, etc.)
- Can do email/password, but more complex

**Clerk:**
- Managed auth service
- Feature-rich (2FA, SSO, user management UI)
- External dependency, paid service

**Auth0 / Okta:**
- Enterprise auth platforms
- Overkill for V1 scale
- Expensive

---

## Decision

V1 shall use **custom email/password authentication** with:

- **Password hashing:** bcrypt (industry standard)
- **Session storage:** Database-backed sessions (Postgres)
- **Session cookies:** HTTP-only, Secure, SameSite=Lax
- **Route protection:** Next.js middleware
- **User management:** Admin-only API endpoints

### Implementation Pattern

**1. User Model (Prisma)**
```prisma
model User {
  userId       String   @id @default(uuid()) @db.Uuid
  email        String   @unique @db.VarChar(255)
  passwordHash String   @db.VarChar(255)
  fullName     String?  @db.VarChar(255)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  lastLoginAt  DateTime? @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)

  sessions                  Session[]
  monitoredStocks           UserMonitoredStock[]
  classificationOverrides   UserClassificationOverride[]
  valuationOverrides        UserValuationOverride[]
  alerts                    Alert[]

  @@map("users")
}

model Session {
  sessionId String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  expiresAt DateTime @db.Timestamptz(6)
  createdAt DateTime @default(now()) @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("user_sessions")
}
```

**2. Authentication Service**
```typescript
// src/modules/auth/auth.service.ts
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 10;
const SESSION_DURATION_DAYS = 7;

export class AuthService {
  async createUser(email: string, password: string, fullName?: string): Promise<User> {
    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
      },
    });
  }

  async signIn(email: string, password: string): Promise<Session | null> {
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    const session = await prisma.session.create({
      data: {
        userId: user.userId,
        expiresAt,
      },
    });

    // Update last login
    await prisma.user.update({
      where: { userId: user.userId },
      data: { lastLoginAt: new Date() },
    });

    return session;
  }

  async validateSession(sessionId: string): Promise<User | null> {
    const session = await prisma.session.findUnique({
      where: { sessionId },
      include: { user: true },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) {
      // Session expired, delete it
      await prisma.session.delete({ where: { sessionId } });
      return null;
    }

    return session.user.isActive ? session.user : null;
  }

  async signOut(sessionId: string): Promise<void> {
    await prisma.session.delete({ where: { sessionId } });
  }
}
```

**3. Sign-In API Route**
```typescript
// src/app/api/auth/signin/route.ts
import { NextResponse } from 'next/server';
import { AuthService } from '@/modules/auth/auth.service';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const { email, password } = await request.json();

  const session = await AuthService.signIn(email, password);

  if (!session) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Set session cookie
  cookies().set('sessionId', session.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });

  return NextResponse.json({ success: true });
}
```

**4. Middleware (Route Protection)**
```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthService } from '@/modules/auth/auth.service';

export async function middleware(request: NextRequest) {
  const sessionId = request.cookies.get('sessionId')?.value;

  // Public routes (no auth required)
  if (request.nextUrl.pathname.startsWith('/signin')) {
    return NextResponse.next();
  }

  // Protected routes (require auth)
  if (!sessionId) {
    return NextResponse.redirect(new URL('/signin', request.url));
  }

  const user = await AuthService.validateSession(sessionId);
  if (!user) {
    // Invalid/expired session
    const response = NextResponse.redirect(new URL('/signin', request.url));
    response.cookies.delete('sessionId');
    return response;
  }

  // Add user to request headers (accessible in Server Components)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', user.userId);
  requestHeaders.set('x-user-email', user.email);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**5. Getting Current User in Server Components**
```typescript
// src/lib/auth.ts
import { headers } from 'next/headers';

export function getCurrentUser(): { userId: string; email: string } | null {
  const headersList = headers();
  const userId = headersList.get('x-user-id');
  const email = headersList.get('x-user-email');

  if (!userId || !email) return null;

  return { userId, email };
}
```

---

## Rationale

### Why Custom Email/Password?

**1. PRD Specifies Email/Password Only**
- PRD Section 9A: "Email/password authentication (no social login)"
- No OAuth, no SSO, no passwordless
- Custom implementation is simplest for this use case

**2. NextAuth.js is OAuth-First**
- NextAuth excels at OAuth (Google, GitHub, etc.)
- Email/password is secondary feature in NextAuth
- For email/password only, custom is simpler

**Example NextAuth complexity:**
```typescript
// NextAuth.js email/password requires:
// - CredentialsProvider configuration
// - Session strategy configuration
// - JWT vs database sessions decision
// - Custom authorize() callback
// - Adapter setup for database
// - Type augmentation for user object
```

**Custom approach:**
```typescript
// Custom email/password is straightforward:
// - bcrypt.hash()
// - bcrypt.compare()
// - Create session in database
// - Set session cookie
```

**3. Full Control**
- Customize session duration (7 days, per PRD)
- Customize password rules (can add complexity requirements later)
- Customize user management (admin-only account creation)
- No library constraints

**4. No External Dependencies**
- NextAuth.js: 500KB dependency, 20+ sub-dependencies
- Custom: bcrypt only (~50KB)
- Simpler, fewer supply-chain risks

**5. Easier to Reason About**
- Authentication flow is explicit (no magic)
- Easy to debug (no library internals)
- Easy for Claude to modify autonomously

### Why NOT NextAuth.js?

**OAuth-First Design:**
- NextAuth is great for social login (Google, GitHub, etc.)
- V1 explicitly excludes social login (PRD Section 9A)
- Using NextAuth for email/password only is using 10% of its features

**Added Complexity:**
- Requires adapter configuration (Prisma adapter)
- Requires JWT secret management
- Requires session strategy decision (database vs JWT)
- More configuration than needed

**Type Safety Issues:**
- NextAuth types require augmentation for custom user fields
- More TypeScript gymnastics than custom approach

**Not Necessary:**
- V1 has simple auth requirements (email/password, sessions, route protection)
- Custom implementation is <200 lines of code
- No need for heavyweight library

### Why NOT Clerk?

**External Dependency:**
- Clerk is a third-party service (SaaS)
- Requires API calls to Clerk servers
- Adds latency, potential downtime

**Cost:**
- Clerk free tier: 10K MAU (monthly active users)
- Beyond free tier: $25/month per 1K MAU
- V1 scale is small, but custom auth is free

**Overkill:**
- Clerk excels at complex auth (2FA, SSO, MFA, etc.)
- V1 doesn't need these features
- Custom is simpler

**Vendor Lock-In:**
- Migrating away from Clerk requires rewriting auth
- Custom auth is portable

### Why NOT Auth0 / Okta?

**Enterprise Platforms:**
- Designed for large enterprises
- Complex configuration, high cost
- Overkill for V1 (10-100 users)

**Expensive:**
- Auth0: $23/month per 1K MAU (beyond free tier)
- Okta: Enterprise pricing (thousands of dollars/month)

---

## Consequences

### Positive ✅

**Simplicity:**
- <200 lines of custom auth code
- Easy to understand, debug, modify
- No library magic

**Full Control:**
- Customize session duration (7 days, per PRD)
- Customize password rules (can add complexity requirements later)
- Customize user management (admin-only account creation)

**No External Dependencies:**
- No third-party service (Clerk, Auth0)
- No SaaS outages, no API latency
- Fully self-contained

**Cost:**
- Free (no SaaS subscription)
- Only cost is database storage (sessions table)

**Security:**
- bcrypt is industry-standard (battle-tested)
- HTTP-only cookies prevent XSS
- Database sessions easy to invalidate
- Secure flag in production

**Autonomy:**
- Easy for Claude to understand and modify
- No library internals to navigate

### Negative ⚠️

**Manual Security Maintenance:**
- Must stay up-to-date on auth best practices
- Must implement rate limiting for sign-in endpoint (prevent brute force)
- **Mitigation:** Use well-established patterns (bcrypt, HTTP-only cookies)

**No Built-In Advanced Features:**
- No 2FA, no passwordless, no social login
- Would need to implement if V2 requires
- **Mitigation:** V1 doesn't need these (PRD scope)

**Password Reset Flow:**
- Must implement custom password reset (email token flow)
- **Mitigation:** Simple to implement (generate reset token, send email, verify token)

**Session Management:**
- Must implement session cleanup (delete expired sessions)
- **Mitigation:** Simple cron job (`DELETE FROM user_sessions WHERE expires_at < NOW()`)

---

## Alternatives Considered

### Alternative 1: NextAuth.js (Auth.js)

**Approach:**
```typescript
// pages/api/auth/[...nextauth].ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export default NextAuth({
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        // Custom email/password logic
      },
    }),
  ],
  session: { strategy: 'database' },
  adapter: PrismaAdapter(prisma),
});
```

**Rejected Because:**
- ❌ OAuth-first design (V1 doesn't use OAuth)
- ❌ More complex configuration than custom approach
- ❌ Type safety requires augmentation
- ❌ 500KB dependency for simple email/password auth
- ✅ Would be appropriate if V1 needed social login

---

### Alternative 2: Clerk

**Approach:**
- Use Clerk SDK in Next.js
- Clerk handles user management UI
- Clerk provides session management

**Rejected Because:**
- ❌ External SaaS dependency (API calls, potential downtime)
- ❌ Cost: $25/month per 1K MAU (beyond free tier)
- ❌ Overkill for V1 (doesn't need 2FA, SSO, etc.)
- ❌ Vendor lock-in (harder to migrate away)
- ✅ Would be appropriate for complex auth requirements (not V1)

---

### Alternative 3: Auth0

**Approach:**
- Use Auth0 Universal Login
- Auth0 handles authentication flow
- Integrate Auth0 SDK in Next.js

**Rejected Because:**
- ❌ Enterprise platform (overkill for V1)
- ❌ Expensive: $23/month per 1K MAU
- ❌ Complex configuration (too many knobs)
- ✅ Would be appropriate for enterprise SSO requirements (not V1)

---

### Alternative 4: Passwordless (Magic Links)

**Approach:**
- Email-based authentication (no passwords)
- User enters email, receives magic link
- Click link to sign in

**Rejected Because:**
- ❌ PRD specifies email/password (not passwordless)
- ❌ Requires email sending infrastructure (SendGrid, etc.)
- ❌ Slower UX (must check email every sign-in)
- ✅ Could be added in V2 if desired

---

## Implementation Notes

### Password Security

**Hashing Algorithm:**
- Use bcrypt (industry standard)
- Salt rounds: 10 (good balance of security vs performance)
- Do NOT use MD5, SHA1, or plain SHA-256 (not designed for passwords)

**Password Complexity:**
- V1: Minimum 8 characters (no other requirements)
- V2: Can add complexity rules (uppercase, numbers, symbols) if needed

### Session Security

**Cookie Flags:**
- `httpOnly: true` - Prevent JavaScript access (XSS protection)
- `secure: true` - HTTPS only (production)
- `sameSite: 'lax'` - CSRF protection
- `maxAge: 7 days` - Match session expiration (PRD)

**Session Expiration:**
- 7 days (per PRD Section 9A)
- Sliding window: No (user must sign in after 7 days)
- Can add "Remember me" checkbox in V2 if desired

### Rate Limiting

**Sign-In Endpoint:**
- Implement rate limiting (prevent brute force attacks)
- Limit: 5 sign-in attempts per email per 15 minutes
- Return 429 Too Many Requests if exceeded

**Example:**
```typescript
// Simple in-memory rate limiter (V1)
const signInAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const record = signInAttempts.get(email);

  if (!record || record.resetAt < now) {
    signInAttempts.set(email, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }

  if (record.count >= 5) {
    return false; // Rate limited
  }

  record.count++;
  return true;
}
```

### Session Cleanup

**Expired Sessions:**
- Delete expired sessions periodically (prevent database bloat)
- Run daily cleanup job (nightly batch pipeline)

```typescript
// src/modules/auth/cleanup.service.ts
export async function cleanupExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
}
```

### Admin User Creation

**Admin API Endpoint:**
- POST `/api/admin/users` (admin-only, protected by API key)
- Creates user with email, password, full name
- No self-service signup (per PRD)

```typescript
// src/app/api/admin/users/route.ts
export async function POST(request: Request) {
  // Verify admin API key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, password, fullName } = await request.json();

  const user = await AuthService.createUser(email, password, fullName);

  return NextResponse.json({ userId: user.userId, email: user.email });
}
```

### Password Reset Flow (Future)

**V2 Enhancement:**
- User requests password reset (enters email)
- Generate reset token, send email
- User clicks link, enters new password
- Verify token, update password

**Not Implemented in V1:**
- V1: Admin manually resets passwords if needed (via admin API)
- V2: Add self-service password reset

---

## Security Considerations

### XSS Protection
- HTTP-only cookies prevent JavaScript access to session ID
- Next.js sanitizes user input by default

### CSRF Protection
- SameSite=Lax cookies provide CSRF protection
- No additional CSRF tokens needed for V1

### SQL Injection Protection
- Prisma uses parameterized queries (no SQL injection risk)

### Password Storage
- bcrypt hash (salted, industry standard)
- Never store plain-text passwords

### Session Hijacking Protection
- HTTPS in production (Secure flag on cookies)
- Session expiration (7 days)
- Can add IP address validation in V2 if needed

### Brute Force Protection
- Rate limiting on sign-in endpoint (5 attempts per 15 min)

---

## Migration Path

If V1 needs to migrate auth (unlikely):

**To NextAuth.js:**
- Migrate user table (already compatible)
- Add NextAuth configuration
- Update sign-in/sign-out flows
- Migration effort: 1-2 days

**To Clerk:**
- Export users from database
- Import to Clerk (via API)
- Update sign-in/sign-out flows
- Migration effort: 3-5 days

**Add Social Login:**
- Implement OAuth flow (Google, GitHub)
- Store OAuth tokens in database
- Link OAuth accounts to users
- Migration effort: 1 week (for NextAuth.js)

---

## Related Decisions

- **ADR-010:** TypeScript + Next.js (middleware, API routes)
- **ADR-007:** Multi-user architecture (user isolation)
- **RFC-006:** Platform architecture (session table in Postgres)
- **PRD Section 9A:** Authentication requirements (email/password, no social login)

---

## Notes

- Custom email/password auth is **simple, secure, and sufficient for V1**
- No need for heavyweight auth library (NextAuth, Clerk) for V1 scope
- Can add advanced features (2FA, social login) in V2 if justified by user demand
- bcrypt + session cookies + HTTP-only flags = industry-standard secure pattern

---

**END ADR-011**
