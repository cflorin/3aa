# RFC-008: Quarterly Financial History & Earnings Quality Data Layer

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-25
**Dependencies:** RFC-002 (Data Model), RFC-004 (Ingestion), RFC-001 (Classification)
**Creates New Decisions:** YES — see ADR-015 (storage model), ADR-016 (refresh cadence)
**Refines Existing:** RFC-002 (entity additions), RFC-004 (pipeline stage additions), RFC-001 (ClassificationInput expansion)
**PRD Source:** `/docs/prd/prd_quarterly_financial_history_earnings_quality_data_layer.md`

---

## Context / Problem

The current classification engine operates entirely on point-in-time snapshot data. Fields like `fcf_conversion`, `net_margin`, `revenue_growth_3y`, and `eps_growth_3y` are single summary numbers — either pulled directly from provider APIs or computed as TTM aggregates on-the-fly. The engine cannot distinguish:

- structurally strong earnings from temporarily flattering earnings,
- genuinely improving operating leverage from a single good quarter,
- persistently healthy FCF conversion from noisy or deteriorating conversion,
- dilution-adjusted shareholder economics from reported profitability.

This creates systematic classification errors for:
- operating-leverage-emergence names (classified too conservatively or too aggressively based on one snapshot),
- cyclical names (current snapshot may catch them at a favorable or unfavorable cycle point),
- names where net income and cash generation diverge,
- businesses where SBC and dilution materially distort apparent profitability.

The system needs a quarterly financial history layer — persistent, per-quarter raw data and derived trend metrics — so classification can assess trajectory rather than just current state.

---

## Goals

1. Define the quarterly history data model (raw table + derived metrics table)
2. Define what data is collected and from which provider
3. Define the derived metric computation pipeline
4. Define the classifier-facing output interface
5. Define how the new data integrates into all three classification scorers and confidence computation
6. Define provenance requirements
7. Define the ingestion sync stage and its position in the nightly pipeline

---

## Non-Goals

1. Real-time or intraday data (V1 is EOD/earnings-triggered)
2. Full working capital signal framework
3. Segment-level reporting analysis
4. Restatement-detection engine
5. Full valuation redesign
6. UI redesign (UI impact is handled in EPIC-004 stories)

---

## Provider Decision

**Tiingo is the designated source for quarterly financial history.**

Rationale: The TiingoAdapter already calls `/tiingo/fundamentals/{ticker}/statements`, which returns an array of `QuarterlyReport` objects — each with `incomeStatement`, `balanceSheet`, `overview`, and `cashFlow` DataCode arrays. The existing `fetchFundamentals` implementation already filters annual rows (quarter=0), processes 16 quarters for 3-year CAGR, and reads DataCodes for revenue, grossProfit, netinc, ebit, depamor, eps, freeCashFlow, debt, cashAndEq, and equity. This confirms Tiingo provides the data at the current API tier.

A new adapter method `fetchQuarterlyStatements(ticker)` will expose the raw `QuarterlyReport[]` array (last 12+ quarters) without the aggregation that `fetchFundamentals` performs. No new API endpoint or plan tier change is required.

**DataCodes required (to be verified during implementation):**

| PRD Field | Tiingo DataCode (expected) | Section | Status |
|-----------|---------------------------|---------|--------|
| revenue | `revenue` | incomeStatement | Confirmed |
| gross_profit | `grossProfit` | incomeStatement | Confirmed |
| operating_income | `ebit` | incomeStatement | Confirmed (proxy) |
| net_income | `netinc` | incomeStatement | Confirmed |
| depreciation_and_amortization | `depamor` | incomeStatement | Confirmed |
| diluted_eps | `eps` | incomeStatement | Confirmed |
| free_cash_flow | `freeCashFlow` | cashFlow | Confirmed (tier-dependent) |
| capex | `capitalExpenditure` | cashFlow | To verify |
| cash_from_operations | `operatingCashFlow` | cashFlow | To verify |
| share_based_compensation | `stockBasedCompensation` | cashFlow | To verify |
| diluted_shares_outstanding | derived: `netinc / eps` | — | Derived |

Note: `diluted_shares_outstanding` is derivable as `netinc / eps` when both are non-null and eps ≠ 0. Direct DataCode availability should be checked; derivation is the fallback.

FMP is not used for quarterly history. FMP's `fetchFundamentals` uses `period=annual` at current plan tier.

---

## Data Collected

### Period Metadata (per quarter row)

```
ticker
fiscal_year
fiscal_quarter          -- 1–4
fiscal_period_end_date
reported_date           -- nullable
calendar_year
calendar_quarter
source_provider         -- always 'tiingo' (V1)
source_statement_type   -- 'quarterly_statements'
synced_at
```

### Raw Financial Fields (per quarter row)

**Required:**
```
revenue
gross_profit
operating_income        -- from ebit DataCode
net_income
capex                   -- to verify DataCode
cash_from_operations    -- to verify DataCode
free_cash_flow          -- null if DataCode unavailable at API tier
share_based_compensation -- to verify DataCode
depreciation_and_amortization
diluted_shares_outstanding -- derived from netinc/eps, or direct DataCode
```

**Optional (store if available):**
```
ebitda                  -- ebit + depamor if depamor DataCode available
interest_expense        -- intexp DataCode (already used in fetchFundamentals)
```

### Missing-Data Policy

- Any DataCode absent → field stored as NULL (not zero)
- NULL propagates through all derived computations that require it
- Division by zero denominator → derived field stored as NULL
- Negative values are preserved as-is (no sign coercion)

---

## Derived Per-Quarter Metrics

Computed and stored for each retained quarter:

```
gross_margin             = gross_profit / revenue
operating_margin         = operating_income / revenue
net_margin               = net_income / revenue
capex_margin             = capex / revenue
cfo_margin               = cash_from_operations / revenue
fcf_margin               = free_cash_flow / revenue
sbc_as_pct_revenue       = share_based_compensation / revenue
sbc_as_pct_cfo           = share_based_compensation / cash_from_operations
cfo_to_net_income_ratio  = cash_from_operations / net_income
dilution_yoy             = (diluted_shares_Q vs same fiscal_quarter prior year) / prior - 1
```

All denominator-zero or denominator-null cases yield NULL.

---

## Derived TTM Metrics

Computed from the latest 4 fiscal quarters:

```
-- Sums
revenue_ttm_qhist
gross_profit_ttm_qhist
operating_income_ttm_qhist
net_income_ttm_qhist
capex_ttm_qhist
cash_from_operations_ttm_qhist
free_cash_flow_ttm_qhist
sbc_ttm_qhist
depreciation_and_amortization_ttm_qhist

-- Ratios (computed from TTM sums, not averaged quarter ratios)
gross_margin_ttm_qhist
operating_margin_ttm_qhist
net_margin_ttm_qhist
capex_margin_ttm_qhist
cfo_margin_ttm_qhist
fcf_margin_ttm_qhist
cfo_to_net_income_ratio_ttm
sbc_as_pct_revenue_ttm
sbc_as_pct_cfo_ttm
```

These TTM values are computed from stored quarterly history (fiscal-calendar aware) and are more accurate than the provider-supplied TTM snapshots. When both exist, the quarterly-derived TTM values take precedence in classification input.

---

## Derived Fiscal-Year Rollups

For each completed fiscal year in the retained horizon:

```
revenue_fy, gross_profit_fy, operating_income_fy, net_income_fy
capex_fy, cash_from_operations_fy, free_cash_flow_fy, diluted_shares_fy

gross_margin_fy, operating_margin_fy, net_margin_fy
capex_margin_fy, cfo_margin_fy, fcf_margin_fy
cfo_to_net_income_ratio_fy
```

FY rollups support multi-year smoothing and 3-year trend summaries.

---

## Trend and Trajectory Metrics

### Field Type Convention

| Type | Description | Examples |
|------|-------------|---------|
| **Numeric slope/rate** | Net change or regression slope over the window | `operating_margin_trend_4q`, `operating_leverage_ratio_4q` |
| **Numeric score (0.0–1.0)** | Normalized stability; 1.0 = perfectly stable | `operating_margin_stability_score`, `fcf_margin_stability_score` |
| **Numeric score (−1.0 to +1.0)** | Composite quality direction | `earnings_quality_trend_score` |
| **Boolean flag** | Clean threshold crossing for rule-based scoring | `operating_leverage_emerging_flag`, `deteriorating_cash_conversion_flag` |

Rationale: Numeric slopes and scores enable graduated scoring weights in the classifier (consistent with the additive A/B/C scoring architecture). Boolean flags fire clean integer point additions in scoring rules — consistent with existing flag architecture (e.g., `insurer_flag`, `material_dilution_flag`).

### Margin Trajectory (numeric slopes)

```
gross_margin_trend_4q           -- net change in gross_margin over 4 quarters (pp)
gross_margin_trend_8q
operating_margin_trend_4q
operating_margin_trend_8q
fcf_margin_trend_4q
fcf_margin_trend_8q
cfo_margin_trend_4q
cfo_margin_trend_8q
```

Definition: net change = (most recent quarter value − oldest quarter value in window) expressed in percentage points. Regression slope is an acceptable alternative; exact formula fixed in implementation.

### Margin Stability (numeric scores, 0.0–1.0)

```
gross_margin_stability_score
operating_margin_stability_score
fcf_margin_stability_score
cfo_to_net_income_stability_score
```

Definition: 1.0 − (normalized dispersion over last 8 quarters). Dispersion = coefficient of variation or interquartile range normalized to [0, 1]. Higher score = more stable. NULL when fewer than 4 quarters available.

### Operating Leverage (numeric + boolean)

```
-- Numeric
operating_leverage_ratio_4q          -- Δ operating_income / Δ revenue over 4 quarters
operating_leverage_ratio_8q
gross_profit_drop_through_4q         -- Δ gross_profit / Δ revenue over 4 quarters

-- Boolean
operating_income_acceleration_flag   -- operating_leverage_ratio_4q > 1.5 for 2+ consecutive periods
operating_margin_expansion_flag      -- operating_margin_trend_4q > 1.5pp
operating_leverage_emerging_flag     -- composite: expansion + drop_through + acceleration all positive
```

### Earnings Quality Trend (numeric + boolean)

```
-- Numeric
fcf_conversion_trend_4q              -- trend of (free_cash_flow / net_income) over 4 quarters
fcf_conversion_trend_8q
earnings_quality_trend_score         -- composite: −1.0 (deteriorating) to +1.0 (improving)

-- Boolean
cash_earnings_support_flag           -- cfo_to_net_income_ratio_ttm > 0.85
deteriorating_cash_conversion_flag   -- fcf_conversion_trend_4q < −0.10 over 4+ quarters
```

### Dilution Metrics (numeric + boolean)

```
-- Numeric
diluted_share_growth_1y              -- (shares_Q4_current / shares_Q4_prior_year) - 1
diluted_share_growth_3y              -- 3-year CAGR of diluted shares
sbc_burden_score                     -- sbc_as_pct_revenue_ttm; lower = better (0.0–∞)

-- Boolean
material_dilution_trend_flag         -- diluted_share_growth_1y > 0.03 AND diluted_share_growth_3y > 0.02
```

Note: The existing `material_dilution_flag` on the `stocks` table is based on `share_count_growth_3y > 0.05` (deterministic, EPIC-003). The new `material_dilution_trend_flag` computed from quarterly history will replace it as the authoritative signal once the quarterly history layer is live.

### Capital Intensity (numeric)

```
capex_intensity_trend_4q             -- trend of capex_margin over 4 quarters (pp)
capex_intensity_trend_8q
maintenance_capital_burden_proxy     -- capex_ttm_qhist / depreciation_and_amortization_ttm_qhist
reinvestment_burden_signal           -- capex_intensity_trend_4q > 0.02 (boolean)
```

---

## Classifier-Facing Derived Fields

EPIC-004 scorers must not interpret raw quarter tables. The derived metrics layer publishes the following as structured fields in `stock_derived_metrics` (see ADR-015):

```typescript
interface StockDerivedMetrics {
  ticker: string;

  // Margin trajectory
  operating_margin_trend_4q: number | null;
  operating_margin_trend_8q: number | null;
  gross_margin_trend_4q: number | null;
  fcf_margin_trend_4q: number | null;
  fcf_margin_trend_8q: number | null;
  cfo_margin_trend_4q: number | null;

  // Margin stability
  gross_margin_stability_score: number | null;
  operating_margin_stability_score: number | null;
  fcf_margin_stability_score: number | null;
  cfo_to_net_income_stability_score: number | null;

  // Operating leverage
  operating_leverage_ratio_4q: number | null;
  operating_leverage_ratio_8q: number | null;
  gross_profit_drop_through_4q: number | null;
  operating_leverage_emerging_flag: boolean | null;
  operating_margin_expansion_flag: boolean | null;
  operating_income_acceleration_flag: boolean | null;

  // Earnings quality trend
  fcf_conversion_trend_4q: number | null;
  fcf_conversion_trend_8q: number | null;
  earnings_quality_trend_score: number | null;
  cash_earnings_support_flag: boolean | null;
  deteriorating_cash_conversion_flag: boolean | null;

  // Dilution and SBC
  diluted_share_growth_1y: number | null;
  diluted_share_growth_3y: number | null;
  sbc_burden_score: number | null;
  material_dilution_trend_flag: boolean | null;

  // Capital intensity
  capex_intensity_trend_4q: number | null;
  reinvestment_burden_signal: boolean | null;
  maintenance_capital_burden_proxy: number | null;

  // TTM from quarterly history (preferred over provider snapshot)
  revenue_ttm_qhist: number | null;
  operating_income_ttm_qhist: number | null;
  net_income_ttm_qhist: number | null;
  free_cash_flow_ttm_qhist: number | null;
  cfo_to_net_income_ratio_ttm: number | null;

  // Metadata
  quarters_available: number;
  derived_as_of: Date;
  provenance: Record<string, DerivedFieldProvenance>;
}

interface DerivedFieldProvenance {
  source_provider: string;
  fiscal_periods_used: string[];   // ['FY2024Q1', 'FY2024Q2', ...]
  calculation_method: string;
  computed_at: Date;
  fallback_used: boolean;
}
```

---

## Use in Classification

### Bucket Scorer (growth rate estimation)

The 12-quarter revenue history enables better growth rate estimation:
- Revenue TTM from quarterly history (fiscal-calendar aligned) supplements or replaces the forward estimate when forward estimates are missing or unreliable.
- 4-quarter and 8-quarter revenue growth slopes can be used to assess whether the forward estimate is plausible given recent trend.
- Operating leverage ratio signals can inform tie-break decisions (e.g., 4 vs 5 boundary).

The forward estimate remains primary for Buckets 1–4; quarterly-derived growth context is a supporting signal.

### Earnings Quality Scorer (primary consumer)

The EQ scorer will be substantially revised once quarterly history fields are live:

| Signal Type | Old Logic (interim) | New Logic (quarterly-driven) |
|-------------|--------------------|-----------------------------|
| FCF quality | Point-in-time fcf_conversion | `fcf_conversion_trend_4q`, `cash_earnings_support_flag` |
| Margin stability | Point-in-time net_margin | `operating_margin_stability_score`, `fcf_margin_stability_score` |
| Earnings reliability | eps/rev spread proxy (interim) | `earnings_quality_trend_score`, `deteriorating_cash_conversion_flag` |
| SBC/dilution | `material_dilution_flag` (annual) | `sbc_burden_score`, `material_dilution_trend_flag` (quarterly) |
| Operating leverage | `pre_operating_leverage_flag` (static) | `operating_leverage_emerging_flag`, `operating_margin_expansion_flag` |

The current proxy signals (including `EQ_EPS_DECLINING`, `EQ_EPS_REV_SPREAD_MODERATE`, `EQ_EPS_REV_SPREAD_SEVERE` added 2026-04-25) are interim signals that will be replaced by the corresponding quarterly-derived signals once the data layer is live. They should be retained as fallback logic only when `quarters_available < 4`.

### Balance Sheet Scorer

The BS scorer gains dilution trajectory signals:
- `material_dilution_trend_flag` becomes the preferred dilution signal once quarterly history is live; `material_dilution_flag` (deterministic, STORY-033) is retained as fallback when `quarters_available < 4` and coexists during rollout.
- `reinvestment_burden_signal` can inform capital intensity scoring.

**`material_dilution_flag` transition:** The existing `material_dilution_flag` (based on `share_count_growth_3y > 0.05`, set by STORY-033) is NOT deprecated immediately. During the transition period while quarterly history is being populated, both flags coexist — the scorer uses `material_dilution_trend_flag` when `quarters_available >= 4`, and falls back to `material_dilution_flag` otherwise. A future story will formally deprecate `material_dilution_flag` once the universe is fully covered.

**`pre_operating_leverage_flag` scope:** The EQ scorer revision table above shows `pre_operating_leverage_flag` being replaced by `operating_leverage_emerging_flag` in the EQ scorer context. This refers to the EQ scorer only. The bucket scorer (Bucket 5 tie-break) continues to use `pre_operating_leverage_flag` as before — `operating_leverage_emerging_flag` is a complementary EQ-scorer signal, not a bucket-scorer replacement. `pre_operating_leverage_flag` is not deprecated.

### Confidence Computer

Confidence degradation rules add a new category: **trajectory quality**:

- `quarters_available < 4` → forced LOW confidence (insufficient history)
- `quarters_available < 8` → forced MEDIUM confidence ceiling
- `operating_margin_stability_score < 0.5` → confidence penalty (noisy name)
- `deteriorating_cash_conversion_flag = true` AND classification is EQ-A or EQ-B → confidence penalty
- Trend fields consistently NULL (DataCode gaps) → confidence penalty proportional to null count

See ADR-014 for updated confidence threshold table.

---

## Ingestion Sync Architecture

### New Pipeline Stage: Quarterly History Sync

Position in nightly batch: **after Fundamentals Sync, before Classification Recompute** (see ADR-016 for cadence decision — earnings-triggered, not nightly).

This section defines the architectural intent of the sync stage. Implementation-level pipeline detail — including the exact sync algorithm, adapter method spec, and recompute trigger query — is authoritative in RFC-004 Amendment 2026-04-25.

Architectural summary:
1. Per in-universe stock: call `TiingoAdapter.fetchQuarterlyStatements(ticker)`; compare returned quarter `reported_date` values against stored rows; upsert new or changed quarter rows into `stock_quarterly_history`.
2. For stocks with new/changed quarter rows: compute all derived metrics and upsert `stock_derived_metrics` row, updating `derived_as_of` to current timestamp.
3. Classification batch detects stocks needing recompute by comparing `stock_derived_metrics.derived_as_of` against `classification_state.classification_last_updated_at`. No extra flag column.

### Recompute Trigger

`shouldRecompute` gains a new trigger type: `quarterly_data_updated`, fired when `stock_derived_metrics.derived_as_of > classification_state.classification_last_updated_at`. See ADR-016 for the full trigger mechanism and the earnings-triggered cadence decision.

### New Adapter Method

```typescript
// TiingoAdapter — new method
async fetchQuarterlyStatements(ticker: string): Promise<QuarterlyReport[] | null>;
// Returns raw QuarterlyReport[] sorted newest-first (quarter ≠ 0 only)
// Reuses existing /tiingo/fundamentals/{ticker}/statements endpoint
// No additional API call — same endpoint as fetchFundamentals
```

---

## Storage Model

See ADR-015 for the full storage decision.

Summary:
- Raw quarterly data: new table `stock_quarterly_history`
- Derived trend metrics: new table `stock_derived_metrics` (one row per ticker, current-state snapshot)
- Classifier-facing fields: assembled from `stock_derived_metrics` JOIN via `toClassificationInput()` extension

---

## Provenance Requirements

For every derived field published to `stock_derived_metrics`:
- `source_provider`: always 'tiingo' (V1)
- `fiscal_periods_used`: list of fiscal_year/quarter strings used in computation
- `calculation_method`: human-readable formula description
- `computed_at`: timestamp of derivation
- `fallback_used`: true if fewer than expected quarters were available

Stored in `stock_derived_metrics.provenance` as JSONB.

---

## Missing-Data Handling

| Condition | Behavior |
|-----------|---------|
| Tiingo returns null/empty for ticker | No rows written; derived fields all NULL |
| Some DataCodes absent | NULL stored for those fields only; other fields computed normally |
| Fewer than 4 quarters available | TTM rollups NULL; trend metrics NULL; confidence → LOW |
| Fewer than 8 quarters available | 8-quarter trend metrics NULL; 4-quarter trends computed; confidence → MEDIUM ceiling |
| Denominator zero or NULL | Derived ratio stored as NULL |

---

## Non-Functional Requirements

- **Deterministic:** Same raw inputs → same derived outputs on every run
- **Incremental:** Only recompute derived metrics for stocks with new/changed quarter rows
- **Auditability:** All provenance stored; classification change traceable to specific quarter update
- **Explainability:** Every derived field traceable to source periods and formula

---

## Amendments

*(This section records post-acceptance amendments.)*

| Date | Description |
|------|-------------|
| — | — |
