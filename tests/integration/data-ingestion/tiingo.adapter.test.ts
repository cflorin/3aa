// EPIC-003: Data Ingestion & Universe Management
// STORY-016: Tiingo Provider Adapter
// TASK-016-006: Integration tests — live Tiingo API (gated on TIINGO_API_KEY)
// @integration
//
// Fixture provenance: captured_real — assertions based on live API responses
//   verified 2026-04-20 against key c72d2e054aea800a237b80f625a6ac11238134d6

import { TiingoAdapter } from '../../../src/modules/data-ingestion/adapters/tiingo.adapter';

const describeOrSkip = process.env.TIINGO_API_KEY ? describe : describe.skip;

describeOrSkip('EPIC-003/STORY-016/TASK-016-006: TiingoAdapter @integration (live API)', () => {
  let adapter: TiingoAdapter;

  beforeAll(() => {
    adapter = new TiingoAdapter(process.env.TIINGO_API_KEY!);
  });

  // Verified 2026-04-20: /tiingo/fundamentals/meta returns ~19,978 tickers;
  // active US stocks (isActive=true, location ends ', USA') yield > 1000
  it('fetchUniverse() returns > 1000 active US stocks with null market_cap_millions', async () => {
    const stocks = await adapter.fetchUniverse(0);
    expect(stocks.length).toBeGreaterThan(1000);
    stocks.slice(0, 10).forEach(s => {
      expect(s.ticker).toBeTruthy();
      expect(s.company_name).toBeTruthy();
      expect(s.country).toBe('US');
      expect(s.market_cap_millions).toBeNull();
    });
  }, 30_000);

  // Verified 2026-04-20: /tiingo/daily/AAPL/prices returns array with close field
  it('fetchEODPrice("AAPL") returns valid PriceData with close > 0', async () => {
    const price = await adapter.fetchEODPrice('AAPL');
    expect(price).not.toBeNull();
    expect(price!.ticker).toBe('AAPL');
    expect(price!.close).toBeGreaterThan(0);
    expect(price!.date).toBeInstanceOf(Date);
  }, 15_000);

  // Verified 2026-04-20: /tiingo/fundamentals/AAPL/statements returns 49 quarters;
  // revenue_ttm non-null, trailing_pe always null
  it('fetchFundamentals("AAPL") returns non-null FundamentalData; trailing_pe is null', async () => {
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.revenue_ttm).not.toBeNull();
    expect(result!.roe).not.toBeNull();
    expect(result!.trailing_pe).toBeNull();
    expect(result!.eps_growth_fwd).toBeNull();
  }, 15_000);

  // Verified 2026-04-20: forward estimates endpoint returns 404; adapter returns null
  // without making an HTTP call
  it('fetchForwardEstimates("AAPL") returns null (endpoint unavailable at this API tier)', async () => {
    const result = await adapter.fetchForwardEstimates('AAPL');
    expect(result).toBeNull();
  }, 5_000);

  // Verified 2026-04-20: /tiingo/daily/AAPL returns ticker, name, exchangeCode=NASDAQ
  it('fetchMetadata("AAPL") returns StockMetadata with NASDAQ exchange', async () => {
    const result = await adapter.fetchMetadata('AAPL');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.company_name).toContain('Apple');
    expect(result!.exchange).toBe('NASDAQ');
    expect(result!.sector).toBeNull();
    expect(result!.industry).toBeNull();
  }, 15_000);
});
