// EPIC-004: Classification Engine & Universe Screen
// STORY-051: Classification Override Modal
// TASK-051-004: Integration tests — GET /api/stocks/[ticker]/classification/history
// PRD §Screen 2 — Classification Detail; RFC-003 §Classification Override Modal
//
// Requires: test DB at DATABASE_URL; MSFT stock must exist in stocks table

import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { GET as historyGET } from '../../../../src/app/api/stocks/[ticker]/classification/history/route';
import { GET as classificationGET } from '../../../../src/app/api/stocks/[ticker]/classification/route';
import { persistClassification } from '../../../../src/domain/classification/persistence';
import type { ClassificationResult, ClassificationInput } from '../../../../src/domain/classification/types';

const TICKER = 'MSFT';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function makeGetHistoryReq(ticker: string, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest(`http://localhost/api/stocks/${ticker}/classification/history`, {
    method: 'GET',
    headers,
  });
}

function makeGetClassificationReq(ticker: string, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `sessionId=${sessionId}`;
  return new NextRequest(`http://localhost/api/stocks/${ticker}/classification`, {
    method: 'GET',
    headers,
  });
}

// Minimal valid ClassificationResult — synthetic fixture
function makeResult(code: string | null): ClassificationResult {
  return {
    suggested_code: code,
    bucket: 4,
    eq_grade: 'A',
    bs_grade: 'A',
    confidence_level: 'high',
    reason_codes: ['STRONG_GROWTH'],
    scores: { bucket: { 1:5,2:10,3:20,4:50,5:15,6:8,7:3,8:1 } as Record<number,number>, eq: { A:8,B:4,C:1 } as Record<string,number>, bs: { A:7,B:3,C:1 } as Record<string,number> },
    missing_field_count: 0,
    confidenceBreakdown: { steps: [] },
    tieBreaksFired: [],
  } as unknown as ClassificationResult;
}

const MINIMAL_INPUT: ClassificationInput = {
  revenue_growth_fwd: 0.12, revenue_growth_3y: 0.15, eps_growth_fwd: 0.10,
  eps_growth_3y: 0.12, gross_profit_growth: 0.08, operating_margin: 0.40,
  fcf_margin: 0.30, fcf_conversion: 0.85, roic: 0.25, fcf_positive: true,
  net_income_positive: true, net_debt_to_ebitda: 0.5, interest_coverage: 10,
  moat_strength_score: 4.0, pricing_power_score: 4.0, revenue_recurrence_score: 3.5,
  margin_durability_score: 4.0, capital_intensity_score: 2.0, qualitative_cyclicality_score: 2.0,
  holding_company_flag: false, insurer_flag: false, cyclicality_flag: false,
  optionality_flag: false, binary_flag: false, pre_operating_leverage_flag: false,
};

// ── Setup / Teardown ──────────────────────────────────────────────────────────

let userId: string;
let sessionId: string;

beforeAll(async () => {
  await cleanupUser('hist-test-user@test.com');
  const user = await createTestUser('hist-test-user@test.com');
  userId = user.userId;
  const session = await createSession(userId);
  sessionId = session.id;
  // Ensure classification_state exists for MSFT (upsert via persistClassification)
  await persistClassification(TICKER, makeResult('4AA'), MINIMAL_INPUT);
});

afterAll(async () => {
  // Remove history rows created during tests
  await prisma.classificationHistory.deleteMany({ where: { ticker: TICKER } });
  // Restore classification state
  await persistClassification(TICKER, makeResult('4AA'), MINIMAL_INPUT);
  await cleanupUser('hist-test-user@test.com');
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-051/TASK-051-004: classification history API', () => {

  it('returns 401 without session', async () => {
    const res = await historyGET(
      makeGetHistoryReq(TICKER),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown ticker', async () => {
    const res = await historyGET(
      makeGetHistoryReq('ZZZUNKNOWN', sessionId),
      { params: Promise.resolve({ ticker: 'ZZZUNKNOWN' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns empty history array for stock with no code changes', async () => {
    // Clear any existing history
    await prisma.classificationHistory.deleteMany({ where: { ticker: TICKER } });
    // Persist same code twice — no change = no history row
    await persistClassification(TICKER, makeResult('4AA'), MINIMAL_INPUT);
    await persistClassification(TICKER, makeResult('4AA'), MINIMAL_INPUT);

    const res = await historyGET(
      makeGetHistoryReq(TICKER, sessionId),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticker).toBe(TICKER);
    expect(body.history).toEqual([]);
  });

  it('returns history rows ordered newest first', async () => {
    await prisma.classificationHistory.deleteMany({ where: { ticker: TICKER } });
    // Generate code changes: null→4AA→3AA
    await persistClassification(TICKER, makeResult(null), MINIMAL_INPUT);
    await persistClassification(TICKER, makeResult('4AA'), MINIMAL_INPUT);
    await persistClassification(TICKER, makeResult('3AA'), MINIMAL_INPUT);

    const res = await historyGET(
      makeGetHistoryReq(TICKER, sessionId),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history.length).toBeGreaterThanOrEqual(2);
    // Most recent first: 4AA→3AA should be before null→4AA
    const [first, second] = body.history;
    expect(first.suggested_code).toBe('3AA');
    expect(first.previous_code).toBe('4AA');
    expect(second.suggested_code).toBe('4AA');
    expect(new Date(first.classified_at).getTime()).toBeGreaterThanOrEqual(
      new Date(second.classified_at).getTime(),
    );
  });

  it('response rows have classified_at, previous_code, suggested_code fields', async () => {
    await prisma.classificationHistory.deleteMany({ where: { ticker: TICKER } });
    await persistClassification(TICKER, makeResult('4AA'), MINIMAL_INPUT);
    await persistClassification(TICKER, makeResult('5AA'), MINIMAL_INPUT);

    const res = await historyGET(
      makeGetHistoryReq(TICKER, sessionId),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect(body.history.length).toBeGreaterThanOrEqual(1);
    const row = body.history[0];
    expect(row).toHaveProperty('classified_at');
    expect(row).toHaveProperty('previous_code');
    expect(row).toHaveProperty('suggested_code');
    expect(typeof row.classified_at).toBe('string');
  });

  it('caps history at 10 rows', async () => {
    await prisma.classificationHistory.deleteMany({ where: { ticker: TICKER } });
    // Generate 12 distinct code changes
    const codes = ['1AA','2AA','3AA','4AA','5AA','6AA','7AA','8AA','1BB','2BB','3BB','4BB'];
    for (const code of codes) {
      await persistClassification(TICKER, makeResult(code), MINIMAL_INPUT);
    }
    const res = await historyGET(
      makeGetHistoryReq(TICKER, sessionId),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect(body.history.length).toBe(10);
  });

  it('GET /api/stocks/[ticker]/classification now includes classified_at field', async () => {
    const res = await classificationGET(
      makeGetClassificationReq(TICKER, sessionId),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('classified_at');
    // classified_at is either null (no classification state) or a valid date string
    if (body.classified_at !== null) {
      expect(() => new Date(body.classified_at)).not.toThrow();
    }
  });

});
