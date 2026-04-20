// EPIC-001: Platform Foundation & Deployment
// STORY-004: Implement Prisma Schema and Database Migrations
// TASK-004-008: Prisma client singleton
//
// Uses a global singleton to prevent multiple client instances during Next.js hot-reload in dev.
// In production (Cloud Run), a single instance is created and reused for the process lifetime.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
