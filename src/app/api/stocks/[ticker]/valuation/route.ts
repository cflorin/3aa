// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-078: User Valuation Override API
// TASK-078-001: GET /api/stocks/[ticker]/valuation — personalized valuation for calling user

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { getPersonalizedValuation } from '@/modules/valuation/valuation-persistence.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  const stock = await prisma.stock.findUnique({ where: { ticker }, select: { ticker: true, inUniverse: true } });
  if (!stock || !stock.inUniverse) return NextResponse.json({ error: 'Stock not found' }, { status: 404 });

  const result = await getPersonalizedValuation(ticker, user.userId);

  if (!result.systemState) return NextResponse.json({ error: 'Valuation not yet computed' }, { status: 404 });

  const userOverride = await prisma.userValuationOverride.findUnique({
    where: { userId_ticker: { userId: user.userId, ticker } },
  });

  return NextResponse.json({
    ticker,
    systemState: result.systemState,
    userResult: result.userResult,
    hasUserOverride: result.hasUserOverride,
    userOverride: userOverride ?? null,
  });
}
