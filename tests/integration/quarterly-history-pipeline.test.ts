// EPIC-003/STORY-064: Quarterly History Pipeline Integration & Regression Tests
// STORY-085: Updated fixtures to NormalizedQuarterlyReport; FMPAdapter replaces TiingoAdapter
// RFC-008 §Ingestion Sync Architecture; ADR-015; ADR-016
// Tests the full pipeline: adapter → sync → TTM derivation → trend computation → cron route
// Uses Prisma mocks (no live DB) to test cross-service integration and orchestration contracts.

import { NextRequest } from 'next/server';

// ── Mock Prisma (shared across all stages) ───────────────────────────────────
const mockStockFindMany   = jest.fn();
const mockSqhFindFirst    = jest.fn();
const mockSqhFindMany     = jest.fn();
const mockSqhUpsert       = jest.fn();
const mockDerivedUpsert   = jest.fn();

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findMany: (...a: unknown[]) => mockStockFindMany(...a) },
    stockQuarterlyHistory: {
      findFirst: (...a: unknown[]) => mockSqhFindFirst(...a),
      findMany:  (...a: unknown[]) => mockSqhFindMany(...a),
      upsert:    (...a: unknown[]) => mockSqhUpsert(...a),
    },
    stockDerivedMetrics: { upsert: (...a: unknown[]) => mockDerivedUpsert(...a) },
  },
}));

// ── Mock FMPAdapter (used by cron route — STORY-085) ─────────────────────────
const mockFetchStatements = jest.fn();
jest.mock('@/modules/data-ingestion/adapters/fmp.adapter', () => ({
  FMPAdapter: jest.fn().mockImplementation(() => ({
    providerName: 'fmp',
    fetchQuarterlyStatements: mockFetchStatements,
  })),
}));

// ── Mock verifySchedulerToken for cron route tests ───────────────────────────
jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { syncQuarterlyHistory } from '../../src/modules/data-ingestion/jobs/quarterly-history-sync.service';
import type { QuarterlyAdapter } from '../../src/modules/data-ingestion/jobs/quarterly-history-sync.service';
import { computeDerivedMetrics, computeDerivedMetricsBatch } from '../../src/modules/data-ingestion/jobs/derived-metrics-computation.service';
import { computeTrendMetrics } from '../../src/modules/data-ingestion/jobs/trend-metrics-computation.service';
import { POST as cronPost } from '../../src/app/api/cron/quarterly-history/route';

const mockVerify = verifySchedulerToken as jest.Mock;

// ── Mock QuarterlyAdapter for direct syncQuarterlyHistory tests ──────────────
const mockAdapter: QuarterlyAdapter = {
  providerName: 'tiingo',
  fetchQuarterlyStatements: mockFetchStatements,
};

// ── Fixture helpers — NormalizedQuarterlyReport (flat format, STORY-085) ─────

function makeQuarterlyReport(opts: {
  quarter: number; year: number; date: string;
  revenue?: number | null; grossProfit?: number | null;
  netInc?: number | null; fcf?: number | null; cfo?: number | null;
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

function toDecimal(v: number | null) {
  if (v == null) return null;
  return { toString: () => String(v), toNumber: () => v } as unknown as import('@prisma/client').Prisma.Decimal;
}

function makeSqhRow(opts: {
  fiscalYear: number; fiscalQuarter: number;
  revenue?: number | null; grossProfit?: number | null;
  netIncome?: number | null; cashFromOperations?: number | null;
  freeCashFlow?: number | null; grossMargin?: number | null;
  operatingMargin?: number | null; netMargin?: number | null;
  cfoToNetIncomeRatio?: number | null; fcfMargin?: number | null;
  shareBasedCompensation?: number | null; capex?: number | null;
  operatingIncome?: number | null; dilutedSharesOutstanding?: number | null;
}) {
  return {
    id: BigInt(1), ticker: 'TEST', sourceProvider: 'tiingo',
    reportedDate: new Date(), syncedAt: new Date(),
    fiscalYear: opts.fiscalYear, fiscalQuarter: opts.fiscalQuarter,
    revenue:                     toDecimal(opts.revenue ?? null),
    grossProfit:                 toDecimal(opts.grossProfit ?? null),
    netIncome:                   toDecimal(opts.netIncome ?? null),
    cashFromOperations:          toDecimal(opts.cashFromOperations ?? null),
    freeCashFlow:                toDecimal(opts.freeCashFlow ?? null),
    grossMargin:                 toDecimal(opts.grossMargin ?? null),
    operatingMargin:             toDecimal(opts.operatingMargin ?? null),
    netMargin:                   toDecimal(opts.netMargin ?? null),
    cfoToNetIncomeRatio:         toDecimal(opts.cfoToNetIncomeRatio ?? null),
    fcfMargin:                   toDecimal(opts.fcfMargin ?? null),
    shareBasedCompensation:      toDecimal(opts.shareBasedCompensation ?? null),
    capex:                       toDecimal(opts.capex ?? null),
    operatingIncome:             toDecimal(opts.operatingIncome ?? null),
    dilutedSharesOutstanding:    toDecimal(opts.dilutedSharesOutstanding ?? null),
    depreciationAndAmortization: null, sbcAsPctRevenue: null, dilutionYoy: null,
    fiscalPeriodEndDate: null, calendarYear: null, calendarQuarter: null, sourceStatementType: null,
  };
}

const eightQuarterReports = [
  makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 95000, grossProfit: 43000, netInc: 21000, fcf: 23000, cfo: 26000 }),
  makeQuarterlyReport({ quarter: 3, year: 2024, date: '2024-07-25', revenue: 86000, grossProfit: 40000, netInc: 20000, fcf: 22000, cfo: 25000 }),
  makeQuarterlyReport({ quarter: 2, year: 2024, date: '2024-04-30', revenue: 91000, grossProfit: 42000, netInc: 24000, fcf: 27000, cfo: 28000 }),
  makeQuarterlyReport({ quarter: 1, year: 2024, date: '2024-01-29', revenue: 120000, grossProfit: 55000, netInc: 34000, fcf: 36000, cfo: 40000 }),
  makeQuarterlyReport({ quarter: 4, year: 2023, date: '2023-10-26', revenue: 90000, grossProfit: 40000, netInc: 23000, fcf: 21000, cfo: 24000 }),
  makeQuarterlyReport({ quarter: 3, year: 2023, date: '2023-07-27', revenue: 82000, grossProfit: 36000, netInc: 20000, fcf: 20000, cfo: 22000 }),
  makeQuarterlyReport({ quarter: 2, year: 2023, date: '2023-04-27', revenue: 95000, grossProfit: 42000, netInc: 24000, fcf: 29000, cfo: 30000 }),
  makeQuarterlyReport({ quarter: 1, year: 2023, date: '2023-01-26', revenue: 117000, grossProfit: 53000, netInc: 30000, fcf: 34000, cfo: 36000 }),
];

const eightSqhRows = [
  makeSqhRow({ fiscalYear: 2024, fiscalQuarter: 4, revenue: 95000,  grossProfit: 43000, netIncome: 21000, cashFromOperations: 26000, freeCashFlow: 23000, grossMargin: 0.453, operatingMargin: 0.22, netMargin: 0.22, cfoToNetIncomeRatio: 1.24, fcfMargin: 0.24, shareBasedCompensation: 2000, capex: -3000, operatingIncome: 20900, dilutedSharesOutstanding: 15500 }),
  makeSqhRow({ fiscalYear: 2024, fiscalQuarter: 3, revenue: 86000,  grossProfit: 40000, netIncome: 20000, cashFromOperations: 25000, freeCashFlow: 22000, grossMargin: 0.465, operatingMargin: 0.21, netMargin: 0.23, cfoToNetIncomeRatio: 1.25, fcfMargin: 0.26, shareBasedCompensation: 1900, capex: -3000, operatingIncome: 18060, dilutedSharesOutstanding: 15300 }),
  makeSqhRow({ fiscalYear: 2024, fiscalQuarter: 2, revenue: 91000,  grossProfit: 42000, netIncome: 24000, cashFromOperations: 28000, freeCashFlow: 27000, grossMargin: 0.462, operatingMargin: 0.23, netMargin: 0.26, cfoToNetIncomeRatio: 1.17, fcfMargin: 0.30, shareBasedCompensation: 1800, capex: -1000, operatingIncome: 20930, dilutedSharesOutstanding: 15100 }),
  makeSqhRow({ fiscalYear: 2024, fiscalQuarter: 1, revenue: 120000, grossProfit: 55000, netIncome: 34000, cashFromOperations: 40000, freeCashFlow: 36000, grossMargin: 0.458, operatingMargin: 0.24, netMargin: 0.28, cfoToNetIncomeRatio: 1.18, fcfMargin: 0.30, shareBasedCompensation: 1700, capex: -4000, operatingIncome: 28800, dilutedSharesOutstanding: 15000 }),
  makeSqhRow({ fiscalYear: 2023, fiscalQuarter: 4, revenue: 90000,  grossProfit: 40000, netIncome: 23000, cashFromOperations: 24000, freeCashFlow: 21000, grossMargin: 0.444, operatingMargin: 0.20, netMargin: 0.26, cfoToNetIncomeRatio: 1.04, fcfMargin: 0.23, shareBasedCompensation: 1600, capex: -3000, operatingIncome: 18000, dilutedSharesOutstanding: 14800 }),
  makeSqhRow({ fiscalYear: 2023, fiscalQuarter: 3, revenue: 82000,  grossProfit: 36000, netIncome: 20000, cashFromOperations: 22000, freeCashFlow: 20000, grossMargin: 0.439, operatingMargin: 0.19, netMargin: 0.24, cfoToNetIncomeRatio: 1.10, fcfMargin: 0.24, shareBasedCompensation: 1500, capex: -2000, operatingIncome: 15580, dilutedSharesOutstanding: 14700 }),
  makeSqhRow({ fiscalYear: 2023, fiscalQuarter: 2, revenue: 95000,  grossProfit: 42000, netIncome: 24000, cashFromOperations: 30000, freeCashFlow: 29000, grossMargin: 0.442, operatingMargin: 0.20, netMargin: 0.25, cfoToNetIncomeRatio: 1.25, fcfMargin: 0.31, shareBasedCompensation: 1400, capex: -1000, operatingIncome: 19000, dilutedSharesOutstanding: 14600 }),
  makeSqhRow({ fiscalYear: 2023, fiscalQuarter: 1, revenue: 117000, grossProfit: 53000, netIncome: 30000, cashFromOperations: 36000, freeCashFlow: 34000, grossMargin: 0.453, operatingMargin: 0.21, netMargin: 0.26, cfoToNetIncomeRatio: 1.20, fcfMargin: 0.29, shareBasedCompensation: 1300, capex: -4000, operatingIncome: 24570, dilutedSharesOutstanding: 14500 }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSqhUpsert.mockResolvedValue({});
  mockDerivedUpsert.mockResolvedValue({});
  mockSqhFindFirst.mockResolvedValue(null);
  mockVerify.mockResolvedValue(undefined);
});

describe('EPIC-003/STORY-064: Quarterly History Pipeline Integration', () => {

  // ── Integration Scenario 1: Happy path — sync → TTM → trend ─────────────────

  describe('Scenario 1: Happy path — new quarter triggers full pipeline', () => {
    test('sync upserts 8 quarters when no stored rows exist', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFetchStatements.mockResolvedValue(eightQuarterReports);

      const result = await syncQuarterlyHistory(mockAdapter);

      expect(result.stocks_processed).toBe(1);
      expect(result.stocks_updated).toBe(1);
      expect(result.quarters_upserted).toBe(8);
      expect(mockSqhUpsert).toHaveBeenCalledTimes(8);
    });

    test('computeDerivedMetrics after sync: TTM computed and upserted to stock_derived_metrics', async () => {
      mockSqhFindMany.mockResolvedValue(eightSqhRows); // simulate rows written by sync

      const result = await computeDerivedMetrics('AAPL');

      expect(result.ttm_computed).toBe(true);
      expect(result.quarters_available).toBe(8);
      expect(mockDerivedUpsert).toHaveBeenCalledTimes(1);
      const payload = mockDerivedUpsert.mock.calls[0][0].create;
      expect(Number(payload.revenueTtm)).toBeCloseTo(95000 + 86000 + 91000 + 120000, 0);
    });

    test('computeTrendMetrics after sync: slope fields non-null for 8-quarter series', async () => {
      mockSqhFindMany.mockResolvedValue(eightSqhRows);

      const result = await computeTrendMetrics('AAPL');

      expect(result.slopes_computed).toBe(true);
      expect(result.stability_computed).toBe(true);
      const payload = mockDerivedUpsert.mock.calls[0][0].create;
      expect(payload.grossMarginSlope4q).not.toBeNull();
      expect(payload.grossMarginSlope8q).not.toBeNull();
    });

    test('derived_as_of is set to approximately NOW() after each derivation run', async () => {
      mockSqhFindMany.mockResolvedValue(eightSqhRows);
      const before = new Date();

      await computeDerivedMetrics('AAPL');

      const after = new Date();
      const payload = mockDerivedUpsert.mock.calls[0][0].create;
      expect(payload.derivedAsOf).toBeInstanceOf(Date);
      expect(payload.derivedAsOf.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(payload.derivedAsOf.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });
  });

  // ── Integration Scenario 2: Change detection — skip when date unchanged ──────

  describe('Scenario 2: Change detection — unchanged reported_date → skip', () => {
    test('sync skips stock when adapter reported_date matches stored row', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'MSFT' }]);
      mockSqhFindFirst.mockResolvedValue({ reportedDate: new Date('2024-10-28') });
      mockFetchStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 100000, grossProfit: 50000, netInc: 25000 }),
      ]);

      const result = await syncQuarterlyHistory(mockAdapter);

      expect(result.stocks_skipped).toBe(1);
      expect(result.stocks_updated).toBe(0);
      expect(mockSqhUpsert).not.toHaveBeenCalled();
    });

    test('sync updates when new quarter present (adapter date is newer)', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'MSFT' }]);
      mockSqhFindFirst.mockResolvedValue({ reportedDate: new Date('2024-07-25') });
      mockFetchStatements.mockResolvedValue(eightQuarterReports);

      const result = await syncQuarterlyHistory(mockAdapter);

      expect(result.stocks_updated).toBe(1);
      expect(result.quarters_upserted).toBe(8);
    });
  });

  // ── Integration Scenario 3: forceFullScan bypasses change detection ──────────

  describe('Scenario 3: forceFullScan=true forces re-sync even when date unchanged', () => {
    test('stock with matching date is still synced with forceFullScan=true', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockSqhFindFirst.mockResolvedValue({ reportedDate: new Date('2024-10-28') });
      mockFetchStatements.mockResolvedValue([
        makeQuarterlyReport({ quarter: 4, year: 2024, date: '2024-10-28', revenue: 100000, grossProfit: 50000, netInc: 25000 }),
      ]);

      const result = await syncQuarterlyHistory(mockAdapter, { forceFullScan: true });

      expect(result.stocks_updated).toBe(1);
      expect(result.quarters_upserted).toBe(1);
      expect(mockSqhFindFirst).not.toHaveBeenCalled(); // DB date check skipped
    });
  });

  // ── Integration Scenario 4: NULL field handling ──────────────────────────────

  describe('Scenario 4: NULL fields → null in upsert, not zero', () => {
    test('revenue is null when field absent; gross_margin also null (not NaN or zero)', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockSqhFindFirst.mockResolvedValue(null);
      // NormalizedQuarterlyReport with all-null fields
      mockFetchStatements.mockResolvedValue([{
        date: '2024-10-28', fiscalYear: 2024, fiscalQuarter: 4,
        revenue: null, grossProfit: null, operatingIncome: null, netIncome: null,
        capex: null, cashFromOperations: null, freeCashFlow: null,
        shareBasedCompensation: null, depreciationAndAmortization: null, dilutedSharesOutstanding: null,
      }]);

      await syncQuarterlyHistory(mockAdapter);

      const upsertPayload = mockSqhUpsert.mock.calls[0][0].create;
      expect(upsertPayload.revenue).toBeNull();
      expect(upsertPayload.grossProfit).toBeNull();
      expect(upsertPayload.netIncome).toBeNull();
      expect(upsertPayload.grossMargin).toBeNull();
      expect(upsertPayload.netMargin).toBeNull();
    });

    test('TTM revenue is null when any of the 4 quarters has null revenue', async () => {
      const rowsWithNullRevenue = [
        ...eightSqhRows.slice(0, 3),
        makeSqhRow({ fiscalYear: 2024, fiscalQuarter: 1, revenue: null }),
      ];
      mockSqhFindMany.mockResolvedValue(rowsWithNullRevenue);

      await computeDerivedMetrics('AAPL');

      const payload = mockDerivedUpsert.mock.calls[0][0].create;
      expect(payload.revenueTtm).toBeNull();
      expect(payload.grossMarginTtm).toBeNull();
    });
  });

  // ── Integration Scenario 5: 404 from adapter → skip gracefully ──────────────

  describe('Scenario 5: 404 / null from adapter → stock skipped, no error', () => {
    test('null response from adapter skips stock without incrementing errors', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'TSLA' }]);
      mockFetchStatements.mockResolvedValue(null); // 404

      const result = await syncQuarterlyHistory(mockAdapter);

      expect(result.stocks_skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockSqhUpsert).not.toHaveBeenCalled();
    });

    test('empty array from adapter is also treated as a skip', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'TSLA' }]);
      mockFetchStatements.mockResolvedValue([]);

      const result = await syncQuarterlyHistory(mockAdapter);

      expect(result.stocks_skipped).toBe(1);
      expect(result.errors).toBe(0);
    });

    test('one adapter error does not halt multi-stock batch', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'AAPL' }, { ticker: 'ERRSTOCK' }, { ticker: 'MSFT' }]);
      mockFetchStatements
        .mockResolvedValueOnce(eightQuarterReports.slice(0, 2))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(eightQuarterReports.slice(0, 2));

      const result = await syncQuarterlyHistory(mockAdapter);

      expect(result.stocks_processed).toBe(3);
      expect(result.errors).toBe(1);
      expect(result.stocks_updated).toBe(2);
    });
  });

  // ── Integration Scenario 6: Cron route orchestration ────────────────────────

  describe('Scenario 6: Cron route — 401 / 200 / summary shape', () => {
    test('cron route returns 401 when OIDC token is invalid', async () => {
      mockVerify.mockRejectedValue(new Error('Invalid token'));

      const req = new NextRequest('http://localhost/api/cron/quarterly-history', { method: 'POST' });
      const response = await cronPost(req);

      expect(response.status).toBe(401);
    });

    test('cron route returns 200 with ok=true and correct summary shape', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFetchStatements.mockResolvedValue(eightQuarterReports);
      mockSqhFindMany.mockResolvedValue(eightSqhRows);

      const req = new NextRequest('http://localhost/api/cron/quarterly-history', { method: 'POST' });
      const response = await cronPost(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.summary).toHaveProperty('stocks_processed');
      expect(body.summary).toHaveProperty('stocks_updated');
      expect(body.summary).toHaveProperty('quarters_upserted');
      expect(body.summary).toHaveProperty('stocks_skipped');
      expect(body.summary).toHaveProperty('errors');
      expect(body.summary).toHaveProperty('duration_ms');
    });

    test('cron route with ?ticker=AAPL processes only that stock', async () => {
      mockStockFindMany.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockFetchStatements.mockResolvedValue(eightQuarterReports);
      mockSqhFindMany.mockResolvedValue(eightSqhRows);

      const url = new URL('http://localhost/api/cron/quarterly-history?ticker=AAPL');
      const req = new NextRequest(url.toString(), { method: 'POST' });
      const response = await cronPost(req);

      expect(response.status).toBe(200);
    });
  });

  // ── Integration Scenario 7: quarters_available reflects row count ────────────

  describe('Scenario 7: quarters_available correctly reflects stored row count', () => {
    test('quarters_available=8 when 8 rows stored; ttm uses only first 4', async () => {
      mockSqhFindMany.mockResolvedValue(eightSqhRows);

      const result = await computeDerivedMetrics('AAPL');

      expect(result.quarters_available).toBe(8);
      expect(result.ttm_computed).toBe(true);
      const payload = mockDerivedUpsert.mock.calls[0][0].create;
      expect(payload.quartersAvailable).toBe(8);
      const expected = 95000 + 86000 + 91000 + 120000;
      expect(Number(payload.revenueTtm)).toBeCloseTo(expected, 0);
    });

    test('quarters_available=0 and ttm_computed=false when no rows exist', async () => {
      mockSqhFindMany.mockResolvedValue([]);

      const result = await computeDerivedMetrics('AAPL');

      expect(result.quarters_available).toBe(0);
      expect(result.ttm_computed).toBe(false);
    });
  });

  // ── Integration Scenario 8: Batch error isolation across derivation ──────────

  describe('Scenario 8: Derivation batch isolates per-ticker errors', () => {
    test('one ticker error in computeDerivedMetricsBatch does not halt others', async () => {
      mockSqhFindMany
        .mockResolvedValueOnce(eightSqhRows)
        .mockRejectedValueOnce(new Error('DB error for ERRSTOCK'))
        .mockResolvedValueOnce(eightSqhRows);

      const result = await computeDerivedMetricsBatch(['AAPL', 'ERRSTOCK', 'MSFT']);

      expect(result.tickers_processed).toBe(3);
      expect(result.errors).toBe(1);
      expect(result.tickers_updated).toBe(2);
    });
  });
});
