// EPIC-004: Classification Engine & Universe Screen
// STORY-045: User Classification Override API
// TASK-045-004: DELETE /api/classification-override/[ticker] — clear user override for a stock
// RFC-001 §User Override API; ADR-007; ADR-006 (session auth)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;

  try {
    await prisma.userClassificationOverride.delete({
      where: { userId_ticker: { userId: user.userId, ticker } },
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }
    throw err;
  }

  return new NextResponse(null, { status: 204 });
}
