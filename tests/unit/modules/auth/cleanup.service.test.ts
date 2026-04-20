// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-005: Unit tests — cleanupExpiredSessions()
// ADR-011: batch cleanup; filter strictly lt:expiresAt; idempotent

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userSession: {
      deleteMany: jest.fn(),
    },
  },
}));

import { cleanupExpiredSessions } from '@/modules/auth/cleanup.service';
import { prisma } from '@/infrastructure/database/prisma';

const mockDeleteMany = prisma.userSession.deleteMany as jest.Mock;

describe('EPIC-002/STORY-013/TASK-013-005: cleanupExpiredSessions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls prisma.userSession.deleteMany with { expiresAt: { lt: expect.any(Date) } }', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 5 });
    await cleanupExpiredSessions();
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('returns { count: N } matching the deleteMany result', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 7 });
    const result = await cleanupExpiredSessions();
    expect(result).toEqual({ count: 7 });
  });

  it('returns { count: 0 } when no expired sessions exist (idempotent)', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    const result = await cleanupExpiredSessions();
    expect(result).toEqual({ count: 0 });
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('the lt filter value is a Date type (not a string or number)', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    await cleanupExpiredSessions();
    const [callArg] = mockDeleteMany.mock.calls[0];
    expect(callArg.where.expiresAt.lt).toBeInstanceOf(Date);
  });
});
