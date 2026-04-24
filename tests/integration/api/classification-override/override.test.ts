// EPIC-004: Classification Engine & Universe Screen
// STORY-045: User Classification Override API
// TASK-045-006: Integration tests — POST, DELETE, GET override routes
// RFC-001 §User Override API; ADR-007; ADR-006 (session auth)
//
// Requires: test DB at DATABASE_URL; MSFT stock must exist in stocks table

import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { POST } from '../../../../src/app/api/classification-override/route';
import { DELETE } from '../../../../src/app/api/classification-override/[ticker]/route';
import { GET } from '../../../../src/app/api/stocks/[ticker]/classification/route';

const TICKER = 'MSFT';

// ── Test helpers ─────────────────────────────────────────────────────────────

async function createTestUser(email: string) {
  const passwordHash = await bcrypt.hash('testpass123', 10);
  return prisma.user.create({ data: { email, passwordHash } });
}

async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return prisma.userSession.create({ data: { userId, expiresAt } });
}

async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.userClassificationOverride.deleteMany({ where: { userId: user.userId } });
  await prisma.userSession.deleteMany({ where: { userId: user.userId } });
  await prisma.user.delete({ where: { email } });
}

function makePostReq(body: unknown, sessionId?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookies = sessionId ? `sessionId=${sessionId}` : '';
  if (cookies) headers['cookie'] = cookies;
  return new NextRequest('http://localhost/api/classification-override', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function makeDeleteReq(ticker: string, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest(`http://localhost/api/classification-override/${ticker}`, {
    method: 'DELETE',
    headers,
  });
}

function makeGetReq(ticker: string, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest(`http://localhost/api/stocks/${ticker}/classification`, {
    method: 'GET',
    headers,
  });
}

function makeParams(ticker: string) {
  return Promise.resolve({ ticker });
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

const USER_A_EMAIL = 'override-test-a@test.local';
const USER_B_EMAIL = 'override-test-b@test.local';

let userAId: string;
let userBId: string;
let sessionAId: string;
let sessionBId: string;

beforeAll(async () => {
  await cleanupUser(USER_A_EMAIL);
  await cleanupUser(USER_B_EMAIL);

  const userA = await createTestUser(USER_A_EMAIL);
  const userB = await createTestUser(USER_B_EMAIL);
  userAId = userA.userId;
  userBId = userB.userId;

  const sessA = await createSession(userAId);
  const sessB = await createSession(userBId);
  sessionAId = sessA.sessionId;
  sessionBId = sessB.sessionId;
});

afterAll(async () => {
  await cleanupUser(USER_A_EMAIL);
  await cleanupUser(USER_B_EMAIL);
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear any overrides before each test for a clean slate
  await prisma.userClassificationOverride.deleteMany({
    where: { userId: { in: [userAId, userBId] } },
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-045/TASK-045-006: classification override API integration', () => {

  describe('(a) Authentication guard', () => {
    it('POST without session cookie → 401', async () => {
      const res = await POST(makePostReq({ ticker: TICKER, final_code: '4AA', override_reason: 'My thesis here' }));
      expect(res.status).toBe(401);
    });

    it('DELETE without session cookie → 401', async () => {
      const res = await DELETE(makeDeleteReq(TICKER), { params: makeParams(TICKER) });
      expect(res.status).toBe(401);
    });

    it('GET without session cookie → 401', async () => {
      const res = await GET(makeGetReq(TICKER), { params: makeParams(TICKER) });
      expect(res.status).toBe(401);
    });
  });

  describe('(b) POST — valid override', () => {
    it('creates override row; response includes active_code = final_code', async () => {
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: 'Long-term growth conviction confirmed' },
        sessionAId,
      ));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ticker).toBe(TICKER);
      expect(body.user_override_code).toBe('4AA');
      expect(body.active_code).toBe('4AA');
      expect(body.override_scope).toBe('display_only');
    });

    it('upserts on second POST — updates reason and code', async () => {
      await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: 'First reason here please' },
        sessionAId,
      ));
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '5BA', override_reason: 'Revised: margin expansion thesis' },
        sessionAId,
      ));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user_override_code).toBe('5BA');
    });
  });

  describe('(c) GET after POST — full round-trip', () => {
    it('GET returns active_code = user_override_code with override_scope="display_only"', async () => {
      await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: 'Margin expansion thesis confirmed' },
        sessionAId,
      ));

      const res = await GET(makeGetReq(TICKER, sessionAId), { params: makeParams(TICKER) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ticker).toBe(TICKER);
      expect(body.user_override_code).toBe('4AA');
      expect(body.active_code).toBe('4AA');
      expect(body.override_scope).toBe('display_only');
      expect(body).toHaveProperty('system_suggested_code');
      expect(body).toHaveProperty('system_confidence');
    });
  });

  describe('(d) DELETE → active_code reverts to system code', () => {
    it('DELETE returns 204; GET after shows active_code = system_suggested_code', async () => {
      await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: 'Temporary override for review' },
        sessionAId,
      ));

      const delRes = await DELETE(makeDeleteReq(TICKER, sessionAId), { params: makeParams(TICKER) });
      expect(delRes.status).toBe(204);

      const getRes = await GET(makeGetReq(TICKER, sessionAId), { params: makeParams(TICKER) });
      const body = await getRes.json();
      expect(body.user_override_code).toBeNull();
      // active_code should now be system_suggested_code (possibly null if no classification run)
      expect(body.active_code).toBe(body.system_suggested_code);
    });
  });

  describe('(e) DELETE non-existent override → 404', () => {
    it('returns 404 when no override exists for this user+ticker', async () => {
      const res = await DELETE(makeDeleteReq(TICKER, sessionAId), { params: makeParams(TICKER) });
      expect(res.status).toBe(404);
    });
  });

  describe('(f) Validation — invalid final_code', () => {
    it('"9AA" → 422 (bucket 9 invalid)', async () => {
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '9AA', override_reason: 'Valid reason here' },
        sessionAId,
      ));
      expect(res.status).toBe(422);
    });

    it('"4" is valid (bucket only)', async () => {
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '4', override_reason: 'Valid reason here' },
        sessionAId,
      ));
      expect(res.status).toBe(200);
    });
  });

  describe('(g) Validation — override_reason too short', () => {
    it('"See" (3 chars) → 422', async () => {
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: 'See' },
        sessionAId,
      ));
      expect(res.status).toBe(422);
    });

    it('exactly 10 chars → 200 (boundary valid)', async () => {
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: '1234567890' },
        sessionAId,
      ));
      expect(res.status).toBe(200);
    });
  });

  describe('(h) Validation — empty reason', () => {
    it('empty string → 422', async () => {
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: '' },
        sessionAId,
      ));
      expect(res.status).toBe(422);
    });

    it('missing override_reason field → 422', async () => {
      const res = await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA' },
        sessionAId,
      ));
      expect(res.status).toBe(422);
    });
  });

  describe('(i) Unknown ticker → 404', () => {
    it('POST with unknown ticker → 404', async () => {
      const res = await POST(makePostReq(
        { ticker: 'UNKNOWN_XYZ', final_code: '4AA', override_reason: 'Valid reason here' },
        sessionAId,
      ));
      expect(res.status).toBe(404);
    });

    it('GET with unknown ticker → 404', async () => {
      const res = await GET(makeGetReq('UNKNOWN_XYZ', sessionAId), {
        params: Promise.resolve({ ticker: 'UNKNOWN_XYZ' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('(j) Multi-user isolation', () => {
    it('user A override does not affect user B active_code', async () => {
      // User A sets override to '4AA'
      await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: 'User A specific view here' },
        sessionAId,
      ));

      // User B GET — should NOT see user A's override
      const resB = await GET(makeGetReq(TICKER, sessionBId), { params: makeParams(TICKER) });
      const bodyB = await resB.json();
      expect(bodyB.user_override_code).toBeNull();
      expect(bodyB.active_code).toBe(bodyB.system_suggested_code);
    });

    it('user A and user B can have different override codes for the same ticker', async () => {
      await POST(makePostReq(
        { ticker: TICKER, final_code: '4AA', override_reason: 'User A long-term view here' },
        sessionAId,
      ));
      await POST(makePostReq(
        { ticker: TICKER, final_code: '3AA', override_reason: 'User B conservative view here' },
        sessionBId,
      ));

      const [resA, resB] = await Promise.all([
        GET(makeGetReq(TICKER, sessionAId), { params: makeParams(TICKER) }),
        GET(makeGetReq(TICKER, sessionBId), { params: makeParams(TICKER) }),
      ]);
      const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

      expect(bodyA.user_override_code).toBe('4AA');
      expect(bodyB.user_override_code).toBe('3AA');
    });
  });
});
