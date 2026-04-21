// EPIC-003: Data Ingestion & Universe Management
// STORY-021: Forward Estimates Sync Job
// TASK-021-002: Unit tests — syncForwardEstimates() + guardrails
// RFC-004 §Forward Estimates Sync

import {
  syncForwardEstimates,
  computedFallbackGuardrail,
  computeForwardPe,
} from '../../../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
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

const DEFAULT_STOCK_ROW = {
  ticker: 'AAPL',
  trailingPe: 25,
  epsGrowthFwd: 10,
  cyclicalityFlag: null,
  // STORY-028: fields for ratio computation
  currentPrice: 213.49,
  marketCap: 3282000000000,
  totalDebt: 123930000000,
  cashAndEquivalents: 29965000000,
  epsTtm: 6.13,
  revenueTtm: 383285000000,
};

function makeMockAdapter(name: 'tiingo' | 'fmp'): VendorAdapter {
  return {
    providerName: name,
    capabilities: {
      forwardEstimateCoverage: name === 'fmp' ? 'full' : 'partial',
      rateLimit: { requestsPerHour: 1000 },
    },
    fetchUniverse: jest.fn(),
    fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

// ─── computedFallbackGuardrail (pure function, no mocks needed) ───────────────

describe('EPIC-003/STORY-021/TASK-021-002: computedFallbackGuardrail', () => {
  it('returns null (safe) when all guardrails pass with cyclicality_flag=null', () => {
    expect(computedFallbackGuardrail({ trailing_pe: 25, eps_growth_fwd: 10, cyclicality_flag: null })).toBeNull();
  });

  it('returns null (safe) when cyclicality_flag=false', () => {
    expect(computedFallbackGuardrail({ trailing_pe: 25, eps_growth_fwd: 10, cyclicality_flag: false })).toBeNull();
  });

  it('returns trailing_pe_null when trailing_pe is null', () => {
    expect(computedFallbackGuardrail({ trailing_pe: null, eps_growth_fwd: 10, cyclicality_flag: null }))
      .toBe('trailing_pe_null');
  });

  it('returns trailing_pe_non_positive when trailing_pe is negative', () => {
    expect(computedFallbackGuardrail({ trailing_pe: -5, eps_growth_fwd: 10, cyclicality_flag: null }))
      .toBe('trailing_pe_non_positive');
  });

  it('returns trailing_pe_non_positive when trailing_pe = 0 (breakeven edge case)', () => {
    expect(computedFallbackGuardrail({ trailing_pe: 0, eps_growth_fwd: 10, cyclicality_flag: null }))
      .toBe('trailing_pe_non_positive');
  });

  it('returns eps_growth_fwd_null when eps_growth_fwd is null', () => {
    expect(computedFallbackGuardrail({ trailing_pe: 25, eps_growth_fwd: null, cyclicality_flag: null }))
      .toBe('eps_growth_fwd_null');
  });

  it('returns cyclicality_flag when cyclicality_flag is true', () => {
    expect(computedFallbackGuardrail({ trailing_pe: 25, eps_growth_fwd: 10, cyclicality_flag: true }))
      .toBe('cyclicality_flag');
  });

  it('cyclicality_flag = null treated as not cyclical — safe to compute', () => {
    expect(computedFallbackGuardrail({ trailing_pe: 25, eps_growth_fwd: 10, cyclicality_flag: null }))
      .toBeNull();
  });
});

// ─── computeForwardPe (pure function) ─────────────────────────────────────────

describe('EPIC-003/STORY-021/TASK-021-002: computeForwardPe', () => {
  it('trailing_pe=25, eps_growth_fwd=10 → 25 / 1.10 ≈ 22.73', () => {
    expect(computeForwardPe(25, 10)).toBeCloseTo(22.727, 2);
  });

  it('trailing_pe=20, eps_growth_fwd=0 → 20 (zero growth)', () => {
    expect(computeForwardPe(20, 0)).toBe(20);
  });

  it('eps_growth_fwd is percentage not decimal: 10 means 10%, not 1000%', () => {
    const result = computeForwardPe(25, 10);
    // 25 / 1.10 ≈ 22.73 — should NOT be 25 / 11 ≈ 2.27
    expect(result).toBeGreaterThan(20);
    expect(result).toBeLessThan(25);
  });
});

// ─── syncForwardEstimates ─────────────────────────────────────────────────────

describe('EPIC-003/STORY-021/TASK-021-002: syncForwardEstimates()', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  let mockOrchestrator: { fetchFieldWithFallback: jest.Mock };

  beforeEach(() => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([DEFAULT_STOCK_ROW]);
    (mockPrisma.stock.findUnique as jest.Mock).mockResolvedValue({ dataProviderProvenance: {} });
    (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});

    const MockOrchestrator = ProviderOrchestrator as jest.MockedClass<typeof ProviderOrchestrator>;
    mockOrchestrator = { fetchFieldWithFallback: jest.fn() };
    MockOrchestrator.mockImplementation(() => mockOrchestrator as unknown as ProviderOrchestrator);
  });

  afterEach(() => jest.clearAllMocks());

  it('STORY-028: FMP returns eps_ntm → forwardPe computed; provider_count=1; computed_fallback_count=0', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: 155769099889, revenue_ntm: 415000000000 },
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    const result = await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    expect(result.provider_count).toBe(1);
    expect(result.computed_fallback_count).toBe(0);
    expect(result.stocks_updated).toBe(1);
    expect(mockPrisma.stock.update).toHaveBeenCalledTimes(1);
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.epsNtm).toBe(8.49);
    // forwardPe = 213.49 / 8.49 ≈ 25.15
    expect(Number(updateCall.data.forwardPe)).toBeCloseTo(213.49 / 8.49, 2);
  });

  it('Both providers null; guardrails pass → computed fallback used; provenance provider=computed_trailing', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: null,
      source_provider: 'none',
      synced_at: FIXED_NOW,
      fallback_used: true,
    });

    const result = await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    expect(result.computed_fallback_count).toBe(1);
    expect(result.stocks_updated).toBe(1);

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    expect(prov['forward_pe']['provider']).toBe('computed_trailing');
    expect(prov['forward_pe']['fallback_used']).toBe(true);
  });

  it('Both providers null; trailing_pe=-5 (guardrail) → computed skipped; missing_count=1', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: null, source_provider: 'none', synced_at: FIXED_NOW, fallback_used: true,
    });
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      { ticker: 'AAPL', trailingPe: -5, epsGrowthFwd: 10, cyclicalityFlag: null },
    ]);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    expect(result.no_estimates_count).toBe(1);
    expect(result.computed_fallback_count).toBe(0);
    expect(mockPrisma.stock.update).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('computed_fallback_skipped'));
    consoleSpy.mockRestore();
  });

  it('Both providers null; cyclicality_flag=true → computed skipped; WARN with reason cyclicality_flag', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: null, source_provider: 'none', synced_at: FIXED_NOW, fallback_used: true,
    });
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      { ticker: 'AAPL', trailingPe: 25, epsGrowthFwd: 10, cyclicalityFlag: true },
    ]);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    expect(result.no_estimates_count).toBe(1);
    const warnArgs = consoleSpy.mock.calls[0][0];
    expect(warnArgs).toContain('cyclicality_flag');
    consoleSpy.mockRestore();
  });

  it('Both providers null; trailing_pe=0 → computed skipped (≤ 0 guard)', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: null, source_provider: 'none', synced_at: FIXED_NOW, fallback_used: true,
    });
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([
      { ticker: 'AAPL', trailingPe: 0, epsGrowthFwd: 10, cyclicalityFlag: null },
    ]);

    const result = await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    expect(result.no_estimates_count).toBe(1);
    expect(result.computed_fallback_count).toBe(0);
  });

  it('STORY-028: ebitNtm stored from provider; forwardEvEbit computed from ev/ebitNtm', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: null, ebit_ntm: 130000000000, revenue_ntm: null },
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    const result = await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    // eps_ntm null → forwardPe null from providers → computed fallback runs (guardrails pass)
    expect(result.computed_fallback_count).toBe(1);
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // ebitNtm stored as raw absolute USD
    expect(updateCall.data.ebitNtm).toBe(130000000000);
    // forwardEvEbit = ev / ebitNtm; ev = 3282B + 123.93B - 29.965B = 3375.965B
    const ev = 3282000000000 + 123930000000 - 29965000000;
    expect(Number(updateCall.data.forwardEvEbit)).toBeCloseTo(ev / 130000000000, 2);

    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    expect(prov['ebit_ntm']['provider']).toBe('fmp');
    expect(prov['forward_ev_ebit']['provider']).toBe('computed');
  });

  it('fallback_used in provenance is boolean not string', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: null, revenue_ntm: null },
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    expect(prov['forward_pe']['fallback_used']).toBe(false);
    expect(typeof prov['forward_pe']['fallback_used']).toBe('boolean');
  });

  // BC-021-006: FMP→Tiingo fallback path was untested in the original 18 tests
  it('FMP null, Tiingo returns eps_ntm → provenance provider=tiingo, fallback_used=true', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: null, revenue_ntm: null },
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: true,
    });

    const result = await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    expect(result.provider_count).toBe(1);
    expect(result.computed_fallback_count).toBe(0);

    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    expect(prov['forward_pe']['provider']).toBe('tiingo');
    expect(prov['forward_pe']['fallback_used']).toBe(true);
  });

  // BC-021-007: inUniverse=TRUE filter was untested; pattern from STORY-019 test 7, STORY-020 test 8
  it('findMany called with inUniverse=TRUE filter and STORY-028 select fields', async () => {
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: { ticker: 'AAPL', eps_ntm: 8.49, ebit_ntm: null, revenue_ntm: null },
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncForwardEstimates(makeMockAdapter('fmp'), makeMockAdapter('tiingo'), { now: FIXED_NOW });

    const findManyCall = (mockPrisma.stock.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall).toEqual({
      where: { inUniverse: true },
      select: {
        ticker: true,
        trailingPe: true,
        epsGrowthFwd: true,
        cyclicalityFlag: true,
        currentPrice: true,
        marketCap: true,
        totalDebt: true,
        cashAndEquivalents: true,
        epsTtm: true,
        revenueTtm: true,
      },
    });
  });
});
