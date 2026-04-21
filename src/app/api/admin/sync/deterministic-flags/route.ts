// EPIC-003: Data Ingestion & Universe Management
// STORY-033: Deterministic Classification Flags
// TASK-033-003: POST /api/admin/sync/deterministic-flags
// Auth: validateAdminApiKey (EPIC-002 admin pattern — ADR-011)
// RFC-004: admin-triggered sync route pattern

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminApiKey } from '@/lib/admin-auth';
import { syncDeterministicClassificationFlags } from '@/modules/data-ingestion/jobs/deterministic-classification-sync.service';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncDeterministicClassificationFlags();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'deterministic_flags_sync_route_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
