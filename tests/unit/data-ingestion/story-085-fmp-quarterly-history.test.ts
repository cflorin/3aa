// EPIC-003/STORY-085: FMP Quarterly History Sync
// TDD: FMPAdapter.fetchQuarterlyStatements — all tests written first
// Validates field mapping: FMP 'ebit' → operatingIncome, parallel income+cashflow calls,
// fiscalYear from FMP field, NormalizedQuarterlyReport shape.

import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';

// ── Mock fmpFetch ─────────────────────────────────────────────────────────────
const mockFmpFetch = jest.fn();

jest.mock('../../../src/modules/data-ingestion/adapters/fmp.adapter', () => {
  const actual = jest.requireActual('../../../src/modules/data-ingestion/adapters/fmp.adapter');
  return {
    ...actual,
    FMPAdapter: class extends actual.FMPAdapter {
      protected async fmpFetch(path: string) {
        return mockFmpFetch(path);
      }
    },
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeIncomeRow(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-01-25',
    period: 'Q4',
    fiscalYear: 2026,
    revenue: 68127000000,
    grossProfit: 51093000000,
    ebit: 50471000000,
    operatingIncome: 44299000000,
    netIncome: 42960000000,
    depreciationAndAmortization: 812000000,
    weightedAverageShsOutDil: 24432000000,
    ...overrides,
  };
}

function makeCashFlowRow(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-01-25',
    period: 'Q4',
    capitalExpenditure: -1284000000,
    operatingCashFlow: 36188000000,
    freeCashFlow: 34904000000,
    stockBasedCompensation: 1633000000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EPIC-003/STORY-085: FMPAdapter.fetchQuarterlyStatements', () => {

  // ── Scenario 1: Successful response — correct field mapping ──────────────────

  describe('Scenario 1: successful fetch — NormalizedQuarterlyReport shape', () => {
    test('returns NormalizedQuarterlyReport[] with correct field mapping', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow()])
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);

      const r = result![0];
      expect(r.date).toBe('2026-01-25');
      expect(r.fiscalYear).toBe(2026);
      expect(r.fiscalQuarter).toBe(4);
      expect(r.revenue).toBe(68127000000);
      expect(r.grossProfit).toBe(51093000000);
      // ebit field (not operatingIncome) → operatingIncome in normalized type
      expect(r.operatingIncome).toBe(50471000000);
      expect(r.netIncome).toBe(42960000000);
      expect(r.depreciationAndAmortization).toBe(812000000);
      expect(r.dilutedSharesOutstanding).toBe(24432000000);
    });

    test('cash flow fields populated from parallel cash-flow call matched by date', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow()])
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      const r = result![0];
      expect(r.capex).toBe(-1284000000);
      expect(r.cashFromOperations).toBe(36188000000);
      expect(r.freeCashFlow).toBe(34904000000);
      expect(r.shareBasedCompensation).toBe(1633000000);
    });

    test('makes two parallel API calls: income-statement and cash-flow-statement', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow()])
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const adapter = new FMPAdapter('test-key');
      await adapter.fetchQuarterlyStatements('AAPL');

      expect(mockFmpFetch).toHaveBeenCalledTimes(2);
      expect(mockFmpFetch).toHaveBeenCalledWith(expect.stringContaining('income-statement'));
      expect(mockFmpFetch).toHaveBeenCalledWith(expect.stringContaining('cash-flow-statement'));
    });

    test('both calls include period=quarter and limit=8', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow()])
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const adapter = new FMPAdapter('test-key');
      await adapter.fetchQuarterlyStatements('MSFT');

      const calls = mockFmpFetch.mock.calls.map((c: unknown[]) => c[0] as string);
      calls.forEach(path => {
        expect(path).toContain('period=quarter');
        expect(path).toContain('limit=8');
      });
    });
  });

  // ── Scenario 2: FMP ebit is the correct operatingIncome mapping ──────────────

  describe('Scenario 2: FMP ebit → operatingIncome (not FMP operatingIncome field)', () => {
    test('uses FMP ebit field (50.47B) not FMP operatingIncome field (44.30B)', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow({ ebit: 50471000000, operatingIncome: 44299000000 })])
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      expect(result![0].operatingIncome).toBe(50471000000);
      expect(result![0].operatingIncome).not.toBe(44299000000);
    });
  });

  // ── Scenario 3: fiscalYear derived from FMP field, falls back to date year ────

  describe('Scenario 3: fiscalYear from FMP field', () => {
    test('uses FMP fiscalYear field when present', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow({ date: '2026-01-25', fiscalYear: 2026 })])
        .mockResolvedValueOnce([]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      expect(result![0].fiscalYear).toBe(2026);
    });

    test('falls back to calendar year from date when fiscalYear is null', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow({ date: '2025-12-31', fiscalYear: null })])
        .mockResolvedValueOnce([]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('MSFT');

      expect(result![0].fiscalYear).toBe(2025);
    });
  });

  // ── Scenario 4: null on empty / error responses ──────────────────────────────

  describe('Scenario 4: null when income statement unavailable', () => {
    test('returns null when income statement returns null (402 plan restriction)', async () => {
      mockFmpFetch
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('UNKNOWN');

      expect(result).toBeNull();
    });

    test('returns null when income statement returns empty array', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  // ── Scenario 5: null cash flow fields when cash flow unavailable ─────────────

  describe('Scenario 5: cash flow fields null when cash flow unavailable', () => {
    test('capex, cfo, fcf, sbc are null when cash flow returns null', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow()])
        .mockResolvedValueOnce(null);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      expect(result).not.toBeNull();
      const r = result![0];
      expect(r.capex).toBeNull();
      expect(r.cashFromOperations).toBeNull();
      expect(r.freeCashFlow).toBeNull();
      expect(r.shareBasedCompensation).toBeNull();
    });
  });

  // ── Scenario 6: multiple quarters, date-matched cash flow ────────────────────

  describe('Scenario 6: multiple quarters — cash flow matched by date', () => {
    test('matches cash flow rows to income rows by date', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([
          makeIncomeRow({ date: '2026-01-25', period: 'Q4', fiscalYear: 2026, ebit: 50471000000 }),
          makeIncomeRow({ date: '2025-10-26', period: 'Q3', fiscalYear: 2026, ebit: 38000000000 }),
        ])
        .mockResolvedValueOnce([
          makeCashFlowRow({ date: '2026-01-25', freeCashFlow: 34904000000 }),
          makeCashFlowRow({ date: '2025-10-26', freeCashFlow: 30000000000 }),
        ]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      expect(result).toHaveLength(2);
      expect(result![0].freeCashFlow).toBe(34904000000);
      expect(result![1].freeCashFlow).toBe(30000000000);
      expect(result![0].operatingIncome).toBe(50471000000);
      expect(result![1].operatingIncome).toBe(38000000000);
    });

    test('returns null freeCashFlow when cash flow date does not match income date', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow({ date: '2026-01-25' })])
        .mockResolvedValueOnce([makeCashFlowRow({ date: '2026-01-20' })]); // different date

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      expect(result![0].freeCashFlow).toBeNull();
    });
  });

  // ── Scenario 7: period parsing — invalid entries skipped ────────────────────

  describe('Scenario 7: invalid period entries skipped', () => {
    test('skips income rows with non-quarterly period field', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([
          makeIncomeRow({ period: 'FY' }),   // annual — skip
          makeIncomeRow({ period: 'Q2' }),   // quarterly — keep
        ])
        .mockResolvedValueOnce([]);

      const adapter = new FMPAdapter('test-key');
      const result = await adapter.fetchQuarterlyStatements('NVDA');

      expect(result).toHaveLength(1);
      expect(result![0].fiscalQuarter).toBe(2);
    });
  });

  // ── Scenario 8: log event emitted ───────────────────────────────────────────

  describe('Scenario 8: log event on success', () => {
    test('emits fmp_quarterly_statements_fetched with ticker and count', async () => {
      mockFmpFetch
        .mockResolvedValueOnce([makeIncomeRow()])
        .mockResolvedValueOnce([makeCashFlowRow()]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const adapter = new FMPAdapter('test-key');
      await adapter.fetchQuarterlyStatements('NVDA');

      const logCalls = consoleSpy.mock.calls
        .map(call => { try { return JSON.parse(call[0]); } catch { return null; } })
        .filter(Boolean);
      const evt = logCalls.find((l: { event: string }) => l.event === 'fmp_quarterly_statements_fetched');
      expect(evt).toBeDefined();
      expect(evt.ticker).toBe('NVDA');
      expect(evt.count).toBe(1);

      consoleSpy.mockRestore();
    });
  });
});
