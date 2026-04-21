// EPIC-003: Data Ingestion & Universe Management
// STORY-018: Universe Sync Job
// TASK-018-001: syncUniverse() — manual operator invocation only
// RFC-004 §Universe Sync — parallel fetch, Tiingo-preferred merge, upsert, drop marking
// ADR-001: Tiingo preferred on ticker metadata conflict
// ADR-002: Universe sync is manual; not part of nightly automated pipeline
// ADR-003: In_universe=FALSE on drop; no DELETE; data retained indefinitely

import type { VendorAdapter } from '../ports/vendor-adapter.interface';
import type { UniverseStock } from '../types';
import { prisma } from '@/infrastructure/database/prisma';

export interface UniverseSyncResult {
  stocks_upserted: number;
  stocks_dropped: number;
  errors: string[];
}

/**
 * Merges two universe lists by ticker, deduplicating with Tiingo preferred.
 * When both providers return data for the same ticker, Tiingo data is kept.
 */
function mergeUniverses(
  tiingoStocks: UniverseStock[],
  fmpStocks: UniverseStock[],
): Map<string, UniverseStock> {
  const merged = new Map<string, UniverseStock>();

  // FMP first (lower priority — will be overwritten by Tiingo)
  for (const stock of fmpStocks) {
    merged.set(stock.ticker.toUpperCase(), stock);
  }

  // Tiingo second (higher priority — overwrites FMP on conflict, per ADR-001)
  for (const stock of tiingoStocks) {
    merged.set(stock.ticker.toUpperCase(), stock);
  }

  return merged;
}

/**
 * Fetches the stock universe from both Tiingo and FMP in parallel, merges them,
 * upserts qualifying stocks into the stocks table, and marks dropped stocks as
 * in_universe = FALSE.
 *
 * Called manually by an operator — NOT triggered by Cloud Scheduler.
 * No HTTP endpoint exists for this function (ADR-002).
 *
 * Safety contract: if BOTH providers fail, function aborts immediately and
 * returns an error without modifying any in_universe values. Partial data
 * (one provider down) is acceptable and continues with the other provider's data.
 */
export async function syncUniverse(
  tiingoAdapter: VendorAdapter,
  fmpAdapter: VendorAdapter,
  options: { minMarketCapMillions?: number; now?: Date } = {},
): Promise<UniverseSyncResult> {
  const minMarketCap = options.minMarketCapMillions ?? 5000;
  const startedAt = options.now ?? new Date();
  const errors: string[] = [];

  console.log(JSON.stringify({
    event: 'universe_sync_start',
    minMarketCapMillions: minMarketCap,
    startedAt: startedAt.toISOString(),
  }));

  // Fetch from both providers in parallel
  const [tiingoResult, fmpResult] = await Promise.allSettled([
    tiingoAdapter.fetchUniverse(minMarketCap),
    fmpAdapter.fetchUniverse(minMarketCap),
  ]);

  let tiingoStocks: UniverseStock[] = [];
  let fmpStocks: UniverseStock[] = [];

  if (tiingoResult.status === 'fulfilled') {
    tiingoStocks = tiingoResult.value;
  } else {
    const errMsg = `Tiingo fetchUniverse failed: ${String(tiingoResult.reason)}`;
    errors.push(errMsg);
    console.error(JSON.stringify({ event: 'tiingo_universe_failed', error: String(tiingoResult.reason) }));
  }

  if (fmpResult.status === 'fulfilled') {
    fmpStocks = fmpResult.value;
  } else {
    const errMsg = `FMP fetchUniverse failed: ${String(fmpResult.reason)}`;
    errors.push(errMsg);
    console.error(JSON.stringify({ event: 'fmp_universe_failed', error: String(fmpResult.reason) }));
  }

  // Abort if no data available AND at least one real error occurred.
  // FMP fetchUniverse() is a no-op returning [] without throwing (STORY-017 BC-017-004),
  // so errors.length===2 would never fire when only Tiingo fails. Use totalAvailable instead.
  const totalAvailable = tiingoStocks.length + fmpStocks.length;
  if (totalAvailable === 0 && errors.length > 0) {
    const abortMsg = 'No universe data available — aborting sync to preserve existing in_universe values';
    console.error(JSON.stringify({ event: 'universe_sync_aborted', reason: abortMsg }));
    return { stocks_upserted: 0, stocks_dropped: 0, errors };
  }

  // Merge and deduplicate (Tiingo preferred on conflict)
  const mergedMap = mergeUniverses(tiingoStocks, fmpStocks);

  // Post-filter: belt-and-suspenders check in case adapter returns out-of-spec data.
  // null market_cap = unknown (Tiingo has no market cap field per STORY-016 BC-016-002);
  // cannot confirm below threshold, so include. Only exclude KNOWN below-threshold stocks.
  for (const [ticker, stock] of mergedMap) {
    if (
      (stock.market_cap_millions !== null && stock.market_cap_millions < minMarketCap) ||
      stock.country.toUpperCase() !== 'US'
    ) {
      mergedMap.delete(ticker);
    }
  }

  const qualifyingTickers = Array.from(mergedMap.keys());

  if (qualifyingTickers.length === 0) {
    return { stocks_upserted: 0, stocks_dropped: 0, errors };
  }

  // UPSERT qualifying stocks into stocks table
  // New stocks inserted with data_freshness_status = 'missing' (no sync history yet)
  let stocksUpserted = 0;

  // BC-018-005: use the map key (already uppercased in mergeUniverses) as the canonical ticker,
  // not stock.ticker (original adapter casing). qualifyingTickers is built from map keys, so
  // the DB ticker must match the key or the drop query's notIn will miss these rows and wipe them.
  for (const [ticker, stock] of mergedMap) {
    try {
      await prisma.stock.upsert({
        where: { ticker },
        create: {
          ticker,
          companyName: stock.company_name,
          country: stock.country.slice(0, 2).toUpperCase(),
          marketCap: stock.market_cap_millions,
          sector: stock.sector,
          industry: stock.industry,
          inUniverse: true,
          dataFreshnessStatus: 'missing',
        },
        update: {
          companyName: stock.company_name,
          country: stock.country.slice(0, 2).toUpperCase(),
          marketCap: stock.market_cap_millions,
          sector: stock.sector,
          industry: stock.industry,
          inUniverse: true,
        },
      });
      stocksUpserted++;
    } catch (err) {
      errors.push(`Failed to upsert ${ticker}: ${String(err)}`);
    }
  }

  // Mark dropped stocks: in_universe = TRUE stocks not in merged set → set FALSE
  // ADR-003: data retained; row is never deleted
  let stocksDropped = 0;

  try {
    const dropResult = await prisma.stock.updateMany({
      where: {
        inUniverse: true,
        ticker: { notIn: qualifyingTickers },
      },
      data: {
        inUniverse: false,
      },
    });
    stocksDropped = dropResult.count;
  } catch (err) {
    errors.push(`Failed to mark dropped stocks: ${String(err)}`);
  }

  console.log(JSON.stringify({
    event: 'universe_sync_complete',
    stocks_upserted: stocksUpserted,
    stocks_dropped: stocksDropped,
    errors: errors.length,
    duration_ms: Date.now() - startedAt.getTime(),
  }));

  return { stocks_upserted: stocksUpserted, stocks_dropped: stocksDropped, errors };
}
