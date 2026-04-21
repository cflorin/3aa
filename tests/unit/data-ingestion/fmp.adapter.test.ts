// EPIC-003: Data Ingestion & Universe Management
// STORY-017: FMP Provider Adapter
// TASK-017-005: Unit tests — 34 tests, all HTTP mocked
// @unit
//
// Fixture provenance: synthetic — field names verified against live FMP stable API 2026-04-20
// All HTTP calls are mocked; no live API calls in this suite.

import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';
import { ConfigurationError, RateLimitExceededError, AuthenticationError } from '../../../src/modules/data-ingestion/errors';
import { HttpStatusError } from '../../../src/modules/data-ingestion/retry.util';

// Helper: build a minimal fetch mock response
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('EPIC-003/STORY-017/TASK-017-005: FMPAdapter unit tests', () => {
  let adapter: FMPAdapter;

  beforeEach(() => {
    global.fetch = jest.fn();
    adapter = new FMPAdapter('test-api-key');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // ── Constructor (3 tests) ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws ConfigurationError when API key is undefined', () => {
      delete process.env.FMP_API_KEY;
      expect(() => new FMPAdapter(undefined)).toThrow(ConfigurationError);
    });

    it('throws ConfigurationError when API key is empty string', () => {
      expect(() => new FMPAdapter('')).toThrow(ConfigurationError);
    });

    it('does not throw when API key is provided', () => {
      expect(() => new FMPAdapter('valid-key')).not.toThrow();
    });
  });

  // ── Capabilities (3 tests) ────────────────────────────────────────────────

  describe('capabilities', () => {
    it('providerName is fmp', () => {
      expect(adapter.providerName).toBe('fmp');
    });

    it('forwardEstimateCoverage is partial', () => {
      expect(adapter.capabilities.forwardEstimateCoverage).toBe('partial');
    });

    it('rateLimit.requestsPerHour is 15000', () => {
      expect(adapter.capabilities.rateLimit.requestsPerHour).toBe(15000);
    });
  });

  // ── Rate limiter (2 tests) ────────────────────────────────────────────────

  describe('rate limiter', () => {
    it('allows 250 requests and throws RateLimitExceededError on 251st', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, []));
      // Make 250 requests — all should succeed
      for (let i = 0; i < 250; i++) {
        await adapter.fetchMetadata('AAPL');
      }
      // 251st must throw
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, []));
      await expect(adapter.fetchMetadata('AAPL')).rejects.toThrow(RateLimitExceededError);
    });

    it('resets window after 60 seconds — 251st request in new window succeeds', async () => {
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, []));
      // Fill window with 250 requests
      for (let i = 0; i < 250; i++) {
        await adapter.fetchMetadata('AAPL');
      }
      // Advance clock past 1-minute window
      jest.advanceTimersByTime(60_001);
      // Next request should succeed (old timestamps are outside the window)
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [
        { symbol: 'AAPL', companyName: 'Apple Inc.', exchange: 'NASDAQ', sector: 'Technology', industry: 'Consumer Electronics', marketCap: 4_000_000_000_000 },
      ]));
      await expect(adapter.fetchMetadata('AAPL')).resolves.not.toBeNull();
    });
  });

  // ── HTTP error handling (5 tests) ─────────────────────────────────────────

  describe('HTTP error handling', () => {
    it('401 response throws AuthenticationError', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(401, {}));
      await expect(adapter.fetchMetadata('AAPL')).rejects.toThrow(AuthenticationError);
    });

    it('403 response throws AuthenticationError', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(403, {}));
      await expect(adapter.fetchMetadata('AAPL')).rejects.toThrow(AuthenticationError);
    });

    it('402 response returns null (not thrown — plan restriction)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(402, 'Restricted'));
      const result = await adapter.fetchMetadata('AAPL');
      expect(result).toBeNull();
    });

    it('500 response throws HttpStatusError', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(500, {}));
      await expect(adapter.fetchMetadata('AAPL')).rejects.toThrow(HttpStatusError);
    });

    it('404 response returns null', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(404, {}));
      const result = await adapter.fetchMetadata('AAPL');
      expect(result).toBeNull();
    });
  });

  // ── Log safety (1 test) ───────────────────────────────────────────────────

  describe('log safety', () => {
    it('API key value never appears in console.log output', async () => {
      const key = 'super-secret-key-12345';
      const adapterWithKey = new FMPAdapter(key);
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [
        { symbol: 'AAPL', companyName: 'Apple Inc.', exchange: 'NASDAQ', sector: null, industry: null, marketCap: 1_000_000_000 },
      ]));
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await adapterWithKey.fetchMetadata('AAPL');
      const allLogs = spy.mock.calls.map((args) => JSON.stringify(args)).join('');
      expect(allLogs).not.toContain(key);
    });
  });

  // ── fetchUniverse (2 tests) ───────────────────────────────────────────────

  describe('fetchUniverse', () => {
    it('always returns empty array', async () => {
      const result = await adapter.fetchUniverse(5000);
      expect(result).toEqual([]);
    });

    it('makes no HTTP call', async () => {
      await adapter.fetchUniverse(5000);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── fetchMetadata (4 tests) ───────────────────────────────────────────────

  describe('fetchMetadata', () => {
    const mockProfile = {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      exchange: 'NASDAQ',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      country: 'US',
      marketCap: 5_000_000_000_000,    // 5 trillion USD
      sharesOutstanding: 15_380_000_000,
    };

    it('returns valid StockMetadata with correct fields', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [mockProfile]));
      const result = await adapter.fetchMetadata('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('AAPL');
      expect(result!.company_name).toBe('Apple Inc.');
      expect(result!.exchange).toBe('NASDAQ');
      expect(result!.sector).toBe('Technology');
      expect(result!.industry).toBe('Consumer Electronics');
    });

    it('market_cap_millions = marketCap / 1_000_000 (5_000_000_000_000 → 5_000_000)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [mockProfile]));
      const result = await adapter.fetchMetadata('AAPL');
      expect(result!.market_cap_millions).toBe(5_000_000);
    });

    it('market_cap_usd = raw marketCap in USD; shares_outstanding from sharesOutstanding field', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [mockProfile]));
      const result = await adapter.fetchMetadata('AAPL');
      expect(result!.market_cap_usd).toBe(5_000_000_000_000);
      expect(result!.shares_outstanding).toBe(15_380_000_000);
    });

    it('returns null on 404', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(404, null));
      const result = await adapter.fetchMetadata('UNKNOWN');
      expect(result).toBeNull();
    });

    it('returns null when profile array is empty', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, []));
      const result = await adapter.fetchMetadata('UNKNOWN');
      expect(result).toBeNull();
    });
  });

  // ── fetchEODPrice (3 tests) ───────────────────────────────────────────────

  describe('fetchEODPrice', () => {
    const mockPriceArray = [
      // Flat array sorted descending — first element is most recent
      { symbol: 'AAPL', date: '2026-04-20', open: 270.0, high: 275.0, low: 269.0, close: 273.05, volume: 34000000 },
      { symbol: 'AAPL', date: '2026-04-17', open: 268.0, high: 271.0, low: 267.0, close: 270.23, volume: 31000000 },
    ];

    it('returns valid PriceData from flat array first element', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, mockPriceArray));
      const result = await adapter.fetchEODPrice('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('AAPL');
      expect(result!.close).toBe(273.05);
      expect(result!.date).toBeInstanceOf(Date);
    });

    it('returns null on empty array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, []));
      const result = await adapter.fetchEODPrice('AAPL');
      expect(result).toBeNull();
    });

    it('returns null when close is NaN', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [
        { symbol: 'AAPL', date: '2026-04-20', close: 'not-a-number' },
      ]));
      const result = await adapter.fetchEODPrice('AAPL');
      expect(result).toBeNull();
    });
  });

  // ── fetchFundamentals (6 tests) ───────────────────────────────────────────

  describe('fetchFundamentals', () => {
    // Synthetic fixture — field names verified against live AAPL response 2026-04-20
    // Two years of annual income data (descending: FY2025 at index 0, FY2024 at index 1)
    const mockIncome = [
      {
        // FY2025 (latest)
        date: '2025-09-27', symbol: 'AAPL', period: 'FY',
        revenue: 400_000_000,        // 400M full dollars → 400 millions
        netIncome: 80_000_000,       // 80M full dollars → 80 millions
        grossProfit: 160_000_000,
        operatingIncome: 120_000_000,
        ebit: 120_000_000,
        interestExpense: 3_000_000,  // interest_coverage = 120M/3M = 40
        epsDiluted: 4.00,
      },
      {
        // FY2024 (prior)
        date: '2024-09-28', symbol: 'AAPL', period: 'FY',
        revenue: 320_000_000,        // revenue_growth_yoy = (400-320)/|320|*100 = 25%
        netIncome: 60_000_000,
        grossProfit: 128_000_000,
        operatingIncome: 96_000_000,
        ebit: 96_000_000,
        interestExpense: 2_000_000,
        epsDiluted: 3.00,            // eps_growth_yoy = (4.00-3.00)/|3.00|*100 = 33.33%
      },
    ];

    const mockBalance = [
      {
        date: '2025-09-27', symbol: 'AAPL',
        totalStockholdersEquity: 50_000_000,
        totalAssets: 500_000_000,
        totalDebt: 100_000_000,                   // total_debt (Fix 6)
        cashAndCashEquivalents: 20_000_000,        // cash_and_equivalents (Fix 6)
        totalCurrentAssets: 150_000_000,
        totalCurrentLiabilities: 75_000_000,
      },
    ];

    it('returns FundamentalData with all 15 canonical fields', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(200, mockIncome))
        .mockResolvedValueOnce(mockResponse(200, mockBalance));
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('AAPL');
      expect(result!.revenue_ttm).toBe(400_000_000);    // BC-026-001: absolute USD
      expect(result!.earnings_ttm).toBe(80_000_000);    // BC-026-001: absolute USD
      expect(result!.revenue_growth_yoy).toBeCloseTo(25);
      expect(result!.gross_margin).toBeCloseTo(0.4);
      expect(result!.operating_margin).toBeCloseTo(0.3);
      expect(result!.net_margin).toBeCloseTo(0.2);
      expect(result!.interest_coverage).toBeCloseTo(40);
      expect(result!.roe).toBeCloseTo(80_000_000 / 50_000_000);
      expect(result!.roa).toBeCloseTo(80_000_000 / 500_000_000);
      expect(result!.roic).toBeCloseTo(80_000_000 / 150_000_000);
      expect(result!.debt_to_equity).toBeCloseTo(100_000_000 / 50_000_000);
      expect(result!.current_ratio).toBeCloseTo(150_000_000 / 75_000_000);
      expect(result!.trailing_pe).toBeNull();
      expect(result!.eps_growth_fwd).toBeNull();
    });

    it('eps_growth_yoy uses epsDiluted — (4.00-3.00)/|3.00|×100 ≈ 33.33%', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(200, mockIncome))
        .mockResolvedValueOnce(mockResponse(200, mockBalance));
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.eps_growth_yoy).toBeCloseTo(33.33, 1);
    });

    it('BC-026-001: revenue_ttm and earnings_ttm are absolute USD (not ÷1_000_000)', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(200, mockIncome))
        .mockResolvedValueOnce(mockResponse(200, mockBalance));
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.revenue_ttm).toBe(400_000_000);
      expect(result!.earnings_ttm).toBe(80_000_000);
    });

    it('Fix 6: total_debt and cash_and_equivalents from balance sheet', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(200, mockIncome))
        .mockResolvedValueOnce(mockResponse(200, mockBalance));
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.total_debt).toBe(100_000_000);
      expect(result!.cash_and_equivalents).toBe(20_000_000);
      expect(result!.net_debt_to_ebitda).toBeNull();
      expect(result!.fcf_ttm).toBeNull();
    });

    it('trailing_pe is always null', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(200, mockIncome))
        .mockResolvedValueOnce(mockResponse(200, mockBalance));
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result!.trailing_pe).toBeNull();
    });

    it('returns null when income statement is empty', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(200, []))
        .mockResolvedValueOnce(mockResponse(200, mockBalance));
      const result = await adapter.fetchFundamentals('AAPL');
      expect(result).toBeNull();
    });

    it('balance sheet 404 → partial FundamentalData with balance-derived fields null', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(200, mockIncome))
        .mockResolvedValueOnce(mockResponse(404, null));
      const result = await adapter.fetchFundamentals('AAPL');
      // Income-derived fields still populated
      expect(result).not.toBeNull();
      expect(result!.revenue_ttm).toBe(400_000_000); // BC-026-001: absolute USD
      expect(result!.gross_margin).toBeCloseTo(0.4);
      // Balance-sheet-derived fields null
      expect(result!.roe).toBeNull();
      expect(result!.roa).toBeNull();
      expect(result!.roic).toBeNull();
      expect(result!.debt_to_equity).toBeNull();
      expect(result!.current_ratio).toBeNull();
    });
  });

  // ── fetchForwardEstimates (5 tests) ───────────────────────────────────────

  describe('fetchForwardEstimates', () => {
    // Synthetic fixture — field names verified against live AAPL response 2026-04-20
    // Today is 2026-04-20; NTM for AAPL = FY2026 (2026-09-27)
    const mockEstimates = [
      // Descending order as returned by FMP
      { symbol: 'AAPL', date: '2028-09-27', epsAvg: 10.32, ebitAvg: 177_140_012_450, numAnalystsEps: 14 },
      { symbol: 'AAPL', date: '2027-09-27', epsAvg: 9.32,  ebitAvg: 166_614_438_749, numAnalystsEps: 15 },
      { symbol: 'AAPL', date: '2026-09-27', epsAvg: 8.49,  ebitAvg: 155_769_099_889, numAnalystsEps: 16 }, // NTM
      { symbol: 'AAPL', date: '2025-09-27', epsAvg: 7.38,  ebitAvg: 139_130_893_090, numAnalystsEps: 18 }, // past
      { symbol: 'AAPL', date: '2024-09-27', epsAvg: 6.71,  ebitAvg: 130_782_447_468, numAnalystsEps: 20 }, // past
    ];

    it('selects NTM: first future fiscal year end — 2026-09-27 on 2026-04-20 → eps_ntm=8.49', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, mockEstimates));
      const result = await adapter.fetchForwardEstimates('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ticker).toBe('AAPL');
      expect(result!.eps_ntm).toBeCloseTo(8.49);
    });

    it('402 response returns null (plan restriction)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(402, 'Restricted'));
      const result = await adapter.fetchForwardEstimates('SMALLCAP');
      expect(result).toBeNull();
    });

    it('empty array returns null', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, []));
      const result = await adapter.fetchForwardEstimates('TICKER');
      expect(result).toBeNull();
    });

    it('all three fields null → returns null', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [
        { symbol: 'AAPL', date: '2027-09-27', epsAvg: null, ebitAvg: null, estimatedRevenueAvg: null, numAnalystsEps: 0 },
      ]));
      const result = await adapter.fetchForwardEstimates('AAPL');
      expect(result).toBeNull();
    });

    it('STORY-028: ebitAvg stored as absolute USD (not divided by 1_000_000)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [
        { symbol: 'AAPL', date: '2027-09-27', epsAvg: 9.32, ebitAvg: 210_000_000_000, numAnalystsEps: 15 },
      ]));
      const result = await adapter.fetchForwardEstimates('AAPL');
      expect(result).not.toBeNull();
      expect(result!.ebit_ntm).toBe(210_000_000_000);
    });

    it('STORY-028: estimatedRevenueAvg returned as revenue_ntm in absolute USD', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, [
        { symbol: 'AAPL', date: '2027-09-27', epsAvg: 9.32, ebitAvg: null, estimatedRevenueAvg: 415_000_000_000, numAnalystsEps: 15 },
      ]));
      const result = await adapter.fetchForwardEstimates('AAPL');
      expect(result).not.toBeNull();
      expect(result!.revenue_ntm).toBe(415_000_000_000);
    });
  });
});
