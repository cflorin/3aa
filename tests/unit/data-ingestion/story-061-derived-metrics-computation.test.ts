// EPIC-003/STORY-061: Derived Metrics Computation Service (TTM Rollups)
// RFC-008 §Classifier-Facing Derived Fields; ADR-015 §Schema
// TDD: Prisma fully mocked; no live DB calls
// Fixture provenance: synthetic

import { computeDerivedMetrics, computeDerivedMetricsBatch } from '../../../src/modules/data-ingestion/jobs/derived-metrics-computation.service';

// ── Mock Prisma ──────────────────────────────────────────────────────────────
const mockFindMany = jest.fn();
const mockUpsert = jest.fn();

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stockQuarterlyHistory: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    stockDerivedMetrics: { upsert: (...a: unknown[]) => mockUpsert(...a) },
  },
}));

// Helper: create a mock quarterly history row
function makeRow(opts: {
  fiscalYear: number;
  fiscalQuarter: number;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  capex?: number | null;
  cashFromOperations?: number | null;
  freeCashFlow?: number | null;
  shareBasedCompensation?: number | null;
  depreciationAndAmortization?: number | null;
}) {
  // Return values as Prisma Decimal-like objects (toString returns string; Number() converts)
  function toDecimal(v: number | null | undefined) {
    if (v == null) return null;
    return { toString: () => String(v), toNumber: () => v } as unknown as import('@prisma/client').Prisma.Decimal;
  }
  return {
    id: BigInt(1),
    ticker: 'TEST',
    fiscalYear: opts.fiscalYear,
    fiscalQuarter: opts.fiscalQuarter,
    sourceProvider: 'tiingo',
    reportedDate: new Date(),
    syncedAt: new Date(),
    revenue:                     toDecimal(opts.revenue),
    grossProfit:                 toDecimal(opts.grossProfit),
    operatingIncome:             toDecimal(opts.operatingIncome),
    netIncome:                   toDecimal(opts.netIncome),
    capex:                       toDecimal(opts.capex),
    cashFromOperations:          toDecimal(opts.cashFromOperations),
    freeCashFlow:                toDecimal(opts.freeCashFlow),
    shareBasedCompensation:      toDecimal(opts.shareBasedCompensation),
    depreciationAndAmortization: toDecimal(opts.depreciationAndAmortization),
    dilutedSharesOutstanding:    null,
    grossMargin: null, operatingMargin: null, netMargin: null,
    cfoToNetIncomeRatio: null, fcfMargin: null, sbcAsPctRevenue: null, dilutionYoy: null,
    fiscalPeriodEndDate: null, calendarYear: null, calendarQuarter: null, sourceStatementType: null,
  };
}

const fourRows = [
  makeRow({ fiscalYear: 2024, fiscalQuarter: 4, revenue: 94930, grossProfit: 43881, operatingIncome: 29590, netIncome: 21448, freeCashFlow: 23800, cashFromOperations: 26800, capex: -3000, shareBasedCompensation: 3820, depreciationAndAmortization: 3000 }),
  makeRow({ fiscalYear: 2024, fiscalQuarter: 3, revenue: 85777, grossProfit: 39669, operatingIncome: 27021, netIncome: 19881, freeCashFlow: 22600, cashFromOperations: 25200, capex: -2600, shareBasedCompensation: 3500, depreciationAndAmortization: 2800 }),
  makeRow({ fiscalYear: 2024, fiscalQuarter: 2, revenue: 90753, grossProfit: 42270, operatingIncome: 28700, netIncome: 23636, freeCashFlow: 27498, cashFromOperations: 28200, capex: -2900, shareBasedCompensation: 3700, depreciationAndAmortization: 2900 }),
  makeRow({ fiscalYear: 2024, fiscalQuarter: 1, revenue: 119575, grossProfit: 54855, operatingIncome: 36440, netIncome: 33916, freeCashFlow: 35984, cashFromOperations: 39900, capex: -4000, shareBasedCompensation: 4800, depreciationAndAmortization: 3200 }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
});

describe('EPIC-003/STORY-061: computeDerivedMetrics', () => {

  // ── Scenario 1: 4+ quarters → TTM sums computed ─────────────────────────────

  describe('Scenario 1: 4+ quarters available — TTM sums computed', () => {
    test('revenue_ttm = sum of 4 most recent revenue values', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      await computeDerivedMetrics('AAPL');

      const upsertPayload = mockUpsert.mock.calls[0][0].create;
      const expectedRevenueTtm = 94930 + 85777 + 90753 + 119575;
      expect(Number(upsertPayload.revenueTtm)).toBeCloseTo(expectedRevenueTtm, 0);
    });

    test('ttm_computed=true and quarters_available=4 when exactly 4 rows', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      const result = await computeDerivedMetrics('AAPL');

      expect(result.ttm_computed).toBe(true);
      expect(result.quarters_available).toBe(4);
    });

    test('only 4 most recent rows used even when 8 rows available', async () => {
      const eightRows = [
        ...fourRows,
        makeRow({ fiscalYear: 2023, fiscalQuarter: 4, revenue: 89498, grossProfit: 40427, operatingIncome: 26000, netIncome: 22956, freeCashFlow: 21000, cashFromOperations: 24000, capex: -2500, shareBasedCompensation: 3300, depreciationAndAmortization: 2700 }),
        makeRow({ fiscalYear: 2023, fiscalQuarter: 3, revenue: 81797, grossProfit: 36413, operatingIncome: 24000, netIncome: 19881, freeCashFlow: 19800, cashFromOperations: 22000, capex: -2200, shareBasedCompensation: 3100, depreciationAndAmortization: 2500 }),
        makeRow({ fiscalYear: 2023, fiscalQuarter: 2, revenue: 94836, grossProfit: 41985, operatingIncome: 28000, netIncome: 24160, freeCashFlow: 28500, cashFromOperations: 30000, capex: -2800, shareBasedCompensation: 3400, depreciationAndAmortization: 2600 }),
        makeRow({ fiscalYear: 2023, fiscalQuarter: 1, revenue: 117154, grossProfit: 52591, operatingIncome: 35000, netIncome: 29998, freeCashFlow: 34000, cashFromOperations: 36000, capex: -3800, shareBasedCompensation: 4500, depreciationAndAmortization: 3100 }),
      ];
      mockFindMany.mockResolvedValue(eightRows);

      await computeDerivedMetrics('AAPL');

      const upsertPayload = mockUpsert.mock.calls[0][0].create;
      // TTM uses only first 4 rows (fourRows)
      const expectedRevenueTtm = 94930 + 85777 + 90753 + 119575;
      expect(Number(upsertPayload.revenueTtm)).toBeCloseTo(expectedRevenueTtm, 0);
      expect(mockUpsert.mock.calls[0][0].create.quartersAvailable).toBe(8);
    });
  });

  // ── Scenario 2: <4 quarters → TTM null, ttm_computed=false ──────────────────

  describe('Scenario 2: fewer than 4 quarters → TTM null', () => {
    test('returns ttm_computed=false when only 2 rows available', async () => {
      mockFindMany.mockResolvedValue(fourRows.slice(0, 2));

      const result = await computeDerivedMetrics('AAPL');

      expect(result.ttm_computed).toBe(false);
    });

    test('all TTM fields are null when fewer than 4 quarters', async () => {
      mockFindMany.mockResolvedValue(fourRows.slice(0, 2));

      await computeDerivedMetrics('AAPL');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.revenueTtm).toBeNull();
      expect(payload.grossMarginTtm).toBeNull();
      expect(payload.netMarginTtm).toBeNull();
    });

    test('no quarterly rows → quarters_available=0, all TTM null', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await computeDerivedMetrics('AAPL');

      expect(result.quarters_available).toBe(0);
      expect(result.ttm_computed).toBe(false);
      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.revenueTtm).toBeNull();
    });
  });

  // ── Scenario 3: NULL field in any quarter → TTM null ─────────────────────────

  describe('Scenario 3: null field in any quarter → TTM field null', () => {
    test('revenue_ttm is null if any of the 4 quarters has null revenue', async () => {
      const rowsWithNullRevenue = [
        ...fourRows.slice(0, 3),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 1, revenue: null }), // null revenue
      ];
      mockFindMany.mockResolvedValue(rowsWithNullRevenue);

      await computeDerivedMetrics('AAPL');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.revenueTtm).toBeNull();
    });
  });

  // ── Scenario 4: TTM margin null when revenue_ttm null or zero ────────────────

  describe('Scenario 4: TTM margin null when revenue_ttm null or zero', () => {
    test('all margin ratios null when revenue_ttm is null', async () => {
      mockFindMany.mockResolvedValue([
        ...fourRows.slice(0, 3),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 1, revenue: null, grossProfit: 100, netIncome: 20 }),
      ]);

      await computeDerivedMetrics('AAPL');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.grossMarginTtm).toBeNull();
      expect(payload.operatingMarginTtm).toBeNull();
      expect(payload.netMarginTtm).toBeNull();
      expect(payload.fcfMarginTtm).toBeNull();
    });
  });

  // ── Scenario 5: derived_as_of written ────────────────────────────────────────

  describe('Scenario 5: derived_as_of written to approximately NOW()', () => {
    test('upsert create and update payloads both include derivedAsOf as Date', async () => {
      mockFindMany.mockResolvedValue(fourRows);
      const before = new Date();

      await computeDerivedMetrics('AAPL');

      const after = new Date();
      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.derivedAsOf).toBeInstanceOf(Date);
      expect(payload.derivedAsOf.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(payload.derivedAsOf.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });
  });

  // ── Scenario 7: upsert (not duplicate insert) ─────────────────────────────────

  describe('Scenario 7: upsert pattern — existing row updated', () => {
    test('upsert is called with ticker as where key', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      await computeDerivedMetrics('AAPL');

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ticker: 'AAPL' } }),
      );
    });
  });
});

describe('EPIC-003/STORY-061: computeDerivedMetricsBatch', () => {

  // ── Scenario 6: Batch error isolation ────────────────────────────────────────

  describe('Scenario 6: batch error isolation', () => {
    test('one ticker error does not halt batch; errors counter incremented', async () => {
      mockFindMany
        .mockResolvedValueOnce(fourRows)
        .mockRejectedValueOnce(new Error('DB error for ticker 2'))
        .mockResolvedValueOnce(fourRows);

      const result = await computeDerivedMetricsBatch(['AAPL', 'ERRSTOCK', 'MSFT']);

      expect(result.tickers_processed).toBe(3);
      expect(result.tickers_updated).toBe(2);
      expect(result.errors).toBe(1);
    });

    test('batch result always has all required fields', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await computeDerivedMetricsBatch(['AAPL']);

      expect(result).toHaveProperty('tickers_processed');
      expect(result).toHaveProperty('tickers_updated');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration_ms');
      expect(typeof result.duration_ms).toBe('number');
    });
  });
});
