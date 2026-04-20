// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-004: Unit tests — AuthService.signIn()
// ADR-011: bcrypt; constant-time dummy hash for unknown email; rate limit before DB

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userSession: {
      create: jest.fn(),
    },
  },
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

jest.mock('@/modules/auth/rate-limiter', () => ({
  isRateLimited: jest.fn(),
  recordFailedAttempt: jest.fn(),
  resetRateLimit: jest.fn(),
  clearAll: jest.fn(),
}));

import { signIn } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';
import bcrypt from 'bcrypt';
import * as rateLimiter from '@/modules/auth/rate-limiter';

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockSessionCreate = prisma.userSession.create as jest.Mock;
const mockBcryptCompare = bcrypt.compare as jest.Mock;
const mockIsRateLimited = rateLimiter.isRateLimited as jest.Mock;
const mockRecordFailed = rateLimiter.recordFailedAttempt as jest.Mock;
const mockResetLimit = rateLimiter.resetRateLimit as jest.Mock;

const ACTIVE_USER = {
  userId: 'uuid-alice',
  email: 'alice@example.com',
  passwordHash: 'hashed-password',
  isActive: true,
};

const NOW = new Date('2026-04-20T00:00:00Z');

describe('EPIC-002/STORY-011/TASK-011-004: AuthService.signIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRateLimited.mockReturnValue(false);
  });

  it('returns { status: "rate-limited" } when isRateLimited is true — no DB query made', async () => {
    mockIsRateLimited.mockReturnValue(true);
    const result = await signIn('alice@example.com', 'anypass');
    expect(result.status).toBe('rate-limited');
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('calls bcrypt.compare against DUMMY_HASH when user is not found (constant-time protection)', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockBcryptCompare.mockResolvedValueOnce(false);
    await signIn('unknown@example.com', 'anypass');
    // bcrypt.compare must have been called — the second arg should be a valid bcrypt string
    expect(mockBcryptCompare).toHaveBeenCalledTimes(1);
    const [, hashArg] = mockBcryptCompare.mock.calls[0];
    expect(hashArg).toMatch(/^\$2[ab]\$10\$/);
  });

  it('calls bcrypt.compare with the stored passwordHash (not dummy) when user is found', async () => {
    mockFindUnique.mockResolvedValueOnce(ACTIVE_USER);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockSessionCreate.mockResolvedValueOnce({ sessionId: 'session-uuid' });
    mockUserUpdate.mockResolvedValueOnce(ACTIVE_USER);

    await signIn('alice@example.com', 'correct123');
    expect(mockBcryptCompare).toHaveBeenCalledWith('correct123', ACTIVE_USER.passwordHash);
  });

  it('calls recordFailedAttempt when user is not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockBcryptCompare.mockResolvedValueOnce(false);
    await signIn('unknown@example.com', 'anypass');
    expect(mockRecordFailed).toHaveBeenCalledWith('unknown@example.com');
  });

  it('returns { status: "invalid-credentials" } when bcrypt.compare returns false', async () => {
    mockFindUnique.mockResolvedValueOnce(ACTIVE_USER);
    mockBcryptCompare.mockResolvedValueOnce(false);
    const result = await signIn('alice@example.com', 'wrongpass');
    expect(result.status).toBe('invalid-credentials');
    expect(mockRecordFailed).toHaveBeenCalled();
  });

  it('returns { status: "invalid-credentials" } when user.isActive is false (bcrypt still runs)', async () => {
    const inactiveUser = { ...ACTIVE_USER, isActive: false };
    mockFindUnique.mockResolvedValueOnce(inactiveUser);
    mockBcryptCompare.mockResolvedValueOnce(true); // correct password, but inactive
    const result = await signIn('alice@example.com', 'correct123');
    expect(result.status).toBe('invalid-credentials');
    expect(mockBcryptCompare).toHaveBeenCalledTimes(1); // bcrypt ran
    expect(mockRecordFailed).toHaveBeenCalled();
  });

  it('returns { status: "success" } with sessionId, userId, email on valid credentials', async () => {
    mockFindUnique.mockResolvedValueOnce(ACTIVE_USER);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockSessionCreate.mockResolvedValueOnce({ sessionId: 'session-uuid' });
    mockUserUpdate.mockResolvedValueOnce(ACTIVE_USER);

    const result = await signIn('alice@example.com', 'correct123');
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.sessionId).toBe('session-uuid');
      expect(result.userId).toBe('uuid-alice');
      expect(result.email).toBe('alice@example.com');
    }
  });

  it('creates user_sessions row with expiresAt ≈ now + 7 days on success', async () => {
    mockFindUnique.mockResolvedValueOnce(ACTIVE_USER);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockSessionCreate.mockResolvedValueOnce({ sessionId: 'session-uuid' });
    mockUserUpdate.mockResolvedValueOnce(ACTIVE_USER);

    const before = Date.now();
    await signIn('alice@example.com', 'correct123');
    const after = Date.now();

    const [createCall] = mockSessionCreate.mock.calls;
    const expiresAt: Date = createCall[0].data.expiresAt;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  it('updates users.lastLoginAt on success', async () => {
    mockFindUnique.mockResolvedValueOnce(ACTIVE_USER);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockSessionCreate.mockResolvedValueOnce({ sessionId: 'session-uuid' });
    mockUserUpdate.mockResolvedValueOnce(ACTIVE_USER);

    await signIn('alice@example.com', 'correct123');
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'uuid-alice' },
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      })
    );
  });

  it('calls resetRateLimit on success', async () => {
    mockFindUnique.mockResolvedValueOnce(ACTIVE_USER);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockSessionCreate.mockResolvedValueOnce({ sessionId: 'session-uuid' });
    mockUserUpdate.mockResolvedValueOnce(ACTIVE_USER);

    await signIn('alice@example.com', 'correct123');
    expect(mockResetLimit).toHaveBeenCalledWith('alice@example.com');
  });
});
