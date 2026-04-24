// EPIC-004: Classification Engine & Universe Screen
// STORY-055: Remove Stock from Universe
// TASK-055-005: Unit tests — DELETE /api/universe/stocks/[ticker]
// Fixtures: synthetic (no live API calls)

import { NextRequest } from 'next/server';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));

import { DELETE } from '@/app/api/universe/stocks/[ticker]/route';
import { prisma } from '@/infrastructure/database/prisma';
import { validateSession } from '@/modules/auth/auth.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(ticker: string, sessionId = 'sess-abc'): NextRequest {
  const req = new NextRequest(`http://localhost/api/universe/stocks/${ticker}`, {
    method: 'DELETE',
  });
  if (sessionId) {
    req.cookies.set('sessionId', sessionId);
  }
  return req;
}

async function callDelete(ticker: string, sessionId?: string) {
  const req = makeReq(ticker, sessionId ?? 'sess-abc');
  return DELETE(req, { params: Promise.resolve({ ticker }) });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-055: DELETE /api/universe/stocks/[ticker]', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSession as jest.Mock).mockResolvedValue({ userId: 'user-1' });
    (prisma.stock.update as jest.Mock).mockResolvedValue({});
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('returns 401 when no session cookie', async () => {
    const req = new NextRequest('http://localhost/api/universe/stocks/TSLA', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ ticker: 'TSLA' }) });
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is invalid', async () => {
    (validateSession as jest.Mock).mockResolvedValue(null);
    const res = await callDelete('TSLA');
    expect(res.status).toBe(401);
    expect(prisma.stock.findUnique).not.toHaveBeenCalled();
  });

  // ── Input validation ───────────────────────────────────────────────────────

  it('returns 400 for empty ticker', async () => {
    const res = await callDelete('');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_ticker');
  });

  it('returns 400 for ticker with invalid characters', async () => {
    const res = await callDelete('T$SLA!');
    expect(res.status).toBe(400);
    expect(prisma.stock.findUnique).not.toHaveBeenCalled();
  });

  // ── Not found ─────────────────────────────────────────────────────────────

  it('returns 404 when stock does not exist in DB', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await callDelete('NVDA');
    expect(res.status).toBe(404);
    expect(prisma.stock.update).not.toHaveBeenCalled();
  });

  // ── Already removed ───────────────────────────────────────────────────────

  it('returns 409 when stock already has inUniverse = false', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ticker: 'TSLA', inUniverse: false });
    const res = await callDelete('TSLA');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('already_removed');
    expect(prisma.stock.update).not.toHaveBeenCalled();
  });

  // ── Successful removal ────────────────────────────────────────────────────

  it('returns 200 with removed=true and calls update with inUniverse=false', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ticker: 'TSLA', inUniverse: true });

    const res = await callDelete('TSLA');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(true);
    expect(body.ticker).toBe('TSLA');
    expect(typeof body.removedAt).toBe('string');

    const updateCall = (prisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ ticker: 'TSLA' });
    expect(updateCall.data.inUniverse).toBe(false);
    expect(updateCall.data.universeStatusChangedAt).toBeInstanceOf(Date);
  });

  it('does NOT delete the DB row — only sets inUniverse = false', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ticker: 'MSFT', inUniverse: true });

    await callDelete('MSFT');

    // update called, not delete
    expect(prisma.stock.update).toHaveBeenCalledTimes(1);
    expect((prisma.stock as Record<string, unknown>).delete).toBeUndefined();
  });

  // ── Ticker normalisation ──────────────────────────────────────────────────

  it('looks up ticker as uppercase in DB', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ticker: 'TSLA', inUniverse: true });
    await callDelete('tsla');
    const findCall = (prisma.stock.findUnique as jest.Mock).mock.calls[0][0];
    expect(findCall.where.ticker).toBe('TSLA');
  });
});
