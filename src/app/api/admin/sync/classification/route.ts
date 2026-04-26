// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-084: Recompute Classification — Admin API & Universe Screen Button
// TASK-084-001: POST /api/admin/sync/classification — session-auth batch re-classification
// Auth: validateSession (same pattern as /api/universe/stocks — callable from UI and scripts)
// ADR-011: admin action; ADR-013: classification batch

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { runClassificationBatch } from '@/modules/classification-batch/classification-batch.service';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await validateSession(sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runClassificationBatch({ force: true });
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'admin_sync_classification_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
