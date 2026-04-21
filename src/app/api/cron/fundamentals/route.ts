// EPIC-003: Data Ingestion & Universe Management
// STORY-020: Fundamentals Sync Job
// TASK-020-002: POST /api/cron/fundamentals endpoint
// ADR-002: Daily 6pm ET — triggered by Cloud Scheduler
// ADR-008: OIDC authentication via verifySchedulerToken()

import { NextRequest, NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { syncFundamentals } from '@/modules/data-ingestion/jobs/fundamentals-sync.service';
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
    const tiingo = new TiingoAdapter();
    const fmp = new FMPAdapter();
    const result = await syncFundamentals(tiingo, fmp);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'fundamentals_sync_endpoint_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
