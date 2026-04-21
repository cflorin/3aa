// EPIC-003: Data Ingestion & Universe Management
// STORY-021: Forward Estimates Sync Job
// TASK-021-002: POST /api/cron/estimates endpoint
// ADR-002: Daily 7pm ET slot (after fundamentals sync at 6pm)
// ADR-008: OIDC authentication via verifySchedulerToken()

import { NextRequest, NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { syncForwardEstimates } from '@/modules/data-ingestion/jobs/forward-estimates-sync.service';
import { TiingoAdapter } from '@/modules/data-ingestion/adapters/tiingo.adapter';
import { FMPAdapter } from '@/modules/data-ingestion/adapters/fmp.adapter';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // OIDC auth: Cloud Scheduler attaches a signed token; reject all other callers
  try {
    await verifySchedulerToken(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fmp = new FMPAdapter();
    const tiingo = new TiingoAdapter();
    // NOTE: FMP passed first — primary source for forward estimates per ADR-001
    const result = await syncForwardEstimates(fmp, tiingo);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'estimates_sync_endpoint_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
