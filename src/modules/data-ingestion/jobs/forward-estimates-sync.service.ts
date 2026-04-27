// EPIC-003: Data Ingestion & Universe Management
// STORY-021: Forward Estimates Sync Job
// TASK-021-001: syncForwardEstimates() — three-level fallback: FMP → Tiingo → computed
// STORY-028: Forward Estimates Enrichment — store raw NTM inputs; compute actual ratios
// RFC-002: forward_pe, forward_ev_ebit, trailing_pe, eps_growth_fwd, cyclicality_flag
// RFC-004 §Forward Estimates Sync: FMP primary, Tiingo fallback, computed trailing fallback
// ADR-001: FMP primary for forward estimates (~85% coverage)
// ADR-002: Daily 7pm ET slot (after fundamentals sync at 6pm)

import type { VendorAdapter } from '../ports/vendor-adapter.interface';
import type { ProvenanceEntry } from '../types';
import { ProviderOrchestrator } from '../provider-orchestrator';
import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';
import { computeFreshnessStatus } from '../freshness.util';

export interface ForwardEstimatesSyncResult {
  stocks_updated: number;
  provider_count: number;
  computed_fallback_count: number;
  no_estimates_count: number;
  errors: number;
  fresh_count: number;
  stale_count: number;
  missing_count: number;
  duration_ms: number;
}

interface GuardrailInput {
  trailing_pe: number | null;
  eps_growth_fwd: number | null;
  cyclicality_flag: boolean | null;
}

/**
 * Determines whether the computed trailing fallback is safe to use.
 * Returns null if safe to compute, or a reason string if a guardrail blocks it.
 *
 * Safety guardrails (RFC-004 §Forward Estimates Sync):
 * - trailing_pe must be non-null and > 0 (negative/zero earnings → meaningless forward PE)
 * - eps_growth_fwd must be non-null (confirmed stored as percentage: 10 = 10%)
 * - cyclicality_flag must NOT be TRUE (cyclical PE expansion is non-linear)
 * - cyclicality_flag = null treated as "not cyclical" (classification engine hasn't run yet)
 */
export function computedFallbackGuardrail(row: GuardrailInput): string | null {
  if (row.trailing_pe === null) return 'trailing_pe_null';
  if (row.trailing_pe <= 0)    return 'trailing_pe_non_positive';
  if (row.eps_growth_fwd === null) return 'eps_growth_fwd_null';
  if (row.cyclicality_flag === true) return 'cyclicality_flag';
  return null;
}

/**
 * Computes forward PE from trailing PE and forward EPS growth.
 * Formula: forward_pe = trailing_pe / (1 + eps_growth_fwd / 100)
 * eps_growth_fwd is stored as a percentage: 10 means 10% growth, not 10 (decimal 1000%).
 * Only called after guardrail passes (trailing_pe > 0 and eps_growth_fwd non-null).
 */
export function computeForwardPe(trailingPe: number, epsGrowthFwd: number): number {
  return trailingPe / (1 + epsGrowthFwd / 100);
}

/**
 * Syncs forward estimates and computes forward valuation ratios for all in-universe stocks.
 *
 * STORY-028 behavior (replaces raw-input storage from STORY-021):
 * 1. Fetch raw NTM inputs (eps_ntm, ebit_ntm, revenue_ntm) via FMP → Tiingo fallback chain
 * 2. Store raw inputs in dedicated columns for auditability
 * 3. Compute actual ratios: forward_pe, forward_ev_ebit, forward_ev_sales, eps_growth_fwd,
 *    revenue_growth_fwd — all requiring current DB stock context (price, market_cap, etc.)
 *
 * Forward PE fallback chain (RFC-004 §Forward Estimates Sync):
 *   Level 1: FMP (primary — ~85% forward coverage per ADR-001)
 *   Level 2: Tiingo (fallback — partial coverage)
 *   Level 3: computed trailing (formula-based — only when guardrails pass)
 *
 * Unit invariant: eps_ntm in $/share; ebit_ntm and revenue_ntm in absolute USD.
 * ebit_ttm and revenue_ttm (from STORY-027) also in absolute USD — no conversion needed.
 *
 * Execution order: must run AFTER syncFundamentals() and syncMarketCapAndMultiples()
 * to have current_price, market_cap, eps_ttm, revenue_ttm available.
 */
export async function syncForwardEstimates(
  fmpAdapter: VendorAdapter,
  tiingoAdapter: VendorAdapter,
  options: { now?: Date; tickerFilter?: string } = {},
): Promise<ForwardEstimatesSyncResult> {
  const now = options.now ?? new Date();
  const startedAt = now.getTime();
  // NOTE: FMP first — it is the primary source for forward estimates (ADR-001)
  const orchestrator = new ProviderOrchestrator();
  const providers: VendorAdapter[] = [fmpAdapter, tiingoAdapter];

  console.log(JSON.stringify({ event: 'forward_estimates_sync_start', timestamp: now.toISOString() }));

  // Fetch tickers with:
  // - Level 3 guardrail fields: trailingPe (prior run), epsGrowthFwd (prior run), cyclicalityFlag
  // - Ratio computation fields: currentPrice, marketCap, totalDebt, cashAndEquivalents, epsTtm, revenueTtm
  const stocks = await prisma.stock.findMany({
    where: { inUniverse: true, ...(options.tickerFilter ? { ticker: options.tickerFilter } : {}) },
    select: {
      ticker: true,
      trailingPe: true,
      epsGrowthFwd: true,
      cyclicalityFlag: true,
      currentPrice: true,
      marketCap: true,
      totalDebt: true,
      cashAndEquivalents: true,
      epsTtm: true,
      revenueTtm: true,
    },
  });

  let stocksUpdated = 0;
  let providerCount = 0;
  let computedFallbackCount = 0;
  let noEstimatesCount = 0;
  let errorCount = 0;
  let freshCount = 0;
  let staleCount = 0;
  let missingCount = 0;

  for (const row of stocks) {
    const { ticker } = row;
    // Convert Prisma Decimal to number | null
    const trailingPeNum = row.trailingPe != null ? Number(row.trailingPe) : null;
    // epsGrowthFwd from DB (prior run) — used only for Level 3 guardrail
    const epsGrowthFwdNum = row.epsGrowthFwd != null ? Number(row.epsGrowthFwd) : null;
    const cyclicalityFlag = row.cyclicalityFlag;
    const currentPriceNum = row.currentPrice != null ? Number(row.currentPrice) : null;
    const marketCapNum = row.marketCap != null ? Number(row.marketCap) : null;
    const totalDebtNum = row.totalDebt != null ? Number(row.totalDebt) : null;
    const cashNum = row.cashAndEquivalents != null ? Number(row.cashAndEquivalents) : null;
    const epsTtmNum = row.epsTtm != null ? Number(row.epsTtm) : null;
    const revenueTtmNum = row.revenueTtm != null ? Number(row.revenueTtm) : null;

    try {
      // ── Level 1 + 2: FMP primary → Tiingo fallback ──────────────────────────
      const estimatesResult = await orchestrator.fetchFieldWithFallback(
        ticker,
        'forward_estimates',
        providers,
        (adapter) => adapter.fetchForwardEstimates(ticker),
        { maxAttempts: 3, baseDelayMs: 1000 },
      );

      const epsNtm: number | null = estimatesResult.value?.eps_ntm ?? null;
      const ebitNtm: number | null = estimatesResult.value?.ebit_ntm ?? null;
      const revenueNtm: number | null = estimatesResult.value?.revenue_ntm ?? null;

      // EV = marketCap + totalDebt − cashAndEquivalents (null when marketCap unavailable)
      const ev = marketCapNum != null
        ? marketCapNum + (totalDebtNum ?? 0) - (cashNum ?? 0)
        : null;

      // forward_ev_sales = ev / revenue_ntm; both in absolute USD
      const forwardEvSalesComputed = ev != null && revenueNtm != null && revenueNtm > 0
        ? ev / revenueNtm
        : null;

      // STORY-031 / [BUG-DI-001] gaap_adjustment_factor — period-consistent computation.
      // Both numerator (GAAP epsDiluted) and denominator (NonGAAP epsAvg) are from FMP's own data
      // for the same completed fiscal year, eliminating period mismatches caused by Tiingo providing
      // calendar-year TTM data for non-December fiscal year companies (e.g. MSFT June FY).
      const nonGaapEpsMostRecentFy: number | null = estimatesResult.value?.nonGaapEpsMostRecentFy ?? null;
      const gaapEpsCompletedFy: number | null = estimatesResult.value?.gaapEpsCompletedFy ?? null;
      const nonGaapEarningsMostRecentFy: number | null = estimatesResult.value?.nonGaapEarningsMostRecentFy ?? null;
      const nonGaapEarningsNtm: number | null = estimatesResult.value?.nonGaapEarningsNtm ?? null;
      // BUG-DI-002: Previous FY fields — entry immediately before NTM, ensuring consecutive-year growth.
      const revenuePreviousFy: number | null = estimatesResult.value?.revenuePreviousFy ?? null;
      const nonGaapEpsPreviousFy: number | null = estimatesResult.value?.nonGaapEpsPreviousFy ?? null;
      // BUG-DI-002: GAAP EV/EBIT — adjust NonGAAP ebit_ntm to GAAP-equivalent using completed-FY ratio.
      // Factor = GAAP operatingIncome (FMP income statement) / NonGAAP ebitAvg (FMP analyst consensus).
      // Both from the same completed fiscal year — symmetric with gaapAdjustmentFactor for EPS.
      const gaapEbitCompletedFy: number | null = estimatesResult.value?.gaapEbitCompletedFy ?? null;
      const nonGaapEbitMostRecentFy: number | null = estimatesResult.value?.nonGaapEbitMostRecentFy ?? null;
      let ebitGaapAdjFactor: number | null = null;
      if (gaapEbitCompletedFy !== null && nonGaapEbitMostRecentFy !== null && Math.abs(nonGaapEbitMostRecentFy) >= 1_000_000) {
        const rawEbitFactor = gaapEbitCompletedFy / nonGaapEbitMostRecentFy;
        // Cap between 0.10 and 1.50: GAAP EBIT is always ≤ NonGAAP (no stock comp in GAAP);
        // floor prevents division by a near-zero nonGAAP denominator from producing huge values.
        ebitGaapAdjFactor = Math.max(0.10, Math.min(1.50, rawEbitFactor));
      }
      const ebitNtmGaapEquiv = ebitNtm !== null && ebitGaapAdjFactor !== null
        ? ebitNtm * ebitGaapAdjFactor
        : ebitNtm;

      // forward_ev_ebit = ev / ebitNtmGaapEquiv; both in absolute USD.
      // Uses GAAP-equivalent EBIT when ebitGaapAdjFactor is available; raw ebit_ntm otherwise.
      const forwardEvEbitComputed = ev != null && ebitNtmGaapEquiv != null && ebitNtmGaapEquiv > 0
        ? ev / ebitNtmGaapEquiv
        : null;

      let gaapAdjustmentFactor: number | null = null;
      if (gaapEpsCompletedFy !== null && nonGaapEpsMostRecentFy !== null && Math.abs(nonGaapEpsMostRecentFy) >= 0.10) {
        const raw = gaapEpsCompletedFy / nonGaapEpsMostRecentFy;
        gaapAdjustmentFactor = Math.max(0.10, Math.min(2.00, raw));
      }

      // [BUG-DI-001] Apply gaapAdjustmentFactor to normalize Non-GAAP NTM EPS to GAAP-equivalent.
      // With period-consistent factor (both sides FMP, same fiscal year), no cap is needed:
      // the factor now correctly represents the true GAAP/NonGAAP basis difference.
      const epsNtmGaapEquiv = epsNtm !== null && gaapAdjustmentFactor !== null
        ? epsNtm * gaapAdjustmentFactor
        : epsNtm;

      // forward_pe = price / epsNtmGaapEquiv (GAAP-equivalent NTM EPS).
      // Computed after GAAP adjustment so the multiple is on a GAAP basis, consistent with
      // valuation thresholds which are calibrated to GAAP P/E multiples.
      const forwardPeFromProvider = epsNtmGaapEquiv != null && epsNtmGaapEquiv > 0 && currentPriceNum != null
        ? currentPriceNum / epsNtmGaapEquiv
        : null;

      // BUG-DI-002: eps_growth_fwd — consecutive FY comparison: (epsNtm − nonGaapEpsPreviousFy) / nonGaapEpsPreviousFy
      // nonGaapEpsPreviousFy is the FY immediately before ntmEntry (year N vs year N+1).
      // gaapAdjustmentFactor cancels when applied to both sides, so NonGAAP growth = GAAP growth.
      // Falls back to gaapEpsCompletedFy denominator, then epsTtm if neither FY-aligned value is available.
      const epsBase = epsNtmGaapEquiv ?? epsNtm;
      const epsGrowthFwdComputed = epsBase != null
        ? (nonGaapEpsPreviousFy != null && Math.abs(nonGaapEpsPreviousFy) > 0.001
            ? ((epsNtm! - nonGaapEpsPreviousFy) / Math.abs(nonGaapEpsPreviousFy)) * 100
            : (gaapEpsCompletedFy != null && Math.abs(gaapEpsCompletedFy) > 0.001
                ? ((epsBase - gaapEpsCompletedFy) / Math.abs(gaapEpsCompletedFy)) * 100
                : (epsTtmNum != null && Math.abs(epsTtmNum) > 0.001
                    ? ((epsBase - epsTtmNum) / Math.abs(epsTtmNum)) * 100
                    : null)))
        : null;

      // BUG-DI-002: revenue_growth_fwd — FY-aligned: (revenueNtm − revenuePreviousFy) / revenuePreviousFy
      // revenuePreviousFy is actual revenue from FMP income statement for the most recently completed FY —
      // period-consistent with revenueNtm which is the next FY analyst consensus.
      // Falls back to revenueTtm (old NTM-vs-TTM method) when FMP income statement data is unavailable.
      const revenueGrowthFwdComputed = revenueNtm != null
        ? (revenuePreviousFy != null && revenuePreviousFy > 0
            ? ((revenueNtm - revenuePreviousFy) / revenuePreviousFy) * 100
            : (revenueTtmNum != null && revenueTtmNum > 0
                ? ((revenueNtm - revenueTtmNum) / revenueTtmNum) * 100
                : null))
        : null;

      let fwdPeValue: number | null = forwardPeFromProvider;
      let fwdPeProviderUsed: string = estimatesResult.source_provider;
      let fwdPeFallbackUsed: boolean = estimatesResult.fallback_used;
      let usedComputedFallback = false;

      // ── Level 3: computed trailing fallback for forward_pe only ─────────────
      // Uses trailingPe and epsGrowthFwd stored in DB from the previous sync run.
      // This fallback is only reached when both FMP and Tiingo return null eps_ntm.
      if (fwdPeValue === null) {
        const guardrailReason = computedFallbackGuardrail({
          trailing_pe: trailingPeNum,
          eps_growth_fwd: epsGrowthFwdNum,
          cyclicality_flag: cyclicalityFlag,
        });

        if (guardrailReason !== null) {
          console.warn(JSON.stringify({
            event: 'computed_fallback_skipped',
            ticker,
            reason: guardrailReason,
          }));
        } else {
          fwdPeValue = computeForwardPe(trailingPeNum!, epsGrowthFwdNum!);
          fwdPeProviderUsed = 'computed_trailing';
          fwdPeFallbackUsed = true;
          usedComputedFallback = true;
        }
      }

      // ── Write to DB ─────────────────────────────────────────────────────────
      const provenanceNow = now.toISOString();
      const updateData: Prisma.StockUpdateInput = {};
      const provenanceUpdates: Record<string, ProvenanceEntry> = {};

      const ntmPeriodEnd = estimatesResult.value?.ntmFiscalYearEnd ?? undefined;
      const fmpProvenance: ProvenanceEntry = {
        provider: estimatesResult.source_provider as ProvenanceEntry['provider'],
        synced_at: provenanceNow,
        fallback_used: estimatesResult.fallback_used,
        ...(ntmPeriodEnd != null && { period_end: ntmPeriodEnd }),
      };
      const computedProvenance: ProvenanceEntry = {
        provider: 'computed',
        synced_at: provenanceNow,
        fallback_used: false,
        ...(ntmPeriodEnd != null && { period_end: ntmPeriodEnd }),
      };

      // Raw NTM inputs from provider
      if (epsNtm !== null) {
        updateData.epsNtm = epsNtm;
        provenanceUpdates['eps_ntm'] = fmpProvenance;
      }
      if (ebitNtm !== null) {
        updateData.ebitNtm = ebitNtm;
        provenanceUpdates['ebit_ntm'] = fmpProvenance;
      }
      if (revenueNtm !== null) {
        updateData.revenueNtm = revenueNtm;
        provenanceUpdates['revenue_ntm'] = fmpProvenance;
      }
      if (nonGaapEarningsNtm !== null) {
        updateData.nonGaapEarningsNtm = nonGaapEarningsNtm;
        provenanceUpdates['non_gaap_earnings_ntm'] = fmpProvenance;
      }
      if (nonGaapEarningsMostRecentFy !== null) {
        updateData.nonGaapEarningsFy = nonGaapEarningsMostRecentFy;
        provenanceUpdates['non_gaap_earnings_fy'] = fmpProvenance;
      }
      if (nonGaapEpsMostRecentFy !== null) {
        updateData.nonGaapEpsFy = nonGaapEpsMostRecentFy;
        provenanceUpdates['non_gaap_eps_fy'] = fmpProvenance;
      }
      if (gaapEpsCompletedFy !== null) {
        updateData.gaapEpsCompletedFy = gaapEpsCompletedFy;
        provenanceUpdates['gaap_eps_completed_fy'] = fmpProvenance;
      }
      if (revenuePreviousFy !== null) {
        updateData.revenuePreviousFy = revenuePreviousFy;
        provenanceUpdates['revenue_previous_fy'] = fmpProvenance;
      }

      // Computed forward ratios
      if (fwdPeValue !== null) {
        updateData.forwardPe = fwdPeValue;
        provenanceUpdates['forward_pe'] = {
          provider: fwdPeProviderUsed as ProvenanceEntry['provider'],
          synced_at: provenanceNow,
          fallback_used: fwdPeFallbackUsed,
        };
        if (usedComputedFallback) computedFallbackCount++;
        else providerCount++;
      }
      if (forwardEvEbitComputed !== null) {
        updateData.forwardEvEbit = forwardEvEbitComputed;
        provenanceUpdates['forward_ev_ebit'] = computedProvenance;
      }
      if (forwardEvSalesComputed !== null) {
        updateData.forwardEvSales = forwardEvSalesComputed;
        provenanceUpdates['forward_ev_sales'] = computedProvenance;
      }
      if (epsGrowthFwdComputed !== null) {
        updateData.epsGrowthFwd = epsGrowthFwdComputed;
        provenanceUpdates['eps_growth_fwd'] = computedProvenance;
      }
      if (revenueGrowthFwdComputed !== null) {
        updateData.revenueGrowthFwd = revenueGrowthFwdComputed;
        provenanceUpdates['revenue_growth_fwd'] = computedProvenance;
      }
      if (gaapAdjustmentFactor !== null) {
        updateData.gaapAdjustmentFactor = gaapAdjustmentFactor;
        provenanceUpdates['gaap_adjustment_factor'] = {
          provider: 'computed_fmp',
          synced_at: provenanceNow,
          fallback_used: false,
        };
      }
      if (ebitGaapAdjFactor !== null) {
        updateData.ebitGaapAdjFactor = ebitGaapAdjFactor;
        provenanceUpdates['ebit_gaap_adj_factor'] = {
          provider: 'computed_fmp',
          synced_at: provenanceNow,
          fallback_used: false,
        };
      }

      if (Object.keys(updateData).length > 0) {
        const existing = await prisma.stock.findUnique({
          where: { ticker },
          select: {
            dataProviderProvenance: true,
            priceLastUpdatedAt: true,
            fundamentalsLastUpdatedAt: true,
          },
        });
        const currentProv = (existing?.dataProviderProvenance ?? {}) as Record<string, unknown>;

        const freshnessResult = computeFreshnessStatus({
          price_last_updated_at: existing?.priceLastUpdatedAt ?? null,
          fundamentals_last_updated_at: existing?.fundamentalsLastUpdatedAt ?? null,
          estimates_last_updated_at: now,
          now,
        });

        await prisma.stock.update({
          where: { ticker },
          data: {
            ...updateData,
            dataLastSyncedAt: now, // estimates_last_updated_at not in V1 schema; use dataLastSyncedAt
            dataProviderProvenance: { ...currentProv, ...provenanceUpdates } as Prisma.InputJsonValue,
            dataFreshnessStatus: freshnessResult.overall,
          },
        });
        stocksUpdated++;
        if (freshnessResult.overall === 'fresh') freshCount++;
        else if (freshnessResult.overall === 'stale') staleCount++;
        else missingCount++;
      } else {
        noEstimatesCount++;
      }
    } catch (err) {
      console.error(JSON.stringify({
        event: 'forward_estimates_sync_error',
        ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
      errorCount++;
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(JSON.stringify({
    event: 'forward_estimates_sync_complete',
    stocks_updated: stocksUpdated,
    provider_count: providerCount,
    computed_fallback_count: computedFallbackCount,
    no_estimates_count: noEstimatesCount,
    errors: errorCount,
    fresh_count: freshCount,
    stale_count: staleCount,
    missing_count: missingCount,
    duration_ms: durationMs,
  }));

  return {
    stocks_updated: stocksUpdated,
    provider_count: providerCount,
    computed_fallback_count: computedFallbackCount,
    no_estimates_count: noEstimatesCount,
    errors: errorCount,
    fresh_count: freshCount,
    stale_count: staleCount,
    missing_count: missingCount,
    duration_ms: durationMs,
  };
}
