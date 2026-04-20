-- CreateTable
CREATE TABLE "framework_version" (
    "id" SERIAL NOT NULL,
    "version" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anchored_thresholds" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "bucket" INTEGER NOT NULL,
    "earnings_quality" CHAR(1) NOT NULL,
    "balance_sheet_quality" CHAR(1) NOT NULL,
    "primary_metric" VARCHAR(50) NOT NULL,
    "max_threshold" DECIMAL(10,2) NOT NULL,
    "comfortable_threshold" DECIMAL(10,2) NOT NULL,
    "very_good_threshold" DECIMAL(10,2) NOT NULL,
    "steal_threshold" DECIMAL(10,2) NOT NULL,
    "framework_version" VARCHAR(10) NOT NULL DEFAULT 'v1.0',
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anchored_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tsr_hurdles" (
    "id" SERIAL NOT NULL,
    "bucket" INTEGER NOT NULL,
    "base_hurdle_label" VARCHAR(20) NOT NULL,
    "base_hurdle_default" DECIMAL(5,2),
    "earnings_quality_a_adjustment" DECIMAL(5,2) NOT NULL DEFAULT -1.0,
    "earnings_quality_b_adjustment" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "earnings_quality_c_adjustment" DECIMAL(5,2) NOT NULL DEFAULT 2.5,
    "balance_sheet_a_adjustment" DECIMAL(5,2) NOT NULL DEFAULT -0.5,
    "balance_sheet_b_adjustment" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "balance_sheet_c_adjustment" DECIMAL(5,2) NOT NULL DEFAULT 1.75,
    "framework_version" VARCHAR(10) NOT NULL DEFAULT 'v1.0',
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tsr_hurdles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "ticker" VARCHAR(10) NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "sector" VARCHAR(100),
    "industry" VARCHAR(100),
    "country" VARCHAR(2) NOT NULL,
    "market_cap" DECIMAL(15,2),
    "in_universe" BOOLEAN NOT NULL DEFAULT true,
    "universe_status_changed_at" TIMESTAMPTZ(6),
    "current_price" DECIMAL(10,2),
    "revenue_growth_3y" DECIMAL(5,2),
    "revenue_growth_fwd" DECIMAL(5,2),
    "eps_growth_3y" DECIMAL(5,2),
    "eps_growth_fwd" DECIMAL(5,2),
    "gross_profit_growth" DECIMAL(5,2),
    "gross_margin" DECIMAL(5,2),
    "operating_margin" DECIMAL(5,2),
    "fcf_margin" DECIMAL(5,2),
    "fcf_conversion" DECIMAL(5,4),
    "roic" DECIMAL(5,4),
    "net_income_positive" BOOLEAN,
    "fcf_positive" BOOLEAN,
    "cash_and_equivalents" DECIMAL(15,2),
    "total_debt" DECIMAL(15,2),
    "net_debt_to_ebitda" DECIMAL(6,2),
    "interest_coverage" DECIMAL(8,2),
    "share_count_growth_3y" DECIMAL(5,2),
    "forward_pe" DECIMAL(8,2),
    "forward_pe_source" VARCHAR(20),
    "trailing_pe" DECIMAL(8,2),
    "forward_ev_ebit" DECIMAL(8,2),
    "forward_ev_ebit_source" VARCHAR(20),
    "trailing_ev_ebit" DECIMAL(8,2),
    "ev_sales" DECIMAL(8,2),
    "ev_sales_source" VARCHAR(20),
    "forward_operating_earnings_ex_excess_cash" DECIMAL(8,2),
    "forward_operating_earnings_ex_excess_cash_source" VARCHAR(20),
    "holding_company_flag" BOOLEAN DEFAULT false,
    "insurer_flag" BOOLEAN DEFAULT false,
    "cyclicality_flag" BOOLEAN DEFAULT false,
    "optionality_flag" BOOLEAN DEFAULT false,
    "binary_flag" BOOLEAN DEFAULT false,
    "market_pessimism_flag" BOOLEAN DEFAULT false,
    "pre_operating_leverage_flag" BOOLEAN DEFAULT false,
    "material_dilution_flag" BOOLEAN DEFAULT false,
    "fundamentals_last_updated_at" TIMESTAMPTZ(6),
    "price_last_updated_at" TIMESTAMPTZ(6),
    "data_last_synced_at" TIMESTAMPTZ(6),
    "data_provider_provenance" JSONB NOT NULL DEFAULT '{}',
    "data_freshness_status" VARCHAR(20) DEFAULT 'fresh',
    "data_quality_issues" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "classification_state" (
    "ticker" VARCHAR(10) NOT NULL,
    "suggested_bucket" INTEGER,
    "suggested_earnings_quality" CHAR(1),
    "suggested_balance_sheet_quality" CHAR(1),
    "suggested_code" VARCHAR(5),
    "confidence_level" VARCHAR(10) NOT NULL,
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "scores" JSONB NOT NULL,
    "classification_last_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classification_source" VARCHAR(20) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classification_state_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "classification_history" (
    "id" BIGSERIAL NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "old_suggested_code" VARCHAR(5),
    "old_final_code" VARCHAR(5),
    "old_confidence_level" VARCHAR(10),
    "new_suggested_code" VARCHAR(5),
    "new_final_code" VARCHAR(5),
    "new_confidence_level" VARCHAR(10),
    "change_reason" VARCHAR(50) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valuation_state" (
    "ticker" VARCHAR(10) NOT NULL,
    "active_code" VARCHAR(5) NOT NULL,
    "primary_metric" VARCHAR(50) NOT NULL,
    "metric_reason" VARCHAR(100),
    "current_multiple" DECIMAL(10,2),
    "current_multiple_basis" VARCHAR(20) DEFAULT 'spot',
    "max_threshold" DECIMAL(10,2),
    "comfortable_threshold" DECIMAL(10,2),
    "very_good_threshold" DECIMAL(10,2),
    "steal_threshold" DECIMAL(10,2),
    "threshold_source" VARCHAR(20) NOT NULL,
    "derived_from_code" VARCHAR(5),
    "threshold_adjustments" JSONB NOT NULL DEFAULT '[]',
    "base_tsr_hurdle_label" VARCHAR(20),
    "base_tsr_hurdle_default" DECIMAL(5,2),
    "adjusted_tsr_hurdle" DECIMAL(5,2) NOT NULL,
    "hurdle_source" VARCHAR(20) NOT NULL,
    "tsr_reason_codes" JSONB NOT NULL DEFAULT '[]',
    "valuation_zone" VARCHAR(20) NOT NULL,
    "valuation_state_status" VARCHAR(20) NOT NULL DEFAULT 'ready',
    "valuation_override_reason" TEXT,
    "valuation_override_timestamp" TIMESTAMPTZ(6),
    "valuation_last_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "valuation_state_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "valuation_history" (
    "id" BIGSERIAL NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "old_active_code" VARCHAR(5),
    "old_primary_metric" VARCHAR(50),
    "old_current_multiple" DECIMAL(10,2),
    "old_valuation_zone" VARCHAR(20),
    "old_adjusted_tsr_hurdle" DECIMAL(5,2),
    "new_active_code" VARCHAR(5),
    "new_primary_metric" VARCHAR(50),
    "new_current_multiple" DECIMAL(10,2),
    "new_valuation_zone" VARCHAR(20),
    "new_adjusted_tsr_hurdle" DECIMAL(5,2),
    "change_reason" VARCHAR(50) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_monitored_stocks" (
    "user_id" UUID NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "user_monitored_stocks_pkey" PRIMARY KEY ("user_id","ticker")
);

-- CreateTable
CREATE TABLE "user_classification_overrides" (
    "user_id" UUID NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "final_bucket" INTEGER,
    "final_earnings_quality" CHAR(1),
    "final_balance_sheet_quality" CHAR(1),
    "final_code" VARCHAR(5) NOT NULL,
    "override_reason" TEXT,
    "overridden_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overridden_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_classification_overrides_pkey" PRIMARY KEY ("user_id","ticker")
);

-- CreateTable
CREATE TABLE "user_valuation_overrides" (
    "user_id" UUID NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "max_threshold" DECIMAL(10,2),
    "comfortable_threshold" DECIMAL(10,2),
    "very_good_threshold" DECIMAL(10,2),
    "steal_threshold" DECIMAL(10,2),
    "override_reason" TEXT,
    "overridden_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_valuation_overrides_pkey" PRIMARY KEY ("user_id","ticker")
);

-- CreateTable
CREATE TABLE "user_alert_preferences" (
    "user_id" UUID NOT NULL,
    "muted_alert_families" JSONB NOT NULL DEFAULT '[]',
    "priority_threshold" VARCHAR(20) NOT NULL DEFAULT 'low',
    "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_digest_frequency" VARCHAR(20) NOT NULL DEFAULT 'daily',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_alert_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "default_sort" VARCHAR(50) NOT NULL DEFAULT 'zone_asc',
    "default_filters" JSONB NOT NULL DEFAULT '{}',
    "display_density" VARCHAR(20) NOT NULL DEFAULT 'comfortable',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_override_history" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "override_type" VARCHAR(20) NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "change_reason" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_override_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_monitoring_history" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "action_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_monitoring_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "alert_type" VARCHAR(50) NOT NULL,
    "alert_family" VARCHAR(20) NOT NULL,
    "priority" VARCHAR(10) NOT NULL,
    "summary_text" TEXT NOT NULL,
    "detail_payload" JSONB NOT NULL,
    "active_code" VARCHAR(5),
    "valuation_zone" VARCHAR(20),
    "current_multiple" DECIMAL(10,2),
    "threshold_source" VARCHAR(20),
    "alert_state" VARCHAR(20) NOT NULL DEFAULT 'active',
    "triggered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "dedup_key" VARCHAR(100) NOT NULL,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" BIGSERIAL NOT NULL,
    "alert_id" BIGINT NOT NULL,
    "user_id" UUID NOT NULL,
    "ticker" VARCHAR(10) NOT NULL,
    "old_alert_state" VARCHAR(20),
    "new_alert_state" VARCHAR(20),
    "transition_reason" VARCHAR(50),
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alert_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_version_version_key" ON "framework_version"("version");

-- CreateIndex
CREATE UNIQUE INDEX "anchored_thresholds_code_key" ON "anchored_thresholds"("code");

-- CreateIndex
CREATE INDEX "idx_anchored_thresholds_code" ON "anchored_thresholds"("code");

-- CreateIndex
CREATE INDEX "idx_anchored_thresholds_bucket" ON "anchored_thresholds"("bucket");

-- CreateIndex
CREATE INDEX "idx_anchored_thresholds_effective" ON "anchored_thresholds"("effective_from", "effective_until");

-- CreateIndex
CREATE UNIQUE INDEX "tsr_hurdles_bucket_key" ON "tsr_hurdles"("bucket");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_sessions_expires_at" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_stocks_sector" ON "stocks"("sector");

-- CreateIndex
CREATE INDEX "idx_stocks_data_freshness" ON "stocks"("data_freshness_status");

-- CreateIndex
CREATE INDEX "idx_classification_confidence" ON "classification_state"("confidence_level");

-- CreateIndex
CREATE INDEX "idx_classification_suggested_bucket" ON "classification_state"("suggested_bucket");

-- CreateIndex
CREATE INDEX "idx_classification_history_ticker" ON "classification_history"("ticker");

-- CreateIndex
CREATE INDEX "idx_classification_history_changed_at" ON "classification_history"("changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_classification_history_ticker_changed" ON "classification_history"("ticker", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_valuation_zone" ON "valuation_state"("valuation_zone");

-- CreateIndex
CREATE INDEX "idx_valuation_active_code" ON "valuation_state"("active_code");

-- CreateIndex
CREATE INDEX "idx_valuation_threshold_source" ON "valuation_state"("threshold_source");

-- CreateIndex
CREATE INDEX "idx_valuation_state_status" ON "valuation_state"("valuation_state_status");

-- CreateIndex
CREATE INDEX "idx_valuation_history_ticker" ON "valuation_history"("ticker");

-- CreateIndex
CREATE INDEX "idx_valuation_history_changed_at" ON "valuation_history"("changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_valuation_history_ticker_changed" ON "valuation_history"("ticker", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_valuation_history_zone_transitions" ON "valuation_history"("new_valuation_zone", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_monitored_stocks_user_id" ON "user_monitored_stocks"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_monitored_stocks_ticker" ON "user_monitored_stocks"("ticker");

-- CreateIndex
CREATE INDEX "idx_user_classification_overrides_user_id" ON "user_classification_overrides"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_classification_overrides_ticker" ON "user_classification_overrides"("ticker");

-- CreateIndex
CREATE INDEX "idx_user_valuation_overrides_user_id" ON "user_valuation_overrides"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_override_history_user_id" ON "user_override_history"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_override_history_ticker" ON "user_override_history"("ticker");

-- CreateIndex
CREATE INDEX "idx_user_override_history_changed_at" ON "user_override_history"("changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_monitoring_history_user_id" ON "user_monitoring_history"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_monitoring_history_action_at" ON "user_monitoring_history"("action_at" DESC);

-- CreateIndex
CREATE INDEX "idx_alerts_user_id" ON "alerts"("user_id");

-- CreateIndex
CREATE INDEX "idx_alerts_ticker" ON "alerts"("ticker");

-- CreateIndex
CREATE INDEX "idx_alerts_alert_state" ON "alerts"("alert_state");

-- CreateIndex
CREATE INDEX "idx_alerts_priority" ON "alerts"("priority");

-- CreateIndex
CREATE INDEX "idx_alerts_alert_family" ON "alerts"("alert_family");

-- CreateIndex
CREATE INDEX "idx_alerts_triggered_at" ON "alerts"("triggered_at" DESC);

-- CreateIndex
CREATE INDEX "idx_alerts_valuation_zone" ON "alerts"("valuation_zone");

-- CreateIndex
CREATE INDEX "idx_alert_history_alert_id" ON "alert_history"("alert_id");

-- CreateIndex
CREATE INDEX "idx_alert_history_ticker" ON "alert_history"("ticker");

-- CreateIndex
CREATE INDEX "idx_alert_history_transitioned_at" ON "alert_history"("transitioned_at" DESC);

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_state" ADD CONSTRAINT "classification_state_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_history" ADD CONSTRAINT "classification_history_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_state" ADD CONSTRAINT "valuation_state_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_history" ADD CONSTRAINT "valuation_history_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_monitored_stocks" ADD CONSTRAINT "user_monitored_stocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_monitored_stocks" ADD CONSTRAINT "user_monitored_stocks_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_classification_overrides" ADD CONSTRAINT "user_classification_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_classification_overrides" ADD CONSTRAINT "user_classification_overrides_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_classification_overrides" ADD CONSTRAINT "user_classification_overrides_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_valuation_overrides" ADD CONSTRAINT "user_valuation_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_valuation_overrides" ADD CONSTRAINT "user_valuation_overrides_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_alert_preferences" ADD CONSTRAINT "user_alert_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_override_history" ADD CONSTRAINT "user_override_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_override_history" ADD CONSTRAINT "user_override_history_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_monitoring_history" ADD CONSTRAINT "user_monitoring_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_monitoring_history" ADD CONSTRAINT "user_monitoring_history_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "stocks"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;
