// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-006: Integration tests — POST /api/auth/signout + cleanupExpiredSessions()
// ADR-011: idempotent sign-out; batch cleanup strictly deletes lt:expiresAt only

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { POST } from '../../../../src/app/api/auth/signout/route';
import { cleanupExpiredSessions } from '../../../../src/modules/auth/cleanup.service';

const TEST_EMAIL = 'integration-signout@test.local';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

async function createUser() {
  const passwordHash = await bcrypt.hash('password123', 10);
  return prisma.user.create({ data: { email: TEST_EMAIL, passwordHash } });
}

async function createSession(userId: string, expiresAt: Date) {
  return prisma.userSession.create({ data: { userId, expiresAt } });
}

async function cleanup() {
  await prisma.userSession.deleteMany({ where: { user: { email: TEST_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

function makeSignoutReq(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest('http://localhost/api/auth/signout', { method: 'POST', headers });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// POST /api/auth/signout — integration
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-013/TASK-013-006: POST /api/auth/signout — integration', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns 200 with { success: true } when valid session cookie present', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    const res = await POST(makeSignoutReq(session.sessionId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it('session row is deleted from DB after successful sign-out', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    await POST(makeSignoutReq(session.sessionId));
    const row = await prisma.userSession.findUnique({ where: { sessionId: session.sessionId } });
    expect(row).toBeNull();
  });

  it('returns 200 when no sessionId cookie present', async () => {
    const res = await POST(makeSignoutReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it('returns 200 when sessionId cookie contains unknown sessionId (idempotent)', async () => {
    const res = await POST(makeSignoutReq('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(200);
  });

  it('response clears sessionId cookie (Max-Age=0)', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    const res = await POST(makeSignoutReq(session.sessionId));
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie.toLowerCase()).toContain('sessionid=');
    expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=.*1970/);
  });

  it('second sign-out with same sessionId returns 200 (idempotent)', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    await POST(makeSignoutReq(session.sessionId)); // first sign-out
    const res = await POST(makeSignoutReq(session.sessionId)); // second sign-out
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// cleanupExpiredSessions() — integration
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-013/TASK-013-006: cleanupExpiredSessions() — integration', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('deletes all expired session rows and returns correct count', async () => {
    const user = await createUser();
    const pastDate = new Date(Date.now() - 1000);
    const futureDate = new Date(Date.now() + SESSION_DURATION_MS);

    await createSession(user.userId, pastDate);
    await createSession(user.userId, pastDate);
    await createSession(user.userId, pastDate);
    const validSession = await createSession(user.userId, futureDate);

    const result = await cleanupExpiredSessions();
    expect(result.count).toBe(3);

    const remaining = await prisma.userSession.findMany({ where: { user: { email: TEST_EMAIL } } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sessionId).toBe(validSession.sessionId);
  });

  it('does not delete non-expired sessions', async () => {
    const user = await createUser();
    await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));

    const result = await cleanupExpiredSessions();
    expect(result.count).toBe(0);

    const remaining = await prisma.userSession.findMany({ where: { user: { email: TEST_EMAIL } } });
    expect(remaining).toHaveLength(2);
  });

  it('is idempotent: returns { count: 0 } when no expired sessions exist', async () => {
    const result = await cleanupExpiredSessions();
    expect(result).toEqual({ count: 0 });
  });
});
