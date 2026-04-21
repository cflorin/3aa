// EPIC-003: Data Ingestion & Universe Management
// STORY-032: Share Count Growth (3-Year CAGR)
// TASK-032-006: POST /api/admin/sync/share-count
// Auth: validateAdminApiKey (EPIC-002 admin pattern — ADR-011)
// RFC-004: admin-triggered sync route pattern

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminApiKey } from '@/lib/admin-auth';
import { syncShareCount } from '@/modules/data-ingestion/jobs/share-count-sync.service';
import { FMPAdapter } from '@/modules/data-ingestion/adapters/fmp.adapter';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fmpAdapter = new FMPAdapter();
    const result = await syncShareCount(fmpAdapter);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'share_count_sync_route_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
