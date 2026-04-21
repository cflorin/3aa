// EPIC-003: Data Ingestion & Universe Management
// STORY-023: Pipeline Integration Tests
// TASK-023-001: Full sequence + failure + idempotency tests
// TASK-023-002: Freshness end-state + stale detection tests
// RFC-004 §Full Pipeline — multi-job sequencing, provider failure propagation
// ADR-001: Fallback used across all three sync jobs
// ADR-002: Price → Fundamentals → Estimates sequence

import { PrismaClient } from '@prisma/client';
import { syncPrices } from '../../../src/modules/data-ingestion/jobs/price-sync.service';
import { syncFundamentals } from '../../../src/modules/data-ingestion/jobs/fundamentals-sync.service';
import { syncForwardEstimates } from '../../../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { PriceData, FundamentalData, ForwardEstimates } from '../../../src/modules/data-ingestion/types';
import type { ProvenanceEntry } from '../../../src/modules/data-ingestion/types';

const prisma = new PrismaClient();

const FIXED_NOW = new Date('2024-01-15T22:00:00.000Z');
// BC-023-001: shortened from PIPE_TEST_000 (13 chars) to PT_000 (6 chars) — VarChar(10) safe
const TEST_TICKERS = Array.from({ length: 5 }, (_, i) => `PT_${i.toString().padStart(3, '0')}`);

function makePrice(ticker: string): PriceData {
  return { ticker, date: FIXED_NOW, close: 100 + TEST_TICKERS.indexOf(ticker) };
}

function makeFundamentals(ticker: string): FundamentalData {
  return {
    ticker,
    revenue_growth_yoy: 10,
    eps_growth_yoy: 8,
    eps_growth_fwd: 5,
    revenue_ttm: 1000,
    earnings_ttm: 200,
    gross_margin: 0.4,
    operating_margin: 0.25,
    net_margin: 0.2,
    roe: 0.3,
    roa: 0.15,
    roic: 0.25,
    trailing_pe: 20,
    fcf_ttm: 50000000000,
    ebit_ttm: 80000000000,
    eps_ttm: 5.0,
    net_debt_to_ebitda: 0.5,
    total_debt: 60000000000,
    cash_and_equivalents: 30000000000,
    debt_to_equity: 0.5,
    current_ratio: 1.5,
    interest_coverage: 15,
  };
}

function makeEstimates(ticker: string): ForwardEstimates {
  return { ticker, forward_pe: 18.0, forward_ev_ebit: 12.0 };
}

function makeMockAdapter(
  name: 'tiingo' | 'fmp',
  {
    priceResult = (ticker: string) => makePrice(ticker),
    fundamentalsResult = (ticker: string) => makeFundamentals(ticker),
    estimatesResult = (ticker: string) => makeEstimates(ticker),
  }: {
    priceResult?: (ticker: string) => PriceData | null;
    fundamentalsResult?: (ticker: string) => FundamentalData | null;
    estimatesResult?: (ticker: string) => ForwardEstimates | null;
  } = {},
): VendorAdapter {
  return {
    providerName: name,
    capabilities: {
      forwardEstimateCoverage: name === 'fmp' ? 'full' : 'partial',
      rateLimit: { requestsPerHour: 100000 },
    },
    fetchUniverse: jest.fn().mockResolvedValue([]),
    fetchEODPrice: jest.fn().mockImplementation((ticker: string) =>
      Promise.resolve(priceResult(ticker))
    ),
    fetchFundamentals: jest.fn().mockImplementation((ticker: string) =>
      Promise.resolve(fundamentalsResult(ticker))
    ),
    fetchForwardEstimates: jest.fn().mockImplementation((ticker: string) =>
      Promise.resolve(estimatesResult(ticker))
    ),
    fetchMetadata: jest.fn().mockResolvedValue(null),
  } as unknown as VendorAdapter;
}

async function seedTestStocks(): Promise<void> {
  for (const ticker of TEST_TICKERS) {
    await prisma.stock.upsert({
      where: { ticker },
      create: {
        ticker,
        companyName: `Test ${ticker}`,
        country: 'US',
        inUniverse: true,
        dataFreshnessStatus: 'missing',
        trailingPe: 20,
        epsGrowthFwd: 5,
      },
      update: {
        inUniverse: true,
        dataFreshnessStatus: 'missing',
        currentPrice: null,
        priceLastUpdatedAt: null,
        fundamentalsLastUpdatedAt: null,
        dataLastSyncedAt: null,
        trailingPe: 20,
        epsGrowthFwd: 5,
        cyclicalityFlag: null,
      },
    });
  }
}

describe('EPIC-003/STORY-023/TASK-023-001: Pipeline integration tests @pipeline-integration', () => {
  // BC-023-002: 5606 live-proof stocks have inUniverse=TRUE in test DB; isolate them for count accuracy and timeout prevention
  let isolatedTickers: string[] = [];

  beforeAll(async () => {
    const rows = await prisma.stock.findMany({
      where: { inUniverse: true },
      select: { ticker: true },
    });
    isolatedTickers = rows.map((r) => r.ticker);
    if (isolatedTickers.length > 0) {
      await prisma.stock.updateMany({
        where: { ticker: { in: isolatedTickers } },
        data: { inUniverse: false },
      });
    }
  });

  beforeEach(async () => {
    await seedTestStocks();
  });

  afterEach(async () => {
    // BC-023-001: use { in: TEST_TICKERS } — startsWith: 'PT_' would match unrelated tickers
    await prisma.stock.deleteMany({ where: { ticker: { in: TEST_TICKERS } } });
  });

  afterAll(async () => {
    await prisma.stock.deleteMany({ where: { ticker: { in: TEST_TICKERS } } });
    // BC-023-002: restore pre-existing in-universe stocks
    if (isolatedTickers.length > 0) {
      await prisma.stock.updateMany({
        where: { ticker: { in: isolatedTickers } },
        data: { inUniverse: true },
      });
    }
    await prisma.$disconnect();
  });

  // ─── Scenario 1: Full daily sequence ───────────────────────────────────────

  it('Scenario 1: Full daily sequence — all stocks fresh after price+fundamentals+estimates', async () => {
    const tiingo = makeMockAdapter('tiingo');
    const fmp = makeMockAdapter('fmp');

    // ADR-002: price → fundamentals → estimates sequence
    await syncPrices(tiingo, fmp, { now: FIXED_NOW });
    await syncFundamentals(tiingo, fmp, { now: FIXED_NOW });
    await syncForwardEstimates(fmp, tiingo, { now: FIXED_NOW });

    const stocks = await prisma.stock.findMany({
      where: { ticker: { in: TEST_TICKERS } }, // BC-023-001
      select: {
        ticker: true,
        currentPrice: true,
        grossMargin: true,
        forwardPe: true,
        dataFreshnessStatus: true,
        dataProviderProvenance: true,
      },
    });

    expect(stocks.length).toBe(TEST_TICKERS.length);

    for (const stock of stocks) {
      // All three data categories populated (representative: price, fundamentals, estimates)
      expect(stock.currentPrice).not.toBeNull();
      expect(stock.grossMargin).not.toBeNull(); // spot-check for all 15 fundamental fields
      expect(stock.forwardPe).not.toBeNull();
      // All three categories synced on same injected date → fresh
      expect(stock.dataFreshnessStatus).toBe('fresh');
      // BC-023-004: provenance must cover all three data categories (price, fundamentals, estimates)
      const prov = stock.dataProviderProvenance as unknown as Record<string, ProvenanceEntry>;
      expect(prov?.['current_price']).toBeDefined();
      expect(prov?.['gross_margin']).toBeDefined();
      expect(prov?.['forward_pe']).toBeDefined();
    }
  }, 30_000);

  // ─── Scenario 2: Tiingo fully down — FMP fallback used ─────────────────────

  it('Scenario 2: Tiingo down — FMP fallback used; fallback_used=true in provenance', async () => {
    const tiingoDown = makeMockAdapter('tiingo', {
      priceResult: () => null,
      fundamentalsResult: () => null,
      estimatesResult: () => null,
    });
    const fmp = makeMockAdapter('fmp');

    const priceResult = await syncPrices(tiingoDown, fmp, { now: FIXED_NOW });
    const fundResult = await syncFundamentals(tiingoDown, fmp, { now: FIXED_NOW });
    // BC-023-005: spec requires all three daily sync jobs run in provider-failure scenario
    await syncForwardEstimates(fmp, tiingoDown, { now: FIXED_NOW });

    // All stocks should be updated via FMP fallback (ADR-001)
    expect(priceResult.stocks_updated).toBe(TEST_TICKERS.length);
    expect(priceResult.fallback_count).toBe(TEST_TICKERS.length);
    expect(fundResult.fallback_count).toBe(TEST_TICKERS.length);

    // Provenance shows fallback_used=true and provider='fmp'
    const stocks = await prisma.stock.findMany({
      where: { ticker: { in: TEST_TICKERS } }, // BC-023-001
      select: { dataProviderProvenance: true },
    });

    for (const stock of stocks) {
      const prov = stock.dataProviderProvenance as unknown as Record<string, ProvenanceEntry>;
      if (prov?.['current_price']) {
        expect(prov['current_price'].fallback_used).toBe(true);
        expect(prov['current_price'].provider).toBe('fmp');
      }
    }
  }, 30_000);

  // ─── Scenario 3: Partial failure ───────────────────────────────────────────

  it('Scenario 3: Both providers null for 2 of 5 stocks — those retain previous values', async () => {
    const failingTickers = new Set([TEST_TICKERS[0], TEST_TICKERS[1]]);

    // Seed known prices for the failing tickers
    for (const ticker of failingTickers) {
      await prisma.stock.update({
        where: { ticker },
        data: { currentPrice: 999 },
      });
    }

    const tiingo = makeMockAdapter('tiingo', {
      priceResult: (ticker) => failingTickers.has(ticker) ? null : makePrice(ticker),
      fundamentalsResult: (ticker) => failingTickers.has(ticker) ? null : makeFundamentals(ticker),
      estimatesResult: () => null,
    });
    const fmp = makeMockAdapter('fmp', {
      priceResult: (ticker) => failingTickers.has(ticker) ? null : makePrice(ticker),
      fundamentalsResult: (ticker) => failingTickers.has(ticker) ? null : makeFundamentals(ticker),
      estimatesResult: () => null,
    });

    const priceResult = await syncPrices(tiingo, fmp, { now: FIXED_NOW });

    // 3 stocks updated, 2 errored (both providers returned null)
    expect(priceResult.stocks_updated).toBe(3);
    expect(priceResult.errors).toBe(2);

    // Failing stocks retain their pre-seeded price
    for (const ticker of failingTickers) {
      const stock = await prisma.stock.findUnique({
        where: { ticker },
        select: { currentPrice: true },
      });
      expect(Number(stock!.currentPrice)).toBe(999);
    }
  }, 30_000);

  // ─── Scenario 4: Idempotency ────────────────────────────────────────────────

  it('Scenario 4: Running full sequence twice produces identical end state', async () => {
    const tiingo = makeMockAdapter('tiingo');
    const fmp = makeMockAdapter('fmp');

    // First run
    await syncPrices(tiingo, fmp, { now: FIXED_NOW });
    await syncFundamentals(tiingo, fmp, { now: FIXED_NOW });
    await syncForwardEstimates(fmp, tiingo, { now: FIXED_NOW });

    const snapshot1 = await prisma.stock.findMany({
      where: { ticker: { in: TEST_TICKERS } }, // BC-023-001
      select: { ticker: true, currentPrice: true, forwardPe: true, dataFreshnessStatus: true },
      orderBy: { ticker: 'asc' },
    });

    // Second run with same mock data and same timestamp
    await syncPrices(tiingo, fmp, { now: FIXED_NOW });
    await syncFundamentals(tiingo, fmp, { now: FIXED_NOW });
    await syncForwardEstimates(fmp, tiingo, { now: FIXED_NOW });

    const snapshot2 = await prisma.stock.findMany({
      where: { ticker: { in: TEST_TICKERS } }, // BC-023-001
      select: { ticker: true, currentPrice: true, forwardPe: true, dataFreshnessStatus: true },
      orderBy: { ticker: 'asc' },
    });

    // End state is identical — no drift, no duplicates
    expect(snapshot2.length).toBe(snapshot1.length);
    for (let i = 0; i < snapshot1.length; i++) {
      expect(snapshot2[i].ticker).toBe(snapshot1[i].ticker);
      expect(snapshot2[i].currentPrice?.toString()).toBe(snapshot1[i].currentPrice?.toString());
      expect(snapshot2[i].forwardPe?.toString()).toBe(snapshot1[i].forwardPe?.toString());
      expect(snapshot2[i].dataFreshnessStatus).toBe(snapshot1[i].dataFreshnessStatus);
    }
  }, 60_000);

  // ─── Scenario 5: Freshness end-state ───────────────────────────────────────

  it('Scenario 5: All in-universe stocks fresh after same-day full sync', async () => {
    const tiingo = makeMockAdapter('tiingo');
    const fmp = makeMockAdapter('fmp');

    // Run all three sync jobs on the same injected date
    await syncPrices(tiingo, fmp, { now: FIXED_NOW });
    await syncFundamentals(tiingo, fmp, { now: FIXED_NOW });
    await syncForwardEstimates(fmp, tiingo, { now: FIXED_NOW });

    const allStocks = await prisma.stock.findMany({
      where: { ticker: { in: TEST_TICKERS }, inUniverse: true }, // BC-023-001
      select: { dataFreshnessStatus: true },
    });

    const freshCount = allStocks.filter((s) => s.dataFreshnessStatus === 'fresh').length;
    expect(freshCount).toBe(allStocks.length);
  }, 30_000);

  // ─── Scenario 6: Stale detection ───────────────────────────────────────────

  it('Scenario 6: Running only fundamentals sync with stale price → overall = stale', async () => {
    const STALE_PRICE_DATE = new Date(FIXED_NOW.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const RECENT_DATE = new Date(FIXED_NOW.getTime() - 1 * 24 * 60 * 60 * 1000);     // 1 day ago (fresh)

    // Pre-seed: stale price (3d ago), recent estimates (1d ago, fresh)
    // Only price is stale; running fundamentals should leave overall = stale
    await prisma.stock.updateMany({
      where: { ticker: { in: TEST_TICKERS } }, // BC-023-001
      data: {
        priceLastUpdatedAt: STALE_PRICE_DATE,
        dataLastSyncedAt: RECENT_DATE,
      },
    });

    const tiingo = makeMockAdapter('tiingo');
    const fmp = makeMockAdapter('fmp');

    // Run only fundamentals sync (not price sync)
    await syncFundamentals(tiingo, fmp, { now: FIXED_NOW });

    const stocks = await prisma.stock.findMany({
      where: { ticker: { in: TEST_TICKERS } }, // BC-023-001
      select: { ticker: true, dataFreshnessStatus: true },
    });

    for (const stock of stocks) {
      // price: 3d → stale; fundamentals: now → fresh; estimates: 1d → fresh
      // any stale and none missing → overall = stale
      expect(stock.dataFreshnessStatus).toBe('stale');
    }
  }, 30_000);
});
