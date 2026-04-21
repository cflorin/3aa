// EPIC-003: Data Ingestion & Universe Management
// STORY-015: Provider Abstraction Layer
// TASK-015-002: Exponential-backoff retry utility
// RFC-004 §Provider Abstraction Layer — retry on 5xx/network, no retry on 4xx
// ADR-001: Retry prevents spurious fallback from transient provider errors

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms. Delay for attempt n = baseDelayMs * 2^n. Default: 1000 */
  baseDelayMs?: number;
}

/**
 * Wraps an HTTP status code as a typed Error so withRetry can inspect it.
 * Adapters must throw HttpStatusError (not a raw Error) for HTTP error responses.
 */
export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

/**
 * Determines whether an error is transient and warrants a retry.
 * HTTP 4xx (client errors including auth failures) are NOT retried.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof HttpStatusError) {
    return error.status >= 500;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('fetch failed')
    );
  }
  return false;
}

/**
 * Wraps fn with exponential-backoff retry.
 *
 * Delay schedule (baseDelayMs = 1000):
 *   attempt 0 fails → wait 1000ms → attempt 1
 *   attempt 1 fails → wait 2000ms → attempt 2
 *   attempt 2 fails → throw
 *
 * Retries on network errors and HTTP 5xx only.
 * Throws immediately on HTTP 4xx (permanent failure).
 * Re-throws the original error after maxAttempts exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isTransientError(err)) {
        throw err;
      }

      if (attempt < maxAttempts - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.log(JSON.stringify({
          event: 'provider_retry',
          attempt: attempt + 1,
          maxAttempts,
          delayMs,
          error: err instanceof Error ? err.message : String(err),
        }));
        await sleep(delayMs);
      }
    }
  }

  console.error(JSON.stringify({
    event: 'provider_retry_exhausted',
    maxAttempts,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }));

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
