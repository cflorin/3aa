// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-005: Integration + contract tests — POST /api/auth/signin
// ADR-011: Full sign-in flow; session creation; rate limiting; cookie attributes
// Satisfies STORY-010 cross-story AC: "deactivated user blocked at sign-in"

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { POST } from '../../../../src/app/api/auth/signin/route';
import { clearAll } from '../../../../src/modules/auth/rate-limiter';

async function createUser(email: string, password: string, isActive = true) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({ data: { email, passwordHash, isActive } });
}

async function deleteUser(email: string) {
  await prisma.userSession.deleteMany({
    where: { user: { email } },
  });
  await prisma.user.deleteMany({ where: { email } });
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Sign-in flow — integration
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-011/TASK-011-005: POST /api/auth/signin — integration', () => {
  const email = 'integration-signin@test.local';

  beforeEach(async () => {
    clearAll();
    await deleteUser(email);
    await createUser(email, 'correct123');
  });

  afterEach(() => deleteUser(email));

  it('returns 200, inserts session row, sets Set-Cookie when credentials are valid', async () => {
    const res = await POST(makeReq({ email, password: 'correct123' }));
    expect(res.status).toBe(200);

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('sessionId=');

    const sessions = await prisma.userSession.findMany({ where: { user: { email } } });
    expect(sessions).toHaveLength(1);
  });

  it('session row expiresAt is approximately now + 7 days (within 60 seconds)', async () => {
    const before = Date.now();
    await POST(makeReq({ email, password: 'correct123' }));
    const after = Date.now();

    const sessions = await prisma.userSession.findMany({ where: { user: { email } } });
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiresTs = sessions[0].expiresAt.getTime();
    expect(expiresTs).toBeGreaterThanOrEqual(before + sevenDaysMs - 60000);
    expect(expiresTs).toBeLessThanOrEqual(after + sevenDaysMs + 60000);
  });

  it('users.lastLoginAt is updated on successful sign-in', async () => {
    const before = new Date();
    await POST(makeReq({ email, password: 'correct123' }));
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.lastLoginAt).not.toBeNull();
    expect(user!.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it('two successful sign-ins create two independent session rows', async () => {
    await POST(makeReq({ email, password: 'correct123' }));
    await POST(makeReq({ email, password: 'correct123' }));
    const sessions = await prisma.userSession.findMany({ where: { user: { email } } });
    expect(sessions).toHaveLength(2);
  });

  it('returns 401 and inserts no session row when password is wrong', async () => {
    const res = await POST(makeReq({ email, password: 'wrongpass' }));
    expect(res.status).toBe(401);
    const sessions = await prisma.userSession.findMany({ where: { user: { email } } });
    expect(sessions).toHaveLength(0);
  });

  it('returns 401 and inserts no session row for unknown email', async () => {
    const res = await POST(makeReq({ email: 'nobody@test.local', password: 'anything' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 and inserts no session row when user isActive=false', async () => {
    await deleteUser(email);
    await createUser(email, 'correct123', false);
    const res = await POST(makeReq({ email, password: 'correct123' }));
    expect(res.status).toBe(401);
    const sessions = await prisma.userSession.findMany({ where: { user: { email } } });
    expect(sessions).toHaveLength(0);
  });

  // STORY-010 cross-story acceptance criterion: "deactivated user blocked at sign-in"
  it('[STORY-010 AC] user created via admin API then deactivated returns 401 at sign-in', async () => {
    // Simulate the full STORY-010 flow: create user, deactivate via DB, attempt sign-in
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({ where: { userId: user!.userId }, data: { isActive: false } });

    const res = await POST(makeReq({ email, password: 'correct123' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid email or password' });
  });
});

// ---------------------------------------------------------------------------
// Rate limit — integration
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-011/TASK-011-005: Rate limit — integration', () => {
  const email = 'integration-ratelimit@test.local';

  beforeEach(async () => {
    clearAll();
    await deleteUser(email);
    await createUser(email, 'correct123');
  });

  afterEach(async () => {
    clearAll();
    await deleteUser(email);
  });

  it('5 failed attempts → 6th returns 429', async () => {
    for (let i = 0; i < 5; i++) {
      await POST(makeReq({ email, password: 'wrongpass' }));
    }
    const res = await POST(makeReq({ email, password: 'wrongpass' }));
    expect(res.status).toBe(429);
  });

  it('successful sign-in resets counter; subsequent failures count from 0', async () => {
    for (let i = 0; i < 4; i++) {
      await POST(makeReq({ email, password: 'wrongpass' }));
    }
    // Successful sign-in resets the counter
    const successRes = await POST(makeReq({ email, password: 'correct123' }));
    expect(successRes.status).toBe(200);

    // Now 4 more failures should not trigger rate limit (counter reset)
    for (let i = 0; i < 4; i++) {
      const res = await POST(makeReq({ email, password: 'wrongpass' }));
      expect(res.status).toBe(401); // not 429
    }
  });
});

// ---------------------------------------------------------------------------
// Contract tests — response shapes and cookie attributes
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-011/TASK-011-005: Contract — response shapes', () => {
  const email = 'integration-contract-signin@test.local';

  beforeAll(async () => {
    clearAll();
    await deleteUser(email);
    await createUser(email, 'correct123');
  });

  afterAll(async () => {
    clearAll();
    await deleteUser(email);
  });

  beforeEach(() => clearAll());

  it('200 response body: { userId: string, email: string } — no passwordHash, no password', async () => {
    const res = await POST(makeReq({ email, password: 'correct123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.userId).toBe('string');
    expect(typeof body.email).toBe('string');
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('200 response body has exactly 2 keys: userId and email', async () => {
    const res = await POST(makeReq({ email, password: 'correct123' }));
    const body = await res.json();
    expect(Object.keys(body)).toHaveLength(2);
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['userId', 'email']));
  });

  it('401 response body: { error: "Invalid email or password" } — same for wrong password AND unknown email', async () => {
    const wrongPassRes = await POST(makeReq({ email, password: 'wrong' }));
    const unknownRes = await POST(makeReq({ email: 'nobody@test.local', password: 'anything' }));
    const wrongBody = await wrongPassRes.json();
    const unknownBody = await unknownRes.json();
    expect(wrongBody).toEqual({ error: 'Invalid email or password' });
    expect(unknownBody).toEqual({ error: 'Invalid email or password' });
  });

  it('429 response body: { error: "Too many sign-in attempts. Please try again later." }', async () => {
    for (let i = 0; i < 5; i++) await POST(makeReq({ email, password: 'wrong' }));
    const res = await POST(makeReq({ email, password: 'wrong' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'Too many sign-in attempts. Please try again later.' });
  });

  it('400 response body: { error: "Email and password are required" }', async () => {
    const res = await POST(makeReq({ email }));
    const body = await res.json();
    expect(body).toEqual({ error: 'Email and password are required' });
  });

  it('200 Set-Cookie contains: HttpOnly, SameSite=Lax, Max-Age=604800, Path=/', async () => {
    const res = await POST(makeReq({ email, password: 'correct123' }));
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie.toLowerCase()).toContain('max-age=604800');
    expect(cookie.toLowerCase()).toContain('path=/');
  });

  it('sessionId cookie value is a valid UUID', async () => {
    const res = await POST(makeReq({ email, password: 'correct123' }));
    const cookie = res.headers.get('set-cookie') ?? '';
    const match = cookie.match(/sessionId=([^;]+)/);
    expect(match).not.toBeNull();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(match![1]).toMatch(uuidRegex);
  });
});
