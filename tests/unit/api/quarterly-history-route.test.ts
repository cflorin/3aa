// EPIC-004: Classification Engine & Universe Screen
// STORY-088: Quarterly Tab Bug Fixes
// TASK-088-001: Unit tests — GET /api/stocks/[ticker]/quarterly-history
// Bug fixed: no sourceProvider filter caused duplicate quarters (FMP + Tiingo rows both returned)

import { NextRequest } from 'next/server';

jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findFirst: jest.fn() },
    stockQuarterlyHistory: { findMany: jest.fn() },
    stockDerivedMetrics: { findUnique: jest.fn() },
  },
}));

import { GET } from '@/app/api/stocks/[ticker]/quarterly-history/route';
import { validateSession } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';

const mockValidateSession = validateSession as jest.Mock;
const mockStockFind = prisma.stock.findFirst as jest.Mock;
const mockQhFind = prisma.stockQuarterlyHistory.findMany as jest.Mock;
const mockDerivedFind = prisma.stockDerivedMetrics.findUnique as jest.Mock;

const MOCK_USER = { id: 'u1', email: 'admin@test.com', role: 'admin', active: true };

const FMP_ROW = (fy: number, fq: number) => ({
  ticker: 'MSFT', fiscalYear: fy, fiscalQuarter: fq, sourceProvider: 'fmp',
  fiscalPeriodEndDate: null, reportedDate: null,
  revenue: null, grossProfit: null, operatingIncome: null, netIncome: null,
  freeCashFlow: null, cashFromOperations: null,
  grossMargin: null, operatingMargin: null, netMargin: null, cfoToNetIncomeRatio: null, fcfMargin: null,
});

function makeRequest(ticker: string): NextRequest {
  return new NextRequest(`http://localhost/api/stocks/${ticker}/quarterly-history`, {
    headers: { cookie: 'sessionId=sid123' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateSession.mockResolvedValue(MOCK_USER);
  mockStockFind.mockResolvedValue({ ticker: 'MSFT' });
  mockDerivedFind.mockResolvedValue(null);
});

describe('EPIC-004/STORY-088/TASK-088-001: quarterly-history route — deduplication', () => {

  it('returns 401 when no session', async () => {
    const req = new NextRequest('http://localhost/api/stocks/MSFT/quarterly-history');
    const res = await GET(req, { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when stock not in universe', async () => {
    mockStockFind.mockResolvedValue(null);
    const res = await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(res.status).toBe(404);
  });

  it('STORY-088/BUG-003: queries with sourceProvider=fmp first', async () => {
    mockQhFind.mockResolvedValue([FMP_ROW(2024, 4), FMP_ROW(2024, 3)]);
    await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    const firstCall = mockQhFind.mock.calls[0][0];
    expect(firstCall.where.sourceProvider).toBe('fmp');
  });

  it('STORY-088/BUG-003: falls back to tiingo when no FMP rows', async () => {
    // First call (fmp) returns empty; second call (tiingo) returns data
    mockQhFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([FMP_ROW(2024, 4)]);
    await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(mockQhFind).toHaveBeenCalledTimes(2);
    const fallbackCall = mockQhFind.mock.calls[1][0];
    expect(fallbackCall.where.sourceProvider).toBe('tiingo');
  });

  it('STORY-088/BUG-003: does not make second DB call when FMP rows exist', async () => {
    mockQhFind.mockResolvedValue([FMP_ROW(2024, 4), FMP_ROW(2024, 3)]);
    await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(mockQhFind).toHaveBeenCalledTimes(1);
  });

  it('STORY-088/BUG-003: takes up to 12 rows (not 8)', async () => {
    mockQhFind.mockResolvedValue([]);
    await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    const firstCall = mockQhFind.mock.calls[0][0];
    expect(firstCall.take).toBe(12);
  });

  it('returns 200 with quarters and derived', async () => {
    mockQhFind.mockResolvedValue([FMP_ROW(2024, 4)]);
    const res = await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quarters).toHaveLength(1);
    expect(body.derived).toBeNull();
  });
});
