// EPIC-004: Classification Engine & Universe Screen
// STORY-088: Quarterly Tab Bug Fixes — deduplication (FMP-first, take:12)
// STORY-089: Tiingo-only quarterly history — upgraded plan, 16 quarters (4 years, avoids COVID)

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

const TIINGO_ROW = (fy: number, fq: number) => ({
  ticker: 'MSFT', fiscalYear: fy, fiscalQuarter: fq, sourceProvider: 'tiingo',
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

describe('EPIC-004/STORY-089: quarterly-history route — Tiingo-only, 16 quarters', () => {

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

  it('queries sourceProvider=tiingo only — no FMP query', async () => {
    mockQhFind.mockResolvedValue([TIINGO_ROW(2024, 4)]);
    await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(mockQhFind).toHaveBeenCalledTimes(1);
    expect(mockQhFind.mock.calls[0][0].where.sourceProvider).toBe('tiingo');
  });

  it('takes up to 16 quarters (4 years, avoids COVID distortion)', async () => {
    mockQhFind.mockResolvedValue([]);
    await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(mockQhFind.mock.calls[0][0].take).toBe(16);
  });

  it('orders most-recent-first', async () => {
    mockQhFind.mockResolvedValue([]);
    await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(mockQhFind.mock.calls[0][0].orderBy).toEqual([
      { fiscalYear: 'desc' }, { fiscalQuarter: 'desc' },
    ]);
  });

  it('returns 200 with quarters array and null derived when no derived row', async () => {
    mockQhFind.mockResolvedValue([TIINGO_ROW(2024, 4), TIINGO_ROW(2024, 3)]);
    const res = await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quarters).toHaveLength(2);
    expect(body.derived).toBeNull();
  });

  it('returns empty quarters array when no Tiingo rows in DB', async () => {
    mockQhFind.mockResolvedValue([]);
    const res = await GET(makeRequest('MSFT'), { params: Promise.resolve({ ticker: 'MSFT' }) });
    const body = await res.json();
    expect(body.quarters).toHaveLength(0);
  });

  it('uppercases ticker before querying', async () => {
    mockQhFind.mockResolvedValue([]);
    await GET(makeRequest('msft'), { params: Promise.resolve({ ticker: 'msft' }) });
    expect(mockQhFind.mock.calls[0][0].where.ticker).toBe('MSFT');
  });
});
