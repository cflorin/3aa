// EPIC-004: Classification Engine & Universe Screen
// STORY-052: EPIC-004 End-to-End Tests
// TASK-052-002: E2E workflow tests W1–W4
// PRD §Screen 2; RFC-001 §Classification Engine; RFC-003 §Universe Screen
//
// Fixture provenance: sanitized_real (stock data from universe-snapshot-5.md)
// Requires: test DB at DATABASE_URL (NODE_ENV=test)

import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import {
  seedUniverse, cleanupUniverse, prisma,
  STOCK_TICKERS,
} from './fixtures/seed-universe';
import { GET as universeGET } from '../../../src/app/api/universe/route';
import { GET as classificationGET } from '../../../src/app/api/stocks/[ticker]/classification/route';
import { POST as overridePOST } from '../../../src/app/api/classification-override/route';
import { DELETE as overrideDELETE } from '../../../src/app/api/classification-override/[ticker]/route';
import { PUT as monitoringPUT } from '../../../src/app/api/stocks/[ticker]/monitoring/route';

// ── Test helpers ──────────────────────────────────────────────────────────────

async function createUser(email: string) {
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
  await prisma.userSession.deleteMany({ where: { userId: user.userId } });
  await prisma.userClassificationOverride.deleteMany({ where: { userId: user.userId } });
  await prisma.userDeactivatedStock.deleteMany({ where: { userId: user.userId } });
  await prisma.user.delete({ where: { email } });
}

function req(url: string, sessionId: string, opts: { method?: string; body?: unknown } = {}): NextRequest {
  const { method = 'GET', body } = opts;
  const headers: Record<string, string> = { cookie: `sessionId=${sessionId}` };
  if (body) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Suite setup ───────────────────────────────────────────────────────────────

const W1_EMAIL = 'w1-e2e@test.com';
const W2_EMAIL = 'w2-e2e@test.com';
const W3_EMAIL = 'w3-e2e@test.com';
const W4_EMAIL = 'w4-e2e@test.com';

let w1Session: string;
let w2Session: string;
let w3Session: string;
let w4Session: string;

beforeAll(async () => {
  // Clean up any leftover state
  await Promise.all([W1_EMAIL, W2_EMAIL, W3_EMAIL, W4_EMAIL].map(cleanupUser));
  await cleanupUniverse();

  // Seed 5 stocks + BIN8_TEST + their classification states
  await seedUniverse();

  // Create test users
  const [u1, u2, u3, u4] = await Promise.all([
    createUser(W1_EMAIL),
    createUser(W2_EMAIL),
    createUser(W3_EMAIL),
    createUser(W4_EMAIL),
  ]);
  const [s1, s2, s3, s4] = await Promise.all([
    createSession(u1.userId),
    createSession(u2.userId),
    createSession(u3.userId),
    createSession(u4.userId),
  ]);
  w1Session = s1.sessionId;
  w2Session = s2.sessionId;
  w3Session = s3.sessionId;
  w4Session = s4.sessionId;
}, 60_000);

afterAll(async () => {
  await Promise.all([W1_EMAIL, W2_EMAIL, W3_EMAIL, W4_EMAIL].map(cleanupUser));
  await cleanupUniverse();
}, 30_000);

// ── W1: Full Classification Journey ──────────────────────────────────────────

describe('EPIC-004/STORY-052/W1: Full classification journey', () => {
  const TICKER = 'MSFT';

  it('W1-1: GET /api/universe returns seeded stocks with classification data', async () => {
    const res = await universeGET(req(`http://localhost/api/universe`, w1Session));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stocks.length).toBeGreaterThanOrEqual(5);
    const msft = body.stocks.find((s: { ticker: string }) => s.ticker === 'MSFT');
    expect(msft).toBeDefined();
    expect(msft.active_code).not.toBeUndefined();
    expect(msft.confidence_level).toMatch(/^(high|medium|low)$/);
  });

  it('W1-2: GET /api/stocks/MSFT/classification returns system classification', async () => {
    const res = await classificationGET(
      req(`http://localhost/api/stocks/${TICKER}/classification`, w1Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticker).toBe(TICKER);
    expect(body.system_suggested_code).not.toBeNull();
    expect(body.user_override_code).toBeNull();
    expect(body.active_code).toBe(body.system_suggested_code);
    expect(body.override_scope).toBe('display_only');
  });

  it('W1-3: POST /api/classification-override sets override; active_code changes', async () => {
    const originalRes = await classificationGET(
      req(`http://localhost/api/stocks/${TICKER}/classification`, w1Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const { system_suggested_code } = await originalRes.json();

    // Set override to a different code
    const overrideCode = system_suggested_code === '3AA' ? '4AA' : '3AA';
    const overrideRes = await overridePOST(req(
      `http://localhost/api/classification-override`,
      w1Session,
      { method: 'POST', body: { ticker: TICKER, final_code: overrideCode, override_reason: 'E2E test manual review override' } },
    ));
    expect(overrideRes.status).toBe(200);
    const overrideBody = await overrideRes.json();
    expect(overrideBody.active_code).toBe(overrideCode);
    expect(overrideBody.user_override_code).toBe(overrideCode);
  });

  it('W1-4: After override, GET classification reflects override in active_code', async () => {
    const res = await classificationGET(
      req(`http://localhost/api/stocks/${TICKER}/classification`, w1Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect(body.user_override_code).not.toBeNull();
    expect(body.active_code).toBe(body.user_override_code);
    expect(body.active_code).not.toBe(body.system_suggested_code);
  });

  it('W1-5: DELETE override; active_code reverts to system_suggested_code', async () => {
    const deleteRes = await overrideDELETE(
      req(`http://localhost/api/classification-override/${TICKER}`, w1Session, { method: 'DELETE' }),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(deleteRes.status).toBe(204);

    const res = await classificationGET(
      req(`http://localhost/api/stocks/${TICKER}/classification`, w1Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect(body.user_override_code).toBeNull();
    expect(body.active_code).toBe(body.system_suggested_code);
  });
});

// ── W2: Deactivation Workflow ─────────────────────────────────────────────────

describe('EPIC-004/STORY-052/W2: Deactivation workflow', () => {
  const TICKER = 'ADBE';

  it('W2-1: PUT monitoring off; universe shows is_active=false for ADBE', async () => {
    const putRes = await monitoringPUT(
      req(`http://localhost/api/stocks/${TICKER}/monitoring`, w2Session,
        { method: 'PUT', body: { is_active: false } }),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(putRes.status).toBe(200);

    const universeRes = await universeGET(req(`http://localhost/api/universe`, w2Session));
    const body = await universeRes.json();
    const adbe = body.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
    expect(adbe).toBeDefined();
    expect(adbe.is_active).toBe(false);
  });

  it('W2-2: Filter monitoring=inactive returns ADBE', async () => {
    const res = await universeGET(req(`http://localhost/api/universe?monitoring=inactive`, w2Session));
    const body = await res.json();
    const adbe = body.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
    expect(adbe).toBeDefined();
    expect(adbe.is_active).toBe(false);
  });

  it('W2-3: Reactivate; ADBE is_active=true and absent from inactive filter', async () => {
    await monitoringPUT(
      req(`http://localhost/api/stocks/${TICKER}/monitoring`, w2Session,
        { method: 'PUT', body: { is_active: true } }),
      { params: Promise.resolve({ ticker: TICKER }) },
    );

    const universeRes = await universeGET(req(`http://localhost/api/universe`, w2Session));
    const body = await universeRes.json();
    const adbe = body.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
    expect(adbe).toBeDefined();
    expect(adbe.is_active).toBe(true);

    // Should no longer appear in inactive filter
    const inactiveRes = await universeGET(req(`http://localhost/api/universe?monitoring=inactive`, w2Session));
    const inactiveBody = await inactiveRes.json();
    const adbeInactive = inactiveBody.stocks.find((s: { ticker: string }) => s.ticker === TICKER);
    expect(adbeInactive).toBeUndefined();
  });
});

// ── W3: Filter + Sort Workflow ────────────────────────────────────────────────

describe('EPIC-004/STORY-052/W3: Filter and sort workflow', () => {

  it('W3-1: search=microsoft returns only MSFT', async () => {
    const res = await universeGET(req(`http://localhost/api/universe?search=microsoft`, w3Session));
    const body = await res.json();
    expect(body.stocks.length).toBe(1);
    expect(body.stocks[0].ticker).toBe('MSFT');
  });

  it('W3-2: sector=Technology returns MSFT, ADBE, UBER (not TSLA/UNH)', async () => {
    const res = await universeGET(req(`http://localhost/api/universe?sector=Technology`, w3Session));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('MSFT');
    expect(tickers).toContain('ADBE');
    expect(tickers).toContain('UBER');
    expect(tickers).not.toContain('TSLA');  // Consumer Cyclical
    expect(tickers).not.toContain('UNH');   // Healthcare
  });

  it('W3-3: sort=market_cap&dir=desc — MSFT is first (highest market cap)', async () => {
    const res = await universeGET(
      req(`http://localhost/api/universe?sort=market_cap&dir=desc`, w3Session)
    );
    const body = await res.json();
    expect(body.stocks[0].ticker).toBe('MSFT');
  });

  it('W3-4: sort=market_cap&dir=asc — BIN8_TEST or UNH/ADBE is first (lowest market cap)', async () => {
    const res = await universeGET(
      req(`http://localhost/api/universe?sort=market_cap&dir=asc`, w3Session)
    );
    const body = await res.json();
    // BIN8_TEST has $5B market cap — smallest in seed
    expect(body.stocks[0].ticker).toBe('BIN8_TEST');
  });

  it('W3-5: sector=Healthcare returns only UNH', async () => {
    const res = await universeGET(req(`http://localhost/api/universe?sector=Healthcare`, w3Session));
    const body = await res.json();
    expect(body.stocks.length).toBe(1);
    expect(body.stocks[0].ticker).toBe('UNH');
  });

  it('W3-6: no filters returns all 6 seeded stocks', async () => {
    const res = await universeGET(req(`http://localhost/api/universe`, w3Session));
    const body = await res.json();
    const seededTickers = ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH', 'BIN8_TEST'];
    const returnedTickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    for (const t of seededTickers) {
      expect(returnedTickers).toContain(t);
    }
  });
});

// ── W4: Pagination Workflow ───────────────────────────────────────────────────

describe('EPIC-004/STORY-052/W4: Pagination workflow', () => {

  it('W4-1: page 1 and page 2 return different tickers (pageSize=3)', async () => {
    const res1 = await universeGET(req(`http://localhost/api/universe?limit=3&page=1&sort=ticker&dir=asc`, w4Session));
    const res2 = await universeGET(req(`http://localhost/api/universe?limit=3&page=2&sort=ticker&dir=asc`, w4Session));
    const body1 = await res1.json();
    const body2 = await res2.json();
    const tickers1 = body1.stocks.map((s: { ticker: string }) => s.ticker);
    const tickers2 = body2.stocks.map((s: { ticker: string }) => s.ticker);
    // No overlap between pages
    const overlap = tickers1.filter((t: string) => tickers2.includes(t));
    expect(overlap).toHaveLength(0);
    // Both pages have stocks
    expect(tickers1.length).toBeGreaterThan(0);
    expect(tickers2.length).toBeGreaterThan(0);
  });

  it('W4-2: total reflects all in-universe stocks', async () => {
    const res = await universeGET(req(`http://localhost/api/universe?limit=3&page=1`, w4Session));
    const body = await res.json();
    // total should be >= 6 (our seeded stocks; may be more if other stocks exist in DB)
    expect(body.total).toBeGreaterThanOrEqual(6);
  });

  it('W4-3: applying search filter reduces total and resets effective page', async () => {
    const res = await universeGET(
      req(`http://localhost/api/universe?search=microsoft&limit=3&page=1`, w4Session)
    );
    const body = await res.json();
    expect(body.stocks.length).toBe(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
  });

  it('W4-4: page beyond total returns empty stocks array', async () => {
    const res = await universeGET(
      req(`http://localhost/api/universe?search=microsoft&limit=3&page=99`, w4Session)
    );
    const body = await res.json();
    expect(body.stocks).toHaveLength(0);
  });
});
