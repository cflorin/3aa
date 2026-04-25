// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-078: User Valuation Override API
// TASK-078-003: Unit tests — GET /api/stocks/[ticker]/valuation + PUT/DELETE override

jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findUnique: jest.fn() },
    userValuationOverride: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/modules/valuation/valuation-persistence.service', () => ({
  getPersonalizedValuation: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';
import { getPersonalizedValuation } from '@/modules/valuation/valuation-persistence.service';
import { GET } from '@/app/api/stocks/[ticker]/valuation/route';
import { PUT, DELETE } from '@/app/api/stocks/[ticker]/valuation/override/route';

const mockValidateSession = validateSession as jest.Mock;
const mockFindStock = prisma.stock.findUnique as jest.Mock;
const mockFindOverride = prisma.userValuationOverride.findUnique as jest.Mock;
const mockUpsertOverride = prisma.userValuationOverride.upsert as jest.Mock;
const mockDeleteOverride = prisma.userValuationOverride.delete as jest.Mock;
const mockGetPersonalized = getPersonalizedValuation as jest.Mock;

const USER = { userId: 'user-1', email: 'test@example.com' };

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = { cookie: 'sessionId=sess-1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const PARAMS = Promise.resolve({ ticker: 'AAPL' });

const SYSTEM_STATE = {
  ticker: 'AAPL', activeCode: '4AA', valuationZone: 'comfortable_zone',
  maxThreshold: '22.0', comfortableThreshold: '20.0', veryGoodThreshold: '18.0', stealThreshold: '16.0',
};

const USER_RESULT = { activeCode: '4AA', valuationZone: 'comfortable_zone', thresholdSource: 'anchored' };

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateSession.mockResolvedValue(USER);
  mockFindStock.mockResolvedValue({ ticker: 'AAPL', inUniverse: true });
  mockFindOverride.mockResolvedValue(null);
  mockGetPersonalized.mockResolvedValue({ systemState: SYSTEM_STATE, userResult: USER_RESULT, hasUserOverride: false });
});

// ── GET /api/stocks/[ticker]/valuation ──────────────────────────────────────

describe('EPIC-005/STORY-078: GET /api/stocks/[ticker]/valuation', () => {
  it('returns 401 when no session cookie', async () => {
    const req = new NextRequest('http://localhost/api/stocks/AAPL/valuation', { method: 'GET' });
    const res = await GET(req, { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it('returns 401 when session invalid', async () => {
    mockValidateSession.mockResolvedValue(null);
    const res = await GET(makeReq('GET', 'http://localhost/api/stocks/AAPL/valuation'), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it('returns 404 when stock not found', async () => {
    mockFindStock.mockResolvedValue(null);
    const res = await GET(makeReq('GET', 'http://localhost/api/stocks/AAPL/valuation'), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it('returns 404 when systemState is null (valuation not yet computed)', async () => {
    mockGetPersonalized.mockResolvedValue({ systemState: null, userResult: null, hasUserOverride: false });
    const res = await GET(makeReq('GET', 'http://localhost/api/stocks/AAPL/valuation'), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it('returns personalized valuation with systemState, userResult, hasUserOverride, userOverride', async () => {
    const res = await GET(makeReq('GET', 'http://localhost/api/stocks/AAPL/valuation'), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticker).toBe('AAPL');
    expect(body.systemState.valuationZone).toBe('comfortable_zone');
    expect(body.userResult.valuationZone).toBe('comfortable_zone');
    expect(body.hasUserOverride).toBe(false);
    expect(body.userOverride).toBeNull();
  });
});

// ── PUT /api/stocks/[ticker]/valuation/override ─────────────────────────────

describe('EPIC-005/STORY-078: PUT /api/stocks/[ticker]/valuation/override', () => {
  it('returns 401 when no session', async () => {
    const req = new NextRequest('http://localhost/api/stocks/AAPL/valuation/override', { method: 'PUT' });
    const res = await PUT(req, { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it('returns 400 when no fields supplied', async () => {
    const res = await PUT(makeReq('PUT', 'http://localhost/api/stocks/AAPL/valuation/override', {}), { params: PARAMS });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('missing_override_fields');
  });

  it('returns 400 when partial threshold set supplied', async () => {
    const res = await PUT(makeReq('PUT', 'http://localhost/api/stocks/AAPL/valuation/override', {
      maxThreshold: 30.0, comfortableThreshold: 27.0,
    }), { params: PARAMS });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_threshold_set');
  });

  it('returns 400 when threshold order violated (max < comfortable)', async () => {
    const res = await PUT(makeReq('PUT', 'http://localhost/api/stocks/AAPL/valuation/override', {
      maxThreshold: 20.0, comfortableThreshold: 25.0,
      veryGoodThreshold: 18.0, stealThreshold: 15.0,
    }), { params: PARAMS });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('threshold_order_violation');
  });

  it('returns 400 when invalid primaryMetricOverride', async () => {
    const res = await PUT(makeReq('PUT', 'http://localhost/api/stocks/AAPL/valuation/override', {
      primaryMetricOverride: 'bad_metric',
    }), { params: PARAMS });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_metric');
  });

  it('upserts override and returns userResult with manual_override thresholdSource', async () => {
    const upserted = { userId: 'user-1', ticker: 'AAPL', maxThreshold: '30.0' };
    mockUpsertOverride.mockResolvedValue(upserted);
    mockGetPersonalized.mockResolvedValue({
      systemState: SYSTEM_STATE,
      userResult: { ...USER_RESULT, maxThreshold: 30.0, thresholdSource: 'manual_override' },
      hasUserOverride: true,
    });

    const res = await PUT(makeReq('PUT', 'http://localhost/api/stocks/AAPL/valuation/override', {
      maxThreshold: 30.0, comfortableThreshold: 27.0,
      veryGoodThreshold: 18.0, stealThreshold: 15.0,
    }), { params: PARAMS });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userResult.thresholdSource).toBe('manual_override');
    expect(body.userOverride).toEqual(upserted);
  });

  it('allows notes-only override (no thresholds required)', async () => {
    mockUpsertOverride.mockResolvedValue({ userId: 'user-1', ticker: 'AAPL', notes: 'my note' });
    const res = await PUT(makeReq('PUT', 'http://localhost/api/stocks/AAPL/valuation/override', {
      notes: 'my note',
    }), { params: PARAMS });
    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/stocks/[ticker]/valuation/override ──────────────────────────

describe('EPIC-005/STORY-078: DELETE /api/stocks/[ticker]/valuation/override', () => {
  it('returns 404 when no override exists', async () => {
    mockFindOverride.mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE', 'http://localhost/api/stocks/AAPL/valuation/override'), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it('deletes override and returns system result with userOverride=null', async () => {
    mockFindOverride.mockResolvedValue({ userId: 'user-1', ticker: 'AAPL' });
    mockDeleteOverride.mockResolvedValue({});

    const res = await DELETE(makeReq('DELETE', 'http://localhost/api/stocks/AAPL/valuation/override'), { params: PARAMS });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userOverride).toBeNull();
    expect(body.userResult.thresholdSource).toBe('anchored');
    expect(mockDeleteOverride).toHaveBeenCalledWith({
      where: { userId_ticker: { userId: 'user-1', ticker: 'AAPL' } },
    });
  });
});
