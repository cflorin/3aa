// EPIC-003: Data Ingestion & Universe Management
// STORY-019: Price Sync Job
// TASK-019-002: Route unit tests — POST /api/cron/price-sync OIDC auth
// ADR-002: Daily 5pm ET triggered by Cloud Scheduler
// ADR-008: OIDC authentication via verifySchedulerToken()

import { NextRequest } from 'next/server';

jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/jobs/price-sync.service', () => ({
  syncPrices: jest.fn(),
}));

jest.mock('@/modules/data-ingestion/adapters/tiingo.adapter', () => ({
  TiingoAdapter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/modules/data-ingestion/adapters/fmp.adapter', () => ({
  FMPAdapter: jest.fn().mockImplementation(() => ({})),
}));

import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { syncPrices } from '@/modules/data-ingestion/jobs/price-sync.service';
import { POST } from '../../../../src/app/api/cron/price-sync/route';

const mockVerify = verifySchedulerToken as jest.Mock;
const mockSyncPrices = syncPrices as jest.Mock;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/price-sync', { method: 'POST' });
}

describe('EPIC-003/STORY-019: POST /api/cron/price-sync', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 401 and does not call syncPrices when OIDC token is invalid', async () => {
    mockVerify.mockRejectedValue(new Error('Invalid token'));

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockSyncPrices).not.toHaveBeenCalled();
  });

  it('returns 200 with sync summary when OIDC token is valid', async () => {
    mockVerify.mockResolvedValue(undefined);
    mockSyncPrices.mockResolvedValue({
      stocks_updated: 5,
      fallback_count: 1,
      errors: 0,
      fresh_count: 3,
      stale_count: 2,
      missing_count: 0,
      duration_ms: 1200,
    });

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stocks_updated).toBe(5);
    expect(body.fallback_count).toBe(1);
  });
});
