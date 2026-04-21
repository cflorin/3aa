// EPIC-003: Data Ingestion & Universe Management
// STORY-015: Provider Abstraction Layer
// TASK-015-004: Unit tests — ProviderOrchestrator
// RFC-004 §Provider Abstraction Layer

import { ProviderOrchestrator } from '../../../src/modules/data-ingestion/provider-orchestrator';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';

function makeMockAdapter(
  name: 'tiingo' | 'fmp',
  returnValue: unknown,
  shouldThrow?: Error,
): VendorAdapter {
  const fetchFn = shouldThrow
    ? jest.fn().mockRejectedValue(shouldThrow)
    : jest.fn().mockResolvedValue(returnValue);

  return {
    providerName: name,
    capabilities: {
      forwardEstimateCoverage: 'partial',
      rateLimit: { requestsPerHour: 1000 },
    },
    fetchUniverse: jest.fn(),
    fetchEODPrice: fetchFn,
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

describe('EPIC-003/STORY-015/TASK-015-004: ProviderOrchestrator.fetchFieldWithFallback', () => {
  let orchestrator: ProviderOrchestrator;

  beforeEach(() => {
    orchestrator = new ProviderOrchestrator();
  });

  it('returns primary value with fallback_used=false when primary returns non-null', async () => {
    const primary = makeMockAdapter('tiingo', { close: 150 });
    const secondary = makeMockAdapter('fmp', { close: 148 });

    const result = await orchestrator.fetchFieldWithFallback(
      'AAPL', 'close', [primary, secondary],
      (a) => a.fetchEODPrice('AAPL'),
      { maxAttempts: 1, baseDelayMs: 0 },
    );

    expect(result.value).toEqual({ close: 150 });
    expect(result.source_provider).toBe('tiingo');
    expect(result.fallback_used).toBe(false);
    expect(secondary.fetchEODPrice).not.toHaveBeenCalled();
  });

  it('tries second provider when primary returns null; fallback_used=true', async () => {
    const primary = makeMockAdapter('tiingo', null);
    const secondary = makeMockAdapter('fmp', { close: 148 });

    const result = await orchestrator.fetchFieldWithFallback(
      'AAPL', 'close', [primary, secondary],
      (a) => a.fetchEODPrice('AAPL'),
      { maxAttempts: 1, baseDelayMs: 0 },
    );

    expect(result.value).toEqual({ close: 148 });
    expect(result.source_provider).toBe('fmp');
    expect(result.fallback_used).toBe(true);
  });

  it('returns null result when all providers return null', async () => {
    const primary = makeMockAdapter('tiingo', null);
    const secondary = makeMockAdapter('fmp', null);

    const result = await orchestrator.fetchFieldWithFallback(
      'XYZ', 'close', [primary, secondary],
      (a) => a.fetchEODPrice('XYZ'),
      { maxAttempts: 1, baseDelayMs: 0 },
    );

    expect(result.value).toBeNull();
    expect(result.source_provider).toBe('none');
    expect(result.fallback_used).toBe(true);
  });

  it('returns null result without throwing when providers array is empty', async () => {
    const result = await orchestrator.fetchFieldWithFallback(
      'AAPL', 'close', [],
      (a) => a.fetchEODPrice('AAPL'),
    );

    expect(result.value).toBeNull();
    expect(result.source_provider).toBe('none');
    expect(result.fallback_used).toBe(false);
  });

  it('falls through to next provider when primary throws a non-transient error', async () => {
    const { HttpStatusError } = await import('../../../src/modules/data-ingestion/retry.util');
    const primary = makeMockAdapter('tiingo', null, new HttpStatusError(401, 'Unauthorized'));
    const secondary = makeMockAdapter('fmp', { close: 148 });

    const result = await orchestrator.fetchFieldWithFallback(
      'AAPL', 'close', [primary, secondary],
      (a) => a.fetchEODPrice('AAPL'),
      { maxAttempts: 1, baseDelayMs: 0 },
    );

    expect(result.value).toEqual({ close: 148 });
    expect(result.source_provider).toBe('fmp');
    expect(result.fallback_used).toBe(true);
  });

  it('returns null result when only provider throws (no more providers)', async () => {
    const { HttpStatusError } = await import('../../../src/modules/data-ingestion/retry.util');
    const only = makeMockAdapter('tiingo', null, new HttpStatusError(500, 'Server Error'));

    const result = await orchestrator.fetchFieldWithFallback(
      'AAPL', 'close', [only],
      (a) => a.fetchEODPrice('AAPL'),
      { maxAttempts: 1, baseDelayMs: 0 },
    );

    expect(result.value).toBeNull();
    expect(result.source_provider).toBe('none');
    expect(result.fallback_used).toBe(true);
  });

  it('sets synced_at to a valid Date', async () => {
    const before = new Date();
    const adapter = makeMockAdapter('tiingo', 150);
    const result = await orchestrator.fetchFieldWithFallback(
      'AAPL', 'close', [adapter],
      (a) => a.fetchEODPrice('AAPL'),
      { maxAttempts: 1, baseDelayMs: 0 },
    );
    const after = new Date();

    expect(result.synced_at).toBeInstanceOf(Date);
    expect(result.synced_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.synced_at.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
