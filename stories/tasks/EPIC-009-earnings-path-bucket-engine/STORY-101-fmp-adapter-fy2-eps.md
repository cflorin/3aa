# STORY-101 — FMP Adapter: Persist FY2 EPS

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Extend the FMP data adapter to extract and persist the FY+2 analyst consensus EPS (`eps_fy2_avg`) from the analyst-estimates API response. This is already fetched in the existing estimates call — it only needs to be parsed and written to `Stock.epsFy2Avg`. This field is the L1 input for the forward EPS fallback chain (§3.3.3 of the V2 framework): without it, all stocks fall to L3 or L4, materially reducing bucket confidence.

## Story
As a system,
I want the FMP adapter to persist the FY+2 EPS consensus estimate when available,
so that the Earnings Path Engine can use the two-year forward EPS CAGR as its highest-confidence forward signal.

## Outcome
After a stock sync, `Stock.epsFy2Avg` is populated with the FY+2 analyst consensus EPS if available from FMP, or null if the entry is absent or the value is missing. The classification engine can then use this field for L1 fallback in the forward EPS computation.

## Scope In
- Parse `epsFy2Avg` from the existing FMP `analyst-estimates` fetch (annual array)
- Identify the FY+2 entry: the annual estimates entry whose date is approximately 2 fiscal years after the most recently completed FY
- Write `epsFy2Avg` to `Stock.epsFy2Avg` during sync
- Handle null gracefully: if FY+2 entry absent or `epsAvg` null, write null
- Add BUG-DATA-003 style tests covering: FY2 present, FY2 absent, FY2 entry exists but epsAvg null
- Update existing FMP adapter unit tests to cover the new field

## Scope Out
- No changes to the API call itself — the estimates data is already fetched
- No new FMP endpoints
- No storage on `StockQuarterlyHistory` — this is a derived FY-level field on Stock
- FY2 definition logic (which annual entry is FY+2) is computed in the adapter, not in the engine
- No UI changes

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §8.3 (Forward EPS Fallback Chain, L1 definition), §3.3.3 of V2 framework
- ADR: ADR-013 V2 formula weights
- Upstream: STORY-100 (must be applied before this story — `epsFy2Avg` column must exist)

## Preconditions
- STORY-100 migration applied (`Stock.epsFy2Avg` column exists)
- FMP adapter already fetches `analyst-estimates` annual array (confirmed in existing code)
- `fmp.adapter.ts` follows the existing `revenuePreviousFy` pattern for extracting prior-year estimates

## Inputs
- FMP `analyst-estimates` annual response array (already fetched)
- `mostRecentCompletedFy` date logic (already implemented for `revenuePreviousFy`)
- Framework V2.1 §3.3.3 L1 definition: "FY0→FY2 CAGR; FY0 = most recently completed FY; FY+2 = the annual entry approximately 2 years after FY0"

## Outputs
- `Stock.epsFy2Avg` populated on every sync where FY+2 `epsAvg` is available
- `null` written when FY+2 data is absent or `epsAvg` field is null

## Acceptance Criteria
- [ ] After syncing a stock with FY+2 EPS data, `Stock.epsFy2Avg` is non-null
- [ ] After syncing a stock where FY+2 entry is absent, `Stock.epsFy2Avg` is null (not an error)
- [ ] After syncing a stock where FY+2 entry exists but `epsAvg` is null, `Stock.epsFy2Avg` is null
- [ ] FY+2 is correctly identified as the annual entry approximately 2 years after `mostRecentCompletedFy`
- [ ] When FY0 base EPS is negative or zero, `epsFy2Avg` is still persisted if available (the L1 unusable check is in the engine, not the adapter)
- [ ] All existing FMP adapter tests pass unchanged
- [ ] New unit tests cover all three FY2 availability scenarios

## Test Strategy Expectations
- Unit tests:
  - `fmp.adapter.test.ts`: "FY2 present and epsAvg available → epsFy2Avg populated"
  - `fmp.adapter.test.ts`: "FY2 entry absent → epsFy2Avg null"
  - `fmp.adapter.test.ts`: "FY2 entry present but epsAvg null → epsFy2Avg null"
  - `fmp.adapter.test.ts`: "FY0 negative EPS → epsFy2Avg still persisted from FY2 if available"
  - `fmp.adapter.test.ts`: "FY2 identification: entry ~2yr after mostRecentCompletedFy is selected correctly"
- Integration tests:
  - End-to-end sync test with mocked FMP response: verify DB row has correct `epsFy2Avg`
- Contract/schema tests:
  - Verify `epsFy2Avg` column accepts Decimal and null values
- BDD acceptance tests:
  - Given a stock sync with FY2 EPS data available; when the sync completes; then epsFy2Avg equals the FY2 epsAvg value from the estimates response
- E2E tests: N/A

## Regression / Invariant Risks
- `revenuePreviousFy` logic in `fmp.adapter.ts` should not be touched — re-use the FMP estimates array processing pattern, do not refactor it
- Existing 42 FMP adapter tests must all continue to pass
- The FY+2 identification logic must handle edge cases where the estimates array has gaps (missing years) — must not select the wrong year

## Key Risks / Edge Cases
- FMP returns annual estimates with 1-year resolution; the FY+2 entry may be identified by date offset, not a "position 2" index (indices can shift if years are missing)
- Some stocks may only have 1 year of forward estimates (only FY+1, no FY+2) — handle gracefully
- Negative FY0 EPS: adapter should still persist FY+2 `epsAvg` (null check on compute is the engine's job)
- If FMP returns `epsAvg` as "0" vs null — treat zero EPS as valid data, not as absent

## Definition of Done
- [ ] `Stock.epsFy2Avg` populated correctly on sync
- [ ] Tests added and passing (min 5 new unit tests)
- [ ] All existing FMP adapter tests still passing
- [ ] Implementation log updated
- [ ] Traceability comments in `fmp.adapter.ts`

## Traceability
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md` §Inputs
- RFC: RFC-009 §8.3
- ADR: ADR-013 (V2 formula, L1 forward EPS source)
