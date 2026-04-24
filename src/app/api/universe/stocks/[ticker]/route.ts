// EPIC-004: Classification Engine & Universe Screen
// STORY-055: Remove Stock from Universe
// TASK-055-001: DELETE /api/universe/stocks/[ticker] — soft-remove stock from universe
// STORY-056: Add Stock to Universe
// TASK-056-003: GET /api/universe/stocks/[ticker] — single in-universe stock lookup
//
// Soft-delete only: sets inUniverse = false; DB row retained for history.
// RFC-003 §Monitor List Management; PRD §Universe Management

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { getUniverseStock } from '@/domain/monitoring';

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
    return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
  }

  const stock = await getUniverseStock(user.userId, ticker.toUpperCase());
  if (!stock) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ stock });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  if (!ticker || !TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
  }

  const stock = await prisma.stock.findUnique({
    where: { ticker: ticker.toUpperCase() },
    select: { ticker: true, inUniverse: true },
  });

  if (!stock) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (!stock.inUniverse) {
    return NextResponse.json({ error: 'already_removed' }, { status: 409 });
  }

  const removedAt = new Date();

  await prisma.stock.update({
    where: { ticker: stock.ticker },
    data: {
      inUniverse: false,
      universeStatusChangedAt: removedAt,
    },
  });

  return NextResponse.json({
    ticker: stock.ticker,
    removed: true,
    removedAt: removedAt.toISOString(),
  });
}
