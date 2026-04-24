// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-002: Next.js middleware — cookie presence check, redirect unauthenticated
// ADR-011: Middleware runs in Edge Runtime (Prisma incompatible); cookie presence only.
//   Full session validation (DB lookup) is performed per-route in Node.js handlers.
// PRD §9A: route protection, redirect unauthenticated to /signin

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Lightweight cookie-presence check only — no DB access (Edge Runtime limitation).
// All API routes independently validate the sessionId cookie via validateSession()
// in Node.js runtime, so this check is purely for UI redirect protection.
export async function middleware(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;

  if (!sessionId) {
    return NextResponse.redirect(new URL('/signin', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except: /signin, /api/auth/*, /api/health, /api/cron/*, /api/admin/*, /_next/*, /favicon.ico
    // /api/auth/* excluded: sign-in endpoint called by unauthenticated users (no session cookie yet)
    '/((?!signin|api/auth|api/health|api/cron|api/admin|_next|favicon\\.ico).*)',
  ],
};
