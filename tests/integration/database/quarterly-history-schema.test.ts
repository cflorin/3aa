// EPIC-003/STORY-057: stock_quarterly_history table migration
// RFC-008 §Data Collected; ADR-015 §Schema
// TDD: tests written first — all should pass after migration applied

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_TICKER = 'QHTEST';

async function seedTestStock() {
  await prisma.stock.upsert({
    where: { ticker: TEST_TICKER },
    update: {},
    create: {
      ticker: TEST_TICKER,
      companyName: 'QH Test Corp',
      country: 'US',
      inUniverse: true,
    },
  });
}

async function cleanupTestData() {
  await prisma.stockQuarterlyHistory.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.stock.deleteMany({ where: { ticker: TEST_TICKER } });
}

describe('EPIC-003/STORY-057: stock_quarterly_history schema', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanupTestData();
    await seedTestStock();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.stockQuarterlyHistory.deleteMany({ where: { ticker: TEST_TICKER } });
  });

  // ── BDD Scenario 1: Table exists with required columns ───────────────────────

  describe('table structure', () => {
    test('can insert a minimal row with only required key fields', async () => {
      const row = await prisma.stockQuarterlyHistory.create({
        data: {
          ticker: TEST_TICKER,
          fiscalYear: 2024,
          fiscalQuarter: 3,
          sourceProvider: 'tiingo',
        },
      });
      expect(row.id).toBeDefined();
      expect(row.ticker).toBe(TEST_TICKER);
      expect(row.fiscalYear).toBe(2024);
      expect(row.fiscalQuarter).toBe(3);
      expect(row.sourceProvider).toBe('tiingo');
      expect(row.syncedAt).toBeInstanceOf(Date);
    });

    test('all 10 raw financial fields default to null', async () => {
      const row = await prisma.stockQuarterlyHistory.create({
        data: {
          ticker: TEST_TICKER,
          fiscalYear: 2024,
          fiscalQuarter: 2,
          sourceProvider: 'tiingo',
        },
      });
      expect(row.revenue).toBeNull();
      expect(row.grossProfit).toBeNull();
      expect(row.operatingIncome).toBeNull();
      expect(row.netIncome).toBeNull();
      expect(row.capex).toBeNull();
      expect(row.cashFromOperations).toBeNull();
      expect(row.freeCashFlow).toBeNull();
      expect(row.shareBasedCompensation).toBeNull();
      expect(row.depreciationAndAmortization).toBeNull();
      expect(row.dilutedSharesOutstanding).toBeNull();
    });

    test('all 7 per-quarter derived margin fields default to null', async () => {
      const row = await prisma.stockQuarterlyHistory.create({
        data: {
          ticker: TEST_TICKER,
          fiscalYear: 2024,
          fiscalQuarter: 1,
          sourceProvider: 'tiingo',
        },
      });
      expect(row.grossMargin).toBeNull();
      expect(row.operatingMargin).toBeNull();
      expect(row.netMargin).toBeNull();
      expect(row.cfoToNetIncomeRatio).toBeNull();
      expect(row.fcfMargin).toBeNull();
      expect(row.sbcAsPctRevenue).toBeNull();
      expect(row.dilutionYoy).toBeNull();
    });

    test('full row with all financial fields can be written', async () => {
      const row = await prisma.stockQuarterlyHistory.create({
        data: {
          ticker: TEST_TICKER,
          fiscalYear: 2024,
          fiscalQuarter: 3,
          sourceProvider: 'tiingo',
          sourceStatementType: 'quarterly_statements',
          fiscalPeriodEndDate: new Date('2024-09-30'),
          reportedDate: new Date('2024-10-28'),
          calendarYear: 2024,
          calendarQuarter: 3,
          revenue: 94930000000,
          grossProfit: 43881000000,
          operatingIncome: 29590000000,
          netIncome: 21448000000,
          capex: -3000000000,
          cashFromOperations: 26800000000,
          freeCashFlow: 23800000000,
          shareBasedCompensation: 3820000000,
          depreciationAndAmortization: 3000000000,
          dilutedSharesOutstanding: 15204000000,
          grossMargin: 0.462,
          operatingMargin: 0.311,
          netMargin: 0.226,
          cfoToNetIncomeRatio: 1.25,
          fcfMargin: 0.251,
          sbcAsPctRevenue: 0.040,
          dilutionYoy: -0.015,
        },
      });
      expect(row.revenue?.toString()).toBe('94930000000');
      expect(row.grossMargin?.toString()).toBe('0.462');
    });
  });

  // ── BDD Scenario 2: Unique constraint enforced ───────────────────────────────

  describe('unique constraint (ticker, fiscal_year, fiscal_quarter, source_provider)', () => {
    test('inserting duplicate key throws unique constraint violation', async () => {
      await prisma.stockQuarterlyHistory.create({
        data: {
          ticker: TEST_TICKER,
          fiscalYear: 2024,
          fiscalQuarter: 3,
          sourceProvider: 'tiingo',
        },
      });

      await expect(
        prisma.stockQuarterlyHistory.create({
          data: {
            ticker: TEST_TICKER,
            fiscalYear: 2024,
            fiscalQuarter: 3,
            sourceProvider: 'tiingo',
          },
        }),
      ).rejects.toThrow();
    });

    test('same ticker + period with different source_provider is allowed', async () => {
      await prisma.stockQuarterlyHistory.create({
        data: { ticker: TEST_TICKER, fiscalYear: 2024, fiscalQuarter: 3, sourceProvider: 'tiingo' },
      });
      const row2 = await prisma.stockQuarterlyHistory.create({
        data: { ticker: TEST_TICKER, fiscalYear: 2024, fiscalQuarter: 3, sourceProvider: 'fmp' },
      });
      expect(row2.sourceProvider).toBe('fmp');
    });

    test('upsert pattern does not throw on conflict — updates instead', async () => {
      await prisma.stockQuarterlyHistory.create({
        data: {
          ticker: TEST_TICKER,
          fiscalYear: 2024,
          fiscalQuarter: 3,
          sourceProvider: 'tiingo',
          revenue: 100000,
        },
      });

      const upserted = await prisma.stockQuarterlyHistory.upsert({
        where: {
          uq_sqh_ticker_period_provider: {
            ticker: TEST_TICKER,
            fiscalYear: 2024,
            fiscalQuarter: 3,
            sourceProvider: 'tiingo',
          },
        },
        update: { revenue: 200000 },
        create: {
          ticker: TEST_TICKER,
          fiscalYear: 2024,
          fiscalQuarter: 3,
          sourceProvider: 'tiingo',
          revenue: 200000,
        },
      });
      expect(upserted.revenue?.toString()).toBe('200000');
    });
  });

  // ── BDD Scenario 3: FK constraint ───────────────────────────────────────────

  describe('foreign key constraint', () => {
    test('inserting row for non-existent ticker throws FK violation', async () => {
      await expect(
        prisma.stockQuarterlyHistory.create({
          data: {
            ticker: 'XXXXXX',
            fiscalYear: 2024,
            fiscalQuarter: 3,
            sourceProvider: 'tiingo',
          },
        }),
      ).rejects.toThrow();
    });
  });

  // ── BDD Scenario 5: CASCADE DELETE ──────────────────────────────────────────

  describe('cascade delete', () => {
    test('deleting parent stock cascades to quarterly history rows', async () => {
      const cascadeTicker = 'CASDEL';
      await prisma.stock.upsert({
        where: { ticker: cascadeTicker },
        update: {},
        create: { ticker: cascadeTicker, companyName: 'Cascade Test', country: 'US', inUniverse: true },
      });
      await prisma.stockQuarterlyHistory.create({
        data: { ticker: cascadeTicker, fiscalYear: 2024, fiscalQuarter: 3, sourceProvider: 'tiingo' },
      });
      await prisma.stockQuarterlyHistory.create({
        data: { ticker: cascadeTicker, fiscalYear: 2024, fiscalQuarter: 2, sourceProvider: 'tiingo' },
      });

      await prisma.stock.delete({ where: { ticker: cascadeTicker } });

      const remaining = await prisma.stockQuarterlyHistory.findMany({ where: { ticker: cascadeTicker } });
      expect(remaining).toHaveLength(0);
    });
  });

  // ── Index existence ──────────────────────────────────────────────────────────

  describe('index existence', () => {
    test('idx_sqh_ticker_period index exists in pg_indexes', async () => {
      const result = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'stock_quarterly_history'
          AND indexname = 'idx_sqh_ticker_period'
      `;
      expect(result).toHaveLength(1);
    });

    test('uq_sqh_ticker_period_provider unique index exists', async () => {
      const result = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'stock_quarterly_history'
          AND indexname = 'uq_sqh_ticker_period_provider'
      `;
      expect(result).toHaveLength(1);
    });
  });

  // ── synced_at default ────────────────────────────────────────────────────────

  describe('synced_at behaviour', () => {
    test('synced_at is auto-populated to approximately now when not provided', async () => {
      const before = new Date();
      const row = await prisma.stockQuarterlyHistory.create({
        data: { ticker: TEST_TICKER, fiscalYear: 2023, fiscalQuarter: 4, sourceProvider: 'tiingo' },
      });
      const after = new Date();
      expect(row.syncedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(row.syncedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    test('synced_at can be explicitly overridden', async () => {
      const customDate = new Date('2024-10-01T12:00:00Z');
      const row = await prisma.stockQuarterlyHistory.create({
        data: {
          ticker: TEST_TICKER,
          fiscalYear: 2023,
          fiscalQuarter: 3,
          sourceProvider: 'tiingo',
          syncedAt: customDate,
        },
      });
      expect(row.syncedAt.toISOString()).toBe(customDate.toISOString());
    });
  });
});
