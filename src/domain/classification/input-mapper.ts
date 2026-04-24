// EPIC-004: Classification Engine & Universe Screen
// STORY-047: Classification Recompute Batch Job
// TASK-047-002: toClassificationInput — maps Prisma stock row → ClassificationInput
// RFC-001 §ClassificationInput; ADR-013
//
// Growth fields stored as percentages in DB (7.24 = 7.24%) — divide by 100.
// Ratio/margin/flag fields stored as decimal fractions or booleans — used as-is.

import type { ClassificationInput } from './types';

export const CLASSIFICATION_STOCK_FIELDS = {
  ticker: true,
  revenueGrowthFwd: true, revenueGrowth3y: true,
  epsGrowthFwd: true, epsGrowth3y: true,
  grossProfitGrowth: true,
  operatingMargin: true, fcfMargin: true, fcfConversion: true, roic: true,
  fcfPositive: true, netIncomePositive: true,
  netDebtToEbitda: true, interestCoverage: true,
  moatStrengthScore: true, pricingPowerScore: true, revenueRecurrenceScore: true,
  marginDurabilityScore: true, capitalIntensityScore: true, qualitativeCyclicalityScore: true,
  holdingCompanyFlag: true, insurerFlag: true, cyclicalityFlag: true,
  optionalityFlag: true, binaryFlag: true, preOperatingLeverageFlag: true,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pct = (v: any): number | null => (v !== null && v !== undefined ? Number(v) / 100 : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any): number | null => (v !== null && v !== undefined ? Number(v) : null);

export type ClassificationStockRow = {
  ticker: string;
  revenueGrowthFwd: unknown; revenueGrowth3y: unknown;
  epsGrowthFwd: unknown; epsGrowth3y: unknown;
  grossProfitGrowth: unknown;
  operatingMargin: unknown; fcfMargin: unknown; fcfConversion: unknown; roic: unknown;
  fcfPositive: boolean | null; netIncomePositive: boolean | null;
  netDebtToEbitda: unknown; interestCoverage: unknown;
  moatStrengthScore: unknown; pricingPowerScore: unknown; revenueRecurrenceScore: unknown;
  marginDurabilityScore: unknown; capitalIntensityScore: unknown; qualitativeCyclicalityScore: unknown;
  holdingCompanyFlag: boolean | null; insurerFlag: boolean | null;
  cyclicalityFlag: boolean | null; optionalityFlag: boolean | null;
  binaryFlag: boolean | null; preOperatingLeverageFlag: boolean | null;
};

export function toClassificationInput(s: ClassificationStockRow): ClassificationInput {
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
