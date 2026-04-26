# ADR-015: Quarterly History Storage Model

**Status:** ACCEPTED
**Date:** 2026-04-25
**Deciders:** Product Team
**Related:** RFC-008, RFC-002, RFC-001

---

## Context

RFC-008 defines a quarterly financial history layer. Two storage decisions are needed:

1. Where do raw quarterly financial rows live?
2. Where do derived trend metrics (classifier-facing fields) live?

These decisions affect schema migration scope, how `ClassificationInput` is assembled, and whether the existing `toClassificationInput()` mapper can be extended or needs redesigning.

---

## Options Considered

### Raw quarterly history storage

**Option A: Rows in `stock_quarterly_history` table (normalized)**
- One row per ticker × fiscal_year × fiscal_quarter
- FK to `stocks` on ticker
- Separate from the main `stocks` snapshot table

**Option B: JSONB column on `stocks` table**
- Store all quarter arrays as JSON blob
- No schema change beyond one column addition

### Derived metrics storage

**Option 1: Materialized into `stock_derived_metrics` table (one row per ticker)**
- Separate table, refreshed after each quarterly sync
- `toClassificationInput()` mapper JOINs this table
- Clean separation: ingestion writes `stock_quarterly_history`, computation writes `stock_derived_metrics`

**Option 2: Columns added directly to `stocks` table**
- Derived fields become additional columns on `stocks`
- `stocks` table becomes very wide (currently 50+ columns; adds ~25 more)
- Simpler JOIN (everything in one table)

**Option 3: Computed at query time from raw quarters**
- No derived storage
- Classification must compute trends on every batch run
- Expensive and non-deterministic across runs (timing of historical data changes)

---

## Decision

**Raw quarterly history:** Option A — separate `stock_quarterly_history` table.

**Derived trend metrics:** Option 1 — separate `stock_derived_metrics` table.

---

## Rationale

**Why normalized rows for quarterly history?**

- Raw quarter data changes independently of the `stocks` snapshot (different sync cadence, different trigger)
- A separate table allows clean upserts (UNIQUE on ticker + fiscal_year + fiscal_quarter + source_provider)
- JSONB blob (Option B) would make it impossible to query or index individual quarters efficiently
- Future alerting (PRD §5.4) needs to query individual quarters — normalized rows support this

**Why a separate `stock_derived_metrics` table?**

- The `stocks` table is already wide (50+ columns); adding 25 trend metric columns would make it very difficult to maintain and reason about
- Separation of concerns: `stocks` holds current-state snapshot; `stock_derived_metrics` holds computed trend summary
- `stock_derived_metrics` is regenerated entirely from `stock_quarterly_history` on each derivation run — it is a projection, not primary data. Treating it as a separate table reflects this correctly.
- The `toClassificationInput()` mapper can JOIN `stock_derived_metrics` as a second source, keeping the extension clean without modifying the existing fundamentals path
- If the quarterly history layer is unavailable or data is missing, all fields on `stock_derived_metrics` are NULL — the mapper handles this as absent enrichment without errors

**Why not compute at query time (Option 3)?**

- Classification batch runs against potentially 1000+ stocks; computing 4-quarter and 8-quarter regression slopes for every stock on every batch run would be expensive and non-deterministic
- Provenance requires recording which fiscal periods were used — this must be persisted, not recomputed

---

## Schema

### `stock_quarterly_history`

```sql
CREATE TABLE stock_quarterly_history (
  id                      BIGSERIAL PRIMARY KEY,
  ticker                  VARCHAR(10) NOT NULL REFERENCES stocks(ticker),
  fiscal_year             INTEGER NOT NULL,
  fiscal_quarter          INTEGER NOT NULL CHECK (fiscal_quarter BETWEEN 1 AND 4),
  fiscal_period_end_date  DATE NOT NULL,
  reported_date           DATE,
  calendar_year           INTEGER NOT NULL,
  calendar_quarter        INTEGER NOT NULL CHECK (calendar_quarter BETWEEN 1 AND 4),
  source_provider         VARCHAR(20) NOT NULL DEFAULT 'tiingo',
  source_statement_type   VARCHAR(50) NOT NULL DEFAULT 'quarterly_statements',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Raw financial fields (all nullable — NULL means DataCode absent, not zero)
  revenue                         NUMERIC(18,2),
  gross_profit                    NUMERIC(18,2),
  operating_income                NUMERIC(18,2),
  net_income                      NUMERIC(18,2),
  capex                           NUMERIC(18,2),
  cash_from_operations            NUMERIC(18,2),
  free_cash_flow                  NUMERIC(18,2),
  share_based_compensation        NUMERIC(18,2),
  depreciation_and_amortization   NUMERIC(18,2),
  diluted_shares_outstanding      NUMERIC(15,0),  -- may be derived: netinc/eps
  interest_expense                NUMERIC(18,2),  -- optional

  -- Per-quarter derived margins (computed on upsert)
  gross_margin                    NUMERIC(8,6),   -- ratio
  operating_margin                NUMERIC(8,6),
  net_margin                      NUMERIC(8,6),
  capex_margin                    NUMERIC(8,6),
  cfo_margin                      NUMERIC(8,6),
  fcf_margin                      NUMERIC(8,6),
  sbc_as_pct_revenue              NUMERIC(8,6),
  sbc_as_pct_cfo                  NUMERIC(8,6),
  cfo_to_net_income_ratio         NUMERIC(8,4),
  dilution_yoy                    NUMERIC(8,6),   -- vs same quarter prior year

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ticker, fiscal_year, fiscal_quarter, source_provider)
);

CREATE INDEX idx_sqh_ticker_period ON stock_quarterly_history (ticker, fiscal_year DESC, fiscal_quarter DESC);
```

### `stock_derived_metrics`

```sql
CREATE TABLE stock_derived_metrics (
  ticker                          VARCHAR(10) PRIMARY KEY REFERENCES stocks(ticker),
  quarters_available              INTEGER NOT NULL DEFAULT 0,
  derived_as_of                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- TTM from quarterly history (preferred over provider snapshot)
  revenue_ttm_qhist               NUMERIC(18,2),
  gross_profit_ttm_qhist          NUMERIC(18,2),
  operating_income_ttm_qhist      NUMERIC(18,2),
  net_income_ttm_qhist            NUMERIC(18,2),
  free_cash_flow_ttm_qhist        NUMERIC(18,2),
  cash_from_operations_ttm_qhist  NUMERIC(18,2),
  sbc_ttm_qhist                   NUMERIC(18,2),

  -- TTM ratios
  gross_margin_ttm_qhist          NUMERIC(8,6),
  operating_margin_ttm_qhist      NUMERIC(8,6),
  net_margin_ttm_qhist            NUMERIC(8,6),
  cfo_margin_ttm_qhist            NUMERIC(8,6),
  fcf_margin_ttm_qhist            NUMERIC(8,6),
  cfo_to_net_income_ratio_ttm     NUMERIC(8,4),
  sbc_as_pct_revenue_ttm          NUMERIC(8,6),
  sbc_as_pct_cfo_ttm              NUMERIC(8,6),

  -- Margin trajectory (numeric slopes, pp)
  gross_margin_trend_4q           NUMERIC(8,4),
  gross_margin_trend_8q           NUMERIC(8,4),
  operating_margin_trend_4q       NUMERIC(8,4),
  operating_margin_trend_8q       NUMERIC(8,4),
  fcf_margin_trend_4q             NUMERIC(8,4),
  fcf_margin_trend_8q             NUMERIC(8,4),
  cfo_margin_trend_4q             NUMERIC(8,4),

  -- Margin stability (scores 0.0–1.0)
  gross_margin_stability_score        NUMERIC(5,4),
  operating_margin_stability_score    NUMERIC(5,4),
  fcf_margin_stability_score          NUMERIC(5,4),
  cfo_to_net_income_stability_score   NUMERIC(5,4),

  -- Operating leverage
  operating_leverage_ratio_4q         NUMERIC(8,4),
  operating_leverage_ratio_8q         NUMERIC(8,4),
  gross_profit_drop_through_4q        NUMERIC(8,4),
  operating_leverage_emerging_flag    BOOLEAN,
  operating_margin_expansion_flag     BOOLEAN,
  operating_income_acceleration_flag  BOOLEAN,

  -- Earnings quality trend
  fcf_conversion_trend_4q             NUMERIC(8,4),
  fcf_conversion_trend_8q             NUMERIC(8,4),
  earnings_quality_trend_score        NUMERIC(5,4),   -- −1.0 to +1.0
  cash_earnings_support_flag          BOOLEAN,
  deteriorating_cash_conversion_flag  BOOLEAN,

  -- Dilution and SBC
  diluted_share_growth_1y             NUMERIC(8,6),
  diluted_share_growth_3y             NUMERIC(8,6),
  sbc_burden_score                    NUMERIC(8,6),   -- sbc_as_pct_revenue_ttm
  material_dilution_trend_flag        BOOLEAN,

  -- Capital intensity
  capex_intensity_trend_4q            NUMERIC(8,4),
  capex_intensity_trend_8q            NUMERIC(8,4),
  maintenance_capital_burden_proxy    NUMERIC(8,4),
  reinvestment_burden_signal          BOOLEAN,

  -- Provenance
  provenance  JSONB NOT NULL DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Consequences

### Positive

- `stocks` table remains focused on current-state snapshot; `stock_derived_metrics` is clearly a computed projection
- `toClassificationInput()` can extend with a nullable JOIN to `stock_derived_metrics` without touching the existing fundamentals path
- Clean audit: `stock_quarterly_history` preserves every quarter row with its reported_date; `stock_derived_metrics` records when derivation was last run
- Separate tables allow different refresh cadences (quarterly history: earnings-triggered; derived metrics: computed immediately after history update; stocks snapshot: nightly)
- Easy to repopulate: if the derivation logic changes, truncate `stock_derived_metrics` and rerun the computation from `stock_quarterly_history` without re-fetching from Tiingo

### Trade-offs

- Two additional JOINs in the classification pipeline (manageable for a universe of ~1000 stocks)
- Two migration files instead of one
- Derived metrics are not atomically consistent with quarterly history (small window between history write and derived recompute); acceptable given the batch cadence

### Rejected Alternatives

- **JSONB blob on stocks**: Unqueryable per-quarter; no index support; impossible to alert on individual quarter changes
- **Wide stocks table**: Would exceed 75 columns; makes schema reviews and migrations difficult; mixes snapshot data with computed trend data semantically
- **Compute at query time**: Non-deterministic across runs; expensive for full universe; breaks provenance recording
