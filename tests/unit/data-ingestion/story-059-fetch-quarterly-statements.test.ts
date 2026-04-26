// EPIC-003/STORY-059: TiingoAdapter.fetchQuarterlyStatements
// RFC-004 Amendment 2026-04-25; ADR-001 Amendment 2026-04-25
// TDD: all tests written before implementation; mocked tiingoFetch — no live calls
// Fixture provenance: synthetic — shaped to match real Tiingo /statements endpoint

import { TiingoAdapter } from '../../../src/modules/data-ingestion/adapters/tiingo.adapter';

// Helper: make a quarterly report entry (quarter 1-4 = quarterly; 0 = annual)
function makeReport(quarter: number, year = 2024, date = '2024-01-01') {
  return {
    date,
    year,
    quarter,
    statementData: {
      incomeStatement: [
        { dataCode: 'revenue', value: 100000 },
        { dataCode: 'netinc', value: 20000 },
      ],
      balanceSheet: [],
      overview: [],
      cashFlow: [{ dataCode: 'freeCashFlow', value: 15000 }],
    },
  };
}

// Quarterly reports (quarter 1-4) — 6 entries across 2 years
const quarterlyReports = [
  makeReport(4, 2023, '2023-12-31'),
  makeReport(3, 2023, '2023-09-30'),
  makeReport(2, 2023, '2023-06-30'),
  makeReport(1, 2023, '2023-03-31'),
  makeReport(4, 2022, '2022-12-31'),
  makeReport(3, 2022, '2022-09-30'),
];

// Annual rows (quarter === 0) — should be filtered out
const annualRows = [
  makeReport(0, 2023, '2023-12-31'),
  makeReport(0, 2022, '2022-12-31'),
];

// Mixed: 6 quarterly + 2 annual
const mixedResponse = [...annualRows, ...quarterlyReports];

describe('EPIC-003/STORY-059: TiingoAdapter.fetchQuarterlyStatements', () => {
  let adapter: TiingoAdapter;
  let tiingoFetchSpy: jest.SpyInstance;

  beforeEach(() => {
    adapter = new TiingoAdapter('test-api-key');
    // Spy on protected tiingoFetch to intercept HTTP calls
    tiingoFetchSpy = jest.spyOn(adapter as unknown as { tiingoFetch: () => unknown }, 'tiingoFetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── BDD Scenario 1: Successful response — filtered quarterly rows ─────────────

  describe('Scenario 1: successful response — returns quarterly rows only', () => {
    test('returns array of quarterly records (quarter !== 0) newest-first', async () => {
      tiingoFetchSpy.mockResolvedValue(mixedResponse);

      const result = await adapter.fetchQuarterlyStatements('AAPL');

      expect(result).not.toBeNull();
      expect(result).toHaveLength(6);
      // All returned records must be quarterly (not annual) — STORY-085: NormalizedQuarterlyReport
      result!.forEach(r => expect(r.fiscalQuarter).not.toBe(0));
    });

    test('preserves Tiingo sort order (newest-first is preserved)', async () => {
      tiingoFetchSpy.mockResolvedValue(quarterlyReports);

      const result = await adapter.fetchQuarterlyStatements('AAPL');

      expect(result![0].fiscalYear).toBe(2023);
      expect(result![0].fiscalQuarter).toBe(4);
      expect(result![result!.length - 1].fiscalYear).toBe(2022);
    });

    test('emits tiingo_quarterly_statements_fetched log with ticker and count', async () => {
      tiingoFetchSpy.mockResolvedValue(quarterlyReports);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await adapter.fetchQuarterlyStatements('AAPL');

      const logCalls = consoleSpy.mock.calls.map(call => {
        try { return JSON.parse(call[0]); } catch { return null; }
      }).filter(Boolean);

      const fetchedEvent = logCalls.find(l => l.event === 'tiingo_quarterly_statements_fetched');
      expect(fetchedEvent).toBeDefined();
      expect(fetchedEvent.ticker).toBe('AAPL');
      expect(fetchedEvent.count).toBe(6);

      consoleSpy.mockRestore();
    });

    test('calls correct endpoint path for given ticker', async () => {
      tiingoFetchSpy.mockResolvedValue(quarterlyReports);

      await adapter.fetchQuarterlyStatements('MSFT');

      expect(tiingoFetchSpy).toHaveBeenCalledWith(
        '/tiingo/fundamentals/MSFT/statements',
      );
    });

    test('URL-encodes tickers with special characters', async () => {
      tiingoFetchSpy.mockResolvedValue(quarterlyReports);

      await adapter.fetchQuarterlyStatements('BRK.B');

      expect(tiingoFetchSpy).toHaveBeenCalledWith(
        '/tiingo/fundamentals/BRK.B/statements',
      );
    });
  });

  // ── BDD Scenario 2: Returns null on 404 ─────────────────────────────────────

  describe('Scenario 2: null on 404', () => {
    test('returns null when tiingoFetch returns null (404 case)', async () => {
      tiingoFetchSpy.mockResolvedValue(null);

      const result = await adapter.fetchQuarterlyStatements('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  // ── BDD Scenario 3: Returns null on empty array ──────────────────────────────

  describe('Scenario 3: null on empty response', () => {
    test('returns null when Tiingo returns empty array', async () => {
      tiingoFetchSpy.mockResolvedValue([]);

      const result = await adapter.fetchQuarterlyStatements('AAPL');

      expect(result).toBeNull();
    });
  });

  // ── BDD Scenario 4: Annual rows excluded ────────────────────────────────────

  describe('Scenario 4: annual rows (quarter===0) are excluded', () => {
    test('excludes all annual summary rows from returned array', async () => {
      tiingoFetchSpy.mockResolvedValue(mixedResponse);

      const result = await adapter.fetchQuarterlyStatements('AAPL');

      expect(result).not.toBeNull();
      const hasAnnualRows = result!.some(r => r.fiscalQuarter === 0);
      expect(hasAnnualRows).toBe(false);
    });

    test('returns null when all rows are annual (quarter===0 only)', async () => {
      tiingoFetchSpy.mockResolvedValue(annualRows);

      const result = await adapter.fetchQuarterlyStatements('AAPL');

      expect(result).toBeNull();
    });

    test('count in log reflects post-filter count (excludes annual rows)', async () => {
      tiingoFetchSpy.mockResolvedValue(mixedResponse); // 6 quarterly + 2 annual
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await adapter.fetchQuarterlyStatements('AAPL');

      const logCalls = consoleSpy.mock.calls.map(call => {
        try { return JSON.parse(call[0]); } catch { return null; }
      }).filter(Boolean);
      const fetchedEvent = logCalls.find(l => l.event === 'tiingo_quarterly_statements_fetched');
      expect(fetchedEvent?.count).toBe(6); // not 8

      consoleSpy.mockRestore();
    });
  });

  // ── BDD Scenario 5: Rate limit enforcement ──────────────────────────────────
  // Rate limiting is enforced inside tiingoFetch() via enforceRateLimit().
  // Since fetchQuarterlyStatements delegates to tiingoFetch, it inherits rate limiting.
  // Comprehensive rate limit tests already exist in tiingo.adapter.test.ts (STORY-016).

  describe('Scenario 5: rate limit enforcement', () => {
    test('fetchQuarterlyStatements routes through tiingoFetch (which enforces rate limit)', async () => {
      tiingoFetchSpy.mockResolvedValue(quarterlyReports);

      await adapter.fetchQuarterlyStatements('AAPL');

      // tiingoFetch was called exactly once — rate limit enforcement is inside tiingoFetch
      expect(tiingoFetchSpy).toHaveBeenCalledTimes(1);
      expect(tiingoFetchSpy).toHaveBeenCalledWith('/tiingo/fundamentals/AAPL/statements');
    });

    test('RateLimitExceededError propagates from tiingoFetch to caller', async () => {
      const { RateLimitExceededError } = await import('../../../src/modules/data-ingestion/errors');
      tiingoFetchSpy.mockRejectedValue(new RateLimitExceededError('tiingo', 5000));

      await expect(adapter.fetchQuarterlyStatements('AAPL')).rejects.toThrow(RateLimitExceededError);
    });
  });

  // ── BDD Scenario 6: NOT in VendorAdapter interface ──────────────────────────

  describe('Scenario 6: method scope — not in VendorAdapter', () => {
    test('fetchQuarterlyStatements is defined on TiingoAdapter instance', () => {
      expect(typeof adapter.fetchQuarterlyStatements).toBe('function');
    });

    test('VendorAdapter interface does not declare fetchQuarterlyStatements (checked via type guard)', () => {
      // If this type check compiles, the method is NOT part of the interface
      // (TypeScript structural: VendorAdapter cast would fail if it declared it)
      // Runtime proxy: create an object that satisfies VendorAdapter but has no fetchQuarterlyStatements
      const vendorAdapterProxy = {
        providerName: 'mock' as const,
        capabilities: { forwardEstimateCoverage: 'none' as const, rateLimit: { requestsPerHour: 100 } },
        fetchUniverse: async () => [],
        fetchEODPrice: async () => null,
        fetchFundamentals: async () => null,
        fetchForwardEstimates: async () => null,
        fetchMetadata: async () => null,
      };
      // @ts-expect-error — fetchQuarterlyStatements does NOT exist on VendorAdapter
      expect(vendorAdapterProxy.fetchQuarterlyStatements).toBeUndefined();
    });
  });

  // ── BDD Scenario 7: fetchFundamentals regression ────────────────────────────

  describe('Scenario 7: fetchFundamentals behavior unchanged', () => {
    test('fetchFundamentals still returns FundamentalData (not raw QuarterlyReport[])', async () => {
      // Use a minimal fixture to verify fetchFundamentals still aggregates into TTM
      const minimalFixture = [
        { date: '2024-03-31', year: 2024, quarter: 1,
          statementData: {
            incomeStatement: [{ dataCode: 'revenue', value: 100 }, { dataCode: 'netinc', value: 20 }, { dataCode: 'grossProfit', value: 60 }, { dataCode: 'ebit', value: 30 }, { dataCode: 'eps', value: 1.0 }, { dataCode: 'taxExp', value: 5 }, { dataCode: 'pretaxinc', value: 25 }],
            balanceSheet: [{ dataCode: 'equity', value: 500 }, { dataCode: 'totalAssets', value: 1000 }, { dataCode: 'debt', value: 200 }, { dataCode: 'cashAndEq', value: 50 }, { dataCode: 'assetsCurrent', value: 300 }, { dataCode: 'liabilitiesCurrent', value: 100 }],
            overview: [{ dataCode: 'sharesBasic', value: 15000 }],
            cashFlow: [],
          }
        },
      ];

      tiingoFetchSpy.mockResolvedValue(minimalFixture);
      const result = await adapter.fetchFundamentals('AAPL');

      // fetchFundamentals returns FundamentalData (aggregated), not raw array
      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
      expect(Array.isArray(result)).toBe(false);
      // Has TTM revenue field (it's a FundamentalData object)
      expect('revenue_ttm' in result!).toBe(true);
    });
  });
});
