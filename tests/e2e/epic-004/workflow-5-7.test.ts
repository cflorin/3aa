// EPIC-004: Classification Engine & Universe Screen
// STORY-052: EPIC-004 End-to-End Tests
// TASK-052-003: E2E workflow tests W5–W7
// PRD §Screen 2; RFC-001 §Classification Batch Job; RFC-003 §Stock Detail Screen
//
// Fixture provenance: sanitized_real (stock data from universe-snapshot-5.md)
// Requires: test DB at DATABASE_URL (NODE_ENV=test)
// Batch cron OIDC bypass: verifySchedulerToken returns early when NODE_ENV !== 'production'

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  seedUniverse, cleanupUniverse, clearClassificationState, prisma,
  BUCKET8_TICKER,
} from './fixtures/seed-universe';
import { GET as classificationGET } from '../../../src/app/api/stocks/[ticker]/classification/route';
import { POST as overridePOST } from '../../../src/app/api/classification-override/route';
import { POST as batchPOST } from '../../../src/app/api/cron/classification/route';
import { GET as detailGET } from '../../../src/app/api/stocks/[ticker]/detail/route';

// ── Test helpers ──────────────────────────────────────────────────────────────

async function createUser(email: string) {
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
  await prisma.userClassificationOverride.deleteMany({ where: { userId: user.userId } });
  await prisma.userDeactivatedStock.deleteMany({ where: { userId: user.userId } });
  await prisma.user.delete({ where: { email } });
}

function authedReq(url: string, sessionId: string, opts: { method?: string; body?: unknown } = {}): NextRequest {
  const { method = 'GET', body } = opts;
  const headers: Record<string, string> = { cookie: `sessionId=${sessionId}` };
  if (body) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function anonReq(url: string, method = 'GET'): NextRequest {
  return new NextRequest(url, { method });
}

// ── Suite setup ───────────────────────────────────────────────────────────────

const UA_EMAIL = 'w5-usera@test.com';
const UB_EMAIL = 'w5-userb@test.com';
const W6_EMAIL = 'w6-e2e@test.com';
const W7_EMAIL = 'w7-e2e@test.com';

let userASession: string;
let userBSession: string;
let w6Session: string;
let w7Session: string;

beforeAll(async () => {
  await Promise.all([UA_EMAIL, UB_EMAIL, W6_EMAIL, W7_EMAIL].map(cleanupUser));
  await cleanupUniverse();
  await seedUniverse();

  const [ua, ub, u6, u7] = await Promise.all([
    createUser(UA_EMAIL),
    createUser(UB_EMAIL),
    createUser(W6_EMAIL),
    createUser(W7_EMAIL),
  ]);
  const [sa, sb, s6, s7] = await Promise.all([
    createSession(ua.userId),
    createSession(ub.userId),
    createSession(u6.userId),
    createSession(u7.userId),
  ]);
  userASession = sa.sessionId;
  userBSession = sb.sessionId;
  w6Session = s6.sessionId;
  w7Session = s7.sessionId;
}, 60_000);

afterAll(async () => {
  await Promise.all([UA_EMAIL, UB_EMAIL, W6_EMAIL, W7_EMAIL].map(cleanupUser));
  await cleanupUniverse();
}, 30_000);

// ── W5: Multi-User Isolation ──────────────────────────────────────────────────

describe('EPIC-004/STORY-052/W5: Multi-user override isolation', () => {
  const TICKER = 'MSFT';

  it('W5-1: User A sets override to 3AA', async () => {
    const res = await overridePOST(authedReq(
      `http://localhost/api/classification-override`,
      userASession,
      { method: 'POST', body: { ticker: TICKER, final_code: '3AA', override_reason: 'User A E2E test override reason' } },
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active_code).toBe('3AA');
  });

  it('W5-2: User B sees system code (not user A override)', async () => {
    const res = await classificationGET(
      authedReq(`http://localhost/api/stocks/${TICKER}/classification`, userBSession),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect(body.user_override_code).toBeNull();
    // User B's active_code is the system suggested code, not User A's 3AA
    expect(body.active_code).toBe(body.system_suggested_code);
  });

  it('W5-3: User B sets override to 5BA; does not affect User A', async () => {
    const res = await overridePOST(authedReq(
      `http://localhost/api/classification-override`,
      userBSession,
      { method: 'POST', body: { ticker: TICKER, final_code: '5BA', override_reason: 'User B E2E test override reason' } },
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active_code).toBe('5BA');
  });

  it('W5-4: User A still sees 3AA after User B set 5BA', async () => {
    const res = await classificationGET(
      authedReq(`http://localhost/api/stocks/${TICKER}/classification`, userASession),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect(body.user_override_code).toBe('3AA');
    expect(body.active_code).toBe('3AA');
  });
});

// ── W6: Batch Job Trigger ─────────────────────────────────────────────────────

describe('EPIC-004/STORY-052/W6: Nightly batch simulation', () => {

  it('W6-1: Clear classification state; verify rows absent', async () => {
    await clearClassificationState();
    const states = await prisma.classificationState.findMany({
      where: { ticker: { in: ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH', BUCKET8_TICKER] } },
    });
    expect(states).toHaveLength(0);
  });

  it('W6-2: POST /api/cron/classification runs without auth (NODE_ENV=test bypass)', async () => {
    // verifySchedulerToken skips when NODE_ENV !== 'production'
    const res = await batchPOST(anonReq(`http://localhost/api/cron/classification`, 'POST'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBeGreaterThanOrEqual(6);
    expect(body.recomputed).toBeGreaterThanOrEqual(6);
    expect(body.errors).toBe(0);
  }, 30_000);

  it('W6-3: All 5 real stocks have classification_state after batch', async () => {
    const states = await prisma.classificationState.findMany({
      where: { ticker: { in: ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'] } },
    });
    expect(states).toHaveLength(5);
  });

  it('W6-4: All real stocks have non-null suggested_code', async () => {
    const states = await prisma.classificationState.findMany({
      where: { ticker: { in: ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'] } },
    });
    for (const s of states) {
      expect(s.suggestedCode).not.toBeNull();
    }
  });

  it('W6-5: BIN8_TEST has suggested_code="8" after batch (binary_flag override)', async () => {
    const state = await prisma.classificationState.findUnique({
      where: { ticker: BUCKET8_TICKER },
    });
    expect(state).not.toBeNull();
    expect(state!.suggestedCode).toBe('8');
  });
});

// ── W7: Stock Detail API ──────────────────────────────────────────────────────

describe('EPIC-004/STORY-052/W7: Stock detail API workflow', () => {
  const TICKER = 'MSFT';

  it('W7-1: GET /api/stocks/MSFT/detail returns 200 with full shape', async () => {
    const res = await detailGET(
      authedReq(`http://localhost/api/stocks/${TICKER}/detail`, w7Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticker).toBe(TICKER);
    expect(body.company).toBe('Microsoft Corporation');
  });

  it('W7-2: Detail response includes all classification keys', async () => {
    const res = await detailGET(
      authedReq(`http://localhost/api/stocks/${TICKER}/detail`, w7Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    // Classification state
    expect('active_code' in body).toBe(true);
    expect('suggested_code' in body).toBe(true);
    expect('scores' in body).toBe(true);
    expect('confidenceBreakdown' in body).toBe(true);
    expect(Array.isArray(body.tieBreaksFired)).toBe(true);
    expect('input_snapshot' in body).toBe(true);
    expect(body.override_scope).toBe('display_only');
  });

  it('W7-3: Detail response includes all 7 flags', async () => {
    const res = await detailGET(
      authedReq(`http://localhost/api/stocks/${TICKER}/detail`, w7Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect('holding_company_flag' in body).toBe(true);
    expect('insurer_flag' in body).toBe(true);
    expect('binary_flag' in body).toBe(true);
    expect('cyclicality_flag' in body).toBe(true);
    expect('optionality_flag' in body).toBe(true);
    expect('pre_operating_leverage_flag' in body).toBe(true);
    expect('material_dilution_flag' in body).toBe(true);
  });

  it('W7-4: Detail response includes all E1–E6 enrichment scores', async () => {
    const res = await detailGET(
      authedReq(`http://localhost/api/stocks/${TICKER}/detail`, w7Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect('e1_moat_strength' in body).toBe(true);
    expect('e2_pricing_power' in body).toBe(true);
    expect('e3_revenue_recurrence' in body).toBe(true);
    expect('e4_margin_durability' in body).toBe(true);
    expect('e5_capital_intensity' in body).toBe(true);
    expect('e6_qualitative_cyclicality' in body).toBe(true);
    // MSFT enrichment values from snapshot
    expect(body.e1_moat_strength).toBe(5.0);
    expect(body.e2_pricing_power).toBe(4.5);
  });

  it('W7-5: Detail response: scores.bucket has entries 1–8', async () => {
    const res = await detailGET(
      authedReq(`http://localhost/api/stocks/${TICKER}/detail`, w7Session),
      { params: Promise.resolve({ ticker: TICKER }) },
    );
    const body = await res.json();
    expect(body.scores).not.toBeNull();
    for (let i = 1; i <= 8; i++) {
      expect(String(i) in body.scores.bucket).toBe(true);
    }
  });
});
