// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-003: getCurrentUser() — reads x-user-id/x-user-email injected by middleware
// ADR-007: user identity propagated via headers; only valid on protected routes (after middleware ran)
// PRD §9A: Server Components and protected API routes call this to get authenticated user

import { headers } from 'next/headers';

// Returns the authenticated user from middleware-injected headers.
// Only valid in Server Components and route handlers protected by middleware.
// Returns null on excluded routes (signin, api/health, api/cron/*, api/admin/*) where middleware doesn't run.
export function getCurrentUser(): { userId: string; email: string } | null {
  const h = headers();
  const userId = h.get('x-user-id');
  const email = h.get('x-user-email');
  if (!userId || !email) return null;
  return { userId, email };
}
