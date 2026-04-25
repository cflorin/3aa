// EPIC-004: Classification Engine & Universe Screen
// STORY-071: Stock Detail Page — Quarterly Financial History Section
// GET /api/stocks/[ticker]/quarterly-history
// Returns { quarters: StockQuarterlyHistory[], derived: StockDerivedMetrics | null }
// RFC-008 §Classifier-Facing Derived Fields; ADR-015 §Schema

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';

interface Params {
  params: Promise<{ ticker: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  // Verify stock is in universe
  const stock = await prisma.stock.findFirst({
    where: { ticker: upper, inUniverse: true },
    select: { ticker: true },
  });
  if (!stock) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Fetch last 8 quarters ordered most-recent-first
  const quarterRows = await prisma.stockQuarterlyHistory.findMany({
    where: { ticker: upper },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
    take: 8,
  });

  // Fetch derived metrics (single row per ticker)
  const derived = await prisma.stockDerivedMetrics.findUnique({
    where: { ticker: upper },
  });

  // Map Decimal fields to numbers for JSON serialization
  function decimalToNum(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    return Number(v);
  }

  const quarters = quarterRows.map(r => ({
    ticker: r.ticker,
    fiscal_year: r.fiscalYear,
    fiscal_quarter: r.fiscalQuarter,
    period_end_date: r.fiscalPeriodEndDate?.toISOString() ?? null,
    reported_date: r.reportedDate?.toISOString() ?? null,
    revenue: decimalToNum(r.revenue),
    gross_profit: decimalToNum(r.grossProfit),
    operating_income: decimalToNum(r.operatingIncome),
    net_income: decimalToNum(r.netIncome),
    free_cash_flow: decimalToNum(r.freeCashFlow),
    cash_from_operations: decimalToNum(r.cashFromOperations),
    gross_margin: decimalToNum(r.grossMargin),
    operating_margin: decimalToNum(r.operatingMargin),
    net_margin: decimalToNum(r.netMargin),
  }));

  const derivedOut = derived ? {
    ticker: derived.ticker,
    quarters_available: derived.quartersAvailable,
    derived_as_of: derived.derivedAsOf?.toISOString() ?? null,
    // Margin slopes
    gross_margin_slope_4q: decimalToNum(derived.grossMarginSlope4q),
    operating_margin_slope_4q: decimalToNum(derived.operatingMarginSlope4q),
    net_margin_slope_4q: decimalToNum(derived.netMarginSlope4q),
    // Stability scores
    operating_margin_stability_score: decimalToNum(derived.operatingMarginStabilityScore),
    gross_margin_stability_score: decimalToNum(derived.grossMarginStabilityScore),
    // EQ trend
    earnings_quality_trend_score: decimalToNum(derived.earningsQualityTrendScore),
    deteriorating_cash_conversion_flag: derived.deterioratingCashConversionFlag,
    operating_leverage_emerging_flag: derived.operatingLeverageEmergingFlag,
    // Dilution
    diluted_shares_outstanding_change_4q: decimalToNum(derived.dilutedSharesOutstandingChange4q),
    diluted_shares_outstanding_change_8q: decimalToNum(derived.dilutedSharesOutstandingChange8q),
    material_dilution_trend_flag: derived.materialDilutionTrendFlag,
    sbc_burden_score: decimalToNum(derived.sbcBurdenScore),
    sbc_as_pct_revenue_ttm: decimalToNum(derived.sbcAsPctRevenueTtm),
    // TTM rollups
    revenue_ttm: decimalToNum(derived.revenueTtm),
    operating_income_ttm: decimalToNum(derived.operatingIncomeTtm),
    net_income_ttm: decimalToNum(derived.netIncomeTtm),
    free_cash_flow_ttm: decimalToNum(derived.freeCashFlowTtm),
    operating_margin_ttm: decimalToNum(derived.operatingMarginTtm),
    fcf_margin_ttm: decimalToNum(derived.fcfMarginTtm),
  } : null;

  return NextResponse.json({ quarters, derived: derivedOut });
}
