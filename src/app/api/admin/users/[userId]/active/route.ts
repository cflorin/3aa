// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation, Password Reset, and User Deactivation API
// TASK-010-004: PATCH /api/admin/users/[userId]/active — deactivate/reactivate user
// ADR-011: ADMIN_API_KEY gate; deactivation does not delete sessions (lazy middleware cleanup)
// ADR-007: isActive is the application-layer access gate; middleware checks it on each request
// PRD §9A: Admin can deactivate and reactivate users

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';
import { validateAdminApiKey } from '@/lib/admin-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = params;
  const body = await req.json().catch(() => null);
  const { isActive } = body ?? {};

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { userId },
      data: { isActive },
    });

    console.log(`[STORY-010] user active status changed: userId=${user.userId} isActive=${user.isActive}`);

    return NextResponse.json({ userId: user.userId, isActive: user.isActive, updatedAt: user.updatedAt });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw err;
  }
}
