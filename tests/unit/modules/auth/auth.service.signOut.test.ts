// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-005: Unit tests — AuthService.signOut()
// ADR-011: idempotent sign-out; deleteMany (not delete) to avoid P2025

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userSession: {
      deleteMany: jest.fn(),
    },
  },
}));

import { signOut } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';

const mockDeleteMany = prisma.userSession.deleteMany as jest.Mock;

describe('EPIC-002/STORY-013/TASK-013-005: AuthService.signOut', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls prisma.userSession.deleteMany with exact sessionId', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    await signOut('session-uuid-123');
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { sessionId: 'session-uuid-123' } });
  });

  it('does not throw when deleteMany returns count 0 (session not found)', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(signOut('non-existent-id')).resolves.not.toThrow();
  });

  it('returns void (undefined)', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    const result = await signOut('session-uuid-123');
    expect(result).toBeUndefined();
  });

  it('uses deleteMany (idempotent) — not delete (which would throw P2025 on missing row)', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    await signOut('session-uuid-123');
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    // If prisma.userSession.delete were called instead, it would not be in the mock — this test
    // verifies deleteMany was the function called (not the P2025-throwing delete)
  });
});
