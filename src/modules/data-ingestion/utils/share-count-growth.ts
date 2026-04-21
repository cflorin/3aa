// EPIC-003: Data Ingestion & Universe Management
// STORY-032: Share Count Growth (3-Year CAGR)
// TASK-032-003: computeShareCountGrowth3y() pure utility function
//
// Both anchors (FY0 and FY-3) come from weightedAverageShsOutDil in the FMP annual
// income statement — same endpoint, same field, consistent derivation.
// BC-032-001: the original spec's historical-market-cap approach was not feasible
// on our API tier; this income-statement approach satisfies the same consistency constraint.

export interface ShareCountGrowthResult {
  /** Decimal CAGR, e.g. -0.04 = -4% annualized over 3 fiscal years */
  growth: number;
  /** ISO date string of the FY-3 anchor entry (fiscal year end date) */
  periodStart: string;
  /** ISO date string of the FY0 anchor entry (most recent fiscal year end date) */
  periodEnd: string;
}

/**
 * Computes 3-year share count CAGR from annual income statement entries.
 *
 * @param entries - Annual entries sorted newest-first, from fetchAnnualShareCounts().
 *                  Each entry contains the fiscal year end date and weightedAverageShsOutDil.
 * @returns CAGR result, or null if inputs are insufficient or implausible.
 *
 * Null conditions:
 *   - Fewer than 4 entries (cannot reach FY-3)
 *   - FY0 or FY-3 shares ≤ 0
 */
export function computeShareCountGrowth3y(
  entries: { date: string; shares: number }[],
): ShareCountGrowthResult | null {
  if (entries.length < 4) return null;

  const current = entries[0];      // FY0 — most recent fiscal year
  const threeYearsAgo = entries[3]; // FY-3 — three fiscal years prior

  if (current.shares <= 0 || threeYearsAgo.shares <= 0) return null;

  const growth = Math.pow(current.shares / threeYearsAgo.shares, 1 / 3) - 1;

  return {
    growth,
    periodStart: threeYearsAgo.date,
    periodEnd: current.date,
  };
}
