// EPIC-004: Classification Engine & Universe Screen
// STORY-051: Classification Override Modal
// TASK-051-001: GET /api/stocks/[ticker]/classification/history
// PRD §Screen 2 — Classification Detail; RFC-003 §Classification Override Modal

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { getClassificationHistory } from '@/domain/classification/persistence';

const HISTORY_LIMIT = 10;
const TICKER_RE = /^[A-Z0-9.]{1,10}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  if (!ticker || !TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  try {
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
  } catch (err) {
    console.error('[classification/history] Unhandled error for ticker', ticker, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
