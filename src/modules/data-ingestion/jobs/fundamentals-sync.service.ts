// EPIC-003: Data Ingestion & Universe Management
// STORY-020: Fundamentals Sync Job
// TASK-020-001: syncFundamentals() — daily fundamentals sync
// STORY-022: data_freshness_status updated after each fundamentals write
// RFC-001 §FundamentalFields: canonical 15-field list
// RFC-002: stocks table column mapping, data_provider_provenance per field
// RFC-004 §Fundamentals Sync: provider order, null-not-overwrite, per-field provenance
// ADR-001: Tiingo primary for fundamentals; FMP fallback
// ADR-002: Daily 6pm ET slot

import type { VendorAdapter } from '../ports/vendor-adapter.interface';
import type { FundamentalData, ProvenanceEntry } from '../types';
import { ProviderOrchestrator } from '../provider-orchestrator';
import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';
import { computeFreshnessStatus } from '../freshness.util';

export interface FundamentalsSyncResult {
  stocks_updated: number;
  fields_populated: number;
  fallback_count: number;
  errors: number;
  fresh_count: number;
  stale_count: number;
  missing_count: number;
  duration_ms: number;
}

// V1 note: FundamentalData type (RFC-004 adapter interface) uses field names designed
// for adapter normalizers; some DB columns (RFC-002) use different names. The mappings
// below document the V1 correspondence. Fields with no safe stocks-table counterpart
// (revenue_ttm, roa, current_ratio) are intentionally skipped; a future RFC amendment
// should align the canonical names.
function buildUpdateFromFundamentals(
  fundamentals: FundamentalData,
  provenance: ProvenanceEntry,
): { data: Prisma.StockUpdateInput; provenance: Record<string, ProvenanceEntry>; fieldCount: number } {
  const data: Prisma.StockUpdateInput = {};
  const provenanceUpdates: Record<string, ProvenanceEntry> = {};
  let fieldCount = 0;

  // Growth fields — STORY-029: 3y CAGR fields (fixed from incorrect YoY proxy)
  if (fundamentals.revenue_growth_3y != null) {
    data.revenueGrowth3y = fundamentals.revenue_growth_3y;
    provenanceUpdates['revenue_growth_3y'] = provenance;
    fieldCount++;
  }
  if (fundamentals.eps_growth_3y != null) {
    data.epsGrowth3y = fundamentals.eps_growth_3y;
    provenanceUpdates['eps_growth_3y'] = provenance;
    fieldCount++;
  }
  if (fundamentals.gross_profit_growth != null) {
    data.grossProfitGrowth = fundamentals.gross_profit_growth;
    provenanceUpdates['gross_profit_growth'] = provenance;
    fieldCount++;
  }
  // share_count_growth_3y: removed — ShareCountSyncService is the authoritative writer (STORY-032)
  if (fundamentals.eps_growth_fwd != null) {
    data.epsGrowthFwd = fundamentals.eps_growth_fwd;
    provenanceUpdates['eps_growth_fwd'] = provenance;
    fieldCount++;
  }

  // Profitability fields
  if (fundamentals.gross_margin != null) {
    data.grossMargin = fundamentals.gross_margin;
    provenanceUpdates['gross_margin'] = provenance;
    fieldCount++;
  }
  if (fundamentals.operating_margin != null) {
    data.operatingMargin = fundamentals.operating_margin;
    provenanceUpdates['operating_margin'] = provenance;
    fieldCount++;
  }
  if (fundamentals.net_margin != null) {
    data.fcfMargin = fundamentals.net_margin; // V1 proxy: net_margin used for fcf_margin
    provenanceUpdates['fcf_margin'] = provenance;
    fieldCount++;
  }
  if (fundamentals.fcf_ttm != null && fundamentals.earnings_ttm != null && fundamentals.earnings_ttm !== 0) {
    data.fcfConversion = fundamentals.fcf_ttm / fundamentals.earnings_ttm;
    provenanceUpdates['fcf_conversion'] = provenance;
    fieldCount++;
  }
  if (fundamentals.fcf_ttm != null) {
    data.fcfPositive = fundamentals.fcf_ttm > 0;
    provenanceUpdates['fcf_positive'] = provenance;
    fieldCount++;
  }
  if (fundamentals.roic != null) {
    data.roic = fundamentals.roic;
    provenanceUpdates['roic'] = provenance;
    fieldCount++;
  }
  if (fundamentals.trailing_pe != null) {
    data.trailingPe = fundamentals.trailing_pe;
    provenanceUpdates['trailing_pe'] = provenance;
    fieldCount++;
  }
  if (fundamentals.earnings_ttm != null) {
    data.netIncomePositive = fundamentals.earnings_ttm > 0;
    data.earningsTtm = fundamentals.earnings_ttm;
    provenanceUpdates['net_income_positive'] = provenance;
    provenanceUpdates['earnings_ttm'] = provenance;
    fieldCount += 2;
  }
  if (fundamentals.revenue_ttm != null) {
    data.revenueTtm = fundamentals.revenue_ttm;
    provenanceUpdates['revenue_ttm'] = provenance;
    fieldCount++;
  }
  if (fundamentals.ebit_ttm != null) {
    data.ebitTtm = fundamentals.ebit_ttm;
    provenanceUpdates['ebit_ttm'] = provenance;
    fieldCount++;
  }
  if (fundamentals.eps_ttm != null) {
    data.epsTtm = fundamentals.eps_ttm;
    provenanceUpdates['eps_ttm'] = provenance;
    fieldCount++;
  }

  // Balance sheet fields
  if (fundamentals.net_debt_to_ebitda != null) {
    data.netDebtToEbitda = fundamentals.net_debt_to_ebitda;
    provenanceUpdates['net_debt_to_ebitda'] = provenance;
    fieldCount++;
  }
  if (fundamentals.total_debt != null) {
    data.totalDebt = fundamentals.total_debt;
    provenanceUpdates['total_debt'] = provenance;
    fieldCount++;
  }
  if (fundamentals.cash_and_equivalents != null) {
    data.cashAndEquivalents = fundamentals.cash_and_equivalents;
    provenanceUpdates['cash_and_equivalents'] = provenance;
    fieldCount++;
  }
  if (fundamentals.interest_coverage != null) {
    data.interestCoverage = fundamentals.interest_coverage;
    provenanceUpdates['interest_coverage'] = provenance;
    fieldCount++;
  }

  return { data, provenance: provenanceUpdates, fieldCount };
}

/**
 * Syncs fundamental fields for all in-universe stocks.
 * Per-field null-not-overwrite: if provider returns null for a field,
 * the existing DB value is preserved.
 * Provenance written per field on successful write.
 * One atomic prisma.stock.update per stock — merges all written fields and provenance.
 */
export async function syncFundamentals(
  tiingoAdapter: VendorAdapter,
  fmpAdapter: VendorAdapter,
  options: { now?: Date } = {},
): Promise<FundamentalsSyncResult> {
  const now = options.now ?? new Date();
  const startedAt = now.getTime();
  const orchestrator = new ProviderOrchestrator();
  const providers: VendorAdapter[] = [tiingoAdapter, fmpAdapter];

  console.log(JSON.stringify({ event: 'fundamentals_sync_start', timestamp: now.toISOString() }));

  const stocks = await prisma.stock.findMany({
    where: { inUniverse: true },
    select: { ticker: true },
  });
  const tickers = stocks.map((s) => s.ticker);

  let stocksUpdated = 0;
  let fieldsPopulated = 0;
  let fallbackCount = 0;
  let errorCount = 0;
  let freshCount = 0;
  let staleCount = 0;
  let missingCount = 0;

  for (const ticker of tickers) {
    try {
      const result = await orchestrator.fetchFieldWithFallback(
        ticker,
        'fundamentals',
        providers,
        (adapter) => adapter.fetchFundamentals(ticker),
        { maxAttempts: 3, baseDelayMs: 1000 },
      );

      if (result.value === null) {
        console.warn(JSON.stringify({ event: 'fundamentals_sync_no_data', ticker }));
        errorCount++;
        continue;
      }

      const fundamentals = result.value as FundamentalData;
      const provenanceEntry: ProvenanceEntry = {
        provider: result.source_provider as ProvenanceEntry['provider'],
        synced_at: now.toISOString(),
        fallback_used: result.fallback_used,
        ...(fundamentals.statementPeriodEnd != null && { period_end: fundamentals.statementPeriodEnd }),
      };

      const { data: fieldUpdates, provenance: provenanceUpdates, fieldCount } =
        buildUpdateFromFundamentals(fundamentals, provenanceEntry);

      if (fieldCount === 0) {
        // Provider returned all-null fields — nothing to write; don't update last_updated_at
        console.warn(JSON.stringify({ event: 'fundamentals_sync_all_null', ticker }));
        continue;
      }

      // Read current provenance and merge, preserving other fields already in JSONB
      const existing = await prisma.stock.findUnique({
        where: { ticker },
        select: {
          dataProviderProvenance: true,
          priceLastUpdatedAt: true,
          dataLastSyncedAt: true,
        },
      });
      const currentProv = (existing?.dataProviderProvenance ?? {}) as Record<string, unknown>;

      const freshnessResult = computeFreshnessStatus({
        price_last_updated_at: existing?.priceLastUpdatedAt ?? null,
        fundamentals_last_updated_at: now,
        estimates_last_updated_at: existing?.dataLastSyncedAt ?? null,
        now,
      });

      await prisma.stock.update({
        where: { ticker },
        data: {
          ...fieldUpdates,
          fundamentalsLastUpdatedAt: now,
          dataProviderProvenance: { ...currentProv, ...provenanceUpdates } as Prisma.InputJsonValue,
          dataFreshnessStatus: freshnessResult.overall,
        },
      });

      stocksUpdated++;
      fieldsPopulated += fieldCount;
      if (result.fallback_used) fallbackCount++;
      if (freshnessResult.overall === 'fresh') freshCount++;
      else if (freshnessResult.overall === 'stale') staleCount++;
      else missingCount++;
    } catch (err) {
      console.error(JSON.stringify({
        event: 'fundamentals_sync_error',
        ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
      errorCount++;
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(JSON.stringify({
    event: 'fundamentals_sync_complete',
    stocks_updated: stocksUpdated,
    fields_populated: fieldsPopulated,
    fallback_count: fallbackCount,
    errors: errorCount,
    duration_ms: durationMs,
  }));

  return {
    stocks_updated: stocksUpdated,
    fields_populated: fieldsPopulated,
    fallback_count: fallbackCount,
    errors: errorCount,
    fresh_count: freshCount,
    stale_count: staleCount,
    missing_count: missingCount,
    duration_ms: durationMs,
  };
}
