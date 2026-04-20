// EPIC-001/STORY-003/TASK-003-007 (initial placeholder)
// EPIC-001/STORY-007/TASK-007-003 (OIDC verification)
// EPIC-002/STORY-013/TASK-013-004: cleanupExpiredSessions() wired in as final nightly step
// ADR-011: batch cleanup of expired sessions runs Mon-Fri via existing scheduler slot

import { NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { cleanupExpiredSessions } from '@/modules/auth/cleanup.service';

export async function POST(request: Request) {
  try {
    await verifySchedulerToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { count } = await cleanupExpiredSessions();

  return NextResponse.json({
    message: 'Alerts placeholder - implementation in EPIC-006',
    sessionCleanup: { deletedCount: count },
    timestamp: new Date().toISOString(),
  });
}
