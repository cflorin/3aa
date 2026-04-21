// EPIC-003: Data Ingestion & Universe Management
// STORY-015: Provider Abstraction Layer
// TASK-015-001: VendorAdapter interface — contract all providers must satisfy
// RFC-004 §Provider Abstraction Layer — method signatures
// ADR-001: Multi-provider architecture — provider-agnostic contract

import type {
  UniverseStock,
  PriceData,
  FundamentalData,
  ForwardEstimates,
  StockMetadata,
} from '../types';

export interface ProviderCapabilities {
  /**
   * Coverage level for forward estimate data.
   * 'full' (~85%+ coverage): FMP
   * 'partial' (<50% coverage): Tiingo
   * 'none': provider does not supply forward estimates
   */
  forwardEstimateCoverage: 'full' | 'partial' | 'none';
  rateLimit: {
    /** Sliding-window request limit expressed as requests per hour. */
    requestsPerHour: number;
  };
}

/**
 * Contract that every data provider adapter must implement.
 * All methods return null (not throw) when the provider has no data for the
 * requested ticker or date. Errors (network, auth, rate limit) are thrown.
 */
export interface VendorAdapter {
  /** Stable provider identifier used in provenance records. */
  readonly providerName: 'tiingo' | 'fmp';

  readonly capabilities: ProviderCapabilities;

  /**
   * Returns all stocks with market cap >= minMarketCapMillions.
   * Implementations must normalise market_cap_millions to millions of USD
   * regardless of the raw provider unit (FMP returns full dollars).
   */
  fetchUniverse(minMarketCapMillions: number): Promise<UniverseStock[]>;

  /**
   * Returns end-of-day price for ticker on the given date (defaults to most
   * recent trading day). Returns null if not available.
   */
  fetchEODPrice(ticker: string, date?: Date): Promise<PriceData | null>;

  /**
   * Returns all 15 fundamental fields for ticker. Returns null if the
   * provider has no fundamental data for this ticker.
   */
  fetchFundamentals(ticker: string): Promise<FundamentalData | null>;

  /**
   * Returns forward estimate data for ticker. Returns null if the provider
   * has no forward coverage for this ticker (partial-coverage providers
   * return null frequently — this is not an error).
   */
  fetchForwardEstimates(ticker: string): Promise<ForwardEstimates | null>;

  /**
   * Returns stock metadata (name, sector, industry, exchange, market cap).
   * Returns null if the provider has no metadata for this ticker.
   */
  fetchMetadata(ticker: string): Promise<StockMetadata | null>;
}
