// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-004: Unit tests — POST /api/auth/signin route handler
// ADR-011: Cookie attributes; no password/hash in response

jest.mock('@/modules/auth/auth.service', () => ({
  signIn: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/signin/route';
import { signIn } from '@/modules/auth/auth.service';

const mockSignIn = signIn as jest.Mock;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SUCCESS_RESULT = {
  status: 'success' as const,
  sessionId: 'session-uuid-123',
  userId: 'uuid-alice',
  email: 'alice@example.com',
};

describe('EPIC-002/STORY-011/TASK-011-004: POST /api/auth/signin route', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when email is missing from body', async () => {
    const res = await POST(makeReq({ password: 'password123' }));
    expect(res.status).toBe(400);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns 400 when password is missing from body', async () => {
    const res = await POST(makeReq({ email: 'alice@example.com' }));
    expect(res.status).toBe(400);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns 400 when body is malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 429 when signIn returns { status: "rate-limited" }', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'rate-limited' });
    const res = await POST(makeReq({ email: 'alice@example.com', password: 'any' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'Too many sign-in attempts. Please try again later.' });
  });

  it('returns 401 when signIn returns { status: "invalid-credentials" }', async () => {
    mockSignIn.mockResolvedValueOnce({ status: 'invalid-credentials' });
    const res = await POST(makeReq({ email: 'alice@example.com', password: 'wrong' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid email or password' });
  });

  it('returns 200 with { userId, email } when signIn returns success', async () => {
    mockSignIn.mockResolvedValueOnce(SUCCESS_RESULT);
    const res = await POST(makeReq({ email: 'alice@example.com', password: 'correct123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userId: 'uuid-alice', email: 'alice@example.com' });
  });

  it('response body does NOT contain password or passwordHash on success', async () => {
    mockSignIn.mockResolvedValueOnce(SUCCESS_RESULT);
    const res = await POST(makeReq({ email: 'alice@example.com', password: 'correct123' }));
    const body = await res.json();
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('Set-Cookie header contains sessionId with HttpOnly, SameSite=Lax, Max-Age=604800, Path=/', async () => {
    mockSignIn.mockResolvedValueOnce(SUCCESS_RESULT);
    const res = await POST(makeReq({ email: 'alice@example.com', password: 'correct123' }));
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('sessionId=session-uuid-123');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie.toLowerCase()).toContain('max-age=604800');
    expect(cookie.toLowerCase()).toContain('path=/');
  });

  it('Secure flag absent in non-production environment', async () => {
    const originalEnv = process.env.NODE_ENV;
    // NODE_ENV is 'test' in Jest — not 'production'
    mockSignIn.mockResolvedValueOnce(SUCCESS_RESULT);
    const res = await POST(makeReq({ email: 'alice@example.com', password: 'correct123' }));
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie.toLowerCase()).not.toContain('secure');
    process.env.NODE_ENV = originalEnv;
  });
});
