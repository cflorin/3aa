-- EPIC-003/STORY-057: stock_quarterly_history table migration
-- RFC-008 §Data Collected; ADR-015 §Schema
-- Stores raw per-quarter financial data from Tiingo for each in-universe stock.
-- NULL means DataCode absent — never zero.

CREATE TABLE "stock_quarterly_history" (
    "id"                            BIGSERIAL PRIMARY KEY,
    "ticker"                        VARCHAR(10)     NOT NULL,

    -- Period metadata
    "fiscal_year"                   INTEGER         NOT NULL,
    "fiscal_quarter"                INTEGER         NOT NULL,
    "fiscal_period_end_date"        DATE,
    "reported_date"                 DATE,
    "calendar_year"                 INTEGER,
    "calendar_quarter"              INTEGER,
    "source_provider"               VARCHAR(50)     NOT NULL,
    "source_statement_type"         VARCHAR(50),
    "synced_at"                     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Raw financial fields (all nullable — NULL = DataCode absent, not zero)
    "revenue"                       DECIMAL(20, 2),
    "gross_profit"                  DECIMAL(20, 2),
    "operating_income"              DECIMAL(20, 2),
    "net_income"                    DECIMAL(20, 2),
    "capex"                         DECIMAL(20, 2),
    "cash_from_operations"          DECIMAL(20, 2),
    "free_cash_flow"                DECIMAL(20, 2),
    "share_based_compensation"      DECIMAL(20, 2),
    "depreciation_and_amortization" DECIMAL(20, 2),
    "diluted_shares_outstanding"    DECIMAL(20, 0),

    -- Per-quarter derived margins (computed inline by sync service; all nullable)
    "gross_margin"          DECIMAL(8, 6),
    "operating_margin"      DECIMAL(8, 6),
    "net_margin"            DECIMAL(8, 6),
    "cfo_to_net_income_ratio" DECIMAL(8, 6),
    "fcf_margin"            DECIMAL(8, 6),
    "sbc_as_pct_revenue"    DECIMAL(8, 6),
    "dilution_yoy"          DECIMAL(8, 6),

    CONSTRAINT "stock_quarterly_history_ticker_fkey"
        FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE,

    CONSTRAINT "uq_sqh_ticker_period_provider"
        UNIQUE ("ticker", "fiscal_year", "fiscal_quarter", "source_provider")
);

-- Efficient per-stock retrieval ordered newest-first (ADR-015 §Index)
CREATE INDEX "idx_sqh_ticker_period"
    ON "stock_quarterly_history" ("ticker", "fiscal_year" DESC, "fiscal_quarter" DESC);
