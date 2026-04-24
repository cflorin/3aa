// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-005: Integration tests — AuthService.validateSession()
// ADR-011: lazy expiry cleanup; no sliding window; inactive user check

import { prisma } from '../../../../src/infrastructure/database/prisma';
import { validateSession } from '../../../../src/modules/auth/auth.service';
import bcrypt from 'bcryptjs';

const TEST_EMAIL = 'integration-validate-session@test.local';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

async function createUser(isActive = true) {
  const passwordHash = await bcrypt.hash('password123', 10);
  return prisma.user.create({ data: { email: TEST_EMAIL, passwordHash, isActive } });
}

async function createSession(userId: string, expiresAt: Date) {
  return prisma.userSession.create({ data: { userId, expiresAt } });
}

async function cleanup() {
  await prisma.userSession.deleteMany({ where: { user: { email: TEST_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('EPIC-002/STORY-012/TASK-012-005: validateSession() — integration', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns null for unknown sessionId (no DB rows present)', async () => {
    const result = await validateSession('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('returns { userId, email } for a valid active session', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    const result = await validateSession(session.sessionId);
    expect(result).toEqual({ userId: user.userId, email: TEST_EMAIL });
  });

  it('returns null for expired session', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() - 1000));
    const result = await validateSession(session.sessionId);
    expect(result).toBeNull();
  });

  it('deletes expired session row from DB', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() - 1000));
    await validateSession(session.sessionId);
    const row = await prisma.userSession.findUnique({ where: { sessionId: session.sessionId } });
    expect(row).toBeNull();
  });

  it('does NOT delete valid session row on successful validation', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    await validateSession(session.sessionId);
    const row = await prisma.userSession.findUnique({ where: { sessionId: session.sessionId } });
    expect(row).not.toBeNull();
  });

  it('returns null for inactive user session; session row NOT deleted', async () => {
    const user = await createUser(false); // isActive = false
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    const result = await validateSession(session.sessionId);
    expect(result).toBeNull();
    const row = await prisma.userSession.findUnique({ where: { sessionId: session.sessionId } });
    expect(row).not.toBeNull(); // session row survives — admin can reactivate user
  });

  it('does not update lastLoginAt — no sliding window per ADR-011', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    const before = await prisma.user.findUnique({ where: { userId: user.userId } });
    await validateSession(session.sessionId);
    const after = await prisma.user.findUnique({ where: { userId: user.userId } });
    expect(after!.lastLoginAt).toEqual(before!.lastLoginAt);
  });

  it('returns null for user deactivated after session creation', async () => {
    const user = await createUser();
    const session = await createSession(user.userId, new Date(Date.now() + SESSION_DURATION_MS));
    // Deactivate user after session is established
    await prisma.user.update({ where: { userId: user.userId }, data: { isActive: false } });
    const result = await validateSession(session.sessionId);
    expect(result).toBeNull();
  });
});
