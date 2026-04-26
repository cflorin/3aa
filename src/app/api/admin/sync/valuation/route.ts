// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-086: Recompute Valuations — Admin API & Universe Screen Button
// TASK-086-001: POST /api/admin/sync/valuation — dual-auth batch valuation recompute
//
// Auth: session cookie (UI) OR OIDC Bearer token (external callers / scripts)
// Params: ?force=true (default true), ?ticker=AAPL (optional — single-stock mode)

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { runValuationBatch } from '@/modules/valuation/valuation-batch.service';

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  // Try session cookie first (UI path)
  const sessionId = req.cookies.get('sessionId')?.value;
  if (sessionId) {
    const user = await validateSession(sessionId);
    if (user) return true;
  }
  // Fall back to OIDC bearer token (external / script path)
  try {
    await verifySchedulerToken(req);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('force') !== 'false'; // default true
    const tickerFilter = url.searchParams.get('ticker') ?? undefined;

    const summary = await runValuationBatch({ force, tickerFilter });
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'admin_sync_valuation_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
