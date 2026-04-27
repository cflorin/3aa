// EPIC-001: Platform Foundation & Deployment
// STORY-005: Create Framework Configuration Seed Data
// TASK-005-002: Prisma seed script — framework_version, anchored_thresholds, tsr_hurdles
//
// Idempotent: uses upsert so re-running never creates duplicates or errors.
// Source of truth: /docs/prd/source_of_truth_investment_framework_3AA.md
//                  /docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── 1. Framework Version ────────────────────────────────────────────────────
  await prisma.frameworkVersion.upsert({
    where: { version: 'v1.0' },
    update: {
      description: '3AA Investment Classification and Monitoring Framework - Initial V1',
    },
    create: {
      version: 'v1.0',
      description: '3AA Investment Classification and Monitoring Framework - Initial V1',
    },
  });

  // ── 2. Anchored Thresholds (16 rows) ────────────────────────────────────────
  // Source: /docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 2
  // Threshold ordering invariant: max > comfortable > very_good > steal (enforced by spec)
  const thresholds = [
    // Bucket 1 — Decline / harvest
    { code: '1AA', bucket: 1, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 10.0, comfortableThreshold: 8.5,  veryGoodThreshold: 7.0,  stealThreshold: 5.5  },
    { code: '1BA', bucket: 1, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 8.5,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
    // Bucket 2 — Defensive cash machine
    { code: '2AA', bucket: 2, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 16.0, comfortableThreshold: 14.0, veryGoodThreshold: 12.5, stealThreshold: 11.0 },
    { code: '2BA', bucket: 2, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 13.5, comfortableThreshold: 12.0, veryGoodThreshold: 10.5, stealThreshold: 9.0  },
    // Bucket 3 — Durable stalwart
    // 3AA exception: Berkshire-type uses forward operating earnings ex excess cash
    { code: '3AA', bucket: 3, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_operating_earnings_ex_excess_cash', maxThreshold: 18.5, comfortableThreshold: 17.0, veryGoodThreshold: 15.5, stealThreshold: 14.0 },
    { code: '3BA', bucket: 3, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 15.0, comfortableThreshold: 13.5, veryGoodThreshold: 12.0, stealThreshold: 10.5 },
    // Bucket 4 — Elite compounder
    { code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0 },
    { code: '4BA', bucket: 4, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 14.5, comfortableThreshold: 13.0, veryGoodThreshold: 11.5, stealThreshold: 10.0 },
    // Bucket 5 — Operating leverage grower (EV/EBIT)
    { code: '5AA', bucket: 5, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 20.0, comfortableThreshold: 17.0, veryGoodThreshold: 14.5, stealThreshold: 12.0 },
    { code: '5BA', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 17.0, comfortableThreshold: 15.0, veryGoodThreshold: 13.0, stealThreshold: 11.0 },
    { code: '5BB', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'B', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 15.0, comfortableThreshold: 13.0, veryGoodThreshold: 11.0, stealThreshold: 9.0  },
    // Bucket 6 — High-growth emerging compounder (EV/Sales)
    { code: '6AA', bucket: 6, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 12.0, comfortableThreshold: 10.0, veryGoodThreshold: 8.0,  stealThreshold: 6.0  },
    { code: '6BA', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 9.0,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
    { code: '6BB', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'B', primaryMetric: 'ev_sales',                                 maxThreshold: 7.0,  comfortableThreshold: 5.5,  veryGoodThreshold: 4.5,  stealThreshold: 3.0  },
    // Bucket 7 — Hypergrowth / venture-like (EV/Sales)
    { code: '7AA', bucket: 7, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 18.0, comfortableThreshold: 15.0, veryGoodThreshold: 11.0, stealThreshold: 8.0  },
    { code: '7BA', bucket: 7, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 14.0, comfortableThreshold: 11.0, veryGoodThreshold: 8.5,  stealThreshold: 6.0  },
    // Bucket 8 — Lottery / binary: no thresholds (no stable metric)
  ] as const;

  for (const t of thresholds) {
    await prisma.anchoredThreshold.upsert({
      where: { code: t.code },
      update: {
        bucket: t.bucket,
        earningsQuality: t.earningsQuality,
        balanceSheetQuality: t.balanceSheetQuality,
        primaryMetric: t.primaryMetric,
        maxThreshold: t.maxThreshold,
        comfortableThreshold: t.comfortableThreshold,
        veryGoodThreshold: t.veryGoodThreshold,
        stealThreshold: t.stealThreshold,
      },
      create: {
        code: t.code,
        bucket: t.bucket,
        earningsQuality: t.earningsQuality,
        balanceSheetQuality: t.balanceSheetQuality,
        primaryMetric: t.primaryMetric,
        maxThreshold: t.maxThreshold,
        comfortableThreshold: t.comfortableThreshold,
        veryGoodThreshold: t.veryGoodThreshold,
        stealThreshold: t.stealThreshold,
      },
    });
  }

  // ── 3. TSR Hurdles (8 rows — one per bucket) ────────────────────────────────
  // Source: /docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 4
  // Quality adjustments are uniform across all buckets per the spec.
  // Bucket 8 has baseHurdleDefault = null (no normal hurdle; speculation only).
  const tsrHurdles = [
    { bucket: 1, baseHurdleLabel: '14-16%+',         baseHurdleDefault: 15.00 },
    { bucket: 2, baseHurdleLabel: '10-11%',           baseHurdleDefault: 10.50 },
    { bucket: 3, baseHurdleLabel: '11-12%',           baseHurdleDefault: 11.50 },
    { bucket: 4, baseHurdleLabel: '12-13%',           baseHurdleDefault: 12.50 },
    { bucket: 5, baseHurdleLabel: '14-16%',           baseHurdleDefault: 15.00 },
    { bucket: 6, baseHurdleLabel: '18-20%+',          baseHurdleDefault: 19.00 },
    { bucket: 7, baseHurdleLabel: '25%+',             baseHurdleDefault: 25.00 },
    { bucket: 8, baseHurdleLabel: 'No normal hurdle', baseHurdleDefault: null  },
  ] as const;

  for (const h of tsrHurdles) {
    await prisma.tsrHurdle.upsert({
      where: { bucket: h.bucket },
      update: {
        baseHurdleLabel: h.baseHurdleLabel,
        baseHurdleDefault: h.baseHurdleDefault,
        // Adjustments are spec-defined defaults; update keeps them in sync if spec changes
        earningsQualityAAdjustment: -1.0,
        earningsQualityBAdjustment: 0.0,
        earningsQualityCAdjustment: 2.5,
        balanceSheetAAdjustment: -0.5,
        balanceSheetBAdjustment: 0.0,
        balanceSheetCAdjustment: 1.75,
      },
      create: {
        bucket: h.bucket,
        baseHurdleLabel: h.baseHurdleLabel,
        baseHurdleDefault: h.baseHurdleDefault,
        earningsQualityAAdjustment: -1.0,
        earningsQualityBAdjustment: 0.0,
        earningsQualityCAdjustment: 2.5,
        balanceSheetAAdjustment: -0.5,
        balanceSheetBAdjustment: 0.0,
        balanceSheetCAdjustment: 1.75,
      },
    });
  }

  // ── EPIC-008/STORY-089: ValuationRegimeThreshold seed (ADR-005 amended, ADR-017)
  // 9 rows, one per ValuationRegime. profitable_growth_pe = high-tier base (≥35% growth).
  // null thresholds for not_applicable, manual_required, financial_special_case.
  const regimeThresholds = [
    { regime: 'mature_pe',                   metric: 'forward_pe',                                   max: 22.0, comfortable: 20.0, veryGood: 18.0, steal: 16.0, notes: 'Profitable stable business, growth < 20%' },
    { regime: 'profitable_growth_pe',        metric: 'forward_pe',                                   max: 36.0, comfortable: 30.0, veryGood: 24.0, steal: 18.0, notes: 'High-tier base (≥35% growth); mid/standard tiers are runtime constants' },
    { regime: 'profitable_growth_ev_ebit',   metric: 'forward_ev_ebit',                              max: 24.0, comfortable: 20.0, veryGood: 16.0, steal: 12.0, notes: 'Profitable transitional 15-25% growth, op_margin 10-25%' },
    { regime: 'cyclical_earnings',           metric: 'forward_ev_ebit',                              max: 16.0, comfortable: 13.0, veryGood: 10.0, steal:  7.0, notes: 'Cyclical earnings; cycle-position overlay applied separately' },
    { regime: 'sales_growth_standard',       metric: 'ev_sales',                                     max: 12.0, comfortable: 10.0, veryGood:  8.0, steal:  6.0, notes: 'Pre-earnings revenue growth' },
    { regime: 'sales_growth_hyper',          metric: 'ev_sales',                                     max: 18.0, comfortable: 15.0, veryGood: 11.0, steal:  8.0, notes: 'Hyper-growth ≥40% revenue, gross_margin ≥70%' },
    { regime: 'financial_special_case',      metric: 'forward_operating_earnings_ex_excess_cash',    max: null,  comfortable: null,  veryGood: null,  steal: null,  notes: 'Insurer/holding company; thresholds set manually' },
    { regime: 'not_applicable',              metric: 'no_stable_metric',                             max: null,  comfortable: null,  veryGood: null,  steal: null,  notes: 'Bucket 8 / lottery — no valuation metric' },
    { regime: 'manual_required',             metric: 'no_stable_metric',                             max: null,  comfortable: null,  veryGood: null,  steal: null,  notes: 'Bank flag or catch-all; automated metric not possible' },
  ] as const;

  for (const row of regimeThresholds) {
    await prisma.valuationRegimeThreshold.upsert({
      where: { regime: row.regime },
      update: {
        primaryMetric: row.metric,
        maxThreshold: row.max !== null ? row.max : null,
        comfortableThreshold: row.comfortable !== null ? row.comfortable : null,
        veryGoodThreshold: row.veryGood !== null ? row.veryGood : null,
        stealThreshold: row.steal !== null ? row.steal : null,
        notes: row.notes,
      },
      create: {
        regime: row.regime,
        primaryMetric: row.metric,
        maxThreshold: row.max !== null ? row.max : null,
        comfortableThreshold: row.comfortable !== null ? row.comfortable : null,
        veryGoodThreshold: row.veryGood !== null ? row.veryGood : null,
        stealThreshold: row.steal !== null ? row.steal : null,
        notes: row.notes,
      },
    });
  }

  console.log('Seed complete: 1 framework_version, 16 anchored_thresholds, 8 tsr_hurdles, 9 valuation_regime_thresholds');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
