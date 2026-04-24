// EPIC-004: Classification Engine & Universe Screen
// STORY-043: Classification Result Assembly (Tie-Break, Confidence, Special Cases)
// TASK-043-004: Integration tests — classifyStock against test DB (5 golden stocks)
//
// Requires: test DB at DATABASE_URL with MSFT, ADBE, TSLA, UBER, UNH data
// Growth fields stored as percentages in DB (7.24 = 7.24%) — converted to decimal fractions here
// Ratio/margin fields stored as decimal fractions in DB — used as-is
// RFC-001 §ClassificationResult; ADR-013 (scoring weights); ADR-014 (confidence thresholds)

import { PrismaClient } from '@prisma/client';
import { classifyStock } from '../../../src/domain/classification/classifier';
import type { ClassificationInput } from '../../../src/domain/classification/types';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

const STOCK_FIELDS = {
  revenueGrowthFwd: true, revenueGrowth3y: true, epsGrowthFwd: true, epsGrowth3y: true,
  grossProfitGrowth: true, operatingMargin: true, fcfMargin: true, fcfConversion: true,
  roic: true, fcfPositive: true, netIncomePositive: true,
  netDebtToEbitda: true, interestCoverage: true,
  moatStrengthScore: true, pricingPowerScore: true, revenueRecurrenceScore: true,
  marginDurabilityScore: true, capitalIntensityScore: true, qualitativeCyclicalityScore: true,
  holdingCompanyFlag: true, insurerFlag: true, cyclicalityFlag: true,
  optionalityFlag: true, binaryFlag: true, preOperatingLeverageFlag: true,
} as const;

function toClassificationInput(s: {
  revenueGrowthFwd: any; revenueGrowth3y: any; epsGrowthFwd: any; epsGrowth3y: any;
  grossProfitGrowth: any; operatingMargin: any; fcfMargin: any; fcfConversion: any;
  roic: any; fcfPositive: boolean | null; netIncomePositive: boolean | null;
  netDebtToEbitda: any; interestCoverage: any;
  moatStrengthScore: any; pricingPowerScore: any; revenueRecurrenceScore: any;
  marginDurabilityScore: any; capitalIntensityScore: any; qualitativeCyclicalityScore: any;
  holdingCompanyFlag: boolean | null; insurerFlag: boolean | null;
  cyclicalityFlag: boolean | null; optionalityFlag: boolean | null;
  binaryFlag: boolean | null; preOperatingLeverageFlag: boolean | null;
}): ClassificationInput {
  const pct = (v: any) => (v !== null && v !== undefined ? Number(v) / 100 : null);
  const num = (v: any) => (v !== null && v !== undefined ? Number(v) : null);
  return {
    revenue_growth_fwd: pct(s.revenueGrowthFwd),
    revenue_growth_3y: pct(s.revenueGrowth3y),
    eps_growth_fwd: pct(s.epsGrowthFwd),
    eps_growth_3y: pct(s.epsGrowth3y),
    gross_profit_growth: pct(s.grossProfitGrowth),
    operating_margin: num(s.operatingMargin),
    fcf_margin: num(s.fcfMargin),
    fcf_conversion: num(s.fcfConversion),
    roic: num(s.roic),
    fcf_positive: s.fcfPositive ?? null,
    net_income_positive: s.netIncomePositive ?? null,
    net_debt_to_ebitda: num(s.netDebtToEbitda),
    interest_coverage: num(s.interestCoverage),
    moat_strength_score: num(s.moatStrengthScore),
    pricing_power_score: num(s.pricingPowerScore),
    revenue_recurrence_score: num(s.revenueRecurrenceScore),
    margin_durability_score: num(s.marginDurabilityScore),
    capital_intensity_score: num(s.capitalIntensityScore),
    qualitative_cyclicality_score: num(s.qualitativeCyclicalityScore),
    holding_company_flag: s.holdingCompanyFlag ?? null,
    insurer_flag: s.insurerFlag ?? null,
    cyclicality_flag: s.cyclicalityFlag ?? null,
    optionality_flag: s.optionalityFlag ?? null,
    binary_flag: s.binaryFlag ?? null,
    pre_operating_leverage_flag: s.preOperatingLeverageFlag ?? null,
  };
}

describe('EPIC-004/STORY-043/TASK-043-004: classifyStock integration tests', () => {

  describe('MSFT — B3/B4 tie-break → B3, eq=A, bs=A', () => {
    it('MSFT: classifyStock returns suggested_code="3AA"', async () => {
      const stock = await prisma.stock.findUnique({ where: { ticker: 'MSFT' }, select: STOCK_FIELDS });
      if (!stock) { console.warn('MSFT not in test DB — skipping'); return; }

      const r = classifyStock(toClassificationInput(stock));
      expect(r.bucket).toBe(3);
      expect(r.eq_grade).toBe('A');
      expect(r.bs_grade).toBe('A');
      expect(r.suggested_code).toBe('3AA');
      expect(r.confidence_level).toBe('low'); // margin=1, tie-break fired
    });
  });

  describe('ADBE — B3/B4 tie-break → B4, eq=A, bs=A', () => {
    it('ADBE: classifyStock returns suggested_code="4AA"', async () => {
      const stock = await prisma.stock.findUnique({ where: { ticker: 'ADBE' }, select: STOCK_FIELDS });
      if (!stock) { console.warn('ADBE not in test DB — skipping'); return; }

      const r = classifyStock(toClassificationInput(stock));
      expect(r.bucket).toBe(4);
      expect(r.eq_grade).toBe('A');
      expect(r.bs_grade).toBe('A');
      expect(r.suggested_code).toBe('4AA');
    });
  });

  describe('UNH — B1 winner (negative-metrics snapshot), bs=C', () => {
    it('UNH: classifyStock returns bucket=1, bs_grade="C"', async () => {
      const stock = await prisma.stock.findUnique({ where: { ticker: 'UNH' }, select: STOCK_FIELDS });
      if (!stock) { console.warn('UNH not in test DB — skipping'); return; }

      const r = classifyStock(toClassificationInput(stock));
      expect(r.bucket).toBe(1);
      expect(r.bs_grade).toBe('C');
      expect(r.confidence_level).toBe('low');
    });
  });

  describe('Invariants: output contract for all 5 test DB stocks', () => {
    it('suggested_code is null or matches /^[1-8]([ABC][ABC])?$/', async () => {
      const stocks = await prisma.stock.findMany({
        where: { ticker: { in: ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'] } },
        select: { ticker: true, ...STOCK_FIELDS },
      });
      for (const stock of stocks) {
        const r = classifyStock(toClassificationInput(stock));
        if (r.suggested_code !== null) {
          expect(r.suggested_code).toMatch(/^[1-8]([ABC][ABC])?$/);
        }
      }
    });

    it('confidence_level is always "high"|"medium"|"low" for all test DB stocks', async () => {
      const stocks = await prisma.stock.findMany({
        where: { ticker: { in: ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'] } },
        select: { ticker: true, ...STOCK_FIELDS },
      });
      for (const stock of stocks) {
        const r = classifyStock(toClassificationInput(stock));
        expect(['high', 'medium', 'low']).toContain(r.confidence_level);
        expect(Array.isArray(r.tieBreaksFired)).toBe(true);
        expect(r.confidenceBreakdown.steps.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
