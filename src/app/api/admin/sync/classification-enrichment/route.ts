// EPIC-003.1: Classification LLM Enrichment
// STORY-038: classificationEnrichmentSync Job
// TASK-038-004: POST /api/admin/sync/classification-enrichment?mode=incremental|full
// Auth: validateAdminApiKey (EPIC-002 admin pattern — ADR-011)
// RFC-004: admin-triggered sync route pattern

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminApiKey } from '@/lib/admin-auth';
import { ClaudeProvider } from '@/modules/classification-enrichment/providers/claude.provider';
import { syncClassificationEnrichment } from '@/modules/classification-enrichment/jobs/classification-enrichment-sync.service';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const modeParam = req.nextUrl.searchParams.get('mode');
  const mode: 'incremental' | 'full' = modeParam === 'full' ? 'full' : 'incremental';

  try {
    const llmProvider = ClaudeProvider.fromEnv();
    const result = await syncClassificationEnrichment(llmProvider, { mode });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'classification_enrichment_sync_route_error',
      error: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
