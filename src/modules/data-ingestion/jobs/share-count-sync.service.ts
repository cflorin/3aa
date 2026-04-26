// EPIC-003: Data Ingestion & Universe Management
// STORY-032: Share Count Growth (3-Year CAGR)
// TASK-032-004: syncShareCount() — standalone share count CAGR sync
//
// Authoritative writer for share_count_growth_3y using the income-statement derivation.
// Runs independently of the nightly fundamentals sync (admin-triggered or on-demand).
// RFC-002: stocks.share_count_growth_3y + data_provider_provenance
// BC-032-001: historical-market-cap endpoint unavailable; income-statement approach adopted.

import type { FMPAdapter } from '../adapters/fmp.adapter';
import { computeShareCountGrowth3y } from '../utils/share-count-growth';
import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';

export interface ShareCountSyncResult {
  updated: number;
  skipped: number;
  errors: number;
}

export async function syncShareCount(
  fmpAdapter: FMPAdapter,
  opts?: { tickerFilter?: string },
): Promise<ShareCountSyncResult> {
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  console.log(JSON.stringify({ event: 'share_count_sync_start' }));

  const where: { inUniverse: boolean; ticker?: string } = { inUniverse: true };
  if (opts?.tickerFilter) where.ticker = opts.tickerFilter;

  const stocks = await prisma.stock.findMany({
    where,
    select: { ticker: true },
  });

  for (const { ticker } of stocks) {
    try {
      const entries = await fmpAdapter.fetchAnnualShareCounts(ticker);
      const result = computeShareCountGrowth3y(entries);

      if (result === null) {
        skipped++;
        continue;
      }

      const provenanceEntry = {
        provider: 'fmp' as const,
        method: 'income_statement_cagr',
        period_start: result.periodStart,
        period_end: result.periodEnd,
        synced_at: new Date().toISOString(),
      };

      // Read existing provenance and merge — only share_count_growth_3y key overwritten
      const existing = await prisma.stock.findUnique({
        where: { ticker },
        select: { dataProviderProvenance: true },
      });
      const currentProv = (existing?.dataProviderProvenance ?? {}) as Record<string, unknown>;

      await prisma.stock.update({
        where: { ticker },
        data: {
          shareCountGrowth3y: result.growth,
          dataProviderProvenance: {
            ...currentProv,
            share_count_growth_3y: provenanceEntry,
          } as Prisma.InputJsonValue,
        },
      });

      updated++;
    } catch (err) {
      errors++;
      console.error(JSON.stringify({
        event: 'share_count_sync_error',
        ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  console.log(JSON.stringify({ event: 'share_count_sync_complete', updated, skipped, errors }));
  return { updated, skipped, errors };
}
