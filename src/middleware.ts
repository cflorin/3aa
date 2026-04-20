// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-002: Next.js middleware — session validation, header injection, redirect
// ADR-011: Node.js runtime (Prisma requires it); sessionId cookie; no lastActivityAt update
// ADR-007: x-user-id header injection for user isolation in server-side code
// PRD §9A: route protection, redirect unauthenticated to /signin, inject user identity

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';

// Prisma is not compatible with Edge runtime — force Node.js runtime
export const runtime = 'nodejs';

export async function middleware(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;

  if (!sessionId) {
    return NextResponse.redirect(new URL('/signin', req.url));
  }

  const user = await validateSession(sessionId);

  if (!user) {
    const response = NextResponse.redirect(new URL('/signin', req.url));
    // Clear stale/invalid cookie so browser doesn't keep sending it
    response.cookies.delete('sessionId');
    return response;
  }

  // Overwrite (not append) x-user-id and x-user-email to prevent client spoofing (ADR-007)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', user.userId);
  requestHeaders.set('x-user-email', user.email);

  // ADR-011: never log sessionId value or user email — userId only for audit trail
  console.log(`[STORY-012] session valid: userId=${user.userId}`);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    // Protect all routes except: /signin, /api/auth/*, /api/health, /api/cron/*, /api/admin/*, /_next/*, /favicon.ico
    // /api/auth/* excluded: sign-in endpoint called by unauthenticated users (no session cookie yet)
    '/((?!signin|api/auth|api/health|api/cron|api/admin|_next|favicon\\.ico).*)',
  ],
};
