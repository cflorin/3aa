// EPIC-003: Data Ingestion & Universe Management
// STORY-019: Price Sync Job
// TASK-019-001: syncPrices() — daily EOD price sync
// STORY-022: data_freshness_status updated after each price write
// RFC-002: stocks.current_price, price_last_updated_at, data_provider_provenance
// RFC-004 §Price Sync — Tiingo primary, FMP fallback, null-not-overwrite invariant
// ADR-001: Tiingo primary for prices; FMP fallback
// ADR-002: Daily 5pm ET slot

import type { VendorAdapter } from '../ports/vendor-adapter.interface';
import type { ProvenanceEntry } from '../types';
import { ProviderOrchestrator } from '../provider-orchestrator';
import { prisma } from '@/infrastructure/database/prisma';
import { computeFreshnessStatus } from '../freshness.util';

export interface PriceSyncResult {
  stocks_updated: number;
  fallback_count: number;
  errors: number;
  fresh_count: number;
  stale_count: number;
  missing_count: number;
  duration_ms: number;
}

/**
 * Syncs EOD prices for all in-universe stocks.
 * Provider order: Tiingo (primary) → FMP (fallback), per ADR-001.
 * Null-not-overwrite invariant: existing current_price is never set to null.
 * data_provider_provenance.current_price is updated atomically with the price write.
 */
export async function syncPrices(
  tiingoAdapter: VendorAdapter,
  fmpAdapter: VendorAdapter,
  options: { now?: Date } = {},
): Promise<PriceSyncResult> {
  const now = options.now ?? new Date();
  const startedAt = now.getTime();
  const orchestrator = new ProviderOrchestrator();

  // Ordered provider list: Tiingo primary, FMP fallback (ADR-001)
  const providers: VendorAdapter[] = [tiingoAdapter, fmpAdapter];

  console.log(JSON.stringify({ event: 'price_sync_start', timestamp: now.toISOString() }));

  // Fetch all in-universe tickers
  const stocks = await prisma.stock.findMany({
    where: { inUniverse: true },
    select: { ticker: true },
  });
  const tickers = stocks.map((s) => s.ticker);

  let stocksUpdated = 0;
  let fallbackCount = 0;
  let errorCount = 0;
  let freshCount = 0;
  let staleCount = 0;
  let missingCount = 0;

  for (const ticker of tickers) {
    try {
      const result = await orchestrator.fetchFieldWithFallback(
        ticker,
        'current_price',
        providers,
        (adapter) => adapter.fetchEODPrice(ticker),
        { maxAttempts: 3, baseDelayMs: 1000 },
      );

      if (result.value === null) {
        // Both providers returned null — leave current_price unchanged (null-not-overwrite)
        console.warn(JSON.stringify({
          event: 'price_sync_no_data',
          ticker,
          source_provider: result.source_provider,
        }));
        errorCount++;
        continue;
      }

      const provenance: ProvenanceEntry = {
        provider: result.source_provider as ProvenanceEntry['provider'],
        synced_at: now.toISOString(),
        fallback_used: result.fallback_used,
      };

      // Read current provenance + timestamps needed for freshness computation
      const existing = await prisma.stock.findUnique({
        where: { ticker },
        select: {
          dataProviderProvenance: true,
          fundamentalsLastUpdatedAt: true,
          dataLastSyncedAt: true, // proxy for estimates_last_updated_at
        },
      });
      const currentProv = (existing?.dataProviderProvenance ?? {}) as Record<string, unknown>;

      // Compute freshness using the new price timestamp (now) + existing fundamentals/estimates times
      const freshnessResult = computeFreshnessStatus({
        price_last_updated_at: now,
        fundamentals_last_updated_at: existing?.fundamentalsLastUpdatedAt ?? null,
        estimates_last_updated_at: existing?.dataLastSyncedAt ?? null,
        now,
      });

      await prisma.stock.update({
        where: { ticker },
        data: {
          currentPrice: result.value.close,
          priceLastUpdatedAt: now,
          dataProviderProvenance: { ...currentProv, current_price: provenance } as unknown as import('@prisma/client').Prisma.InputJsonValue,
          dataFreshnessStatus: freshnessResult.overall,
        },
      });

      stocksUpdated++;
      if (result.fallback_used) fallbackCount++;

      if (freshnessResult.overall === 'fresh') freshCount++;
      else if (freshnessResult.overall === 'stale') staleCount++;
      else missingCount++;

      if (result.fallback_used) {
        console.log(JSON.stringify({
          event: 'price_sync_fallback_used',
          ticker,
          provider: result.source_provider,
        }));
      }
    } catch (err) {
      console.error(JSON.stringify({
        event: 'price_sync_error',
        ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
      errorCount++;
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(JSON.stringify({
    event: 'price_sync_complete',
    stocks_updated: stocksUpdated,
    fallback_count: fallbackCount,
    errors: errorCount,
    fresh_count: freshCount,
    stale_count: staleCount,
    missing_count: missingCount,
    duration_ms: durationMs,
  }));

  return {
    stocks_updated: stocksUpdated,
    fallback_count: fallbackCount,
    errors: errorCount,
    fresh_count: freshCount,
    stale_count: staleCount,
    missing_count: missingCount,
    duration_ms: durationMs,
  };
}
