// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation, Password Reset, and User Deactivation API
// TASK-010-005: Unit tests — admin API key auth guard
// ADR-011: ADMIN_API_KEY gate enforced; empty string never valid

import { validateAdminApiKey } from '@/lib/admin-auth';
import { NextRequest } from 'next/server';

function makeReq(apiKey?: string): NextRequest {
  const headers = new Headers();
  if (apiKey !== undefined) headers.set('x-api-key', apiKey);
  return new NextRequest('http://localhost/api/admin/users', { method: 'POST', headers });
}

describe('EPIC-002/STORY-010/TASK-010-005: validateAdminApiKey', () => {
  const originalKey = process.env.ADMIN_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = originalKey;
    }
  });

  it('returns false when ADMIN_API_KEY env var is undefined', () => {
    delete process.env.ADMIN_API_KEY;
    expect(validateAdminApiKey(makeReq('any-key'))).toBe(false);
  });

  it('returns false when ADMIN_API_KEY env var is empty string', () => {
    process.env.ADMIN_API_KEY = '';
    expect(validateAdminApiKey(makeReq('any-key'))).toBe(false);
  });

  it('returns false when x-api-key header is missing', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq(undefined))).toBe(false);
  });

  it('returns false when x-api-key header is empty string', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq(''))).toBe(false);
  });

  it('returns false when x-api-key does not match ADMIN_API_KEY', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq('wrong-key'))).toBe(false);
  });

  it('returns true when x-api-key exactly matches ADMIN_API_KEY', () => {
    process.env.ADMIN_API_KEY = 'valid-key';
    expect(validateAdminApiKey(makeReq('valid-key'))).toBe(true);
  });
});
