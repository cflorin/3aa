// EPIC-004: Classification Engine & Universe Screen
// STORY-047: Classification Recompute Batch Job
// TASK-047-006: Integration tests — POST /api/cron/classification
// RFC-001 §Classification Batch Job; ADR-008; ADR-002
//
// NODE_ENV=test → verifySchedulerToken is a no-op; no OIDC token needed.
// Requires: test DB with in_universe=TRUE stocks.

import { NextRequest } from 'next/server';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { POST } from '../../../../src/app/api/cron/classification/route';

function makePostReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/classification', { method: 'POST' });
}

async function clearClassificationState(tickers: string[]) {
  await prisma.classificationHistory.deleteMany({ where: { ticker: { in: tickers } } });
  await prisma.classificationState.deleteMany({ where: { ticker: { in: tickers } } });
}

// Discovered at runtime — may vary across test DB setups
let inUniverseTickers: string[] = [];
let inUniverseCount = 0;

describe('EPIC-004/STORY-047/TASK-047-006: classification batch endpoint integration', () => {

  beforeAll(async () => {
    const stocks = await prisma.stock.findMany({
      where: { inUniverse: true },
      select: { ticker: true },
      orderBy: { ticker: 'asc' },
    });
    inUniverseTickers = stocks.map((s) => s.ticker);
    inUniverseCount = inUniverseTickers.length;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('(a) First run — all stocks processed and recomputed', () => {
    beforeAll(async () => {
      await clearClassificationState(inUniverseTickers);
    });

    it(`returns 200; processed=${inUniverseCount}, all recomputed, 0 skipped, 0 errors`, async () => {
      const res = await POST(makePostReq());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.processed).toBe(inUniverseCount);
      expect(body.recomputed).toBe(inUniverseCount);
      expect(body.skipped).toBe(0);
      expect(body.errors).toBe(0);
      expect(typeof body.duration_ms).toBe('number');
    });

    it('all in-universe stocks have classification_state rows after first run', async () => {
      const states = await prisma.classificationState.findMany({
        where: { ticker: { in: inUniverseTickers } },
        select: { ticker: true },
      });
      expect(states).toHaveLength(inUniverseCount);
    });
  });

  describe('(b) Second run — no data change → all skipped', () => {
    it('second run: recomputed=0, all skipped', async () => {
      const res = await POST(makePostReq());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.recomputed).toBe(0);
      expect(body.skipped).toBe(inUniverseCount);
      expect(body.errors).toBe(0);
    });
  });

  describe('(c) Delta triggers recompute for changed stock only', () => {
    const DELTA_TICKER = 'MSFT';
    let originalValue: unknown;

    beforeAll(async () => {
      const stock = await prisma.stock.findUnique({
        where: { ticker: DELTA_TICKER },
        select: { revenueGrowthFwd: true },
      });
      originalValue = stock?.revenueGrowthFwd;
      const newValue = Number(stock?.revenueGrowthFwd ?? 0) + 6; // +6pp → +0.06 in domain fractions
      await prisma.stock.update({
        where: { ticker: DELTA_TICKER },
        data: { revenueGrowthFwd: newValue },
      });
    });

    afterAll(async () => {
      await prisma.stock.update({
        where: { ticker: DELTA_TICKER },
        data: { revenueGrowthFwd: originalValue as number },
      });
    });

    it('run after MSFT delta: recomputed=1, skipped=N-1', async () => {
      const res = await POST(makePostReq());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.recomputed).toBe(1);
      expect(body.skipped).toBe(inUniverseCount - 1);
      expect(body.errors).toBe(0);
    });
  });

  describe('(d) in_universe=FALSE stock not recomputed', () => {
    const EXCLUDE_TICKER = 'MSFT';

    beforeAll(async () => {
      await prisma.stock.update({ where: { ticker: EXCLUDE_TICKER }, data: { inUniverse: false } });
    });

    afterAll(async () => {
      await prisma.stock.update({ where: { ticker: EXCLUDE_TICKER }, data: { inUniverse: true } });
    });

    it('processed = N-1; excluded stock classification_state not updated', async () => {
      const beforeState = await prisma.classificationState.findUnique({
        where: { ticker: EXCLUDE_TICKER },
        select: { updatedAt: true },
      });

      const res = await POST(makePostReq());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.processed).toBe(inUniverseCount - 1);

      const afterState = await prisma.classificationState.findUnique({
        where: { ticker: EXCLUDE_TICKER },
        select: { updatedAt: true },
      });
      expect(afterState?.updatedAt?.getTime()).toBe(beforeState?.updatedAt?.getTime());
    });
  });

  describe('(e) Response contract', () => {
    it('response has all required summary fields with correct types', async () => {
      const res = await POST(makePostReq());
      const body = await res.json();
      expect(body).toHaveProperty('processed');
      expect(body).toHaveProperty('recomputed');
      expect(body).toHaveProperty('skipped');
      expect(body).toHaveProperty('errors');
      expect(body).toHaveProperty('duration_ms');
      expect(typeof body.processed).toBe('number');
      expect(typeof body.recomputed).toBe('number');
      expect(typeof body.skipped).toBe('number');
      expect(typeof body.errors).toBe('number');
      expect(typeof body.duration_ms).toBe('number');
    });
  });
});
