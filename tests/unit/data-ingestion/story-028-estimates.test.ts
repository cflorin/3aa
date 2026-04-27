// EPIC-003: Data Ingestion & Universe Management
// STORY-028: Forward Estimates Enrichment
// TASK-028-005: Unit tests — syncForwardEstimates() ratio computation + FMP adapter extensions

import { syncForwardEstimates } from '../../../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';

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

const FIXED_NOW = new Date('2026-04-21T12:00:00.000Z');

// AAPL values consistent with STORY-027 test context
const AAPL_ROW = {
  ticker: 'AAPL',
  trailingPe: 34.8,
  epsGrowthFwd: 10,
  cyclicalityFlag: null,
  currentPrice: 213.49,
  marketCap: 3282000000000,
  totalDebt: 123930000000,
  cashAndEquivalents: 29965000000,
  epsTtm: 6.13,
  revenueTtm: 383285000000,
};

// ev = 3282B + 123.93B - 29.965B = 3375.965B
const AAPL_EV = 3282000000000 + 123930000000 - 29965000000;

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

describe('EPIC-003/STORY-028/TASK-028-005: syncForwardEstimates() ratio computation', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  let mockOrchestrator: { fetchFieldWithFallback: jest.Mock };

  beforeEach(() => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([AAPL_ROW]);
    (mockPrisma.stock.findUnique as jest.Mock).mockResolvedValue({ dataProviderProvenance: {} });
    (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});

    const MockOrchestrator = ProviderOrchestrator as jest.MockedClass<typeof ProviderOrchestrator>;
    mockOrchestrator = { fetchFieldWithFallback: jest.fn() };
    MockOrchestrator.mockImplementation(() => mockOrchestrator as unknown as ProviderOrchestrator);
  });

  afterEach(() => jest.clearAllMocks());

  it('stores eps_ntm, ebit_ntm, revenue_ntm as raw provider values', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: 155769099889, revenue_ntm: 415000000000 },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(updateCall.data.epsNtm).toBe(8.49);
    expect(updateCall.data.ebitNtm).toBe(155769099889);
    expect(updateCall.data.revenueNtm).toBe(415000000000);
  });

  it('computes forward_pe = currentPrice / eps_ntm', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: null, revenue_ntm: null },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // forward_pe = 213.49 / 8.49 ≈ 25.15
    expect(Number(updateCall.data.forwardPe)).toBeCloseTo(213.49 / 8.49, 2);
  });

  it('computes forward_ev_ebit = ev / ebit_ntm (both in USD)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: 155769099889, revenue_ntm: null },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(Number(updateCall.data.forwardEvEbit)).toBeCloseTo(AAPL_EV / 155769099889, 2);
  });

  it('computes forward_ev_sales = ev / revenue_ntm (both in USD)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: null, revenue_ntm: 415000000000 },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // forward_ev_sales = 3375.965B / 415B ≈ 8.13
    expect(Number(updateCall.data.forwardEvSales)).toBeCloseTo(AAPL_EV / 415000000000, 2);
  });

  it('computes eps_growth_fwd = (eps_ntm - eps_ttm) / |eps_ttm| * 100 when no gaap factor (percentage)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      // No nonGaapEpsMostRecentFy → gaapAdjustmentFactor = null → no adjustment applied
      value: { ticker: 'AAPL', eps_ntm: 7.20, ebit_ntm: null, revenue_ntm: null },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // eps_growth_fwd = (7.20 - 6.13) / 6.13 * 100 ≈ 17.45% (no adjustment; factor unavailable)
    expect(Number(updateCall.data.epsGrowthFwd)).toBeCloseTo((7.20 - 6.13) / 6.13 * 100, 2);
  });

  // ── [BUG-DI-001] GAAP/Non-GAAP reconciliation applied to eps_growth_fwd ────

  it('[BUG-DI-001] applies gaapAdjustmentFactor using period-consistent FMP GAAP/NonGAAP for same FY', async () => {
    // ADBE-like: FMP GAAP completed FY=17.18, FMP NonGAAP completed FY=20.82 → factor=0.8251
    // NTM NonGAAP=23.53 → GAAP-equiv = 23.53 * 0.8251 ≈ 19.42
    // Growth = (19.42 - 17.18) / 17.18 * 100 ≈ 13.02% — vs unadjusted 37%
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
      ...AAPL_ROW,
      epsTtm: 17.18,
      revenueTtm: 20_000_000_000,
    }]);
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AAPL', eps_ntm: 23.53, ebit_ntm: null, revenue_ntm: null,
        nonGaapEpsMostRecentFy: 20.82,
        gaapEpsCompletedFy: 17.18,   // FMP income statement — same FY period as nonGaapEpsMostRecentFy
      },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    const factor = 17.18 / 20.82;
    const ntmAdj = 23.53 * factor;
    const expected = ((ntmAdj - 17.18) / 17.18) * 100;
    expect(Number(updateCall.data.epsGrowthFwd)).toBeCloseTo(expected, 1);
    expect(Number(updateCall.data.epsGrowthFwd)).toBeLessThan(20);
  });

  it('[BUG-DI-001] falls back to raw eps_ntm when gaapEpsCompletedFy is null', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AAPL', eps_ntm: 7.20, ebit_ntm: null, revenue_ntm: null,
        nonGaapEpsMostRecentFy: null,
        gaapEpsCompletedFy: null,
      },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(Number(updateCall.data.epsGrowthFwd)).toBeCloseTo((7.20 - 6.13) / 6.13 * 100, 2);
  });

  it('[BUG-DI-001] MSFT-like: period-consistent factor ≈ 1.0 when FMP GAAP ≈ NonGAAP for same FY', async () => {
    // MSFT: FMP GAAP FY2025 ≈ $13.28, FMP NonGAAP FY2025 ≈ $13.42 → factor ≈ 0.99 ≈ no adjustment
    // Previously the cap-at-1.0 workaround handled this; now the consistent source eliminates the problem.
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
      ...AAPL_ROW,
      epsTtm: 16.05,    // Tiingo CY TTM — not used for factor anymore
      revenueTtm: 270_000_000_000,
    }]);
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AAPL', eps_ntm: 18.97, ebit_ntm: null, revenue_ntm: null,
        nonGaapEpsMostRecentFy: 13.42,   // FMP estimates — FY2025 NonGAAP
        gaapEpsCompletedFy: 13.28,       // FMP income statement — FY2025 GAAP (same period)
        // factor = 13.28 / 13.42 ≈ 0.990 → minor downward adjustment
      },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // BUG-DI-002: eps denominator is now nonGaapEpsPreviousFy (consecutive year, factor cancels)
    // Mock provides no nonGaapEpsPreviousFy → falls back to gaapEpsCompletedFy (13.28)
    const factor = 13.28 / 13.42;
    const ntmAdj = 18.97 * factor;
    const expected = ((ntmAdj - 13.28) / 13.28) * 100;
    expect(Number(updateCall.data.epsGrowthFwd)).toBeCloseTo(expected, 1);
  });

  it('[BUG-DI-002] revenue_growth_fwd uses revenuePreviousFy (consecutive FY) when available', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AAPL', eps_ntm: null, ebit_ntm: null, revenue_ntm: 415000000000,
        revenuePreviousFy: 391000000000,  // consecutive FY before NTM
      },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // Consecutive FY: (revenueNtm − revenuePreviousFy) / revenuePreviousFy × 100
    const expected = (415000000000 - 391000000000) / 391000000000 * 100;
    expect(Number(updateCall.data.revenueGrowthFwd)).toBeCloseTo(expected, 2);
    expect(updateCall.data.revenuePreviousFy).toBe(391000000000);
  });

  it('[BUG-DI-002] revenue_growth_fwd falls back to revenueTtm when revenuePreviousFy is null', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: null, ebit_ntm: null, revenue_ntm: 415000000000 },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // Falls back to revenueTtm (383.285B from AAPL_ROW)
    const expected = (415000000000 - 383285000000) / 383285000000 * 100;
    expect(Number(updateCall.data.revenueGrowthFwd)).toBeCloseTo(expected, 2);
    expect(updateCall.data.revenuePreviousFy).toBeUndefined();
  });

  it('[BUG-DI-002] eps_growth_fwd uses nonGaapEpsPreviousFy (consecutive FY, factor cancels)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AAPL', eps_ntm: 9.50, ebit_ntm: null, revenue_ntm: null,
        nonGaapEpsPreviousFy: 8.20,       // consecutive FY before NTM
        nonGaapEpsMostRecentFy: 8.20,
        gaapEpsCompletedFy: 7.90,         // GAAP factor = 7.90/8.20 ≈ 0.963 (cancels in growth)
      },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // (epsNtm − nonGaapEpsPreviousFy) / nonGaapEpsPreviousFy × 100 — factor cancels
    const expected = (9.50 - 8.20) / 8.20 * 100;
    expect(Number(updateCall.data.epsGrowthFwd)).toBeCloseTo(expected, 2);
  });

  it('[BUG-DI-002] eps_growth_fwd falls back to gaapEpsCompletedFy when nonGaapEpsPreviousFy is null', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AAPL', eps_ntm: 7.20, ebit_ntm: null, revenue_ntm: null,
        nonGaapEpsPreviousFy: null,
        gaapEpsCompletedFy: null, nonGaapEpsMostRecentFy: null,
      },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // Falls back to epsTtm = 6.13 (from AAPL_ROW)
    expect(Number(updateCall.data.epsGrowthFwd)).toBeCloseTo((7.20 - 6.13) / 6.13 * 100, 2);
  });

  it('forward_pe is not written when eps_ntm is negative (raw eps_ntm still stored)', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
      ...AAPL_ROW, trailingPe: null, epsGrowthFwd: null,
    }]);
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: -1.5, ebit_ntm: null, revenue_ntm: null },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    // Raw eps_ntm still stored (even negative — auditable)
    expect(updateCall.data.epsNtm).toBe(-1.5);
    // forward_pe not computed (negative eps → meaningless PE); Level 3 blocked (trailingPe null)
    expect(updateCall.data.forwardPe).toBeUndefined();
  });

  it('forward_ev_ebit is not written when marketCap is null', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
      ...AAPL_ROW, marketCap: null,
    }]);
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: 130000000000, revenue_ntm: 415000000000 },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // ev = null when marketCap null → forwardEvEbit and forwardEvSales not written
    expect(updateCall.data.forwardEvEbit).toBeUndefined();
    expect(updateCall.data.forwardEvSales).toBeUndefined();
    // eps_ntm raw input still written; forward_pe still computed from price
    expect(updateCall.data.epsNtm).toBe(8.49);
  });

  it('eps_growth_fwd not written when eps_ttm is zero', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
      ...AAPL_ROW, epsTtm: 0,
    }]);
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: null, revenue_ntm: null },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(updateCall.data.epsGrowthFwd).toBeUndefined();
  });

  it('revenue_growth_fwd not written when revenue_ttm is null', async () => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{
      ...AAPL_ROW, revenueTtm: null,
    }]);
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: null, ebit_ntm: null, revenue_ntm: 415000000000 },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(updateCall.data.revenueGrowthFwd).toBeUndefined();
  });

  it('provenance: eps_ntm/ebit_ntm/revenue_ntm tagged fmp; forward ratios tagged computed', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: 155769099889, revenue_ntm: 415000000000 },
      source_provider: 'fmp', synced_at: FIXED_NOW, fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;

    expect(prov['eps_ntm']['provider']).toBe('fmp');
    expect(prov['ebit_ntm']['provider']).toBe('fmp');
    expect(prov['revenue_ntm']['provider']).toBe('fmp');
    expect(prov['forward_pe']['provider']).toBe('fmp');     // from orchestrator source
    expect(prov['forward_ev_ebit']['provider']).toBe('computed');
    expect(prov['forward_ev_sales']['provider']).toBe('computed');
    expect(prov['eps_growth_fwd']['provider']).toBe('computed');
    expect(prov['revenue_growth_fwd']['provider']).toBe('computed');
  });
});

describe('EPIC-003/STORY-028/TASK-028-005: FMPAdapter.fetchForwardEstimates() STORY-028 extensions', () => {
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

  it('returns eps_ntm, ebit_ntm, revenue_ntm from fixture values', async () => {
    mockFetchResponse([{
      symbol: 'AAPL',
      date: '2025-09-30',
      epsAvg: 7.20,
      ebitAvg: 130000000000,
      revenueAvg: 415000000000,
      numAnalystsEps: 12,
    }]);
    const result = await adapter.fetchForwardEstimates('AAPL');
    expect(result).not.toBeNull();
    expect(result!.eps_ntm).toBe(7.20);
    expect(result!.ebit_ntm).toBe(130000000000);
    expect(result!.revenue_ntm).toBe(415000000000);
  });

  it('returns null when all three fields absent', async () => {
    mockFetchResponse([{
      symbol: 'AAPL', date: '2027-09-27', epsAvg: null, ebitAvg: null, revenueAvg: null, numAnalystsEps: 0,
    }]);
    expect(await adapter.fetchForwardEstimates('AAPL')).toBeNull();
  });

  it('returns result when only revenue_ntm available (ebitAvg/epsAvg absent)', async () => {
    mockFetchResponse([{
      symbol: 'AAPL', date: '2027-09-27', epsAvg: null, ebitAvg: null, revenueAvg: 415000000000,
    }]);
    const result = await adapter.fetchForwardEstimates('AAPL');
    expect(result).not.toBeNull();
    expect(result!.revenue_ntm).toBe(415000000000);
    expect(result!.eps_ntm).toBeNull();
    expect(result!.ebit_ntm).toBeNull();
  });
});
