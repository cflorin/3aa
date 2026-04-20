// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-005: Unit tests — /api/cron/alerts route with cleanupExpiredSessions wired in
// STORY-007: OIDC auth gate still enforced; cleanup called after successful auth

jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

jest.mock('@/modules/auth/cleanup.service', () => ({
  cleanupExpiredSessions: jest.fn().mockResolvedValue({ count: 3 }),
}));

import { POST } from '@/app/api/cron/alerts/route';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { cleanupExpiredSessions } from '@/modules/auth/cleanup.service';

const mockVerify = verifySchedulerToken as jest.Mock;
const mockCleanup = cleanupExpiredSessions as jest.Mock;

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) headers['Authorization'] = authHeader;
  return new Request('http://localhost/api/cron/alerts', { method: 'POST', headers });
}

describe('EPIC-002/STORY-013/TASK-013-005: POST /api/cron/alerts with session cleanup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with sessionCleanup.deletedCount when OIDC token is valid', async () => {
    mockVerify.mockResolvedValueOnce(undefined);
    const res = await POST(makeReq('Bearer valid-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      sessionCleanup: { deletedCount: 3 },
      timestamp: expect.any(String),
    });
  });

  it('calls cleanupExpiredSessions after successful OIDC auth', async () => {
    mockVerify.mockResolvedValueOnce(undefined);
    await POST(makeReq('Bearer valid-token'));
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('returns 401 and does NOT call cleanupExpiredSessions when OIDC token is invalid', async () => {
    mockVerify.mockRejectedValueOnce(new Error('Token invalid'));
    const res = await POST(makeReq('Bearer bad-token'));
    expect(res.status).toBe(401);
    expect(mockCleanup).not.toHaveBeenCalled();
  });
});
