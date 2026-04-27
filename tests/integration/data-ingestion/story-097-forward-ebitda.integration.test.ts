// EPIC-008: Valuation Regime Decoupling
// STORY-097: Forward EV/EBITDA Metric
// Live integration test — verifies FMP returns ebitdaAvg for pharma / amortisation-heavy stocks
// @integration
//
// Fixture provenance: captured_real — live FMP /analyst-estimates responses
// Gate: requires FMP_API_KEY in environment
//
// Finding (2026-04-28): FMP /analyst-estimates does NOT provide depreciationAvg.
// It DOES provide ebitdaAvg for all stocks including ADRs. Implementation corrected to use
// ebitdaAvg directly as ebitdaNtm.

import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';

const FMP_KEY = process.env.FMP_API_KEY;
const describeOrSkip = FMP_KEY ? describe : describe.skip;

// Pharma and large-cap acquirer stocks with significant acquired-intangible amortisation.
// These are the primary target for forward EV/EBITDA (amortisation-distorted GAAP EPS).
const TEST_STOCKS = [
  { ticker: 'JNJ',  name: 'Johnson & Johnson',  approxEv: 400_000_000_000 },
  { ticker: 'PFE',  name: 'Pfizer',             approxEv: 150_000_000_000 },
  { ticker: 'ABBV', name: 'AbbVie',             approxEv: 300_000_000_000 },
  { ticker: 'MRK',  name: 'Merck',              approxEv: 250_000_000_000 },
  { ticker: 'AZN',  name: 'AstraZeneca (ADR)',  approxEv: 250_000_000_000 },
];

describeOrSkip('EPIC-008/STORY-097: FMP ebitdaAvg live integration tests @integration', () => {
  let adapter: FMPAdapter;

  beforeAll(() => {
    adapter = new FMPAdapter(FMP_KEY!);
  });

  for (const { ticker, name, approxEv } of TEST_STOCKS) {
    it(`${ticker} (${name}): fetchForwardEstimates returns non-null ebitdaNtm from FMP ebitdaAvg`, async () => {
      const result = await adapter.fetchForwardEstimates(ticker);

      expect(result).not.toBeNull();
      expect(result!.ticker).toBe(ticker);

      console.log(`[${ticker}] ebitdaNtm (FMP ebitdaAvg) = ${result!.ebitdaNtm != null ? (result!.ebitdaNtm / 1e9).toFixed(1) + 'B' : 'null'}`);
      console.log(`[${ticker}] ebit_ntm  (FMP ebitAvg)   = ${result!.ebit_ntm != null ? (result!.ebit_ntm / 1e9).toFixed(1) + 'B' : 'null'}`);

      // FMP provides ebitdaAvg for both US stocks and ADRs — should be non-null
      expect(result!.ebitdaNtm).not.toBeNull();
      expect(result!.ebitdaNtm!).toBeGreaterThan(0);

      // Implied D&A = ebitdaNtm - ebit_ntm (positive for all pharma)
      if (result!.ebit_ntm !== null) {
        const impliedDA = result!.ebitdaNtm! - result!.ebit_ntm;
        console.log(`[${ticker}] implied D&A = ${(impliedDA / 1e9).toFixed(1)}B`);
        expect(impliedDA).toBeGreaterThan(0); // D&A is always positive
      }

      // Approximate forwardEvEbitda using rough EV — should be in reasonable pharma range (5–50x)
      const forwardEvEbitda = approxEv / result!.ebitdaNtm!;
      console.log(`[${ticker}] approx forwardEvEbitda (~${(approxEv / 1e9).toFixed(0)}B EV) = ${forwardEvEbitda.toFixed(1)}x`);
      expect(forwardEvEbitda).toBeGreaterThan(3);
      expect(forwardEvEbitda).toBeLessThan(80);
    }, 20_000);
  }

  it('ebitdaNtm > ebit_ntm for all pharma stocks (D&A is positive)', async () => {
    // Cross-stock sanity: EBITDA > EBIT is a fundamental accounting identity for non-negative D&A
    const results = await Promise.all(
      TEST_STOCKS.map(({ ticker }) => adapter.fetchForwardEstimates(ticker)),
    );

    for (let i = 0; i < TEST_STOCKS.length; i++) {
      const { ticker } = TEST_STOCKS[i];
      const result = results[i];
      if (result?.ebitdaNtm != null && result?.ebit_ntm != null) {
        expect(result.ebitdaNtm).toBeGreaterThan(result.ebit_ntm);
        console.log(`[${ticker}] ✓ ebitdaNtm (${(result.ebitdaNtm / 1e9).toFixed(1)}B) > ebit_ntm (${(result.ebit_ntm / 1e9).toFixed(1)}B)`);
      }
    }
  }, 60_000);
});
