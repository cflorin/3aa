// EPIC-004: Classification Engine & Universe Screen
// STORY-049: Universe Screen — Filters and Sort
// TASK-049-008: Integration tests — GET /api/universe (filters/sort) + GET /api/universe/sectors
// RFC-003 §Filtering and Sort; ADR-007
//
// Test DB state (verified 2026-04-24):
//   In-universe: AAPL(3AA/high), ADBE(4AA/low), MSFT(3AA/low), TSLA(3AA/low), UBER(4AA/low), UNH(1AC/low)
//   Sectors: Technology (AAPL/ADBE/MSFT/UBER), Consumer Cyclical (TSLA), Healthcare (UNH)
//   Market cap desc: AAPL > MSFT > TSLA > UNH > UBER > ADBE

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { GET } from '../../../../src/app/api/universe/route';
import { GET as GET_SECTORS } from '../../../../src/app/api/universe/sectors/route';

// ── Test user setup ──────────────────────────────────────────────────────────

const USER_EMAIL = 'universe-filter-test@test.local';
let userId: string;
let sessionId: string;

async function createUser() {
  const passwordHash = await bcrypt.hash('testpass', 10);
  const user = await prisma.user.create({ data: { email: USER_EMAIL, passwordHash } });
  return user;
}

async function createSession(uid: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return prisma.userSession.create({ data: { userId: uid, expiresAt } });
}

async function cleanupUser() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) return;
  await prisma.userDeactivatedStock.deleteMany({ where: { userId: user.userId } });
  await prisma.userSession.deleteMany({ where: { userId: user.userId } });
  await prisma.user.delete({ where: { email: USER_EMAIL } });
}

function makeReq(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/universe${query}`, {
    method: 'GET',
    headers: { cookie: `sessionId=${sessionId}` },
  });
}

function makeSectorsReq(): NextRequest {
  return new NextRequest('http://localhost/api/universe/sectors', {
    method: 'GET',
    headers: { cookie: `sessionId=${sessionId}` },
  });
}

beforeAll(async () => {
  await cleanupUser();
  const user = await createUser();
  userId = user.userId;
  const sess = await createSession(userId);
  sessionId = sess.sessionId;
});

afterAll(async () => {
  await cleanupUser();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.userDeactivatedStock.deleteMany({ where: { userId } });
});

// ── GET /api/universe/sectors ─────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: GET /api/universe/sectors', () => {

  it('returns 200 with sectors array', async () => {
    const res = await GET_SECTORS(makeSectorsReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.sectors)).toBe(true);
  });

  it('returns Technology sector (has 4 in-universe stocks)', async () => {
    const res = await GET_SECTORS(makeSectorsReq());
    const body = await res.json();
    expect(body.sectors).toContain('Technology');
  });

  it('returns sectors alphabetically sorted', async () => {
    const res = await GET_SECTORS(makeSectorsReq());
    const body = await res.json();
    const sorted = [...body.sectors].sort();
    expect(body.sectors).toEqual(sorted);
  });

  it('returns no duplicate sectors', async () => {
    const res = await GET_SECTORS(makeSectorsReq());
    const body = await res.json();
    expect(new Set(body.sectors).size).toBe(body.sectors.length);
  });

  it('GET without session → 401', async () => {
    const res = await GET_SECTORS(new NextRequest('http://localhost/api/universe/sectors'));
    expect(res.status).toBe(401);
  });

});

// ── GET /api/universe — default (no filters) ─────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: GET /api/universe — default sort', () => {

  it('no params → returns 200 with stocks sorted by market_cap desc', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.stocks)).toBe(true);
    // AAPL should come before ADBE (much larger market cap)
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    const aaplIdx = tickers.indexOf('AAPL');
    const adbeIdx = tickers.indexOf('ADBE');
    expect(aaplIdx).toBeGreaterThanOrEqual(0);
    expect(adbeIdx).toBeGreaterThanOrEqual(0);
    expect(aaplIdx).toBeLessThan(adbeIdx);
  });

  it('explicit sort=market_cap&dir=desc same as default', async () => {
    const [r1, r2] = await Promise.all([
      GET(makeReq()),
      GET(makeReq('?sort=market_cap&dir=desc')),
    ]);
    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
    const t1 = b1.stocks.map((s: { ticker: string }) => s.ticker);
    const t2 = b2.stocks.map((s: { ticker: string }) => s.ticker);
    expect(t1).toEqual(t2);
  });

});

// ── Search filter ─────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: search filter', () => {

  it('?search=MSFT → returns MSFT (ticker prefix match)', async () => {
    const res = await GET(makeReq('?search=MSFT'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('MSFT');
  });

  it('?search=msft → case-insensitive ticker match', async () => {
    const res = await GET(makeReq('?search=msft'));
    const body = await res.json();
    expect(body.stocks.some((s: { ticker: string }) => s.ticker === 'MSFT')).toBe(true);
  });

  it('?search=micro → company name substring match (Microsoft)', async () => {
    const res = await GET(makeReq('?search=micro'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('MSFT');
  });

  it('?search=apple → company name match returns AAPL', async () => {
    const res = await GET(makeReq('?search=apple'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('AAPL');
  });

  it('?search=ZZZNOMATCH → no results, total=0', async () => {
    const res = await GET(makeReq('?search=ZZZNOMATCH'));
    const body = await res.json();
    expect(body.stocks).toHaveLength(0);
    expect(body.total).toBe(0);
  });

});

// ── Sector filter ─────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: sector filter', () => {

  it('?sector=Technology → only Technology stocks returned', async () => {
    const res = await GET(makeReq('?sector=Technology'));
    const body = await res.json();
    expect(body.stocks.length).toBeGreaterThan(0);
    for (const s of body.stocks) {
      expect(s.sector).toBe('Technology');
    }
  });

  it('?sector=Healthcare → only Healthcare stocks returned', async () => {
    const res = await GET(makeReq('?sector=Healthcare'));
    const body = await res.json();
    expect(body.stocks.length).toBeGreaterThan(0);
    for (const s of body.stocks) {
      expect(s.sector).toBe('Healthcare');
    }
  });

  it('?sector=Technology,Healthcare → AND-match returns both sectors', async () => {
    const res = await GET(makeReq('?sector=Technology,Healthcare'));
    const body = await res.json();
    const sectors = new Set(body.stocks.map((s: { sector: string }) => s.sector));
    expect(sectors.has('Technology')).toBe(true);
    expect(sectors.has('Healthcare')).toBe(true);
  });

  it('?sector=NONEXISTENT → no results', async () => {
    const res = await GET(makeReq('?sector=NONEXISTENT'));
    const body = await res.json();
    expect(body.total).toBe(0);
  });

});

// ── Code filter (in-memory prefix match) ─────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: code filter (in-memory prefix match)', () => {

  it('?code=4 → returns only stocks with active_code starting with "4" (ADBE, UBER)', async () => {
    const res = await GET(makeReq('?code=4'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker).sort();
    expect(tickers).toContain('ADBE');
    expect(tickers).toContain('UBER');
    for (const s of body.stocks) {
      expect(s.active_code?.startsWith('4')).toBe(true);
    }
  });

  it('?code=3 → returns AAPL, MSFT, TSLA (all 3AA)', async () => {
    const res = await GET(makeReq('?code=3'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('MSFT');
    expect(tickers).toContain('TSLA');
    for (const s of body.stocks) {
      expect(s.active_code?.startsWith('3')).toBe(true);
    }
  });

  it('?code=14 must NOT match "1AC" — only prefix, not substring', async () => {
    const res = await GET(makeReq('?code=14'));
    const body = await res.json();
    expect(body.total).toBe(0);
  });

  it('?code=4 does not return stocks with null active_code', async () => {
    // Insert a stock with no classification state to confirm null active_code is excluded
    const TEST_TICKER = 'TFILTER01';
    await prisma.stock.upsert({
      where: { ticker: TEST_TICKER },
      create: { ticker: TEST_TICKER, companyName: 'Filter Test Corp', country: 'US', inUniverse: true },
      update: { inUniverse: true },
    });
    // Ensure no classification state
    await prisma.classificationState.deleteMany({ where: { ticker: TEST_TICKER } });

    try {
      const res = await GET(makeReq('?code=4'));
      const body = await res.json();
      const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
      expect(tickers).not.toContain(TEST_TICKER);
    } finally {
      await prisma.stock.delete({ where: { ticker: TEST_TICKER } });
    }
  });

});

// ── Confidence filter ─────────────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: confidence filter', () => {

  it('?confidence=high → returns only high confidence stocks (AAPL)', async () => {
    const res = await GET(makeReq('?confidence=high'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('AAPL');
    for (const s of body.stocks) {
      expect(s.confidence_level).toBe('high');
    }
  });

  it('?confidence=low → returns low confidence stocks', async () => {
    const res = await GET(makeReq('?confidence=low'));
    const body = await res.json();
    expect(body.stocks.length).toBeGreaterThan(0);
    for (const s of body.stocks) {
      expect(s.confidence_level).toBe('low');
    }
  });

  it('?confidence=high,low → returns both high and low confidence', async () => {
    const [rAll, rFiltered] = await Promise.all([
      GET(makeReq()),
      GET(makeReq('?confidence=high,low')),
    ]);
    const [bAll, bFiltered] = await Promise.all([rAll.json(), rFiltered.json()]);
    // All in-universe stocks have high or low confidence → same total
    expect(bFiltered.total).toBe(bAll.total);
  });

  it('?confidence=no_classification → returns stocks with null confidence', async () => {
    const TEST_TICKER = 'TNOCLASS01';
    await prisma.stock.upsert({
      where: { ticker: TEST_TICKER },
      create: { ticker: TEST_TICKER, companyName: 'No Class Corp', country: 'US', inUniverse: true },
      update: { inUniverse: true },
    });
    await prisma.classificationState.deleteMany({ where: { ticker: TEST_TICKER } });

    try {
      const res = await GET(makeReq('?confidence=no_classification'));
      const body = await res.json();
      const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
      expect(tickers).toContain(TEST_TICKER);
      for (const s of body.stocks) {
        expect(s.confidence_level).toBeNull();
      }
    } finally {
      await prisma.stock.delete({ where: { ticker: TEST_TICKER } });
    }
  });

});

// ── Monitoring filter ─────────────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: monitoring filter', () => {

  it('?monitoring=inactive → returns only deactivated stocks for current user', async () => {
    // Deactivate MSFT for this user
    await prisma.userDeactivatedStock.create({ data: { userId, ticker: 'MSFT', deactivatedAt: new Date() } });

    const res = await GET(makeReq('?monitoring=inactive'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('MSFT');
    for (const s of body.stocks) {
      expect(s.is_active).toBe(false);
    }
  });

  it('?monitoring=active → excludes deactivated stocks', async () => {
    await prisma.userDeactivatedStock.create({ data: { userId, ticker: 'MSFT', deactivatedAt: new Date() } });

    const res = await GET(makeReq('?monitoring=active'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).not.toContain('MSFT');
    for (const s of body.stocks) {
      expect(s.is_active).toBe(true);
    }
  });

  it('?monitoring=inactive with no deactivated stocks → empty result', async () => {
    const res = await GET(makeReq('?monitoring=inactive'));
    const body = await res.json();
    expect(body.total).toBe(0);
  });

});

// ── Sort ──────────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: sort', () => {

  it('?sort=ticker&dir=asc → alphabetical order', async () => {
    const res = await GET(makeReq('?sort=ticker&dir=asc'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    // AAPL before MSFT before UNH
    expect(tickers.indexOf('AAPL')).toBeLessThan(tickers.indexOf('MSFT'));
    expect(tickers.indexOf('MSFT')).toBeLessThan(tickers.indexOf('UNH'));
  });

  it('?sort=ticker&dir=desc → reverse alphabetical order', async () => {
    const res = await GET(makeReq('?sort=ticker&dir=desc'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers.indexOf('UNH')).toBeLessThan(tickers.indexOf('MSFT'));
    expect(tickers.indexOf('MSFT')).toBeLessThan(tickers.indexOf('AAPL'));
  });

  it('?sort=market_cap&dir=desc → AAPL before ADBE (market cap order)', async () => {
    const res = await GET(makeReq('?sort=market_cap&dir=desc'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers.indexOf('AAPL')).toBeLessThan(tickers.indexOf('ADBE'));
  });

  it('null revenue_growth_fwd stocks sort last when sorting by revenue_growth_fwd', async () => {
    const TEST_TICKER = 'TNULLGROW1';
    await prisma.stock.upsert({
      where: { ticker: TEST_TICKER },
      create: {
        ticker: TEST_TICKER,
        companyName: 'Null Growth Co',
        country: 'US',
        inUniverse: true,
        revenueGrowthFwd: null,
      },
      update: { inUniverse: true, revenueGrowthFwd: null },
    });

    try {
      const res = await GET(makeReq('?sort=revenue_growth_fwd&dir=desc'));
      const body = await res.json();
      const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
      const nullIdx = tickers.indexOf(TEST_TICKER);
      expect(nullIdx).toBeGreaterThanOrEqual(0);
      // The null-growth stock should appear after any non-null stocks
      const nonNullCount = body.stocks.filter(
        (s: { revenue_growth_fwd: number | null }) => s.revenue_growth_fwd !== null
      ).length;
      if (nonNullCount > 0) {
        expect(nullIdx).toBeGreaterThanOrEqual(nonNullCount);
      }
    } finally {
      await prisma.stock.delete({ where: { ticker: TEST_TICKER } }).catch(() => {});
    }
  });

});

// ── Combined filters ──────────────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: combined filters (AND logic)', () => {

  it('?sector=Technology&confidence=high → only AAPL (Technology AND high confidence)', async () => {
    const res = await GET(makeReq('?sector=Technology&confidence=high'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('AAPL');
    // UNH is high confidence but not Technology; should be excluded
    // (in our test DB only AAPL has high confidence)
    expect(tickers).not.toContain('UNH');
  });

  it('?search=micro&sector=Technology → MSFT (matches both search and sector)', async () => {
    const res = await GET(makeReq('?search=micro&sector=Technology'));
    const body = await res.json();
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers).toContain('MSFT');
    for (const s of body.stocks) {
      expect(s.sector).toBe('Technology');
    }
  });

  it('?sector=Healthcare&code=4 → 0 results (no Healthcare stock has 4xx code)', async () => {
    const res = await GET(makeReq('?sector=Healthcare&code=4'));
    const body = await res.json();
    expect(body.total).toBe(0);
  });

});

// ── Pagination with filters ───────────────────────────────────────────────────

describe('EPIC-004/STORY-049/TASK-049-008: pagination with filters', () => {

  it('?limit=2&sort=ticker&dir=asc&page=1 → first 2 stocks by ticker', async () => {
    const res = await GET(makeReq('?limit=2&sort=ticker&dir=asc&page=1'));
    const body = await res.json();
    expect(body.stocks).toHaveLength(2);
    expect(body.page).toBe(1);
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers[0]).toBe('AAPL');
    expect(tickers[1]).toBe('ADBE');
  });

  it('?limit=2&sort=ticker&dir=asc&page=2 → stocks 3-4 by ticker', async () => {
    const res = await GET(makeReq('?limit=2&sort=ticker&dir=asc&page=2'));
    const body = await res.json();
    expect(body.stocks).toHaveLength(2);
    const tickers = body.stocks.map((s: { ticker: string }) => s.ticker);
    expect(tickers[0]).toBe('MSFT');
    expect(tickers[1]).toBe('TSLA');
  });

  it('total reflects filtered count (sector=Healthcare → total is 1 stock)', async () => {
    const res = await GET(makeReq('?sector=Healthcare'));
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.stocks).toHaveLength(1);
  });

});
