// EPIC-003: Data Ingestion & Universe Management
// STORY-022: Data Freshness Tracking
// TASK-022-002: Integration tests — freshness status written by sync services
// RFC-004 §Data Freshness: data_freshness_status column written atomically with each sync

import { PrismaClient } from '@prisma/client';
import { syncPrices } from '@/modules/data-ingestion/jobs/price-sync.service';
import { syncFundamentals } from '@/modules/data-ingestion/jobs/fundamentals-sync.service';
import { syncForwardEstimates } from '@/modules/data-ingestion/jobs/forward-estimates-sync.service';
import type { VendorAdapter } from '@/modules/data-ingestion/ports/vendor-adapter.interface';

const prisma = new PrismaClient();

// BC-022-002: include providerName + capabilities so ProviderOrchestrator writes correct source_provider
function makeAdapter(overrides: Partial<VendorAdapter> = {}): VendorAdapter {
  return {
    providerName: 'tiingo' as const,
    capabilities: { forwardEstimateCoverage: 'partial' as const, rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: jest.fn(),
    fetchEODPrice: jest.fn().mockResolvedValue(null),
    fetchFundamentals: jest.fn().mockResolvedValue(null),
    fetchForwardEstimates: jest.fn().mockResolvedValue(null),
    fetchMetadata: jest.fn(),
    ...overrides,
  } as unknown as VendorAdapter;
}

const TEST_TICKER = 'FRESHTEST';

beforeAll(async () => {
  await prisma.stock.upsert({
    where: { ticker: TEST_TICKER },
    create: {
      ticker: TEST_TICKER,
      companyName: 'Freshness Test Inc',
      country: 'US', // BC-022-001: country is non-nullable VarChar(2), required in all create payloads
      inUniverse: true,
    },
    update: { inUniverse: true },
  });
});

afterAll(async () => {
  await prisma.stock.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.stock.update({
    where: { ticker: TEST_TICKER },
    data: {
      currentPrice: null,
      priceLastUpdatedAt: null,
      fundamentalsLastUpdatedAt: null,
      dataLastSyncedAt: null,
      dataFreshnessStatus: null,
    },
  });
});

describe('EPIC-003/STORY-022/TASK-022-002: freshness status integration', () => {
  it('syncPrices writes dataFreshnessStatus = missing when fundamentals + estimates are null', async () => {
    const now = new Date('2026-04-20T17:00:00Z');
    const tiingo = makeAdapter({
      fetchEODPrice: jest.fn().mockResolvedValue({ close: 100 }),
    });
    const fmp = makeAdapter();

    // BC-022-003: capture result and assert freshness count fields present in response (AC line 81)
    const result = await syncPrices(tiingo, fmp, { now });

    expect(typeof result.fresh_count).toBe('number');
    expect(typeof result.stale_count).toBe('number');
    expect(typeof result.missing_count).toBe('number');
    expect(result.missing_count).toBeGreaterThanOrEqual(1); // TEST_TICKER: fundamentals + estimates null

    const stock = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { dataFreshnessStatus: true, currentPrice: true },
    });

    expect(stock?.currentPrice?.toNumber()).toBe(100);
    // fundamentals and estimates null → missing overall
    expect(stock?.dataFreshnessStatus).toBe('missing');
  });

  it('syncPrices writes dataFreshnessStatus = fresh when all three timestamps are recent', async () => {
    const now = new Date('2026-04-20T17:00:00Z');

    // Pre-populate fundamentals + estimates timestamps (both fresh = 1 day ago)
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: {
        fundamentalsLastUpdatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        dataLastSyncedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    });

    const tiingo = makeAdapter({
      fetchEODPrice: jest.fn().mockResolvedValue({ close: 150 }),
    });
    const fmp = makeAdapter();

    await syncPrices(tiingo, fmp, { now });

    const stock = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { dataFreshnessStatus: true },
    });

    // price=now (fresh), fundamentals=1d ago (fresh), estimates=1d ago (fresh) → fresh
    expect(stock?.dataFreshnessStatus).toBe('fresh');
  });

  it('syncPrices writes dataFreshnessStatus = stale when fundamentals are stale', async () => {
    const now = new Date('2026-04-20T17:00:00Z');

    // fundamentals 100 days ago (stale: 90 <= 100 <= 179)
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: {
        fundamentalsLastUpdatedAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000),
        dataLastSyncedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    });

    const tiingo = makeAdapter({
      fetchEODPrice: jest.fn().mockResolvedValue({ close: 200 }),
    });
    const fmp = makeAdapter();

    await syncPrices(tiingo, fmp, { now });

    const stock = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { dataFreshnessStatus: true },
    });

    expect(stock?.dataFreshnessStatus).toBe('stale');
  });

  // BC-022-004: syncForwardEstimates freshness was untested in this file; Test Strategy requires all 3 sync types
  it('syncForwardEstimates writes dataFreshnessStatus = fresh when price + fundamentals are recent', async () => {
    const now = new Date('2026-04-20T19:00:00Z');

    // Pre-populate price + fundamentals timestamps (both 1 day ago = fresh)
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: {
        priceLastUpdatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        fundamentalsLastUpdatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    });

    // FMP (primary) returns forward_pe; Tiingo (fallback) not needed
    const fmp = makeAdapter({
      providerName: 'fmp' as const,
      fetchForwardEstimates: jest.fn().mockResolvedValue({ ticker: TEST_TICKER, forward_pe: 22.0, forward_ev_ebit: null }),
    });
    const tiingo = makeAdapter();

    await syncForwardEstimates(fmp, tiingo, { now });

    const stock = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { dataFreshnessStatus: true, forwardPe: true, dataLastSyncedAt: true },
    });

    expect(Number(stock!.forwardPe)).toBeCloseTo(22.0);
    expect(stock!.dataLastSyncedAt).toBeTruthy();
    // estimates=now (fresh), price=1d ago (fresh), fundamentals=1d ago (fresh) → fresh
    expect(stock?.dataFreshnessStatus).toBe('fresh');
  });

  it('syncFundamentals writes dataFreshnessStatus = fresh when price + estimates are recent', async () => {
    const now = new Date('2026-04-20T18:00:00Z');

    // Pre-populate price + estimates timestamps (both 1 day ago = fresh)
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: {
        priceLastUpdatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        dataLastSyncedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    });

    const tiingo = makeAdapter({
      fetchFundamentals: jest.fn().mockResolvedValue({ gross_margin: 0.45 }),
    });
    const fmp = makeAdapter();

    await syncFundamentals(tiingo, fmp, { now });

    const stock = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { dataFreshnessStatus: true, grossMargin: true },
    });

    expect(stock?.grossMargin?.toNumber()).toBeCloseTo(0.45);
    // fundamentals=now (fresh), price=1d ago (fresh), estimates=1d ago (fresh) → fresh
    expect(stock?.dataFreshnessStatus).toBe('fresh');
  });
});
