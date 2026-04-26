// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-086: Recompute Valuations — Admin API & Universe Screen Button
// TASK-086-004: Unit tests — POST /api/admin/sync/valuation
// Auth: dual-auth — session cookie OR OIDC Bearer token (external callers)
// Fixtures: synthetic

import { NextRequest } from 'next/server';

jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));

jest.mock('@/modules/valuation/valuation-batch.service', () => ({
  runValuationBatch: jest.fn(),
}));

jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

import { POST } from '@/app/api/admin/sync/valuation/route';
import { validateSession } from '@/modules/auth/auth.service';
import { runValuationBatch } from '@/modules/valuation/valuation-batch.service';
import { verifySchedulerToken } from '@/lib/scheduler-auth';

const mockValidateSession  = validateSession as jest.Mock;
const mockRunBatch         = runValuationBatch as jest.Mock;
const mockVerifyScheduler  = verifySchedulerToken as jest.Mock;

const MOCK_USER    = { id: 'u1', email: 'admin@test.com', role: 'admin', active: true };
const MOCK_SUMMARY = { total: 15, updated: 12, skipped: 2, errors: 1, duration_ms: 340 };

function makeRequest(opts: {
  sessionId?: string;
  bearerToken?: string;
  params?: Record<string, string>;
} = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.sessionId) headers['cookie'] = `sessionId=${opts.sessionId}`;
  if (opts.bearerToken) headers['authorization'] = `Bearer ${opts.bearerToken}`;

  const url = new URL('http://localhost/api/admin/sync/valuation');
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: 'POST', headers });
}

describe('EPIC-005/STORY-086/TASK-086-004: POST /api/admin/sync/valuation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: scheduler token verification fails (not a scheduler call)
    mockVerifyScheduler.mockRejectedValue(new Error('No bearer token'));
  });

  // ── Authentication ────────────────────────────────────────────────────────────

  describe('authentication — session cookie', () => {
    it('returns 401 when no cookie and no bearer token', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(mockRunBatch).not.toHaveBeenCalled();
    });

    it('returns 401 when session cookie is invalid and no bearer token', async () => {
      mockValidateSession.mockResolvedValue(null);
      const res = await POST(makeRequest({ sessionId: 'bad-session' }));
      expect(res.status).toBe(401);
      expect(mockRunBatch).not.toHaveBeenCalled();
    });

    it('proceeds when session cookie is valid', async () => {
      mockValidateSession.mockResolvedValue(MOCK_USER);
      mockRunBatch.mockResolvedValue(MOCK_SUMMARY);
      const res = await POST(makeRequest({ sessionId: 'valid-session' }));
      expect(res.status).toBe(200);
    });
  });

  describe('authentication — OIDC bearer token (external callers)', () => {
    it('proceeds when bearer token passes verifySchedulerToken', async () => {
      mockVerifyScheduler.mockResolvedValue(undefined);
      mockRunBatch.mockResolvedValue(MOCK_SUMMARY);
      const res = await POST(makeRequest({ bearerToken: 'valid-oidc-token' }));
      expect(res.status).toBe(200);
      expect(mockRunBatch).toHaveBeenCalled();
    });

    it('returns 401 when bearer token fails verification', async () => {
      mockVerifyScheduler.mockRejectedValue(new Error('Invalid token'));
      const res = await POST(makeRequest({ bearerToken: 'bad-token' }));
      expect(res.status).toBe(401);
      expect(mockRunBatch).not.toHaveBeenCalled();
    });
  });

  // ── Successful recompute ──────────────────────────────────────────────────────

  describe('successful valuation recompute', () => {
    beforeEach(() => {
      mockValidateSession.mockResolvedValue(MOCK_USER);
      mockRunBatch.mockResolvedValue(MOCK_SUMMARY);
    });

    it('returns 200 with ValuationBatchSummary', async () => {
      const res = await POST(makeRequest({ sessionId: 'valid-session' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(MOCK_SUMMARY);
    });

    it('calls runValuationBatch with force=true by default', async () => {
      await POST(makeRequest({ sessionId: 'valid-session' }));
      expect(mockRunBatch).toHaveBeenCalledWith({ force: true, tickerFilter: undefined });
    });

    it('passes ?force=false when explicitly set', async () => {
      await POST(makeRequest({ sessionId: 'valid-session', params: { force: 'false' } }));
      expect(mockRunBatch).toHaveBeenCalledWith({ force: false, tickerFilter: undefined });
    });

    it('passes ?ticker filter to runValuationBatch', async () => {
      await POST(makeRequest({ sessionId: 'valid-session', params: { ticker: 'AAPL' } }));
      expect(mockRunBatch).toHaveBeenCalledWith({ force: true, tickerFilter: 'AAPL' });
    });

    it('response includes all ValuationBatchSummary fields', async () => {
      const res = await POST(makeRequest({ sessionId: 'valid-session' }));
      const body = await res.json();
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('updated');
      expect(body).toHaveProperty('skipped');
      expect(body).toHaveProperty('errors');
      expect(body).toHaveProperty('duration_ms');
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 when runValuationBatch throws', async () => {
      mockValidateSession.mockResolvedValue(MOCK_USER);
      mockRunBatch.mockRejectedValue(new Error('DB connection failed'));
      const res = await POST(makeRequest({ sessionId: 'valid-session' }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });
  });
});
