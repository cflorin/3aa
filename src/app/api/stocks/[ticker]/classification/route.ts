// EPIC-004: Classification Engine & Universe Screen
// STORY-045: User Classification Override API
// TASK-045-004: GET /api/stocks/[ticker]/classification — resolved active classification for current user
// RFC-001 §User Override API; RFC-003 §Override Semantics; ADR-007; ADR-006 (session auth)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { getClassificationState } from '@/domain/classification/persistence';
import { resolveActiveCode } from '@/domain/classification/override';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  // Verify ticker exists in the stocks table
  const stock = await prisma.stock.findUnique({ where: { ticker }, select: { ticker: true } });
  if (!stock) return NextResponse.json({ error: 'Stock not found' }, { status: 404 });

  const [resolved, state] = await Promise.all([
    resolveActiveCode(user.userId, ticker),
    getClassificationState(ticker),
  ]);

  return NextResponse.json({
    ticker,
    system_suggested_code: resolved.system_suggested_code,
    system_confidence: resolved.system_confidence,
    user_override_code: resolved.user_override_code,
    user_override_reason: resolved.user_override_reason,
    active_code: resolved.active_code,
    reason_codes: state?.reason_codes ?? [],
    scores: state?.scores ?? null,
    override_scope: 'display_only',
    classified_at: state?.classified_at ?? null,
  });
}
