// EPIC-001: Platform Foundation & Deployment
// STORY-007: Configure Cloud Scheduler for Nightly Batch Orchestration
// TASK-007-004: Unit tests for OIDC scheduler token verification

import { verifySchedulerToken } from '../../../src/lib/scheduler-auth';

const VALID_AUDIENCE = 'https://aaa-web-717628686883.us-central1.run.app';
const VALID_EMAIL = 'aaa-scheduler@aa-investor.iam.gserviceaccount.com';

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers['Authorization'] = authHeader;
  return new Request('https://example.com/api/cron/price-sync', {
    method: 'POST',
    headers,
  });
}

describe('EPIC-001/STORY-007/TASK-007-004: verifySchedulerToken', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
  });

  it('skips verification when NODE_ENV is not production', async () => {
    // NODE_ENV is 'test' in Jest — should pass without any Authorization header
    await expect(verifySchedulerToken(makeRequest())).resolves.toBeUndefined();
  });

  it('throws when Authorization header is missing (production)', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    await expect(verifySchedulerToken(makeRequest())).rejects.toThrow(
      'Missing or malformed Authorization header'
    );
  });

  it('throws when Authorization header is not Bearer format (production)', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    await expect(verifySchedulerToken(makeRequest('Basic abc123'))).rejects.toThrow(
      'Missing or malformed Authorization header'
    );
  });

  it('resolves when tokeninfo returns valid payload with correct aud and email', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    process.env.SCHEDULER_AUDIENCE = VALID_AUDIENCE;
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ aud: VALID_AUDIENCE, email: VALID_EMAIL, exp: '9999999999' }),
    } as Response);

    await expect(verifySchedulerToken(makeRequest('Bearer valid.jwt.token'))).resolves.toBeUndefined();
  });

  it('throws when tokeninfo returns non-200', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
    } as Response);

    await expect(verifySchedulerToken(makeRequest('Bearer bad.token'))).rejects.toThrow(
      'Token verification failed'
    );
  });

  it('throws when audience does not match', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    process.env.SCHEDULER_AUDIENCE = VALID_AUDIENCE;
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ aud: 'https://wrong-audience.run.app', email: VALID_EMAIL }),
    } as Response);

    await expect(verifySchedulerToken(makeRequest('Bearer jwt'))).rejects.toThrow(
      'Token audience mismatch'
    );
  });

  it('throws when email does not match expected service account', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    process.env.SCHEDULER_AUDIENCE = VALID_AUDIENCE;
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ aud: VALID_AUDIENCE, email: 'attacker@evil.iam.gserviceaccount.com' }),
    } as Response);

    await expect(verifySchedulerToken(makeRequest('Bearer jwt'))).rejects.toThrow(
      'Unexpected service account'
    );
  });
});
