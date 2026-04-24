// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-004: Unit tests — Next.js middleware
// ADR-011: Middleware runs Edge Runtime; cookie-presence check only (no Prisma/DB).
//   Full session validation happens per-route in Node.js handlers.

import { NextRequest } from 'next/server';
import { middleware, config } from '../../src/middleware';

function makeReq(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest(url, { method: 'GET', headers });
}

describe('EPIC-002/STORY-012/TASK-012-004: middleware', () => {

  it('redirects to /signin when no sessionId cookie is present', async () => {
    const req = makeReq('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/signin');
  });

  it('forwards request (not a redirect) when sessionId cookie is present', async () => {
    const req = makeReq('/dashboard', { sessionId: 'any-session-value' });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('forwards request on root path / when sessionId cookie is present', async () => {
    const req = makeReq('/', { sessionId: 'some-session' });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('does NOT set-cookie when redirecting (no cookie to clear)', async () => {
    const req = makeReq('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain('sessionId=; Max-Age=0');
  });

  it('matcher pattern excludes /api/auth paths (sign-in called unauthenticated)', () => {
    const pattern = config.matcher[0];
    expect(pattern).toContain('api/auth');
  });

  it('matcher pattern excludes /api/cron paths (scheduler bypass)', () => {
    const pattern = config.matcher[0];
    expect(pattern).toContain('api/cron');
  });

  it('matcher pattern excludes /api/admin paths (admin provisioning)', () => {
    const pattern = config.matcher[0];
    expect(pattern).toContain('api/admin');
  });
});
