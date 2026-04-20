/**
 * @jest-environment jsdom
 */
// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-004: Unit tests — /signin Server Component (already-auth redirect)
// ADR-011: /signin excluded from middleware; validateSession called directly via cookies()

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));
jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));
jest.mock('@/app/signin/SignInForm', () => ({
  default: () => <div data-testid="signin-form" />,
}));

// Server Components cannot be rendered with React Testing Library.
// Test behavior (redirect vs no-redirect) by calling the async function directly.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSession } from '@/modules/auth/auth.service';
import SignInPage from '@/app/signin/page';

const mockCookies = cookies as jest.Mock;
const mockRedirect = redirect as jest.Mock;
const mockValidateSession = validateSession as jest.Mock;

function noCookies() {
  mockCookies.mockReturnValue({ get: () => undefined });
}

function withCookie(value: string) {
  mockCookies.mockReturnValue({ get: () => ({ value }) });
}

describe('EPIC-002/STORY-014/TASK-014-004: SignInPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not call redirect when no sessionId cookie present', async () => {
    noCookies();
    await SignInPage();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockValidateSession).not.toHaveBeenCalled();
  });

  it('does not call redirect when sessionId present but validateSession returns null', async () => {
    withCookie('invalid-session-id');
    mockValidateSession.mockResolvedValueOnce(null);
    await SignInPage();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('calls redirect("/universe") when validateSession returns a valid user', async () => {
    withCookie('valid-session-id');
    mockValidateSession.mockResolvedValueOnce({ userId: 'uuid-alice', email: 'alice@example.com' });
    await SignInPage();
    expect(mockRedirect).toHaveBeenCalledWith('/universe');
  });
});
