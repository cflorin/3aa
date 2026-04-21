# STORY-026 — Fix Fundamental Metrics Data Quality

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Fix seven confirmed data quality bugs in the EPIC-003 fundamentals pipeline. All bugs were discovered during STORY-025 behavioral validation and PRD gap analysis. Left unfixed, they will corrupt the classification engine (EPIC-004) inputs: FCF margin, FCF conversion, operating margin, and net debt/EBITDA feed directly into earnings quality and balance sheet quality scoring.

## Story
As a **developer**,
I want **all fundamental metrics written by the pipeline to be correct — right period, right DataCode, right field mapping** —
so that **the classification engine and valuation engine operate on accurate inputs rather than proxies or single-quarter snapshots**.

## Outcome
- Operating margin uses LTM (TTM sum of EBIT / TTM sum of revenue), not a single quarter
- `fcf_margin` stores actual FCF margin (or net margin as correct proxy), not gross margin
- `fcf_conversion` stores actual FCF/net income ratio (or documented correct proxy), not ROE
- `net_debt_to_ebitda` stores actual (total_debt − cash) / EBITDA, not debt/equity
- `interest_coverage` uses LTM EBIT / LTM interest expense, not a single quarter
- `total_debt` and `cash_and_equivalents` correctly mapped from FMP balance sheet
- `net_income_positive` and `fcf_positive` correctly populated

## Tasks
- **TASK-026-001** Update `FundamentalData` canonical type: add `fcf_ttm`, `net_debt_to_ebitda`, `total_debt`, `cash_and_equivalents`; fix unit doc for `earnings_ttm`/`revenue_ttm` (absolute USD); add BC-026-001 note on FMP units bug
- **TASK-026-002** Tiingo adapter: Fix 1 (LTM operating margin), Fix 2 (net margin from DataCodes), Fix 3 (fcf_ttm from cashFlow section — null if DataCode absent), Fix 4 (net_debt_to_ebitda using debt/cashAndEq/EBIT), Fix 5 (LTM interest coverage)
- **TASK-026-003** FMP adapter: Fix 6 (total_debt + cash_and_equivalents returned); Fix BC-026-001 (remove /1_000_000 from earnings_ttm and revenue_ttm)
- **TASK-026-004** Sync service: Fix 7 (fcf_positive from fcf_ttm; fcf_conversion from fcf_ttm/earnings_ttm); change net_debt_to_ebitda mapping to new field; add total_debt + cash provenance entries; remove roe→fcfConversion proxy
- **TASK-026-005** Unit tests for all 7 fixes with known inputs and expected outputs
- **TASK-026-006** Integration tests + regression check (STORY-023/024)

## Scope In

### Fix 1 — Operating margin: single quarter → LTM
**Current:** `ebit / revenue` from `quarters[0].statementData.incomeStatement` (one quarter only)
**Fix:** Compute `sum(ebit Q0–Q3) / sum(revenue Q0–Q3)` using the same 4-quarter TTM approach as revenue growth
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchFundamentals()`
**SA validation:** AAPL LTM operating margin ~30–33% (vs current single-quarter 35%)

### Fix 2 — FCF margin: gross margin DataCode bug
**Current:** `latestOverview.profitMargin` returns same value as `grossMargin` (DataCode bug — Tiingo's `profitMargin` in overview = LTM gross profit margin, not net profit margin)
**Fix (option A — correct DataCode):** Replace `overview.profitMargin` with computed `netinc / revenue` TTM ratio from income statement DataCodes
**Fix (option B — explicit proxy):** Store `net_margin = ttmNetIncome / ttmRevenue` explicitly using income statement DataCodes; document that FCF margin is approximated by net margin in V1
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchFundamentals()`; `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts`
**SA validation:** AAPL net margin ~25% (vs current 48% gross margin stored in fcf_margin)

### Fix 3 — FCF conversion: ROE proxy → FCF/NI proxy
**Current:** `data.fcfConversion = fundamentals.roe` (ROE stored in fcf_conversion field — wrong)
**Fix:** Tiingo fundamentals statements include a `cashFlow` section with DataCodes. Use `freeCashFlow` DataCode if available. If not available from Tiingo tier, store `1.0` as a conservative placeholder and document it. FMP income statement does not directly provide FCF; this may require FMP cash flow statement endpoint (`/cash-flow-statement?period=annual`).
**Scope decision:** If Tiingo `cashFlow` section exists and has `freeCashFlow` DataCode, use it. Otherwise fallback: use `operatingCashFlow / netIncome` if available. Document in code clearly.
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts`

### Fix 4 — Net debt/EBITDA: D/E proxy → actual net debt/EBITDA
**Current:** `data.netDebtToEbitda = fundamentals.debt_to_equity` (debt/equity stored — wrong field and wrong metric)
**Fix:** Compute `(total_debt − cash_and_equivalents) / EBITDA`
- `total_debt` = `latestBalance.debt` DataCode from Tiingo
- `cash_and_equivalents` = `cashAndEq` DataCode from Tiingo balance sheet (or from FMP)
- `EBITDA` = TTM EBIT + TTM D&A (`depamor` DataCode from Tiingo income statement)
- If D&A DataCode unavailable, use TTM EBIT as conservative denominator and document
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts`

### Fix 5 — Interest coverage: single quarter → LTM
**Current:** `ebit / intexp` from `quarters[0].statementData.incomeStatement` (one quarter only; null for AAPL because `intexp` DataCode absent for Q0)
**Fix:** Use TTM EBIT / TTM interest expense: `sum(ebit Q0–Q3) / sum(intexp Q0–Q3)`. If `intexp` is zero or absent across all 4 quarters, return null (AAPL genuinely has very low interest expense relative to EBIT).
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts`

### Fix 6 — Total debt and cash: map from FMP balance sheet
**Current:** `total_debt` and `cash_and_equivalents` are null — FMP balance sheet fetches `totalDebt` and there's a `cashAndCashEquivalents` field, but neither is stored
**Fix:** In `FMPAdapter.fetchFundamentals()`, the balance sheet already fetches `totalDebt`. Add:
- `total_debt` = `latestBalance.totalDebt`
- `cash_and_equivalents` = `latestBalance.cashAndCashEquivalents ?? latestBalance.cash ?? null`
In `fundamentals-sync.service.ts` `buildUpdateFromFundamentals()`, add mappings for these two fields.
**File:** `src/modules/data-ingestion/adapters/fmp.adapter.ts`; `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts`

### Fix 7 — net_income_positive and fcf_positive
**Current:** `net_income_positive` is set from `earnings_ttm > 0` (partially correct). `fcf_positive` never set.
**Fix:**
- `net_income_positive` = `ttmEarnings > 0` (Tiingo) or `netIncome > 0` (FMP annual) — already partially correct, verify
- `fcf_positive` = `freeCashFlow > 0` if FCF DataCode available (from Fix 3); otherwise `null` pending cash flow story
**File:** `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts`

### Provenance Tracking Requirements
The `data_provider_provenance` JSONB already has per-field tracking infrastructure in `fundamentals-sync.service.ts`. Each fix must ensure its fields are included in `buildUpdateFromFundamentals()` with a provenance entry:

| Field | Provider value | Notes |
|-------|---------------|-------|
| `operating_margin` | `'tiingo'` | Already has provenance; Fix 1 changes computation only |
| `fcf_margin` | `'tiingo'` | Already has provenance via `net_margin`→`fcf_margin` mapping |
| `fcf_conversion` | `'tiingo'` | Already has provenance via `roe`→`fcf_conversion` mapping |
| `net_debt_to_ebitda` | `'tiingo'` or `'fmp'` | Already has provenance via `debt_to_equity` mapping |
| `interest_coverage` | `'tiingo'` | Already has provenance |
| `total_debt` | `'fmp'` | **NEW** — Fix 6 must add to `buildUpdateFromFundamentals()` with provenance |
| `cash_and_equivalents` | `'fmp'` | **NEW** — Fix 6 must add to `buildUpdateFromFundamentals()` with provenance |
| `net_income_positive` | `'tiingo'` or `'fmp'` | Already has provenance (earnings_ttm > 0 path) |
| `fcf_positive` | `'tiingo'` | **NEW** — Fix 7 must add provenance entry when fcf_positive is set |

The provenance entry shape is `{ provider: string, synced_at: ISO8601, fallback_used: boolean }` — no changes to the shape required.

**Acceptance criterion addition:** After running the fundamentals sync with these fixes, `data_provider_provenance` must contain entries for `total_debt`, `cash_and_equivalents`, and `fcf_positive` (in addition to the 13 fields already tracked).

## Scope Out
- Market cap (STORY-027)
- Trailing valuation multiples (STORY-027)
- 3-year CAGR metrics (STORY-028)
- Forward estimates enrichment (STORY-029)
- FMP cash flow statement endpoint (deferred unless Tiingo cashFlow DataCode insufficient)

## Dependencies
- STORY-025 behavioral validation (confirms which values are wrong) ✓
- Tiingo `/fundamentals/statements` — same endpoint, different DataCodes
- FMP `/balance-sheet-statement` — already called in `fetchFundamentals`

## Acceptance Criteria
- [ ] AAPL operating margin ≈ 30–33% (LTM) — validate on SA
- [ ] AAPL fcf_margin (net margin) ≈ 24–26% — validate on SA
- [ ] AAPL net_debt_to_ebitda ≈ −0.3x to 0.5x (Apple has net cash position; net debt is negative) — validate on SA
- [ ] AAPL interest_coverage: LTM EBIT / LTM interest expense; null if intexp = 0 across all 4 quarters
- [ ] AAPL total_debt populated from FMP balance sheet (non-null)
- [ ] AAPL cash_and_equivalents populated from FMP balance sheet (non-null)
- [ ] MSFT operating margin ≈ 44–46% (LTM) — validate on SA (currently 60% single-quarter bug)
- [ ] TSLA operating margin ≈ 5–8% (LTM) — unchanged expected
- [ ] net_income_positive = true for AAPL, MSFT, JNJ; false for any loss-making company
- [ ] All 7 fixes covered by integration tests in `tests/integration/data-ingestion/`
- [ ] No regression in STORY-023 or STORY-024 test suites

## Test Strategy
- Integration tests: run pipeline for AAPL, MSFT, TSLA with real APIs; assert LTM values within ±3pp of SA
- Unit tests: for each computation fix, add unit test with known quarterly DataCode inputs and expected output
- Regression: STORY-023 (6 tests) and STORY-024 (20 tests) must still pass

## Definition of Done
- [ ] All 7 fixes implemented in adapters and sync service
- [ ] Integration tests passing for all 7 fixes
- [ ] STORY-023 and STORY-024 tests still passing (no regression)
- [ ] Implementation log updated
- [ ] STORY-025 AC rows updated with corrected expected values

## Traceability
- Epic: EPIC-003
- RFC: RFC-004 §Fundamentals Sync; RFC-002 stocks table
- ADR: ADR-001 (Tiingo primary)
- Downstream: EPIC-004 classification engine (earnings quality scoring uses fcf_margin, fcf_conversion, roic, operating_margin)
