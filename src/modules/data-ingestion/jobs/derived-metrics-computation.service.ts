// EPIC-003: Data Ingestion & Universe Management
// STORY-061: Derived Metrics Computation Service (TTM Rollups)
// RFC-008 §Classifier-Facing Derived Fields; ADR-015 §Schema
// Reads stock_quarterly_history rows; computes TTM sums and margin ratios;
// writes to stock_derived_metrics with derived_as_of = NOW().

import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';

export interface DerivedMetricsResult {
  ticker: string;
  quarters_available: number;
  ttm_computed: boolean;
}

export interface DerivedMetricsBatchResult {
  tickers_processed: number;
  tickers_updated: number;
  errors: number;
  duration_ms: number;
}

// Sum a nullable field across quarters: returns null if all values are null;
// otherwise sums non-null values only. If any value is explicitly absent (null),
// the sum is also null to avoid silently under-counting.
function nullableSum(values: (number | null | undefined)[]): number | null {
  const hasAnyNull = values.some(v => v == null);
  if (hasAnyNull) return null;
  return values.reduce<number>((acc, v) => acc + (v as number), 0);
}

// NULL-safe ratio
function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

// Convert Prisma Decimal to number | null
function toNumber(v: Prisma.Decimal | null): number | null {
  return v == null ? null : Number(v);
}

export async function computeDerivedMetrics(ticker: string): Promise<DerivedMetricsResult> {
  // STORY-085: prefer FMP rows (richer, no rate limit); fall back to Tiingo for un-migrated tickers
  let rows = await prisma.stockQuarterlyHistory.findMany({
    where: { ticker, sourceProvider: 'fmp' },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
  });
  if (rows.length === 0) {
    rows = await prisma.stockQuarterlyHistory.findMany({
      where: { ticker, sourceProvider: 'tiingo' },
      orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
    });
  }

  const quartersAvailable = rows.length;
  const ttmRows = rows.slice(0, 4);
  const ttmComputed = ttmRows.length >= 4;

  // TTM raw sums — null if any of the 4 quarters has a null value for that field
  const revenueTtm         = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.revenue))) : null;
  const grossProfitTtm     = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.grossProfit))) : null;
  const operatingIncomeTtm = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.operatingIncome))) : null;
  const netIncomeTtm       = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.netIncome))) : null;
  const capexTtm           = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.capex))) : null;
  const cashFromOperationsTtm = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.cashFromOperations))) : null;
  const freeCashFlowTtm    = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.freeCashFlow))) : null;
  const sbcTtm             = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.shareBasedCompensation))) : null;
  const daTtm              = ttmComputed ? nullableSum(ttmRows.map(r => toNumber(r.depreciationAndAmortization))) : null;

  // TTM margin ratios (null if revenue_ttm is null or zero)
  const grossMarginTtm         = safeRatio(grossProfitTtm, revenueTtm);
  const operatingMarginTtm     = safeRatio(operatingIncomeTtm, revenueTtm);
  const netMarginTtm           = safeRatio(netIncomeTtm, revenueTtm);
  const fcfMarginTtm           = safeRatio(freeCashFlowTtm, revenueTtm);
  const sbcAsPctRevenueTtm     = safeRatio(sbcTtm, revenueTtm);
  const cfoToNetIncomeRatioTtm = safeRatio(cashFromOperationsTtm, netIncomeTtm);

  await prisma.stockDerivedMetrics.upsert({
    where: { ticker },
    update: {
      derivedAsOf: new Date(),
      quartersAvailable,
      revenueTtm,
      grossProfitTtm,
      operatingIncomeTtm,
      netIncomeTtm,
      capexTtm,
      cashFromOperationsTtm,
      freeCashFlowTtm,
      shareBasedCompensationTtm: sbcTtm,
      depreciationAndAmortizationTtm: daTtm,
      grossMarginTtm,
      operatingMarginTtm,
      netMarginTtm,
      fcfMarginTtm,
      sbcAsPctRevenueTtm,
      cfoToNetIncomeRatioTtm,
    },
    create: {
      ticker,
      derivedAsOf: new Date(),
      quartersAvailable,
      revenueTtm,
      grossProfitTtm,
      operatingIncomeTtm,
      netIncomeTtm,
      capexTtm,
      cashFromOperationsTtm,
      freeCashFlowTtm,
      shareBasedCompensationTtm: sbcTtm,
      depreciationAndAmortizationTtm: daTtm,
      grossMarginTtm,
      operatingMarginTtm,
      netMarginTtm,
      fcfMarginTtm,
      sbcAsPctRevenueTtm,
      cfoToNetIncomeRatioTtm,
    },
  });

  console.log(JSON.stringify({ event: 'derived_metrics_computed', ticker, quarters_available: quartersAvailable, ttm_computed: ttmComputed }));

  return { ticker, quarters_available: quartersAvailable, ttm_computed: ttmComputed };
}

export async function computeDerivedMetricsBatch(tickers: string[]): Promise<DerivedMetricsBatchResult> {
  const startMs = Date.now();
  let tickers_processed = 0;
  let tickers_updated = 0;
  let errors = 0;

  for (const ticker of tickers) {
    tickers_processed++;
    try {
      await computeDerivedMetrics(ticker);
      tickers_updated++;
    } catch (err) {
      console.error(JSON.stringify({ event: 'derived_metrics_computation_error', ticker, error: String(err) }));
      errors++;
    }
  }

  return { tickers_processed, tickers_updated, errors, duration_ms: Date.now() - startMs };
}
