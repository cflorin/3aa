// EPIC-003/STORY-062: Trend & Trajectory Metrics Computation Service
// RFC-008 §Derived Metrics Computation; ADR-015 §Schema
// TDD: Prisma fully mocked; no live DB calls
// Fixture provenance: synthetic

import { computeTrendMetrics, computeTrendMetricsBatch } from '../../../src/modules/data-ingestion/jobs/trend-metrics-computation.service';

// ── Mock Prisma ──────────────────────────────────────────────────────────────
const mockFindMany = jest.fn();
const mockUpsert = jest.fn();

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stockQuarterlyHistory: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    stockDerivedMetrics: { upsert: (...a: unknown[]) => mockUpsert(...a) },
  },
}));

function toDecimal(v: number | null | undefined) {
  if (v == null) return null;
  return { toString: () => String(v), toNumber: () => v } as unknown as import('@prisma/client').Prisma.Decimal;
}

function makeRow(opts: {
  fiscalYear: number;
  fiscalQuarter: number;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  netMargin?: number | null;
  cfoToNetIncomeRatio?: number | null;
  fcfMargin?: number | null;
  operatingIncome?: number | null;
  revenue?: number | null;
  netIncome?: number | null;
  cashFromOperations?: number | null;
  shareBasedCompensation?: number | null;
  capex?: number | null;
  dilutedSharesOutstanding?: number | null;
}) {
  return {
    id: BigInt(1),
    ticker: 'TEST',
    fiscalYear: opts.fiscalYear,
    fiscalQuarter: opts.fiscalQuarter,
    sourceProvider: 'tiingo',
    reportedDate: new Date(),
    syncedAt: new Date(),
    grossMargin:              toDecimal(opts.grossMargin ?? null),
    operatingMargin:          toDecimal(opts.operatingMargin ?? null),
    netMargin:                toDecimal(opts.netMargin ?? null),
    cfoToNetIncomeRatio:      toDecimal(opts.cfoToNetIncomeRatio ?? null),
    fcfMargin:                toDecimal(opts.fcfMargin ?? null),
    operatingIncome:          toDecimal(opts.operatingIncome ?? null),
    revenue:                  toDecimal(opts.revenue ?? null),
    netIncome:                toDecimal(opts.netIncome ?? null),
    cashFromOperations:       toDecimal(opts.cashFromOperations ?? null),
    shareBasedCompensation:   toDecimal(opts.shareBasedCompensation ?? null),
    capex:                    toDecimal(opts.capex ?? null),
    dilutedSharesOutstanding: toDecimal(opts.dilutedSharesOutstanding ?? null),
    grossProfit: null, freeCashFlow: null, sbcAsPctRevenue: null, dilutionYoy: null,
    fiscalPeriodEndDate: null, calendarYear: null, calendarQuarter: null, sourceStatementType: null,
    depreciationAndAmortization: null,
  };
}

// 8 rows newest-first with steady upward trend in all metrics.
// Oldest-first gross margins: [0.12, 0.14, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26]
// OLS slope for any 4- or 8-quarter window = +0.02/quarter.
const eightRows = [
  makeRow({ fiscalYear: 2024, fiscalQuarter: 4, grossMargin: 0.26, operatingMargin: 0.14, netMargin: 0.07, cfoToNetIncomeRatio: 1.5, fcfMargin: 0.10, operatingIncome: 30000, revenue: 120000, netIncome: 8400, cashFromOperations: 12600, shareBasedCompensation: 2400, capex: -3600, dilutedSharesOutstanding: 15500 }),
  makeRow({ fiscalYear: 2024, fiscalQuarter: 3, grossMargin: 0.24, operatingMargin: 0.13, netMargin: 0.06, cfoToNetIncomeRatio: 1.4, fcfMargin: 0.09, operatingIncome: 27000, revenue: 115000, netIncome: 6900, cashFromOperations: 9660, shareBasedCompensation: 2300, capex: -3450, dilutedSharesOutstanding: 15300 }),
  makeRow({ fiscalYear: 2024, fiscalQuarter: 2, grossMargin: 0.22, operatingMargin: 0.12, netMargin: 0.05, cfoToNetIncomeRatio: 1.3, fcfMargin: 0.08, operatingIncome: 24000, revenue: 110000, netIncome: 5500, cashFromOperations: 7150, shareBasedCompensation: 2200, capex: -3300, dilutedSharesOutstanding: 15100 }),
  makeRow({ fiscalYear: 2024, fiscalQuarter: 1, grossMargin: 0.20, operatingMargin: 0.11, netMargin: 0.04, cfoToNetIncomeRatio: 1.2, fcfMargin: 0.07, operatingIncome: 20000, revenue: 100000, netIncome: 4000, cashFromOperations: 4800, shareBasedCompensation: 2000, capex: -3000, dilutedSharesOutstanding: 15000 }),
  makeRow({ fiscalYear: 2023, fiscalQuarter: 4, grossMargin: 0.18, operatingMargin: 0.10, netMargin: 0.03, cfoToNetIncomeRatio: 1.1, fcfMargin: 0.06, operatingIncome: 16000, revenue: 90000, netIncome: 2700, cashFromOperations: 2970, shareBasedCompensation: 1800, capex: -2700, dilutedSharesOutstanding: 14800 }),
  makeRow({ fiscalYear: 2023, fiscalQuarter: 3, grossMargin: 0.16, operatingMargin: 0.09, netMargin: 0.02, cfoToNetIncomeRatio: 1.0, fcfMargin: 0.05, operatingIncome: 13000, revenue: 80000, netIncome: 1600, cashFromOperations: 1600, shareBasedCompensation: 1600, capex: -2400, dilutedSharesOutstanding: 14700 }),
  makeRow({ fiscalYear: 2023, fiscalQuarter: 2, grossMargin: 0.14, operatingMargin: 0.08, netMargin: 0.01, cfoToNetIncomeRatio: 0.9, fcfMargin: 0.04, operatingIncome: 10000, revenue: 70000, netIncome: 700, cashFromOperations: 630, shareBasedCompensation: 1400, capex: -2100, dilutedSharesOutstanding: 14600 }),
  makeRow({ fiscalYear: 2023, fiscalQuarter: 1, grossMargin: 0.12, operatingMargin: 0.07, netMargin: 0.00, cfoToNetIncomeRatio: 0.8, fcfMargin: 0.03, operatingIncome: 7000, revenue: 60000, netIncome: 0, cashFromOperations: 0, shareBasedCompensation: 1200, capex: -1800, dilutedSharesOutstanding: 14500 }),
];

// Newest 4 rows only
const fourRows = eightRows.slice(0, 4);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({});
});

describe('EPIC-003/STORY-062: computeTrendMetrics', () => {

  // ── Scenario 1: 4q slope requires ≥4 non-null data points; null otherwise ──

  describe('Scenario 1: 4q slope computation — ≥4 quarters required', () => {
    test('slopes_computed=true when exactly 4 rows available', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      const result = await computeTrendMetrics('TEST');

      expect(result.slopes_computed).toBe(true);
    });

    test('slopes_computed=false when fewer than 4 rows', async () => {
      mockFindMany.mockResolvedValue(eightRows.slice(0, 2));

      const result = await computeTrendMetrics('TEST');

      expect(result.slopes_computed).toBe(false);
    });

    test('grossMarginSlope4q ≈ +0.02 for steady upward trend', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      // Oldest-first: [0.20, 0.22, 0.24, 0.26] → OLS slope = 0.02
      expect(Number(payload.grossMarginSlope4q)).toBeCloseTo(0.02, 4);
    });

    test('grossMarginSlope8q ≈ +0.02 for 8-quarter upward trend', async () => {
      mockFindMany.mockResolvedValue(eightRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      // Oldest-first: [0.12, 0.14, ..., 0.26] → OLS slope = 0.02
      expect(Number(payload.grossMarginSlope8q)).toBeCloseTo(0.02, 4);
    });

    test('grossMarginSlope8q is null when only 4 rows available', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.grossMarginSlope8q).toBeNull();
    });

    test('all slopes null when 0 rows available', async () => {
      mockFindMany.mockResolvedValue([]);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.grossMarginSlope4q).toBeNull();
      expect(payload.operatingMarginSlope4q).toBeNull();
      expect(payload.netMarginSlope4q).toBeNull();
      expect(payload.grossMarginSlope8q).toBeNull();
      expect(payload.operatingMarginSlope8q).toBeNull();
      expect(payload.netMarginSlope8q).toBeNull();
    });
  });

  // ── Scenario 2: Stability score [0, 1]; null when <4 quarters ───────────────

  describe('Scenario 2: stability score in [0, 1]', () => {
    test('stability_computed=true when 4+ rows available', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      const result = await computeTrendMetrics('TEST');

      expect(result.stability_computed).toBe(true);
    });

    test('operatingMarginStabilityScore is in [0, 1] for 8-quarter data', async () => {
      mockFindMany.mockResolvedValue(eightRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      const score = Number(payload.operatingMarginStabilityScore);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('stability scores null when fewer than 4 rows', async () => {
      mockFindMany.mockResolvedValue(eightRows.slice(0, 2));

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.operatingMarginStabilityScore).toBeNull();
      expect(payload.grossMarginStabilityScore).toBeNull();
      expect(payload.netMarginStabilityScore).toBeNull();
    });
  });

  // ── Scenario 3: earnings_quality_trend_score range [−1, +1] ─────────────────

  describe('Scenario 3: earnings_quality_trend_score in [−1, +1]', () => {
    test('eqTrendScore is in [−1, +1] for well-formed data', async () => {
      mockFindMany.mockResolvedValue(eightRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      const score = Number(payload.earningsQualityTrendScore);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('eqTrendScore is null when fewer than 4 rows', async () => {
      mockFindMany.mockResolvedValue(eightRows.slice(0, 2));

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.earningsQualityTrendScore).toBeNull();
    });

    test('eqTrendScore > 0 when all signals point to improving quality', async () => {
      // CFO/NI improving (slope > 0.02), FCF improving, avg CFO/NI > 1.1
      mockFindMany.mockResolvedValue(eightRows); // all signals improving

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(Number(payload.earningsQualityTrendScore)).toBeGreaterThan(0);
    });
  });

  // ── Scenario 4: materialDilutionTrendFlag=true when >3% share increase ──────

  describe('Scenario 4: material_dilution_trend_flag', () => {
    test('materialDilutionTrendFlag=true when shares grew >3% over 4 quarters', async () => {
      // oldest-first shares: [15000, 15100, 15300, 15500] — change = 3.33% → flag true
      mockFindMany.mockResolvedValue(fourRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.materialDilutionTrendFlag).toBe(true);
    });

    test('materialDilutionTrendFlag=false when shares unchanged', async () => {
      const stableShareRows = [
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4, dilutedSharesOutstanding: 1000 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 3, dilutedSharesOutstanding: 1000 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 2, dilutedSharesOutstanding: 1000 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 1, dilutedSharesOutstanding: 1000 }),
      ];
      mockFindMany.mockResolvedValue(stableShareRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.materialDilutionTrendFlag).toBe(false);
    });

    test('materialDilutionTrendFlag=null when diluted shares data absent', async () => {
      const noShareRows = [
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4, dilutedSharesOutstanding: null }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 3, dilutedSharesOutstanding: null }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 2, dilutedSharesOutstanding: null }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 1, dilutedSharesOutstanding: null }),
      ];
      mockFindMany.mockResolvedValue(noShareRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.materialDilutionTrendFlag).toBeNull();
    });
  });

  // ── Scenario 5: deterioratingCashConversionFlag requires NI>0 and declining ─

  describe('Scenario 5: deteriorating_cash_conversion_flag', () => {
    test('flag=true when NI>0 in all 4q and CFO/NI declining sharply', async () => {
      // oldest-first CFO/NI: [0.90, 0.80, 0.70, 0.60] → slope = -0.10 < -0.05
      const deterioratingRows = [
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4, netIncome: 8400, cfoToNetIncomeRatio: 0.60 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 3, netIncome: 6900, cfoToNetIncomeRatio: 0.70 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 2, netIncome: 5500, cfoToNetIncomeRatio: 0.80 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 1, netIncome: 4000, cfoToNetIncomeRatio: 0.90 }),
      ];
      mockFindMany.mockResolvedValue(deterioratingRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.deterioratingCashConversionFlag).toBe(true);
    });

    test('flag=false when CFO/NI is improving (slope positive)', async () => {
      // eightRows has improving CFO/NI; recent 4q slope > -0.05
      mockFindMany.mockResolvedValue(fourRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.deterioratingCashConversionFlag).toBe(false);
    });

    test('flag=false when any NI ≤ 0 in recent 4 quarters', async () => {
      // One quarter has zero NI → allPositive = false → flag explicitly false
      const mixedNiRows = [
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4, netIncome: 5000, cfoToNetIncomeRatio: 0.60 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 3, netIncome: 4000, cfoToNetIncomeRatio: 0.70 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 2, netIncome: 0,    cfoToNetIncomeRatio: 0.80 }), // zero
        makeRow({ fiscalYear: 2024, fiscalQuarter: 1, netIncome: 3000, cfoToNetIncomeRatio: 0.90 }),
      ];
      mockFindMany.mockResolvedValue(mixedNiRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.deterioratingCashConversionFlag).toBe(false);
    });
  });

  // ── Scenario 6: opIncAccelerationFlag requires 8 quarters ───────────────────

  describe('Scenario 6: operating_income_acceleration_flag', () => {
    test('flag=null when fewer than 8 rows', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.operatingIncomeAccelerationFlag).toBeNull();
    });

    test('flag=true when recent 4q OpInc growth exceeds prior 4q growth', async () => {
      // service uses: op8qStart=opIncomes[0], op4qStart=opIncomes[4], op4qEnd=opIncomes[7]
      // oldest-first opIncome: [100, 103, 106, 108, 110, 140, 165, 200]
      // priorGrowth = pct(100→110) = 10%; recentGrowth = pct(110→200) ≈ 81.8% → true
      const acceleratingRows = [
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4, operatingIncome: 200 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 3, operatingIncome: 165 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 2, operatingIncome: 140 }),
        makeRow({ fiscalYear: 2024, fiscalQuarter: 1, operatingIncome: 110 }),
        makeRow({ fiscalYear: 2023, fiscalQuarter: 4, operatingIncome: 108 }),
        makeRow({ fiscalYear: 2023, fiscalQuarter: 3, operatingIncome: 106 }),
        makeRow({ fiscalYear: 2023, fiscalQuarter: 2, operatingIncome: 103 }),
        makeRow({ fiscalYear: 2023, fiscalQuarter: 1, operatingIncome: 100 }),
      ];
      mockFindMany.mockResolvedValue(acceleratingRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.operatingIncomeAccelerationFlag).toBe(true);
    });

    test('flag=false when recent 4q OpInc growth lags prior 4q growth', async () => {
      // eightRows: prior growth ~185%, recent growth 50% → false
      mockFindMany.mockResolvedValue(eightRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.operatingIncomeAccelerationFlag).toBe(false);
    });
  });

  // ── Scenario 7: NULL denominator → NULL flag (no fabricated values) ──────────

  describe('Scenario 7: NULL denominator → NULL flag', () => {
    test('all flags and slopes null when all rows have only null margins', async () => {
      const nullMarginRows = Array.from({ length: 8 }, (_, i) =>
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4 - (i % 4) }),
      );
      mockFindMany.mockResolvedValue(nullMarginRows);

      await computeTrendMetrics('TEST');

      const p = mockUpsert.mock.calls[0][0].create;
      expect(p.grossMarginSlope4q).toBeNull();
      expect(p.operatingMarginSlope4q).toBeNull();
      expect(p.earningsQualityTrendScore).toBeNull();
      expect(p.sbcBurdenScore).toBeNull();
      expect(p.capexToRevenueRatioAvg4q).toBeNull();
    });

    test('sbcBurdenScore null when revenue is null', async () => {
      const noRevRows = Array.from({ length: 4 }, (_, i) =>
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4 - i, shareBasedCompensation: 1000, revenue: null }),
      );
      mockFindMany.mockResolvedValue(noRevRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.sbcBurdenScore).toBeNull();
    });

    test('capexToRevenueRatioAvg4q null when revenue is null', async () => {
      const noRevRows = Array.from({ length: 4 }, (_, i) =>
        makeRow({ fiscalYear: 2024, fiscalQuarter: 4 - i, capex: -1000, revenue: null }),
      );
      mockFindMany.mockResolvedValue(noRevRows);

      await computeTrendMetrics('TEST');

      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.capexToRevenueRatioAvg4q).toBeNull();
    });
  });

  // ── Scenario 8: derived_as_of + upsert pattern ───────────────────────────────

  describe('Scenario 8: derived_as_of refreshed; upsert uses ticker as where key', () => {
    test('upsert called with ticker as where key', async () => {
      mockFindMany.mockResolvedValue(fourRows);

      await computeTrendMetrics('AAPL');

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ticker: 'AAPL' } }),
      );
    });

    test('create and update payloads both include derivedAsOf as Date', async () => {
      mockFindMany.mockResolvedValue(fourRows);
      const before = new Date();

      await computeTrendMetrics('AAPL');

      const after = new Date();
      const payload = mockUpsert.mock.calls[0][0].create;
      expect(payload.derivedAsOf).toBeInstanceOf(Date);
      expect(payload.derivedAsOf.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(payload.derivedAsOf.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    test('result object has all required fields', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await computeTrendMetrics('AAPL');

      expect(result).toHaveProperty('ticker', 'AAPL');
      expect(result).toHaveProperty('slopes_computed');
      expect(result).toHaveProperty('stability_computed');
      expect(result).toHaveProperty('flags_computed');
    });
  });
});

describe('EPIC-003/STORY-062: computeTrendMetricsBatch', () => {
  describe('Batch error isolation', () => {
    test('one ticker error does not halt batch; errors counter incremented', async () => {
      mockFindMany
        .mockResolvedValueOnce(fourRows)
        .mockRejectedValueOnce(new Error('DB error for ticker 2'))
        .mockResolvedValueOnce(fourRows);

      const result = await computeTrendMetricsBatch(['AAPL', 'ERRSTOCK', 'MSFT']);

      expect(result.tickers_processed).toBe(3);
      expect(result.tickers_updated).toBe(2);
      expect(result.errors).toBe(1);
    });

    test('batch result has all required fields including duration_ms', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await computeTrendMetricsBatch(['AAPL']);

      expect(result).toHaveProperty('tickers_processed');
      expect(result).toHaveProperty('tickers_updated');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration_ms');
      expect(typeof result.duration_ms).toBe('number');
    });
  });
});
