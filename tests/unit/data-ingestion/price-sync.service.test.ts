// EPIC-003: Data Ingestion & Universe Management
// STORY-019: Price Sync Job
// TASK-019-003: Unit tests — syncPrices()

import { syncPrices } from '../../../src/modules/data-ingestion/jobs/price-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { PriceData } from '../../../src/modules/data-ingestion/types';

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../../../src/modules/data-ingestion/provider-orchestrator', () => ({
  ProviderOrchestrator: jest.fn().mockImplementation(() => ({
    fetchFieldWithFallback: jest.fn(),
  })),
}));

import { prisma } from '@/infrastructure/database/prisma';
import { ProviderOrchestrator } from '../../../src/modules/data-ingestion/provider-orchestrator';

const FIXED_NOW = new Date('2024-01-15T22:00:00.000Z');

function makePrice(ticker: string, close: number): PriceData {
  return { ticker, date: FIXED_NOW, close };
}

function makeMockAdapter(name: 'tiingo' | 'fmp'): VendorAdapter {
  return {
    providerName: name,
    capabilities: { forwardEstimateCoverage: 'partial', rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: jest.fn(),
    fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

describe('EPIC-003/STORY-019/TASK-019-003: syncPrices()', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  let mockOrchestrator: { fetchFieldWithFallback: jest.Mock };

  beforeEach(() => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{ ticker: 'AAPL' }]);
    (mockPrisma.stock.findUnique as jest.Mock).mockResolvedValue({ dataProviderProvenance: {} });
    (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});

    const MockOrchestrator = ProviderOrchestrator as jest.MockedClass<typeof ProviderOrchestrator>;
    mockOrchestrator = { fetchFieldWithFallback: jest.fn() };
    MockOrchestrator.mockImplementation(() => mockOrchestrator as unknown as ProviderOrchestrator);
  });

  afterEach(() => jest.clearAllMocks());

  it('updates current_price when Tiingo returns price; fallback_used=false', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makePrice('AAPL', 185.5),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    const result = await syncPrices(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    expect(result.stocks_updated).toBe(1);
    expect(result.fallback_count).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockPrisma.stock.update).toHaveBeenCalledTimes(1);
  });

  it('updates current_price with fallback_used=true when FMP used', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makePrice('AAPL', 184.0),
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: true,
    });

    const result = await syncPrices(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    expect(result.stocks_updated).toBe(1);
    expect(result.fallback_count).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('does NOT issue UPDATE when both providers return null; increments errors', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: null,
      source_provider: 'none',
      synced_at: FIXED_NOW,
      fallback_used: true,
    });

    const result = await syncPrices(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    expect(result.errors).toBe(1);
    expect(result.stocks_updated).toBe(0);
    // No DB write when value is null
    expect(mockPrisma.stock.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.stock.update).not.toHaveBeenCalled();
  });

  it('counts fallback_count and stocks_updated correctly across multiple tickers', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      { ticker: 'AAPL' },
      { ticker: 'MSFT' },
      { ticker: 'GOOG' },
    ]);

    mockOrchestrator.fetchFieldWithFallback
      .mockResolvedValueOnce({ value: makePrice('AAPL', 185), source_provider: 'tiingo', synced_at: FIXED_NOW, fallback_used: false })
      .mockResolvedValueOnce({ value: makePrice('MSFT', 380), source_provider: 'tiingo', synced_at: FIXED_NOW, fallback_used: false })
      .mockResolvedValueOnce({ value: makePrice('GOOG', 140), source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: true });

    const result = await syncPrices(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    expect(result.stocks_updated).toBe(3);
    expect(result.fallback_count).toBe(1);
    expect(result.errors).toBe(0);
    expect(mockPrisma.stock.update).toHaveBeenCalledTimes(3);
  });

  it('provenance written with boolean fallback_used (not string)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makePrice('AAPL', 185),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncPrices(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const currentPriceProv = (updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>)['current_price'];
    expect(currentPriceProv).toBeDefined();
    expect(currentPriceProv['fallback_used']).toBe(false);
    expect(typeof currentPriceProv['fallback_used']).toBe('boolean');
    expect(currentPriceProv['provider']).toBe('tiingo');
    expect(typeof currentPriceProv['synced_at']).toBe('string');
  });

  it('queries only in_universe=TRUE stocks — findMany called with inUniverse:true filter', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makePrice('AAPL', 185),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncPrices(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const findManyCall = (mockPrisma.stock.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall).toEqual({ where: { inUniverse: true }, select: { ticker: true } });
  });

  it('provenance synced_at is ISO 8601 string matching injected now', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makePrice('AAPL', 185),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncPrices(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const currentPriceProv = (updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>)['current_price'];
    expect(currentPriceProv['synced_at']).toBe(FIXED_NOW.toISOString());
  });
});
