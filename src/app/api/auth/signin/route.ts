// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-003: POST /api/auth/signin — HTTP handler; all auth logic in AuthService
// ADR-011: Cookie: HttpOnly, Secure (prod only), SameSite=Lax, Max-Age=604800, Path=/
// PRD §9A: Returns { userId, email } on success; never returns password or hash

import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/modules/auth/auth.service';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { email, password } = body ?? {};

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const ipAddress = req.headers.get('x-forwarded-for') ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  const result = await signIn(email, password, ipAddress, userAgent);

  if (result.status === 'rate-limited') {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Please try again later.' },
      { status: 429 }
    );
  }

  if (result.status === 'invalid-credentials') {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const { sessionId, userId, email: userEmail } = result;

  const response = NextResponse.json({ userId, email: userEmail }, { status: 200 });
  response.cookies.set('sessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 604800,
    path: '/',
  });

  console.log(`[STORY-011] sign-in success: userId=${userId} email=${userEmail}`);

  return response;
}
