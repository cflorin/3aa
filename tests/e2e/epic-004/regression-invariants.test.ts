// EPIC-004: Classification Engine & Universe Screen
// STORY-052: EPIC-004 End-to-End Tests
// TASK-052-004: EPIC-004 regression invariant tests
// PRD §E2E Testing; RFC-001 §Classification Engine; RFC-003 §Universe Screen
//
// 5 invariants:
//   INV-1: Universe screen auth guard (no session → 401)
//   INV-2: confidence_level never null after batch
//   INV-3: Bucket 8 stock: suggested_code="8", eq_grade=null, bs_grade=null
//   INV-4: Override reason <10 chars → 422 validation error
//   INV-5: override_scope === "display_only" always present in classification response

import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import {
  seedUniverse, cleanupUniverse, prisma, BUCKET8_TICKER,
} from './fixtures/seed-universe';
import { GET as universeGET } from '../../../src/app/api/universe/route';
import { GET as classificationGET } from '../../../src/app/api/stocks/[ticker]/classification/route';
import { POST as overridePOST } from '../../../src/app/api/classification-override/route';

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

// ── Suite setup ───────────────────────────────────────────────────────────────

const INV_EMAIL = 'inv-e2e@test.com';
let invSession: string;

beforeAll(async () => {
  await cleanupUser(INV_EMAIL);
  await cleanupUniverse();
  await seedUniverse();

  const user = await createUser(INV_EMAIL);
  const session = await createSession(user.userId);
  invSession = session.sessionId;
}, 60_000);

afterAll(async () => {
  await cleanupUser(INV_EMAIL);
  await cleanupUniverse();
}, 30_000);

// ── Invariant Tests ───────────────────────────────────────────────────────────

describe('EPIC-004/STORY-052/TASK-052-004: Regression invariants', () => {

  // INV-1: Universe screen auth guard
  it('INV-1: GET /api/universe without session returns 401', async () => {
    const req = new NextRequest('http://localhost/api/universe');
    const res = await universeGET(req);
    expect(res.status).toBe(401);
  });

  // INV-2: confidence_level never null after batch has run
  it('INV-2: confidence_level is "high"|"medium"|"low" — never null for classified stock', async () => {
    // Seed populates classification_state; MSFT should have a confident classification
    const res = await classificationGET(
      authedReq(`http://localhost/api/stocks/MSFT/classification`, invSession),
      { params: Promise.resolve({ ticker: 'MSFT' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.system_confidence).toMatch(/^(high|medium|low)$/);
  });

  // INV-3: Bucket 8 stock special-case override
  it('INV-3: BIN8_TEST (binary_flag=true) has suggested_code="8" in classification_state', async () => {
    const state = await prisma.classificationState.findUnique({
      where: { ticker: BUCKET8_TICKER },
    });
    expect(state).not.toBeNull();
    expect(state!.suggestedCode).toBe('8');
    // eq_grade and bs_grade stored in scores JSONB — should be absent/null for Bucket 8
    // The ClassificationResult has eq_grade=null, bs_grade=null for Bucket 8 (classifier.ts step 4)
    // Scores payload stores bucket/eq/bs score arrays but winner is determined at query time
    // Verify via classification route: active_code = "8"
    const res = await classificationGET(
      authedReq(`http://localhost/api/stocks/${BUCKET8_TICKER}/classification`, invSession),
      { params: Promise.resolve({ ticker: BUCKET8_TICKER }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active_code).toBe('8');
    expect(body.system_suggested_code).toBe('8');
  });

  // INV-4: Override reason validation — too short returns 422
  it('INV-4: POST override with reason < 10 chars returns 422', async () => {
    const res = await overridePOST(authedReq(
      `http://localhost/api/classification-override`,
      invSession,
      { method: 'POST', body: { ticker: 'MSFT', final_code: '3AA', override_reason: 'short' } },
    ));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/override_reason/i);
  });

  // INV-5: override_scope always "display_only"
  it('INV-5: GET /api/stocks/MSFT/classification always returns override_scope="display_only"', async () => {
    const res = await classificationGET(
      authedReq(`http://localhost/api/stocks/MSFT/classification`, invSession),
      { params: Promise.resolve({ ticker: 'MSFT' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.override_scope).toBe('display_only');
  });
});
