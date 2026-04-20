// EPIC-001: Platform Foundation & Deployment
// STORY-005: Create Framework Configuration Seed Data
// TASK-005-004: Integration tests — verify seed data correctness and idempotency

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

// Run the seed script programmatically against the test DB
function runSeed() {
  execSync('dotenv -e .env.test -- npx prisma db seed', {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}

describe('EPIC-001/STORY-005: Framework Seed Data', () => {
  beforeAll(async () => {
    await prisma.$connect();
    // Apply seed to test DB
    runSeed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── Framework Version ──────────────────────────────────────────────────────

  test('framework_version has exactly 1 row with version v1.0', async () => {
    const rows = await prisma.frameworkVersion.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe('v1.0');
    expect(rows[0].description).toBe(
      '3AA Investment Classification and Monitoring Framework - Initial V1',
    );
    expect(rows[0].effectiveUntil).toBeNull();
  });

  // ── Anchored Thresholds — row counts and codes ────────────────────────────

  test('anchored_thresholds has exactly 16 rows', async () => {
    const count = await prisma.anchoredThreshold.count();
    expect(count).toBe(16);
  });

  test('anchored_thresholds contains all 16 expected codes', async () => {
    const codes = (await prisma.anchoredThreshold.findMany({ select: { code: true } }))
      .map((r) => r.code)
      .sort();
    expect(codes).toEqual(
      ['1AA', '1BA', '2AA', '2BA', '3AA', '3BA', '4AA', '4BA', '5AA', '5BA', '5BB', '6AA', '6BA', '6BB', '7AA', '7BA'].sort(),
    );
  });

  test('no anchored thresholds for bucket 8 (no stable metric)', async () => {
    const bucket8 = await prisma.anchoredThreshold.findMany({ where: { bucket: 8 } });
    expect(bucket8).toHaveLength(0);
  });

  // ── Anchored Thresholds — spot-check key values ───────────────────────────

  test('4AA threshold matches source-of-truth (elite compounder — Microsoft archetype)', async () => {
    const row = await prisma.anchoredThreshold.findUnique({ where: { code: '4AA' } });
    expect(row).not.toBeNull();
    expect(row!.bucket).toBe(4);
    expect(row!.earningsQuality).toBe('A');
    expect(row!.balanceSheetQuality).toBe('A');
    expect(row!.primaryMetric).toBe('forward_pe');
    expect(Number(row!.maxThreshold)).toBe(22.0);
    expect(Number(row!.comfortableThreshold)).toBe(20.0);
    expect(Number(row!.veryGoodThreshold)).toBe(18.0);
    expect(Number(row!.stealThreshold)).toBe(16.0);
  });

  test('3AA uses forward_operating_earnings_ex_excess_cash (Berkshire-type stalwart exception)', async () => {
    const row = await prisma.anchoredThreshold.findUnique({ where: { code: '3AA' } });
    expect(row!.primaryMetric).toBe('forward_operating_earnings_ex_excess_cash');
    expect(Number(row!.maxThreshold)).toBe(18.5);
    expect(Number(row!.comfortableThreshold)).toBe(17.0);
    expect(Number(row!.veryGoodThreshold)).toBe(15.5);
    expect(Number(row!.stealThreshold)).toBe(14.0);
  });

  test('4BA threshold matches spec (Adobe archetype — lower durability compounder)', async () => {
    const row = await prisma.anchoredThreshold.findUnique({ where: { code: '4BA' } });
    expect(Number(row!.maxThreshold)).toBe(14.5);
    expect(Number(row!.comfortableThreshold)).toBe(13.0);
    expect(Number(row!.veryGoodThreshold)).toBe(11.5);
    expect(Number(row!.stealThreshold)).toBe(10.0);
  });

  test('5BB uses forward_ev_ebit with correct values', async () => {
    const row = await prisma.anchoredThreshold.findUnique({ where: { code: '5BB' } });
    expect(row!.primaryMetric).toBe('forward_ev_ebit');
    expect(Number(row!.maxThreshold)).toBe(15.0);
    expect(Number(row!.comfortableThreshold)).toBe(13.0);
    expect(Number(row!.veryGoodThreshold)).toBe(11.0);
    expect(Number(row!.stealThreshold)).toBe(9.0);
  });

  // ── Anchored Thresholds — ordering invariant ──────────────────────────────

  test('all threshold rows satisfy max > comfortable > very_good > steal', async () => {
    const rows = await prisma.anchoredThreshold.findMany();
    for (const row of rows) {
      const max = Number(row.maxThreshold);
      const comfortable = Number(row.comfortableThreshold);
      const veryGood = Number(row.veryGoodThreshold);
      const steal = Number(row.stealThreshold);
      expect(max).toBeGreaterThan(comfortable);
      expect(comfortable).toBeGreaterThan(veryGood);
      expect(veryGood).toBeGreaterThan(steal);
    }
  });

  // ── TSR Hurdles ───────────────────────────────────────────────────────────

  test('tsr_hurdles has exactly 8 rows (one per bucket)', async () => {
    const count = await prisma.tsrHurdle.count();
    expect(count).toBe(8);
  });

  test('all buckets 1-8 are present in tsr_hurdles', async () => {
    const buckets = (await prisma.tsrHurdle.findMany({ select: { bucket: true }, orderBy: { bucket: 'asc' } }))
      .map((r) => r.bucket);
    expect(buckets).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('bucket 4 TSR hurdle matches spec (12-13%, default 12.50)', async () => {
    const row = await prisma.tsrHurdle.findUnique({ where: { bucket: 4 } });
    expect(row!.baseHurdleLabel).toBe('12-13%');
    expect(Number(row!.baseHurdleDefault)).toBe(12.5);
  });

  test('bucket 8 TSR hurdle has null baseHurdleDefault (no normal hurdle — speculation only)', async () => {
    const row = await prisma.tsrHurdle.findUnique({ where: { bucket: 8 } });
    expect(row!.baseHurdleLabel).toBe('No normal hurdle');
    expect(row!.baseHurdleDefault).toBeNull();
  });

  test('all TSR hurdle quality adjustments match spec across all buckets', async () => {
    const rows = await prisma.tsrHurdle.findMany();
    for (const row of rows) {
      expect(Number(row.earningsQualityAAdjustment)).toBe(-1.0);
      expect(Number(row.earningsQualityBAdjustment)).toBe(0.0);
      expect(Number(row.earningsQualityCAdjustment)).toBe(2.5);
      expect(Number(row.balanceSheetAAdjustment)).toBe(-0.5);
      expect(Number(row.balanceSheetBAdjustment)).toBe(0.0);
      expect(Number(row.balanceSheetCAdjustment)).toBe(1.75);
    }
  });

  test('TSR hurdle formula: 4AA adjusted = 12.50 + (-1.0) + (-0.5) = 11.0', async () => {
    const hurdle = await prisma.tsrHurdle.findUnique({ where: { bucket: 4 } });
    const base = Number(hurdle!.baseHurdleDefault);
    const eqA = Number(hurdle!.earningsQualityAAdjustment);
    const bsA = Number(hurdle!.balanceSheetAAdjustment);
    // 4AA: earnings quality A, balance sheet A
    const adjusted = base + eqA + bsA;
    expect(adjusted).toBeCloseTo(11.0, 2);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  test('seed is idempotent — running twice produces no duplicates', async () => {
    // Run seed a second time
    runSeed();

    const fvCount = await prisma.frameworkVersion.count();
    const atCount = await prisma.anchoredThreshold.count();
    const tsrCount = await prisma.tsrHurdle.count();

    expect(fvCount).toBe(1);
    expect(atCount).toBe(16);
    expect(tsrCount).toBe(8);
  });
});
