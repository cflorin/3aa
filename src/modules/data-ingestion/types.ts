// EPIC-003: Data Ingestion & Universe Management
// STORY-015: Provider Abstraction Layer
// TASK-015-001: Canonical shared types for the data pipeline
// RFC-004 §Provider Abstraction Layer — canonical type definitions
// ADR-001: Multi-provider — all providers normalise to these types

/**
 * A stock eligible for universe inclusion.
 * market_cap_millions is null when the provider cannot supply it (Tiingo /fundamentals/meta
 * has no marketCap field). The universe sync layer applies the $5bn threshold using
 * whichever provider supplies a non-null value.
 */
export interface UniverseStock {
  ticker: string;
  company_name: string;
  exchange: string;
  market_cap_millions: number | null;
  country: string;
  sector: string | null;
  industry: string | null;
}

/**
 * End-of-day price data for a single ticker on a single date.
 */
export interface PriceData {
  ticker: string;
  date: Date;
  close: number;
}

/**
 * Normalised fundamental metrics across all EPIC-003 fields.
 * All monetary values are in absolute USD unless noted.
 * All ratios are dimensionless decimals (e.g. 0.30 = 30%).
 * RFC-002 defines the canonical column mapping for each field.
 *
 * BC-026-001: earnings_ttm and revenue_ttm are absolute USD throughout the pipeline.
 * FMP adapter previously divided by 1_000_000 — fixed in STORY-026 TASK-026-003.
 */
export interface FundamentalData {
  ticker: string;
  // Growth
  revenue_growth_yoy: number | null;
  eps_growth_yoy: number | null;
  /** 3-year revenue CAGR, percentage (e.g. 12 = 12%). STORY-029. */
  revenue_growth_3y: number | null;
  /** 3-year diluted EPS CAGR, percentage; null when base EPS ≤ 0. STORY-029. */
  eps_growth_3y: number | null;
  /** YoY gross profit growth, percentage (TTM vs prior TTM for Tiingo; FY0 vs FY-1 for FMP). STORY-029. */
  gross_profit_growth: number | null;
  /** 3-year diluted share count CAGR, percentage (FMP only; null from Tiingo). STORY-029. */
  share_count_growth_3y: number | null;
  /** Stored as percentage: 10 = 10% growth. Confirmed format per STORY-021. */
  eps_growth_fwd: number | null;
  /** GAAP diluted EPS for most recent fiscal year — FMP annual epsDiluted. Null for Tiingo. STORY-031. */
  gaapEps: number | null;
  /** Fiscal year end date (ISO string) for gaapEps — e.g. "2024-09-30". Null for Tiingo. STORY-031. */
  gaapEpsFiscalYearEnd: string | null;
  /** Trailing twelve months revenue, absolute USD */
  revenue_ttm: number | null;
  /** Trailing twelve months net income, absolute USD */
  earnings_ttm: number | null;
  // Profitability
  gross_margin: number | null;
  /** LTM operating margin = TTM EBIT / TTM revenue (fixed in STORY-026 Fix 1) */
  operating_margin: number | null;
  /** Net margin = TTM net income / TTM revenue (computed from DataCodes, not overview; fixed in STORY-026 Fix 2) */
  net_margin: number | null;
  /** Return on equity */
  roe: number | null;
  /** Return on assets */
  roa: number | null;
  /** NOPAT / Invested Capital. NOPAT = TTM EBIT × (1 − effective_tax_rate);
   *  IC = equity + debt − cash. Null when IC ≤ 0 (e.g. AAPL buybacks). STORY-030. */
  roic: number | null;
  trailing_pe: number | null;
  /** TTM free cash flow, absolute USD. Null if provider does not supply FCF DataCode at this tier. */
  fcf_ttm: number | null;
  /** TTM EBIT in absolute USD. Used for EV/EBIT and net_debt_to_ebitda computation. */
  ebit_ttm: number | null;
  /** TTM EPS per diluted share. Tiingo: sum of quarterly eps DataCodes. FMP: annual epsDiluted. */
  eps_ttm: number | null;
  // Balance sheet
  /** (total_debt − cash) / EBITDA. Negative when net cash position. Null if data unavailable. */
  net_debt_to_ebitda: number | null;
  /** Total debt, absolute USD */
  total_debt: number | null;
  /** Cash and cash equivalents, absolute USD */
  cash_and_equivalents: number | null;
  /** Debt-to-equity ratio — kept for compatibility; not written to DB after STORY-026 */
  debt_to_equity: number | null;
  current_ratio: number | null;
  interest_coverage: number | null;
}

/**
 * Forward estimate data — raw NTM inputs from the provider (FMP analyst consensus).
 * Ratios (forward_pe, forward_ev_ebit, forward_ev_sales) are computed by
 * syncForwardEstimates() from these inputs + DB stock context (market_cap, price, etc).
 *
 * STORY-028: renamed from forward_pe/forward_ev_ebit; revenue_ntm added.
 * All monetary values in absolute USD (no /1_000_000 division).
 */
export interface ForwardEstimates {
  ticker: string;
  /** NTM EPS $/share — non-GAAP analyst consensus (FMP epsAvg) */
  eps_ntm: number | null;
  /** NTM EBIT in absolute USD — FMP ebitAvg */
  ebit_ntm: number | null;
  /** NTM revenue in absolute USD — FMP estimatedRevenueAvg */
  revenue_ntm: number | null;
  /** Non-GAAP consensus EPS (FMP epsAvg) for the most recently completed fiscal year. STORY-031. */
  nonGaapEpsMostRecentFy: number | null;
  /** Fiscal year end date for nonGaapEpsMostRecentFy — ISO string. STORY-031. */
  nonGaapEpsFiscalYearEnd: string | null;
}

/**
 * Stock-level metadata used to enrich universe entries.
 */
export interface StockMetadata {
  ticker: string;
  company_name: string;
  sector: string | null;
  industry: string | null;
  exchange: string;
  /** Market cap in millions — used by universe sync for the $5B threshold filter */
  market_cap_millions: number | null;
  /** Market cap in absolute USD — used by syncMarketCapAndMultiples() for EV computation */
  market_cap_usd: number | null;
  /** Diluted shares outstanding — from FMP profile; null if provider does not return it */
  shares_outstanding: number | null;
}

/**
 * The result of a single fetchFieldWithFallback call.
 * RFC-004 §FieldResult — provenance shape written to data_provider_provenance JSONB.
 */
export interface FieldResult<T> {
  value: T | null;
  /** Provider that supplied the value, or 'none' if all providers returned null. */
  source_provider: string;
  synced_at: Date;
  /** True if at least one provider was tried and skipped before the successful one. */
  fallback_used: boolean;
}

/**
 * Provenance entry written to stocks.data_provider_provenance per field.
 * The 'computed_trailing' provider is used by syncForwardEstimates when
 * both FMP and Tiingo return null and the safety guardrails are satisfied.
 */
export interface ProvenanceEntry {
  provider: 'tiingo' | 'fmp' | 'computed_trailing' | 'computed' | 'computed_fmp' | 'none';
  /** ISO 8601 string — stored as string, not Date, for JSONB round-trip safety */
  synced_at: string;
  /** Must be boolean, never the string "true"/"false" */
  fallback_used: boolean;
}
