// EPIC-003: Data Ingestion & Universe Management
// STORY-031: GAAP / Non-GAAP EPS Reconciliation Factor
// TASK-031-006: Unit tests — computation edge cases via syncForwardEstimates()
// @unit

import { syncForwardEstimates } from '../../../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';

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

const FIXED_NOW = new Date('2024-01-16T00:00:00.000Z');

function makeMockAdapter(name: 'tiingo' | 'fmp'): VendorAdapter {
  return {
    providerName: name,
    capabilities: { forwardEstimateCoverage: 'partial', rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: jest.fn(), fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn(), fetchForwardEstimates: jest.fn(), fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

/** Runs syncForwardEstimates with gaapEpsCompletedFy and nonGaapEpsMostRecentFy both from FMP estimates.
 *  epsTtm in the DB row is kept at 6.13 (irrelevant for factor computation after BUG-DI-001 fix). */
async function runSync(gaapEpsCompletedFy: number | null, nonGaapEps: number | null) {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
    ticker: 'AAPL',
    trailingPe: 25, epsGrowthFwd: 10, cyclicalityFlag: null,
    currentPrice: null, marketCap: null, totalDebt: null, cashAndEquivalents: null,
    epsTtm: 6.13, revenueTtm: null,
  }]);
  (mockPrisma.stock.findUnique as jest.Mock).mockResolvedValue({ dataProviderProvenance: {} });
  (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});

  const MockOrchestrator = ProviderOrchestrator as jest.MockedClass<typeof ProviderOrchestrator>;
  const mockOrchestrator = { fetchFieldWithFallback: jest.fn() };
  MockOrchestrator.mockImplementation(() => mockOrchestrator as unknown as ProviderOrchestrator);
  mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
    value: {
      ticker: 'AAPL', eps_ntm: 8.0, ebit_ntm: null, revenue_ntm: null,
      nonGaapEpsMostRecentFy: nonGaapEps,
      gaapEpsCompletedFy,                         // FMP income statement — same FY as nonGaapEps
      nonGaapEpsFiscalYearEnd: nonGaapEps != null ? '2023-09-30' : null,
      nonGaapEarningsMostRecentFy: nonGaapEps != null ? 95000000000 : null,
      nonGaapEarningsNtm: 110000000000, ntmFiscalYearEnd: '2024-09-30',
    },
    source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
  });

  await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

  const calls = (mockPrisma.stock.update as jest.Mock).mock.calls;
  return calls.length > 0 ? calls[0][0].data.gaapAdjustmentFactor : undefined;
}

describe('EPIC-003/STORY-031/TASK-031-006: gaapAdjustmentFactor computation', () => {
  afterEach(() => jest.clearAllMocks());

  it('basic ratio: gaapEpsCompletedFy=4.0, nonGaapEps=5.0 → factor=0.8', async () => {
    const factor = await runSync(4.0, 5.0);
    expect(Number(factor)).toBeCloseTo(0.8, 5);
  });

  it('typical AAPL: gaapEpsCompletedFy=6.13, nonGaapEps=7.20 → factor≈0.8514', async () => {
    const factor = await runSync(6.13, 7.20);
    expect(Number(factor)).toBeCloseTo(6.13 / 7.20, 4);
  });

  it('clamps to lower bound: gaapEpsCompletedFy=0.02, nonGaapEps=0.5 → raw=0.04 → clamped to 0.10', async () => {
    const factor = await runSync(0.02, 0.5);
    expect(Number(factor)).toBeCloseTo(0.10, 5);
  });

  it('clamps to upper bound: gaapEpsCompletedFy=3.0, nonGaapEps=1.0 → raw=3.0 → clamped to 2.00', async () => {
    const factor = await runSync(3.0, 1.0);
    expect(Number(factor)).toBeCloseTo(2.00, 5);
  });

  it('returns null (not written) when nonGaapEps < 0.10 threshold', async () => {
    const factor = await runSync(4.0, 0.09);
    expect(factor).toBeUndefined();
  });

  it('returns null when nonGaapEps = 0 (exact zero denominator)', async () => {
    const factor = await runSync(4.0, 0.0);
    expect(factor).toBeUndefined();
  });

  it('returns null when gaapEpsCompletedFy is null (income statement fetch failed)', async () => {
    const factor = await runSync(null, 7.20);
    expect(factor).toBeUndefined();
  });

  it('returns null when nonGaapEps is null (no analyst coverage)', async () => {
    const factor = await runSync(6.13, null);
    expect(factor).toBeUndefined();
  });

  it('provenance: provider=computed_fmp, fallback_used=false', async () => {
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
      ticker: 'AAPL', trailingPe: 25, epsGrowthFwd: 10, cyclicalityFlag: null,
      currentPrice: null, marketCap: null, totalDebt: null, cashAndEquivalents: null,
      epsTtm: 6.13, revenueTtm: null,
    }]);
    (mockPrisma.stock.findUnique as jest.Mock).mockResolvedValue({ dataProviderProvenance: {} });
    (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});

    const MockOrchestrator = ProviderOrchestrator as jest.MockedClass<typeof ProviderOrchestrator>;
    const mockOrchestrator = { fetchFieldWithFallback: jest.fn() };
    MockOrchestrator.mockImplementation(() => mockOrchestrator as unknown as ProviderOrchestrator);
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.0, ebit_ntm: null, revenue_ntm: null,
               nonGaapEpsMostRecentFy: 5.0, gaapEpsCompletedFy: 4.0,
               nonGaapEpsFiscalYearEnd: '2023-09-30',
               nonGaapEarningsMostRecentFy: 95000000000, nonGaapEarningsNtm: 110000000000,
               ntmFiscalYearEnd: '2024-09-30' },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    expect(prov['gaap_adjustment_factor']['provider']).toBe('computed_fmp');
    expect(prov['gaap_adjustment_factor']['fallback_used']).toBe(false);
  });
});
