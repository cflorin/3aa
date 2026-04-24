// EPIC-004: Classification Engine & Universe Screen
// STORY-042: Earnings Quality and Balance Sheet Quality Scoring
// TASK-042-005: Integration tests — EarningsQualityScorer and BalanceSheetQualityScorer against test DB
//
// Requires: test DB at DATABASE_URL with MSFT and UNH data
// Growth fields stored as percentages in DB (7.24 = 7.24%) — converted to decimal fractions here
// Ratio/margin fields stored as decimal fractions in DB — used as-is
// EQ/BS scorer inputs: fcf_conversion, net_debt_to_ebitda, interest_coverage, moat_strength_score
//   are all ratio/score fields → no conversion needed for EQ and BS scorers specifically
// RFC-001 §Earnings Quality Scorer; §Balance Sheet Quality Scorer; ADR-013 §EQ/BS Scorer Weights

import { PrismaClient } from '@prisma/client';
import { EarningsQualityScorer } from '../../../src/domain/classification/eq-scorer';
import { BalanceSheetQualityScorer } from '../../../src/domain/classification/bs-scorer';
import type { ClassificationInput } from '../../../src/domain/classification/types';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

// Prisma uses camelCase field names mapped to snake_case DB columns
const STOCK_FIELDS = {
  fcfConversion: true, fcfPositive: true, netIncomePositive: true,
  netDebtToEbitda: true, interestCoverage: true,
  moatStrengthScore: true, capitalIntensityScore: true,
} as const;

// Convert Prisma stock record to the subset of ClassificationInput needed for EQ/BS scorers.
// All EQ/BS fields are ratio/score fields (no growth percentages involved).
function toInput(s: {
  fcfConversion: any; fcfPositive: boolean | null; netIncomePositive: boolean | null;
  netDebtToEbitda: any; interestCoverage: any;
  moatStrengthScore: any; capitalIntensityScore: any;
}): Pick<ClassificationInput,
  'fcf_conversion' | 'fcf_positive' | 'net_income_positive' |
  'net_debt_to_ebitda' | 'interest_coverage' |
  'moat_strength_score' | 'capital_intensity_score'
> {
  const num = (v: any) => (v !== null && v !== undefined ? Number(v) : null);
  return {
    fcf_conversion: num(s.fcfConversion),
    fcf_positive: s.fcfPositive ?? null,
    net_income_positive: s.netIncomePositive ?? null,
    net_debt_to_ebitda: num(s.netDebtToEbitda),
    interest_coverage: num(s.interestCoverage),
    moat_strength_score: num(s.moatStrengthScore),
    capital_intensity_score: num(s.capitalIntensityScore),
  };
}

function fullInput(partial: ReturnType<typeof toInput>): ClassificationInput {
  return {
    revenue_growth_fwd: null, revenue_growth_3y: null, eps_growth_fwd: null, eps_growth_3y: null,
    gross_profit_growth: null, operating_margin: null, fcf_margin: null, roic: null,
    pricing_power_score: null, revenue_recurrence_score: null, margin_durability_score: null,
    qualitative_cyclicality_score: null, holding_company_flag: null, insurer_flag: null,
    cyclicality_flag: null, optionality_flag: null, binary_flag: null,
    pre_operating_leverage_flag: null,
    ...partial,
  };
}

describe('EPIC-004/STORY-042/TASK-042-005: EQ and BS Scorer integration tests', () => {

  describe('MSFT — strong EQ and BS expected', () => {
    it('MSFT: EarningsQualityScorer winner=A (strong FCF conversion, strong moat)', async () => {
      const stock = await prisma.stock.findUnique({ where: { ticker: 'MSFT' }, select: STOCK_FIELDS });
      if (!stock) { console.warn('MSFT not in test DB — skipping'); return; }

      const r = EarningsQualityScorer(fullInput(toInput(stock)));
      expect(r.winner).toBe('A');
    });

    it('MSFT: BalanceSheetQualityScorer winner=A (low leverage, strong coverage)', async () => {
      const stock = await prisma.stock.findUnique({ where: { ticker: 'MSFT' }, select: STOCK_FIELDS });
      if (!stock) { console.warn('MSFT not in test DB — skipping'); return; }

      const r = BalanceSheetQualityScorer(fullInput(toInput(stock)));
      expect(r.winner).toBe('A');
    });
  });

  describe('UNH — BS-C expected (high leverage + weak coverage)', () => {
    it('UNH: BalanceSheetQualityScorer winner=C (net_debt > 2.5, coverage < 5.0)', async () => {
      const stock = await prisma.stock.findUnique({ where: { ticker: 'UNH' }, select: STOCK_FIELDS });
      if (!stock) { console.warn('UNH not in test DB — skipping'); return; }

      const r = BalanceSheetQualityScorer(fullInput(toInput(stock)));
      expect(r.winner).toBe('C');
    });

    it('UNH: EarningsQualityScorer winner is non-null (moat score available)', async () => {
      const stock = await prisma.stock.findUnique({ where: { ticker: 'UNH' }, select: STOCK_FIELDS });
      if (!stock) { console.warn('UNH not in test DB — skipping'); return; }

      const r = EarningsQualityScorer(fullInput(toInput(stock)));
      // UNH has moat_strength_score data; winner should be defined even if FCF data varies
      expect(r.winner).not.toBeNull();
    });
  });

  describe('Invariants: output shape for all test DB stocks', () => {
    it('scores keys are exactly A, B, C for every test stock (EQ)', async () => {
      const stocks = await prisma.stock.findMany({
        where: { ticker: { in: ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'] } },
        select: { ticker: true, ...STOCK_FIELDS },
      });
      for (const stock of stocks) {
        const r = EarningsQualityScorer(fullInput(toInput(stock)));
        expect(Object.keys(r.scores).sort()).toEqual(['A', 'B', 'C']);
        for (const v of Object.values(r.scores)) expect(v).toBeGreaterThanOrEqual(0);
      }
    });

    it('scores keys are exactly A, B, C for every test stock (BS)', async () => {
      const stocks = await prisma.stock.findMany({
        where: { ticker: { in: ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'] } },
        select: { ticker: true, ...STOCK_FIELDS },
      });
      for (const stock of stocks) {
        const r = BalanceSheetQualityScorer(fullInput(toInput(stock)));
        expect(Object.keys(r.scores).sort()).toEqual(['A', 'B', 'C']);
        for (const v of Object.values(r.scores)) expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
