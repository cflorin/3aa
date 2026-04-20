// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation, Password Reset, and User Deactivation API
// TASK-010-005: Unit tests — POST /api/admin/users, PATCH password, PATCH active
// ADR-011: bcrypt 10 rounds; email lowercase normalization; P2002/P2025 handling

import { NextRequest } from 'next/server';

// --- Mocks (must be before imports that use them) ---

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

import { POST } from '@/app/api/admin/users/route';
import { PATCH as patchPassword } from '@/app/api/admin/users/[userId]/password/route';
import { PATCH as patchActive } from '@/app/api/admin/users/[userId]/active/route';
import { prisma } from '@/infrastructure/database/prisma';
import bcrypt from 'bcrypt';

const mockUserCreate = prisma.user.create as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockBcryptHash = bcrypt.hash as jest.Mock;

const VALID_KEY = 'test-admin-key';

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

const NOW = new Date('2026-04-20T00:00:00Z');

// ---------------------------------------------------------------------------
// POST /api/admin/users
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-005: POST /api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_API_KEY = VALID_KEY;
  });

  afterAll(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it('returns 401 without DB call when API key is missing', async () => {
    const res = await POST(makePostReq({ email: 'a@b.com', password: 'password1' }));
    expect(res.status).toBe(401);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('returns 401 without DB call when API key is wrong', async () => {
    const res = await POST(makePostReq({ email: 'a@b.com', password: 'password1' }, 'wrong'));
    expect(res.status).toBe(401);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('normalizes email to lowercase before calling prisma.user.create', async () => {
    mockBcryptHash.mockResolvedValueOnce('hashed');
    mockUserCreate.mockResolvedValueOnce({
      userId: 'uuid-1', email: 'alice@example.com', fullName: null, createdAt: NOW,
    });
    await POST(makePostReq({ email: 'ALICE@EXAMPLE.COM', password: 'password1' }, VALID_KEY));
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'alice@example.com' }) })
    );
  });

  it('calls bcrypt.hash with rounds=10', async () => {
    mockBcryptHash.mockResolvedValueOnce('hashed');
    mockUserCreate.mockResolvedValueOnce({
      userId: 'uuid-1', email: 'a@b.com', fullName: null, createdAt: NOW,
    });
    await POST(makePostReq({ email: 'a@b.com', password: 'password1' }, VALID_KEY));
    expect(mockBcryptHash).toHaveBeenCalledWith('password1', 10);
  });

  it('returns 201 with { userId, email, fullName, createdAt } — no passwordHash', async () => {
    mockBcryptHash.mockResolvedValueOnce('hashed');
    mockUserCreate.mockResolvedValueOnce({
      userId: 'uuid-1', email: 'a@b.com', fullName: 'Alice', createdAt: NOW,
    });
    const res = await POST(makePostReq({ email: 'a@b.com', password: 'password1', fullName: 'Alice' }, VALID_KEY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('userId', 'uuid-1');
    expect(body).toHaveProperty('email', 'a@b.com');
    expect(body).toHaveProperty('fullName', 'Alice');
    expect(body).toHaveProperty('createdAt');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('returns 400 when email is missing', async () => {
    const res = await POST(makePostReq({ password: 'password1' }, VALID_KEY));
    expect(res.status).toBe(400);
  });

  it('returns 400 when email has no @ sign', async () => {
    const res = await POST(makePostReq({ email: 'notanemail', password: 'password1' }, VALID_KEY));
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await POST(makePostReq({ email: 'a@b.com' }, VALID_KEY));
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await POST(makePostReq({ email: 'a@b.com', password: 'short7' }, VALID_KEY));
    expect(res.status).toBe(400);
  });

  it('returns 400 when request body is malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'x-api-key': VALID_KEY, 'content-type': 'application/json' },
      body: 'not-json{{{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 409 with correct error when Prisma throws P2002', async () => {
    mockBcryptHash.mockResolvedValueOnce('hashed');
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    mockUserCreate.mockRejectedValueOnce(p2002);
    const res = await POST(makePostReq({ email: 'a@b.com', password: 'password1' }, VALID_KEY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'Email already exists' });
  });

  it('does not include passwordHash in the 201 response body', async () => {
    mockBcryptHash.mockResolvedValueOnce('super-secret-hash');
    mockUserCreate.mockResolvedValueOnce({
      userId: 'uuid-1', email: 'a@b.com', fullName: null, createdAt: NOW,
    });
    const res = await POST(makePostReq({ email: 'a@b.com', password: 'password1' }, VALID_KEY));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('super-secret-hash');
    expect(body).not.toHaveProperty('passwordHash');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[userId]/password
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-005: PATCH /api/admin/users/[userId]/password', () => {
  const userId = 'uuid-alice';
  const url = `http://localhost/api/admin/users/${userId}/password`;
  const params = { userId };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_API_KEY = VALID_KEY;
  });

  afterAll(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it('returns 401 without DB call when API key is missing', async () => {
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }), { params });
    expect(res.status).toBe(401);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('calls bcrypt.hash with rounds=10 on newPassword', async () => {
    mockBcryptHash.mockResolvedValueOnce('newhash');
    mockUserUpdate.mockResolvedValueOnce({ userId, updatedAt: NOW });
    await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }, VALID_KEY), { params });
    expect(mockBcryptHash).toHaveBeenCalledWith('newpassword1', 10);
  });

  it('returns 200 with { userId, updatedAt } on success', async () => {
    mockBcryptHash.mockResolvedValueOnce('newhash');
    mockUserUpdate.mockResolvedValueOnce({ userId, updatedAt: NOW });
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }, VALID_KEY), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('userId', userId);
    expect(body).toHaveProperty('updatedAt');
  });

  it('returns 400 when newPassword is shorter than 8 characters', async () => {
    const res = await patchPassword(makePatchReq(url, { newPassword: 'short7' }, VALID_KEY), { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 when newPassword is missing', async () => {
    const res = await patchPassword(makePatchReq(url, {}, VALID_KEY), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when Prisma throws P2025', async () => {
    mockBcryptHash.mockResolvedValueOnce('newhash');
    const p2025 = Object.assign(new Error('Record not found'), { code: 'P2025' });
    mockUserUpdate.mockRejectedValueOnce(p2025);
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }, VALID_KEY), { params });
    expect(res.status).toBe(404);
  });

  it('does not include passwordHash in the 200 response body', async () => {
    mockBcryptHash.mockResolvedValueOnce('secret-hash');
    mockUserUpdate.mockResolvedValueOnce({ userId, updatedAt: NOW });
    const res = await patchPassword(makePatchReq(url, { newPassword: 'newpassword1' }, VALID_KEY), { params });
    const body = await res.json();
    expect(body).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(body)).not.toContain('secret-hash');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[userId]/active
// ---------------------------------------------------------------------------

describe('EPIC-002/STORY-010/TASK-010-005: PATCH /api/admin/users/[userId]/active', () => {
  const userId = 'uuid-alice';
  const url = `http://localhost/api/admin/users/${userId}/active`;
  const params = { userId };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_API_KEY = VALID_KEY;
  });

  afterAll(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it('returns 401 without DB call when API key is missing', async () => {
    const res = await patchActive(makePatchReq(url, { isActive: false }), { params });
    expect(res.status).toBe(401);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 with { userId, isActive: false, updatedAt } when isActive=false', async () => {
    mockUserUpdate.mockResolvedValueOnce({ userId, isActive: false, updatedAt: NOW });
    const res = await patchActive(makePatchReq(url, { isActive: false }, VALID_KEY), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userId, isActive: false, updatedAt: NOW.toISOString() });
  });

  it('returns 200 with { userId, isActive: true, updatedAt } when isActive=true', async () => {
    mockUserUpdate.mockResolvedValueOnce({ userId, isActive: true, updatedAt: NOW });
    const res = await patchActive(makePatchReq(url, { isActive: true }, VALID_KEY), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isActive).toBe(true);
  });

  it('returns 400 when isActive is a string "false" (not a boolean)', async () => {
    const res = await patchActive(makePatchReq(url, { isActive: 'false' }, VALID_KEY), { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 when isActive is a string "true" (not a boolean)', async () => {
    const res = await patchActive(makePatchReq(url, { isActive: 'true' }, VALID_KEY), { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 when isActive is missing from body', async () => {
    const res = await patchActive(makePatchReq(url, {}, VALID_KEY), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when Prisma throws P2025', async () => {
    const p2025 = Object.assign(new Error('Record not found'), { code: 'P2025' });
    mockUserUpdate.mockRejectedValueOnce(p2025);
    const res = await patchActive(makePatchReq(url, { isActive: false }, VALID_KEY), { params });
    expect(res.status).toBe(404);
  });
});
