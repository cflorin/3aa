// EPIC-003: Data Ingestion & Universe Management
// STORY-020: Fundamentals Sync Job
// TASK-020-002: Unit tests — syncFundamentals()

import { syncFundamentals } from '../../../src/modules/data-ingestion/jobs/fundamentals-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { FundamentalData } from '../../../src/modules/data-ingestion/types';

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

const FIXED_NOW = new Date('2024-01-15T23:00:00.000Z');

function makeFundamentals(overrides: Partial<FundamentalData> = {}): FundamentalData {
  return {
    ticker: 'AAPL',
    revenue_growth_yoy: 10.5,
    eps_growth_yoy: 12.0,
    revenue_growth_3y: 11.77,
    eps_growth_3y: 23.27,
    gross_profit_growth: 6.82,
    share_count_growth_3y: -3.91,
    eps_growth_fwd: 8.0,
    gaapEps: 6.50,
    gaapEpsFiscalYearEnd: '2024-09-30',
    statementPeriodEnd: '2024-09-30',
    revenue_ttm: 385000000000,
    earnings_ttm: 95000000000,
    gross_margin: 0.44,
    operating_margin: 0.30,
    net_margin: 0.25,
    roe: 1.5,
    roa: 0.28,
    roic: 0.55,
    trailing_pe: 28.5,
    fcf_ttm: 90000000000,
    ebit_ttm: 130000000000,
    eps_ttm: 6.50,
    net_debt_to_ebitda: -0.35,
    total_debt: 110000000000,
    cash_and_equivalents: 60000000000,
    debt_to_equity: 1.5,
    current_ratio: 0.95,
    interest_coverage: 29.0,
    ...overrides,
  };
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

describe('EPIC-003/STORY-020/TASK-020-002: syncFundamentals()', () => {
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

  it('writes all non-null fields when Tiingo returns full FundamentalData', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals(),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    const result = await syncFundamentals(
      makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW },
    );

    expect(result.stocks_updated).toBe(1);
    expect(result.fields_populated).toBeGreaterThan(0);
    expect(result.fallback_count).toBe(0);
    expect(mockPrisma.stock.update).toHaveBeenCalledTimes(1);
  });

  it('increments fallback_count when FMP used', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals(),
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: true,
    });

    const result = await syncFundamentals(
      makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW },
    );

    expect(result.fallback_count).toBe(1);
    expect(result.stocks_updated).toBe(1);
  });

  it('increments errors and writes nothing when both providers return null', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: null,
      source_provider: 'none',
      synced_at: FIXED_NOW,
      fallback_used: true,
    });

    const result = await syncFundamentals(
      makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW },
    );

    expect(result.errors).toBe(1);
    expect(result.stocks_updated).toBe(0);
    expect(mockPrisma.stock.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.stock.update).not.toHaveBeenCalled();
  });

  it('does not include null fields in the update data', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ gross_margin: null, trailing_pe: null }),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.grossMargin).toBeUndefined();
    expect(updateCall.data.trailingPe).toBeUndefined();
    // Non-null fields should still be present
    expect(updateCall.data.operatingMargin).toBeDefined();
  });

  it('does not update when all fields are null; stocks_updated = 0', async () => {
    const allNull: FundamentalData = {
      ticker: 'AAPL',
      revenue_growth_yoy: null, eps_growth_yoy: null,
      revenue_growth_3y: null, eps_growth_3y: null,
      gross_profit_growth: null, share_count_growth_3y: null,
      eps_growth_fwd: null,
      gaapEps: null, gaapEpsFiscalYearEnd: null, statementPeriodEnd: null,
      revenue_ttm: null, earnings_ttm: null, gross_margin: null, operating_margin: null,
      net_margin: null, roe: null, roa: null, roic: null, trailing_pe: null,
      fcf_ttm: null, ebit_ttm: null, eps_ttm: null,
      net_debt_to_ebitda: null, total_debt: null, cash_and_equivalents: null,
      debt_to_equity: null, current_ratio: null, interest_coverage: null,
    };
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: allNull,
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    const result = await syncFundamentals(
      makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW },
    );

    expect(result.stocks_updated).toBe(0);
    expect(result.fields_populated).toBe(0);
    expect(mockPrisma.stock.update).not.toHaveBeenCalled();
  });

  it('provenance written per written field with boolean fallback_used', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ gross_margin: 0.44 }),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    // gross_margin was written — its provenance entry should exist
    expect(prov['gross_margin']).toBeDefined();
    expect(prov['gross_margin']['fallback_used']).toBe(false);
    expect(typeof prov['gross_margin']['fallback_used']).toBe('boolean');
    expect(prov['gross_margin']['provider']).toBe('tiingo');
  });

  it('fundamentals_last_updated_at included in update when fields written', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals(),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.fundamentalsLastUpdatedAt).toEqual(FIXED_NOW);
  });

  it('queries only in_universe=TRUE stocks — findMany called with inUniverse:true filter', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals(),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const findManyCall = (mockPrisma.stock.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall).toEqual({ where: { inUniverse: true }, select: { ticker: true } });
  });

  it('Fix 7: fcf_conversion = fcf_ttm / earnings_ttm when both non-null', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ fcf_ttm: 90000000000, earnings_ttm: 100000000000 }),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(Number(updateCall.data.fcfConversion)).toBeCloseTo(0.9, 5);
    expect(updateCall.data.fcfPositive).toBe(true);
  });

  it('Fix 7: fcf_positive false when fcf_ttm negative', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ fcf_ttm: -5000000000, earnings_ttm: 10000000000 }),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.fcfPositive).toBe(false);
  });

  it('Fix 7: fcfConversion not set when fcf_ttm null (no roe proxy)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ fcf_ttm: null }),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.fcfConversion).toBeUndefined();
    expect(updateCall.data.fcfPositive).toBeUndefined();
  });

  it('Fix 4: netDebtToEbitda mapped from net_debt_to_ebitda (not debt_to_equity)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ net_debt_to_ebitda: -0.35, debt_to_equity: 1.5 }),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(Number(updateCall.data.netDebtToEbitda)).toBeCloseTo(-0.35, 5);
  });

  it('Fix 6: totalDebt and cashAndEquivalents mapped from new fields', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ total_debt: 110000000000, cash_and_equivalents: 60000000000 }),
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.totalDebt).toBe(110000000000);
    expect(updateCall.data.cashAndEquivalents).toBe(60000000000);
    const prov = updateCall.data.dataProviderProvenance as Record<string, unknown>;
    expect(prov['total_debt']).toBeDefined();
    expect(prov['cash_and_equivalents']).toBeDefined();
  });

  it('provenance key absent for null fields — gross_margin null → no prov[gross_margin]', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeFundamentals({ gross_margin: null, trailing_pe: null }),
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, unknown>;
    expect(prov['gross_margin']).toBeUndefined();
    expect(prov['trailing_pe']).toBeUndefined();
    // Non-null fields should still have provenance
    expect(prov['operating_margin']).toBeDefined();
  });
});
