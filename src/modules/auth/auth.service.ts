// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-002: AuthService — signIn() fully implemented; validateSession() and signOut() stubs
// ADR-011: bcrypt.compare; no sliding window; constant-time unknown-email path; in-memory rate limiter
// RFC-002: user_sessions schema (sessionId, userId, expiresAt, ipAddress, userAgent, lastActivityAt)
// PRD §9A: 7-day sessions; generic error for all failure cases

import bcrypt from 'bcrypt';
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

// STORY-012 will implement validateSession() fully.
// Stub returns null — middleware treats null as "unauthenticated" (safe default).
export async function validateSession(_sessionId: string): Promise<null> {
  console.warn('[STUB] validateSession() called before STORY-012 implementation — returning null');
  return null;
}

// STORY-013 will implement signOut() fully.
// Stub is a no-op — no session deletion until STORY-013.
export async function signOut(_sessionId: string): Promise<void> {
  console.warn('[STUB] signOut() called before STORY-013 implementation — no-op');
}
