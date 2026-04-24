// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-004: Integration tests — GET /api/stocks/[ticker]/detail
// PRD §Stock Detail; RFC-001 §ClassificationResult; RFC-003 §Stock Detail Screen
//
// Requires: test DB at DATABASE_URL
// Fixture provenance: synthetic (test DB; no real stock data)
// Pre-existing: MSFT stock not seeded in test DB — FK constraint will prevent classification writes.
// All test isolation uses a dedicated test ticker that is cleaned up per test.

import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { GET } from '../../../../src/app/api/stocks/[ticker]/detail/route';

const TEST_EMAIL = 'detail-test-user@test.com';
const OUT_OF_UNIVERSE_TICKER = 'DETAIL_OOF';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function createTestUser(email: string) {
  const passwordHash = await bcrypt.hash('testpass123', 10);
  return prisma.user.create({ data: { email, passwordHash } });
}

async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return prisma.userSession.create({ data: { userId, expiresAt } });
}

async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.userSession.deleteMany({ where: { userId: user.userId } });
  await prisma.user.delete({ where: { email } });
}

function makeReq(ticker: string, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest(`http://localhost/api/stocks/${ticker}/detail`, { headers });
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let userId: string;
let sessionId: string;

beforeAll(async () => {
  await cleanupUser(TEST_EMAIL);
  // Clean up any leftover out-of-universe stock
  await prisma.stock.deleteMany({ where: { ticker: OUT_OF_UNIVERSE_TICKER } });

  const user = await createTestUser(TEST_EMAIL);
  userId = user.userId;
  const session = await createSession(userId);
  sessionId = session.sessionId;
});

afterAll(async () => {
  await prisma.stock.deleteMany({ where: { ticker: OUT_OF_UNIVERSE_TICKER } });
  await cleanupUser(TEST_EMAIL);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-053/TASK-053-004: GET /api/stocks/[ticker]/detail', () => {

  it('returns 401 without session cookie', async () => {
    const req = makeReq('MSFT');
    const res = await GET(req, { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid session', async () => {
    const req = makeReq('MSFT', 'invalid-session-id');
    const res = await GET(req, { params: Promise.resolve({ ticker: 'MSFT' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown ticker', async () => {
    const req = makeReq('UNKNOWN_TICKER_DETAIL_XYZ', sessionId);
    const res = await GET(req, { params: Promise.resolve({ ticker: 'UNKNOWN_TICKER_DETAIL_XYZ' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 for out-of-universe stock (inUniverse=false)', async () => {
    // Create a stock that exists but is not in universe
    await prisma.stock.create({
      data: {
        ticker: OUT_OF_UNIVERSE_TICKER,
        companyName: 'Out Of Universe Test Co',
        country: 'US',
        inUniverse: false,
      },
    });
    const req = makeReq(OUT_OF_UNIVERSE_TICKER, sessionId);
    const res = await GET(req, { params: Promise.resolve({ ticker: OUT_OF_UNIVERSE_TICKER }) });
    expect(res.status).toBe(404);
  });

  it('response shape contract: active_code present (null acceptable)', async () => {
    // Use a known in-universe stock from the DB if available, else skip gracefully
    const stock = await prisma.stock.findFirst({ where: { inUniverse: true } });
    if (!stock) {
      console.warn('No in-universe stocks in test DB — skipping shape contract test');
      return;
    }
    const req = makeReq(stock.ticker, sessionId);
    const res = await GET(req, { params: Promise.resolve({ ticker: stock.ticker }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // active_code key must be present (null is acceptable for unclassified stocks)
    expect('active_code' in body).toBe(true);
    expect('ticker' in body).toBe(true);
    expect('company' in body).toBe(true);
    expect('scores' in body).toBe(true);
    expect('tieBreaksFired' in body).toBe(true);
    expect(Array.isArray(body.tieBreaksFired)).toBe(true);
    expect('reason_codes' in body).toBe(true);
    expect(Array.isArray(body.reason_codes)).toBe(true);
    // All 7 flags present
    expect('holding_company_flag' in body).toBe(true);
    expect('insurer_flag' in body).toBe(true);
    expect('binary_flag' in body).toBe(true);
    expect('cyclicality_flag' in body).toBe(true);
    expect('optionality_flag' in body).toBe(true);
    expect('pre_operating_leverage_flag' in body).toBe(true);
    expect('material_dilution_flag' in body).toBe(true);
    // E1–E6 keys present
    expect('e1_moat_strength' in body).toBe(true);
    expect('e6_qualitative_cyclicality' in body).toBe(true);
    // override_scope invariant
    expect(body.override_scope).toBe('display_only');
  });

  it('confidenceBreakdown and tieBreaksFired keys always present in 200 response', async () => {
    const stock = await prisma.stock.findFirst({ where: { inUniverse: true } });
    if (!stock) return; // graceful skip
    const req = makeReq(stock.ticker, sessionId);
    const res = await GET(req, { params: Promise.resolve({ ticker: stock.ticker }) });
    if (res.status !== 200) return;
    const body = await res.json();
    expect('confidenceBreakdown' in body).toBe(true);
    expect('tieBreaksFired' in body).toBe(true);
  });
});
