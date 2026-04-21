// EPIC-003: Data Ingestion & Universe Management
// STORY-017: FMP Provider Adapter
// TASK-017-006: Integration tests — live FMP stable API (gated on FMP_API_KEY)
// @integration
//
// Fixture provenance: captured_real — assertions based on live API responses verified 2026-04-20
//   verified against key yW1smSL6fErOSBdlqcLoR69MTB0jDbJ3
//   Base URL: https://financialmodelingprep.com/stable

import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';

const describeOrSkip = process.env.FMP_API_KEY ? describe : describe.skip;

describeOrSkip('EPIC-003/STORY-017/TASK-017-006: FMPAdapter @integration (live API)', () => {
  let adapter: FMPAdapter;

  beforeAll(() => {
    adapter = new FMPAdapter(process.env.FMP_API_KEY!);
  });

  // Verified 2026-04-20: /stable/profile?symbol=AAPL returns exchange='NASDAQ', sector='Technology'
  it('fetchMetadata("AAPL") returns valid StockMetadata', async () => {
    const result = await adapter.fetchMetadata('AAPL');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.company_name).toContain('Apple');
    expect(result!.exchange).toBe('NASDAQ');
    expect(result!.sector).not.toBeNull();
    expect(result!.market_cap_millions).not.toBeNull();
    expect(result!.market_cap_millions!).toBeGreaterThan(0);
  }, 15_000);

  // Verified 2026-04-20: /stable/historical-price-eod/full?symbol=AAPL returns flat array
  // with close=273.05 on 2026-04-20
  it('fetchEODPrice("AAPL") returns valid PriceData with close > 0', async () => {
    const result = await adapter.fetchEODPrice('AAPL');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.close).toBeGreaterThan(0);
    expect(result!.date).toBeInstanceOf(Date);
  }, 15_000);

  // Verified 2026-04-20: /stable/income-statement?symbol=AAPL returns revenue=416B+ (FY2025)
  // trailing_pe always null (not from income/balance); eps_growth_fwd always null
  it('fetchFundamentals("AAPL") returns non-null FundamentalData; trailing_pe is null', async () => {
    const result = await adapter.fetchFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.revenue_ttm).not.toBeNull();
    expect(result!.revenue_ttm!).toBeGreaterThan(0);
    expect(result!.gross_margin).not.toBeNull();
    expect(result!.gross_margin!).toBeGreaterThan(0);
    expect(result!.trailing_pe).toBeNull();
    expect(result!.eps_growth_fwd).toBeNull();
  }, 15_000);

  // Verified 2026-04-20: /stable/analyst-estimates?symbol=AAPL returns epsAvg=8.49 for FY2026
  // NTM = 2026-09-27 (first future fiscal year end after 2026-04-20)
  it('fetchForwardEstimates("AAPL") returns non-null ForwardEstimates', async () => {
    const result = await adapter.fetchForwardEstimates('AAPL');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.forward_pe).not.toBeNull();
    expect(result!.forward_pe!).toBeGreaterThan(0);
    expect(result!.forward_ev_ebit).not.toBeNull();
    expect(result!.forward_ev_ebit!).toBeGreaterThan(0);
  }, 15_000);
});
