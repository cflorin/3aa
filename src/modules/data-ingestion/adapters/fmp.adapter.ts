// EPIC-003: Data Ingestion & Universe Management
// STORY-017: FMP Provider Adapter
// TASK-017-001 through TASK-017-004: FMPAdapter — full implementation
// RFC-004 §FMPAdapter — 250 req/min sliding window; ConfigurationError on missing key
// ADR-001: FMP primary for forward estimates (partial coverage at this plan tier)
//
// Baseline conflicts (documented per STORY-017 spec):
// - forwardEstimateCoverage: 'partial' — RFC-004/ADR-001 assumed 'full'; small/mid caps return 402
// - fetchUniverse: returns [] — screener endpoint returns 402 at this plan tier; universe sourced from Tiingo
// - forward_pe stores raw epsAvg ($); forward_ev_ebit stores ebitAvg in millions — not ratios
// - All v3 endpoints deprecated; this adapter uses https://financialmodelingprep.com/stable

import type { VendorAdapter, ProviderCapabilities } from '../ports/vendor-adapter.interface';
import type {
  UniverseStock,
  PriceData,
  FundamentalData,
  ForwardEstimates,
  StockMetadata,
} from '../types';
import {
  ConfigurationError,
  RateLimitExceededError,
  AuthenticationError,
} from '../errors';
import { HttpStatusError } from '../retry.util';

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
// FMP rate limit: 250 requests per minute (standard plan)
const RATE_LIMIT_REQUESTS_PER_MINUTE = 250;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

export class FMPAdapter implements VendorAdapter {
  readonly providerName = 'fmp' as const;

  readonly capabilities: ProviderCapabilities = {
    // RFC-004/ADR-001 assumed 'full' (~85% coverage); actual: small/mid caps return 402 on this plan
    forwardEstimateCoverage: 'partial',
    rateLimit: {
      // Expressed per-hour for the interface; internal enforcement is per-minute
      requestsPerHour: RATE_LIMIT_REQUESTS_PER_MINUTE * 60,
    },
  };

  private readonly apiKey: string;
  // Sliding-window rate limiter: timestamps of outbound requests in current window
  private requestTimestamps: number[] = [];

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.FMP_API_KEY;
    if (!key || key.trim() === '') {
      throw new ConfigurationError(
        'FMPAdapter: FMP_API_KEY environment variable is required and must not be empty',
      );
    }
    this.apiKey = key;
  }

  /**
   * Enforces the 250 req/min sliding-window rate limit.
   * Must be called before every outbound HTTP request.
   */
  private enforceRateLimit(): void {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Discard timestamps outside the current 1-minute window
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);

    if (this.requestTimestamps.length >= RATE_LIMIT_REQUESTS_PER_MINUTE) {
      const oldestInWindow = this.requestTimestamps[0];
      const resetInMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
      throw new RateLimitExceededError('fmp', resetInMs);
    }

    this.requestTimestamps.push(now);
  }

  /**
   * Shared fetch helper. Appends apikey as query param (FMP convention — NOT Authorization header).
   * Logs path only — key never appears in log output.
   * 401/403 → AuthenticationError; 402 → null (plan restriction); 404 → null; non-2xx → HttpStatusError.
   */
  protected async fmpFetch(path: string): Promise<unknown> {
    this.enforceRateLimit();

    // API key appended as query param per FMP convention — log path without key
    const separator = path.includes('?') ? '&' : '?';
    const url = `${FMP_BASE_URL}${path}${separator}apikey=${this.apiKey}`;

    console.log(JSON.stringify({
      event: 'fmp_request',
      path,
    }));

    const response = await fetch(url);

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError('fmp', response.status);
    }

    if (response.status === 402) {
      // Plan restriction — this ticker or endpoint requires a premium subscription
      console.log(JSON.stringify({
        event: 'fmp_plan_restriction',
        path,
      }));
      return null;
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new HttpStatusError(
        response.status,
        `FMP API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * FMP screener endpoint is not available on this plan tier (returns 402).
   * Returns empty array; universe is sourced from Tiingo.
   * Documented baseline conflict: RFC-004 assumed FMP can filter universe by market cap.
   */
  async fetchUniverse(_minMarketCapMillions: number): Promise<UniverseStock[]> {
    console.warn(JSON.stringify({
      event: 'fmp_universe_unavailable',
      reason: 'screener_not_available_on_plan',
    }));
    return [];
  }

  /**
   * Fetches end-of-day price for ticker.
   * FMP stable endpoint: GET /stable/historical-price-eod/full?symbol={ticker}
   * Returns flat array sorted descending — first element is most recent.
   * NOTE: response is a flat array, NOT {historical: [...]} nested object.
   */
  async fetchEODPrice(ticker: string, date?: Date): Promise<PriceData | null> {
    let path = `/historical-price-eod/full?symbol=${encodeURIComponent(ticker)}`;

    if (date) {
      const dateStr = date.toISOString().split('T')[0];
      path += `&from=${dateStr}&to=${dateStr}`;
    }

    const raw = await this.fmpFetch(path);

    if (raw === null) return null;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    // FMP returns flat array sorted descending — first element is most recent
    const latest = raw[0] as Record<string, unknown>;
    const close = Number(latest.close);
    if (isNaN(close)) return null;

    return {
      ticker,
      date: new Date(String(latest.date)),
      close,
    };
  }

  /**
   * Fetches fundamentals by merging annual income statement and balance sheet.
   * Two parallel FMP calls; most recent entry (index 0) is latest fiscal year.
   * BC-026-001: revenue_ttm and earnings_ttm returned as absolute USD (not divided by 1_000_000).
   * STORY-029: limit=5 for 3-year CAGR (index 0 vs index 3).
   */
  async fetchFundamentals(ticker: string): Promise<FundamentalData | null> {
    const encoded = encodeURIComponent(ticker);

    const [incomeRaw, balanceRaw] = await Promise.all([
      this.fmpFetch(`/income-statement?symbol=${encoded}&period=annual&limit=5`) as Promise<Record<string, unknown>[] | null>,
      this.fmpFetch(`/balance-sheet-statement?symbol=${encoded}&period=annual&limit=2`) as Promise<Record<string, unknown>[] | null>,
    ]);

    if (!Array.isArray(incomeRaw) || incomeRaw.length === 0) return null;

    // FMP arrays sorted descending — index 0 = latest, index 1 = prior year
    const latest = incomeRaw[0];
    const prior = incomeRaw.length > 1 ? incomeRaw[1] : null;

    const revenue = Number(latest.revenue) || null;
    const netIncome = latest.netIncome != null ? Number(latest.netIncome) : null;
    const grossProfit = Number(latest.grossProfit) || null;
    const operatingIncome = latest.operatingIncome != null ? Number(latest.operatingIncome) : null;
    const ebit = latest.ebit != null ? Number(latest.ebit) : null;
    const interestExpense = latest.interestExpense != null ? Number(latest.interestExpense) : null;
    const epsDiluted = latest.epsDiluted != null ? Number(latest.epsDiluted) : null;
    // STORY-030: tax fields for NOPAT computation
    const incomeTax = latest.incomeTaxExpense != null ? Number(latest.incomeTaxExpense) : null;
    const pretaxIncome = latest.incomeBeforeTax != null ? Number(latest.incomeBeforeTax) : null;

    const priorRevenue = prior ? (Number(prior.revenue) || null) : null;
    const priorEpsDiluted = prior && prior.epsDiluted != null ? Number(prior.epsDiluted) : null;
    const priorGrossProfit = prior ? (Number(prior.grossProfit) || null) : null;

    // YoY growth using epsDiluted (not netIncome — share count changes distort the latter)
    const revenueGrowthYoy =
      revenue !== null && priorRevenue !== null && priorRevenue !== 0
        ? ((revenue - priorRevenue) / Math.abs(priorRevenue)) * 100
        : null;
    const epsGrowthYoy =
      epsDiluted !== null && priorEpsDiluted !== null && priorEpsDiluted !== 0
        ? ((epsDiluted - priorEpsDiluted) / Math.abs(priorEpsDiluted)) * 100
        : null;

    // YoY gross profit growth: FY0 vs FY-1
    const grossProfitGrowth =
      grossProfit !== null && priorGrossProfit !== null && priorGrossProfit !== 0
        ? ((grossProfit - priorGrossProfit) / Math.abs(priorGrossProfit)) * 100
        : null;

    // 3-year CAGRs: index 0 (latest) vs index 3 (3 years ago); needs at least 4 entries
    // CAGR formula: (end/start)^(1/3) - 1) * 100; null when start ≤ 0 or end ≤ 0
    const threeYearsAgo = incomeRaw.length >= 4 ? incomeRaw[3] : null;
    const cagrPercent = (end: number | null, start: number | null): number | null => {
      if (end == null || start == null || start <= 0 || end <= 0) return null;
      return (Math.pow(end / start, 1 / 3) - 1) * 100;
    };

    const rev3 = threeYearsAgo ? (Number(threeYearsAgo.revenue) || null) : null;
    const eps3 = threeYearsAgo && threeYearsAgo.epsDiluted != null
      ? Number(threeYearsAgo.epsDiluted) : null;
    const shares0 = latest.weightedAverageShsOutDil != null
      ? Number(latest.weightedAverageShsOutDil) : null;
    const shares3 = threeYearsAgo && threeYearsAgo.weightedAverageShsOutDil != null
      ? Number(threeYearsAgo.weightedAverageShsOutDil) : null;

    const revenueGrowth3y = cagrPercent(revenue, rev3);
    const epsGrowth3y = cagrPercent(epsDiluted, eps3);
    const shareCountGrowth3y = cagrPercent(shares0, shares3);

    const grossMargin = revenue && grossProfit !== null ? grossProfit / revenue : null;
    const operatingMargin = revenue && operatingIncome !== null ? operatingIncome / revenue : null;
    const netMargin = revenue && netIncome !== null ? netIncome / revenue : null;
    // Interest coverage uses ebit (not operatingIncome — more conservative and standard)
    const interestCoverage =
      ebit !== null && interestExpense !== null && interestExpense !== 0
        ? ebit / interestExpense
        : null;

    // Balance sheet fields — all null if balance sheet unavailable (partial result is valid)
    const latestBalance =
      Array.isArray(balanceRaw) && balanceRaw.length > 0 ? balanceRaw[0] : null;

    const equity = latestBalance && latestBalance.totalStockholdersEquity != null
      ? Number(latestBalance.totalStockholdersEquity) : null;
    const totalAssets = latestBalance && latestBalance.totalAssets != null
      ? Number(latestBalance.totalAssets) : null;
    const totalDebt = latestBalance && latestBalance.totalDebt != null
      ? Number(latestBalance.totalDebt) : null;
    const cashAndEquivalents = latestBalance && latestBalance.cashAndCashEquivalents != null
      ? Number(latestBalance.cashAndCashEquivalents) : null;
    const currentAssets = latestBalance && latestBalance.totalCurrentAssets != null
      ? Number(latestBalance.totalCurrentAssets) : null;
    const currentLiabilities = latestBalance && latestBalance.totalCurrentLiabilities != null
      ? Number(latestBalance.totalCurrentLiabilities) : null;

    const roe = equity !== null && equity !== 0 && netIncome !== null ? netIncome / equity : null;
    const roa = totalAssets !== null && totalAssets !== 0 && netIncome !== null ? netIncome / totalAssets : null;
    // STORY-030: ROIC = NOPAT / Invested Capital
    // effective_tax_rate = incomeTax / pretaxIncome, clamped [0, 0.50]; 25% fallback on loss year
    const effectiveTaxRate =
      pretaxIncome != null && pretaxIncome > 0 && incomeTax != null && incomeTax >= 0
        ? Math.min(incomeTax / pretaxIncome, 0.50)
        : 0.25;
    const nopat = ebit != null ? ebit * (1 - effectiveTaxRate) : null;
    const investedCapital =
      equity !== null && totalDebt !== null && cashAndEquivalents !== null
        ? equity + totalDebt - cashAndEquivalents
        : equity !== null && totalDebt !== null
          ? equity + totalDebt
          : null;
    const roic =
      nopat !== null && investedCapital !== null && investedCapital > 0
        ? nopat / investedCapital
        : null;
    const debtToEquity = equity !== null && equity !== 0 && totalDebt !== null
      ? totalDebt / equity : null;
    const currentRatio = currentLiabilities !== null && currentLiabilities !== 0 && currentAssets !== null
      ? currentAssets / currentLiabilities : null;

    return {
      ticker,
      revenue_ttm: revenue,           // BC-026-001: absolute USD (was /1_000_000)
      earnings_ttm: netIncome,        // BC-026-001: absolute USD (was /1_000_000)
      revenue_growth_yoy: revenueGrowthYoy,
      eps_growth_yoy: epsGrowthYoy,
      revenue_growth_3y: revenueGrowth3y,
      eps_growth_3y: epsGrowth3y,
      gross_profit_growth: grossProfitGrowth,
      share_count_growth_3y: shareCountGrowth3y,
      eps_growth_fwd: null,           // Set by estimates sync
      gross_margin: grossMargin,
      operating_margin: operatingMargin,
      net_margin: netMargin,
      roe,
      roa,
      roic,
      trailing_pe: null,              // Not available from income/balance sheet
      fcf_ttm: null,                  // Not available without cash flow statement endpoint
      ebit_ttm: ebit ?? operatingIncome ?? null, // ebit preferred; operatingIncome ≈ EBIT when absent
      eps_ttm: epsDiluted,            // Annual diluted EPS (not TTM; best available from annual endpoint)
      gaapEps: epsDiluted,            // STORY-031: GAAP diluted EPS — same value; exposed for adjustment factor
      gaapEpsFiscalYearEnd: String(latest.date), // STORY-031: FY end date for date-matching
      net_debt_to_ebitda: null,       // Tiingo handles; FMP fallback returns null
      total_debt: totalDebt,          // Fix 6: from balance sheet totalDebt
      cash_and_equivalents: cashAndEquivalents, // Fix 6: from balance sheet cashAndCashEquivalents
      debt_to_equity: debtToEquity,
      current_ratio: currentRatio,
      interest_coverage: interestCoverage,
    };
  }

  /**
   * Fetches forward estimates from FMP analyst-estimates endpoint.
   * Selects NTM entry: first fiscal year end after today, or most recent past entry as fallback.
   *
   * STORY-028: Returns raw NTM inputs in absolute USD; ratios computed by syncForwardEstimates().
   * - eps_ntm: NTM EPS $/share (FMP epsAvg)
   * - ebit_ntm: NTM EBIT in absolute USD (FMP ebitAvg — no /1_000_000)
   * - revenue_ntm: NTM revenue in absolute USD (FMP estimatedRevenueAvg — no /1_000_000)
   */
  async fetchForwardEstimates(ticker: string): Promise<ForwardEstimates | null> {
    const raw = await this.fmpFetch(
      `/analyst-estimates?symbol=${encodeURIComponent(ticker)}&period=annual`,
    ) as Record<string, unknown>[] | null;

    if (!Array.isArray(raw) || raw.length === 0) {
      return null;
    }

    // FMP returns all estimates sorted descending. Sort ascending to find NTM.
    const today = new Date();
    const sorted = [...raw].sort((a, b) => {
      return new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime();
    });

    // NTM = first entry with fiscal year end after today; fallback to most recent past entry
    const ntmEntry =
      sorted.find((entry) => new Date(String(entry.date)) > today) ??
      sorted[sorted.length - 1];

    if (!ntmEntry) return null;

    const epsNtm = ntmEntry.epsAvg != null ? Number(ntmEntry.epsAvg) : null;
    const ebitNtm = ntmEntry.ebitAvg != null ? Number(ntmEntry.ebitAvg) : null;
    const revenueNtm = ntmEntry.estimatedRevenueAvg != null ? Number(ntmEntry.estimatedRevenueAvg) : null;

    // Return null if no estimate data available from any field
    if (epsNtm === null && ebitNtm === null && revenueNtm === null) return null;

    // STORY-031: Most recently completed FY = last sorted entry with date ≤ today
    const mostRecentCompletedFy = sorted.filter(e => new Date(String(e.date)) <= today).at(-1) ?? null;
    const nonGaapEpsMostRecentFy = mostRecentCompletedFy?.epsAvg != null
      ? Number(mostRecentCompletedFy.epsAvg) : null;
    const nonGaapEpsFiscalYearEnd = mostRecentCompletedFy ? String(mostRecentCompletedFy.date) : null;

    console.log(JSON.stringify({
      event: 'fmp_forward_estimates_fetched',
      ticker,
      ntm_date: String(ntmEntry.date),
      num_analysts: ntmEntry.numAnalystsEps ?? null,
    }));

    return {
      ticker,
      eps_ntm: epsNtm,
      ebit_ntm: ebitNtm,
      revenue_ntm: revenueNtm,
      nonGaapEpsMostRecentFy,
      nonGaapEpsFiscalYearEnd,
    };
  }

  /**
   * Fetches stock metadata from the FMP profile endpoint.
   * FMP stable: GET /stable/profile?symbol={ticker}
   * Returns array with one element; mktCap in full dollars — convert to millions.
   */
  async fetchMetadata(ticker: string): Promise<StockMetadata | null> {
    const raw = await this.fmpFetch(`/profile?symbol=${encodeURIComponent(ticker)}`);

    if (raw === null) return null;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const item = raw[0] as Record<string, unknown>;

    return {
      ticker: String(item.symbol ?? ticker),
      company_name: String(item.companyName ?? ticker),
      sector: item.sector ? String(item.sector) : null,
      industry: item.industry ? String(item.industry) : null,
      exchange: String(item.exchange ?? ''),
      market_cap_millions: item.marketCap != null ? Number(item.marketCap) / 1_000_000 : null,
      market_cap_usd: item.marketCap != null ? Number(item.marketCap) : null,
      shares_outstanding: item.sharesOutstanding != null ? Number(item.sharesOutstanding) : null,
    };
  }
}
