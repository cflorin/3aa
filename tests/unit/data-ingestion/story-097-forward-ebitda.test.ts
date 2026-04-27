// EPIC-008: Valuation Regime Decoupling
// STORY-097: Forward EV/EBITDA Metric
// TASK-097-005: Unit tests — 3 BDD scenarios for forwardEvEbitda computation

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

const FIXED_NOW = new Date('2026-04-28T12:00:00.000Z');

// AZN-style pharma stock: large EV, significant D&A from acquired intangibles
// ev = marketCap + debt - cash = 2940B + 20B - 10B = 2950B (simplified)
const PHARMA_ROW = {
  ticker: 'AZN',
  trailingPe: null,
  epsGrowthFwd: null,
  cyclicalityFlag: null,
  currentPrice: 70.0,
  marketCap: 2_940_000_000_000,
  totalDebt: 20_000_000_000,
  cashAndEquivalents: 10_000_000_000,
  epsTtm: null,
  revenueTtm: null,
};

// ev = 2940B + 20B - 10B = 2950B
const PHARMA_EV = 2_940_000_000_000 + 20_000_000_000 - 10_000_000_000;

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

describe('EPIC-008/STORY-097/TASK-097-005: forwardEvEbitda computation', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  let mockOrchestrator: { fetchFieldWithFallback: jest.Mock };

  beforeEach(() => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([PHARMA_ROW]);
    (mockPrisma.stock.findUnique as jest.Mock).mockResolvedValue({ dataProviderProvenance: {} });
    (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});

    const MockOrchestrator = ProviderOrchestrator as jest.MockedClass<typeof ProviderOrchestrator>;
    mockOrchestrator = { fetchFieldWithFallback: jest.fn() };
    MockOrchestrator.mockImplementation(() => mockOrchestrator as unknown as ProviderOrchestrator);
  });

  afterEach(() => jest.clearAllMocks());

  it('Scenario 1 — D&A available: computes forwardEvEbitda = ev / (ebitNtm + depreciationNtm)', async () => {
    // Given: ev ≈ 2950B, ebitNtm = 28B, depreciationNtm = 5B
    // ebitdaNtm = 28B + 5B = 33B
    // forwardEvEbitda = 2950B / 33B ≈ 89.39x
    const ebitNtm = 28_000_000_000;
    const depreciationNtm = 5_000_000_000;
    const ebitdaNtm = ebitNtm + depreciationNtm; // 33B
    const expected = PHARMA_EV / ebitdaNtm;

    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AZN',
        eps_ntm: null,
        ebit_ntm: ebitNtm,
        revenue_ntm: null,
        depreciationNtm,
        nonGaapEpsMostRecentFy: null,
        gaapEpsCompletedFy: null,
        nonGaapEarningsMostRecentFy: null,
        nonGaapEarningsNtm: null,
        ntmFiscalYearEnd: '2026-12-31',
        revenuePreviousFy: null,
        nonGaapEpsPreviousFy: null,
        gaapEbitCompletedFy: null,
        nonGaapEbitMostRecentFy: null,
        nonGaapEpsFiscalYearEnd: null,
      },
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(updateCall.data.depreciationNtm).toBe(depreciationNtm);
    expect(Number(updateCall.data.forwardEvEbitda)).toBeCloseTo(expected, 2);

    // Verify provenance recorded
    const prov = updateCall.data.dataProviderProvenance;
    expect(prov.depreciation_ntm.provider).toBe('fmp');
    expect(prov.forward_ev_ebitda.provider).toBe('computed');
  });

  it('Scenario 2 — D&A unavailable (FMP returns null): forwardEvEbitda is null, field absent from update', async () => {
    // Given: depreciationNtm = null (FMP does not provide it for this stock)
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AZN',
        eps_ntm: null,
        ebit_ntm: 28_000_000_000,
        revenue_ntm: null,
        depreciationNtm: null,
        nonGaapEpsMostRecentFy: null,
        gaapEpsCompletedFy: null,
        nonGaapEarningsMostRecentFy: null,
        nonGaapEarningsNtm: null,
        ntmFiscalYearEnd: '2026-12-31',
        revenuePreviousFy: null,
        nonGaapEpsPreviousFy: null,
        gaapEbitCompletedFy: null,
        nonGaapEbitMostRecentFy: null,
        nonGaapEpsFiscalYearEnd: null,
      },
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(updateCall.data.depreciationNtm).toBeUndefined();
    expect(updateCall.data.forwardEvEbitda).toBeUndefined();
  });

  it('Scenario 3 — negative EBITDA (ebitNtm < 0, depreciationNtm small): forwardEvEbitda is null', async () => {
    // Given: ebitNtm = -1B, depreciationNtm = 0.5B → ebitdaNtm = -0.5B ≤ 0
    // forwardEvEbitda must be null (denominator ≤ 0)
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: {
        ticker: 'AZN',
        eps_ntm: null,
        ebit_ntm: -1_000_000_000,
        revenue_ntm: null,
        depreciationNtm: 500_000_000,
        nonGaapEpsMostRecentFy: null,
        gaapEpsCompletedFy: null,
        nonGaapEarningsMostRecentFy: null,
        nonGaapEarningsNtm: null,
        ntmFiscalYearEnd: '2026-12-31',
        revenuePreviousFy: null,
        nonGaapEpsPreviousFy: null,
        gaapEbitCompletedFy: null,
        nonGaapEbitMostRecentFy: null,
        nonGaapEpsFiscalYearEnd: null,
      },
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // depreciationNtm IS stored (it's a valid raw input)
    expect(updateCall.data.depreciationNtm).toBe(500_000_000);
    // forwardEvEbitda is NOT stored when ebitdaNtm ≤ 0
    expect(updateCall.data.forwardEvEbitda).toBeUndefined();
  });
});
