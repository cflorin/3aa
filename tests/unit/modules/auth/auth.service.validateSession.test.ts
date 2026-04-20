// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-004: Unit tests — AuthService.validateSession()
// ADR-011: lazy expiry cleanup; no sliding window; inactive user → null without deleting session

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userSession: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      update: jest.fn(), // included to assert it is never called (no sliding window)
    },
  },
}));

import { validateSession } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';

const mockFindUnique = prisma.userSession.findUnique as jest.Mock;
const mockDelete = prisma.userSession.delete as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST_DATE = new Date(Date.now() - 1000);

const ACTIVE_USER = {
  userId: 'uuid-alice',
  email: 'alice@example.com',
  passwordHash: 'hashed',
  fullName: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const VALID_SESSION = {
  sessionId: 'session-uuid-123',
  userId: 'uuid-alice',
  expiresAt: FUTURE_DATE,
  user: ACTIVE_USER,
};

describe('EPIC-002/STORY-012/TASK-012-004: AuthService.validateSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when sessionId not found in DB', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await validateSession('non-existent-id');
    expect(result).toBeNull();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns { userId, email } for a valid active session', async () => {
    mockFindUnique.mockResolvedValueOnce(VALID_SESSION);
    const result = await validateSession('session-uuid-123');
    expect(result).toEqual({ userId: 'uuid-alice', email: 'alice@example.com' });
  });

  it('returns null for expired session; calls prisma.userSession.delete', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...VALID_SESSION, expiresAt: PAST_DATE });
    const result = await validateSession('session-uuid-123');
    expect(result).toBeNull();
    expect(mockDelete).toHaveBeenCalledWith({ where: { sessionId: 'session-uuid-123' } });
  });

  it('does NOT call prisma.userSession.delete for unknown sessionId', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await validateSession('non-existent-id');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns null when user.isActive is false; does NOT delete session row', async () => {
    const inactiveUser = { ...ACTIVE_USER, isActive: false };
    mockFindUnique.mockResolvedValueOnce({ ...VALID_SESSION, user: inactiveUser });
    const result = await validateSession('session-uuid-123');
    expect(result).toBeNull();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns { userId, email } only — no full User object leaked (no passwordHash, no fullName)', async () => {
    mockFindUnique.mockResolvedValueOnce(VALID_SESSION);
    const result = await validateSession('session-uuid-123');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('fullName');
    expect(result).not.toHaveProperty('isActive');
    expect(Object.keys(result!)).toEqual(expect.arrayContaining(['userId', 'email']));
    expect(Object.keys(result!)).toHaveLength(2);
  });

  it('never updates lastActivityAt — no sliding window (ADR-011)', async () => {
    mockFindUnique.mockResolvedValueOnce(VALID_SESSION);
    await validateSession('session-uuid-123');
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
