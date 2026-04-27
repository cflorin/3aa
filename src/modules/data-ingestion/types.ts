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
  /** Always null from FMP adapter after STORY-032. Authoritative source: ShareCountSyncService (STORY-032).
   *  Was computed from weightedAverageShsOutDil in fetchFundamentals — write path removed in TASK-032-005. */
  share_count_growth_3y: number | null;
  /** Stored as percentage: 10 = 10% growth. Confirmed format per STORY-021. */
  eps_growth_fwd: number | null;
  /** GAAP diluted EPS for most recent fiscal year — FMP annual epsDiluted. Null for Tiingo. STORY-031. */
  gaapEps: number | null;
  /** Fiscal year end date (ISO string) for gaapEps — e.g. "2024-09-30". Null for Tiingo. STORY-031. */
  gaapEpsFiscalYearEnd: string | null;
  /** Date of the most recent quarterly (Tiingo) or annual (FMP) report used for TTM/point-in-time fields.
   *  ISO date string e.g. "2025-12-27". Used to populate period_end in provenance entries. */
  statementPeriodEnd: string | null;
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
  /** GAAP diluted EPS from FMP income statement for the same completed fiscal year as
   *  nonGaapEpsMostRecentFy. Used as the GAAP base in gaapAdjustmentFactor so both sides
   *  of the ratio are from the same source and the same fiscal period (period consistency fix). */
  gaapEpsCompletedFy: number | null;
  /** Non-GAAP consensus net income (FMP netIncomeAvg) for the most recently completed fiscal year. */
  nonGaapEarningsMostRecentFy: number | null;
  /** Non-GAAP consensus net income (FMP netIncomeAvg) for the NTM fiscal year. */
  nonGaapEarningsNtm: number | null;
  /** Fiscal year end date for the NTM (next twelve months) estimates window — ISO string.
   *  e.g. "2026-09-27" for Apple's FY2026. Used as period_end in NTM provenance entries. */
  ntmFiscalYearEnd: string | null;
  /** BUG-DI-002: Revenue for the FY immediately before the NTM entry (consecutive year).
   *  Actuals from income statement if that FY is completed; analyst consensus otherwise.
   *  Used as FY-aligned denominator: (revenueNtm − revenuePreviousFy) / revenuePreviousFy. */
  revenuePreviousFy: number | null;
  /** BUG-DI-002: NonGAAP EPS consensus (FMP epsAvg) for the FY immediately before the NTM entry.
   *  The gaapAdjustmentFactor cancels when applied to both NTM and prevFY, so NonGAAP growth
   *  equals GAAP growth. Used as EPS denominator instead of epsTtm (period-consistent). */
  nonGaapEpsPreviousFy: number | null;
  /** GAAP operating income from FMP income statement for the most recently completed FY.
   *  Used as the numerator of ebitGaapAdjFactor to convert NTM Non-GAAP EBIT to GAAP-equivalent. */
  gaapEbitCompletedFy: number | null;
  /** Non-GAAP EBIT analyst consensus (FMP ebitAvg) for the most recently completed FY.
   *  Used as the denominator of ebitGaapAdjFactor — same period as gaapEbitCompletedFy. */
  nonGaapEbitMostRecentFy: number | null;
  /** STORY-097: NTM EBITDA consensus (FMP ebitdaAvg for the NTM period).
   *  FMP provides this directly; no D&A reconstruction needed.
   *  Used to compute forwardEvEbitda = ev / ebitdaNtm. */
  ebitdaNtm: number | null;
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
  /** Company business description — from FMP profile; null if not returned. STORY-035. */
  description: string | null;
  /** SIC code string (e.g. "6719") — from FMP profile; null if stable tier does not return it (BC-035-001). STORY-035. */
  sicCode: string | null;
  /** Current market price from FMP profile — used by market-cap sync as Tiingo-independent price source. */
  current_price: number | null;
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
  provider: 'tiingo' | 'fmp' | 'computed_trailing' | 'computed' | 'computed_fmp' | 'none' | 'deterministic_heuristic' | 'claude';
  /** ISO 8601 string — stored as string, not Date, for JSONB round-trip safety */
  synced_at: string;
  /** Must be boolean, never the string "true"/"false". Optional for derived/classification fields that have no fallback concept. */
  fallback_used?: boolean;
  /** ISO date string of the statement period the value refers to. Omitted for derived/computed fields. */
  period_end?: string;
  /** ISO date string of the start of the measurement window (e.g. FY-3 date for a 3-year CAGR). STORY-032. */
  period_start?: string;
  /** Derivation method identifier (e.g. "income_statement_cagr", "sic_code", "llm"). */
  method?: string;
  // ── LLM enrichment fields (EPIC-003.1 / STORY-035) ──────────────────────────
  /** LLM model identifier (e.g. "claude-sonnet-4-6"). Set when provider = "claude". */
  model?: string;
  /** 0–1 confidence from LLM response. */
  confidence?: number;
  /** Prompt filename (e.g. "holding-company-flag.md"). */
  prompt_file?: string;
  /** sha256 of raw prompt content, first 8 chars. Changes when prompt is edited. */
  prompt_version?: string;
  /** true when LLM confidence < threshold — flag/score not written to DB. */
  null_decision?: boolean;
  /** true when LLM call threw an error — flag/score not written to DB. */
  error?: boolean;
  /** Error message from thrown LLM error. */
  error_message?: string;
}

/**
 * Provider-agnostic quarterly financial report.
 * Both TiingoAdapter and FMPAdapter return this from fetchQuarterlyStatements.
 * operatingIncome = EBIT: Tiingo DataCode 'ebit'; FMP field 'ebit' (not FMP's 'operatingIncome').
 * STORY-085: replaces Tiingo-specific QuarterlyReport in the quarterly history pipeline.
 */
export interface NormalizedQuarterlyReport {
  date: string;
  fiscalYear: number;
  fiscalQuarter: number;
  revenue: number | null;
  grossProfit: number | null;
  /** EBIT — Tiingo DataCode 'ebit'; FMP field 'ebit'. NOT FMP's narrower 'operatingIncome'. */
  operatingIncome: number | null;
  netIncome: number | null;
  capex: number | null;
  cashFromOperations: number | null;
  freeCashFlow: number | null;
  shareBasedCompensation: number | null;
  depreciationAndAmortization: number | null;
  dilutedSharesOutstanding: number | null;
}

// EPIC-003.1: STORY-039 — E1–E6 qualitative enrichment scores (RFC-001)
// Half-integer precision: values are multiples of 0.5 in range [1.0, 5.0].
// All fields nullable; null means the score has not yet been computed or was below confidence threshold.
export interface ClassificationEnrichmentScores {
  moat_strength_score: number | null;
  pricing_power_score: number | null;
  revenue_recurrence_score: number | null;
  margin_durability_score: number | null;
  capital_intensity_score: number | null;
  qualitative_cyclicality_score: number | null;
}
