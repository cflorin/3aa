// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation, Password Reset, and User Deactivation API
// TASK-010-003: PATCH /api/admin/users/[userId]/password — admin password reset
// ADR-011: bcrypt 10 rounds; ADMIN_API_KEY gate
// PRD §9A: Admin-assisted password reset (no self-service)

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
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
  const { newPassword } = body ?? {};

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  try {
    const user = await prisma.user.update({
      where: { userId },
      data: { passwordHash },
    });

    console.log(`[STORY-010] password reset: userId=${user.userId}`);

    return NextResponse.json({ userId: user.userId, updatedAt: user.updatedAt });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw err;
  }
}
