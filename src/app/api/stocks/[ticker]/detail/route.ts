// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-001: GET /api/stocks/[ticker]/detail — comprehensive single-call endpoint
// PRD §Stock Detail; RFC-001 §ClassificationResult; RFC-003 §Stock Detail Screen
// ADR-013 (scoring weights); ADR-014 (confidence thresholds); ADR-007 (active code resolution)
//
// net_margin field not present in V1 schema — fcf_margin exposed instead (V1 data gap).
// enterprise_value not standalone column — forward_ev_ebit exposed (EV fields arrive in EPIC-005).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { getClassificationState } from '@/domain/classification/persistence';
import { resolveActiveCode } from '@/domain/classification/override';

const TICKER_RE = /^[A-Z0-9.]{1,10}$/i;

const num = (v: unknown): number | null =>
  v !== null && v !== undefined ? Number(v) : null;

const pct = (v: unknown): number | null =>
  v !== null && v !== undefined ? Number(v) / 100 : null;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  if (!ticker || !TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  try {

  const stock = await prisma.stock.findUnique({
    where: { ticker },
    select: {
      ticker: true,
      companyName: true,
      sector: true,
      // Market data
      marketCap: true,
      currentPrice: true,
      forwardPe: true,
      trailingPe: true,
      forwardEvEbit: true,
      // EPS reconciliation fields
      epsTtm: true,
      epsNtm: true,
      nonGaapEpsFy: true,
      gaapEpsCompletedFy: true,
      gaapAdjustmentFactor: true,
      // Growth — stored as percentages in DB; divide by 100 for decimal fraction
      revenueGrowthFwd: true,
      revenueGrowth3y: true,
      epsGrowthFwd: true,
      epsGrowth3y: true,
      grossProfitGrowth: true,
      // Profitability
      grossMargin: true,
      operatingMargin: true,
      fcfMargin: true,
      fcfConversion: true,
      roic: true,
      fcfPositive: true,
      netIncomePositive: true,
      // Balance sheet
      netDebtToEbitda: true,
      interestCoverage: true,
      shareCountGrowth3y: true,
      // Enrichment E1–E6
      moatStrengthScore: true,
      pricingPowerScore: true,
      revenueRecurrenceScore: true,
      marginDurabilityScore: true,
      capitalIntensityScore: true,
      qualitativeCyclicalityScore: true,
      // Flags
      holdingCompanyFlag: true,
      insurerFlag: true,
      cyclicalityFlag: true,
      optionalityFlag: true,
      binaryFlag: true,
      preOperatingLeverageFlag: true,
      materialDilutionFlag: true,
      // Universe guard
      inUniverse: true,
    },
  });

  if (!stock || !stock.inUniverse) {
    return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
  }

  const [resolved, state, override] = await Promise.all([
    resolveActiveCode(user.userId, ticker),
    getClassificationState(ticker),
    prisma.userClassificationOverride.findUnique({
      where: { userId_ticker: { userId: user.userId, ticker } },
      select: { finalCode: true, overrideReason: true, overriddenAt: true },
    }),
  ]);

  const scores = state?.scores ?? null;

  return NextResponse.json({
    // ── Stock metadata ──────────────────────────────────────────────────────
    ticker: stock.ticker,
    company: stock.companyName,
    sector: stock.sector ?? null,

    // ── Classification state ────────────────────────────────────────────────
    suggested_code: state?.suggested_code ?? null,
    active_code: resolved.active_code,
    confidence_level: state?.confidence_level ?? null,
    reason_codes: state?.reason_codes ?? [],
    scores: scores
      ? {
          bucket: scores.bucket,
          eq: scores.eq,
          bs: scores.bs,
        }
      : null,
    confidenceBreakdown: scores?.confidenceBreakdown ?? null,
    tieBreaksFired: scores?.tieBreaksFired ?? [],
    input_snapshot: state?.input_snapshot ?? null,
    classified_at: state?.classified_at ?? null,
    // STORY-083: pre-floor code and confidence (null when floor was not applied)
    raw_suggested_code: scores?.rawSuggestedCode ?? null,
    raw_confidence_level: scores?.rawConfidenceLevel ?? null,
    confidence_floor_applied: scores?.confidenceFloorApplied ?? false,

    // ── User override ───────────────────────────────────────────────────────
    final_code: override?.finalCode ?? null,
    override_reason: override?.overrideReason ?? null,
    overridden_at: override?.overriddenAt ?? null,
    override_scope: 'display_only',

    // ── E1–E6 enrichment scores ─────────────────────────────────────────────
    e1_moat_strength: num(stock.moatStrengthScore),
    e2_pricing_power: num(stock.pricingPowerScore),
    e3_revenue_recurrence: num(stock.revenueRecurrenceScore),
    e4_margin_durability: num(stock.marginDurabilityScore),
    e5_capital_intensity: num(stock.capitalIntensityScore),
    e6_qualitative_cyclicality: num(stock.qualitativeCyclicalityScore),

    // ── EPS reconciliation (GAAP / Non-GAAP chain for eps_growth_fwd) ─────────
    eps_ttm_gaap: num(stock.epsTtm),
    eps_ntm_non_gaap: num(stock.epsNtm),
    non_gaap_eps_fy: num(stock.nonGaapEpsFy),
    gaap_adjustment_factor: num(stock.gaapAdjustmentFactor),
    gaap_eps_fy: num(stock.gaapEpsCompletedFy),   // FMP income statement epsDiluted — factor numerator
    // GAAP-equivalent NTM EPS = epsNtm × factor (what the growth numerator sees)
    eps_ntm_gaap_equiv:
      stock.epsNtm !== null && stock.gaapAdjustmentFactor !== null
        ? num(stock.epsNtm)! * num(stock.gaapAdjustmentFactor)!
        : null,

    // ── Fundamental metrics (decimal fractions; growth fields divided by 100) ──
    revenue_growth_fwd: pct(stock.revenueGrowthFwd),
    revenue_growth_3y: pct(stock.revenueGrowth3y),
    eps_growth_fwd: pct(stock.epsGrowthFwd),
    eps_growth_3y: pct(stock.epsGrowth3y),
    gross_profit_growth: pct(stock.grossProfitGrowth),
    gross_margin: num(stock.grossMargin),
    operating_margin: num(stock.operatingMargin),
    fcf_margin: num(stock.fcfMargin),
    fcf_conversion: num(stock.fcfConversion),
    roic: num(stock.roic),
    fcf_positive: stock.fcfPositive ?? null,
    net_income_positive: stock.netIncomePositive ?? null,
    net_debt_to_ebitda: num(stock.netDebtToEbitda),
    interest_coverage: num(stock.interestCoverage),
    share_count_growth_3y: pct(stock.shareCountGrowth3y),

    // ── Market context ──────────────────────────────────────────────────────
    market_cap: num(stock.marketCap),
    price: num(stock.currentPrice),
    // pe_ratio: forward preferred, trailing as fallback
    pe_ratio: num(stock.forwardPe) ?? num(stock.trailingPe),
    ev_ebit: num(stock.forwardEvEbit),

    // ── Classification flags (7 flags as per STORY-033/037) ─────────────────
    holding_company_flag: stock.holdingCompanyFlag ?? null,
    insurer_flag: stock.insurerFlag ?? null,
    binary_flag: stock.binaryFlag ?? null,
    cyclicality_flag: stock.cyclicalityFlag ?? null,
    optionality_flag: stock.optionalityFlag ?? null,
    pre_operating_leverage_flag: stock.preOperatingLeverageFlag ?? null,
    material_dilution_flag: stock.materialDilutionFlag ?? null,
  });

  } catch (err) {
    console.error('[detail/route] Unhandled error for ticker', ticker, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
