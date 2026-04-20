// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-005: Unit tests — POST /api/auth/signout route
// ADR-011: always 200 (idempotent); cookie always cleared

jest.mock('@/modules/auth/auth.service', () => ({
  signOut: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/signout/route';
import { signOut } from '@/modules/auth/auth.service';

const mockSignOut = signOut as jest.Mock;

function makeReq(cookies: Record<string, string> = {}): NextRequest {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest('http://localhost/api/auth/signout', { method: 'POST', headers });
}

describe('EPIC-002/STORY-013/TASK-013-005: POST /api/auth/signout route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
  });

  it('returns 200 with { success: true } when sessionId cookie is present', async () => {
    const res = await POST(makeReq({ sessionId: 'session-uuid-123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it('returns 200 with { success: true } when no sessionId cookie is present', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it('calls signOut(sessionId) when sessionId cookie is present', async () => {
    await POST(makeReq({ sessionId: 'session-uuid-123' }));
    expect(mockSignOut).toHaveBeenCalledWith('session-uuid-123');
  });

  it('does NOT call signOut when no sessionId cookie present', async () => {
    await POST(makeReq());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('response clears sessionId cookie when cookie is present', async () => {
    const res = await POST(makeReq({ sessionId: 'session-uuid-123' }));
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie.toLowerCase()).toContain('sessionid=');
    expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=.*1970/);
  });

  it('response clears sessionId cookie even when no cookie was sent', async () => {
    const res = await POST(makeReq());
    const cookie = res.headers.get('set-cookie') ?? '';
    // Cookie delete sets Max-Age=0 (or equivalent) even if there was nothing to clear
    expect(cookie.toLowerCase()).toContain('sessionid=');
  });
});
