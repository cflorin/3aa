// EPIC-003: Data Ingestion & Universe Management
// STORY-018: Universe Sync Job
// TASK-018-002: Unit tests — syncUniverse()
// RFC-004 §Universe Sync; ADR-001 Tiingo preferred; ADR-003 no delete

import { syncUniverse } from '../../../src/modules/data-ingestion/jobs/universe-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { UniverseStock } from '../../../src/modules/data-ingestion/types';

// Mock Prisma
jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import { prisma } from '@/infrastructure/database/prisma';

function makeStock(overrides: Partial<UniverseStock> = {}): UniverseStock {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc',
    exchange: 'NASDAQ',
    market_cap_millions: 3_000_000,
    country: 'US',
    sector: 'Technology',
    industry: 'Hardware',
    ...overrides,
  };
}

function makeMockAdapter(
  providerName: 'tiingo' | 'fmp',
  universeResult: UniverseStock[] | Error,
): VendorAdapter {
  const fetchUniverseMock = universeResult instanceof Error
    ? jest.fn().mockRejectedValue(universeResult)
    : jest.fn().mockResolvedValue(universeResult);

  return {
    providerName,
    capabilities: { forwardEstimateCoverage: 'partial', rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: fetchUniverseMock,
    fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

describe('EPIC-003/STORY-018/TASK-018-002: syncUniverse()', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    (mockPrisma.stock.upsert as jest.Mock).mockResolvedValue({});
    (mockPrisma.stock.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches from both providers in parallel and upserts qualifying stocks', async () => {
    const tiingo = makeMockAdapter('tiingo', [makeStock({ ticker: 'AAPL' })]);
    const fmp = makeMockAdapter('fmp', [makeStock({ ticker: 'MSFT', company_name: 'Microsoft' })]);

    const result = await syncUniverse(tiingo, fmp);

    expect(result.errors).toHaveLength(0);
    expect(tiingo.fetchUniverse).toHaveBeenCalledWith(5000);
    expect(fmp.fetchUniverse).toHaveBeenCalledWith(5000);
  });

  it('deduplicates by ticker — Tiingo preferred on conflict', async () => {
    const tiingoStock = makeStock({ ticker: 'AAPL', company_name: 'Apple (Tiingo)', market_cap_millions: 3_000_000 });
    const fmpStock = makeStock({ ticker: 'AAPL', company_name: 'Apple (FMP)', market_cap_millions: 2_999_000 });

    const tiingo = makeMockAdapter('tiingo', [tiingoStock]);
    const fmp = makeMockAdapter('fmp', [fmpStock]);

    await syncUniverse(tiingo, fmp);

    // Exactly one upsert call for AAPL
    expect(mockPrisma.stock.upsert).toHaveBeenCalledTimes(1);

    const upsertCall = (mockPrisma.stock.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.create.companyName).toBe('Apple (Tiingo)');
    expect(upsertCall.update.companyName).toBe('Apple (Tiingo)');
  });

  it('continues with Tiingo data when FMP fails; records error', async () => {
    const tiingo = makeMockAdapter('tiingo', [makeStock()]);
    const fmp = makeMockAdapter('fmp', new Error('FMP unavailable'));

    const result = await syncUniverse(tiingo, fmp);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('FMP fetchUniverse failed');
    expect(result.stocks_upserted).toBeGreaterThan(0);
  });

  it('continues with FMP data when Tiingo fails; records error', async () => {
    const tiingo = makeMockAdapter('tiingo', new Error('Tiingo unavailable'));
    const fmp = makeMockAdapter('fmp', [makeStock()]);

    const result = await syncUniverse(tiingo, fmp);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Tiingo fetchUniverse failed');
    expect(result.stocks_upserted).toBeGreaterThan(0);
  });

  it('aborts without DB changes when both providers fail', async () => {
    const tiingo = makeMockAdapter('tiingo', new Error('Tiingo down'));
    const fmp = makeMockAdapter('fmp', new Error('FMP down'));

    const result = await syncUniverse(tiingo, fmp);

    expect(result.stocks_upserted).toBe(0);
    expect(result.stocks_dropped).toBe(0);
    expect(result.errors).toHaveLength(2);
    // DB should NOT have been called
    expect(mockPrisma.stock.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.stock.updateMany).not.toHaveBeenCalled();
  });

  it('excludes stock with market_cap_millions < 5000 (post-filter)', async () => {
    const tiingo = makeMockAdapter('tiingo', [
      makeStock({ ticker: 'BIG', market_cap_millions: 6000 }),
      makeStock({ ticker: 'SMLL', market_cap_millions: 4999 }),
    ]);
    const fmp = makeMockAdapter('fmp', []);

    await syncUniverse(tiingo, fmp);

    const upsertCalls = (mockPrisma.stock.upsert as jest.Mock).mock.calls;
    const smallCoCalls = upsertCalls.filter((c) => c[0]?.where?.ticker === 'SMLL');
    expect(smallCoCalls).toHaveLength(0);
  });

  it('returns stocks_upserted equal to number of qualifying stocks', async () => {
    const stocks = [
      makeStock({ ticker: 'AAPL' }),
      makeStock({ ticker: 'MSFT' }),
      makeStock({ ticker: 'GOOG' }),
    ];
    const tiingo = makeMockAdapter('tiingo', stocks);
    const fmp = makeMockAdapter('fmp', []);

    const result = await syncUniverse(tiingo, fmp);
    expect(result.stocks_upserted).toBe(3);
  });

  // BC-018-001: FMP fetchUniverse() is a no-op returning [] without throwing (STORY-017).
  // If abort checked errors.length===2, Tiingo failure + FMP silence = errors.length=1 → no abort → universe wipe.
  it('aborts when Tiingo fails and FMP returns [] silently (FMP no-op scenario)', async () => {
    const tiingo = makeMockAdapter('tiingo', new Error('Tiingo down'));
    const fmp = makeMockAdapter('fmp', []);

    const result = await syncUniverse(tiingo, fmp);

    expect(result.stocks_upserted).toBe(0);
    expect(result.stocks_dropped).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Tiingo fetchUniverse failed');
    expect(mockPrisma.stock.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.stock.updateMany).not.toHaveBeenCalled();
  });

  // BC-018-002: Tiingo /fundamentals/meta has no marketCap field → market_cap_millions=null.
  // null = unknown; cannot confirm below threshold; include in universe.
  it('null market_cap_millions passes filter — unknown treated as include (Tiingo behavior)', async () => {
    const tiingo = makeMockAdapter('tiingo', [
      makeStock({ ticker: 'NULL_CAP', market_cap_millions: null }),
    ]);
    const fmp = makeMockAdapter('fmp', []);

    await syncUniverse(tiingo, fmp);

    const upsertCalls = (mockPrisma.stock.upsert as jest.Mock).mock.calls;
    const nullCapCall = upsertCalls.find((c) => c[0]?.where?.ticker === 'NULL_CAP');
    expect(nullCapCall).toBeDefined();
  });

  it('excludes stock with country !== US regardless of market cap', async () => {
    const tiingo = makeMockAdapter('tiingo', [
      makeStock({ ticker: 'US_CO', market_cap_millions: 10_000, country: 'US' }),
      makeStock({ ticker: 'CA_CO', market_cap_millions: 10_000, country: 'CA' }),
    ]);
    const fmp = makeMockAdapter('fmp', []);

    await syncUniverse(tiingo, fmp);

    const upsertCalls = (mockPrisma.stock.upsert as jest.Mock).mock.calls;
    const caCall = upsertCalls.find((c) => c[0]?.where?.ticker === 'CA_CO');
    const usCall = upsertCalls.find((c) => c[0]?.where?.ticker === 'US_CO');
    expect(caCall).toBeUndefined();
    expect(usCall).toBeDefined();
  });

  it('BC-018-005: adapter returns lowercase ticker → upsert and notIn use uppercased key', async () => {
    const tiingo = makeMockAdapter('tiingo', [
      makeStock({ ticker: 'aapl', company_name: 'Apple Inc', market_cap_millions: 3_000_000, country: 'US' }),
    ]);
    const fmp = makeMockAdapter('fmp', []);

    await syncUniverse(tiingo, fmp);

    const upsertCall = (mockPrisma.stock.upsert as jest.Mock).mock.calls[0][0];
    // ticker stored and looked up by uppercase key, not original lowercase
    expect(upsertCall.where.ticker).toBe('AAPL');
    expect(upsertCall.data?.ticker ?? upsertCall.create?.ticker).toBe('AAPL');

    const updateManyCall = (mockPrisma.stock.updateMany as jest.Mock).mock.calls[0][0];
    // notIn list must contain uppercase ticker so it doesn't match and drop the row
    expect(updateManyCall.where.ticker.notIn).toContain('AAPL');
    expect(updateManyCall.where.ticker.notIn).not.toContain('aapl');
  });
});
