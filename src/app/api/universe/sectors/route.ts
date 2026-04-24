// EPIC-004: Classification Engine & Universe Screen
// STORY-049: Universe Screen — Filters and Sort
// TASK-049-002: GET /api/universe/sectors — distinct sectors for filter dropdown
// RFC-003 §Filtering and Sort

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { getSectors } from '@/domain/monitoring';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sectors = await getSectors();
  return NextResponse.json({ sectors });
}
