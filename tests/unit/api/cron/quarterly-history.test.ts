// EPIC-003/STORY-063: Quarterly History Cron Route
// STORY-089: Switched back to TiingoAdapter (upgraded plan, 16 quarters)
// RFC-008 §Ingestion Sync Architecture; ADR-002 Amendment 2026-04-25 (6:45 PM ET)
// TDD: all external dependencies mocked; no live DB or Tiingo calls

import { NextRequest } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findMany: jest.fn() },
  },
}));

jest.mock('@/modules/data-ingestion/adapters/tiingo.adapter', () => ({
  TiingoAdapter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/modules/data-ingestion/jobs/quarterly-history-sync.service', () => ({
  syncQuarterlyHistory: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/jobs/derived-metrics-computation.service', () => ({
  computeDerivedMetricsBatch: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/jobs/trend-metrics-computation.service', () => ({
  computeTrendMetricsBatch: jest.fn(),
}));

import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { prisma } from '@/infrastructure/database/prisma';
import { syncQuarterlyHistory } from '@/modules/data-ingestion/jobs/quarterly-history-sync.service';
import { computeDerivedMetricsBatch } from '@/modules/data-ingestion/jobs/derived-metrics-computation.service';
import { computeTrendMetricsBatch } from '@/modules/data-ingestion/jobs/trend-metrics-computation.service';
import { POST } from '../../../../src/app/api/cron/quarterly-history/route';

const mockVerify           = verifySchedulerToken as jest.Mock;
const mockFindMany         = prisma.stock.findMany as jest.Mock;
const mockSync             = syncQuarterlyHistory as jest.Mock;
const mockDerived          = computeDerivedMetricsBatch as jest.Mock;
const mockTrend            = computeTrendMetricsBatch as jest.Mock;

const defaultSyncResult = {
  stocks_processed: 5,
  stocks_updated:   3,
  quarters_upserted: 24,
  stocks_skipped:   1,
  errors:           0,
  duration_ms:      800,
};

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/cron/quarterly-history');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'POST' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockResolvedValue(undefined);
  mockSync.mockResolvedValue(defaultSyncResult);
  mockFindMany.mockResolvedValue([{ ticker: 'AAPL' }, { ticker: 'MSFT' }]);
  mockDerived.mockResolvedValue({ tickers_processed: 2, tickers_updated: 2, errors: 0, duration_ms: 50 });
  mockTrend.mockResolvedValue({ tickers_processed: 2, tickers_updated: 2, errors: 0, duration_ms: 30 });
});

describe('EPIC-003/STORY-063: POST /api/cron/quarterly-history', () => {

  // ── Auth guard ───────────────────────────────────────────────────────────────

  describe('Authentication guard', () => {
    test('returns 401 and does not call sync when token is invalid', async () => {
      mockVerify.mockRejectedValue(new Error('Invalid OIDC token'));

      const response = await POST(makeRequest());

      expect(response.status).toBe(401);
      expect(mockSync).not.toHaveBeenCalled();
      expect(mockDerived).not.toHaveBeenCalled();
      expect(mockTrend).not.toHaveBeenCalled();
    });

    test('returns 401 body with error field when unauthorized', async () => {
      mockVerify.mockRejectedValue(new Error('Unauthorized'));

      const response = await POST(makeRequest());
      const body = await response.json();

      expect(body).toHaveProperty('error');
    });
  });

  // ── Successful orchestration ──────────────────────────────────────────────────

  describe('Successful orchestration', () => {
    test('returns 200 with ok=true and sync summary when auth passes', async () => {
      const response = await POST(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.summary.stocks_processed).toBe(5);
      expect(body.summary.stocks_updated).toBe(3);
      expect(body.summary.quarters_upserted).toBe(24);
    });

    test('syncQuarterlyHistory is called with default opts (no force, no ticker)', async () => {
      await POST(makeRequest());

      expect(mockSync).toHaveBeenCalledWith(
        expect.anything(), // TiingoAdapter instance
        expect.objectContaining({ forceFullScan: false, tickerFilter: undefined }),
      );
    });

    test('computeDerivedMetricsBatch called with in-universe tickers fetched from DB', async () => {
      await POST(makeRequest());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inUniverse: true } }),
      );
      expect(mockDerived).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    test('computeTrendMetricsBatch called with same tickers as derivation batch', async () => {
      await POST(makeRequest());

      expect(mockTrend).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });
  });

  // ── force=true param ─────────────────────────────────────────────────────────

  describe('force=true bypasses change detection', () => {
    test('forceFullScan=true passed to sync when ?force=true', async () => {
      await POST(makeRequest({ force: 'true' }));

      expect(mockSync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ forceFullScan: true }),
      );
    });

    test('forceFullScan=false when force param is absent', async () => {
      await POST(makeRequest());

      expect(mockSync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ forceFullScan: false }),
      );
    });
  });

  // ── ticker=AAPL filter ───────────────────────────────────────────────────────

  describe('ticker filter — single stock mode', () => {
    test('tickerFilter passed to sync when ?ticker=AAPL', async () => {
      await POST(makeRequest({ ticker: 'AAPL' }));

      expect(mockSync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tickerFilter: 'AAPL' }),
      );
    });

    test('DB query for tickers skipped when ?ticker=AAPL (uses only that ticker)', async () => {
      await POST(makeRequest({ ticker: 'AAPL' }));

      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockDerived).toHaveBeenCalledWith(['AAPL']);
      expect(mockTrend).toHaveBeenCalledWith(['AAPL']);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────────

  describe('Internal error handling', () => {
    test('returns 500 when sync throws unexpected error', async () => {
      mockSync.mockRejectedValue(new Error('Unexpected DB failure'));

      const response = await POST(makeRequest());

      expect(response.status).toBe(500);
    });

    test('no 500 when per-stock errors are captured inside sync summary (errors > 0)', async () => {
      // Per-stock errors are captured inside syncResult.errors — route should return 200
      mockSync.mockResolvedValue({ ...defaultSyncResult, errors: 2 });

      const response = await POST(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.summary.errors).toBe(2);
    });
  });
});
