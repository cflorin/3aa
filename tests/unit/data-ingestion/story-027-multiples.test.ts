// EPIC-003: Data Ingestion & Universe Management
// STORY-027: Market Cap, Enterprise Value & Trailing Valuation Multiples
// TASK-027-007: Unit tests for syncMarketCapAndMultiples() and FMP adapter extensions

import { syncMarketCapAndMultiples } from '../../../src/modules/data-ingestion/jobs/market-cap-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { StockMetadata } from '../../../src/modules/data-ingestion/types';
import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

import { prisma } from '@/infrastructure/database/prisma';

const FIXED_NOW = new Date('2026-04-21T12:00:00.000Z');

function makeProfile(overrides: Partial<StockMetadata> = {}): StockMetadata {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    exchange: 'NASDAQ',
    market_cap_millions: 3282000,
    market_cap_usd: 3282000000000,
    shares_outstanding: 15380000000,
    ...overrides,
  };
}

function makeDbStock(overrides: Record<string, unknown> = {}) {
  return {
    ticker: 'AAPL',
    currentPrice: 213.49,
    earningsTtm: 96995000000,
    revenueTtm: 383285000000,
    ebitTtm: 114301000000,
    epsTtm: 6.13,
    totalDebt: 123930000000,
    cashAndEquivalents: 29965000000,
    dataProviderProvenance: {},
    ...overrides,
  };
}

function makeMockFmpAdapter(profileResult: StockMetadata | null): VendorAdapter {
  return {
    providerName: 'fmp',
    capabilities: { forwardEstimateCoverage: 'partial', rateLimit: { requestsPerHour: 15000 } },
    fetchUniverse: jest.fn(),
    fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn().mockResolvedValue(profileResult),
  } as unknown as VendorAdapter;
}

describe('EPIC-003/STORY-027/TASK-027-007: syncMarketCapAndMultiples()', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([makeDbStock()]);
    (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => jest.clearAllMocks());

  it('writes marketCap, trailingPe, trailingEvEbit, evSales from profile + DB TTM values', async () => {
    const result = await syncMarketCapAndMultiples(
      makeMockFmpAdapter(makeProfile()),
      { now: FIXED_NOW },
    );

    expect(result.stocks_updated).toBe(1);
    expect(result.stocks_skipped).toBe(0);
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // marketCap = raw USD from profile
    expect(updateCall.data.marketCap).toBe(3282000000000);

    // trailing_pe = 213.49 / 6.13 ≈ 34.8
    expect(Number(updateCall.data.trailingPe)).toBeCloseTo(213.49 / 6.13, 2);

    // EV = 3282B + 123.93B - 29.965B ≈ 3375.965B
    // ev_sales = EV / 383.285B ≈ 8.81
    const ev = 3282000000000 + 123930000000 - 29965000000;
    expect(Number(updateCall.data.evSales)).toBeCloseTo(ev / 383285000000, 2);

    // trailing_ev_ebit = EV / 114.301B ≈ 29.5
    expect(Number(updateCall.data.trailingEvEbit)).toBeCloseTo(ev / 114301000000, 2);
  });

  it('writes sharesOutstanding when profile returns it', async () => {
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.sharesOutstanding).toBe(15380000000);
  });

  it('does not write sharesOutstanding when profile returns null', async () => {
    await syncMarketCapAndMultiples(
      makeMockFmpAdapter(makeProfile({ shares_outstanding: null })),
      { now: FIXED_NOW },
    );
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.sharesOutstanding).toBeUndefined();
  });

  it('trailing_pe is null when epsTtm is zero', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      makeDbStock({ epsTtm: 0 }),
    ]);
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.trailingPe).toBeUndefined(); // not written when null
  });

  it('trailing_pe is null when epsTtm is negative (loss-making company)', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      makeDbStock({ epsTtm: -1.5 }),
    ]);
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.trailingPe).toBeUndefined();
  });

  it('trailing_pe is null when currentPrice is null', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      makeDbStock({ currentPrice: null }),
    ]);
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.trailingPe).toBeUndefined();
  });

  it('ev_sales is null when revenueTtm is null', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      makeDbStock({ revenueTtm: null }),
    ]);
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.evSales).toBeUndefined();
  });

  it('trailing_ev_ebit is null when ebitTtm is zero', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      makeDbStock({ ebitTtm: 0 }),
    ]);
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.trailingEvEbit).toBeUndefined();
  });

  it('treats null totalDebt/cash as zero in EV computation', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      makeDbStock({ totalDebt: null, cashAndEquivalents: null }),
    ]);
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    // EV = marketCap only when totalDebt and cash are null
    const ev = 3282000000000;
    expect(Number(updateCall.data.evSales)).toBeCloseTo(ev / 383285000000, 2);
  });

  it('skips stock and increments stocks_skipped when profile is null', async () => {
    const result = await syncMarketCapAndMultiples(
      makeMockFmpAdapter(null),
      { now: FIXED_NOW },
    );
    expect(result.stocks_skipped).toBe(1);
    expect(result.stocks_updated).toBe(0);
    expect(mockPrisma.stock.update).not.toHaveBeenCalled();
  });

  it('skips stock when market_cap_usd is null in profile', async () => {
    const result = await syncMarketCapAndMultiples(
      makeMockFmpAdapter(makeProfile({ market_cap_usd: null })),
      { now: FIXED_NOW },
    );
    expect(result.stocks_skipped).toBe(1);
    expect(mockPrisma.stock.update).not.toHaveBeenCalled();
  });

  it('writes provenance with provider fmp for market_cap and computed for multiples', async () => {
    await syncMarketCapAndMultiples(makeMockFmpAdapter(makeProfile()), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    expect(prov['market_cap']['provider']).toBe('fmp');
    expect(prov['trailing_pe']['provider']).toBe('computed');
    expect(prov['ev_sales']['provider']).toBe('computed');
    expect(prov['trailing_ev_ebit']['provider']).toBe('computed');
  });
});

describe('EPIC-003/STORY-027/TASK-027-007: FMPAdapter.fetchMetadata() extensions', () => {
  let adapter: FMPAdapter;

  function mockFetchResponse(body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: () => Promise.resolve(body),
    });
  }

  beforeEach(() => {
    adapter = new FMPAdapter('test-key');
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns market_cap_usd and shares_outstanding from profile response', async () => {
    mockFetchResponse([{
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      marketCap: 3282000000000,
      sharesOutstanding: 15380000000,
      exchange: 'NASDAQ',
      sector: 'Technology',
      industry: 'Consumer Electronics',
    }]);
    const result = await adapter.fetchMetadata('AAPL');
    expect(result!.market_cap_usd).toBe(3282000000000);
    expect(result!.shares_outstanding).toBe(15380000000);
    expect(result!.market_cap_millions).toBeCloseTo(3282000, 0);
  });

  it('returns null for shares_outstanding when field absent from profile', async () => {
    mockFetchResponse([{
      symbol: 'AAPL', companyName: 'Apple Inc.', marketCap: 3282000000000,
      exchange: 'NASDAQ', sector: null, industry: null,
      // sharesOutstanding intentionally absent
    }]);
    const result = await adapter.fetchMetadata('AAPL');
    expect(result!.shares_outstanding).toBeNull();
    expect(result!.market_cap_usd).toBe(3282000000000);
  });

  it('returns null for market_cap_usd when marketCap field absent', async () => {
    mockFetchResponse([{
      symbol: 'AAPL', companyName: 'Apple Inc.',
      exchange: 'NASDAQ', sector: null, industry: null,
    }]);
    const result = await adapter.fetchMetadata('AAPL');
    expect(result!.market_cap_usd).toBeNull();
    expect(result!.market_cap_millions).toBeNull();
    expect(result!.shares_outstanding).toBeNull();
  });
});
