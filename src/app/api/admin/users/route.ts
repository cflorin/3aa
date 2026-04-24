// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation, Password Reset, and User Deactivation API
// TASK-010-002: POST /api/admin/users — create user with bcrypt-hashed password
// ADR-011: bcrypt 10 rounds; ADMIN_API_KEY gate; email lowercase normalization
// ADR-007: Multi-user architecture — admin creates all accounts (no self-service)
// PRD §9A: Admin-controlled account provisioning

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/infrastructure/database/prisma';
import { validateAdminApiKey } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  if (!validateAdminApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const { email, password, fullName } = body;

  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, fullName: fullName ?? null },
    });

    console.log(`[STORY-010] user created: userId=${user.userId} email=${user.email}`);

    return NextResponse.json(
      { userId: user.userId, email: user.email, fullName: user.fullName, createdAt: user.createdAt },
      { status: 201 }
    );
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    throw err;
  }
}
