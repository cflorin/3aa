// EPIC-003: Data Ingestion & Universe Management
// STORY-015: Provider Abstraction Layer
// TASK-015-003: ProviderOrchestrator — multi-provider fallback coordination
// RFC-004 §Provider Abstraction Layer — fetchFieldWithFallback contract
// ADR-001: Provider priority order; fallback only when primary returns null or fails

import type { VendorAdapter } from './ports/vendor-adapter.interface';
import type { FieldResult } from './types';
import { withRetry } from './retry.util';

type ProviderFn<T> = (adapter: VendorAdapter) => Promise<T | null>;

export class ProviderOrchestrator {
  /**
   * Fetches a single field value from an ordered list of providers.
   *
   * Rules (RFC-004 §Provider Abstraction Layer):
   * 1. Providers tried in array order.
   * 2. Each provider call wrapped in withRetry (transient errors retried).
   * 3. First non-null value returned immediately; remaining providers skipped.
   * 4. Provider returns null → move to next provider.
   * 5. Provider throws non-transient error (4xx) → logged, counted as failed, move to next.
   * 6. All providers null or failed → { value: null, source_provider: 'none', fallback_used: true }.
   * 7. Empty providers array → { value: null, source_provider: 'none', fallback_used: false }.
   *
   * fallback_used: true iff at least one provider was attempted and skipped before the successful one.
   */
  async fetchFieldWithFallback<T>(
    ticker: string,
    fieldName: string,
    providers: VendorAdapter[],
    fetchFn: ProviderFn<T>,
    retryOpts?: { maxAttempts?: number; baseDelayMs?: number },
  ): Promise<FieldResult<T>> {
    if (providers.length === 0) {
      return {
        value: null,
        source_provider: 'none',
        synced_at: new Date(),
        fallback_used: false,
      };
    }

    let triedCount = 0;

    for (const provider of providers) {
      try {
        const value = await withRetry(() => fetchFn(provider), retryOpts);

        if (value !== null) {
          return {
            value,
            source_provider: provider.providerName,
            synced_at: new Date(),
            fallback_used: triedCount > 0,
          };
        }

        console.log(JSON.stringify({
          event: 'provider_returned_null',
          ticker,
          fieldName,
          provider: provider.providerName,
        }));
        triedCount++;
      } catch (err) {
        console.error(JSON.stringify({
          event: 'provider_fallback',
          ticker,
          fieldName,
          failedProvider: provider.providerName,
          error: err instanceof Error ? err.message : String(err),
          nextProvider: providers[providers.indexOf(provider) + 1]?.providerName ?? 'none',
        }));
        triedCount++;
      }
    }

    return {
      value: null,
      source_provider: 'none',
      synced_at: new Date(),
      fallback_used: triedCount > 0,
    };
  }
}
