-- EPIC-003/STORY-058: stock_derived_metrics table migration
-- RFC-008 §Classifier-Facing Derived Fields; ADR-015 §Schema
-- One row per ticker; classifier-facing derived fields produced by the computation pipeline.
-- derived_as_of is the key field for the shouldRecompute quarterly_data_updated trigger (ADR-016).

CREATE TABLE "stock_derived_metrics" (
    "ticker"                VARCHAR(10)     NOT NULL PRIMARY KEY,

    -- Computation metadata
    "derived_as_of"         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "quarters_available"    INTEGER         NOT NULL DEFAULT 0,
    "provenance"            JSONB           NOT NULL DEFAULT '{}',

    -- TTM rollups (sum of latest 4 quarters)
    "revenue_ttm"                       DECIMAL(20, 2),
    "gross_profit_ttm"                  DECIMAL(20, 2),
    "operating_income_ttm"              DECIMAL(20, 2),
    "net_income_ttm"                    DECIMAL(20, 2),
    "capex_ttm"                         DECIMAL(20, 2),
    "cash_from_operations_ttm"          DECIMAL(20, 2),
    "free_cash_flow_ttm"                DECIMAL(20, 2),
    "share_based_compensation_ttm"      DECIMAL(20, 2),
    "depreciation_and_amortization_ttm" DECIMAL(20, 2),

    -- TTM-level margin ratios
    "gross_margin_ttm"          DECIMAL(8, 6),
    "operating_margin_ttm"      DECIMAL(8, 6),
    "net_margin_ttm"            DECIMAL(8, 6),
    "fcf_margin_ttm"            DECIMAL(8, 6),
    "sbc_as_pct_revenue_ttm"    DECIMAL(8, 6),
    "cfo_to_net_income_ratio_ttm" DECIMAL(8, 6),

    -- Margin trajectory slopes (pp change per quarter)
    "gross_margin_slope_4q"     DECIMAL(10, 6),
    "operating_margin_slope_4q" DECIMAL(10, 6),
    "net_margin_slope_4q"       DECIMAL(10, 6),
    "gross_margin_slope_8q"     DECIMAL(10, 6),
    "operating_margin_slope_8q" DECIMAL(10, 6),
    "net_margin_slope_8q"       DECIMAL(10, 6),

    -- Stability scores (0.0–1.0; null when < 4 quarters)
    "operating_margin_stability_score"  DECIMAL(4, 3),
    "gross_margin_stability_score"      DECIMAL(4, 3),
    "net_margin_stability_score"        DECIMAL(4, 3),

    -- Operating leverage
    "operating_leverage_ratio"          DECIMAL(10, 4),
    "operating_income_acceleration_flag" BOOLEAN,
    "operating_leverage_emerging_flag"  BOOLEAN,

    -- Earnings quality
    "earnings_quality_trend_score"      DECIMAL(4, 3),
    "deteriorating_cash_conversion_flag" BOOLEAN,

    -- Dilution & SBC
    "diluted_shares_outstanding_change_4q" DECIMAL(8, 4),
    "diluted_shares_outstanding_change_8q" DECIMAL(8, 4),
    "material_dilution_trend_flag"      BOOLEAN,
    "sbc_burden_score"                  DECIMAL(4, 3),

    -- Capital intensity
    "capex_to_revenue_ratio_avg_4q"     DECIMAL(8, 4),
    "capex_intensity_increasing_flag"   BOOLEAN,

    CONSTRAINT "stock_derived_metrics_ticker_fkey"
        FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE
);
