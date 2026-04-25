// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-077: Valuation Recompute Batch Job
// TASK-077-001: runValuationBatch() — nightly recompute for all in-universe stocks

import { prisma } from '@/infrastructure/database/prisma';
import { persistValuationState } from './valuation-persistence.service';

export interface ValuationBatchOpts {
  force?: boolean;
  tickerFilter?: string;
}

export interface ValuationBatchSummary {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  duration_ms: number;
}

export async function runValuationBatch(opts: ValuationBatchOpts = {}): Promise<ValuationBatchSummary> {
  const startedAt = Date.now();
  const { force = false, tickerFilter } = opts;

  console.log(JSON.stringify({ event: 'valuation_batch_start', force, tickerFilter: tickerFilter ?? 'all' }));

  const stocks = await prisma.stock.findMany({
    where: {
      inUniverse: true,
      ...(tickerFilter ? { ticker: tickerFilter } : {}),
    },
    select: { ticker: true },
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { ticker } of stocks) {
    try {
      const result = await persistValuationState(ticker, { force });
      if (result.status === 'updated') updated++;
      else if (result.status === 'skipped') skipped++;
      else errors++;
    } catch (err) {
      errors++;
      console.log(JSON.stringify({
        event: 'valuation_batch_ticker_error',
        ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  const duration_ms = Date.now() - startedAt;
  const summary: ValuationBatchSummary = { total: stocks.length, updated, skipped, errors, duration_ms };

  console.log(JSON.stringify({ event: 'valuation_batch_complete', ...summary }));

  return summary;
}
