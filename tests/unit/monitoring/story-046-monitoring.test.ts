// EPIC-004: Classification Engine & Universe Screen
// STORY-046: User Monitoring Preferences API
// TASK-046-005: Unit tests — getMonitoringStatus, getUniverseStocks (mocked Prisma)
// RFC-003 §Monitor List API; ADR-007

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userDeactivatedStock: {
      findUnique: jest.fn(),
    },
    stock: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { getMonitoringStatus, getUniverseStocks } from '../../../src/domain/monitoring/monitoring';
import { prisma } from '@/infrastructure/database/prisma';

const mockFindUnique = prisma.userDeactivatedStock.findUnique as jest.Mock;
const mockFindMany = prisma.stock.findMany as jest.Mock;
const mockCount = prisma.stock.count as jest.Mock;

const USER_ID = 'user-uuid-046';
const TICKER = 'MSFT';

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Shared stock row factory ─────────────────────────────────────────────────

function makeStockRow(overrides: Partial<{
  ticker: string;
  deactivated: boolean;
  overrideCode: string | null;
  systemCode: string | null;
  confidenceLevel: string | null;
}> = {}) {
  const {
    ticker = TICKER,
    deactivated = false,
    overrideCode = null,
    systemCode = '3AA',
    confidenceLevel = 'high',
  } = overrides;
  return {
    ticker,
    companyName: 'Test Corp',
    sector: 'Technology',
    marketCap: { toString: () => '3000000' },
    currentPrice: { toString: () => '420.00' },
    revenueGrowthFwd: { toString: () => '0.15' },
    operatingMargin: { toString: () => '0.45' },
    classificationState: systemCode !== null ? { suggestedCode: systemCode, confidenceLevel } : null,
    userClassificationOverrides: overrideCode ? [{ finalCode: overrideCode }] : [],
    userDeactivatedStocks: deactivated ? [{ userId: USER_ID }] : [],
  };
}

describe('EPIC-004/STORY-046/TASK-046-005: getMonitoringStatus', () => {

  it('no deactivation row → returns true (active)', async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getMonitoringStatus(USER_ID, TICKER);
    expect(result).toBe(true);
  });

  it('deactivation row present → returns false', async () => {
    mockFindUnique.mockResolvedValue({ userId: USER_ID, ticker: TICKER, deactivatedAt: new Date() });
    const result = await getMonitoringStatus(USER_ID, TICKER);
    expect(result).toBe(false);
  });
});

describe('EPIC-004/STORY-046/TASK-046-005: getUniverseStocks', () => {

  it('no deactivations → is_active=true for all stocks', async () => {
    mockFindMany.mockResolvedValue([makeStockRow({ deactivated: false })]);
    mockCount.mockResolvedValue(1);

    const { stocks, total } = await getUniverseStocks(USER_ID, { page: 1, limit: 50 });
    expect(stocks[0].is_active).toBe(true);
    expect(total).toBe(1);
  });

  it('deactivation row present → is_active=false', async () => {
    mockFindMany.mockResolvedValue([makeStockRow({ deactivated: true })]);
    mockCount.mockResolvedValue(1);

    const { stocks } = await getUniverseStocks(USER_ID, { page: 1, limit: 50 });
    expect(stocks[0].is_active).toBe(false);
  });

  it('user override present → active_code=overrideCode', async () => {
    mockFindMany.mockResolvedValue([makeStockRow({ overrideCode: '5BA', systemCode: '3AA' })]);
    mockCount.mockResolvedValue(1);

    const { stocks } = await getUniverseStocks(USER_ID, { page: 1, limit: 50 });
    expect(stocks[0].active_code).toBe('5BA');
  });

  it('no override, system code present → active_code=systemCode', async () => {
    mockFindMany.mockResolvedValue([makeStockRow({ overrideCode: null, systemCode: '3AA' })]);
    mockCount.mockResolvedValue(1);

    const { stocks } = await getUniverseStocks(USER_ID, { page: 1, limit: 50 });
    expect(stocks[0].active_code).toBe('3AA');
  });

  it('no override, no system code → active_code=null', async () => {
    mockFindMany.mockResolvedValue([makeStockRow({ overrideCode: null, systemCode: null })]);
    mockCount.mockResolvedValue(1);

    const { stocks } = await getUniverseStocks(USER_ID, { page: 1, limit: 50 });
    expect(stocks[0].active_code).toBeNull();
  });

  it('pagination is in-memory: findMany called without skip/take; total matches returned count', async () => {
    // Pagination is done in-memory after fetching all DB-filtered rows
    // (code filter is computed and cannot be applied in Prisma WHERE)
    mockFindMany.mockResolvedValue([]);

    const { stocks, total } = await getUniverseStocks(USER_ID, { page: 3, limit: 10 });
    expect(mockFindMany).toHaveBeenCalled();
    // No skip/take in the Prisma call
    expect(mockFindMany).not.toHaveBeenCalledWith(expect.objectContaining({ skip: expect.anything() }));
    expect(stocks).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('output contract: required fields present', async () => {
    mockFindMany.mockResolvedValue([makeStockRow()]);
    mockCount.mockResolvedValue(1);

    const { stocks } = await getUniverseStocks(USER_ID, { page: 1, limit: 50 });
    const s = stocks[0];
    expect(s).toHaveProperty('ticker');
    expect(s).toHaveProperty('company_name');
    expect(s).toHaveProperty('is_active');
    expect(s).toHaveProperty('active_code');
    expect(s).toHaveProperty('confidence_level');
    expect(typeof s.market_cap).toBe('number');
  });
});
