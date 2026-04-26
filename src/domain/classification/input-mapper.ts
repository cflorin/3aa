// EPIC-004: Classification Engine & Universe Screen
// STORY-047: Classification Recompute Batch Job
// TASK-047-002: toClassificationInput — maps Prisma stock row → ClassificationInput
// STORY-065: Extended to optionally include ClassificationTrendMetrics from stock_derived_metrics
// RFC-001 §ClassificationInput; ADR-013; RFC-001 Amendment 2026-04-25
//
// Growth fields stored as percentages in DB (7.24 = 7.24%) — divide by 100.
// Ratio/margin/flag fields stored as decimal fractions or booleans — used as-is.
// [BUG-CE-001] If growth fields are ever inserted as decimals (0.072 instead of 7.2),
// pct() will produce 0.0007, firing Bucket 1 for all signals. See docs/bugs/CLASSIFICATION-ENGINE-BUG-REGISTRY.md.

import type { ClassificationInput, ClassificationTrendMetrics } from './types';

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

// Derived metrics row shape — Decimal fields accepted as any (converted via Number())
export type DerivedMetricsRow = {
  quartersAvailable?: number | null;
  revenueTtm?: unknown; grossProfitTtm?: unknown; operatingIncomeTtm?: unknown;
  netIncomeTtm?: unknown; capexTtm?: unknown; cashFromOperationsTtm?: unknown;
  freeCashFlowTtm?: unknown; shareBasedCompensationTtm?: unknown; depreciationAndAmortizationTtm?: unknown;
  grossMarginTtm?: unknown; operatingMarginTtm?: unknown; netMarginTtm?: unknown;
  fcfMarginTtm?: unknown; sbcAsPctRevenueTtm?: unknown; cfoToNetIncomeRatioTtm?: unknown;
  grossMarginSlope4q?: unknown; operatingMarginSlope4q?: unknown; netMarginSlope4q?: unknown;
  grossMarginSlope8q?: unknown; operatingMarginSlope8q?: unknown; netMarginSlope8q?: unknown;
  operatingMarginStabilityScore?: unknown; grossMarginStabilityScore?: unknown; netMarginStabilityScore?: unknown;
  operatingLeverageRatio?: unknown; operatingIncomeAccelerationFlag?: boolean | null;
  operatingLeverageEmergingFlag?: boolean | null; earningsQualityTrendScore?: unknown;
  deterioratingCashConversionFlag?: boolean | null; dilutedSharesOutstandingChange4q?: unknown;
  dilutedSharesOutstandingChange8q?: unknown; materialDilutionTrendFlag?: boolean | null;
  sbcBurdenScore?: unknown; capexToRevenueRatioAvg4q?: unknown; capexIntensityIncreasingFlag?: boolean | null;
};

function mapDerivedMetrics(d: DerivedMetricsRow): ClassificationTrendMetrics {
  return {
    quartersAvailable: d.quartersAvailable ?? null,
    revenueTtm: num(d.revenueTtm), grossProfitTtm: num(d.grossProfitTtm),
    operatingIncomeTtm: num(d.operatingIncomeTtm), netIncomeTtm: num(d.netIncomeTtm),
    capexTtm: num(d.capexTtm), cashFromOperationsTtm: num(d.cashFromOperationsTtm),
    freeCashFlowTtm: num(d.freeCashFlowTtm), shareBasedCompensationTtm: num(d.shareBasedCompensationTtm),
    depreciationAndAmortizationTtm: num(d.depreciationAndAmortizationTtm),
    grossMarginTtm: num(d.grossMarginTtm), operatingMarginTtm: num(d.operatingMarginTtm),
    netMarginTtm: num(d.netMarginTtm), fcfMarginTtm: num(d.fcfMarginTtm),
    sbcAsPctRevenueTtm: num(d.sbcAsPctRevenueTtm), cfoToNetIncomeRatioTtm: num(d.cfoToNetIncomeRatioTtm),
    grossMarginSlope4q: num(d.grossMarginSlope4q), operatingMarginSlope4q: num(d.operatingMarginSlope4q),
    netMarginSlope4q: num(d.netMarginSlope4q), grossMarginSlope8q: num(d.grossMarginSlope8q),
    operatingMarginSlope8q: num(d.operatingMarginSlope8q), netMarginSlope8q: num(d.netMarginSlope8q),
    operatingMarginStabilityScore: num(d.operatingMarginStabilityScore),
    grossMarginStabilityScore: num(d.grossMarginStabilityScore),
    netMarginStabilityScore: num(d.netMarginStabilityScore),
    operatingLeverageRatio: num(d.operatingLeverageRatio),
    operatingIncomeAccelerationFlag: d.operatingIncomeAccelerationFlag ?? null,
    operatingLeverageEmergingFlag: d.operatingLeverageEmergingFlag ?? null,
    earningsQualityTrendScore: num(d.earningsQualityTrendScore),
    deterioratingCashConversionFlag: d.deterioratingCashConversionFlag ?? null,
    dilutedSharesOutstandingChange4q: num(d.dilutedSharesOutstandingChange4q),
    dilutedSharesOutstandingChange8q: num(d.dilutedSharesOutstandingChange8q),
    materialDilutionTrendFlag: d.materialDilutionTrendFlag ?? null,
    sbcBurdenScore: num(d.sbcBurdenScore),
    capexToRevenueRatioAvg4q: num(d.capexToRevenueRatioAvg4q),
    capexIntensityIncreasingFlag: d.capexIntensityIncreasingFlag ?? null,
  };
}

export function toClassificationInput(s: ClassificationStockRow, derivedMetrics?: DerivedMetricsRow | null): ClassificationInput {
  const base: ClassificationInput = {
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
  if (derivedMetrics != null) {
    base.trend_metrics = mapDerivedMetrics(derivedMetrics);
  }
  return base;
}
