// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting (signIn)
// STORY-012: Session Validation Middleware and Route Protection (validateSession)
// STORY-013: Sign-Out API and Expired Session Cleanup (signOut)
// ADR-011: bcrypt.compare; no sliding window; constant-time unknown-email path; in-memory rate limiter; lazy expiry cleanup
// RFC-002: user_sessions schema (sessionId, userId, expiresAt, ipAddress, userAgent, lastActivityAt)
// PRD §9A: 7-day sessions; generic error for all failure cases; expired/inactive → null

import bcrypt from 'bcryptjs';
import { prisma } from '@/infrastructure/database/prisma';
import { isRateLimited, recordFailedAttempt, resetRateLimit } from './rate-limiter';

// Pre-computed valid bcrypt hash for constant-time unknown-email protection (ADR-011).
// Must be a real bcrypt string — bcrypt.compare exits fast on invalid format,
// destroying the constant-time guarantee.
const DUMMY_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SignInResult =
  | { status: 'rate-limited' }
  | { status: 'invalid-credentials' }
  | { status: 'success'; sessionId: string; userId: string; email: string };

export async function signIn(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<SignInResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit check must come before any DB query (ADR-011)
  if (isRateLimited(normalizedEmail)) {
    return { status: 'rate-limited' };
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    // Run bcrypt against dummy hash to ensure constant response time (prevents email enumeration)
    await bcrypt.compare(password, DUMMY_HASH);
    recordFailedAttempt(normalizedEmail);
    return { status: 'invalid-credentials' };
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  // Check both bcrypt result and isActive — same 401 path for both (no enumeration)
  if (!passwordMatch || !user.isActive) {
    recordFailedAttempt(normalizedEmail);
    return { status: 'invalid-credentials' };
  }

  resetRateLimit(normalizedEmail);

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await prisma.userSession.create({
    data: { userId: user.userId, expiresAt, ipAddress, userAgent },
  });

  // lastActivityAt is set by DB default (@default(now())); never updated per ADR-011 (no sliding window)
  await prisma.user.update({
    where: { userId: user.userId },
    data: { lastLoginAt: new Date() },
  });

  return { status: 'success', sessionId: session.sessionId, userId: user.userId, email: user.email };
}

// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-001: validateSession() — replaces STORY-011 stub
// ADR-011: lazy expiry cleanup; no sliding window (lastActivityAt never touched here)
// PRD §9A: expired or missing session → null; inactive user → null
export async function validateSession(
  sessionId: string,
): Promise<{ userId: string; email: string } | null> {
  const session = await prisma.userSession.findUnique({
    where: { sessionId },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    // Lazy cleanup — delete expired row so it doesn't accumulate (ADR-011)
    await prisma.userSession.delete({ where: { sessionId } });
    return null;
  }

  // Inactive user: session row survives (admin can reactivate), but access is denied
  if (!session.user.isActive) return null;

  return { userId: session.user.userId, email: session.user.email };
}

// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-001: signOut() — replaces STORY-011 stub
// ADR-011: session deleted immediately on sign-out; deleteMany is idempotent (no P2025)
export async function signOut(sessionId: string): Promise<void> {
  // deleteMany is idempotent: no error if sessionId not found (unlike prisma.delete which throws P2025)
  await prisma.userSession.deleteMany({ where: { sessionId } });
}
