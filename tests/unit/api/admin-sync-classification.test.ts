// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-084: Recompute Classification — Admin API & Universe Screen Button
// TASK-084-004: Unit tests — POST /api/admin/sync/classification
// Fixtures: synthetic

import { NextRequest } from 'next/server';

jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));

jest.mock('@/modules/classification-batch/classification-batch.service', () => ({
  runClassificationBatch: jest.fn(),
}));

import { POST } from '@/app/api/admin/sync/classification/route';
import { validateSession } from '@/modules/auth/auth.service';
import { runClassificationBatch } from '@/modules/classification-batch/classification-batch.service';

const mockValidateSession = validateSession as jest.Mock;
const mockRunBatch = runClassificationBatch as jest.Mock;

const MOCK_USER = { id: 'u1', email: 'admin@test.com', role: 'admin', active: true };
const MOCK_SUMMARY = { processed: 5, recomputed: 4, skipped: 1, errors: 0, duration_ms: 120 };

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  const cookies = sessionId ? `sessionId=${sessionId}` : '';
  if (cookies) headers['cookie'] = cookies;
  return new NextRequest('http://localhost/api/admin/sync/classification', {
    method: 'POST',
    headers,
  });
}

describe('EPIC-005/STORY-084/TASK-084-004: POST /api/admin/sync/classification', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('authentication', () => {
    it('returns 401 when no session cookie', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(mockRunBatch).not.toHaveBeenCalled();
    });

    it('returns 401 when session is invalid', async () => {
      mockValidateSession.mockResolvedValue(null);
      const res = await POST(makeRequest('bad-session'));
      expect(res.status).toBe(401);
      expect(mockRunBatch).not.toHaveBeenCalled();
    });
  });

  describe('successful classification', () => {
    beforeEach(() => {
      mockValidateSession.mockResolvedValue(MOCK_USER);
      mockRunBatch.mockResolvedValue(MOCK_SUMMARY);
    });

    it('returns 200 with BatchSummary', async () => {
      const res = await POST(makeRequest('valid-session'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(MOCK_SUMMARY);
    });

    it('calls runClassificationBatch with force=true', async () => {
      await POST(makeRequest('valid-session'));
      expect(mockRunBatch).toHaveBeenCalledWith({ force: true });
    });

    it('response includes all BatchSummary fields', async () => {
      const res = await POST(makeRequest('valid-session'));
      const body = await res.json();
      expect(body).toHaveProperty('processed');
      expect(body).toHaveProperty('recomputed');
      expect(body).toHaveProperty('skipped');
      expect(body).toHaveProperty('errors');
      expect(body).toHaveProperty('duration_ms');
    });
  });

  describe('error handling', () => {
    it('returns 500 when runClassificationBatch throws', async () => {
      mockValidateSession.mockResolvedValue(MOCK_USER);
      mockRunBatch.mockRejectedValue(new Error('DB connection failed'));
      const res = await POST(makeRequest('valid-session'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });
  });
});
