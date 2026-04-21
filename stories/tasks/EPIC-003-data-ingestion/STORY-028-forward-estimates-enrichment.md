# STORY-028 — Forward Estimates Enrichment

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Fix the forward estimates fields stored by EPIC-003. Currently `forward_pe` stores raw NTM EPS ($/share) and `forward_ev_ebit` stores raw NTM EBIT ($M) — both are raw inputs rather than computed ratios. This story converts them into actual forward P/E and forward EV/EBIT multiples, adds the missing `revenue_growth_fwd` and `eps_growth_fwd` computed values, and stores raw NTM inputs in their own dedicated columns for auditability.

## Story
As a **developer**,
I want **`forward_pe` and `forward_ev_ebit` to store actual forward multiples (not raw inputs), and `eps_growth_fwd` and `revenue_growth_fwd` to be computed and stored** —
so that **the classification engine receives correct forward valuation data rather than raw analyst estimate numbers**.

## Outcome
- `eps_ntm` stores raw NTM EPS per share ($/share, non-GAAP analyst consensus from FMP)
- `ebit_ntm` stores raw NTM EBIT ($M, non-GAAP analyst consensus from FMP)
- `revenue_ntm` stores raw NTM revenue ($M, from FMP analyst estimates)
- `forward_pe` = `current_price / eps_ntm` (actual forward P/E ratio, null if eps_ntm ≤ 0)
- `forward_ev_ebit` = `(market_cap + total_debt − cash_and_equivalents) / (ebit_ntm × 1M)` (actual forward EV/EBIT, null if ebit_ntm ≤ 0 or market_cap null)
- `forward_ev_sales` = `(market_cap + total_debt − cash_and_equivalents) / (revenue_ntm × 1M)` (actual forward EV/Sales — **new field**)
- `eps_growth_fwd` = `(eps_ntm − eps_ttm) / |eps_ttm|` (null if eps_ttm = 0 or null)
- `revenue_growth_fwd` = `(revenue_ntm × 1M − revenue_ttm) / revenue_ttm` (null if revenue_ttm = 0 or null)
- `forward_pe_source` = `'fmp'`; `forward_ev_ebit_source` = `'fmp'`; `ev_sales_source` = `'fmp'`

## Scope In

### Task 1 — Schema migration: add raw NTM input columns and forward_ev_sales
Add to Prisma schema and migrate:
```
epsNtm         Decimal? @db.Decimal(10, 4) @map("eps_ntm")          -- NTM EPS $/share (non-GAAP, FMP consensus)
ebitNtm        Decimal? @db.Decimal(20, 2) @map("ebit_ntm")         -- NTM EBIT in USD (FMP ebitAvg, absolute)
revenueNtm     Decimal? @db.Decimal(20, 2) @map("revenue_ntm")      -- NTM revenue in USD (FMP estimatedRevenueAvg, absolute)
forwardEvSales Decimal? @db.Decimal(8, 2)  @map("forward_ev_sales") -- Forward EV/Sales ratio
```
Placement: in the "Valuation metrics" block, near `forwardPe` and `forwardEvEbit`.

### Task 2 — FMP adapter: extend `fetchForwardEstimates()` to return revenue_ntm + ebit_ntm
**File:** `src/modules/data-ingestion/adapters/fmp.adapter.ts`

Current FMP `/stable/analyst-estimates?period=annual` NTM entry fields used:
- `epsAvg` → NTM EPS ($/share, non-GAAP)
- `ebitAvg` → NTM EBIT (in absolute USD, NOT millions — verify unit from real API response)
- `estimatedRevenueAvg` → NTM revenue (in absolute USD — verify unit)

**FMP endpoint and field confirmations:**
- `estimatedRevenueAvg` field: **CONFIRMED in fixture** (`tests/fixtures/fmp-analyst-estimates-response.json` line 3 contains `"estimatedRevenueAvg": 415000000000`). The field exists and returns absolute USD values.
- `ebitAvg` field: **CONFIRMED** — fixture shows `"ebitAvg": 130000000000` (absolute USD). Current adapter correctly divides by `1_000_000`.
- `epsAvg` field: **CONFIRMED** — fixture and live API both verified.

**Unit handling (confirmed):** `ebitAvg` and `estimatedRevenueAvg` are absolute USD (not millions). Convert to $M for storage: divide by `1_000_000`. Ratios computed using EV (USD) divided by stored $M values must multiply denominator by `1_000_000`.

Update `ForwardEstimates` canonical type:
```typescript
interface ForwardEstimates {
  forwardPe: number | null;      // raw NTM EPS $/share (→ epsNtm in DB)
  forwardEvEbit: number | null;  // raw NTM EBIT $M (→ ebitNtm in DB)
  revenueNtm?: number | null;    // NTM revenue $M (NEW from estimatedRevenueAvg)
}
```

In `FMPAdapter.fetchForwardEstimates()`, add:
```typescript
revenueNtm: ntmEntry.estimatedRevenueAvg != null
  ? Number(ntmEntry.estimatedRevenueAvg) / 1_000_000
  : null
```

### Task 3 — Forward estimates sync service: store raw inputs + compute ratios
**File:** `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` (or forward-estimates-sync.service.ts if it exists)

**Existing behavior (to replace):**
- `forward_pe ← data.forwardPe` (raw EPS $/share — WRONG)
- `forward_ev_ebit ← data.forwardEvEbit` (raw EBIT $M — WRONG)

**New behavior:**
1. Store raw inputs: `eps_ntm ← data.forwardPe`, `ebit_ntm ← data.forwardEvEbit`, `revenue_ntm ← data.revenueNtm`
2. Fetch current stock state needed for ratio computation: `current_price`, `market_cap`, `total_debt`, `cash_and_equivalents`, `eps_ttm`, `revenue_ttm`
3. Compute:
   ```typescript
   const forwardPe = (epsNtm && epsNtm > 0 && currentPrice)
     ? Number(currentPrice) / epsNtm
     : null;

   const ev = (marketCap != null)
     ? Number(marketCap) + Number(totalDebt ?? 0) - Number(cashAndEquivalents ?? 0)
     : null;

   const forwardEvEbit = (ev != null && ebitNtm && ebitNtm > 0)
     ? ev / (ebitNtm * 1_000_000)  // ebit_ntm stored in $M; ev in USD
     : null;

   const epsGrowthFwd = (epsNtm != null && epsTtm != null && Math.abs(Number(epsTtm)) > 0.001)
     ? (epsNtm - Number(epsTtm)) / Math.abs(Number(epsTtm))
     : null;

   const revenueGrowthFwd = (revenueNtm != null && revenueTtm != null && Number(revenueTtm) > 0)
     ? (revenueNtm * 1_000_000 - Number(revenueTtm)) / Number(revenueTtm)
     : null;

   const forwardEvSales = (ev != null && revenueNtm && revenueNtm > 0)
     ? ev / (revenueNtm * 1_000_000)   // ev in USD; revenue_ntm stored in $M
     : null;
   ```
4. Store computed values in `forward_pe`, `forward_ev_ebit`, `forward_ev_sales`, `eps_growth_fwd`, `revenue_growth_fwd`
5. Update provenance (see Task 4 below)

**Unit invariant:** `ebit_ntm` and `revenue_ntm` stored in $M; `ebit_ttm` and `revenue_ttm` (from STORY-027) stored in USD. Conversion applied during ratio computation. Document this clearly in code.

**Execution order:** Forward estimates enrichment MUST run AFTER market cap sync (needs `current_price`, `market_cap`, `eps_ttm`, `revenue_ttm`). The pipeline run order in `fundamentals-sync.service.ts` must be:
1. `syncFundamentals()` (STORY-026 fixes — provides earnings_ttm, revenue_ttm, ebit_ttm, total_debt, cash)
2. `syncMarketCapAndMultiples()` (STORY-027 — provides market_cap, shares_outstanding, eps_ttm)
3. `syncForwardEstimatesEnriched()` (this story — needs all of the above)

### Task 4 — Provenance Tracking
All fields written by the forward estimates enrichment sync must include provenance entries in `data_provider_provenance`. Use the existing merge pattern from `fundamentals-sync.service.ts`:

| Field | Provider value | Rationale |
|-------|---------------|-----------|
| `eps_ntm` | `'fmp'` | Raw value directly from FMP analyst estimates |
| `ebit_ntm` | `'fmp'` | Raw value directly from FMP analyst estimates |
| `revenue_ntm` | `'fmp'` | Raw value directly from FMP analyst estimates |
| `forward_pe` | `'computed'` | `current_price / eps_ntm` — derived from FMP + price |
| `forward_ev_ebit` | `'computed'` | `ev / (ebit_ntm × 1M)` — derived from multiple sources |
| `forward_ev_sales` | `'computed'` | `ev / (revenue_ntm × 1M)` — derived from multiple sources |
| `eps_growth_fwd` | `'computed'` | `(eps_ntm - eps_ttm) / \|eps_ttm\|` |
| `revenue_growth_fwd` | `'computed'` | `(revenue_ntm × 1M - revenue_ttm) / revenue_ttm` |

**AC addition:** After running forward estimates enrichment, `data_provider_provenance` must contain entries for all 8 fields above. The existing `contracts.test.ts` provenance shape tests must be extended to cover `eps_ntm`, `ebit_ntm`, `revenue_ntm`, `forward_ev_sales`.

### Task 6 — Integration tests
**File:** `tests/integration/data-ingestion/forward-estimates-enrichment.test.ts`

Test cases:
- AAPL `eps_ntm` ≈ $8.40–8.60 (SA/FMP consensus NTM EPS, non-GAAP)
- AAPL `forward_pe` ≈ 24–30× (SA: AAPL forward P/E ~27× using non-GAAP NTM EPS)
- AAPL `eps_growth_fwd` ≈ 10–20% (NTM vs TTM EPS growth)
- AAPL `revenue_growth_fwd` non-null and > 0% (FMP estimates show positive revenue growth)
- AAPL `forward_ev_ebit` non-null and > 0
- AAPL `forward_ev_sales` non-null and > 0 (SA: AAPL forward EV/Sales ≈ 7–9×)
- Stock with no FMP coverage (missing NTM entry): `forward_pe = null`, `eps_ntm = null`
- Stock with negative NTM EPS: `forward_pe = null`
- Provenance entries present for all 8 fields (eps_ntm, ebit_ntm, revenue_ntm, forward_pe, forward_ev_ebit, forward_ev_sales, eps_growth_fwd, revenue_growth_fwd)

### Task 7 — Fixture update: confirm `estimatedRevenueAvg` in FMP analyst estimates fixture
**File:** `tests/fixtures/fmp-analyst-estimates-response.json`

`estimatedRevenueAvg` field is **already in fixture** (confirmed). Update `contracts.test.ts` to assert `revenue_ntm` is populated when fixture has `estimatedRevenueAvg`. No fixture changes needed — only test assertion.

## Scope Out
- GAAP/non-GAAP reconciliation factor — STORY-031
- Tiingo forward estimates (STORY-016 confirmed Tiingo forward estimates unavailable at current tier)

## Dependencies
- STORY-026 Fix 6 (total_debt, cash_and_equivalents populated)
- STORY-027 (market_cap, shares_outstanding, eps_ttm, revenue_ttm, ebit_ttm populated)
- FMP `/stable/analyst-estimates` — already called; extending, not replacing
- Unit verification of FMP response units (absolute vs millions) before coding

## Acceptance Criteria
- [ ] Schema migration applied; `eps_ntm`, `ebit_ntm`, `revenue_ntm`, `forward_ev_sales` columns exist
- [ ] AAPL `eps_ntm` ≈ $8.40–8.60 (non-GAAP NTM EPS from FMP)
- [ ] AAPL `forward_pe` ≈ 24–30× (actual P/E ratio, not raw EPS)
- [ ] AAPL `eps_growth_fwd` non-null, positive (NTM EPS > TTM EPS)
- [ ] AAPL `revenue_growth_fwd` non-null, positive
- [ ] AAPL `forward_ev_ebit` non-null, reasonable (>0)
- [ ] AAPL `forward_ev_sales` ≈ 7–9× (SA validation)
- [ ] `forward_pe` is no longer storing raw EPS $/share (confirmed by value > 5 for any profitable large-cap)
- [ ] Stock with no analyst coverage: `forward_pe = null`, `eps_ntm = null` (not crash)
- [ ] `contracts.test.ts` still passes (20 tests) — provenance shape for `forward_pe` correct
- [ ] No regression in STORY-023 or STORY-024 suites

## Test Strategy
- Integration tests: AAPL, MSFT forward multiples within ±3× of SA forward consensus
- Unit tests: `computeForwardMultiples()` — null guards, unit conversion, negative EPS, zero revenue
- Regression: all existing tests pass

## Definition of Done
- [ ] Schema migration in `prisma/migrations/`
- [ ] Prisma schema updated with 3 new columns
- [ ] `FMPAdapter.fetchForwardEstimates()` returns `revenueNtm`
- [ ] `ForwardEstimates` canonical type updated
- [ ] Forward estimates sync computes and stores ratios instead of raw inputs
- [ ] `eps_ntm`, `ebit_ntm`, `revenue_ntm` raw inputs preserved in dedicated columns
- [ ] AAPL forward_pe within SA ±3× range
- [ ] Implementation log updated
- [ ] Story status updated to `done`

## Traceability
- Epic: EPIC-003
- RFC: RFC-004 §Forward Estimates Sync; RFC-002 stocks table
- ADR: ADR-001 (FMP as secondary — forward estimates provider)
- Downstream: EPIC-004 classification engine (eps_growth_fwd feeds earnings quality score); EPIC-005 valuation engine (forward_pe is primary multiple for growth stocks)

## Notes
- **Non-GAAP clarification:** FMP analyst estimates (`epsAvg`) are **non-GAAP consensus** (street estimates). `forward_pe` computed from these is therefore a non-GAAP forward P/E. This is standard sell-side convention and correct for EPIC-004 inputs. GAAP reconciliation is out of scope for V1.
- **forward_pe field semantic change:** This story changes `forward_pe` from storing raw EPS ($/share) to an actual P/E ratio. The `forward_pe_source` field confirms provenance. Any existing test that asserts `forward_pe ≈ 8.49` for AAPL must be updated to assert the actual P/E ≈ 27×.
