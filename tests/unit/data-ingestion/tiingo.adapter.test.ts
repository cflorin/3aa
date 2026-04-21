// EPIC-003: Data Ingestion & Universe Management
// STORY-016: Tiingo Provider Adapter
// TASK-016-005: Unit tests — all HTTP mocked, no live calls
// Fixture provenance: synthetic — shaped to match real Tiingo API responses
//   verified against live API 2026-04-20

import { TiingoAdapter } from '../../../src/modules/data-ingestion/adapters/tiingo.adapter';
import {
  ConfigurationError,
  RateLimitExceededError,
  AuthenticationError,
} from '../../../src/modules/data-ingestion/errors';
import { HttpStatusError } from '../../../src/modules/data-ingestion/retry.util';

// Fixture provenance: synthetic — field names and structure match real Tiingo API
// (verified against live endpoint 2026-04-20)

function makeFetchMock(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: jest.fn().mockResolvedValue(body),
  });
}

// 8 quarterly reports (newest first) matching real /tiingo/fundamentals/{ticker}/statements shape
// Fixture provenance: synthetic — dataCode names verified against live AAPL response
const mockStatementsResponse = [
  // Q0 — most recent quarter (TTM[0])
  {
    date: '2024-03-31', year: 2024, quarter: 1,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 130000 },
        { dataCode: 'netinc', value: 26000 },
        { dataCode: 'grossProfit', value: 65000 },
        { dataCode: 'ebit', value: 39000 },
        { dataCode: 'intexp', value: 1000 },
        { dataCode: 'eps', value: 1.50 },
        { dataCode: 'taxExp', value: 8000 },
        { dataCode: 'pretaxinc', value: 40000 },
      ],
      balanceSheet: [
        { dataCode: 'equity', value: 200000 },
        { dataCode: 'totalAssets', value: 500000 },
        { dataCode: 'debt', value: 150000 },
        { dataCode: 'cashAndEq', value: 50000 },
        { dataCode: 'assetsCurrent', value: 100000 },
        { dataCode: 'liabilitiesCurrent', value: 50000 },
      ],
      overview: [
        { dataCode: 'grossMargin', value: 0.50 },
        { dataCode: 'profitMargin', value: 0.20 },
        { dataCode: 'roe', value: 0.130 },
        { dataCode: 'roa', value: 0.052 },
        { dataCode: 'currentRatio', value: 2.0 },
        { dataCode: 'debtEquity', value: 0.75 },
      ],
      cashFlow: [],
    },
  },
  // Q1 — TTM[1]
  {
    date: '2023-12-31', year: 2023, quarter: 4,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 120000 },
        { dataCode: 'netinc', value: 24000 },
        { dataCode: 'ebit', value: 36000 },
        { dataCode: 'intexp', value: 1000 },
        { dataCode: 'eps', value: 1.40 },
        { dataCode: 'grossProfit', value: 60000 },
        { dataCode: 'taxExp', value: 7200 },
        { dataCode: 'pretaxinc', value: 36000 },
      ],
      balanceSheet: [], overview: [], cashFlow: [],
    },
  },
  // Q2 — TTM[2]
  {
    date: '2023-09-30', year: 2023, quarter: 3,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 110000 },
        { dataCode: 'netinc', value: 22000 },
        { dataCode: 'ebit', value: 33000 },
        { dataCode: 'intexp', value: 1000 },
        { dataCode: 'eps', value: 1.30 },
        { dataCode: 'grossProfit', value: 55000 },
        { dataCode: 'taxExp', value: 6600 },
        { dataCode: 'pretaxinc', value: 33000 },
      ],
      balanceSheet: [], overview: [], cashFlow: [],
    },
  },
  // Q3 — TTM[3]
  {
    date: '2023-06-30', year: 2023, quarter: 2,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 100000 },
        { dataCode: 'netinc', value: 20000 },
        { dataCode: 'ebit', value: 30000 },
        { dataCode: 'intexp', value: 1000 },
        { dataCode: 'eps', value: 1.20 },
        { dataCode: 'grossProfit', value: 50000 },
        { dataCode: 'taxExp', value: 6000 },
        { dataCode: 'pretaxinc', value: 30000 },
      ],
      balanceSheet: [], overview: [], cashFlow: [],
    },
  },
  // Q4 — prior[0]
  {
    date: '2023-03-31', year: 2023, quarter: 1,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 105000 },
        { dataCode: 'netinc', value: 21000 },
        { dataCode: 'eps', value: 1.10 },
        { dataCode: 'grossProfit', value: 52500 },
      ],
      balanceSheet: [], overview: [], cashFlow: [],
    },
  },
  // Q5 — prior[1]
  {
    date: '2022-12-31', year: 2022, quarter: 4,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 95000 },
        { dataCode: 'netinc', value: 19000 },
        { dataCode: 'eps', value: 1.00 },
        { dataCode: 'grossProfit', value: 47500 },
      ],
      balanceSheet: [], overview: [], cashFlow: [],
    },
  },
  // Q6 — prior[2]
  {
    date: '2022-09-30', year: 2022, quarter: 3,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 90000 },
        { dataCode: 'netinc', value: 18000 },
        { dataCode: 'eps', value: 0.90 },
        { dataCode: 'grossProfit', value: 45000 },
      ],
      balanceSheet: [], overview: [], cashFlow: [],
    },
  },
  // Q7 — prior[3]
  {
    date: '2022-06-30', year: 2022, quarter: 2,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 100000 },
        { dataCode: 'netinc', value: 20000 },
        { dataCode: 'eps', value: 1.05 },
        { dataCode: 'grossProfit', value: 50000 },
      ],
      balanceSheet: [], overview: [], cashFlow: [],
    },
  },
];
// Expected derived values (for assertion):
// TTM revenue = 130000+120000+110000+100000 = 460000
// Prior revenue = 105000+95000+90000+100000 = 390000
// revenue_growth_yoy = (460000-390000)/390000*100 = 17.9487...%
// TTM eps = 1.5+1.4+1.3+1.2 = 5.4
// Prior eps = 1.1+1.0+0.9+1.05 = 4.05
// eps_growth_yoy = (5.4-4.05)/4.05*100 = 33.333...%
// TTM ebit = 39000+36000+33000+30000 = 138000
// Fix 1: operating_margin = 138000/460000 = 0.3 (LTM — same ratio in this fixture)
// TTM intexp = 1000+1000+1000+1000 = 4000
// Fix 5: interest_coverage = 138000/4000 = 34.5 (LTM)
// TTM earnings = 26000+24000+22000+20000 = 92000
// Fix 2: net_margin = 92000/460000 = 0.2 (TTM DataCodes — matches overview.profitMargin in this fixture)
// STORY-030: TTM taxExp=27800, TTM pretaxinc=139000 → rate=20%; NOPAT=138000*0.8=110400
// IC = equity(200000)+debt(150000)-cash(50000) = 300000; roic = 110400/300000 = 0.368
// Fix 4: net_debt_to_ebitda = (150000-50000)/138000 = 0.7246 (no depamor in fixture)

// Fixture provenance: synthetic — field names match real /tiingo/fundamentals/meta response
const mockMetaResponse = [
  { ticker: 'AAPL', name: 'Apple Inc', isActive: true, isADR: false, location: 'California, USA', sector: 'Technology', industry: 'Consumer Electronics' },
  { ticker: 'SMLL', name: 'Small US Co', isActive: true, isADR: false, location: 'Texas, USA', sector: null, industry: null },
  { ticker: 'CANA', name: 'Canadian Co', isActive: true, isADR: false, location: 'Ontario, Canada', sector: null, industry: null },
  { ticker: 'INAC', name: 'Inactive Co', isActive: false, isADR: false, location: 'New York, USA', sector: null, industry: null },
];

describe('EPIC-003/STORY-016/TASK-016-005: TiingoAdapter unit tests', () => {
  let adapter: TiingoAdapter;

  beforeEach(() => {
    global.fetch = makeFetchMock(200, {});
    adapter = new TiingoAdapter('test-api-key');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Constructor ───────────────────────────────────────────────

  describe('constructor', () => {
    it('throws ConfigurationError when API key is undefined', () => {
      const orig = process.env.TIINGO_API_KEY;
      delete process.env.TIINGO_API_KEY;
      expect(() => new TiingoAdapter()).toThrow(ConfigurationError);
      process.env.TIINGO_API_KEY = orig;
    });

    it('throws ConfigurationError when API key is empty string', () => {
      expect(() => new TiingoAdapter('')).toThrow(ConfigurationError);
    });

    it('creates adapter when API key is provided', () => {
      expect(() => new TiingoAdapter('valid-key')).not.toThrow();
    });
  });

  // ─── Capabilities ──────────────────────────────────────────────

  describe('capabilities', () => {
    it('has providerName tiingo', () => {
      expect(adapter.providerName).toBe('tiingo');
    });

    it('has forwardEstimateCoverage none (endpoint unavailable at this API tier)', () => {
      expect(adapter.capabilities.forwardEstimateCoverage).toBe('none');
    });

    it('has rateLimit requestsPerHour 1000', () => {
      expect(adapter.capabilities.rateLimit.requestsPerHour).toBe(1000);
    });
  });

  // ─── Rate limiter ──────────────────────────────────────────────

  describe('rate limiter', () => {
    it('throws RateLimitExceededError on 1001st request within one hour', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        json: jest.fn().mockResolvedValue(null),
      });
      for (let i = 0; i < 1000; i++) {
        await adapter.fetchEODPrice(`TICK${i}`).catch(() => {});
      }
      await expect(adapter.fetchEODPrice('OVER')).rejects.toBeInstanceOf(RateLimitExceededError);
    });
  });

  // ─── HTTP error handling ────────────────────────────────────────

  describe('HTTP error handling', () => {
    it('throws AuthenticationError on 401', async () => {
      global.fetch = makeFetchMock(401, {});
      await expect(adapter.fetchEODPrice('AAPL')).rejects.toBeInstanceOf(AuthenticationError);
    });

    it('throws AuthenticationError on 403', async () => {
      global.fetch = makeFetchMock(403, {});
      await expect(adapter.fetchEODPrice('AAPL')).rejects.toBeInstanceOf(AuthenticationError);
    });

    it('throws HttpStatusError on 500', async () => {
      global.fetch = makeFetchMock(500, {});
      await expect(adapter.fetchEODPrice('AAPL')).rejects.toBeInstanceOf(HttpStatusError);
    });

    it('returns null on 404', async () => {
      global.fetch = makeFetchMock(404, null);
      expect(await adapter.fetchEODPrice('UNKNOWN')).toBeNull();
    });
  });

  // ─── Log safety ────────────────────────────────────────────────

  describe('log safety', () => {
    it('does not log the API key value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      global.fetch = makeFetchMock(200, []);
      await adapter.fetchUniverse(5000);
      const allLogs = consoleSpy.mock.calls.map(c => JSON.stringify(c)).join('');
      expect(allLogs).not.toContain('test-api-key');
    });
  });

  // ─── fetchUniverse ─────────────────────────────────────────────

  describe('fetchUniverse', () => {
    it('returns only active US stocks (filters inactive and non-USA location)', async () => {
      global.fetch = makeFetchMock(200, mockMetaResponse);
      const result = await adapter.fetchUniverse(5000);
      // AAPL and SMLL are active+USA; CANA is Canada; INAC is inactive
      expect(result).toHaveLength(2);
      expect(result.map(s => s.ticker)).toEqual(expect.arrayContaining(['AAPL', 'SMLL']));
      expect(result.map(s => s.ticker)).not.toContain('CANA');
      expect(result.map(s => s.ticker)).not.toContain('INAC');
    });

    it('sets market_cap_millions to null (not available from meta endpoint)', async () => {
      global.fetch = makeFetchMock(200, mockMetaResponse);
      const result = await adapter.fetchUniverse(5000);
      result.forEach(s => expect(s.market_cap_millions).toBeNull());
    });

    it('returns empty array when API returns non-array', async () => {
      global.fetch = makeFetchMock(200, { error: 'unexpected' });
      expect(await adapter.fetchUniverse(5000)).toEqual([]);
    });

    it('normalizes sector and industry to null when absent', async () => {
      global.fetch = makeFetchMock(200, mockMetaResponse);
      const result = await adapter.fetchUniverse(5000);
      const smll = result.find(s => s.ticker === 'SMLL')!;
      expect(smll.sector).toBeNull();
      expect(smll.industry).toBeNull();
    });
  });

  // ─── fetchEODPrice ─────────────────────────────────────────────

  describe('fetchEODPrice', () => {
    // Fixture provenance: synthetic — field names match real Tiingo daily prices response
    it('returns PriceData for valid 200 response', async () => {
      global.fetch = makeFetchMock(200, [
        { date: '2024-01-15T00:00:00+00:00', close: 185.5, adjClose: 185.5 },
      ]);
      const result = await adapter.fetchEODPrice('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('AAPL');
      expect(result!.close).toBe(185.5);
      expect(result!.date).toBeInstanceOf(Date);
    });

    it('returns last element from array (most recent)', async () => {
      global.fetch = makeFetchMock(200, [
        { date: '2024-01-14T00:00:00+00:00', close: 184.0 },
        { date: '2024-01-15T00:00:00+00:00', close: 185.5 },
      ]);
      const result = await adapter.fetchEODPrice('AAPL');
      expect(result!.close).toBe(185.5);
    });

    it('returns null for empty array response', async () => {
      global.fetch = makeFetchMock(200, []);
      expect(await adapter.fetchEODPrice('AAPL')).toBeNull();
    });
  });

  // ─── fetchFundamentals ─────────────────────────────────────────

  describe('fetchFundamentals', () => {
    it('returns FundamentalData with correct TTM revenue (460000) and earnings (92000)', async () => {
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('AAPL');
      expect(result!.revenue_ttm).toBe(460000);
      expect(result!.earnings_ttm).toBe(92000);
      // period_end = date of most recent quarterly report (after filtering annual entries)
      expect(result!.statementPeriodEnd).toBe('2024-03-31');
    });

    it('filters out annual summary entries (quarter=0) so TTM sums only cover 4 quarters', async () => {
      // Inject an annual row (quarter=0) between Q0 and Q1 — must not be summed into TTM
      const withAnnual = [
        mockStatementsResponse[0], // Q0: revenue=130000
        { date: '2024-03-31', year: 2024, quarter: 0, statementData: { // annual summary — must be skipped
          incomeStatement: [{ dataCode: 'revenue', value: 9999999 }, { dataCode: 'netinc', value: 9999999 }],
          balanceSheet: [], overview: [],
        }},
        ...mockStatementsResponse.slice(1),
      ];
      global.fetch = makeFetchMock(200, withAnnual);
      const result = await adapter.fetchFundamentals('AAPL');
      // TTM revenue must still be 460000, not inflated by the annual row
      expect(result!.revenue_ttm).toBe(460000);
    });

    it('returns correct overview-based metrics (grossMargin, roe, roa, debtEquity, currentRatio)', async () => {
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.gross_margin).toBe(0.50);
      expect(result!.net_margin).toBe(0.20);
      expect(result!.roe).toBe(0.130);
      expect(result!.roa).toBe(0.052);
      expect(result!.current_ratio).toBe(2.0);
      expect(result!.debt_to_equity).toBe(0.75);
    });

    it('computes LTM operating_margin, interest_coverage, and roic from income/balance data', async () => {
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      // Fix 1: LTM operating_margin = 138000/460000 = 0.3
      expect(result!.operating_margin).toBeCloseTo(0.3, 5);
      // Fix 5: LTM interest_coverage = 138000/4000 = 34.5
      expect(result!.interest_coverage).toBeCloseTo(34.5, 5);
      // STORY-030: NOPAT=110400, IC=300000 → roic=0.368
      expect(result!.roic).toBeCloseTo(110400 / 300000, 5);
    });

    it('returns ebit_ttm = TTM sum of ebit DataCodes and eps_ttm = TTM sum of eps DataCodes', async () => {
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      // TTM ebit = 39000+36000+33000+30000 = 138000
      expect(result!.ebit_ttm).toBe(138000);
      // TTM eps = 1.5+1.4+1.3+1.2 = 5.4
      expect(result!.eps_ttm).toBeCloseTo(5.4, 5);
    });

    it('returns net_debt_to_ebitda and total_debt/cash from balance sheet (Fix 4)', async () => {
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      // Fix 4: (debt-cash)/ebitda = (150000-50000)/138000 ≈ 0.7246
      expect(result!.net_debt_to_ebitda).toBeCloseTo(100000 / 138000, 5);
      expect(result!.total_debt).toBe(150000);
      expect(result!.cash_and_equivalents).toBe(50000);
    });

    it('eps_growth_fwd and trailing_pe are always null', async () => {
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.eps_growth_fwd).toBeNull();
      expect(result!.trailing_pe).toBeNull();
    });

    it('STORY-029: share_count_growth_3y always null (not available from Tiingo)', async () => {
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.share_count_growth_3y).toBeNull();
    });

    it('STORY-029: revenue_growth_3y and eps_growth_3y null when < 16 quarters', async () => {
      // 8-quarter fixture: fewer than 16 → 3y CAGRs null
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.revenue_growth_3y).toBeNull();
      expect(result!.eps_growth_3y).toBeNull();
    });

    it('STORY-029: gross_profit_growth computed from TTM vs prior TTM grossProfit', async () => {
      // TTM GP = 65000+60000+55000+50000 = 230000
      // Prior TTM GP = 52500+47500+45000+50000 = 195000
      // growth = (230000-195000)/195000*100 ≈ 17.95%
      global.fetch = makeFetchMock(200, mockStatementsResponse);
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.gross_profit_growth).toBeCloseTo((230000 - 195000) / 195000 * 100, 2);
    });

    it('returns null on 404', async () => {
      global.fetch = makeFetchMock(404, null);
      expect(await adapter.fetchFundamentals('UNKNOWN')).toBeNull();
    });

    it('returns null when statements array is empty', async () => {
      global.fetch = makeFetchMock(200, []);
      expect(await adapter.fetchFundamentals('AAPL')).toBeNull();
    });
  });

  // ─── fetchForwardEstimates ─────────────────────────────────────

  describe('fetchForwardEstimates', () => {
    it('always returns null (endpoint unavailable at this API tier)', async () => {
      expect(await adapter.fetchForwardEstimates('AAPL')).toBeNull();
    });

    it('returns null without making an HTTP call', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;
      await adapter.fetchForwardEstimates('AAPL');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null for any ticker', async () => {
      expect(await adapter.fetchForwardEstimates('MSFT')).toBeNull();
      expect(await adapter.fetchForwardEstimates('INVALID')).toBeNull();
    });
  });

  // ─── fetchMetadata ─────────────────────────────────────────────

  describe('fetchMetadata', () => {
    // Fixture provenance: synthetic — field names match real /tiingo/daily/{ticker} response
    it('returns StockMetadata with sector and industry null (not available from this endpoint)', async () => {
      global.fetch = makeFetchMock(200, {
        ticker: 'AAPL', name: 'Apple Inc', exchangeCode: 'NASDAQ',
        description: 'Apple Inc designs...', startDate: '1980-12-12', endDate: null,
      });
      const result = await adapter.fetchMetadata('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('AAPL');
      expect(result!.company_name).toBe('Apple Inc');
      expect(result!.exchange).toBe('NASDAQ');
      expect(result!.sector).toBeNull();
      expect(result!.industry).toBeNull();
      expect(result!.market_cap_usd).toBeNull();    // not available from Tiingo /daily/{ticker}
      expect(result!.shares_outstanding).toBeNull(); // not available from Tiingo /daily/{ticker}
    });

    it('returns null on 404', async () => {
      global.fetch = makeFetchMock(404, null);
      expect(await adapter.fetchMetadata('UNKNOWN')).toBeNull();
    });
  });
});
