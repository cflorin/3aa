// EPIC-004: Classification Engine & Universe Screen
// STORY-052: EPIC-004 End-to-End Tests
// TASK-052-001: 5-stock test DB seed fixture
// Data source: data/universe-snapshot-5.md (2026-04-21)
// Fixture provenance: sanitized_real — values derived from real universe snapshot
//
// Growth fields: stored as percentages in DB (7.2 = 7.2%) matching DB convention.
// Ratio/margin fields: stored as decimal fractions (0.49 = 49%).
// This matches the DB encoding verified in STORY-041 (input-mapper divide-by-100 rule).

import { PrismaClient } from '@prisma/client';
import { classifyStock } from '../../../../src/domain/classification/classifier';
import { persistClassification } from '../../../../src/domain/classification/persistence';
import { toClassificationInput } from '../../../../src/domain/classification/input-mapper';

const prisma = new PrismaClient();

export const STOCK_TICKERS = ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'] as const;
export const BUCKET8_TICKER = 'BIN8_TEST';
export const ALL_TEST_TICKERS = [...STOCK_TICKERS, BUCKET8_TICKER];

// ── Raw stock data matching DB encoding conventions ──────────────────────────

const STOCK_DATA = [
  {
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    sector: 'Technology',
    country: 'US',
    marketCap: 3_149_700,       // millions USD
    currentPrice: 418.07,
    // Growth fields: stored as percentages (7.2 = 7.2%)
    revenueGrowthFwd: 7.2,
    revenueGrowth3y: 14.4,
    epsGrowthFwd: 2.8,
    epsGrowth3y: 21.2,
    grossProfitGrowth: 15.3,
    // Margin/ratio fields: decimal fractions
    grossMargin: 0.68,
    operatingMargin: 0.49,
    fcfMargin: 0.39,
    fcfConversion: 0.65,
    roic: 0.264,
    fcfPositive: true,
    netIncomePositive: true,
    netDebtToEbitda: 0.22,
    interestCoverage: 56.4,
    // E1–E6 enrichment scores
    moatStrengthScore: 5.0,
    pricingPowerScore: 4.5,
    revenueRecurrenceScore: 4.5,
    marginDurabilityScore: 4.5,
    capitalIntensityScore: 2.0,
    qualitativeCyclicalityScore: 2.0,
    // Classification flags
    holdingCompanyFlag: false,
    insurerFlag: false,
    cyclicalityFlag: false,
    optionalityFlag: false,
    binaryFlag: false,
    preOperatingLeverageFlag: false,
    materialDilutionFlag: false,
    // Valuation
    forwardPe: 25.3,
    forwardEvEbit: 22.1,
    inUniverse: true,
  },
  {
    ticker: 'ADBE',
    companyName: 'Adobe Inc.',
    sector: 'Technology',
    country: 'US',
    marketCap: 100_800,
    currentPrice: 248.63,
    revenueGrowthFwd: 6.6,
    revenueGrowth3y: 10.8,
    epsGrowthFwd: 37.0,
    epsGrowth3y: 19.1,
    grossProfitGrowth: 11.3,
    grossMargin: 0.90,
    operatingMargin: 0.38,
    fcfMargin: 0.29,
    fcfConversion: 1.43,
    roic: 0.589,
    fcfPositive: true,
    netIncomePositive: true,
    netDebtToEbitda: 0.04,
    interestCoverage: 35.0,
    moatStrengthScore: 4.5,
    pricingPowerScore: 4.0,
    revenueRecurrenceScore: 4.5,
    marginDurabilityScore: 4.5,
    capitalIntensityScore: 1.5,
    qualitativeCyclicalityScore: 2.0,
    holdingCompanyFlag: false,
    insurerFlag: false,
    cyclicalityFlag: false,
    optionalityFlag: false,
    binaryFlag: false,
    preOperatingLeverageFlag: false,
    materialDilutionFlag: false,
    forwardPe: 10.6,
    forwardEvEbit: 10.9,
    inUniverse: true,
  },
  {
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    sector: 'Consumer Cyclical',
    country: 'US',
    marketCap: 1_449_900,
    currentPrice: 392.50,
    revenueGrowthFwd: 8.8,
    revenueGrowth3y: 5.2,
    epsGrowthFwd: 64.3,
    epsGrowth3y: -33.6,
    grossProfitGrowth: -2.0,
    grossMargin: 0.20,
    operatingMargin: 0.06,
    fcfMargin: 0.04,
    fcfConversion: 1.64,
    roic: 0.056,
    fcfPositive: true,
    netIncomePositive: true,
    netDebtToEbitda: -1.46,
    interestCoverage: 16.4,
    moatStrengthScore: 3.5,
    pricingPowerScore: 2.5,
    revenueRecurrenceScore: 2.0,
    marginDurabilityScore: 2.5,
    capitalIntensityScore: 4.5,
    qualitativeCyclicalityScore: 4.5,
    holdingCompanyFlag: false,
    insurerFlag: false,
    cyclicalityFlag: true,    // Consumer Cyclical sector rule (STORY-033)
    optionalityFlag: false,
    binaryFlag: false,
    preOperatingLeverageFlag: false,
    materialDilutionFlag: false,
    forwardPe: 202.4,
    forwardEvEbit: 125.9,
    inUniverse: true,
  },
  {
    ticker: 'UBER',
    companyName: 'Uber Technologies, Inc.',
    sector: 'Technology',
    country: 'US',
    marketCap: 159_000,
    currentPrice: 77.49,
    revenueGrowthFwd: 12.2,
    revenueGrowth3y: 17.7,
    epsGrowthFwd: -30.3,
    epsGrowth3y: null,          // snapshot shows "—"
    grossProfitGrowth: 19.4,
    grossMargin: 0.40,
    operatingMargin: 0.12,
    fcfMargin: 0.19,
    fcfConversion: 0.97,
    roic: 0.156,
    fcfPositive: true,
    netIncomePositive: true,
    netDebtToEbitda: 0.40,
    interestCoverage: 14.0,
    moatStrengthScore: 3.5,
    pricingPowerScore: 2.5,
    revenueRecurrenceScore: 2.0,
    marginDurabilityScore: 2.5,
    capitalIntensityScore: 1.5,
    qualitativeCyclicalityScore: 3.5,
    holdingCompanyFlag: false,
    insurerFlag: false,
    cyclicalityFlag: true,    // deterministic sector rule
    optionalityFlag: false,
    binaryFlag: false,
    preOperatingLeverageFlag: false,
    materialDilutionFlag: false,
    forwardPe: 23.0,
    forwardEvEbit: 25.1,
    inUniverse: true,
  },
  {
    ticker: 'UNH',
    companyName: 'UnitedHealth Group Inc.',
    sector: 'Healthcare',
    country: 'US',
    marketCap: 314_100,
    currentPrice: 323.48,
    revenueGrowthFwd: -1.6,
    revenueGrowth3y: 11.3,
    epsGrowthFwd: 34.7,
    epsGrowth3y: -14.8,
    grossProfitGrowth: -7.3,
    grossMargin: 0.16,
    operatingMargin: 0.04,
    fcfMargin: 0.03,
    fcfConversion: 1.33,
    roic: 0.091,
    fcfPositive: true,
    netIncomePositive: true,
    netDebtToEbitda: 3.01,
    interestCoverage: 4.5,
    moatStrengthScore: 4.0,
    pricingPowerScore: 3.5,
    revenueRecurrenceScore: 4.5,
    marginDurabilityScore: 3.5,
    capitalIntensityScore: 1.5,
    qualitativeCyclicalityScore: 1.5,
    holdingCompanyFlag: false,
    insurerFlag: false,
    cyclicalityFlag: false,
    optionalityFlag: false,
    binaryFlag: false,
    preOperatingLeverageFlag: false,
    materialDilutionFlag: false,
    forwardPe: 18.1,
    forwardEvEbit: 11.6,
    inUniverse: true,
  },
  // Bucket 8 test stock: binary_flag=true forces suggested_code="8"
  // IMPORTANT: must have ≤ 5 null CRITICAL_FIELDS so null-suggestion gate (missing > 5) does NOT fire
  // before binary_flag special case can trigger. Gate: missing > NULL_SUGGESTION_THRESHOLD (5).
  // We provide 6 non-null critical fields → missing = 4 → gate passes → binary_flag → "8".
  {
    ticker: BUCKET8_TICKER,
    companyName: 'Binary Risk Test Corp',
    sector: 'Technology',
    country: 'US',
    marketCap: 5_000,
    currentPrice: 10.0,
    // Non-null critical fields (need ≥ 6 of 10 to keep missing ≤ 4)
    revenueGrowthFwd: 5.0,      // critical field — non-null
    revenueGrowth3y: 5.0,       // critical field — non-null
    epsGrowthFwd: 5.0,           // critical field — non-null
    epsGrowth3y: 5.0,            // critical field — non-null
    fcfConversion: 0.5,          // critical field — non-null
    fcfPositive: true,           // critical field — non-null
    // Remaining 4 critical fields null → missing = 4 ≤ 5 → gate does not fire
    netIncomePositive: null,
    operatingMargin: null,
    netDebtToEbitda: null,
    interestCoverage: null,
    // Non-critical fields null
    grossProfitGrowth: null,
    grossMargin: null,
    fcfMargin: null,
    roic: null,
    moatStrengthScore: null,
    pricingPowerScore: null,
    revenueRecurrenceScore: null,
    marginDurabilityScore: null,
    capitalIntensityScore: null,
    qualitativeCyclicalityScore: null,
    holdingCompanyFlag: false,
    insurerFlag: false,
    cyclicalityFlag: false,
    optionalityFlag: false,
    binaryFlag: true,           // forces Bucket 8 via special-case override in classifier
    preOperatingLeverageFlag: false,
    materialDilutionFlag: false,
    forwardPe: null,
    forwardEvEbit: null,
    inUniverse: true,
  },
] as const;

// ── Public functions ──────────────────────────────────────────────────────────

// Seeds all 6 stocks (5 real + BIN8_TEST) and computes classification_state for each.
// Idempotent via upsert — safe to call multiple times.
export async function seedUniverse(): Promise<void> {
  for (const data of STOCK_DATA) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.stock as any).upsert({
      where: { ticker: data.ticker },
      create: data,
      update: data,
    });
  }

  // Compute and persist classification state for each stock using the real engine
  for (const data of STOCK_DATA) {
    const input = toClassificationInput(data as Parameters<typeof toClassificationInput>[0]);
    const result = classifyStock(input);
    await persistClassification(data.ticker, result, input);
  }
}

// Removes all seeded stocks and their cascade-deleted related rows
// (classification_state, classification_history, user_classification_overrides,
//  user_deactivated_stocks — all cascade via Stock FK).
export async function cleanupUniverse(): Promise<void> {
  await prisma.stock.deleteMany({
    where: { ticker: { in: ALL_TEST_TICKERS as unknown as string[] } },
  });
}

// Removes only classification_state rows for all seeded stocks (used by W6 batch test)
export async function clearClassificationState(): Promise<void> {
  await prisma.classificationState.deleteMany({
    where: { ticker: { in: ALL_TEST_TICKERS as unknown as string[] } },
  });
}

export { prisma };
