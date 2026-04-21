// EPIC-003: Data Ingestion & Universe Management
// STORY-020: Fundamentals Sync Job
// TASK-020-002: Route unit tests — POST /api/cron/fundamentals OIDC auth
// ADR-002: Daily 6pm ET triggered by Cloud Scheduler
// ADR-008: OIDC authentication via verifySchedulerToken()

import { NextRequest } from 'next/server';

jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/jobs/fundamentals-sync.service', () => ({
  syncFundamentals: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/adapters/tiingo.adapter', () => ({
  TiingoAdapter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/modules/data-ingestion/adapters/fmp.adapter', () => ({
  FMPAdapter: jest.fn().mockImplementation(() => ({})),
}));

import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { syncFundamentals } from '@/modules/data-ingestion/jobs/fundamentals-sync.service';
import { POST } from '../../../../src/app/api/cron/fundamentals/route';

const mockVerify = verifySchedulerToken as jest.Mock;
const mockSyncFundamentals = syncFundamentals as jest.Mock;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/fundamentals', { method: 'POST' });
}

describe('EPIC-003/STORY-020: POST /api/cron/fundamentals', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 401 and does not call syncFundamentals when OIDC token is invalid', async () => {
    mockVerify.mockRejectedValue(new Error('Invalid token'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockSyncFundamentals).not.toHaveBeenCalled();
  });

  it('returns 200 with sync summary when OIDC token is valid', async () => {
    mockVerify.mockResolvedValue(undefined);
    mockSyncFundamentals.mockResolvedValue({
      stocks_updated: 3,
      fields_populated: 36,
      fallback_count: 1,
      errors: 0,
      fresh_count: 2,
      stale_count: 1,
      missing_count: 0,
      duration_ms: 2400,
    });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stocks_updated).toBe(3);
    expect(body.fields_populated).toBe(36);
    expect(body.fallback_count).toBe(1);
  });
});
