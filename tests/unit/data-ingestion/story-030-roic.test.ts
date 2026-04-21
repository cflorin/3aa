// EPIC-003: Data Ingestion & Universe Management
// STORY-030: ROIC — NOPAT / Invested Capital
// TASK-030-002: Edge case unit tests for ROIC formula (both adapters)
// @unit

import { TiingoAdapter } from '../../../src/modules/data-ingestion/adapters/tiingo.adapter';
import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchMock(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status, statusText: String(status),
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockFmpResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status, statusText: String(status),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Creates 4 Tiingo quarterly reports where Q0 holds all income values
 * (Q1–Q3 are empty), so TTM sums == the values given here.
 * Omit cash to simulate absent cashAndEq DataCode (IC fallback to equity+debt).
 */
function makeTiingoQuarters(opts: {
  ebit?: number;
  taxExp?: number;
  pretaxinc?: number;
  equity?: number;
  debt?: number;
  cash?: number | null;
}) {
  const {
    ebit = 100_000, taxExp = 20_000, pretaxinc = 100_000,
    equity = 200_000, debt = 100_000, cash = 50_000,
  } = opts;

  const balanceSheet = [
    { dataCode: 'equity', value: equity },
    { dataCode: 'debt', value: debt },
    ...(cash !== null ? [{ dataCode: 'cashAndEq', value: cash! }] : []),
  ];

  return [
    {
      date: '2024-03-31', year: 2024, quarter: 1,
      statementData: {
        incomeStatement: [
          { dataCode: 'revenue', value: 400_000 },
          { dataCode: 'netinc', value: 80_000 },
          { dataCode: 'ebit', value: ebit },
          { dataCode: 'taxExp', value: taxExp },
          { dataCode: 'pretaxinc', value: pretaxinc },
        ],
        balanceSheet,
        overview: [], cashFlow: [],
      },
    },
    // Q1–Q3 empty (zeros in sum)
    ...[1, 2, 3].map(i => ({
      date: `2023-0${i * 3}-30`, year: 2023, quarter: i,
      statementData: { incomeStatement: [], balanceSheet: [], overview: [], cashFlow: [] },
    })),
  ];
}

/** Minimal FMP income + balance fixture */
function makeFmpFixtures(inc: {
  ebit?: number | null;
  incomeTaxExpense?: number | null;
  incomeBeforeTax?: number | null;
}, bal: {
  equity?: number | null;
  totalDebt?: number | null;
  cash?: number | null;
}) {
  const income = [{
    date: '2024-09-30', symbol: 'AAPL', period: 'FY',
    revenue: 400_000, netIncome: 80_000, grossProfit: 160_000,
    operatingIncome: inc.ebit ?? 120_000,
    ebit: inc.ebit !== undefined ? inc.ebit : 120_000,
    interestExpense: null, epsDiluted: 4.0,
    incomeTaxExpense: inc.incomeTaxExpense !== undefined ? inc.incomeTaxExpense : 24_000,
    incomeBeforeTax: inc.incomeBeforeTax !== undefined ? inc.incomeBeforeTax : 120_000,
  }];
  const balance = [{
    date: '2024-09-30', symbol: 'AAPL',
    totalStockholdersEquity: bal.equity !== undefined ? bal.equity : 50_000,
    totalAssets: 500_000,
    totalDebt: bal.totalDebt !== undefined ? bal.totalDebt : 100_000,
    cashAndCashEquivalents: bal.cash !== undefined ? bal.cash : 20_000,
    totalCurrentAssets: 150_000, totalCurrentLiabilities: 75_000,
  }];
  return { income, balance };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EPIC-003/STORY-030/TASK-030-002: ROIC edge cases — TiingoAdapter', () => {
  let adapter: TiingoAdapter;

  beforeEach(() => {
    adapter = new TiingoAdapter('test-key');
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns roic=null when IC = 0 (equity+debt == cash)', async () => {
    // equity=100k, debt=100k, cash=200k → IC=0
    global.fetch = makeFetchMock(200, makeTiingoQuarters({ equity: 100_000, debt: 100_000, cash: 200_000 }));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.roic).toBeNull();
  });

  it('returns roic=null when IC < 0 (e.g. negative equity from buybacks)', async () => {
    // equity=50k, debt=50k, cash=200k → IC=-100k
    global.fetch = makeFetchMock(200, makeTiingoQuarters({ equity: 50_000, debt: 50_000, cash: 200_000 }));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.roic).toBeNull();
  });

  it('uses 25% fallback rate on loss year (pretaxinc ≤ 0)', async () => {
    // pretaxinc=-10k → rate=0.25; ebit=100k, IC=250k → roic=0.3
    global.fetch = makeFetchMock(200, makeTiingoQuarters({
      ebit: 100_000, taxExp: 0, pretaxinc: -10_000,
      equity: 200_000, debt: 100_000, cash: 50_000,
    }));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    // nopat=100000*(1-0.25)=75000; IC=250000; roic=0.3
    expect(result!.roic).toBeCloseTo(75_000 / 250_000, 5);
  });

  it('clamps effective tax rate to 50% when raw rate > 50%', async () => {
    // taxExp=80k, pretaxinc=100k → raw rate=80% → clamped to 50%
    global.fetch = makeFetchMock(200, makeTiingoQuarters({
      ebit: 100_000, taxExp: 80_000, pretaxinc: 100_000,
      equity: 200_000, debt: 100_000, cash: 50_000,
    }));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    // nopat=100000*(1-0.5)=50000; IC=250000; roic=0.2
    expect(result!.roic).toBeCloseTo(50_000 / 250_000, 5);
  });

  it('returns roic=null when TTM EBIT = 0 (nopat=null)', async () => {
    global.fetch = makeFetchMock(200, makeTiingoQuarters({ ebit: 0 }));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.roic).toBeNull();
  });

  it('falls back to equity+debt for IC when cashAndEq DataCode absent', async () => {
    // cash=null → IC=equity+debt=300k; ebit=100k, rate=20% → nopat=80k; roic=80k/300k
    global.fetch = makeFetchMock(200, makeTiingoQuarters({
      ebit: 100_000, taxExp: 20_000, pretaxinc: 100_000,
      equity: 200_000, debt: 100_000, cash: null,
    }));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    // IC=300000 (fallback), nopat=80000, roic≈0.2667
    expect(result!.roic).toBeCloseTo(80_000 / 300_000, 5);
  });
});

describe('EPIC-003/STORY-030/TASK-030-002: ROIC edge cases — FMPAdapter', () => {
  let adapter: FMPAdapter;

  beforeEach(() => {
    global.fetch = jest.fn();
    adapter = new FMPAdapter('test-key');
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns roic=null when ebit is null', async () => {
    const { income, balance } = makeFmpFixtures({ ebit: null }, {});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFmpResponse(200, income))
      .mockResolvedValueOnce(mockFmpResponse(200, balance));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.roic).toBeNull();
  });

  it('returns roic=null when IC = 0 (equity+totalDebt == cash)', async () => {
    // equity=50k, totalDebt=50k, cash=100k → IC=0
    const { income, balance } = makeFmpFixtures({}, { equity: 50_000, totalDebt: 50_000, cash: 100_000 });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFmpResponse(200, income))
      .mockResolvedValueOnce(mockFmpResponse(200, balance));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.roic).toBeNull();
  });

  it('returns roic=null when IC < 0 (negative equity)', async () => {
    // equity=-50k, totalDebt=100k, cash=200k → IC=-150k
    const { income, balance } = makeFmpFixtures({}, { equity: -50_000, totalDebt: 100_000, cash: 200_000 });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFmpResponse(200, income))
      .mockResolvedValueOnce(mockFmpResponse(200, balance));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.roic).toBeNull();
  });

  it('falls back to equity+totalDebt for IC when cash is null', async () => {
    // cash=null → IC=50k+100k=150k; ebit=120k, rate=20% → nopat=96k; roic=96k/150k
    const { income, balance } = makeFmpFixtures(
      { ebit: 120_000, incomeTaxExpense: 24_000, incomeBeforeTax: 120_000 },
      { equity: 50_000, totalDebt: 100_000, cash: null },
    );
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFmpResponse(200, income))
      .mockResolvedValueOnce(mockFmpResponse(200, balance));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    // IC=150000 (fallback), nopat=96000, roic=0.64
    expect(result!.roic).toBeCloseTo(96_000 / 150_000, 5);
  });

  it('uses 25% fallback rate on loss year (incomeBeforeTax ≤ 0)', async () => {
    // pretaxIncome=-50k → rate=0.25; ebit=120k, IC=130k → roic=0.6923
    const { income, balance } = makeFmpFixtures(
      { ebit: 120_000, incomeTaxExpense: 30_000, incomeBeforeTax: -50_000 },
      { equity: 50_000, totalDebt: 100_000, cash: 20_000 },
    );
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFmpResponse(200, income))
      .mockResolvedValueOnce(mockFmpResponse(200, balance));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    // nopat=120000*(1-0.25)=90000; IC=130000; roic≈0.6923
    expect(result!.roic).toBeCloseTo(90_000 / 130_000, 5);
  });

  it('clamps effective tax rate to 50% when raw rate > 50%', async () => {
    // incomeTax=80k, pretaxIncome=100k → raw rate=80% → clamped to 50%
    const { income, balance } = makeFmpFixtures(
      { ebit: 120_000, incomeTaxExpense: 80_000, incomeBeforeTax: 100_000 },
      { equity: 50_000, totalDebt: 100_000, cash: 20_000 },
    );
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFmpResponse(200, income))
      .mockResolvedValueOnce(mockFmpResponse(200, balance));
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    // nopat=120000*(1-0.5)=60000; IC=130000; roic≈0.4615
    expect(result!.roic).toBeCloseTo(60_000 / 130_000, 5);
  });
});
