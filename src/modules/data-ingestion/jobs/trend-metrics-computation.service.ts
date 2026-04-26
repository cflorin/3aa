// EPIC-003: Data Ingestion & Universe Management
// STORY-062: Trend & Trajectory Metrics Computation Service
// RFC-008 §Derived Metrics Computation; ADR-015 §Schema
// Computes slope-based, stability-based, flag-based, and composite metrics
// from stock_quarterly_history; writes to stock_derived_metrics.

import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';

export interface TrendMetricsResult {
  ticker: string;
  slopes_computed: boolean;
  stability_computed: boolean;
  flags_computed: boolean;
}

export interface TrendMetricsBatchResult {
  tickers_processed: number;
  tickers_updated: number;
  errors: number;
  duration_ms: number;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function toNumber(v: Prisma.Decimal | null): number | null {
  return v == null ? null : Number(v);
}

// OLS slope (simple linear regression) over an ordered series.
// Returns null when fewer than minPoints non-null values exist.
// series[0] = oldest, series[N-1] = newest; index 0..N-1 used as x.
function computeSlope(series: (number | null)[], minPoints = 4): number | null {
  const valid = series
    .map((v, i) => (v != null ? { x: i, y: v } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  if (valid.length < minPoints) return null;

  const n = valid.length;
  const sumX = valid.reduce((s, p) => s + p.x, 0);
  const sumY = valid.reduce((s, p) => s + p.y, 0);
  const sumXY = valid.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = valid.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// Stability score: 1 - CV (coefficient of variation), clamped to [0, 1].
// CV = stddev / |mean|. Returns null when <4 non-null values or mean is 0.
function computeStabilityScore(series: (number | null)[], minPoints = 4): number | null {
  const valid = series.filter((v): v is number => v != null);
  if (valid.length < minPoints) return null;

  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  if (mean === 0) return null;

  const variance = valid.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / valid.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / Math.abs(mean);

  // Stability = 1 - CV, clamped to [0, 1]
  return Math.max(0, Math.min(1, 1 - cv));
}

// Null-safe percent change: (b - a) / |a|. Returns null when a is null/zero/undefined.
function pctChange(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0) return null;
  return (b - a) / Math.abs(a);
}

// ── Main computation ──────────────────────────────────────────────────────────

export async function computeTrendMetrics(ticker: string): Promise<TrendMetricsResult> {
  // STORY-085: prefer FMP rows; fall back to Tiingo for un-migrated tickers
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

  // Reorder oldest-first for slope computation (index = time)
  const oldestFirst = [...rows].reverse();

  // Extract margin series (per-quarter derived margins already stored)
  const grossMargins   = oldestFirst.map(r => toNumber(r.grossMargin));
  const opMargins      = oldestFirst.map(r => toNumber(r.operatingMargin));
  const netMargins     = oldestFirst.map(r => toNumber(r.netMargin));
  const cfoNiRatios    = oldestFirst.map(r => toNumber(r.cfoToNetIncomeRatio));
  const fcfMargins     = oldestFirst.map(r => toNumber(r.fcfMargin));

  // For operating income and revenue growth rates
  const opIncomes  = oldestFirst.map(r => toNumber(r.operatingIncome));
  const revenues   = oldestFirst.map(r => toNumber(r.revenue));
  const netIncomes = oldestFirst.map(r => toNumber(r.netIncome));
  const cfos       = oldestFirst.map(r => toNumber(r.cashFromOperations));
  const sbcs       = oldestFirst.map(r => toNumber(r.shareBasedCompensation));
  const capexes    = oldestFirst.map(r => toNumber(r.capex));
  const shares     = oldestFirst.map(r => toNumber(r.dilutedSharesOutstanding));

  const n = rows.length;

  // ── Slopes ───────────────────────────────────────────────────────────────────

  const gross4q  = n >= 4 ? computeSlope(grossMargins.slice(-4), 4) : null;
  const op4q     = n >= 4 ? computeSlope(opMargins.slice(-4), 4) : null;
  const net4q    = n >= 4 ? computeSlope(netMargins.slice(-4), 4) : null;
  const gross8q  = n >= 8 ? computeSlope(grossMargins.slice(-8), 8) : null;
  const op8q     = n >= 8 ? computeSlope(opMargins.slice(-8), 8) : null;
  const net8q    = n >= 8 ? computeSlope(netMargins.slice(-8), 8) : null;

  const slopesComputed = n >= 4;

  // ── Stability scores ──────────────────────────────────────────────────────────

  const opStability    = n >= 4 ? computeStabilityScore(opMargins.slice(-8), 4) : null;
  const grossStability = n >= 4 ? computeStabilityScore(grossMargins.slice(-8), 4) : null;
  const netStability   = n >= 4 ? computeStabilityScore(netMargins.slice(-8), 4) : null;

  const stabilityComputed = n >= 4;

  // ── Operating leverage ────────────────────────────────────────────────────────
  // ratio = % change in OpInc / % change in revenue over 4 quarters

  let opLeverageRatio: number | null = null;
  let opIncAccelerationFlag: boolean | null = null;
  let opLeverageEmergingFlag: boolean | null = null;

  if (n >= 4) {
    const recentRev = revenues[revenues.length - 1];
    const priorRev  = revenues[revenues.length - 4];
    const recentOp  = opIncomes[opIncomes.length - 1];
    const priorOp   = opIncomes[opIncomes.length - 4];

    const revGrowth = pctChange(priorRev, recentRev);
    const opGrowth  = pctChange(priorOp, recentOp);

    if (revGrowth != null && revGrowth !== 0 && opGrowth != null) {
      opLeverageRatio = opGrowth / revGrowth;
    }

    // Emerging flag: positive leverage ratio but below 1.5× (sub-threshold)
    if (opLeverageRatio != null) {
      opLeverageEmergingFlag = opLeverageRatio > 0 && opLeverageRatio < 1.5;
    }

    // Acceleration: compare 4q OpInc CAGR vs prior-4q OpInc CAGR (requires 8 quarters)
    if (n >= 8) {
      const op4qEnd   = opIncomes[opIncomes.length - 1];
      const op4qStart = opIncomes[opIncomes.length - 4];
      const op8qStart = opIncomes[opIncomes.length - 8];

      const recentGrowth = pctChange(op4qStart, op4qEnd);
      const priorGrowth  = pctChange(op8qStart, op4qStart);

      if (recentGrowth != null && priorGrowth != null) {
        opIncAccelerationFlag = recentGrowth > priorGrowth;
      }
    }
  }

  // ── Earnings quality trend score ──────────────────────────────────────────────
  // Composite of 3 signals, each −1/0/+1, averaged to produce −1.0 to +1.0
  // Signal 1: CFO/NI trend (slope over 4–8 quarters)
  // Signal 2: FCF margin trend (slope over 4 quarters)
  // Signal 3: Accruals trend (inverse: CFO/NI improvement = better quality)

  let eqTrendScore: number | null = null;

  if (n >= 4) {
    const signals: number[] = [];

    // Signal 1: CFO/NI slope
    const cfoNiSlope = computeSlope(cfoNiRatios.slice(-8), 4);
    if (cfoNiSlope != null) {
      signals.push(cfoNiSlope > 0.02 ? 1 : cfoNiSlope < -0.02 ? -1 : 0);
    }

    // Signal 2: FCF margin slope
    const fcfSlope = computeSlope(fcfMargins.slice(-8), 4);
    if (fcfSlope != null) {
      signals.push(fcfSlope > 0.01 ? 1 : fcfSlope < -0.01 ? -1 : 0);
    }

    // Signal 3: Accruals proxy — is CFO consistently above NI (positive quality signal)?
    const recentCfoNi = cfoNiRatios.slice(-4).filter((v): v is number => v != null);
    if (recentCfoNi.length >= 4) {
      const avgCfoNi = recentCfoNi.reduce((s, v) => s + v, 0) / recentCfoNi.length;
      signals.push(avgCfoNi > 1.1 ? 1 : avgCfoNi < 0.8 ? -1 : 0);
    }

    if (signals.length >= 2) {
      const raw = signals.reduce((s, v) => s + v, 0) / signals.length;
      // Clamp to [−1, +1]
      eqTrendScore = Math.max(-1, Math.min(1, raw));
    }
  }

  // ── Cash conversion deterioration flag ────────────────────────────────────────
  // True when: NI > 0 in recent quarters AND CFO/NI declining over 4 quarters

  let deterioratingCashConversionFlag: boolean | null = null;

  if (n >= 4) {
    const recent4NetInc = netIncomes.slice(-4);
    const allPositive = recent4NetInc.every(v => v != null && v > 0);

    if (allPositive) {
      const cfoNiSlope4q = computeSlope(cfoNiRatios.slice(-4), 4);
      if (cfoNiSlope4q != null) {
        deterioratingCashConversionFlag = cfoNiSlope4q < -0.05;
      }
    } else {
      deterioratingCashConversionFlag = false;
    }
  }

  // ── Dilution metrics ──────────────────────────────────────────────────────────

  let sharesChange4q: number | null = null;
  let sharesChange8q: number | null = null;
  let materialDilutionTrendFlag: boolean | null = null;

  if (n >= 4) {
    const recentShares = shares[shares.length - 1];
    const prior4qShares = shares[shares.length - 4];
    sharesChange4q = pctChange(prior4qShares, recentShares);
    if (sharesChange4q != null) {
      materialDilutionTrendFlag = sharesChange4q > 0.03;
    }
  }
  if (n >= 8) {
    const recentShares = shares[shares.length - 1];
    const prior8qShares = shares[shares.length - 8];
    sharesChange8q = pctChange(prior8qShares, recentShares);
  }

  // ── SBC burden score (0.0–1.0 over 8 quarters) ───────────────────────────────
  // Normalized SBC/revenue ratio: 0 = no SBC burden, 1 = very high

  let sbcBurdenScore: number | null = null;

  if (n >= 4) {
    const sbcRevRatios = sbcs
      .slice(-8)
      .map((s, i, arr) => {
        const rev = revenues[revenues.length - arr.length + i];
        if (s == null || rev == null || rev === 0) return null;
        return s / rev;
      })
      .filter((v): v is number => v != null);

    if (sbcRevRatios.length >= 4) {
      const avgSbcRev = sbcRevRatios.reduce((s, v) => s + v, 0) / sbcRevRatios.length;
      // Cap at 0.20 (20% SBC/revenue = maximum burden score = 1.0)
      sbcBurdenScore = Math.min(1, Math.max(0, avgSbcRev / 0.20));
    }
  }

  // ── Capital intensity ─────────────────────────────────────────────────────────

  let capexToRevenueAvg4q: number | null = null;
  let capexIntensityIncreasingFlag: boolean | null = null;

  if (n >= 4) {
    const recent4Capex = capexes.slice(-4);
    const recent4Rev = revenues.slice(-4);
    const capexRevRatios = recent4Capex
      .map((c, i) => {
        const rev = recent4Rev[i];
        if (c == null || rev == null || rev === 0) return null;
        return Math.abs(c) / rev; // capex is often negative; take absolute value
      })
      .filter((v): v is number => v != null);

    if (capexRevRatios.length >= 4) {
      capexToRevenueAvg4q = capexRevRatios.reduce((s, v) => s + v, 0) / capexRevRatios.length;
    }

    if (n >= 8) {
      const prior4Capex = capexes.slice(-8, -4);
      const prior4Rev = revenues.slice(-8, -4);
      const prior4Ratios = prior4Capex
        .map((c, i) => {
          const rev = prior4Rev[i];
          if (c == null || rev == null || rev === 0) return null;
          return Math.abs(c) / rev;
        })
        .filter((v): v is number => v != null);

      if (capexRevRatios.length >= 4 && prior4Ratios.length >= 4) {
        const recentAvg = capexRevRatios.reduce((s, v) => s + v, 0) / capexRevRatios.length;
        const priorAvg = prior4Ratios.reduce((s, v) => s + v, 0) / prior4Ratios.length;
        capexIntensityIncreasingFlag = recentAvg > priorAvg * 1.10;
      }
    }
  }

  const flagsComputed = n >= 4;

  // ── Upsert to stock_derived_metrics ──────────────────────────────────────────

  await prisma.stockDerivedMetrics.upsert({
    where: { ticker },
    update: {
      derivedAsOf: new Date(),
      grossMarginSlope4q:  gross4q,
      operatingMarginSlope4q: op4q,
      netMarginSlope4q:    net4q,
      grossMarginSlope8q:  gross8q,
      operatingMarginSlope8q: op8q,
      netMarginSlope8q:    net8q,
      operatingMarginStabilityScore: opStability,
      grossMarginStabilityScore:     grossStability,
      netMarginStabilityScore:       netStability,
      operatingLeverageRatio:         opLeverageRatio,
      operatingIncomeAccelerationFlag: opIncAccelerationFlag,
      operatingLeverageEmergingFlag:  opLeverageEmergingFlag,
      earningsQualityTrendScore:      eqTrendScore,
      deterioratingCashConversionFlag,
      dilutedSharesOutstandingChange4q: sharesChange4q,
      dilutedSharesOutstandingChange8q: sharesChange8q,
      materialDilutionTrendFlag,
      sbcBurdenScore,
      capexToRevenueRatioAvg4q: capexToRevenueAvg4q,
      capexIntensityIncreasingFlag,
    },
    create: {
      ticker,
      derivedAsOf: new Date(),
      grossMarginSlope4q:  gross4q,
      operatingMarginSlope4q: op4q,
      netMarginSlope4q:    net4q,
      grossMarginSlope8q:  gross8q,
      operatingMarginSlope8q: op8q,
      netMarginSlope8q:    net8q,
      operatingMarginStabilityScore: opStability,
      grossMarginStabilityScore:     grossStability,
      netMarginStabilityScore:       netStability,
      operatingLeverageRatio:         opLeverageRatio,
      operatingIncomeAccelerationFlag: opIncAccelerationFlag,
      operatingLeverageEmergingFlag:  opLeverageEmergingFlag,
      earningsQualityTrendScore:      eqTrendScore,
      deterioratingCashConversionFlag,
      dilutedSharesOutstandingChange4q: sharesChange4q,
      dilutedSharesOutstandingChange8q: sharesChange8q,
      materialDilutionTrendFlag,
      sbcBurdenScore,
      capexToRevenueRatioAvg4q: capexToRevenueAvg4q,
      capexIntensityIncreasingFlag,
    },
  });

  console.log(JSON.stringify({ event: 'trend_metrics_computed', ticker, slopes_computed: slopesComputed, stability_computed: stabilityComputed, flags_computed: flagsComputed }));

  return { ticker, slopes_computed: slopesComputed, stability_computed: stabilityComputed, flags_computed: flagsComputed };
}

export async function computeTrendMetricsBatch(tickers: string[]): Promise<TrendMetricsBatchResult> {
  const startMs = Date.now();
  let tickers_processed = 0;
  let tickers_updated = 0;
  let errors = 0;

  for (const ticker of tickers) {
    tickers_processed++;
    try {
      await computeTrendMetrics(ticker);
      tickers_updated++;
    } catch (err) {
      console.error(JSON.stringify({ event: 'trend_metrics_computation_error', ticker, error: String(err) }));
      errors++;
    }
  }

  return { tickers_processed, tickers_updated, errors, duration_ms: Date.now() - startMs };
}
