// EPIC-001/STORY-003/TASK-003-007 (initial placeholder)
// EPIC-001/STORY-007/TASK-007-003 (OIDC verification)
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-077: Valuation Recompute Batch Job
// TASK-077-002: Replace placeholder with real runValuationBatch() implementation

import { NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { runValuationBatch } from '@/modules/valuation/valuation-batch.service';

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

    const summary = await runValuationBatch({ force, tickerFilter: ticker });
    return NextResponse.json(summary);
  } catch (err) {
    console.error('Valuation batch failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Valuation batch failed' },
      { status: 500 },
    );
  }
}
