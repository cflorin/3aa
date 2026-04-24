// EPIC-004: Classification Engine & Universe Screen
// STORY-056: Add Stock to Universe
// TASK-056-006: Unit tests — POST /api/universe/stocks + GET /api/universe/stocks/[ticker]
// Fixtures: synthetic (no live API calls)

import { NextRequest } from 'next/server';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/domain/monitoring', () => ({
  getUniverseStock: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/jobs/fundamentals-sync.service', () => ({
  syncFundamentals: jest.fn().mockResolvedValue({ stocks_updated: 1 }),
}));

jest.mock('@/modules/data-ingestion/jobs/forward-estimates-sync.service', () => ({
  syncForwardEstimates: jest.fn().mockResolvedValue({ stocks_updated: 1 }),
}));

jest.mock('@/modules/data-ingestion/jobs/market-cap-sync.service', () => ({
  syncMarketCapAndMultiples: jest.fn().mockResolvedValue({ stocks_updated: 1 }),
}));

jest.mock('@/modules/data-ingestion/jobs/deterministic-classification-sync.service', () => ({
  syncDeterministicClassificationFlags: jest.fn().mockResolvedValue({ updated: 1 }),
}));

jest.mock('@/modules/classification-enrichment/jobs/classification-enrichment-sync.service', () => ({
  syncClassificationEnrichment: jest.fn().mockResolvedValue({ stocks_processed: 1 }),
}));

jest.mock('@/modules/classification-batch/classification-batch.service', () => ({
  runClassificationBatch: jest.fn().mockResolvedValue({ processed: 1, recomputed: 1 }),
}));

jest.mock('@/modules/data-ingestion/adapters/tiingo.adapter', () => ({
  TiingoAdapter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/modules/data-ingestion/adapters/fmp.adapter', () => ({
  FMPAdapter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/modules/classification-enrichment/providers/claude.provider', () => ({
  ClaudeProvider: { fromEnv: jest.fn().mockReturnValue({}) },
}));

import { POST } from '@/app/api/universe/stocks/route';
import { GET, DELETE } from '@/app/api/universe/stocks/[ticker]/route';
import { validateSession } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';
import { getUniverseStock } from '@/domain/monitoring';
import { syncFundamentals } from '@/modules/data-ingestion/jobs/fundamentals-sync.service';
import { syncDeterministicClassificationFlags } from '@/modules/data-ingestion/jobs/deterministic-classification-sync.service';
import { runClassificationBatch } from '@/modules/classification-batch/classification-batch.service';
import { syncClassificationEnrichment } from '@/modules/classification-enrichment/jobs/classification-enrichment-sync.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePostReq(body: object, sessionId = 'sess-abc'): NextRequest {
  const req = new NextRequest('http://localhost/api/universe/stocks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  if (sessionId) req.cookies.set('sessionId', sessionId);
  return req;
}

function makeGetReq(ticker: string, sessionId = 'sess-abc'): NextRequest {
  const req = new NextRequest(`http://localhost/api/universe/stocks/${ticker}`);
  if (sessionId) req.cookies.set('sessionId', sessionId);
  return req;
}

async function collectSSE(res: Response): Promise<object[]> {
  const text = await res.text();
  const events: object[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try { events.push(JSON.parse(line.slice(6))); } catch { /* ignore */ }
    }
  }
  return events;
}

const MOCK_STOCK = {
  ticker: 'TSLA',
  company_name: 'Tesla Inc',
  sector: 'Technology',
  market_cap: 1e12,
  current_price: 200,
  revenue_growth_fwd: 0.12,
  eps_growth_fwd: 0.10,
  operating_margin: 0.10,
  fcf_conversion: 0.80,
  net_debt_to_ebitda: 0.2,
  is_active: true,
  active_code: '4AA',
  confidence_level: 'medium',
};

// ── POST /api/universe/stocks ─────────────────────────────────────────────────

describe('EPIC-004/STORY-056: POST /api/universe/stocks', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSession as jest.Mock).mockResolvedValue({ userId: 'user-1' });
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.stock.create as jest.Mock).mockResolvedValue({});
    (prisma.stock.update as jest.Mock).mockResolvedValue({});
    (getUniverseStock as jest.Mock).mockResolvedValue(MOCK_STOCK);
  });

  it('returns 401 when no session cookie', async () => {
    const req = new NextRequest('http://localhost/api/universe/stocks', {
      method: 'POST',
      body: JSON.stringify({ ticker: 'TSLA' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is invalid', async () => {
    (validateSession as jest.Mock).mockResolvedValue(null);
    const res = await POST(makePostReq({ ticker: 'TSLA' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty ticker', async () => {
    const res = await POST(makePostReq({ ticker: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_ticker');
  });

  it('returns 400 for ticker with invalid characters', async () => {
    const res = await POST(makePostReq({ ticker: 'AB$CD' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_ticker' });
  });

  it('returns 409 when stock already in universe', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ticker: 'TSLA', inUniverse: true });
    const res = await POST(makePostReq({ ticker: 'TSLA' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('already_in_universe');
    expect(body.ticker).toBe('TSLA');
  });

  it('streams SSE events for all 8 stages + done on success (new stock)', async () => {
    const res = await POST(makePostReq({ ticker: 'TSLA' }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await collectSSE(res);
    const stages = events.map((e: object) => (e as { stage: string }).stage);

    expect(stages).toContain('validate');
    expect(stages).toContain('create_record');
    expect(stages).toContain('fundamentals');
    expect(stages).toContain('estimates');
    expect(stages).toContain('metrics');
    expect(stages).toContain('flags');
    expect(stages).toContain('enrichment');
    expect(stages).toContain('classification');
    expect(stages).toContain('done');

    const doneEvent = events.find((e: object) => (e as { stage: string }).stage === 'done') as { result: typeof MOCK_STOCK };
    expect(doneEvent?.result).toEqual(MOCK_STOCK);
  });

  it('calls all pipeline services with tickerFilter=TSLA', async () => {
    const res = await POST(makePostReq({ ticker: 'tsla' }));
    await collectSSE(res); // consume stream to let pipeline run
    expect(syncFundamentals).toHaveBeenCalledWith(
      expect.anything(), expect.anything(),
      expect.objectContaining({ tickerFilter: 'TSLA' }),
    );
    expect(syncDeterministicClassificationFlags).toHaveBeenCalledWith({ tickerFilter: 'TSLA' });
    expect(syncClassificationEnrichment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tickerFilter: 'TSLA', mode: 'full' }),
    );
    expect(runClassificationBatch).toHaveBeenCalledWith({ tickerFilter: 'TSLA' });
  });

  it('re-add path: updates inUniverse=true instead of creating when stock exists with inUniverse=false', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ticker: 'TSLA', inUniverse: false });
    const res = await POST(makePostReq({ ticker: 'TSLA' }));
    const events = await collectSSE(res);
    expect(prisma.stock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticker: 'TSLA' },
        data: expect.objectContaining({ inUniverse: true }),
      }),
    );
    expect(prisma.stock.create).not.toHaveBeenCalled();
    const stages = events.map((e: object) => (e as { stage: string }).stage);
    expect(stages).toContain('done');
  });

  it('emits error event when a pipeline stage throws', async () => {
    (syncFundamentals as jest.Mock).mockRejectedValueOnce(new Error('provider timeout'));
    const res = await POST(makePostReq({ ticker: 'TSLA' }));
    const events = await collectSSE(res);
    const errorEvent = events.find((e: object) => (e as { stage: string }).stage === 'error') as { failedStage: string; message: string };
    expect(errorEvent).toBeDefined();
    expect(errorEvent.failedStage).toBe('fundamentals');
    expect(errorEvent.message).toContain('provider timeout');
  });

  it('normalises lowercase ticker to uppercase in pipeline calls', async () => {
    await POST(makePostReq({ ticker: 'nvda' }));
    expect(prisma.stock.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticker: 'NVDA' } }),
    );
  });
});

// ── GET /api/universe/stocks/[ticker] ─────────────────────────────────────────

describe('EPIC-004/STORY-056: GET /api/universe/stocks/[ticker]', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSession as jest.Mock).mockResolvedValue({ userId: 'user-1' });
    (getUniverseStock as jest.Mock).mockResolvedValue(MOCK_STOCK);
  });

  it('returns 401 when no session cookie', async () => {
    const req = new NextRequest('http://localhost/api/universe/stocks/TSLA');
    const res = await GET(req, { params: Promise.resolve({ ticker: 'TSLA' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when stock not found or not in universe', async () => {
    (getUniverseStock as jest.Mock).mockResolvedValue(null);
    const res = await GET(makeGetReq('NVDA'), { params: Promise.resolve({ ticker: 'NVDA' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 200 with stock object for in-universe stock', async () => {
    const res = await GET(makeGetReq('TSLA'), { params: Promise.resolve({ ticker: 'TSLA' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stock).toEqual(MOCK_STOCK);
  });

  it('returns 400 for invalid ticker format', async () => {
    const res = await GET(makeGetReq('T$SLA'), { params: Promise.resolve({ ticker: 'T$SLA' }) });
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/universe/stocks/[ticker] — regression check ──────────────────

describe('EPIC-004/STORY-056: DELETE regression (existing STORY-055 handler still works)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSession as jest.Mock).mockResolvedValue({ userId: 'user-1' });
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ticker: 'TSLA', inUniverse: true });
    (prisma.stock.update as jest.Mock).mockResolvedValue({});
  });

  it('still returns 200 for a valid soft-delete', async () => {
    const req = new NextRequest('http://localhost/api/universe/stocks/TSLA', { method: 'DELETE' });
    req.cookies.set('sessionId', 'sess-abc');
    const res = await DELETE(req, { params: Promise.resolve({ ticker: 'TSLA' }) });
    expect(res.status).toBe(200);
  });
});
