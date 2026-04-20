// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation, Password Reset, and User Deactivation API
// TASK-010-006: Integration + contract tests against real test DB
// ADR-011: Full creation flow, auth gate, bcrypt verification, deactivation, error paths

import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { POST } from '../../../../src/app/api/admin/users/route';
import { PATCH as patchPassword } from '../../../../src/app/api/admin/users/[userId]/password/route';
import { PATCH as patchActive } from '../../../../src/app/api/admin/users/[userId]/active/route';

const VALID_KEY = 'integration-test-key';

beforeAll(() => {
  process.env.ADMIN_API_KEY = VALID_KEY;
});

afterAll(async () => {
  delete process.env.ADMIN_API_KEY;
  await prisma.$disconnect();
});

// Clean up test users by email prefix after each test
async function deleteTestUser(email: string) {
  await prisma.user.deleteMany({ where: { email } });
}

function makePostReq(body: unknown, apiKey?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey !== undefined) headers['x-api-key'] = apiKey;
  return new NextRequest('http://localhost/api/admin/users', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function makePatchReq(url: string, body: unknown, apiKey?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey !== undefined) headers['x-api-key'] = apiKey;
  return new NextRequest(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/users — integration
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-006: POST /api/admin/users — integration', () => {
  const email = 'integration-create@test.local';

  afterEach(() => deleteTestUser(email));

  it('creates user row in DB with bcrypt hash; 201 response — no passwordHash', async () => {
    const res = await POST(makePostReq({ email, password: 'password123' }, VALID_KEY));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).toHaveProperty('userId');
    expect(body.email).toBe(email);

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row).not.toBeNull();
    expect(row!.passwordHash).not.toBe('password123');
  });

  it('stored passwordHash verifies against submitted password via bcrypt.compare', async () => {
    await POST(makePostReq({ email, password: 'password123' }, VALID_KEY));

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row).not.toBeNull();
    const valid = await bcrypt.compare('password123', row!.passwordHash);
    expect(valid).toBe(true);
  });

  it('email stored in lowercase when submitted in uppercase', async () => {
    const upper = email.toUpperCase();
    await POST(makePostReq({ email: upper, password: 'password123' }, VALID_KEY));
    const row = await prisma.user.findUnique({ where: { email } });
    expect(row).not.toBeNull();
    expect(row!.email).toBe(email);
  });

  it('returns 409 and single DB row when duplicate email submitted', async () => {
    await POST(makePostReq({ email, password: 'password123' }, VALID_KEY));
    const res = await POST(makePostReq({ email, password: 'different123' }, VALID_KEY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'Email already exists' });

    const rows = await prisma.user.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 401 auth gate — one test per route
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-006: 401 auth gate — all three routes', () => {
  const email = 'integration-auth@test.local';

  afterEach(() => deleteTestUser(email));

  it('POST /api/admin/users: returns 401 with missing API key — no DB row inserted', async () => {
    const res = await POST(makePostReq({ email, password: 'password123' }));
    expect(res.status).toBe(401);
    const row = await prisma.user.findUnique({ where: { email } });
    expect(row).toBeNull();
  });

  it('PATCH /api/admin/users/[userId]/password: returns 401 with missing API key — no DB change', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const url = `http://localhost/api/admin/users/${fakeId}/password`;
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }), { params: { userId: fakeId } });
    expect(res.status).toBe(401);
  });

  it('PATCH /api/admin/users/[userId]/active: returns 401 with missing API key — no DB change', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const url = `http://localhost/api/admin/users/${fakeId}/active`;
    const res = await patchActive(makePatchReq(url, { isActive: false }), { params: { userId: fakeId } });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[userId]/password — integration
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-006: PATCH .../password — integration', () => {
  const email = 'integration-password@test.local';
  let userId: string;

  beforeEach(async () => {
    await deleteTestUser(email);
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('oldpassword', 10) },
    });
    userId = user.userId;
  });

  afterEach(() => deleteTestUser(email));

  it('updates passwordHash in DB; old password no longer verifies; new password verifies', async () => {
    const url = `http://localhost/api/admin/users/${userId}/password`;
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }, VALID_KEY), { params: { userId } });
    expect(res.status).toBe(200);

    const row = await prisma.user.findUnique({ where: { userId } });
    const oldValid = await bcrypt.compare('oldpassword', row!.passwordHash);
    const newValid = await bcrypt.compare('newpassword1', row!.passwordHash);
    expect(oldValid).toBe(false);
    expect(newValid).toBe(true);
  });

  it('returns 404 for unknown userId; no DB modification', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000002';
    const url = `http://localhost/api/admin/users/${fakeId}/password`;
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }, VALID_KEY), { params: { userId: fakeId } });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[userId]/active — integration
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-006: PATCH .../active — integration', () => {
  const email = 'integration-active@test.local';
  let userId: string;

  beforeEach(async () => {
    await deleteTestUser(email);
    const user = await prisma.user.create({
      data: { email, passwordHash: 'placeholder', isActive: true },
    });
    userId = user.userId;
  });

  afterEach(() => deleteTestUser(email));

  it('sets isActive=false in DB; 200 response with { userId, isActive: false, updatedAt }', async () => {
    const url = `http://localhost/api/admin/users/${userId}/active`;
    const res = await patchActive(makePatchReq(url, { isActive: false }, VALID_KEY), { params: { userId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isActive).toBe(false);

    const row = await prisma.user.findUnique({ where: { userId } });
    expect(row!.isActive).toBe(false);
  });

  it('sets isActive=true for previously deactivated user; 200 response', async () => {
    await prisma.user.update({ where: { userId }, data: { isActive: false } });

    const url = `http://localhost/api/admin/users/${userId}/active`;
    const res = await patchActive(makePatchReq(url, { isActive: true }, VALID_KEY), { params: { userId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isActive).toBe(true);

    const row = await prisma.user.findUnique({ where: { userId } });
    expect(row!.isActive).toBe(true);
  });

  it('returns 404 for unknown userId; no DB modification', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000003';
    const url = `http://localhost/api/admin/users/${fakeId}/active`;
    const res = await patchActive(makePatchReq(url, { isActive: false }, VALID_KEY), { params: { userId: fakeId } });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Contract tests — response shapes
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-006: Contract — response shapes', () => {
  const email = 'integration-contract@test.local';
  let userId: string;

  beforeAll(async () => {
    await deleteTestUser(email);
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('password123', 10) },
    });
    userId = user.userId;
  });

  afterAll(() => deleteTestUser(email));

  it('POST 201 response shape: { userId: string, email: string, fullName: string|null, createdAt: string }', async () => {
    const e2 = 'integration-contract2@test.local';
    await deleteTestUser(e2);
    const res = await POST(makePostReq({ email: e2, password: 'password123', fullName: 'Test' }, VALID_KEY));
    const body = await res.json();
    expect(typeof body.userId).toBe('string');
    expect(typeof body.email).toBe('string');
    expect(body.fullName === null || typeof body.fullName === 'string').toBe(true);
    expect(typeof body.createdAt).toBe('string');
    await deleteTestUser(e2);
  });

  it('POST 201 response does NOT contain passwordHash field', async () => {
    const e2 = 'integration-contract3@test.local';
    await deleteTestUser(e2);
    const res = await POST(makePostReq({ email: e2, password: 'password123' }, VALID_KEY));
    const body = await res.json();
    expect(body).not.toHaveProperty('passwordHash');
    await deleteTestUser(e2);
  });

  it('PATCH password 200 response shape: { userId: string, updatedAt: string }', async () => {
    const url = `http://localhost/api/admin/users/${userId}/password`;
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }, VALID_KEY), { params: { userId } });
    const body = await res.json();
    expect(typeof body.userId).toBe('string');
    expect(typeof body.updatedAt).toBe('string');
    expect(Object.keys(body)).toHaveLength(2);
  });

  it('PATCH active 200 response shape: { userId: string, isActive: boolean, updatedAt: string }', async () => {
    const url = `http://localhost/api/admin/users/${userId}/active`;
    const res = await patchActive(makePatchReq(url, { isActive: true }, VALID_KEY), { params: { userId } });
    const body = await res.json();
    expect(typeof body.userId).toBe('string');
    expect(typeof body.isActive).toBe('boolean');
    expect(typeof body.updatedAt).toBe('string');
  });

  it('401 response shape: { error: string } — no user data leaked', async () => {
    const res = await POST(makePostReq({ email: 'x@y.com', password: 'password123' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(Object.keys(body)).toHaveLength(1);
  });

  it('409 response shape: { error: "Email already exists" }', async () => {
    const res = await POST(makePostReq({ email, password: 'password123' }, VALID_KEY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'Email already exists' });
  });

  it('404 response shape: { error: string }', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000004';
    const url = `http://localhost/api/admin/users/${fakeId}/active`;
    const res = await patchActive(makePatchReq(url, { isActive: false }, VALID_KEY), { params: { userId: fakeId } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });
});
