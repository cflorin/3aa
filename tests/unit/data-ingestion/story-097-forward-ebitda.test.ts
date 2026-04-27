// EPIC-008: Valuation Regime Decoupling
// STORY-097: Forward EV/EBITDA Metric
// TASK-097-005: Unit tests — 3 BDD scenarios for forwardEvEbitda computation
//
// Correction (live test 2026-04-28): FMP provides ebitdaAvg directly in /analyst-estimates.
// depreciationAvg is not in the FMP stable API. Implementation updated to use ebitdaAvg.

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

// AZN-style pharma stock: large EV, significant amortisation
// ev = marketCap + debt - cash = 2940B + 20B - 10B = 2950B
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

const PHARMA_EV = 2_940_000_000_000 + 20_000_000_000 - 10_000_000_000; // 2950B

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

function makeEstimatesValue(overrides: Record<string, unknown>) {
  return {
    ticker: 'AZN',
    eps_ntm: null,
    ebit_ntm: null,
    revenue_ntm: null,
    ebitdaNtm: null,
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
    ...overrides,
  };
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

  it('Scenario 1 — ebitdaNtm available: computes forwardEvEbitda = ev / ebitdaNtm', async () => {
    // Given: ev ≈ 2950B, ebitdaNtm = 33B (FMP ebitdaAvg)
    // forwardEvEbitda = 2950B / 33B ≈ 89.39x
    const ebitdaNtm = 33_000_000_000;
    const expected = PHARMA_EV / ebitdaNtm;

    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeEstimatesValue({ ebitdaNtm }),
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    expect(updateCall.data.ebitdaNtm).toBe(ebitdaNtm);
    expect(Number(updateCall.data.forwardEvEbitda)).toBeCloseTo(expected, 2);

    // Verify provenance
    const prov = updateCall.data.dataProviderProvenance;
    expect(prov.ebitda_ntm.provider).toBe('fmp');
    expect(prov.forward_ev_ebitda.provider).toBe('computed');
  });

  it('Scenario 2 — ebitdaNtm null (FMP does not provide it): forwardEvEbitda absent from update', async () => {
    // Given: ebitdaNtm = null but ebit_ntm is available (so an update call occurs, just without ebitdaNtm)
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeEstimatesValue({ ebit_ntm: 28_000_000_000, ebitdaNtm: null }),
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // ebitdaNtm and forwardEvEbitda must NOT be in the update payload
    expect(updateCall.data.ebitdaNtm).toBeUndefined();
    expect(updateCall.data.forwardEvEbitda).toBeUndefined();
    // ebitNtm itself IS stored (it came from provider)
    expect(updateCall.data.ebitNtm).toBe(28_000_000_000);
  });

  it('Scenario 3 — negative ebitdaNtm: forwardEvEbitda is null (denominator <= 0)', async () => {
    // Given: ebitdaNtm = -500M (loss-making on EBITDA basis)
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: makeEstimatesValue({ ebitdaNtm: -500_000_000 }),
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // ebitdaNtm IS stored (valid raw input)
    expect(updateCall.data.ebitdaNtm).toBe(-500_000_000);
    // forwardEvEbitda is NOT stored (denominator <= 0)
    expect(updateCall.data.forwardEvEbitda).toBeUndefined();
  });
});
