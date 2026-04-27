// EPIC-008: Valuation Regime Decoupling
// STORY-089: Schema Migration — Regime Decoupling + ValuationRegimeThreshold Seed
// TASK-089-006: Schema contract tests

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('EPIC-008/STORY-089/TASK-089-006: Schema contract — new columns and table exist', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── valuation_regime_thresholds table ──────────────────────────────────────

  test('valuation_regime_thresholds table exists', async () => {
    const result = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'valuation_regime_thresholds'
    `;
    expect(result).toHaveLength(1);
  });

  test('valuation_regime_thresholds has all required columns', async () => {
    const required = [
      'regime', 'primary_metric',
      'max_threshold', 'comfortable_threshold', 'very_good_threshold', 'steal_threshold',
      'effective_from', 'effective_until', 'notes',
    ];
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'valuation_regime_thresholds'
    `;
    const cols = result.map((r) => r.column_name);
    for (const col of required) {
      expect(cols).toContain(col);
    }
  });

  test('valuation_regime_thresholds has 9 seeded rows', async () => {
    const count = await prisma.valuationRegimeThreshold.count();
    expect(count).toBe(9);
  });

  test('all 9 regime values are present', async () => {
    const rows = await prisma.valuationRegimeThreshold.findMany({ select: { regime: true } });
    const regimes = rows.map((r) => r.regime);
    const expected = [
      'mature_pe',
      'profitable_growth_pe',
      'profitable_growth_ev_ebit',
      'cyclical_earnings',
      'sales_growth_standard',
      'sales_growth_hyper',
      'financial_special_case',
      'not_applicable',
      'manual_required',
    ];
    for (const regime of expected) {
      expect(regimes).toContain(regime);
    }
  });

  test('null-threshold regimes have null thresholds', async () => {
    const nullRegimes = ['financial_special_case', 'not_applicable', 'manual_required'];
    for (const regime of nullRegimes) {
      const row = await prisma.valuationRegimeThreshold.findUnique({ where: { regime } });
      expect(row).not.toBeNull();
      expect(row!.maxThreshold).toBeNull();
      expect(row!.comfortableThreshold).toBeNull();
      expect(row!.veryGoodThreshold).toBeNull();
      expect(row!.stealThreshold).toBeNull();
    }
  });

  test('threshold ordering: max >= comfortable >= veryGood >= steal for quantitative regimes', async () => {
    const quantitative = ['mature_pe', 'profitable_growth_pe', 'profitable_growth_ev_ebit',
      'cyclical_earnings', 'sales_growth_standard', 'sales_growth_hyper'];
    for (const regime of quantitative) {
      const row = await prisma.valuationRegimeThreshold.findUnique({ where: { regime } });
      expect(row).not.toBeNull();
      const max = Number(row!.maxThreshold);
      const comfortable = Number(row!.comfortableThreshold);
      const veryGood = Number(row!.veryGoodThreshold);
      const steal = Number(row!.stealThreshold);
      expect(max).toBeGreaterThanOrEqual(comfortable);
      expect(comfortable).toBeGreaterThanOrEqual(veryGood);
      expect(veryGood).toBeGreaterThanOrEqual(steal);
    }
  });

  // ── stocks table new columns ───────────────────────────────────────────────

  test('stocks table has bank_flag column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stocks' AND column_name = 'bank_flag'
    `;
    expect(result).toHaveLength(1);
    expect(result[0].data_type).toBe('boolean');
  });

  test('stocks table has structural_cyclicality_score column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stocks'
        AND column_name = 'structural_cyclicality_score'
    `;
    expect(result).toHaveLength(1);
  });

  test('stocks table has cycle_position column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stocks' AND column_name = 'cycle_position'
    `;
    expect(result).toHaveLength(1);
  });

  test('stocks table has cyclical_confidence column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stocks' AND column_name = 'cyclical_confidence'
    `;
    expect(result).toHaveLength(1);
  });

  test('bank_flag defaults to false', async () => {
    const result = await prisma.$queryRaw<{ column_default: string }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stocks' AND column_name = 'bank_flag'
    `;
    expect(result[0].column_default).toBe('false');
  });

  // ── valuation_state new columns ────────────────────────────────────────────

  test('valuation_state has all 8 new EPIC-008 columns', async () => {
    const newCols = [
      'valuation_regime',
      'threshold_family',
      'structural_cyclicality_score_snapshot',
      'cycle_position_snapshot',
      'cyclical_overlay_applied',
      'cyclical_overlay_value',
      'cyclical_confidence',
      'growth_tier',
    ];
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'valuation_state'
    `;
    const cols = result.map((r) => r.column_name);
    for (const col of newCols) {
      expect(cols).toContain(col);
    }
  });

  test('valuation_state.valuation_state_status defaults to computed', async () => {
    const result = await prisma.$queryRaw<{ column_default: string }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'valuation_state'
        AND column_name = 'valuation_state_status'
    `;
    expect(result[0].column_default).toBe("'computed'::character varying");
  });

  test('idx_valuation_regime index exists', async () => {
    const result = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_valuation_regime'
    `;
    expect(result).toHaveLength(1);
  });
});
