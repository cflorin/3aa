// EPIC-003: Data Ingestion & Universe Management
// STORY-016: Tiingo Provider Adapter
// RFC-004 §TiingoAdapter — 1,000 req/hr sliding window
// ADR-001: Tiingo primary for prices and fundamentals
//
// Baseline conflicts (documented per STORY-016 spec):
// - forwardEstimateCoverage: 'none' — /tiingo/fundamentals/{t}/overview returns 404 at this API tier
// - market_cap_millions: null — /tiingo/fundamentals/meta has no marketCap field

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

const TIINGO_BASE_URL = 'https://api.tiingo.com';
const RATE_LIMIT_REQUESTS_PER_HOUR = 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type DataCodeEntry = { dataCode: string; value: number };
type DataCodeMap = Record<string, number>;

function toMap(arr: DataCodeEntry[]): DataCodeMap {
  return Object.fromEntries(arr.map(x => [x.dataCode, x.value]));
}

type QuarterlyReport = {
  date: string;
  year: number;
  quarter: number;
  statementData: {
    incomeStatement: DataCodeEntry[];
    balanceSheet: DataCodeEntry[];
    overview: DataCodeEntry[];
    cashFlow?: DataCodeEntry[];
  };
};

export class TiingoAdapter implements VendorAdapter {
  readonly providerName = 'tiingo' as const;

  readonly capabilities: ProviderCapabilities = {
    // forward estimates endpoint returns 404 at this API tier — verified 2026-04-20
    forwardEstimateCoverage: 'none',
    rateLimit: { requestsPerHour: RATE_LIMIT_REQUESTS_PER_HOUR },
  };

  private readonly apiKey: string;
  private requestTimestamps: number[] = [];

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.TIINGO_API_KEY;
    if (!key || key.trim() === '') {
      throw new ConfigurationError(
        'TiingoAdapter: TIINGO_API_KEY is required and must not be empty',
      );
    }
    this.apiKey = key;
  }

  private enforceRateLimit(): void {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > windowStart);
    if (this.requestTimestamps.length >= RATE_LIMIT_REQUESTS_PER_HOUR) {
      const resetInMs = this.requestTimestamps[0] + RATE_LIMIT_WINDOW_MS - now;
      throw new RateLimitExceededError('tiingo', resetInMs);
    }
    this.requestTimestamps.push(now);
  }

  protected async tiingoFetch(path: string): Promise<unknown> {
    this.enforceRateLimit();
    console.log(JSON.stringify({ event: 'tiingo_request', path }));
    const response = await fetch(`${TIINGO_BASE_URL}${path}`, {
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError('tiingo', response.status);
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new HttpStatusError(
        response.status,
        `Tiingo API error: ${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * Fetches active US stocks from /tiingo/fundamentals/meta.
   * market_cap_millions is always null — not available from this endpoint.
   * minMarketCapMillions parameter is accepted but cannot be applied here;
   * market cap filtering is deferred to the universe sync layer.
   */
  async fetchUniverse(_minMarketCapMillions: number): Promise<UniverseStock[]> {
    const raw = await this.tiingoFetch('/tiingo/fundamentals/meta');

    if (!Array.isArray(raw)) {
      console.error(JSON.stringify({ event: 'tiingo_universe_unexpected_shape', received: typeof raw }));
      return [];
    }

    const items = raw as Record<string, unknown>[];
    const stocks: UniverseStock[] = [];

    for (const item of items) {
      if (!item.isActive) continue;
      const location = String(item.location ?? '');
      if (!location.endsWith(', USA')) continue;

      stocks.push({
        ticker: String(item.ticker),
        company_name: String(item.name ?? item.ticker),
        exchange: '',
        market_cap_millions: null,
        country: 'US',
        sector: item.sector ? String(item.sector) : null,
        industry: item.industry ? String(item.industry) : null,
      });
    }

    console.log(JSON.stringify({
      event: 'tiingo_universe_fetched',
      total_raw: items.length,
      qualifying: stocks.length,
    }));

    return stocks;
  }

  async fetchEODPrice(ticker: string, date?: Date): Promise<PriceData | null> {
    let path = `/tiingo/daily/${encodeURIComponent(ticker)}/prices`;
    if (date) {
      const dateStr = date.toISOString().split('T')[0];
      path += `?startDate=${dateStr}&endDate=${dateStr}`;
    }

    const raw = await this.tiingoFetch(path);
    if (raw === null) return null;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const latest = raw[raw.length - 1] as Record<string, unknown>;
    const close = Number(latest.close);
    if (isNaN(close)) return null;

    return { ticker, date: new Date(String(latest.date)), close };
  }

  /**
   * Fetches fundamental statements from /tiingo/fundamentals/{ticker}/statements.
   * Response is an array of quarterly reports sorted newest-first, each with
   * statementData sections as {dataCode, value}[] arrays — not nested objects.
   * trailing_pe is always null (not available from this endpoint).
   *
   * STORY-026 fixes applied:
   *   Fix 1 — operating_margin: TTM EBIT / TTM revenue (was single-quarter)
   *   Fix 2 — net_margin: TTM netinc / TTM revenue (not overview.profitMargin DataCode bug)
   *   Fix 3 — fcf_ttm: from cashFlow.freeCashFlow DataCode if available; null if not at this tier
   *   Fix 4 — net_debt_to_ebitda: (debt − cash) / EBITDA; depamor DataCode used if present
   *   Fix 5 — interest_coverage: TTM EBIT / TTM intexp (was single-quarter; null if no intexp)
   * STORY-029: gross_profit_growth (TTM vs prior TTM); revenue_growth_3y/eps_growth_3y (16Q window).
   */
  async fetchFundamentals(ticker: string): Promise<FundamentalData | null> {
    const raw = await this.tiingoFetch(
      `/tiingo/fundamentals/${encodeURIComponent(ticker)}/statements`,
    );

    if (raw === null) return null;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    // Filter out annual summary rows (quarter === 0); keep only quarterly entries (quarter 1–4).
    // Tiingo interleaves annual summaries (quarter=0) with quarterly rows — summing them
    // would double-count a full fiscal year into the TTM window.
    const quarters = (raw as QuarterlyReport[]).filter(q => q.quarter !== 0);

    // Newest first: TTM = first 4, prior year = next 4
    const ttmQ = quarters.slice(0, 4);
    const priorQ = quarters.slice(4, 8);

    const sumIncome = (qs: QuarterlyReport[], field: string) =>
      qs.reduce((s, q) => s + (toMap(q.statementData.incomeStatement)[field] ?? 0), 0);

    const sumCashFlow = (qs: QuarterlyReport[], field: string) =>
      qs.reduce((s, q) => {
        const cf = q.statementData.cashFlow;
        return s + ((cf && cf.length > 0 ? toMap(cf)[field] : null) ?? 0);
      }, 0);

    // TTM sums from income statement DataCodes
    const ttmRevenue   = sumIncome(ttmQ, 'revenue');
    const ttmEarnings  = sumIncome(ttmQ, 'netinc');
    const ttmEps       = sumIncome(ttmQ, 'eps');
    const ttmEbit      = sumIncome(ttmQ, 'ebit');
    const ttmIntExp    = sumIncome(ttmQ, 'intexp');
    // STORY-030: tax DataCodes for NOPAT/IC ROIC formula
    const ttmTaxExp    = sumIncome(ttmQ, 'taxExp');
    const ttmPretaxInc = sumIncome(ttmQ, 'pretaxinc');
    // depamor adds D&A to EBIT to get EBITDA; if DataCode absent the sum stays 0
    const ttmDepAmor   = sumIncome(ttmQ, 'depamor');

    const priorRevenue = sumIncome(priorQ, 'revenue');
    const priorEps     = sumIncome(priorQ, 'eps');

    const revenueGrowthYoy = priorQ.length >= 4 && priorRevenue !== 0
      ? ((ttmRevenue - priorRevenue) / Math.abs(priorRevenue)) * 100
      : null;
    const epsGrowthYoy = priorQ.length >= 4 && priorEps !== 0
      ? ((ttmEps - priorEps) / Math.abs(priorEps)) * 100
      : null;

    // STORY-029: gross_profit_growth = (TTM grossProfit - prior TTM grossProfit) / |prior| * 100
    const ttmGrossProfit  = sumIncome(ttmQ, 'grossProfit');
    const priorGrossProfit = sumIncome(priorQ, 'grossProfit');
    const hasGrossProfit = ttmQ.some(q => toMap(q.statementData.incomeStatement)['grossProfit'] != null);
    const grossProfitGrowth =
      hasGrossProfit && priorGrossProfit !== 0 && priorQ.length >= 4
        ? ((ttmGrossProfit - priorGrossProfit) / Math.abs(priorGrossProfit)) * 100
        : null;

    // STORY-029: 3-year CAGRs from 16-quarter window (Q0–Q3 vs Q12–Q15)
    // null when fewer than 16 quarters available; share count not available from Tiingo
    const cagrPercent = (end: number, start: number): number | null => {
      if (start <= 0 || end <= 0) return null;
      return (Math.pow(end / start, 1 / 3) - 1) * 100;
    };

    let revenueGrowth3y: number | null = null;
    let epsGrowth3y: number | null = null;
    if (quarters.length >= 16) {
      const threeYearAgoQ = quarters.slice(12, 16);
      const threeYearAgoRevenue = sumIncome(threeYearAgoQ, 'revenue');
      const threeYearAgoEps = sumIncome(threeYearAgoQ, 'eps');
      revenueGrowth3y = cagrPercent(ttmRevenue, threeYearAgoRevenue);
      epsGrowth3y = threeYearAgoEps > 0 ? cagrPercent(ttmEps, threeYearAgoEps) : null;
    }

    // Fix 1: LTM operating margin
    const operatingMargin = ttmRevenue !== 0 ? ttmEbit / ttmRevenue : null;

    // Fix 2: net margin from DataCodes (overview.profitMargin DataCode returns grossMargin — bug)
    const netMargin = ttmRevenue !== 0 ? ttmEarnings / ttmRevenue : null;

    // Fix 5: LTM interest coverage — null when no interest expense (e.g. AAPL)
    const interestCoverage = ttmIntExp > 0 ? ttmEbit / ttmIntExp : null;

    // Fix 3: TTM FCF from cashFlow section (DataCode: freeCashFlow)
    // cashFlow section is optional at this Tiingo API tier — returns null if absent
    const hasFcfData = ttmQ.some(q =>
      q.statementData.cashFlow &&
      q.statementData.cashFlow.length > 0 &&
      toMap(q.statementData.cashFlow).freeCashFlow != null,
    );
    const fcfTtm = hasFcfData ? sumCashFlow(ttmQ, 'freeCashFlow') : null;

    // Fix 4: net_debt_to_ebitda = (debt − cash) / EBITDA
    // Uses latest quarter balance sheet DataCodes; depamor adds D&A when available
    const latestBalance  = toMap(quarters[0].statementData.balanceSheet);
    const latestOverview = toMap(quarters[0].statementData.overview);

    const debt = latestBalance.debt ?? null;
    const cash = latestBalance.cashAndEq ?? null;
    const ebitda = ttmEbit + ttmDepAmor; // ttmDepAmor is 0 when DataCode absent → conservative
    const netDebtToEbitda = debt !== null && cash !== null && ebitda > 0
      ? (debt - cash) / ebitda
      : null;

    // STORY-030: ROIC = NOPAT / Invested Capital
    // NOPAT = TTM EBIT × (1 − effective_tax_rate); IC = equity + debt − cash
    // effective_tax_rate = TTM taxExp / TTM pretaxinc, clamped [0, 0.50]
    // 25% statutory fallback when pretaxinc ≤ 0 (loss year)
    const equity = latestBalance.equity ?? null;
    const effectiveTaxRate =
      ttmPretaxInc > 0 && ttmTaxExp >= 0
        ? Math.min(ttmTaxExp / ttmPretaxInc, 0.50)
        : 0.25;
    const nopat = ttmEbit !== 0 ? ttmEbit * (1 - effectiveTaxRate) : null;
    const investedCapital =
      equity !== null && debt !== null && cash !== null
        ? equity + debt - cash
        : equity !== null && debt !== null
          ? equity + debt
          : null;
    const roic =
      nopat !== null && investedCapital !== null && investedCapital > 0
        ? nopat / investedCapital
        : null;

    return {
      ticker,
      revenue_growth_yoy: revenueGrowthYoy,
      eps_growth_yoy: epsGrowthYoy,
      revenue_growth_3y: revenueGrowth3y,
      eps_growth_3y: epsGrowth3y,
      gross_profit_growth: grossProfitGrowth,
      share_count_growth_3y: null,    // share count not available from Tiingo fundamentals
      eps_growth_fwd: null,
      gaapEps: null,                  // STORY-031: GAAP/non-GAAP reconciliation uses FMP annual only
      gaapEpsFiscalYearEnd: null,
      statementPeriodEnd: quarters.length > 0 ? quarters[0].date : null,
      revenue_ttm:  ttmRevenue  !== 0 ? ttmRevenue  : null,
      earnings_ttm: ttmEarnings !== 0 ? ttmEarnings : null,
      gross_margin:      latestOverview.grossMargin   ?? null,
      operating_margin:  operatingMargin,                      // Fix 1
      net_margin:        netMargin,                            // Fix 2
      roe:               latestOverview.roe            ?? null,
      roa:               latestOverview.roa            ?? null,
      roic,
      trailing_pe:       null,
      fcf_ttm:           fcfTtm,                               // Fix 3
      ebit_ttm:          ttmEbit  !== 0 ? ttmEbit  : null,
      eps_ttm:           ttmEps   !== 0 ? ttmEps   : null,
      net_debt_to_ebitda: netDebtToEbitda,                     // Fix 4
      total_debt:        debt,
      cash_and_equivalents: cash,
      debt_to_equity:    latestOverview.debtEquity     ?? null,
      current_ratio:     latestOverview.currentRatio   ?? null,
      interest_coverage: interestCoverage,                     // Fix 5
    };
  }

  /**
   * Always returns null — /tiingo/fundamentals/{ticker}/overview returns 404 at this
   * API tier. forwardEstimateCoverage is declared 'none' in capabilities.
   * No HTTP call is made.
   */
  async fetchForwardEstimates(ticker: string): Promise<ForwardEstimates | null> {
    console.log(JSON.stringify({ event: 'tiingo_forward_estimates_unavailable', ticker }));
    return null;
  }

  async fetchMetadata(ticker: string): Promise<StockMetadata | null> {
    const raw = await this.tiingoFetch(`/tiingo/daily/${encodeURIComponent(ticker)}`);
    if (raw === null) return null;

    const data = raw as Record<string, unknown>;
    return {
      ticker: String(data.ticker ?? ticker),
      company_name: String(data.name ?? ticker),
      sector: null,
      industry: null,
      exchange: String(data.exchangeCode ?? ''),
      market_cap_millions: null,   // not available from Tiingo /daily/{ticker}
      market_cap_usd: null,        // not available from Tiingo /daily/{ticker}
      shares_outstanding: null,    // not available from Tiingo /daily/{ticker}
      description: null,           // not available from Tiingo /daily/{ticker}
      sicCode: null,               // not available from Tiingo /daily/{ticker}
    };
  }
}
