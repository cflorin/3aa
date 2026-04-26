// EPIC-003/STORY-058: stock_derived_metrics table migration
// RFC-008 §Classifier-Facing Derived Fields; ADR-015 §Schema
// TDD: tests written first — all should pass after migration applied

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_TICKER = 'DMTEST';

async function seedTestStock() {
  await prisma.stock.upsert({
    where: { ticker: TEST_TICKER },
    update: {},
    create: {
      ticker: TEST_TICKER,
      companyName: 'DM Test Corp',
      country: 'US',
      inUniverse: true,
    },
  });
}

async function cleanupTestData() {
  await prisma.stockDerivedMetrics.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.stock.deleteMany({ where: { ticker: TEST_TICKER } });
}

describe('EPIC-003/STORY-058: stock_derived_metrics schema', () => {
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
    await prisma.stockDerivedMetrics.deleteMany({ where: { ticker: TEST_TICKER } });
  });

  // ── BDD Scenario 1 & 2: Minimal insert with defaults ────────────────────────

  describe('table structure and defaults', () => {
    test('can insert minimal row with only ticker; defaults applied', async () => {
      const row = await prisma.stockDerivedMetrics.create({
        data: { ticker: TEST_TICKER },
      });
      expect(row.ticker).toBe(TEST_TICKER);
      expect(row.quartersAvailable).toBe(0);
      expect(row.derivedAsOf).toBeInstanceOf(Date);
      // provenance defaults to {}
      expect(row.provenance).toEqual({});
    });

    test('derived_as_of defaults to approximately NOW()', async () => {
      const before = new Date();
      const row = await prisma.stockDerivedMetrics.create({
        data: { ticker: TEST_TICKER },
      });
      const after = new Date();
      expect(row.derivedAsOf.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(row.derivedAsOf.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });
  });

  // ── BDD Scenario 3: All ~40 derived fields nullable ──────────────────────────

  describe('nullable derived fields', () => {
    test('all TTM rollup fields are null by default', async () => {
      const row = await prisma.stockDerivedMetrics.create({ data: { ticker: TEST_TICKER } });
      expect(row.revenueTtm).toBeNull();
      expect(row.grossProfitTtm).toBeNull();
      expect(row.operatingIncomeTtm).toBeNull();
      expect(row.netIncomeTtm).toBeNull();
      expect(row.capexTtm).toBeNull();
      expect(row.cashFromOperationsTtm).toBeNull();
      expect(row.freeCashFlowTtm).toBeNull();
      expect(row.shareBasedCompensationTtm).toBeNull();
      expect(row.depreciationAndAmortizationTtm).toBeNull();
    });

    test('all TTM margin fields are null by default', async () => {
      const row = await prisma.stockDerivedMetrics.create({ data: { ticker: TEST_TICKER } });
      expect(row.grossMarginTtm).toBeNull();
      expect(row.operatingMarginTtm).toBeNull();
      expect(row.netMarginTtm).toBeNull();
      expect(row.fcfMarginTtm).toBeNull();
      expect(row.sbcAsPctRevenueTtm).toBeNull();
      expect(row.cfoToNetIncomeRatioTtm).toBeNull();
    });

    test('all slope fields are null by default', async () => {
      const row = await prisma.stockDerivedMetrics.create({ data: { ticker: TEST_TICKER } });
      expect(row.grossMarginSlope4q).toBeNull();
      expect(row.operatingMarginSlope4q).toBeNull();
      expect(row.netMarginSlope4q).toBeNull();
      expect(row.grossMarginSlope8q).toBeNull();
      expect(row.operatingMarginSlope8q).toBeNull();
      expect(row.netMarginSlope8q).toBeNull();
    });

    test('all stability, EQ, dilution, and capital intensity fields are null by default', async () => {
      const row = await prisma.stockDerivedMetrics.create({ data: { ticker: TEST_TICKER } });
      // stability
      expect(row.operatingMarginStabilityScore).toBeNull();
      expect(row.grossMarginStabilityScore).toBeNull();
      expect(row.netMarginStabilityScore).toBeNull();
      // operating leverage
      expect(row.operatingLeverageRatio).toBeNull();
      expect(row.operatingIncomeAccelerationFlag).toBeNull();
      expect(row.operatingLeverageEmergingFlag).toBeNull();
      // EQ
      expect(row.earningsQualityTrendScore).toBeNull();
      expect(row.deterioratingCashConversionFlag).toBeNull();
      // dilution
      expect(row.dilutedSharesOutstandingChange4q).toBeNull();
      expect(row.dilutedSharesOutstandingChange8q).toBeNull();
      expect(row.materialDilutionTrendFlag).toBeNull();
      expect(row.sbcBurdenScore).toBeNull();
      // capital intensity
      expect(row.capexToRevenueRatioAvg4q).toBeNull();
      expect(row.capexIntensityIncreasingFlag).toBeNull();
    });
  });

  // ── BDD Scenario 4: FK enforces parent ──────────────────────────────────────

  describe('foreign key constraint', () => {
    test('inserting row for non-existent ticker throws FK violation', async () => {
      await expect(
        prisma.stockDerivedMetrics.create({ data: { ticker: 'XXXXXX' } }),
      ).rejects.toThrow();
    });
  });

  // ── BDD Scenario 5: CASCADE DELETE ──────────────────────────────────────────

  describe('cascade delete', () => {
    test('deleting parent stock cascades to derived metrics row', async () => {
      const cascadeTicker = 'DMCASC';
      await prisma.stock.upsert({
        where: { ticker: cascadeTicker },
        update: {},
        create: { ticker: cascadeTicker, companyName: 'DM Cascade Test', country: 'US', inUniverse: true },
      });
      await prisma.stockDerivedMetrics.create({ data: { ticker: cascadeTicker } });

      await prisma.stock.delete({ where: { ticker: cascadeTicker } });

      const row = await prisma.stockDerivedMetrics.findUnique({ where: { ticker: cascadeTicker } });
      expect(row).toBeNull();
    });
  });

  // ── BDD Scenario 6: Upsert pattern ──────────────────────────────────────────

  describe('upsert pattern (ticker PK)', () => {
    test('upsert creates row on first call', async () => {
      const row = await prisma.stockDerivedMetrics.upsert({
        where: { ticker: TEST_TICKER },
        update: { quartersAvailable: 8 },
        create: { ticker: TEST_TICKER, quartersAvailable: 8 },
      });
      expect(row.quartersAvailable).toBe(8);
    });

    test('upsert updates existing row without creating duplicate', async () => {
      await prisma.stockDerivedMetrics.create({ data: { ticker: TEST_TICKER, quartersAvailable: 4 } });

      const updated = await prisma.stockDerivedMetrics.upsert({
        where: { ticker: TEST_TICKER },
        update: { quartersAvailable: 12, revenueTtm: 100000000 },
        create: { ticker: TEST_TICKER, quartersAvailable: 12 },
      });
      expect(updated.quartersAvailable).toBe(12);
      expect(updated.revenueTtm?.toString()).toBe('100000000');

      const count = await prisma.stockDerivedMetrics.count({ where: { ticker: TEST_TICKER } });
      expect(count).toBe(1);
    });
  });

  // ── BDD Scenario 7: JSONB provenance ────────────────────────────────────────

  describe('provenance JSONB field', () => {
    test('provenance stores and retrieves arbitrary JSON', async () => {
      const provenanceData = {
        gross_margin_slope_4q: { source: 'tiingo', computed_at: '2026-04-25T12:00:00Z' },
        earnings_quality_trend_score: { method: 'cfo_ni_trend', quarters: 8 },
      };
      const row = await prisma.stockDerivedMetrics.create({
        data: { ticker: TEST_TICKER, provenance: provenanceData },
      });
      expect(row.provenance).toEqual(provenanceData);
    });
  });

  // ── BDD Scenario 8: Boolean flags (three-valued logic) ───────────────────────

  describe('boolean flags — three-valued logic', () => {
    test('operating_income_acceleration_flag can be true', async () => {
      const row = await prisma.stockDerivedMetrics.create({
        data: { ticker: TEST_TICKER, operatingIncomeAccelerationFlag: true },
      });
      expect(row.operatingIncomeAccelerationFlag).toBe(true);
    });

    test('material_dilution_trend_flag can be false (not null)', async () => {
      const row = await prisma.stockDerivedMetrics.create({
        data: { ticker: TEST_TICKER, materialDilutionTrendFlag: false },
      });
      expect(row.materialDilutionTrendFlag).toBe(false);
    });

    test('deteriorating_cash_conversion_flag defaults to null when not provided', async () => {
      const row = await prisma.stockDerivedMetrics.create({ data: { ticker: TEST_TICKER } });
      expect(row.deterioratingCashConversionFlag).toBeNull();
    });
  });

  // ── Full row write ────────────────────────────────────────────────────────────

  describe('full row with all fields', () => {
    test('can write and read back a row with all computed fields populated', async () => {
      const row = await prisma.stockDerivedMetrics.create({
        data: {
          ticker: TEST_TICKER,
          quartersAvailable: 12,
          revenueTtm: 383285000000,
          grossMarginTtm: 0.462,
          operatingMarginTtm: 0.311,
          operatingMarginSlope4q: 0.0025,
          operatingMarginSlope8q: 0.0015,
          operatingMarginStabilityScore: 0.85,
          earningsQualityTrendScore: 0.42,
          deterioratingCashConversionFlag: false,
          materialDilutionTrendFlag: false,
          operatingIncomeAccelerationFlag: true,
          sbcBurdenScore: 0.04,
          capexToRevenueRatioAvg4q: 0.032,
          capexIntensityIncreasingFlag: false,
        },
      });
      expect(row.quartersAvailable).toBe(12);
      expect(Number(row.operatingMarginStabilityScore)).toBeCloseTo(0.85, 2);
      expect(Number(row.earningsQualityTrendScore)).toBeCloseTo(0.42, 2);
      expect(row.operatingIncomeAccelerationFlag).toBe(true);
    });
  });
});
