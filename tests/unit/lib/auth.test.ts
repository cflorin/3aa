// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-004: Unit tests — getCurrentUser()
// ADR-007: reads middleware-injected x-user-id/x-user-email from Next.js headers()

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

import { getCurrentUser } from '@/lib/auth';
import { headers } from 'next/headers';

const mockHeaders = headers as jest.Mock;

function makeHeaders(entries: Record<string, string | null>) {
  return {
    get: (key: string) => entries[key] ?? null,
  };
}

describe('EPIC-002/STORY-012/TASK-012-004: getCurrentUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns { userId, email } when both x-user-id and x-user-email headers are present', () => {
    mockHeaders.mockReturnValueOnce(
      makeHeaders({ 'x-user-id': 'uuid-alice', 'x-user-email': 'alice@example.com' })
    );
    const result = getCurrentUser();
    expect(result).toEqual({ userId: 'uuid-alice', email: 'alice@example.com' });
  });

  it('returns null when x-user-id header is absent', () => {
    mockHeaders.mockReturnValueOnce(
      makeHeaders({ 'x-user-id': null, 'x-user-email': 'alice@example.com' })
    );
    expect(getCurrentUser()).toBeNull();
  });

  it('returns null when x-user-email header is absent', () => {
    mockHeaders.mockReturnValueOnce(
      makeHeaders({ 'x-user-id': 'uuid-alice', 'x-user-email': null })
    );
    expect(getCurrentUser()).toBeNull();
  });

  it('returns null when both headers are absent', () => {
    mockHeaders.mockReturnValueOnce(
      makeHeaders({ 'x-user-id': null, 'x-user-email': null })
    );
    expect(getCurrentUser()).toBeNull();
  });

  it('returned userId and email match header values exactly — no transformation applied', () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const email = 'Test.User@Example.COM';
    mockHeaders.mockReturnValueOnce(makeHeaders({ 'x-user-id': userId, 'x-user-email': email }));
    const result = getCurrentUser();
    expect(result!.userId).toBe(userId);
    expect(result!.email).toBe(email);
  });
});
