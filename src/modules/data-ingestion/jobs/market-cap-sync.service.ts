// EPIC-003: Data Ingestion & Universe Management
// STORY-027: Market Cap, Enterprise Value & Trailing Valuation Multiples
// TASK-027-005: syncMarketCapAndMultiples() — fetch FMP profile, compute EV and trailing multiples
// RFC-004 §Fundamentals Sync: runs after syncFundamentals(); reads TTM values from DB
// ADR-001: FMP as profile/market-cap source
// STORY-084 amendment: writes currentPrice from FMP profile (Tiingo-independent price source)

import type { VendorAdapter } from '../ports/vendor-adapter.interface';
import type { ProvenanceEntry } from '../types';
import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';

export interface MarketCapSyncResult {
  stocks_updated: number;
  stocks_skipped: number;
  errors: number;
  duration_ms: number;
}

/**
 * Syncs market cap, shares outstanding, and trailing valuation multiples for all
 * in-universe stocks. Must run AFTER syncFundamentals() — reads earningsTtm,
 * revenueTtm, ebitTtm, epsTtm, totalDebt, cashAndEquivalents from the stocks table.
 *
 * EV = marketCap + totalDebt − cashAndEquivalents
 * trailing_pe = currentPrice / epsTtm (null if epsTtm ≤ 0)
 * trailing_ev_ebit = EV / ebitTtm (null if ebitTtm ≤ 0)
 * ev_sales = EV / revenueTtm (null if revenueTtm = 0)
 */
export async function syncMarketCapAndMultiples(
  fmpAdapter: VendorAdapter,
  options: { now?: Date; tickerFilter?: string } = {},
): Promise<MarketCapSyncResult> {
  const now = options.now ?? new Date();
  const startedAt = now.getTime();

  console.log(JSON.stringify({ event: 'market_cap_sync_start', timestamp: now.toISOString() }));

  const stocks = await prisma.stock.findMany({
    where: { inUniverse: true, ...(options.tickerFilter ? { ticker: options.tickerFilter } : {}) },
    select: {
      ticker: true,
      currentPrice: true,
      earningsTtm: true,
      revenueTtm: true,
      ebitTtm: true,
      epsTtm: true,
      totalDebt: true,
      cashAndEquivalents: true,
      dataProviderProvenance: true,
    },
  });

  let stocksUpdated = 0;
  let stocksSkipped = 0;
  let errorCount = 0;

  for (const stock of stocks) {
    try {
      const profile = await fmpAdapter.fetchMetadata(stock.ticker);

      if (profile === null || profile.market_cap_usd === null) {
        console.warn(JSON.stringify({ event: 'market_cap_sync_no_profile', ticker: stock.ticker }));
        stocksSkipped++;
        continue;
      }

      const marketCap = profile.market_cap_usd;
      const sharesOutstanding = profile.shares_outstanding;
      // Use FMP profile price as Tiingo-independent source; only overwrite if FMP provides a value
      const fmpPrice = profile.current_price;

      const totalDebt = stock.totalDebt != null ? Number(stock.totalDebt) : 0;
      const cash = stock.cashAndEquivalents != null ? Number(stock.cashAndEquivalents) : 0;
      const ev = marketCap + totalDebt - cash;

      // Prefer FMP profile price; fall back to existing DB value (null-not-overwrite)
      const currentPrice = fmpPrice ?? (stock.currentPrice != null ? Number(stock.currentPrice) : null);
      const epsTtm = stock.epsTtm != null ? Number(stock.epsTtm) : null;
      const ebitTtm = stock.ebitTtm != null ? Number(stock.ebitTtm) : null;
      const revenueTtm = stock.revenueTtm != null ? Number(stock.revenueTtm) : null;

      const trailingPe =
        currentPrice !== null && epsTtm !== null && epsTtm > 0
          ? currentPrice / epsTtm
          : null;

      const trailingEvEbit =
        ebitTtm !== null && ebitTtm > 0 ? ev / ebitTtm : null;

      const evSales =
        revenueTtm !== null && revenueTtm > 0 ? ev / revenueTtm : null;

      const fmpProvenance: ProvenanceEntry = {
        provider: 'fmp',
        synced_at: now.toISOString(),
        fallback_used: false,
      };
      const computedProvenance: ProvenanceEntry = {
        provider: 'computed',
        synced_at: now.toISOString(),
        fallback_used: false,
      };

      const provenanceUpdates: Record<string, ProvenanceEntry> = {
        market_cap: fmpProvenance,
        ...(sharesOutstanding !== null ? { shares_outstanding: fmpProvenance } : {}),
        ...(fmpPrice !== null ? { current_price: fmpProvenance } : {}),
        ...(trailingPe !== null ? { trailing_pe: computedProvenance } : {}),
        ...(trailingEvEbit !== null ? { trailing_ev_ebit: computedProvenance } : {}),
        ...(evSales !== null ? { ev_sales: computedProvenance } : {}),
      };

      const currentProv = (stock.dataProviderProvenance ?? {}) as Record<string, unknown>;

      const updateData: Prisma.StockUpdateInput = {
        marketCap,
        ...(sharesOutstanding !== null ? { sharesOutstanding } : {}),
        ...(fmpPrice !== null ? { currentPrice: fmpPrice } : {}),
        ...(trailingPe !== null ? { trailingPe } : {}),
        ...(trailingEvEbit !== null ? { trailingEvEbit } : {}),
        ...(evSales !== null ? { evSales } : {}),
        dataProviderProvenance: { ...currentProv, ...provenanceUpdates } as Prisma.InputJsonValue,
      };

      await prisma.stock.update({
        where: { ticker: stock.ticker },
        data: updateData,
      });

      console.log(JSON.stringify({
        event: 'market_cap_sync_updated',
        ticker: stock.ticker,
        market_cap_usd: marketCap,
        trailing_pe: trailingPe,
        trailing_ev_ebit: trailingEvEbit,
        ev_sales: evSales,
      }));

      stocksUpdated++;
    } catch (err) {
      console.error(JSON.stringify({
        event: 'market_cap_sync_error',
        ticker: stock.ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
      errorCount++;
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(JSON.stringify({
    event: 'market_cap_sync_complete',
    stocks_updated: stocksUpdated,
    stocks_skipped: stocksSkipped,
    errors: errorCount,
    duration_ms: durationMs,
  }));

  return {
    stocks_updated: stocksUpdated,
    stocks_skipped: stocksSkipped,
    errors: errorCount,
    duration_ms: durationMs,
  };
}
