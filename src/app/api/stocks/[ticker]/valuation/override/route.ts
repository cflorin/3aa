// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-078: User Valuation Override API
// TASK-078-002: PUT/DELETE /api/stocks/[ticker]/valuation/override

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { getPersonalizedValuation } from '@/modules/valuation/valuation-persistence.service';

const ALLOWED_METRICS = new Set(['forward_pe', 'forward_ev_ebit', 'ev_sales', 'forward_operating_earnings_ex_excess_cash']);

function validateThresholdBody(body: Record<string, unknown>): string | null {
  const fields = ['maxThreshold', 'comfortableThreshold', 'veryGoodThreshold', 'stealThreshold'] as const;
  const present = fields.filter(f => body[f] != null);

  if (present.length > 0 && present.length < 4) return 'invalid_threshold_set';

  if (present.length === 4) {
    const max = Number(body.maxThreshold);
    const comfortable = Number(body.comfortableThreshold);
    const veryGood = Number(body.veryGoodThreshold);
    const steal = Number(body.stealThreshold);
    if (!(max > comfortable && comfortable > veryGood && veryGood > steal)) {
      return 'threshold_order_violation';
    }
  }

  if (body.primaryMetricOverride != null && !ALLOWED_METRICS.has(String(body.primaryMetricOverride))) {
    return 'invalid_metric';
  }

  return null;
}

export async function PUT(
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

  const body = await req.json() as Record<string, unknown>;

  const thresholdFields = ['maxThreshold', 'comfortableThreshold', 'veryGoodThreshold', 'stealThreshold'];
  const optionalFields = ['primaryMetricOverride', 'forwardOperatingEarningsExExcessCash', 'notes'];
  const hasAny = [...thresholdFields, ...optionalFields].some(f => body[f] != null);
  if (!hasAny) return NextResponse.json({ error: 'missing_override_fields' }, { status: 400 });

  const validationError = validateThresholdBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const upsertData = {
    userId: user.userId,
    ticker,
    maxThreshold: body.maxThreshold != null ? String(body.maxThreshold) : null,
    comfortableThreshold: body.comfortableThreshold != null ? String(body.comfortableThreshold) : null,
    veryGoodThreshold: body.veryGoodThreshold != null ? String(body.veryGoodThreshold) : null,
    stealThreshold: body.stealThreshold != null ? String(body.stealThreshold) : null,
    primaryMetricOverride: body.primaryMetricOverride != null ? String(body.primaryMetricOverride) : null,
    forwardOperatingEarningsExExcessCash: body.forwardOperatingEarningsExExcessCash != null
      ? String(body.forwardOperatingEarningsExExcessCash) : null,
    notes: body.notes != null ? String(body.notes) : null,
    updatedAt: new Date(),
  };

  const userOverride = await prisma.userValuationOverride.upsert({
    where: { userId_ticker: { userId: user.userId, ticker } },
    update: upsertData,
    create: upsertData,
  });

  const result = await getPersonalizedValuation(ticker, user.userId);

  return NextResponse.json({ userResult: result.userResult, userOverride });
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

  const existing = await prisma.userValuationOverride.findUnique({
    where: { userId_ticker: { userId: user.userId, ticker } },
  });
  if (!existing) return NextResponse.json({ error: 'Override not found' }, { status: 404 });

  await prisma.userValuationOverride.delete({ where: { userId_ticker: { userId: user.userId, ticker } } });

  const result = await getPersonalizedValuation(ticker, user.userId);

  return NextResponse.json({ userResult: result.userResult, userOverride: null });
}
