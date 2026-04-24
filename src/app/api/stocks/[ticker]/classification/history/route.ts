// EPIC-004: Classification Engine & Universe Screen
// STORY-051: Classification Override Modal
// TASK-051-001: GET /api/stocks/[ticker]/classification/history
// PRD §Screen 2 — Classification Detail; RFC-003 §Classification Override Modal

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { getClassificationHistory } from '@/domain/classification/persistence';

const HISTORY_LIMIT = 10;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  const stock = await prisma.stock.findUnique({ where: { ticker }, select: { ticker: true } });
  if (!stock) return NextResponse.json({ error: 'Stock not found' }, { status: 404 });

  const rows = await getClassificationHistory(ticker, HISTORY_LIMIT);

  return NextResponse.json({
    ticker,
    history: rows.map((r) => ({
      classified_at: r.classified_at,
      previous_code: r.old_suggested_code,
      suggested_code: r.new_suggested_code,
    })),
  });
}
