// EPIC-003: Data Ingestion & Universe Management
// STORY-029: 3-Year Growth CAGRs
// TASK-029-005: Unit tests — FMP adapter CAGR computation, Tiingo 16Q window, sync service mappings

import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';
import { TiingoAdapter } from '../../../src/modules/data-ingestion/adapters/tiingo.adapter';
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

// AAPL FY2023/FY2022/FY2021/FY2020 annual income statement fixture
// revenue_growth_3y = cagr(383285e9, 274515e9, 3) ≈ 11.77%
// eps_growth_3y = cagr(6.13, 3.28, 3) ≈ 23.27%
// gross_profit_growth = (169148e9 - 170782e9) / 170782e9 * 100 ≈ -0.957%
// share_count_growth_3y = cagr(15550061952, 17528214000, 3) ≈ -3.91%
const FOUR_YEAR_INCOME = [
  {
    date: '2023-09-30', symbol: 'AAPL', period: 'FY',
    revenue: 383285000000, grossProfit: 169148000000, epsDiluted: 6.13,
    weightedAverageShsOutDil: 15550061952,
  },
  {
    date: '2022-09-30', symbol: 'AAPL', period: 'FY',
    revenue: 394328000000, grossProfit: 170782000000, epsDiluted: 6.11,
    weightedAverageShsOutDil: 16215963137,
  },
  {
    date: '2021-09-25', symbol: 'AAPL', period: 'FY',
    revenue: 365817000000, grossProfit: 152836000000, epsDiluted: 5.61,
    weightedAverageShsOutDil: 16864919160,
  },
  {
    date: '2020-09-26', symbol: 'AAPL', period: 'FY',
    revenue: 274515000000, grossProfit: 104956000000, epsDiluted: 3.28,
    weightedAverageShsOutDil: 17528214000,
  },
];

// 16-quarter Tiingo fixture for 3-year CAGR tests
// TTM revenue (Q0-Q3) = 119575+89498+94836+117154 = 421063M
// TTM EPS (Q0-Q3) = 1.89+1.46+1.53+1.89 = 6.77
// 3y-ago TTM revenue (Q12-Q15) = 111439+64698+59685+58313 = 294135M
// 3y-ago TTM EPS (Q12-Q15) = 1.68+0.73+0.64+0.56 = 3.61
// revenue_growth_3y = cagr(421063e6, 294135e6, 3) ≈ 12.79%
// eps_growth_3y = cagr(6.77, 3.61, 3) ≈ 23.40%
// TTM GP (Q0-Q3) = 54+40+42+52 = 188B
// Prior TTM GP (Q4-Q7) = 43+36+43+54 = 176B
// gross_profit_growth = (188-176)/176*100 ≈ 6.82%
function makeTiingoQ(date: string, year: number, quarter: number,
  revenue: number, netinc: number, eps: number, grossProfit: number): object {
  return {
    date, year, quarter,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: revenue },
        { dataCode: 'netinc', value: netinc },
        { dataCode: 'eps', value: eps },
        { dataCode: 'ebit', value: revenue * 0.29 },
        { dataCode: 'intexp', value: revenue * 0.008 },
        { dataCode: 'grossProfit', value: grossProfit },
      ],
      balanceSheet: [],
      overview: [],
    },
  };
}

const SIXTEEN_QUARTER_FIXTURE = [
  // Q0-Q3: TTM (2023)
  makeTiingoQ('2023-12-31', 2023, 4, 119575000000, 29998000000, 1.89, 54000000000),
  makeTiingoQ('2023-09-30', 2023, 3,  89498000000, 22956000000, 1.46, 40000000000),
  makeTiingoQ('2023-06-30', 2023, 2,  94836000000, 24160000000, 1.53, 42000000000),
  makeTiingoQ('2023-03-31', 2023, 1, 117154000000, 29959000000, 1.89, 52000000000),
  // Q4-Q7: prior TTM (2022)
  makeTiingoQ('2022-12-31', 2022, 4,  97278000000, 20721000000, 1.30, 43000000000),
  makeTiingoQ('2022-09-30', 2022, 3,  83360000000, 19442000000, 1.20, 36000000000),
  makeTiingoQ('2022-06-30', 2022, 2,  97278000000, 25010000000, 1.55, 43000000000),
  makeTiingoQ('2022-03-31', 2022, 1, 123945000000, 34630000000, 2.10, 54000000000),
  // Q8-Q11: 2-years-ago TTM (2021)
  makeTiingoQ('2021-12-31', 2021, 4, 115000000000, 30000000000, 1.85, 53000000000),
  makeTiingoQ('2021-09-30', 2021, 3,  83360000000, 20551000000, 1.24, 35000000000),
  makeTiingoQ('2021-06-30', 2021, 2,  81434000000, 21744000000, 1.30, 34000000000),
  makeTiingoQ('2021-03-31', 2021, 1,  89584000000, 23630000000, 1.40, 38000000000),
  // Q12-Q15: 3-years-ago TTM (2020)
  makeTiingoQ('2020-12-31', 2020, 4, 111439000000, 28755000000, 1.68, 45000000000),
  makeTiingoQ('2020-09-30', 2020, 3,  64698000000, 12673000000, 0.73, 25000000000),
  makeTiingoQ('2020-06-30', 2020, 2,  59685000000, 11253000000, 0.64, 22000000000),
  makeTiingoQ('2020-03-31', 2020, 1,  58313000000, 11249000000, 0.56, 23000000000),
];

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

// ─── FMP adapter: CAGR computations ───────────────────────────────────────────

describe('EPIC-003/STORY-029/TASK-029-005: FMPAdapter 3-year CAGR computations', () => {
  let adapter: FMPAdapter;

  beforeEach(() => {
    adapter = new FMPAdapter('test-key');
  });

  afterEach(() => jest.restoreAllMocks());

  function mockIncomeFetch(income: object[], balance: object[] = [{ totalStockholdersEquity: 50e9, totalAssets: 500e9, totalDebt: 100e9, cashAndCashEquivalents: 20e9 }]) {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(income) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(balance) });
  }

  it('revenue_growth_3y ≈ 11.77% (AAPL FY2020→FY2023)', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME);
    const result = await adapter.fetchFundamentals('AAPL');
    // (383285/274515)^(1/3) - 1) * 100
    const expected = (Math.pow(383285000000 / 274515000000, 1 / 3) - 1) * 100;
    expect(result!.revenue_growth_3y).toBeCloseTo(expected, 2);
  });

  it('eps_growth_3y ≈ 23.27% (AAPL FY2020→FY2023)', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME);
    const result = await adapter.fetchFundamentals('AAPL');
    const expected = (Math.pow(6.13 / 3.28, 1 / 3) - 1) * 100;
    expect(result!.eps_growth_3y).toBeCloseTo(expected, 2);
  });

  it('gross_profit_growth ≈ -0.957% (FY2022→FY2023)', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME);
    const result = await adapter.fetchFundamentals('AAPL');
    const expected = (169148000000 - 170782000000) / 170782000000 * 100;
    expect(result!.gross_profit_growth).toBeCloseTo(expected, 2);
  });

  it('share_count_growth_3y ≈ -3.91% (FY2020→FY2023, buybacks)', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME);
    const result = await adapter.fetchFundamentals('AAPL');
    const expected = (Math.pow(15550061952 / 17528214000, 1 / 3) - 1) * 100;
    expect(result!.share_count_growth_3y).toBeCloseTo(expected, 2);
  });

  it('revenue_growth_3y null when fewer than 4 income entries', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME.slice(0, 2)); // only FY2023+FY2022
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.revenue_growth_3y).toBeNull();
    expect(result!.eps_growth_3y).toBeNull();
    expect(result!.share_count_growth_3y).toBeNull();
  });

  it('eps_growth_3y null when base EPS (3 years ago) ≤ 0', async () => {
    const negBaseIncome = [...FOUR_YEAR_INCOME];
    negBaseIncome[3] = { ...FOUR_YEAR_INCOME[3], epsDiluted: -1.0 };
    mockIncomeFetch(negBaseIncome);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.eps_growth_3y).toBeNull();
    // revenue_growth_3y still computed (revenue was positive)
    expect(result!.revenue_growth_3y).not.toBeNull();
  });

  it('gross_profit_growth null when prior grossProfit is 0', async () => {
    const zeroGpIncome = FOUR_YEAR_INCOME.map((e, i) =>
      i === 1 ? { ...e, grossProfit: 0 } : e,
    );
    mockIncomeFetch(zeroGpIncome);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.gross_profit_growth).toBeNull();
  });

  it('share_count_growth_3y null when weightedAverageShsOutDil absent from fixture', async () => {
    const noSharesIncome = FOUR_YEAR_INCOME.map(e => {
      const { weightedAverageShsOutDil: _, ...rest } = e as Record<string, unknown>;
      void _;
      return rest;
    });
    mockIncomeFetch(noSharesIncome);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.share_count_growth_3y).toBeNull();
  });

  it('AAPL revenue_growth_3y acceptance range: 11–13%', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.revenue_growth_3y).toBeGreaterThan(11);
    expect(result!.revenue_growth_3y).toBeLessThan(13);
  });

  it('AAPL eps_growth_3y acceptance range: 22–24%', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.eps_growth_3y).toBeGreaterThan(22);
    expect(result!.eps_growth_3y).toBeLessThan(24);
  });

  it('AAPL share_count_growth_3y acceptance range: -3% to -4% (buybacks)', async () => {
    mockIncomeFetch(FOUR_YEAR_INCOME);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.share_count_growth_3y).toBeLessThan(-3);
    expect(result!.share_count_growth_3y).toBeGreaterThan(-5);
  });
});

// ─── Tiingo adapter: 16-quarter window ────────────────────────────────────────

describe('EPIC-003/STORY-029/TASK-029-005: TiingoAdapter 16-quarter 3-year CAGR', () => {
  let adapter: TiingoAdapter;

  beforeEach(() => {
    adapter = new TiingoAdapter('test-key');
  });

  afterEach(() => jest.restoreAllMocks());

  function mockFetch(body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(body),
    });
  }

  it('revenue_growth_3y ≈ 12.79% from 16-quarter fixture', async () => {
    mockFetch(SIXTEEN_QUARTER_FIXTURE);
    const result = await adapter.fetchFundamentals('AAPL');
    // cagr(421063e6, 294135e6, 3)
    const ttmRev = 119575e6 + 89498e6 + 94836e6 + 117154e6;
    const threeYAgoRev = 111439e6 + 64698e6 + 59685e6 + 58313e6;
    const expected = (Math.pow(ttmRev / threeYAgoRev, 1 / 3) - 1) * 100;
    expect(result!.revenue_growth_3y).toBeCloseTo(expected, 2);
  });

  it('eps_growth_3y ≈ 23.40% from 16-quarter fixture', async () => {
    mockFetch(SIXTEEN_QUARTER_FIXTURE);
    const result = await adapter.fetchFundamentals('AAPL');
    // cagr(6.77, 3.61, 3)
    const ttmEps = 1.89 + 1.46 + 1.53 + 1.89;
    const threeYAgoEps = 1.68 + 0.73 + 0.64 + 0.56;
    const expected = (Math.pow(ttmEps / threeYAgoEps, 1 / 3) - 1) * 100;
    expect(result!.eps_growth_3y).toBeCloseTo(expected, 2);
  });

  it('gross_profit_growth ≈ 6.82% (TTM 188B vs prior TTM 176B)', async () => {
    mockFetch(SIXTEEN_QUARTER_FIXTURE);
    const result = await adapter.fetchFundamentals('AAPL');
    const ttmGP = 54e9 + 40e9 + 42e9 + 52e9;
    const priorGP = 43e9 + 36e9 + 43e9 + 54e9;
    const expected = (ttmGP - priorGP) / priorGP * 100;
    expect(result!.gross_profit_growth).toBeCloseTo(expected, 2);
  });

  it('share_count_growth_3y always null (not available from Tiingo)', async () => {
    mockFetch(SIXTEEN_QUARTER_FIXTURE);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.share_count_growth_3y).toBeNull();
  });

  it('revenue_growth_3y null when fewer than 16 quarters', async () => {
    mockFetch(SIXTEEN_QUARTER_FIXTURE.slice(0, 8));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.revenue_growth_3y).toBeNull();
    expect(result!.eps_growth_3y).toBeNull();
  });

  it('eps_growth_3y null when 3-years-ago TTM EPS ≤ 0', async () => {
    const negEpsFixture = SIXTEEN_QUARTER_FIXTURE.map((q, i) => {
      if (i >= 12 && i < 16) {
        const qCopy = JSON.parse(JSON.stringify(q)) as { statementData: { incomeStatement: { dataCode: string; value: number }[] } };
        const epsEntry = qCopy.statementData.incomeStatement.find(e => e.dataCode === 'eps');
        if (epsEntry) epsEntry.value = -0.1;
        return qCopy;
      }
      return q;
    });
    mockFetch(negEpsFixture);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.eps_growth_3y).toBeNull();
    // revenue_growth_3y still computed
    expect(result!.revenue_growth_3y).not.toBeNull();
  });

  it('AAPL revenue_growth_3y acceptance range: 11–14%', async () => {
    mockFetch(SIXTEEN_QUARTER_FIXTURE);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.revenue_growth_3y).toBeGreaterThan(11);
    expect(result!.revenue_growth_3y).toBeLessThan(14);
  });

  it('AAPL eps_growth_3y acceptance range: 22–25%', async () => {
    mockFetch(SIXTEEN_QUARTER_FIXTURE);
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result!.eps_growth_3y).toBeGreaterThan(22);
    expect(result!.eps_growth_3y).toBeLessThan(25);
  });
});

// ─── fundamentals-sync.service: STORY-029 field routing ──────────────────────

describe('EPIC-003/STORY-029/TASK-029-005: syncFundamentals() STORY-029 field routing', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  let mockOrchestrator: { fetchFieldWithFallback: jest.Mock };
  const FIXED_NOW = new Date('2026-04-21T14:00:00.000Z');

  beforeEach(() => {
    (mockPrisma.stock.findMany as jest.Mock).mockResolvedValue([{ ticker: 'AAPL' }]);
    (mockPrisma.stock.findUnique as jest.Mock).mockResolvedValue({ dataProviderProvenance: {} });
    (mockPrisma.stock.update as jest.Mock).mockResolvedValue({});

    const MockOrchestrator = ProviderOrchestrator as jest.MockedClass<typeof ProviderOrchestrator>;
    mockOrchestrator = { fetchFieldWithFallback: jest.fn() };
    MockOrchestrator.mockImplementation(() => mockOrchestrator as unknown as ProviderOrchestrator);
  });

  afterEach(() => jest.clearAllMocks());

  it('revenue_growth_3y written to revenueGrowth3y DB column (not YoY proxy)', async () => {
    const fundamentals: FundamentalData = {
      ticker: 'AAPL',
      revenue_growth_yoy: 5.0,
      eps_growth_yoy: 7.0,
      revenue_growth_3y: 11.77,
      eps_growth_3y: 23.27,
      gross_profit_growth: 6.82,
      share_count_growth_3y: -3.91,
      eps_growth_fwd: null,
      revenue_ttm: null, earnings_ttm: null, gross_margin: null,
      operating_margin: null, net_margin: null, roe: null, roa: null,
      roic: null, trailing_pe: null, fcf_ttm: null, ebit_ttm: null,
      eps_ttm: null, net_debt_to_ebitda: null, total_debt: null,
      cash_and_equivalents: null, debt_to_equity: null, current_ratio: null,
      interest_coverage: null, gaapEps: null, gaapEpsFiscalYearEnd: null,
    };
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: fundamentals,
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];

    // revenueGrowth3y must be the 3y CAGR (11.77), NOT the YoY (5.0)
    expect(Number(updateCall.data.revenueGrowth3y)).toBeCloseTo(11.77, 2);
    expect(Number(updateCall.data.epsGrowth3y)).toBeCloseTo(23.27, 2);
  });

  it('gross_profit_growth written to grossProfitGrowth column', async () => {
    const fundamentals: FundamentalData = {
      ticker: 'AAPL',
      revenue_growth_yoy: null, eps_growth_yoy: null,
      revenue_growth_3y: null, eps_growth_3y: null,
      gross_profit_growth: 6.82,
      share_count_growth_3y: null,
      eps_growth_fwd: null,
      revenue_ttm: null, earnings_ttm: null, gross_margin: null,
      operating_margin: null, net_margin: null, roe: null, roa: null,
      roic: null, trailing_pe: null, fcf_ttm: null, ebit_ttm: null,
      eps_ttm: null, net_debt_to_ebitda: null, total_debt: null,
      cash_and_equivalents: null, debt_to_equity: null, current_ratio: null,
      interest_coverage: null, gaapEps: null, gaapEpsFiscalYearEnd: null,
    };
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: fundamentals,
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(Number(updateCall.data.grossProfitGrowth)).toBeCloseTo(6.82, 2);
  });

  it('share_count_growth_3y written to shareCountGrowth3y column', async () => {
    const fundamentals: FundamentalData = {
      ticker: 'AAPL',
      revenue_growth_yoy: null, eps_growth_yoy: null,
      revenue_growth_3y: null, eps_growth_3y: null,
      gross_profit_growth: null,
      share_count_growth_3y: -3.91,
      eps_growth_fwd: null,
      revenue_ttm: null, earnings_ttm: null, gross_margin: null,
      operating_margin: null, net_margin: null, roe: null, roa: null,
      roic: null, trailing_pe: null, fcf_ttm: null, ebit_ttm: null,
      eps_ttm: null, net_debt_to_ebitda: null, total_debt: null,
      cash_and_equivalents: null, debt_to_equity: null, current_ratio: null,
      interest_coverage: null, gaapEps: null, gaapEpsFiscalYearEnd: null,
    };
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: fundamentals,
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(Number(updateCall.data.shareCountGrowth3y)).toBeCloseTo(-3.91, 2);
  });

  it('revenue_growth_3y null → revenueGrowth3y not written (null-not-overwrite)', async () => {
    const fundamentals: FundamentalData = {
      ticker: 'AAPL',
      revenue_growth_yoy: 5.0, eps_growth_yoy: 7.0,
      revenue_growth_3y: null, eps_growth_3y: null,
      gross_profit_growth: null, share_count_growth_3y: null,
      eps_growth_fwd: null,
      revenue_ttm: 400e9, earnings_ttm: null, gross_margin: null,
      operating_margin: null, net_margin: null, roe: null, roa: null,
      roic: null, trailing_pe: null, fcf_ttm: null, ebit_ttm: null,
      eps_ttm: null, net_debt_to_ebitda: null, total_debt: null,
      cash_and_equivalents: null, debt_to_equity: null, current_ratio: null,
      interest_coverage: null, gaapEps: null, gaapEpsFiscalYearEnd: null,
    };
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: fundamentals,
      source_provider: 'tiingo',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.revenueGrowth3y).toBeUndefined();
    expect(updateCall.data.epsGrowth3y).toBeUndefined();
    expect(updateCall.data.grossProfitGrowth).toBeUndefined();
    expect(updateCall.data.shareCountGrowth3y).toBeUndefined();
  });

  it('provenance keys set for written 3y CAGR fields', async () => {
    const fundamentals: FundamentalData = {
      ticker: 'AAPL',
      revenue_growth_yoy: null, eps_growth_yoy: null,
      revenue_growth_3y: 11.77,
      eps_growth_3y: 23.27,
      gross_profit_growth: 6.82,
      share_count_growth_3y: -3.91,
      eps_growth_fwd: null,
      revenue_ttm: null, earnings_ttm: null, gross_margin: null,
      operating_margin: null, net_margin: null, roe: null, roa: null,
      roic: null, trailing_pe: null, fcf_ttm: null, ebit_ttm: null,
      eps_ttm: null, net_debt_to_ebitda: null, total_debt: null,
      cash_and_equivalents: null, debt_to_equity: null, current_ratio: null,
      interest_coverage: null, gaapEps: null, gaapEpsFiscalYearEnd: null,
    };
    mockOrchestrator.fetchFieldWithFallback.mockResolvedValue({
      value: fundamentals,
      source_provider: 'fmp',
      synced_at: FIXED_NOW,
      fallback_used: false,
    });

    await syncFundamentals(makeMockAdapter('tiingo'), makeMockAdapter('fmp'), { now: FIXED_NOW });
    const updateCall = (mockPrisma.stock.update as jest.Mock).mock.calls[0][0];
    const prov = updateCall.data.dataProviderProvenance as Record<string, Record<string, unknown>>;
    expect(prov['revenue_growth_3y']['provider']).toBe('fmp');
    expect(prov['eps_growth_3y']['provider']).toBe('fmp');
    expect(prov['gross_profit_growth']['provider']).toBe('fmp');
    expect(prov['share_count_growth_3y']['provider']).toBe('fmp');
  });
});
