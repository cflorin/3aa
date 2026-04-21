# STORY-025 — Behavioral Validation Tests: Live Pipeline Accuracy

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Add a live behavioral test suite that asserts the **numeric correctness** of every field the EPIC-003 pipeline writes, for 5 benchmark stocks across 3 sectors. This is distinct from STORY-023 (pipeline sequencing) and STORY-024 (structural contracts): those tests prove the plumbing works; this story proves the numbers are right.

The test suite calls real provider APIs (Tiingo + FMP) once, writes to the test DB, and asserts actual stored values against analyst-validated benchmarks with appropriate tolerances. It catches calibration bugs — wrong units, wrong period comparisons, wrong DataCode mappings — that fixture and structural tests cannot.

## Story
As a **developer and operator**,
I want **a behavioral validation test suite** that runs the full EPIC-003 pipeline for 5 benchmark stocks and asserts that every stored value is numerically correct within validated tolerances,
so that **calibration bugs, DataCode mismatches, and unit errors are caught before EPIC-005 builds valuation multiples on top of corrupt inputs**.

## Outcome
- A `tests/integration/data-ingestion/behavioral-validation.test.ts` suite exists
- 5 benchmark stocks validated: AAPL (tech), MSFT (tech), TSLA (auto), JPM (financials), JNJ (healthcare)
- Every pipeline-written field either has a tolerance-bounded assertion or an explicit `null` expectation with documented reason
- Known calibration baseline conflicts (BCs) documented and resolved prior to first green run
- Test runs in CI against real provider APIs (non-nightly; tagged `@behavioral`)

## Data Captured for User Validation (2026-04-21 pipeline run)

The following raw values were captured from a live pipeline run and must be validated against Seeking Alpha before acceptance criteria are finalized. Suspected issues are marked ⚠️.

### EOD Prices (Tiingo, latest available EOD)
| Ticker | Stored Price | Validate on SA |
|--------|-------------|----------------|
| AAPL | $273.05 | Recent EOD close — confirm within ±5% |
| MSFT | $418.07 | Recent EOD close — confirm within ±5% |
| TSLA | $392.50 | Recent EOD close — confirm within ±5% |
| JPM | $316.99 | Recent EOD close — confirm within ±5% |
| JNJ | $230.69 | Recent EOD close — confirm within ±5% |

**Note:** Tiingo free tier returns last available EOD; may be 1–2 trading days old. All prices sourced from Tiingo with zero fallbacks.

### Fundamentals (Tiingo primary, no fallback needed)
Margins and ROIC are stored as **decimal ratios** (0.48 = 48%) — multiply by 100 to compare to SA percentages.

| Ticker | Gross Margin | Op Margin | Net Margin (proxy) | ROIC |
|--------|-------------|-----------|-------------------|------|
| AAPL | 0.48 → **48%** | 0.35 → **35%** ⚠️ | 0.48 (=gross, proxy) | 1.147 → **115%** |
| MSFT | 0.68 → **68%** | 0.60 → **60%** ⚠️ | 0.68 (=gross, proxy) | 0.435 → **43.5%** |
| TSLA | 0.20 → **20%** | 0.05 → **5%** | 0.20 (=gross, proxy) | 0.079 → **7.9%** |
| JPM | 1.00 → **100%** ⚠️ | 0.37 → **37%** | 1.00 (not applicable) | 0.074 → **7.4%** |
| JNJ | 0.68 → **68%** | 0.21 → **21%** | 0.68 (=gross, proxy) | 0.329 → **32.9%** |

⚠️ **AAPL operating margin 35%**: SA shows ~30–33% for FY2024/FY2025. Slightly elevated — validate whether Tiingo DataCode uses a different EBIT line.
⚠️ **MSFT operating margin 60%**: SA shows ~44–46% for FY2025. Elevated by ~15pp — DataCode or period mismatch suspected.
⚠️ **JPM gross margin 100%**: Tiingo returns DataCode = 1.0 for financial companies where gross profit = revenue (no COGS). Not meaningful; test should assert = 1.0 or skip.

| Ticker | Revenue Growth YoY | EPS Growth YoY | D/E (proxy) | Int. Coverage |
|--------|-------------------|----------------|-------------|---------------|
| AAPL | **7.2%** | **23.4%** | 1.03 | null |
| MSFT | **91.5%** ⚠️ | **102.3%** ⚠️ | 0.15 | 66.6x |
| TSLA | **1.4%** | **-39.7%** | 0.10 | 14.7x |
| JPM | **3.7%** | **2.8%** | 2.60 | null |
| JNJ | **6.9%** | **36.6%** | 0.59 | 24.2x |

⚠️ **MSFT revenue growth 91.5% and EPS growth 102.3%**: SA shows ~12–17% revenue growth and ~22–24% EPS growth for MSFT FY2025. The 91.5%/102.3% values are clearly wrong. Root cause: Tiingo TTM computation for MSFT appears to use a misaligned comparison period (possibly spanning a fiscal year where a large business change inflated the delta). This is **BC-025-001** — must be resolved before test is written.

⚠️ **AAPL EPS growth 23.4%**: SA shows ~11% for FY2024. 23.4% is too high. Validate which fiscal year the Tiingo DataCode comparison spans.

**Null fields (design, not bugs):**
- `totalDebt`, `cashAndEquivalents`: EPIC-003 does not map these from Tiingo DataCodes; null is expected
- `trailingPe`: Tiingo tier limitation — always null; documented as STORY-016 BC
- `interestCoverage` null for AAPL and JPM: Tiingo DataCode not available for these tickers at this API tier

### Forward Estimates (FMP analyst estimates, NTM period)

**IMPORTANT:** The `forward_pe` and `forward_ev_ebit` DB fields **do not store ratios** — they store the raw FMP analyst inputs that EPIC-005 will use to compute actual multiples. This is documented in the FMP adapter (line 10 comment). The field naming is V1 technical debt; EPIC-005 will overwrite with computed ratios.

| Ticker | NTM Date | Analysts | `forward_pe` field = NTM EPS ($/share) | `forward_ev_ebit` field = NTM EBIT ($M) |
|--------|----------|---------|----------------------------------------|----------------------------------------|
| AAPL | 2026-09-27 | 30 | **$8.49/share** | **$155,769M ($155.8B)** |
| MSFT | 2026-06-30 | 26 | **$16.50/share** | **$144,085M ($144.1B)** |
| TSLA | 2026-12-31 | 25 | **$1.94/share** | **$11,453M ($11.5B)** |
| JPM | 2026-12-31 | 13 | **$22.13/share** | **$61,439M ($61.4B)** |
| JNJ | 2026-12-28 | 13 | **$11.58/share** | **$24,787M ($24.8B)** |

Validate on SA — check "EPS Estimates" (NTM fiscal year consensus) and "Revenue/EBIT Estimates":
- AAPL: consensus FY2026 EPS ~$7.20–7.80/share. Pipeline shows $8.49 — **elevated**, validate ⚠️
- MSFT: consensus FY2026 EPS ~$14.00–16.00/share. Pipeline shows $16.50 — **upper end of range**, validate
- TSLA: consensus FY2026 EPS ~$2.00–3.00/share. Pipeline shows $1.94 — **below consensus**, validate ⚠️
- JPM: consensus FY2026 EPS ~$18.00–22.00/share. Pipeline shows $22.13 — **upper end**, validate
- JNJ: consensus FY2026 EPS ~$10.50–11.50/share. Pipeline shows $11.58 — **slightly above**, validate

⚠️ **TSLA EBIT estimate $11.5B**: TSLA FY2024 actual EBIT was ~$2–3B. $11.5B for NTM seems very high — validate whether FMP's `ebitAvg` represents operating income or EBITDA.

⚠️ **MSFT EBIT estimate $144.1B**: MSFT FY2025 operating income was ~$110B. $144B NTM is aggressive; validate analysts' FY2026 operating income estimates on SA.

### Freshness & Provenance (expected, no validation needed)
| Field | Expected value | Verified |
|-------|---------------|---------|
| `dataFreshnessStatus` | `'fresh'` (immediately post-sync) | ✓ |
| `priceLastUpdatedAt` | timestamp of sync run | ✓ |
| `fundamentalsLastUpdatedAt` | timestamp of sync run | ✓ |
| `dataLastSyncedAt` | timestamp of sync run | ✓ |
| `data_provider_provenance['current_price'].provider` | `'tiingo'` | ✓ |
| `data_provider_provenance['gross_margin'].provider` | `'tiingo'` | ✓ |
| `data_provider_provenance['forward_pe'].provider` | `'fmp'` | ✓ |
| `data_provider_provenance[*].fallback_used` | `false` (all primary succeeded) | ✓ |

## Scope In
- `tests/integration/data-ingestion/behavioral-validation.test.ts` — live behavioral test suite
- **5 benchmark stocks:** AAPL, MSFT, TSLA, JPM, JNJ (one run per test suite execution; real APIs, no mocks)
- **Price accuracy tests:** assert currentPrice within ±10% of validated benchmark; assert `priceProvider = 'tiingo'`; assert `fallback_used = false`
- **Fundamental accuracy tests:**
  - Gross margin, operating margin stored as decimal ratios: assert within ±0.05 of validated benchmark
  - Revenue growth YoY and EPS growth YoY: assert within ±5pp of validated benchmark
  - ROIC: assert within ±0.10 of validated benchmark
  - D/E proxy (netDebtToEbitda): assert within ±0.30 of validated benchmark
  - Interest coverage: assert within ±5x of validated benchmark (where not null)
  - Null fields: assert null for `trailingPe`, `totalDebt`, `cashAndEquivalents`
- **Forward estimate tests:**
  - `forward_pe` field (NTM EPS): assert within ±$2.00/share of validated analyst consensus
  - `forward_ev_ebit` field (NTM EBIT): assert within ±$20,000M ($20B) of validated benchmark
  - NTM analyst count: assert ≥10 analysts for each ticker (confirms real coverage, not stale data)
  - assert `forward_pe provider = 'fmp'` and `fallback_used = false`
- **Freshness test:** assert `dataFreshnessStatus = 'fresh'` immediately after all three syncs complete
- **Provenance completeness test:** assert `data_provider_provenance` has entries for `current_price`, `gross_margin`, `forward_pe`
- **Cross-stock sanity tests:** AAPL gross margin > TSLA gross margin; MSFT operating margin > JPM operating margin; TSLA D/E < JPM D/E

## Scope Out
- Live universe sync (stocks are seeded directly with `inUniverse=true`)
- Market cap and sector assertions (universe sync not run; these fields will be null)
- Absolute P/E and EV/EBIT ratio validation (EPIC-005 responsibility)
- Computed fallback path validation (all 5 stocks have direct FMP coverage)

## Dependencies
- **Epic:** EPIC-003 — Data Ingestion & Universe Management
- **Upstream stories:** STORY-015 through STORY-024 (all adapters and sync jobs complete)
- **Live API keys required:** `TIINGO_API_KEY`, `FMP_API_KEY` in `.env.test`
- **User validation required:** All numeric benchmarks in "Data Captured for Validation" section above must be confirmed against Seeking Alpha before AC can be finalized

## Preconditions
- All STORY-015 through STORY-024 complete ✓
- Provider API keys functional ✓
- User has reviewed and confirmed/corrected all benchmark values in this document

## Acceptance Criteria

> **Note:** Items marked [PENDING] require user validation against Seeking Alpha. They will be confirmed and updated before implementation begins.

**Price accuracy:**
- [ ] AAPL price within ±10% of SA recent close [PENDING — benchmark: $273.05]
- [ ] MSFT price within ±10% of SA recent close [PENDING — benchmark: $418.07]
- [ ] TSLA price within ±10% of SA recent close [PENDING — benchmark: $392.50]
- [ ] JPM price within ±10% of SA recent close [PENDING — benchmark: $316.99]
- [ ] JNJ price within ±10% of SA recent close [PENDING — benchmark: $230.69]
- [ ] All 5 prices sourced from Tiingo (`price_provider = 'tiingo'`, `fallback_used = false`)

**Fundamental accuracy (margins as decimal ratios):**
- [ ] AAPL gross margin ≈ 0.48 ± 0.05 [PENDING — SA confirm ~46–50%]
- [ ] MSFT gross margin ≈ 0.68 ± 0.05 [PENDING — SA confirm ~68–70%]
- [ ] TSLA gross margin ≈ 0.20 ± 0.05 [PENDING — SA confirm ~17–22%]
- [ ] JNJ gross margin ≈ 0.68 ± 0.05 [PENDING — SA confirm ~68–70%]
- [ ] AAPL operating margin ≈ [PENDING — SA validate 35% vs expected ~30–33%]
- [ ] MSFT operating margin ≈ [PENDING — SA validate 60% vs expected ~44–46% — BC-025-001 must be resolved first]
- [ ] TSLA operating margin ≈ 0.05 ± 0.03 [PENDING — SA confirm ~5–8%]
- [ ] JNJ operating margin ≈ 0.21 ± 0.04 [PENDING — SA confirm ~20–22%]
- [ ] AAPL ROIC ≈ 1.15 ± 0.20 [PENDING — SA confirm very high ROIC]
- [ ] MSFT ROIC ≈ 0.44 ± 0.10 [PENDING — SA confirm ~35–45%]
- [ ] TSLA ROIC ≈ 0.08 ± 0.05 [PENDING — SA confirm ~7–10%]

**Revenue and EPS growth (after BC-025-001 resolved):**
- [ ] AAPL revenue growth YoY ≈ 7.2% ± 5pp [PENDING — SA validate]
- [ ] MSFT revenue growth YoY ≈ [PENDING — BC-025-001 must be resolved; 91.5% is wrong]
- [ ] TSLA revenue growth YoY ≈ 1.4% ± 5pp [PENDING — SA validate]
- [ ] TSLA EPS growth YoY ≈ -39.7% ± 10pp [PENDING — SA validate declining EPS]

**Forward estimates (NTM EPS in $/share stored in `forward_pe` field):**
- [ ] AAPL NTM EPS ≈ $8.49 ± $2.00 [PENDING — SA validate FY2026 consensus]
- [ ] MSFT NTM EPS ≈ $16.50 ± $2.00 [PENDING — SA validate FY2026 consensus]
- [ ] TSLA NTM EPS ≈ $1.94 ± $1.50 [PENDING — SA validate FY2026 consensus]
- [ ] JPM NTM EPS ≈ $22.13 ± $3.00 [PENDING — SA validate FY2026 consensus]
- [ ] JNJ NTM EPS ≈ $11.58 ± $2.00 [PENDING — SA validate FY2026 consensus]
- [ ] All 5 stocks: ≥10 analysts (confirmed from FMP: 30/26/25/13/13)

**Forward estimates (NTM EBIT in $M stored in `forward_ev_ebit` field):**
- [ ] AAPL NTM EBIT ≈ $155,769M ± $20,000M [PENDING — SA validate FY2026 EBIT estimate]
- [ ] MSFT NTM EBIT ≈ $144,085M ± $20,000M [PENDING — SA validate FY2026 EBIT estimate]
- [ ] TSLA NTM EBIT ≈ $11,453M [PENDING — SA validate; $11.5B vs recent actuals ~$2–3B looks high]
- [ ] All 5 stocks: `forward_pe provider = 'fmp'`, `fallback_used = false`

**Freshness and provenance:**
- [ ] All 5 stocks: `dataFreshnessStatus = 'fresh'` immediately post-sync
- [ ] All 5 stocks: `data_provider_provenance['current_price'].provider = 'tiingo'`
- [ ] All 5 stocks: `data_provider_provenance['gross_margin'].provider = 'tiingo'`
- [ ] All 5 stocks: `data_provider_provenance['forward_pe'].provider = 'fmp'`
- [ ] All 5 stocks: `fallback_used = false` in all provenance entries

**Null fields (by design, not bugs):**
- [ ] All 5 stocks: `trailingPe = null` (Tiingo tier limitation)
- [ ] All 5 stocks: `totalDebt = null` (not mapped in EPIC-003)
- [ ] All 5 stocks: `cashAndEquivalents = null` (not mapped in EPIC-003)
- [ ] AAPL, JPM: `interestCoverage = null` (DataCode unavailable at this tier)

**Cross-stock sanity invariants:**
- [ ] AAPL gross margin > TSLA gross margin (quality indicator: 0.48 > 0.20)
- [ ] MSFT operating margin > TSLA operating margin (0.60 > 0.05, even if 0.60 has a BC)
- [ ] TSLA D/E < JPM D/E (capital structure: 0.10 < 2.60)
- [ ] MSFT interest coverage > JNJ interest coverage (66.5x > 24.2x)

## Test Strategy Expectations
- Unit tests: not applicable (live API required)
- Integration tests:
  - All tests hit real Tiingo and FMP APIs; no mocks
  - Run with `@behavioral` tag to separate from nightly CI
  - `beforeAll`: seed 5 tickers, run full pipeline once (price + fundamentals + forward estimates)
  - `afterAll`: delete seeded tickers, disconnect Prisma
  - Timeout: 120s (real API round-trips for 5 tickers × 3 sync jobs)
- BDD acceptance tests:
  - "Given AAPL seeded and full pipeline run, then gross margin stored as ratio ≈ 0.48"
  - "Given MSFT seeded, then interest coverage > 50x (world-class coverage)"
  - "Given all 5 stocks synced, then no fallback provider used for price"
  - "Given TSLA seeded, then EPS growth YoY is negative (earnings declined)"

## Baseline Conflicts

### BC-025-001 — MSFT revenue growth 91.5% and EPS growth 102.3% (clearly wrong)
- **Baseline assumption:** Tiingo TTM revenue comparison gives correct YoY growth
- **Reality:** Pipeline returns 91.5% revenue growth and 102.3% EPS growth for MSFT. SA shows ~12–17% revenue growth and ~22–24% EPS growth for FY2025. The TTM comparison is misaligned — likely comparing quarters that span a non-comparable period (Activision acquisition closed Oct 2023 may have shifted which quarters are in each TTM window, or Tiingo's DataCode fiscal year reporting changed).
- **Resolution:** Investigate `TiingoAdapter.fetchFundamentals` TTM computation — check whether fiscal quarter alignment handles companies with mid-year acquisitions. May require adjusting the 8-quarter window or using Tiingo's annual DataCode instead of computed TTM. Must be resolved before AC rows for MSFT revenue/EPS growth can be finalized.
- **Status:** OPEN — pending investigation

### BC-025-002 — `forward_pe` and `forward_ev_ebit` fields store raw inputs, not computed ratios
- **Baseline assumption:** `forward_pe` DB column stores the actual forward price-to-earnings ratio; `forward_ev_ebit` stores the EV/EBIT multiple
- **Reality:** Per FMP adapter line 10 comment: "`forward_pe` stores raw `epsAvg` ($); `forward_ev_ebit` stores `ebitAvg` in millions — not ratios". These are the raw analyst inputs for EPIC-005's valuation computation, not the multiples themselves. The field naming is V1 technical debt.
- **Resolution:** Tests must assert raw input values ($EPS, $EBIT), not ratios. Document in test file. EPIC-005 will compute and overwrite with actual multiples.
- **Status:** KNOWN — tests will assert raw inputs with this documented explicitly

### BC-025-003 — JPM gross margin = 1.0 (not a meaningful metric for banks)
- **Baseline assumption:** Gross margin is a meaningful financial metric for all in-universe stocks
- **Reality:** Tiingo returns `grossMargin` DataCode = 1.0 for JPM (financial company; revenue ≈ gross profit; no COGS). The value is numerically "correct" per Tiingo's definition but has no analytical meaning for banks.
- **Resolution:** Test asserts `grossMargin = 1.0` for JPM (exact match, not a range). Document that `cyclicality_flag` and sector tagging (EPIC-004) will be used to suppress meaningless metrics for banks and insurers.
- **Status:** KNOWN — test documents this explicitly

### BC-025-004 — fcfMargin is gross margin (V1 proxy, not FCF margin)
- **Baseline assumption:** `fcfMargin` stores free cash flow margin
- **Reality:** `fundamentals-sync.service.ts` line: `data.fcfMargin = fundamentals.net_margin` which in turn gets `net_margin` from Tiingo's `grossMargin` DataCode (another V1 proxy). So `fcfMargin = grossMargin` for all stocks in EPIC-003.
- **Resolution:** Test asserts `fcfMargin === grossMargin` for all 5 stocks (the proxy relationship is correct for V1). Document EPIC-005 will replace with real FCF margin computation.
- **Status:** KNOWN — assert the proxy equality

## Definition of Done
- [ ] `tests/integration/data-ingestion/behavioral-validation.test.ts` created and passing
- [ ] BC-025-001 (MSFT growth figures) investigated and resolved
- [ ] BC-025-002, BC-025-003, BC-025-004 documented in test file
- [ ] All AC items confirmed (PENDING items resolved after user Seeking Alpha validation)
- [ ] All tests tagged `@behavioral`; run time < 120s
- [ ] No live API calls in any other test suite (this story is the designated live-data test)
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- PRD: Section 15 (Data Requirements)
- RFC: RFC-002 (stocks table schema), RFC-004 §Provider Abstraction Layer (canonical types)
- ADR: ADR-001 (multi-provider architecture — Tiingo primary, FMP fallback)
- Upstream: STORY-016 (Tiingo adapter), STORY-017 (FMP adapter), STORY-018–022 (sync jobs)
