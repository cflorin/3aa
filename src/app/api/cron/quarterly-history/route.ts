// EPIC-003: Data Ingestion & Universe Management
// STORY-063: Quarterly History Cron Route & Cloud Scheduler Job
// STORY-085: Switched from TiingoAdapter to FMPAdapter for quarterly history
// RFC-004 Amendment 2026-04-25 (pipeline stage position)
// RFC-008 §Ingestion Sync Architecture; ADR-002 Amendment 2026-04-25 (6:45 PM ET slot)
// ADR-016 §Pipeline Position; ADR-008: OIDC authentication via verifySchedulerToken()
//
// Pipeline position: runs at 6:45 PM ET after market-cap step
// Orchestrates: syncQuarterlyHistory → computeDerivedMetricsBatch → computeTrendMetricsBatch

import { NextRequest, NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { FMPAdapter } from '@/modules/data-ingestion/adapters/fmp.adapter';
import { syncQuarterlyHistory } from '@/modules/data-ingestion/jobs/quarterly-history-sync.service';
import { computeDerivedMetricsBatch } from '@/modules/data-ingestion/jobs/derived-metrics-computation.service';
import { computeTrendMetricsBatch } from '@/modules/data-ingestion/jobs/trend-metrics-computation.service';
import { prisma } from '@/infrastructure/database/prisma';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifySchedulerToken(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const forceFullScan = url.searchParams.get('force') === 'true';
    const tickerFilter = url.searchParams.get('ticker') ?? undefined;

    console.log(JSON.stringify({ event: 'quarterly_history_cron_started', forceFullScan, tickerFilter }));

    const fmp = new FMPAdapter();
    const syncResult = await syncQuarterlyHistory(fmp, { forceFullScan, tickerFilter });

    // Determine which tickers to run derivation for.
    // Single-ticker mode: use only that ticker (skips full-table scan).
    // Batch mode: fetch all in-universe tickers from DB.
    let tickers: string[];
    if (tickerFilter) {
      tickers = [tickerFilter];
    } else {
      const stocks = await prisma.stock.findMany({
        where: { inUniverse: true },
        select: { ticker: true },
      });
      tickers = stocks.map(s => s.ticker);
    }

    if (tickers.length > 0) {
      await computeDerivedMetricsBatch(tickers);
      await computeTrendMetricsBatch(tickers);
    }

    const summary = { ...syncResult };
    console.log(JSON.stringify({ event: 'quarterly_history_cron_complete', summary }));

    return NextResponse.json({ ok: true, summary }, { status: 200 });

  } catch (err) {
    console.error(JSON.stringify({
      event: 'quarterly_history_cron_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
