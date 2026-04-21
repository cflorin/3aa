// EPIC-003: Data Ingestion & Universe Management
// STORY-027: Market Cap, Enterprise Value & Trailing Valuation Multiples
// TASK-027-005: POST /api/cron/market-cap endpoint
// ADR-002: Daily — must run AFTER /cron/price-sync and BEFORE /cron/estimates
// ADR-008: OIDC authentication via verifySchedulerToken()
//
// Pipeline order: fundamentals → price-sync → market-cap → estimates
// market-cap reads currentPrice/TTM values written by the two preceding steps.
// estimates reads marketCap written by this step to compute forward EV multiples.

import { NextRequest, NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { syncMarketCapAndMultiples } from '@/modules/data-ingestion/jobs/market-cap-sync.service';
import { FMPAdapter } from '@/modules/data-ingestion/adapters/fmp.adapter';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifySchedulerToken(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fmp = new FMPAdapter();
    const result = await syncMarketCapAndMultiples(fmp);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'market_cap_sync_endpoint_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
