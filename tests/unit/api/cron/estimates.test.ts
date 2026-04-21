// EPIC-003: Data Ingestion & Universe Management
// STORY-021: Forward Estimates Sync Job
// TASK-021-002: Route unit tests — POST /api/cron/estimates OIDC auth
// ADR-002: Daily 7pm ET triggered by Cloud Scheduler
// ADR-008: OIDC authentication via verifySchedulerToken()
// BC-021-002: file did not exist; created to match pattern from STORY-019/STORY-020

import { NextRequest } from 'next/server';

jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/jobs/forward-estimates-sync.service', () => ({
  syncForwardEstimates: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/adapters/tiingo.adapter', () => ({
  TiingoAdapter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/modules/data-ingestion/adapters/fmp.adapter', () => ({
  FMPAdapter: jest.fn().mockImplementation(() => ({})),
}));

import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { syncForwardEstimates } from '@/modules/data-ingestion/jobs/forward-estimates-sync.service';
import { POST } from '../../../../src/app/api/cron/estimates/route';

const mockVerify = verifySchedulerToken as jest.Mock;
const mockSyncForwardEstimates = syncForwardEstimates as jest.Mock;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/estimates', { method: 'POST' });
}

describe('EPIC-003/STORY-021: POST /api/cron/estimates', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 401 and does not call syncForwardEstimates when OIDC token is invalid', async () => {
    mockVerify.mockRejectedValue(new Error('Invalid token'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockSyncForwardEstimates).not.toHaveBeenCalled();
  });

  it('returns 200 with sync summary when OIDC token is valid', async () => {
    mockVerify.mockResolvedValue(undefined);
    mockSyncForwardEstimates.mockResolvedValue({
      stocks_updated: 5,
      provider_count: 3,
      computed_fallback_count: 1,
      no_estimates_count: 1,
      errors: 0,
      fresh_count: 3,
      stale_count: 2,
      missing_count: 0,
      duration_ms: 1500,
    });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stocks_updated).toBe(5);
    expect(body.provider_count).toBe(3);
    expect(body.computed_fallback_count).toBe(1);
    expect(body.no_estimates_count).toBe(1);
  });
});
