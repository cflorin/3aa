// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-077: Valuation Recompute Batch Job
// TASK-077-004: Unit tests — /api/cron/valuation route

jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

jest.mock('@/modules/valuation/valuation-batch.service', () => ({
  runValuationBatch: jest.fn(),
}));

import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { runValuationBatch } from '@/modules/valuation/valuation-batch.service';
import { POST } from '@/app/api/cron/valuation/route';

const mockVerify = verifySchedulerToken as jest.Mock;
const mockBatch = runValuationBatch as jest.Mock;

function makeRequest(url = 'http://localhost/api/cron/valuation') {
  return new Request(url, { method: 'POST' });
}

beforeEach(() => jest.clearAllMocks());

describe('EPIC-005/STORY-077/TASK-077-002: POST /api/cron/valuation', () => {
  it('returns 401 when OIDC token is invalid', async () => {
    mockVerify.mockRejectedValue(new Error('unauthorized'));

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 with summary on success', async () => {
    mockVerify.mockResolvedValue(undefined);
    mockBatch.mockResolvedValue({ total: 50, updated: 40, skipped: 8, errors: 2, duration_ms: 1200 });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(50);
    expect(body.updated).toBe(40);
    expect(body.skipped).toBe(8);
    expect(body.errors).toBe(2);
  });

  it('passes force=true from query param', async () => {
    mockVerify.mockResolvedValue(undefined);
    mockBatch.mockResolvedValue({ total: 10, updated: 10, skipped: 0, errors: 0, duration_ms: 500 });

    await POST(makeRequest('http://localhost/api/cron/valuation?force=true'));

    expect(mockBatch).toHaveBeenCalledWith({ force: true, tickerFilter: undefined });
  });

  it('passes ticker filter from query param', async () => {
    mockVerify.mockResolvedValue(undefined);
    mockBatch.mockResolvedValue({ total: 1, updated: 1, skipped: 0, errors: 0, duration_ms: 100 });

    await POST(makeRequest('http://localhost/api/cron/valuation?ticker=AAPL'));

    expect(mockBatch).toHaveBeenCalledWith({ force: false, tickerFilter: 'AAPL' });
  });

  it('returns 500 when batch throws unexpectedly', async () => {
    mockVerify.mockResolvedValue(undefined);
    mockBatch.mockRejectedValue(new Error('DB connection lost'));

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB connection lost');
  });
});
