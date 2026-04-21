// EPIC-003: Data Ingestion & Universe Management
// STORY-032: Share Count Growth (3-Year CAGR)
// TASK-032-007: Unit tests — fetchAnnualShareCounts, computeShareCountGrowth3y,
//               ShareCountSyncService, admin route
//
// All fixtures: synthetic (no live API calls)

import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';
import { computeShareCountGrowth3y } from '../../../src/modules/data-ingestion/utils/share-count-growth';
import { syncShareCount } from '../../../src/modules/data-ingestion/jobs/share-count-sync.service';
import { POST } from '../../../src/app/api/admin/sync/share-count/route';
import { NextRequest } from 'next/server';

// ─── Module mocks (must be at top level for jest hoisting) ────────────────────

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('@/lib/admin-auth', () => ({
  validateAdminApiKey: jest.fn(),
}));

jest.mock('../../../src/modules/data-ingestion/jobs/share-count-sync.service', () => ({
  syncShareCount: jest.fn(),
}));

// FMPAdapter mocked for route tests (no API key in test env); adapter tests use requireActual
jest.mock('../../../src/modules/data-ingestion/adapters/fmp.adapter', () => ({
  FMPAdapter: jest.fn().mockImplementation(() => ({})),
}));

import { prisma } from '@/infrastructure/database/prisma';
import { validateAdminApiKey } from '@/lib/admin-auth';

// ─── Synthetic fixtures ────────────────────────────────────────────────────────

const FIVE_YEAR_INCOME_RAW = [
  { date: '2023-09-30', symbol: 'AAPL', weightedAverageShsOutDil: 15550061952 },
  { date: '2022-09-30', symbol: 'AAPL', weightedAverageShsOutDil: 16215963137 },
  { date: '2021-09-25', symbol: 'AAPL', weightedAverageShsOutDil: 16864919160 },
  { date: '2020-09-26', symbol: 'AAPL', weightedAverageShsOutDil: 17528214000 },
  { date: '2019-09-28', symbol: 'AAPL', weightedAverageShsOutDil: 18595652000 },
];

const EXPECTED_CAGR = Math.pow(15550061952 / 17528214000, 1 / 3) - 1;

// ─── FMPAdapter.fetchAnnualShareCounts() ─────────────────────────────────────

describe('EPIC-003/STORY-032: FMPAdapter.fetchAnnualShareCounts()', () => {
  let adapter: FMPAdapter;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    // Use real FMPAdapter for these tests (top-level mock is only for route test isolation)
    const { FMPAdapter: RealFMPAdapter } = jest.requireActual(
      '../../../src/modules/data-ingestion/adapters/fmp.adapter',
    ) as { FMPAdapter: typeof FMPAdapter };
    adapter = new RealFMPAdapter('test-key');
    mockFetch = jest.spyOn(adapter as unknown as { fmpFetch: () => unknown }, 'fmpFetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns entries newest-first with zero-shares rows filtered out', async () => {
    const rawWithZero = [
      ...FIVE_YEAR_INCOME_RAW,
      { date: '2018-09-29', symbol: 'AAPL', weightedAverageShsOutDil: 0 },
    ];
    mockFetch.mockResolvedValue(rawWithZero);

    const result = await adapter.fetchAnnualShareCounts('AAPL');

    expect(result).toHaveLength(5);
    expect(result[0].date).toBe('2023-09-30');
    expect(result[0].shares).toBe(15550061952);
    expect(result[4].date).toBe('2019-09-28');
  });

  it('returns [] when API response is null', async () => {
    mockFetch.mockResolvedValue(null);
    expect(await adapter.fetchAnnualShareCounts('AAPL')).toEqual([]);
  });

  it('returns [] when API response is empty array', async () => {
    mockFetch.mockResolvedValue([]);
    expect(await adapter.fetchAnnualShareCounts('AAPL')).toEqual([]);
  });
});

// ─── computeShareCountGrowth3y() ─────────────────────────────────────────────

describe('EPIC-003/STORY-032: computeShareCountGrowth3y()', () => {
  const makeEntries = (shares: number[]): { date: string; shares: number }[] =>
    shares.map((s, i) => ({ date: `${2023 - i}-09-30`, shares: s }));

  it('computes negative CAGR for share buyback (AAPL-like)', () => {
    const entries = makeEntries([15550061952, 16215963137, 16864919160, 17528214000, 18595652000]);
    const result = computeShareCountGrowth3y(entries);

    expect(result).not.toBeNull();
    expect(result!.growth).toBeCloseTo(EXPECTED_CAGR, 6);
    expect(result!.periodEnd).toBe('2023-09-30');
    expect(result!.periodStart).toBe('2020-09-30');
  });

  it('computes positive CAGR for share issuance (dilution)', () => {
    const entries = makeEntries([12500000, 11500000, 10800000, 10000000, 9000000]);
    const result = computeShareCountGrowth3y(entries);

    expect(result).not.toBeNull();
    expect(result!.growth).toBeCloseTo(Math.pow(12500000 / 10000000, 1 / 3) - 1, 6);
    expect(result!.growth).toBeGreaterThan(0);
  });

  it('returns null when fewer than 4 entries', () => {
    expect(computeShareCountGrowth3y(makeEntries([1e9, 1e9, 1e9]))).toBeNull();
    expect(computeShareCountGrowth3y(makeEntries([]))).toBeNull();
  });

  it('returns null when FY-3 shares are 0', () => {
    expect(computeShareCountGrowth3y(makeEntries([15550061952, 16215963137, 16864919160, 0]))).toBeNull();
  });

  it('returns null when FY0 shares are 0', () => {
    expect(computeShareCountGrowth3y(makeEntries([0, 16215963137, 16864919160, 17528214000]))).toBeNull();
  });

  it('returns non-null with exactly 4 entries (minimum valid input)', () => {
    const result = computeShareCountGrowth3y(makeEntries([15550061952, 16215963137, 16864919160, 17528214000]));
    expect(result).not.toBeNull();
    expect(result!.growth).toBeCloseTo(EXPECTED_CAGR, 6);
  });
});

// ─── ShareCountSyncService ────────────────────────────────────────────────────

describe('EPIC-003/STORY-032: syncShareCount() service', () => {
  // Use the REAL syncShareCount (not the jest.mock at top — that mock is for the route test only)
  // We need the real implementation here, so we use jest.requireActual
  let realSyncShareCount: typeof syncShareCount;
  let mockAdapter: { fetchAnnualShareCounts: jest.Mock };

  beforeAll(() => {
    realSyncShareCount = jest.requireActual(
      '../../../src/modules/data-ingestion/jobs/share-count-sync.service',
    ).syncShareCount;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdapter = { fetchAnnualShareCounts: jest.fn() };
    (prisma.stock.findMany as jest.Mock).mockResolvedValue([{ ticker: 'AAPL' }]);
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({
      dataProviderProvenance: { existing_key: { provider: 'tiingo' } },
    });
    (prisma.stock.update as jest.Mock).mockResolvedValue({});
  });

  it('writes shareCountGrowth3y and correct provenance on valid result', async () => {
    const entries = [
      { date: '2023-09-30', shares: 15550061952 },
      { date: '2022-09-30', shares: 16215963137 },
      { date: '2021-09-25', shares: 16864919160 },
      { date: '2020-09-26', shares: 17528214000 },
    ];
    mockAdapter.fetchAnnualShareCounts.mockResolvedValue(entries);

    const result = await realSyncShareCount(mockAdapter as unknown as FMPAdapter);

    expect(result).toEqual({ updated: 1, skipped: 0, errors: 0 });

    const updateCall = (prisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ ticker: 'AAPL' });
    expect(updateCall.data.shareCountGrowth3y).toBeCloseTo(EXPECTED_CAGR, 6);

    const prov = updateCall.data.dataProviderProvenance as Record<string, unknown>;
    const shareProv = prov['share_count_growth_3y'] as Record<string, unknown>;
    expect(shareProv['provider']).toBe('fmp');
    expect(shareProv['method']).toBe('income_statement_cagr');
    expect(shareProv['period_start']).toBe('2020-09-26');
    expect(shareProv['period_end']).toBe('2023-09-30');
    expect(typeof shareProv['synced_at']).toBe('string');
    // Existing provenance keys preserved (spread merge invariant)
    expect(prov['existing_key']).toBeDefined();
  });

  it('increments skipped and skips DB write when result is null', async () => {
    mockAdapter.fetchAnnualShareCounts.mockResolvedValue([]); // < 4 entries → null

    const result = await realSyncShareCount(mockAdapter as unknown as FMPAdapter);

    expect(result).toEqual({ updated: 0, skipped: 1, errors: 0 });
    expect(prisma.stock.update).not.toHaveBeenCalled();
  });

  it('increments errors on adapter throw; continues to next stock', async () => {
    (prisma.stock.findMany as jest.Mock).mockResolvedValue([
      { ticker: 'FAIL' },
      { ticker: 'AAPL' },
    ]);
    const goodEntries = [
      { date: '2023-09-30', shares: 15550061952 },
      { date: '2022-09-30', shares: 16215963137 },
      { date: '2021-09-25', shares: 16864919160 },
      { date: '2020-09-26', shares: 17528214000 },
    ];
    mockAdapter.fetchAnnualShareCounts
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(goodEntries);

    const result = await realSyncShareCount(mockAdapter as unknown as FMPAdapter);

    expect(result).toEqual({ updated: 1, skipped: 0, errors: 1 });
    expect(prisma.stock.update).toHaveBeenCalledTimes(1);
  });
});

// ─── Admin route ─────────────────────────────────────────────────────────────

describe('EPIC-003/STORY-032: POST /api/admin/sync/share-count', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // syncShareCount is mocked at top level
    (syncShareCount as jest.Mock).mockResolvedValue({ updated: 5, skipped: 2, errors: 0 });
  });

  it('returns 200 with sync result on valid ADMIN_API_KEY', async () => {
    (validateAdminApiKey as jest.Mock).mockReturnValue(true);

    const req = new NextRequest('http://localhost/api/admin/sync/share-count', { method: 'POST' });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ updated: 5, skipped: 2, errors: 0 });
  });

  it('returns 401 when ADMIN_API_KEY is missing or invalid', async () => {
    (validateAdminApiKey as jest.Mock).mockReturnValue(false);

    const req = new NextRequest('http://localhost/api/admin/sync/share-count', { method: 'POST' });
    const response = await POST(req);

    expect(response.status).toBe(401);
  });
});
