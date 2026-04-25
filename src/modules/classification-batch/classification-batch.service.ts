// EPIC-004: Classification Engine & Universe Screen
// STORY-047: Classification Recompute Batch Job
// TASK-047-003: runClassificationBatch — iterate all in-universe stocks, classify, persist
// RFC-001 §Classification Batch Job; ADR-002 (8 PM ET pipeline); ADR-013

import { prisma } from '@/infrastructure/database/prisma';
import { classifyStock } from '@/domain/classification/classifier';
import { persistClassification, getClassificationState } from '@/domain/classification/persistence';
import { shouldRecompute } from '@/domain/classification/recompute';
import { toClassificationInput, CLASSIFICATION_STOCK_FIELDS } from '@/domain/classification/input-mapper';
import type { ClassificationInput } from '@/domain/classification/types';

export interface BatchSummary {
  processed: number;
  recomputed: number;
  skipped: number;
  errors: number;
  duration_ms: number;
}

const DURATION_WARN_MS = 45_000;

export async function runClassificationBatch(opts: { tickerFilter?: string; force?: boolean } = {}): Promise<BatchSummary> {
  const start = Date.now();
  let recomputed = 0;
  let skipped = 0;
  let errors = 0;

  const stocks = await prisma.stock.findMany({
    where: { inUniverse: true, ...(opts.tickerFilter ? { ticker: opts.tickerFilter } : {}) },
    select: CLASSIFICATION_STOCK_FIELDS,
    orderBy: { ticker: 'asc' },
  });

  for (const stock of stocks) {
    try {
      const current: ClassificationInput = toClassificationInput(stock);
      const state = await getClassificationState(stock.ticker);
      const previous = (state?.input_snapshot as ClassificationInput | null | undefined) ?? null;

      if (opts.force || shouldRecompute(current, previous)) {
        const result = classifyStock(current);
        await persistClassification(stock.ticker, result, current);
        recomputed++;
        console.log(JSON.stringify({
          event: 'classification_batch_recomputed',
          ticker: stock.ticker,
          suggested_code: result.suggested_code,
          confidence: result.confidence_level,
        }));
      } else {
        skipped++;
        console.log(JSON.stringify({ event: 'classification_batch_skipped', ticker: stock.ticker }));
      }
    } catch (err) {
      errors++;
      console.error(JSON.stringify({
        event: 'classification_batch_error',
        ticker: stock.ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  const duration_ms = Date.now() - start;
  if (duration_ms > DURATION_WARN_MS) {
    console.warn(JSON.stringify({ event: 'classification_batch_slow', duration_ms }));
  }

  return { processed: stocks.length, recomputed, skipped, errors, duration_ms };
}
