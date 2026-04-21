// EPIC-003: Data Ingestion & Universe Management
// STORY-026: Fix Fundamental Metrics Data Quality
// TASK-026-005: Unit tests for all 7 data quality fixes
// Tests use known quarterly inputs with expected derived outputs

import { TiingoAdapter } from '../../../src/modules/data-ingestion/adapters/tiingo.adapter';
import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';

function makeFetchMock(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: jest.fn().mockResolvedValue(body),
  });
}

// Constructs a minimal valid quarterly response for Tiingo /statements
function makeQuarters(
  ttmRows: Array<{
    revenue: number;
    netinc: number;
    eps: number;
    ebit: number;
    intexp?: number;
    depamor?: number;
    freeCashFlow?: number;
  }>,
  priorRows: Array<{ revenue: number; netinc: number; eps: number }> = [],
  balanceSheet: Array<{ dataCode: string; value: number }> = [],
  overview: Array<{ dataCode: string; value: number }> = [],
) {
  const toIncomeStatement = (row: Record<string, number>) =>
    Object.entries(row).map(([dataCode, value]) => ({ dataCode, value }));

  const quarters = [
    ...ttmRows.map((row, i) => ({
      date: `2024-0${4 - i}-01`,
      year: 2024,
      quarter: 4 - i,
      statementData: {
        incomeStatement: toIncomeStatement({
          revenue: row.revenue,
          netinc: row.netinc,
          eps: row.eps,
          ebit: row.ebit,
          ...(row.intexp != null ? { intexp: row.intexp } : {}),
          ...(row.depamor != null ? { depamor: row.depamor } : {}),
        }),
        balanceSheet: i === 0 ? balanceSheet : [],
        overview: i === 0 ? overview : [],
        cashFlow: row.freeCashFlow != null
          ? [{ dataCode: 'freeCashFlow', value: row.freeCashFlow }]
          : [],
      },
    })),
    ...priorRows.map((row, i) => ({
      date: `2023-0${4 - i}-01`,
      year: 2023,
      quarter: 4 - i,
      statementData: {
        incomeStatement: toIncomeStatement({ revenue: row.revenue, netinc: row.netinc, eps: row.eps }),
        balanceSheet: [],
        overview: [],
        cashFlow: [],
      },
    })),
  ];
  return quarters;
}

describe('EPIC-003/STORY-026/TASK-026-005: Tiingo adapter data quality fixes', () => {
  let adapter: TiingoAdapter;

  beforeEach(() => {
    adapter = new TiingoAdapter('test-key');
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── Fix 1: LTM Operating Margin ───────────────────────────────

  describe('Fix 1 — LTM operating_margin = TTM EBIT / TTM revenue', () => {
    it('differs from single-quarter rate when quarters have varying margins', async () => {
      // Q0: ebit/revenue = 20000/100000 = 0.20
      // TTM: ebit=20000+40000+30000+50000=140000, revenue=400000 → LTM = 0.35
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 20000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 40000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 50000 },
        ],
        [],
        [{ dataCode: 'debt', value: 100000 }, { dataCode: 'equity', value: 200000 }, { dataCode: 'cashAndEq', value: 20000 }],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      // LTM = 140000/400000 = 0.35 (not 0.20 single-quarter)
      expect(result!.operating_margin).toBeCloseTo(0.35, 5);
    });

    it('returns null when TTM revenue is zero', async () => {
      const quarters = makeQuarters(
        [
          { revenue: 0, netinc: 0, eps: 0, ebit: 1000 },
          { revenue: 0, netinc: 0, eps: 0, ebit: 1000 },
          { revenue: 0, netinc: 0, eps: 0, ebit: 1000 },
          { revenue: 0, netinc: 0, eps: 0, ebit: 1000 },
        ],
        [],
        [{ dataCode: 'debt', value: 0 }, { dataCode: 'equity', value: 1 }, { dataCode: 'cashAndEq', value: 0 }],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.operating_margin).toBeNull();
    });
  });

  // ─── Fix 2: Net Margin from DataCodes ─────────────────────────

  describe('Fix 2 — net_margin from TTM DataCodes (not overview.profitMargin)', () => {
    it('uses netinc/revenue DataCodes, ignores overview.profitMargin', async () => {
      // TTM netinc = 4×10000 = 40000; TTM revenue = 4×200000 = 800000 → net_margin = 0.05
      // overview.profitMargin = 0.48 (gross margin bug) — should NOT be used
      const quarters = makeQuarters(
        [
          { revenue: 200000, netinc: 10000, eps: 1.0, ebit: 15000 },
          { revenue: 200000, netinc: 10000, eps: 1.0, ebit: 15000 },
          { revenue: 200000, netinc: 10000, eps: 1.0, ebit: 15000 },
          { revenue: 200000, netinc: 10000, eps: 1.0, ebit: 15000 },
        ],
        [],
        [{ dataCode: 'debt', value: 0 }, { dataCode: 'equity', value: 1 }, { dataCode: 'cashAndEq', value: 0 }],
        [{ dataCode: 'profitMargin', value: 0.48 }], // gross margin DataCode bug
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.net_margin).toBeCloseTo(0.05, 5); // 40000/800000
    });
  });

  // ─── Fix 3: FCF TTM from cashFlow DataCode ─────────────────────

  describe('Fix 3 — fcf_ttm from cashFlow.freeCashFlow DataCode', () => {
    it('sums freeCashFlow across 4 TTM quarters', async () => {
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000, freeCashFlow: 22000 },
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000, freeCashFlow: 18000 },
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000, freeCashFlow: 21000 },
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000, freeCashFlow: 19000 },
        ],
        [],
        [{ dataCode: 'debt', value: 50000 }, { dataCode: 'equity', value: 100000 }, { dataCode: 'cashAndEq', value: 10000 }],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.fcf_ttm).toBe(80000); // 22000+18000+21000+19000
    });

    it('returns null when cashFlow section is absent for all TTM quarters', async () => {
      // No freeCashFlow in any quarter (sections are empty arrays)
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000 },
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000 },
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000 },
          { revenue: 100000, netinc: 20000, eps: 1.0, ebit: 25000 },
        ],
        [],
        [{ dataCode: 'debt', value: 50000 }, { dataCode: 'equity', value: 100000 }, { dataCode: 'cashAndEq', value: 10000 }],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.fcf_ttm).toBeNull();
    });
  });

  // ─── Fix 4: Net Debt / EBITDA ──────────────────────────────────

  describe('Fix 4 — net_debt_to_ebitda = (debt − cash) / EBITDA', () => {
    it('computes correctly with depamor DataCode present', async () => {
      // debt=100000, cash=30000, TTM ebit=40000, TTM depamor=10000
      // EBITDA = 40000+10000 = 50000
      // net_debt = 100000-30000 = 70000
      // ratio = 70000/50000 = 1.4
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000, depamor: 2500 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000, depamor: 2500 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000, depamor: 2500 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000, depamor: 2500 },
        ],
        [],
        [
          { dataCode: 'debt', value: 100000 },
          { dataCode: 'cashAndEq', value: 30000 },
          { dataCode: 'equity', value: 200000 },
        ],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.net_debt_to_ebitda).toBeCloseTo(1.4, 5);
      expect(result!.total_debt).toBe(100000);
      expect(result!.cash_and_equivalents).toBe(30000);
    });

    it('uses TTM EBIT as conservative denominator when depamor absent', async () => {
      // debt=100000, cash=30000, TTM ebit=40000, no depamor → EBITDA = 40000
      // ratio = 70000/40000 = 1.75
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
        ],
        [],
        [
          { dataCode: 'debt', value: 100000 },
          { dataCode: 'cashAndEq', value: 30000 },
          { dataCode: 'equity', value: 200000 },
        ],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.net_debt_to_ebitda).toBeCloseTo(1.75, 5); // (100k-30k)/40k
    });

    it('returns negative ratio (net cash position) when cash > debt', async () => {
      // debt=30000, cash=80000 → net_debt = -50000 → ratio = -50000/40000 = -1.25
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
        ],
        [],
        [
          { dataCode: 'debt', value: 30000 },
          { dataCode: 'cashAndEq', value: 80000 },
          { dataCode: 'equity', value: 200000 },
        ],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.net_debt_to_ebitda).toBeCloseTo(-1.25, 5);
    });

    it('returns null when debt is missing from balance sheet', async () => {
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
          { revenue: 100000, netinc: 8000, eps: 1.0, ebit: 10000 },
        ],
        [],
        [
          { dataCode: 'cashAndEq', value: 30000 },
          { dataCode: 'equity', value: 200000 },
        ],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.net_debt_to_ebitda).toBeNull();
    });
  });

  // ─── Fix 5: LTM Interest Coverage ─────────────────────────────

  describe('Fix 5 — LTM interest_coverage = TTM EBIT / TTM intexp', () => {
    it('uses sum of 4 quarters (not single quarter)', async () => {
      // Q0: ebit=40000, intexp=0; Q1-Q3: ebit=30000, intexp=1000
      // TTM: ebit=130000, intexp=3000 → coverage=43.33
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 40000, intexp: 0 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000, intexp: 1000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000, intexp: 1000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000, intexp: 1000 },
        ],
        [],
        [{ dataCode: 'debt', value: 10000 }, { dataCode: 'equity', value: 50000 }, { dataCode: 'cashAndEq', value: 5000 }],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.interest_coverage).toBeCloseTo(130000 / 3000, 3);
    });

    it('returns null when TTM intexp is zero (e.g. AAPL-like low interest expense)', async () => {
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000, intexp: 0 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000, intexp: 0 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000, intexp: 0 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000, intexp: 0 },
        ],
        [],
        [{ dataCode: 'debt', value: 10000 }, { dataCode: 'equity', value: 50000 }, { dataCode: 'cashAndEq', value: 5000 }],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.interest_coverage).toBeNull();
    });

    it('returns null when intexp DataCode absent from all quarters', async () => {
      const quarters = makeQuarters(
        [
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000 },
          { revenue: 100000, netinc: 10000, eps: 1.0, ebit: 30000 },
        ],
        [],
        [{ dataCode: 'debt', value: 10000 }, { dataCode: 'equity', value: 50000 }, { dataCode: 'cashAndEq', value: 5000 }],
      );
      global.fetch = makeFetchMock(200, quarters);
      const result = await adapter.fetchFundamentals('TEST');
      expect(result!.interest_coverage).toBeNull();
    });
  });
});

describe('EPIC-003/STORY-026/TASK-026-005: FMP adapter data quality fixes', () => {
  let adapter: FMPAdapter;

  beforeEach(() => {
    adapter = new FMPAdapter('test-key');
  });

  afterEach(() => jest.restoreAllMocks());

  const makeIncomeStatement = (revenue: number, netIncome: number) => [{
    revenue,
    netIncome,
    grossProfit: revenue * 0.45,
    operatingIncome: revenue * 0.28,
    ebit: revenue * 0.28,
    interestExpense: 3000000000,
    epsDiluted: 6.08,
  }];

  const makeBalanceSheet = (totalDebt: number, cashAndCashEquivalents: number) => [{
    totalStockholdersEquity: 60000000000,
    totalAssets: 350000000000,
    totalDebt,
    cashAndCashEquivalents,
    totalCurrentAssets: 143000000000,
    totalCurrentLiabilities: 145000000000,
  }];

  function mockFmpCalls(revenue: number, netIncome: number, totalDebt: number, cash: number) {
    let callIndex = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callIndex++;
      const body = callIndex === 1
        ? makeIncomeStatement(revenue, netIncome)
        : makeBalanceSheet(totalDebt, cash);
      return Promise.resolve({
        ok: true, status: 200, statusText: 'OK',
        json: () => Promise.resolve(body),
      });
    });
  }

  // ─── BC-026-001: Absolute USD ──────────────────────────────────

  describe('BC-026-001 — revenue_ttm and earnings_ttm are absolute USD (not /1_000_000)', () => {
    it('revenue_ttm equals raw revenue from API (not divided by 1M)', async () => {
      mockFmpCalls(385000000000, 95000000000, 110000000000, 60000000000);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.revenue_ttm).toBe(385000000000);
    });

    it('earnings_ttm equals raw netIncome from API (not divided by 1M)', async () => {
      mockFmpCalls(385000000000, 95000000000, 110000000000, 60000000000);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.earnings_ttm).toBe(95000000000);
    });
  });

  // ─── Fix 6: total_debt and cash_and_equivalents ────────────────

  describe('Fix 6 — total_debt and cash_and_equivalents from FMP balance sheet', () => {
    it('returns total_debt from balance sheet totalDebt field', async () => {
      mockFmpCalls(385000000000, 95000000000, 110000000000, 60000000000);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.total_debt).toBe(110000000000);
    });

    it('returns cash_and_equivalents from balance sheet cashAndCashEquivalents', async () => {
      mockFmpCalls(385000000000, 95000000000, 110000000000, 60000000000);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.cash_and_equivalents).toBe(60000000000);
    });

    it('net_debt_to_ebitda is null (FMP does not compute it)', async () => {
      mockFmpCalls(385000000000, 95000000000, 110000000000, 60000000000);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.net_debt_to_ebitda).toBeNull();
    });

    it('fcf_ttm is null (not available without cash flow statement endpoint)', async () => {
      mockFmpCalls(385000000000, 95000000000, 110000000000, 60000000000);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.fcf_ttm).toBeNull();
    });
  });
});
