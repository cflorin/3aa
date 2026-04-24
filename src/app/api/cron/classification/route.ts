// EPIC-004: Classification Engine & Universe Screen
// STORY-047: Classification Recompute Batch Job
// TASK-047-004: POST /api/cron/classification — nightly classification batch
// RFC-001 §Classification Batch Job; ADR-008 (OIDC auth); ADR-002 (8 PM ET pipeline)
// Replaces EPIC-001/STORY-003/TASK-003-007 placeholder

import { NextRequest, NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { runClassificationBatch } from '@/modules/classification-batch/classification-batch.service';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifySchedulerToken(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runClassificationBatch();
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'classification_batch_endpoint_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
