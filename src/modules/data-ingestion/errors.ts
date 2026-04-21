// EPIC-003: Data Ingestion & Universe Management
// STORY-016: Tiingo Provider Adapter
// TASK-016-001: Custom error types for data ingestion adapters
// RFC-004 §Provider Abstraction Layer — error contracts

/** Thrown when a provider's rate limit is reached for the current window. */
export class RateLimitExceededError extends Error {
  constructor(public readonly provider: string, public readonly resetInMs?: number) {
    super(`Rate limit exceeded for provider: ${provider}`);
    this.name = 'RateLimitExceededError';
  }
}

/** Thrown at adapter construction when a required API key env var is missing. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Thrown when a provider returns 401 Unauthorized or 403 Forbidden.
 * This is a permanent failure — the orchestrator must NOT retry it.
 * isTransientError() returns false for this error type.
 */
export class AuthenticationError extends Error {
  constructor(public readonly provider: string, public readonly status: number) {
    super(`Authentication failed for provider: ${provider} (HTTP ${status})`);
    this.name = 'AuthenticationError';
  }
}
