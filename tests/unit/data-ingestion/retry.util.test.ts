// EPIC-003: Data Ingestion & Universe Management
// STORY-015: Provider Abstraction Layer
// TASK-015-004: Unit tests — withRetry utility
// RFC-004 §Provider Abstraction Layer — retry behaviour

import { withRetry, HttpStatusError, isTransientError } from '../../../src/modules/data-ingestion/retry.util';

describe('EPIC-003/STORY-015/TASK-015-004: withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns value on first attempt when fn succeeds immediately', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new HttpStatusError(500, 'Internal Server Error'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on 4xx without retrying', async () => {
    const err = new HttpStatusError(401, 'Unauthorized');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after maxAttempts on persistent 5xx', async () => {
    const err = new HttpStatusError(503, 'Service Unavailable');
    const fn = jest.fn().mockRejectedValue(err);

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    promise.catch(() => {}); // suppress unhandled rejection while timers advance
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff: 100ms then 200ms for baseDelayMs=100', async () => {
    const err = new HttpStatusError(500, 'Error');
    const fn = jest.fn().mockRejectedValue(err);
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    promise.catch(() => {}); // suppress unhandled rejection while timers advance
    await jest.runAllTimersAsync();
    await promise.catch(() => {});

    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(delays).toContain(100);
    expect(delays).toContain(200);
  });

  it('maxAttempts=1: calls fn exactly once; throws on failure without delay', async () => {
    const err = new HttpStatusError(500, 'Error');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxAttempts: 1, baseDelayMs: 100 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on network-level errors (message contains "network")', async () => {
    const networkErr = new Error('network error');
    const fn = jest.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on timeout errors', async () => {
    const timeoutErr = new Error('request timeout');
    const fn = jest.fn()
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok');
  });

  it('does not retry on 403 Forbidden', async () => {
    const err = new HttpStatusError(403, 'Forbidden');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('EPIC-003/STORY-015/TASK-015-004: isTransientError', () => {
  it('returns true for HttpStatusError with status 500', () => {
    expect(isTransientError(new HttpStatusError(500, 'Error'))).toBe(true);
  });

  it('returns true for HttpStatusError with status 503', () => {
    expect(isTransientError(new HttpStatusError(503, 'Unavailable'))).toBe(true);
  });

  it('returns false for HttpStatusError with status 400', () => {
    expect(isTransientError(new HttpStatusError(400, 'Bad Request'))).toBe(false);
  });

  it('returns false for HttpStatusError with status 401', () => {
    expect(isTransientError(new HttpStatusError(401, 'Unauthorized'))).toBe(false);
  });

  it('returns false for HttpStatusError with status 404', () => {
    expect(isTransientError(new HttpStatusError(404, 'Not Found'))).toBe(false);
  });

  it('returns true for Error with "network" in message', () => {
    expect(isTransientError(new Error('network error'))).toBe(true);
  });

  it('returns true for Error with "timeout" in message', () => {
    expect(isTransientError(new Error('request timeout exceeded'))).toBe(true);
  });

  it('returns false for generic Error without network keywords', () => {
    expect(isTransientError(new Error('something went wrong'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientError('a string error')).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});
