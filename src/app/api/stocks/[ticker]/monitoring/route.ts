// EPIC-004: Classification Engine & Universe Screen
// STORY-046: User Monitoring Preferences API
// TASK-046-003: PUT /api/stocks/[ticker]/monitoring — toggle monitoring status
// RFC-003 §Monitor List API; ADR-007; ADR-006 (session auth)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).is_active !== 'boolean'
  ) {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 422 });
  }

  const { is_active } = body as { is_active: boolean };

  const stock = await prisma.stock.findUnique({ where: { ticker }, select: { ticker: true } });
  if (!stock) return NextResponse.json({ error: 'Stock not found' }, { status: 404 });

  const now = new Date();

  if (!is_active) {
    // Deactivate — idempotent upsert; preserve original deactivated_at on re-deactivation
    await prisma.userDeactivatedStock.upsert({
      where: { userId_ticker: { userId: user.userId, ticker } },
      create: { userId: user.userId, ticker, deactivatedAt: now },
      update: {},
    });
  } else {
    // Reactivate — deleteMany never throws when row is absent
    await prisma.userDeactivatedStock.deleteMany({
      where: { userId: user.userId, ticker },
    });
  }

  return NextResponse.json({ ticker, is_active, updated_at: now.toISOString() });
}
