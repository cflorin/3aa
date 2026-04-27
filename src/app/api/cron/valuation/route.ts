// EPIC-001/STORY-003/TASK-003-007 (initial placeholder)
// EPIC-001/STORY-007/TASK-007-003 (OIDC verification)
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-077: Valuation Recompute Batch Job
// TASK-077-002: Replace placeholder with real runValuationBatch() implementation
// EPIC-008/STORY-094/TASK-094-005: Wire CyclicalScoreService before valuation batch

import { NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { runValuationBatch } from '@/modules/valuation/valuation-batch.service';
import { cyclicalScoreService } from '@/modules/valuation/cyclical-score.service';

export async function POST(request: Request) {
  try {
    await verifySchedulerToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';
    const ticker = url.searchParams.get('ticker') ?? undefined;

    // Step 1: Refresh cyclical scores (EPIC-008/ADR-018)
    // Runs before valuation batch so updated scores are in DB when thresholds are computed
    const tickers = ticker ? [ticker] : undefined;
    const cyclicalResult = await cyclicalScoreService.computeAndPersist(tickers);
    console.log(JSON.stringify({
      event: 'cyclical_scores_refreshed',
      processed: cyclicalResult.processed,
      errors: cyclicalResult.errors,
    }));

    // Step 2: Run valuation batch with updated cyclical scores
    const summary = await runValuationBatch({ force, tickerFilter: ticker });
    return NextResponse.json({ cyclical: cyclicalResult, valuation: summary });
  } catch (err) {
    console.error('Valuation batch failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Valuation batch failed' },
      { status: 500 },
    );
  }
}
