// EPIC-003/STORY-060: Quarterly History Sync Service
// STORY-085: Updated fixtures to NormalizedQuarterlyReport; mock uses QuarterlyAdapter interface
// RFC-008 §Ingestion Sync Architecture; ADR-016 §Primary Trigger
// TDD: all tests written first; Prisma and adapter fully mocked

import { syncQuarterlyHistory } from '../../../src/modules/data-ingestion/jobs/quarterly-history-sync.service';
import type { QuarterlyAdapter } from '../../../src/modules/data-ingestion/jobs/quarterly-history-sync.service';

// ── Mock Prisma ──────────────────────────────────────────────────────────────
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockUpsert = jest.fn();

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    stockQuarterlyHistory: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

// ── Mock QuarterlyAdapter ────────────────────────────────────────────────────
const mockFetchQuarterlyStatements = jest.fn();
const mockTiingo: QuarterlyAdapter = {
  providerName: 'tiingo',
  fetchQuarterlyStatements: mockFetchQuarterlyStatements,
};

// ── Fixtures — NormalizedQuarterlyReport (flat format, STORY-085) ─────────────

function makeQuarterlyReport(opts: {
  quarter: number;
  year: number;
  date: string;
  revenue?: number | null;
  grossProfit?: number | null;
  netInc?: number | null;
  fcf?: number | null;
  cfo?: number | null;
}) {
  return {
    date:                        opts.date,
    fiscalYear:                  opts.year,
    fiscalQuarter:               opts.quarter,
    revenue:                     opts.revenue ?? null,
    grossProfit:                 opts.grossProfit ?? null,
    operatingIncome:             null,
    netIncome:                   opts.netInc ?? null,
    capex:                       null,
    cashFromOperations:          opts.cfo ?? null,
    freeCashFlow:                opts.fcf ?? null,
    shareBasedCompensation:      null,
    depreciationAndAmortization: null,
    dilutedSharesOutstanding:    null,
  };
}

const eightQuarters = [
  makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 94930, grossProfit: 43881, netInc: 21448, fcf: 23800, cfo: 26800 }),
  makeQuarterlyReport({ quarter: 3, year: 2024, date: '2024-07-25', revenue: 85777, grossProfit: 39669, netInc: 19881, fcf: 22600, cfo: 25200 }),
  makeQuarterlyReport({ quarter: 2, year: 2024, date: '2024-04-30', revenue: 90753, grossProfit: 42270, netInc: 23636, fcf: 27498, cfo: 28200 }),
  makeQuarterlyReport({ quarter: 1, year: 2024, date: '2024-01-29', revenue: 119575, grossProfit: 54855, netInc: 33916, fcf: 35984, cfo: 39900 }),
  makeQuarterlyReport({ quarter: 4, year: 2023, date: '2023-10-26', revenue: 89498, grossProfit: 40427, netInc: 22956, fcf: 21000, cfo: 24000 }),
  makeQuarterlyReport({ quarter: 3, year: 2023, date: '2023-07-27', revenue: 81797, grossProfit: 36413, netInc: 19881, fcf: 19800, cfo: 22000 }),
  makeQuarterlyReport({ quarter: 2, year: 2023, date: '2023-04-27', revenue: 94836, grossProfit: 41985, netInc: 24160, fcf: 28500, cfo: 30000 }),
  makeQuarterlyReport({ quarter: 1, year: 2023, date: '2023-01-26', revenue: 117154, grossProfit: 52591, netInc: 29998, fcf: 34000, cfo: 36000 }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockFindFirst.mockResolvedValue(null); // no stored rows by default
});

describe('EPIC-003/STORY-060: syncQuarterlyHistory', () => {

  // ── Scenario 1: New quarter — full upsert triggered ──────────────────────────

  describe('Scenario 1: new quarter detected → full upsert', () => {
    test('upserts all returned quarters when no stored rows exist', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFindFirst.mockResolvedValue(null);
      mockFetchQuarterlyStatements.mockResolvedValue(eightQuarters);

      const result = await syncQuarterlyHistory(mockTiingo);

      expect(result.stocks_processed).toBe(1);
      expect(result.stocks_updated).toBe(1);
      expect(result.quarters_upserted).toBe(8);
      expect(result.stocks_skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    test('upsert is called for each quarter with correct ticker and period key', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFindFirst.mockResolvedValue(null);
      mockFetchQuarterlyStatements.mockResolvedValue(eightQuarters);

      await syncQuarterlyHistory(mockTiingo);

      expect(mockUpsert).toHaveBeenCalledTimes(8);
      const firstCall = mockUpsert.mock.calls[0][0];
      expect(firstCall.where.uq_sqh_ticker_period_provider.ticker).toBe('AAPL');
      expect(firstCall.where.uq_sqh_ticker_period_provider.sourceProvider).toBe('tiingo');
    });
  });

  // ── Scenario 2: Reported date unchanged → skip ───────────────────────────────

  describe('Scenario 2: unchanged reported_date → skip', () => {
    test('skips stock when Tiingo reported_date matches stored row', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'MSFT' }]);
      mockFindFirst.mockResolvedValue({ reportedDate: new Date('2024-10-28') });
      mockFetchQuarterlyStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 1000, grossProfit: 600, netInc: 200 }),
      ]);

      const result = await syncQuarterlyHistory(mockTiingo);

      expect(result.stocks_skipped).toBe(1);
      expect(result.stocks_updated).toBe(0);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 3: New reported date → upsert all ───────────────────────────────

  describe('Scenario 3: new reported_date → upsert all quarters', () => {
    test('upserts all quarters when Tiingo date is newer than stored date', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'MSFT' }]);
      mockFindFirst.mockResolvedValue({ reportedDate: new Date('2024-07-25') });
      mockFetchQuarterlyStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 1000, grossProfit: 600, netInc: 200 }),
        makeQuarterlyReport({ quarter: 3, year: 2024, date: '2024-07-25', revenue: 900, grossProfit: 500, netInc: 180 }),
      ]);

      const result = await syncQuarterlyHistory(mockTiingo);

      expect(result.stocks_updated).toBe(1);
      expect(result.quarters_upserted).toBe(2);
    });
  });

  // ── Scenario 4: Tiingo returns null → skip gracefully ───────────────────────

  describe('Scenario 4: Tiingo returns null (404) → skip gracefully', () => {
    test('skips stock with no error when Tiingo returns null', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'TSLA' }]);
      mockFetchQuarterlyStatements.mockResolvedValue(null);

      const result = await syncQuarterlyHistory(mockTiingo);

      expect(result.stocks_skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    test('skips stock when Tiingo returns empty array', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'TSLA' }]);
      mockFetchQuarterlyStatements.mockResolvedValue([]);

      const result = await syncQuarterlyHistory(mockTiingo);

      expect(result.stocks_skipped).toBe(1);
      expect(result.errors).toBe(0);
    });
  });

  // ── Scenario 5: forceFullScan bypasses change detection ─────────────────────

  describe('Scenario 5: forceFullScan=true bypasses reported_date comparison', () => {
    test('upserts even when stored reported_date matches Tiingo date', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'MSFT' }]);
      mockFindFirst.mockResolvedValue({ reportedDate: new Date('2024-10-28') });
      mockFetchQuarterlyStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 1000, grossProfit: 600, netInc: 200 }),
      ]);

      const result = await syncQuarterlyHistory(mockTiingo, { forceFullScan: true });

      expect(result.stocks_updated).toBe(1);
      expect(result.quarters_upserted).toBe(1);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    test('findFirst (DB query for stored date) is NOT called when forceFullScan=true', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'MSFT' }]);
      mockFetchQuarterlyStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 1000, grossProfit: 600, netInc: 200 }),
      ]);

      await syncQuarterlyHistory(mockTiingo, { forceFullScan: true });

      expect(mockFindFirst).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 6: Per-quarter derived margins computed inline ──────────────────

  describe('Scenario 6: inline derived margin computation', () => {
    test('gross_margin computed correctly when revenue and grossProfit present', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFindFirst.mockResolvedValue(null);
      mockFetchQuarterlyStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 100, grossProfit: 46, netInc: 20, fcf: 15, cfo: 25 }),
      ]);

      await syncQuarterlyHistory(mockTiingo);

      const upsertCall = mockUpsert.mock.calls[0][0];
      const payload = upsertCall.create;
      expect(Number(payload.grossMargin)).toBeCloseTo(0.46, 4);
      expect(Number(payload.netMargin)).toBeCloseTo(0.20, 4);
      expect(Number(payload.fcfMargin)).toBeCloseTo(0.15, 4);
    });

    test('gross_margin is null when revenue is absent (no DataCode)', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFindFirst.mockResolvedValue(null);
      // No revenue in fixture
      mockFetchQuarterlyStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', grossProfit: 46, netInc: 20 }),
      ]);

      await syncQuarterlyHistory(mockTiingo);

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.grossMargin).toBeNull();
      expect(payload.netMargin).toBeNull();
    });

    test('cfo_to_net_income_ratio is null when net_income is zero', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFindFirst.mockResolvedValue(null);
      mockFetchQuarterlyStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 100, netInc: 0, cfo: 25 }),
      ]);

      await syncQuarterlyHistory(mockTiingo);

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.cfoToNetIncomeRatio).toBeNull();
    });
  });

  // ── Scenario 7: All 10 raw fields written; NULL for absent DataCode ──────────

  describe('Scenario 7: raw field NULL for absent DataCode', () => {
    test('revenue is null when field absent; not zero', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFindFirst.mockResolvedValue(null);
      // NormalizedQuarterlyReport with all-null fields (STORY-085)
      mockFetchQuarterlyStatements.mockResolvedValue([{
        date: '2024-10-28',
        fiscalYear: 2024,
        fiscalQuarter: 4,
        revenue: null, grossProfit: null, operatingIncome: null, netIncome: null,
        capex: null, cashFromOperations: null, freeCashFlow: null,
        shareBasedCompensation: null, depreciationAndAmortization: null, dilutedSharesOutstanding: null,
      }]);

      await syncQuarterlyHistory(mockTiingo);

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.revenue).toBeNull();
      expect(payload.grossProfit).toBeNull();
      expect(payload.operatingIncome).toBeNull();
      expect(payload.netIncome).toBeNull();
      expect(payload.freeCashFlow).toBeNull();
      expect(payload.cashFromOperations).toBeNull();
    });
  });

  // ── Scenario 8: Per-stock error isolation ───────────────────────────────────

  describe('Scenario 8: per-stock error isolation', () => {
    test('one stock error does not halt batch; errors counter incremented', async () => {
      mockFindMany.mockResolvedValue([
        { ticker: 'AAPL' },
        { ticker: 'ERRSTOCK' },
        { ticker: 'MSFT' },
      ]);
      mockFindFirst.mockResolvedValue(null);
      mockFetchQuarterlyStatements
        .mockResolvedValueOnce(eightQuarters.slice(0, 2))
        .mockRejectedValueOnce(new Error('Tiingo network error'))
        .mockResolvedValueOnce(eightQuarters.slice(0, 2));

      const result = await syncQuarterlyHistory(mockTiingo);

      expect(result.stocks_processed).toBe(3);
      expect(result.stocks_updated).toBe(2);
      expect(result.errors).toBe(1);
    });
  });

  // ── Scenario 9: Summary object shape ─────────────────────────────────────────

  describe('Scenario 9: summary object has all 6 required fields', () => {
    test('result always contains all required summary fields', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await syncQuarterlyHistory(mockTiingo);

      expect(result).toHaveProperty('stocks_processed');
      expect(result).toHaveProperty('stocks_updated');
      expect(result).toHaveProperty('quarters_upserted');
      expect(result).toHaveProperty('stocks_skipped');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration_ms');
      expect(typeof result.duration_ms).toBe('number');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Scenario 10: Only in_universe=true stocks processed ─────────────────────

  describe('Scenario 10: only in-universe stocks processed', () => {
    test('findMany query filters by inUniverse=true', async () => {
      mockFindMany.mockResolvedValue([]);

      await syncQuarterlyHistory(mockTiingo);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ inUniverse: true }),
        }),
      );
    });

    test('tickerFilter narrows to single stock', async () => {
      mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFetchQuarterlyStatements.mockResolvedValue(null);

      await syncQuarterlyHistory(mockTiingo, { tickerFilter: 'AAPL' });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ inUniverse: true, ticker: 'AAPL' }),
        }),
      );
    });
  });
});
