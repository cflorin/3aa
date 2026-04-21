# STORY-031 — GAAP / Non-GAAP EPS Reconciliation Factor

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
FMP analyst estimates return non-GAAP consensus EPS (`epsAvg`), which is the street standard but strips out stock-based compensation, amortization of acquired intangibles, and other recurring adjustments. EPIC-004 classification uses EPS growth rates and forward P/E ratios. Without knowing the GAAP/non-GAAP adjustment factor, the classification engine cannot make like-for-like comparisons (e.g., a company with aggressive SBC will show artificially higher non-GAAP EPS growth vs. GAAP, inflating its earnings quality score).

This story computes and stores `gaap_adjustment_factor` = GAAP EPS / non-GAAP EPS for the most recently completed fiscal year, using FMP data sources already fetched.

## Story
As a **developer**,
I want **a `gaap_adjustment_factor` stored for each stock, computed from the ratio of GAAP EPS (FMP income statement) to non-GAAP EPS (FMP analyst estimates for the same completed fiscal year)** —
so that **the classification engine can adjust non-GAAP forward EPS growth to an approximate GAAP basis when computing earnings quality scores**.

## Outcome
- `gaap_adjustment_factor` = GAAP EPS / non-GAAP EPS for the most recently completed fiscal year
- Factor < 1.0: non-GAAP is higher than GAAP (typical — SBC, amortization stripped out)
- Factor > 1.0: GAAP is higher than non-GAAP (unusual — possible from one-time gains or low add-backs)
- Factor = null if data unavailable or denominator < 0.10 (avoids near-zero division distortion)
- Factor clamped to [0.10, 2.00] to prevent extreme outliers corrupting downstream scoring
- New schema column: `gaapAdjustmentFactor DECIMAL(5,4)`
- Provenance entry: `data_provider_provenance.gaap_adjustment_factor = { provider: 'computed_fmp', ... }`

## Scope In

### Task 1 — Schema migration: add gaap_adjustment_factor column
```prisma
gaapAdjustmentFactor  Decimal? @db.Decimal(5, 4) @map("gaap_adjustment_factor")
```
Placement: in the "Valuation metrics" block, near `epsNtm`.

### Task 2 — FMP adapter: expose GAAP EPS and matched non-GAAP EPS

**Approach:** Both data sources are already fetched in separate adapter methods. The reconciliation requires matching them by fiscal year end date. This is done in the sync service (not adapters), but adapters must expose the needed raw values.

**In `FMPAdapter.fetchFundamentals()`:**
`epsDiluted` from the most recent annual income statement is already computed internally (used for YoY growth). Expose it in the return value:
```typescript
// Add to FundamentalData return:
gaapEps: epsDiluted,   // GAAP diluted EPS per share, most recent fiscal year
gaapEpsFiscalYearEnd: String(latest.date),  // e.g. "2024-09-30" — for date-matching
```

Update `FundamentalData` canonical type to add:
```typescript
gaapEps?: number | null;              // GAAP diluted EPS, most recent fiscal year
gaapEpsFiscalYearEnd?: string | null; // Fiscal year end date (ISO date string)
```

**In `FMPAdapter.fetchForwardEstimates()`:**
The NTM selection logic already iterates the sorted analyst estimates array. Also extract the most recently **completed** fiscal year non-GAAP EPS (date < today):
```typescript
const today = new Date();
// Most recent past entry = most recently completed FY
const mostRecentCompletedFy = sorted
  .filter(entry => new Date(String(entry.date)) <= today)
  .at(-1);  // last element = most recent past entry

const nonGaapEpsMostRecentFy = mostRecentCompletedFy?.epsAvg != null
  ? Number(mostRecentCompletedFy.epsAvg)
  : null;
const nonGaapEpsFiscalYearEnd = mostRecentCompletedFy
  ? String(mostRecentCompletedFy.date)
  : null;
```

Update `ForwardEstimates` canonical type:
```typescript
nonGaapEpsMostRecentFy?: number | null;      // non-GAAP consensus EPS for most recent completed FY
nonGaapEpsFiscalYearEnd?: string | null;     // fiscal year end date for matching
```

### Task 3 — Forward estimates sync service: compute and store gaap_adjustment_factor
**File:** `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` (or forward-estimates sync service)

The sync service already calls both `fetchFundamentals()` and `fetchForwardEstimates()` for each ticker. After both calls complete:

```typescript
// Retrieve both data points
const gaapEps = fundamentals?.gaapEps ?? null;
const gaapEpsFyEnd = fundamentals?.gaapEpsFiscalYearEnd ?? null;
const nonGaapEps = estimates?.nonGaapEpsMostRecentFy ?? null;
const nonGaapEpsFyEnd = estimates?.nonGaapEpsFiscalYearEnd ?? null;

// Date matching: fiscal year ends should be within 30 days of each other
// (FMP income statement vs analyst estimates may use slightly different dates for same FY)
const datesAligned = gaapEpsFyEnd && nonGaapEpsFyEnd
  ? Math.abs(new Date(gaapEpsFyEnd).getTime() - new Date(nonGaapEpsFyEnd).getTime())
      < 30 * 24 * 60 * 60 * 1000  // 30-day window
  : false;

let gaapAdjustmentFactor: number | null = null;

if (gaapEps != null && nonGaapEps != null && Math.abs(nonGaapEps) >= 0.10 && datesAligned) {
  const raw = gaapEps / nonGaapEps;
  // Clamp to [0.10, 2.00] — anything outside this range is likely a data anomaly
  gaapAdjustmentFactor = Math.max(0.10, Math.min(2.00, raw));
}
```

Write to DB with provenance:
```typescript
if (gaapAdjustmentFactor !== null) {
  provenanceUpdates['gaap_adjustment_factor'] = {
    provider: 'computed_fmp',
    synced_at: now.toISOString(),
    fallback_used: false,
  };
}
```

### Task 4 — Integration tests
**File:** `tests/integration/data-ingestion/gaap-reconciliation.test.ts`

Test cases:
- AAPL `gaap_adjustment_factor` ≈ 0.88–0.96 (AAPL GAAP EPS is typically ~90–95% of non-GAAP due to SBC)
- MSFT `gaap_adjustment_factor` ≈ 0.85–0.95 (MSFT has significant SBC)
- Company with no FMP analyst estimate coverage: `gaap_adjustment_factor = null`
- Company with non-GAAP EPS < 0.10 (micro-cap loss company): `gaap_adjustment_factor = null`
- Company with date mismatch > 30 days: `gaap_adjustment_factor = null`
- Factor is always in [0.10, 2.00] range (clamp test)
- Unit test: `computeGaapAdjustmentFactor(gaapEps, nonGaapEps, fyMatch)` — all edge cases

### Task 5 — Update FMP analyst estimates fixture
**File:** `tests/fixtures/fmp-analyst-estimates-response.json`

Fixture already has 3 entries. For the test at "2024-09-30" (most recent completed FY):
- Verify `epsAvg` field is present ✓ (already confirmed)
- No fixture changes needed for this task — the existing fixture supports the test

Create a companion income statement fixture entry or verify existing `fmp-income-statement-response.json` has `epsDiluted` field. Check and add if missing.

## Scope Out
- Non-GAAP adjustments at the line-item level (SBC, amortization breakdown) — ratio summary only in V1
- GAAP/non-GAAP reconciliation for revenue (not industry-standard; companies don't typically provide non-GAAP revenue)
- Historical time series of the factor — single most-recent year only
- Quarterly granularity — annual fiscal year comparison only

## Dependencies
- STORY-028 (ForwardEstimates type must already be extended for `revenueNtm`; this story adds more fields)
- FMP `/income-statement` — `epsDiluted` field must be in the fixture (verify before implementation)
- FMP `/analyst-estimates` — `epsAvg` for past fiscal years confirmed in fixture

## Acceptance Criteria
- [ ] Schema migration applied; `gaap_adjustment_factor` column exists
- [ ] AAPL `gaap_adjustment_factor` ≈ 0.88–0.96 (GAAP < non-GAAP as expected)
- [ ] MSFT `gaap_adjustment_factor` ≈ 0.85–0.95
- [ ] Factor always null when: no analyst coverage, |non-GAAP EPS| < 0.10, FY date mismatch > 30 days
- [ ] Factor always in [0.10, 2.00] (clamped — never a degenerate value)
- [ ] `data_provider_provenance.gaap_adjustment_factor` entry present after sync with `provider: 'computed_fmp'`
- [ ] `fmp-income-statement-response.json` fixture has `epsDiluted` field
- [ ] No regression in STORY-023 or STORY-024 suites

## Test Strategy
- Integration tests: AAPL, MSFT factor within SA-observable range
- Unit tests: all null guard and clamp edge cases covered
- Regression: all existing tests pass

## Definition of Done
- [ ] Schema migration in `prisma/migrations/`
- [ ] `FundamentalData` type extended with `gaapEps`, `gaapEpsFiscalYearEnd`
- [ ] `ForwardEstimates` type extended with `nonGaapEpsMostRecentFy`, `nonGaapEpsFiscalYearEnd`
- [ ] FMP adapter extracts both fields correctly
- [ ] Sync service computes and stores factor with date-matching guard
- [ ] FMP income statement fixture updated with `epsDiluted` if missing
- [ ] Integration tests passing for AAPL, MSFT
- [ ] Implementation log updated
- [ ] Story status updated to `done`

## Traceability
- Epic: EPIC-003
- RFC: RFC-004 §Forward Estimates Sync
- ADR: ADR-001 (FMP as forward estimates source)
- Downstream: EPIC-004 classification engine — `gaap_adjustment_factor` used to convert non-GAAP `eps_growth_fwd` to approximate GAAP basis; e.g., `gaap_eps_growth_fwd ≈ eps_growth_fwd × gaap_adjustment_factor`

## Notes
- **Why not just use GAAP EPS from income statement for forward P/E?** Because FMP analyst estimates (`epsAvg`) are non-GAAP by convention — analysts do not publish GAAP consensus for forward periods in the same systematic way. The reconciliation factor provides a bridge without requiring a separate non-GAAP forward estimate endpoint.
- **Practical calibration:** For AAPL (FY2024), `epsDiluted` ≈ $6.08 (GAAP), `epsAvg` ≈ $6.60 (non-GAAP consensus) → factor ≈ 0.92. This means AAPL's non-GAAP EPS overstates GAAP EPS by ~8%, primarily from SBC excluded in analyst estimates.
