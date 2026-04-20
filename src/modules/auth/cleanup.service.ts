// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-003: cleanupExpiredSessions() — batch delete of expired user_sessions rows
// ADR-011: daily batch cleanup; complement to lazy single-row cleanup in validateSession()
// PRD §9A: sessions table bounded by nightly cleanup (runs Mon-Fri via /api/cron/alerts)

import { prisma } from '@/infrastructure/database/prisma';

export async function cleanupExpiredSessions(): Promise<{ count: number }> {
  const result = await prisma.userSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  console.log(`[STORY-013] session cleanup: deleted ${result.count} expired session(s)`);
  return { count: result.count };
}
