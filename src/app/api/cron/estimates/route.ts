// EPIC-001/STORY-003/TASK-003-007 (initial placeholder)
// EPIC-001/STORY-007/TASK-007-003 (OIDC verification)

import { NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';

export async function POST(request: Request) {
  try {
    await verifySchedulerToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    message: 'Estimates sync placeholder - implementation in EPIC-003',
    timestamp: new Date().toISOString(),
  });
}
