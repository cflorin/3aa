// EPIC-004: Classification Engine & Universe Screen
// STORY-045: User Classification Override API
// TASK-045-004: POST /api/classification-override — upsert user override for a stock
// RFC-001 §User Override API; ADR-007 (per-user override table); ADR-006 (session auth)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';
import { resolveActiveCode } from '@/domain/classification/override';

const FINAL_CODE_REGEX = /^[1-8]([ABC][ABC])?$/;
const OVERRIDE_REASON_MIN_LENGTH = 10;

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Request body required' }, { status: 400 });

  const { ticker, final_code, override_reason } = body;

  if (!ticker || typeof ticker !== 'string') {
    return NextResponse.json({ error: 'ticker is required' }, { status: 422 });
  }
  if (!final_code || !FINAL_CODE_REGEX.test(final_code)) {
    return NextResponse.json(
      { error: 'final_code must match pattern ^[1-8]([ABC][ABC])?$' },
      { status: 422 },
    );
  }
  if (!override_reason || typeof override_reason !== 'string' || override_reason.length < OVERRIDE_REASON_MIN_LENGTH) {
    return NextResponse.json(
      { error: `override_reason must be at least ${OVERRIDE_REASON_MIN_LENGTH} characters` },
      { status: 422 },
    );
  }

  // Verify ticker exists
  const stock = await prisma.stock.findUnique({ where: { ticker }, select: { ticker: true } });
  if (!stock) return NextResponse.json({ error: 'Stock not found' }, { status: 404 });

  await prisma.userClassificationOverride.upsert({
    where: { userId_ticker: { userId: user.userId, ticker } },
    create: {
      userId: user.userId,
      ticker,
      finalCode: final_code,
      overrideReason: override_reason,
      overriddenAt: new Date(),
    },
    update: {
      finalCode: final_code,
      overrideReason: override_reason,
      overriddenAt: new Date(),
    },
  });

  const resolved = await resolveActiveCode(user.userId, ticker);

  return NextResponse.json({
    ticker,
    active_code: resolved.active_code,
    system_suggested_code: resolved.system_suggested_code,
    user_override_code: resolved.user_override_code,
    override_scope: 'display_only',
  });
}
