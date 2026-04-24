// EPIC-004: Classification Engine & Universe Screen
// STORY-046: User Monitoring Preferences API
// TASK-046-006: Integration tests — PUT /monitoring, GET /universe
// RFC-003 §Monitor List API; ADR-007; ADR-006 (session auth)
//
// Requires: test DB at DATABASE_URL; MSFT must exist in stocks table

import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { PUT } from '../../../../src/app/api/stocks/[ticker]/monitoring/route';
import { GET } from '../../../../src/app/api/universe/route';

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
  await prisma.userDeactivatedStock.deleteMany({ where: { userId: user.userId } });
  await prisma.userSession.deleteMany({ where: { userId: user.userId } });
  await prisma.user.delete({ where: { email } });
}

function makePutReq(ticker: string, body: unknown, sessionId?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest(`http://localhost/api/stocks/${ticker}/monitoring`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

function makeGetReq(sessionId?: string, query = ''): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest(`http://localhost/api/universe${query}`, { method: 'GET', headers });
}

function makeParams(ticker: string) {
  return Promise.resolve({ ticker });
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

const USER_A_EMAIL = 'monitoring-test-a@test.local';
const USER_B_EMAIL = 'monitoring-test-b@test.local';

// Synthetic pagination tickers (distinct prefix to avoid collision)
const PAG_TICKERS = ['TPAG01', 'TPAG02', 'TPAG03', 'TPAG04', 'TPAG05'];

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

  // Insert synthetic in-universe stocks for pagination test
  for (const ticker of PAG_TICKERS) {
    await prisma.stock.upsert({
      where: { ticker },
      create: { ticker, companyName: `Pag Corp ${ticker}`, country: 'US', inUniverse: true },
      update: { inUniverse: true },
    });
  }
});

afterAll(async () => {
  await cleanupUser(USER_A_EMAIL);
  await cleanupUser(USER_B_EMAIL);
  // Remove synthetic stocks
  await prisma.stock.deleteMany({ where: { ticker: { in: PAG_TICKERS } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.userDeactivatedStock.deleteMany({
    where: { userId: { in: [userAId, userBId] } },
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-046/TASK-046-006: monitoring preferences API integration', () => {

  describe('(a) Authentication guard', () => {
    it('PUT without session → 401', async () => {
      const res = await PUT(makePutReq(TICKER, { is_active: false }), { params: makeParams(TICKER) });
      expect(res.status).toBe(401);
    });

    it('GET /universe without session → 401', async () => {
      const res = await GET(makeGetReq());
      expect(res.status).toBe(401);
    });
  });

  describe('(b) PUT false — deactivate stock', () => {
    it('PUT is_active=false → 200; subsequent GET shows is_active=false', async () => {
      const putRes = await PUT(
        makePutReq(TICKER, { is_active: false }, sessionAId),
        { params: makeParams(TICKER) },
      );
      expect(putRes.status).toBe(200);
      const putBody = await putRes.json();
      expect(putBody.ticker).toBe(TICKER);
      expect(putBody.is_active).toBe(false);
      expect(putBody.updated_at).toBeDefined();

      const getRes = await GET(makeGetReq(sessionAId));
      const getBody = await getRes.json();
      const msft = getBody.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
      expect(msft).toBeDefined();
      expect(msft.is_active).toBe(false);
    });
  });

  describe('(c) PUT true — reactivate stock', () => {
    it('deactivate then reactivate → GET shows is_active=true', async () => {
      await PUT(makePutReq(TICKER, { is_active: false }, sessionAId), { params: makeParams(TICKER) });

      const putRes = await PUT(
        makePutReq(TICKER, { is_active: true }, sessionAId),
        { params: makeParams(TICKER) },
      );
      expect(putRes.status).toBe(200);
      expect((await putRes.json()).is_active).toBe(true);

      const getRes = await GET(makeGetReq(sessionAId));
      const getBody = await getRes.json();
      const msft = getBody.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
      expect(msft.is_active).toBe(true);
    });
  });

  describe('(d) Idempotency', () => {
    it('PUT false twice → 200, no duplicate row error', async () => {
      await PUT(makePutReq(TICKER, { is_active: false }, sessionAId), { params: makeParams(TICKER) });
      const res = await PUT(makePutReq(TICKER, { is_active: false }, sessionAId), { params: makeParams(TICKER) });
      expect(res.status).toBe(200);
    });

    it('PUT true when not deactivated → 200, no error', async () => {
      const res = await PUT(makePutReq(TICKER, { is_active: true }, sessionAId), { params: makeParams(TICKER) });
      expect(res.status).toBe(200);
    });
  });

  describe('(e) Unknown ticker → 404', () => {
    it('PUT with unknown ticker → 404', async () => {
      const res = await PUT(
        makePutReq('UNKNOWN_XYZ', { is_active: false }, sessionAId),
        { params: makeParams('UNKNOWN_XYZ') },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('(f) Multi-user isolation', () => {
    it('user A deactivates MSFT; user B GET still shows is_active=true for MSFT', async () => {
      await PUT(makePutReq(TICKER, { is_active: false }, sessionAId), { params: makeParams(TICKER) });

      const resB = await GET(makeGetReq(sessionBId));
      const bodyB = await resB.json();
      const msftB = bodyB.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
      expect(msftB.is_active).toBe(true);
    });

    it('user A and user B can have different deactivation states for the same ticker', async () => {
      await PUT(makePutReq(TICKER, { is_active: false }, sessionAId), { params: makeParams(TICKER) });
      // user B leaves MSFT active

      const [resA, resB] = await Promise.all([
        GET(makeGetReq(sessionAId)),
        GET(makeGetReq(sessionBId)),
      ]);
      const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);
      const msftA = bodyA.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
      const msftB = bodyB.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
      expect(msftA.is_active).toBe(false);
      expect(msftB.is_active).toBe(true);
    });
  });

  describe('(g) Deactivated stock still visible in GET', () => {
    it('deactivated stock appears in universe response with is_active=false (not hidden)', async () => {
      await PUT(makePutReq(TICKER, { is_active: false }, sessionAId), { params: makeParams(TICKER) });

      const res = await GET(makeGetReq(sessionAId));
      const body = await res.json();
      const msft = body.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
      expect(msft).toBeDefined();
      expect(msft.is_active).toBe(false);
    });
  });

  describe('(h) GET /universe response contract', () => {
    it('response includes stocks array, total, page, limit', async () => {
      const res = await GET(makeGetReq(sessionAId));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('stocks');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
      expect(Array.isArray(body.stocks)).toBe(true);
    });

    it('each stock has required fields', async () => {
      const res = await GET(makeGetReq(sessionAId));
      const body = await res.json();
      const stock = body.stocks[0];
      expect(stock).toHaveProperty('ticker');
      expect(stock).toHaveProperty('company_name');
      expect(stock).toHaveProperty('is_active');
      expect(stock).toHaveProperty('active_code');
      expect(stock).toHaveProperty('confidence_level');
      expect(typeof stock.is_active).toBe('boolean');
    });
  });

  describe('(i) Pagination', () => {
    it('page=1&limit=3 returns 3 stocks', async () => {
      const res = await GET(makeGetReq(sessionAId, '?page=1&limit=3'));
      const body = await res.json();
      expect(body.stocks).toHaveLength(3);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(3);
    });

    it('page=2&limit=3 returns different stocks than page=1', async () => {
      const [res1, res2] = await Promise.all([
        GET(makeGetReq(sessionAId, '?page=1&limit=3')),
        GET(makeGetReq(sessionAId, '?page=2&limit=3')),
      ]);
      const [body1, body2] = await Promise.all([res1.json(), res2.json()]);
      const tickers1 = body1.stocks.map((s: { ticker: string }) => s.ticker);
      const tickers2 = body2.stocks.map((s: { ticker: string }) => s.ticker);
      expect(tickers1).not.toEqual(tickers2);
    });

    it('total reflects full in-universe count, not just page', async () => {
      const res = await GET(makeGetReq(sessionAId, '?page=1&limit=3'));
      const body = await res.json();
      expect(body.total).toBeGreaterThan(3);
    });
  });
});
