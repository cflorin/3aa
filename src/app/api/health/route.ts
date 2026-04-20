// EPIC-001: Platform Foundation & Deployment
// STORY-003: Provision Core GCP Infrastructure (initial)
// STORY-004: Implement Prisma Schema and Database Migrations (DB check added)
// TASK-004-008: Update health check to verify database connectivity

// force-dynamic: prevent Next.js from statically caching this route at build time.
// Without this, the response is generated during `next build` (when DATABASE_URL is not set),
// cached, and served as a static page — causing db:disconnected in production.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma';

export async function GET() {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  let dbError: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'unknown error';
  }

  // Always return 200 so Cloud Run load balancer never marks instance as unhealthy
  // due to a transient DB issue. Monitoring alerts handle db:disconnected state.
  return NextResponse.json(
    {
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      db: dbStatus,
      ...(dbError && { error: dbError }),
      timestamp: new Date().toISOString(),
      service: '3aa-web',
    },
    { status: 200 },
  );
}
