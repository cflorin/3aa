# RFC-002: Canonical Data Model & Persistence Layer

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-19
**Dependencies:** None
**Creates New Decisions:** YES
**Refines Existing:** NO

---

## Context / Problem

All V1 engines (classification, valuation, monitoring) require a canonical data model to persist state and maintain audit history. Without a unified schema, each engine would create incompatible structures.

**V1 is a multi-user web application** (ADR-007). Data model must support:
- **Shared system state:** Classification/valuation computed once, visible to all users
- **Per-user state:** User overrides, monitored stocks, alerts, preferences
- User authentication and session management

Requirements:
- Preserve both system-generated and user-overridden values
- Full audit trail for all state transitions
- Support classification state, valuation state, alerts
- Enable historical reconstruction
- Store framework configuration (anchored thresholds, TSR hurdles)
- **NEW:** User accounts, authentication, per-user monitoring

---

## Goals

1. Define complete entity schema for all V1 entities
2. Establish audit trail structure (full state vs deltas)
3. Design indexing strategy for query performance
4. Specify data retention policies
5. Define framework configuration storage approach

---

## Non-Goals

1. Database technology selection (Postgres vs MySQL) - implementation detail
2. Backup/recovery procedures - operational concern
3. Replication strategy - deployment concern
4. ORM choice - implementation detail
5. Migration tooling - implementation detail

---

## Core Entities

### Entity Relationship Overview

```
                    ┌─────────────────────────────────────┐
                    │     SHARED (System-Computed)        │
                    └─────────────────────────────────────┘

stocks (1) ──┬─→ (1) classification_state (shared suggestions)
             │     └─→ (0..n) classification_history
             │
             ├─→ (1) valuation_state (shared computation)
             │     └─→ (0..n) valuation_history
             │
             ├─→ (0..n) stock_quarterly_history  [RFC-008 addition]
             │     (one row per fiscal quarter; raw financial data + per-quarter margins)
             │
             ├─→ (0..1) stock_derived_metrics    [RFC-008 addition]
             │     (one row per ticker; computed trend/trajectory fields for EPIC-004 classification)
             │
             └─→ (framework_config: anchored_thresholds, tsr_hurdles, framework_version)


                    ┌─────────────────────────────────────┐
                    │     USER-SCOPED (Per-User)          │
                    └─────────────────────────────────────┘

users (1) ──┬─→ (0..n) user_sessions
            │
            ├─→ (0..n) user_monitored_stocks ─→ (1) stocks
            │
            ├─→ (0..n) user_classification_overrides ─→ (1) stocks
            │
            ├─→ (0..n) user_valuation_overrides ─→ (1) stocks
            │
            ├─→ (0..n) alerts (per-user)
            │     └─→ (0..n) alert_history (per-user)
            │
            ├─→ (1) user_alert_preferences
            │
            └─→ (1) user_preferences
```

---

## Schema Definitions

### stocks

```sql
CREATE TABLE stocks (
  ticker VARCHAR(10) PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  industry VARCHAR(100),
  country VARCHAR(2) NOT NULL CHECK (country = 'US'), -- V1: US only

  -- Universe eligibility
  market_cap NUMERIC(15,2), -- in millions USD
  in_universe BOOLEAN NOT NULL DEFAULT TRUE,
  universe_status_changed_at TIMESTAMPTZ,

  -- Current fundamentals (refreshed by ingestion pipeline)
  current_price NUMERIC(10,2),

  -- Growth metrics
  revenue_growth_3y NUMERIC(5,2), -- percentage
  revenue_growth_fwd NUMERIC(5,2),
  eps_growth_3y NUMERIC(5,2),
  eps_growth_fwd NUMERIC(5,2),
  gross_profit_growth NUMERIC(5,2),

  -- Profitability metrics
  gross_margin NUMERIC(5,2),
  operating_margin NUMERIC(5,2),
  fcf_margin NUMERIC(5,2),
  fcf_conversion NUMERIC(5,4), -- ratio 0-1
  roic NUMERIC(5,4), -- ratio
  net_income_positive BOOLEAN,
  fcf_positive BOOLEAN,

  -- Balance sheet metrics
  cash_and_equivalents NUMERIC(15,2), -- millions
  total_debt NUMERIC(15,2), -- millions
  net_debt_to_ebitda NUMERIC(6,2), -- ratio
  interest_coverage NUMERIC(8,2), -- ratio
  share_count_growth_3y NUMERIC(5,2), -- percentage

  -- Valuation metrics (with provenance tracking)
  forward_pe NUMERIC(8,2),
  forward_pe_source VARCHAR(20) CHECK (
    forward_pe_source IN ('tiingo', 'computed_trailing', 'manual_override', 'missing')
  ),
  trailing_pe NUMERIC(8,2), -- Fallback for forward_pe computation

  forward_ev_ebit NUMERIC(8,2),
  forward_ev_ebit_source VARCHAR(20) CHECK (
    forward_ev_ebit_source IN ('tiingo', 'computed_trailing', 'manual_override', 'missing')
  ),
  trailing_ev_ebit NUMERIC(8,2), -- Fallback for forward_ev_ebit computation

  ev_sales NUMERIC(8,2),
  ev_sales_source VARCHAR(20) CHECK (
    ev_sales_source IN ('tiingo', 'computed', 'manual_override', 'missing')
  ),

  forward_operating_earnings_ex_excess_cash NUMERIC(8,2),
  forward_operating_earnings_ex_excess_cash_source VARCHAR(20) CHECK (
    forward_operating_earnings_ex_excess_cash_source IN ('manual_override', 'missing')
  ), -- V1: No automated source for this metric

  -- Classification flags (auto-detected via classification enrichment pipeline; manual override supported)
  -- Sourcing detail in RFC-001 Amendment 2026-04-21 and ADR-012.
  holding_company_flag BOOLEAN DEFAULT FALSE,         -- hybrid: SIC heuristic + LLM (EPIC-003.1)
  insurer_flag BOOLEAN DEFAULT FALSE,                 -- deterministic: SIC 6311-6399 / industry (EPIC-003)
  cyclicality_flag BOOLEAN DEFAULT FALSE,             -- hybrid: sector rules + LLM ambiguous (EPIC-003.1)
  optionality_flag BOOLEAN DEFAULT FALSE,             -- manual only (no auto-detection planned)
  binary_flag BOOLEAN DEFAULT FALSE,                  -- hybrid: biotech heuristic + LLM (EPIC-003.1)
  market_pessimism_flag BOOLEAN DEFAULT FALSE,        -- manual only (no auto-detection planned)
  pre_operating_leverage_flag BOOLEAN DEFAULT FALSE,  -- deterministic: revenue_ttm < $50M (EPIC-003)
  material_dilution_flag BOOLEAN DEFAULT FALSE,       -- deterministic_computed: share_count_growth_3y > 0.05 (EPIC-003)

  -- Data freshness (V1: Multi-provider support - see ADR-001)
  fundamentals_last_updated_at TIMESTAMPTZ,
  price_last_updated_at TIMESTAMPTZ,
  data_last_synced_at TIMESTAMPTZ, -- Last successful provider sync
  data_provider_provenance JSONB DEFAULT '{}', -- Per-field provider tracking
  data_freshness_status VARCHAR(20) CHECK (
    data_freshness_status IN ('fresh', 'stale', 'missing')
  ) DEFAULT 'fresh',
  data_quality_issues JSONB DEFAULT '[]', -- Array of data quality warnings

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stocks_in_universe ON stocks(in_universe) WHERE in_universe = TRUE;
CREATE INDEX idx_stocks_market_cap ON stocks(market_cap) WHERE in_universe = TRUE;
CREATE INDEX idx_stocks_sector ON stocks(sector);
CREATE INDEX idx_stocks_data_freshness ON stocks(data_freshness_status);
```

---

### classification_state (SHARED - System Suggestions)

**IMPORTANT:** This table stores system-computed classifications visible to all users. User overrides are stored in `user_classification_overrides` (per-user table).

```sql
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- Suggested classification (system-generated, shared across all users)
  suggested_bucket INT CHECK (suggested_bucket BETWEEN 1 AND 8),
  suggested_earnings_quality CHAR(1) CHECK (suggested_earnings_quality IN ('A', 'B', 'C')),
  suggested_balance_sheet_quality CHAR(1) CHECK (suggested_balance_sheet_quality IN ('A', 'B', 'C')),
  suggested_code VARCHAR(5), -- e.g., "4AA"

  -- Confidence and reasoning
  confidence_level VARCHAR(10) NOT NULL CHECK (confidence_level IN ('high', 'medium', 'low')),
  reason_codes JSONB NOT NULL DEFAULT '[]', -- Array of reason code strings
  scores JSONB NOT NULL, -- {bucket: {1: 2, 2: 3, ...}, earnings_quality: {...}, balance_sheet_quality: {...}}

  -- Metadata
  classification_last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classification_source VARCHAR(20) NOT NULL CHECK (
    classification_source IN ('auto', 'recompute', 'initial')
  ),

  -- Audit support
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classification_confidence ON classification_state(confidence_level);
CREATE INDEX idx_classification_suggested_bucket ON classification_state(suggested_bucket);
```

**Note:** Removed `final_code`, `override_reason`, `override_timestamp`, `classification_status` - these are now in `user_classification_overrides` (per-user).

---

### classification_history

```sql
CREATE TABLE classification_history (
  id BIGSERIAL PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- Old state (before change)
  old_suggested_code VARCHAR(5),
  old_final_code VARCHAR(5),
  old_confidence_level VARCHAR(10),

  -- New state (after change)
  new_suggested_code VARCHAR(5),
  new_final_code VARCHAR(5),
  new_confidence_level VARCHAR(10),

  -- Change metadata
  change_reason VARCHAR(50) NOT NULL CHECK (
    change_reason IN ('new_data', 'manual_override', 'recompute', 'initial', 'material_change')
  ),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Full context snapshot (for reconstruction)
  context_snapshot JSONB NOT NULL, -- {reason_codes, scores, missing_field_count, etc.}

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classification_history_ticker ON classification_history(ticker);
CREATE INDEX idx_classification_history_changed_at ON classification_history(changed_at DESC);
CREATE INDEX idx_classification_history_ticker_changed ON classification_history(ticker, changed_at DESC);
```

---

### valuation_state

```sql
CREATE TABLE valuation_state (
  ticker VARCHAR(10) PRIMARY KEY REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- Active code (used for valuation)
  active_code VARCHAR(5) NOT NULL, -- final_code if exists, else suggested_code

  -- Primary metric selection
  primary_metric VARCHAR(50) NOT NULL CHECK (
    primary_metric IN (
      'forward_pe',
      'forward_ev_ebit',
      'ev_sales',
      'forward_operating_earnings_ex_excess_cash',
      'no_stable_metric'
    )
  ),
  metric_reason VARCHAR(100), -- e.g., "bucket_4_default" or "3AA_holding_company"

  -- Current multiple
  current_multiple NUMERIC(10,2),
  current_multiple_basis VARCHAR(20) CHECK (
    current_multiple_basis IN ('spot', 'mid_cycle', 'manual_override')
  ) DEFAULT 'spot',

  -- Threshold grid
  max_threshold NUMERIC(10,2),
  comfortable_threshold NUMERIC(10,2),
  very_good_threshold NUMERIC(10,2),
  steal_threshold NUMERIC(10,2),

  -- Threshold source transparency
  threshold_source VARCHAR(20) NOT NULL CHECK (
    threshold_source IN ('anchored', 'derived', 'manual_override')
  ),
  derived_from_code VARCHAR(5), -- If derived, which code was used as basis
  threshold_adjustments JSONB DEFAULT '[]', -- Array of adjustments applied

  -- TSR hurdles
  base_tsr_hurdle_label VARCHAR(20), -- e.g., "12-13%"
  base_tsr_hurdle_default NUMERIC(5,2), -- e.g., 12.5
  adjusted_tsr_hurdle NUMERIC(5,2) NOT NULL, -- Final hurdle after quality adjustments
  hurdle_source VARCHAR(20) NOT NULL CHECK (
    hurdle_source IN ('default', 'manual_override')
  ),
  tsr_reason_codes JSONB DEFAULT '[]', -- Adjustment reason codes

  -- Valuation zone
  valuation_zone VARCHAR(20) NOT NULL CHECK (
    valuation_zone IN (
      'above_max',
      'max_zone',
      'comfortable_zone',
      'very_good_zone',
      'steal_zone',
      'not_applicable'
    )
  ),

  -- State
  valuation_state_status VARCHAR(20) NOT NULL DEFAULT 'ready' CHECK (
    valuation_state_status IN ('ready', 'manual_required', 'classification_required', 'not_applicable')
  ),

  -- Manual overrides
  valuation_override_reason TEXT,
  valuation_override_timestamp TIMESTAMPTZ,

  -- Metadata
  valuation_last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_valuation_zone ON valuation_state(valuation_zone);
CREATE INDEX idx_valuation_active_code ON valuation_state(active_code);
CREATE INDEX idx_valuation_threshold_source ON valuation_state(threshold_source);
CREATE INDEX idx_valuation_state_status ON valuation_state(valuation_state_status);
CREATE INDEX idx_valuation_zone_interested ON valuation_state(valuation_zone)
  WHERE valuation_zone IN ('steal_zone', 'very_good_zone', 'comfortable_zone');
```

---

### valuation_history

```sql
CREATE TABLE valuation_history (
  id BIGSERIAL PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- Old state
  old_active_code VARCHAR(5),
  old_primary_metric VARCHAR(50),
  old_current_multiple NUMERIC(10,2),
  old_valuation_zone VARCHAR(20),
  old_adjusted_tsr_hurdle NUMERIC(5,2),

  -- New state
  new_active_code VARCHAR(5),
  new_primary_metric VARCHAR(50),
  new_current_multiple NUMERIC(10,2),
  new_valuation_zone VARCHAR(20),
  new_adjusted_tsr_hurdle NUMERIC(5,2),

  -- Change metadata
  change_reason VARCHAR(50) NOT NULL CHECK (
    change_reason IN (
      'recompute',
      'manual_override',
      'code_changed',
      'threshold_changed',
      'price_changed',
      'initial'
    )
  ),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Full context snapshot
  context_snapshot JSONB NOT NULL, -- {thresholds, threshold_source, metric_reason, etc.}

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_valuation_history_ticker ON valuation_history(ticker);
CREATE INDEX idx_valuation_history_changed_at ON valuation_history(changed_at DESC);
CREATE INDEX idx_valuation_history_ticker_changed ON valuation_history(ticker, changed_at DESC);
CREATE INDEX idx_valuation_history_zone_transitions ON valuation_history(new_valuation_zone, changed_at DESC);
```

---

### alerts (PER-USER)

**IMPORTANT:** Alerts are per-user, generated only for stocks in user's monitor list (ADR-007).

```sql
CREATE TABLE alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- NEW: Per-user alerts
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- Alert classification
  alert_type VARCHAR(50) NOT NULL, -- e.g., "entered_steal_zone", "classification_bucket_changed"
  alert_family VARCHAR(20) NOT NULL CHECK (
    alert_family IN ('valuation', 'classification', 'data_quality')
  ),

  -- Priority
  priority VARCHAR(10) NOT NULL CHECK (
    priority IN ('low', 'medium', 'high', 'critical')
  ),

  -- Summary
  summary_text TEXT NOT NULL, -- Human-readable summary

  -- Context payload (full snapshot at time of alert)
  detail_payload JSONB NOT NULL, -- {old_zone, new_zone, active_code, thresholds, etc.}

  -- Current framework state at alert time
  active_code VARCHAR(5),
  valuation_zone VARCHAR(20),
  current_multiple NUMERIC(10,2),
  threshold_source VARCHAR(20),

  -- Alert state
  alert_state VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
    alert_state IN ('active', 'acknowledged', 'suppressed', 'resolved')
  ),

  -- Timestamps
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  -- Deduplication (per-user)
  dedup_key VARCHAR(100) NOT NULL, -- SHA256(user_id + ticker + alert_type + zone + active_code)
  suppressed BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id); -- NEW: Per-user filtering
CREATE INDEX idx_alerts_ticker ON alerts(ticker);
CREATE INDEX idx_alerts_alert_state ON alerts(alert_state);
CREATE INDEX idx_alerts_priority ON alerts(priority);
CREATE INDEX idx_alerts_alert_family ON alerts(alert_family);
CREATE INDEX idx_alerts_triggered_at ON alerts(triggered_at DESC);
CREATE INDEX idx_alerts_valuation_zone ON alerts(valuation_zone);
CREATE INDEX idx_alerts_user_active ON alerts(user_id, alert_state, triggered_at DESC)
  WHERE alert_state = 'active'; -- NEW: User-specific active alerts
CREATE UNIQUE INDEX idx_alerts_dedup_active ON alerts(dedup_key)
  WHERE alert_state = 'active' AND suppressed = FALSE;
```

---

### alert_history (PER-USER)

```sql
CREATE TABLE alert_history (
  id BIGSERIAL PRIMARY KEY,
  alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- NEW: Per-user
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- State transition
  old_alert_state VARCHAR(20),
  new_alert_state VARCHAR(20),

  -- Transition metadata
  transition_reason VARCHAR(50), -- e.g., "cooldown_expired", "user_acknowledged", "condition_resolved"
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Snapshot of alert at transition
  alert_snapshot JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_history_alert_id ON alert_history(alert_id);
CREATE INDEX idx_alert_history_ticker ON alert_history(ticker);
CREATE INDEX idx_alert_history_transitioned_at ON alert_history(transitioned_at DESC);
```

---

## Framework Configuration Tables

### anchored_thresholds

```sql
CREATE TABLE anchored_thresholds (
  id SERIAL PRIMARY KEY,
  code VARCHAR(5) NOT NULL UNIQUE, -- e.g., "4AA"
  bucket INT NOT NULL CHECK (bucket BETWEEN 1 AND 8),
  earnings_quality CHAR(1) NOT NULL CHECK (earnings_quality IN ('A', 'B', 'C')),
  balance_sheet_quality CHAR(1) NOT NULL CHECK (balance_sheet_quality IN ('A', 'B', 'C')),

  -- Primary metric
  primary_metric VARCHAR(50) NOT NULL,

  -- Threshold values
  max_threshold NUMERIC(10,2) NOT NULL,
  comfortable_threshold NUMERIC(10,2) NOT NULL,
  very_good_threshold NUMERIC(10,2) NOT NULL,
  steal_threshold NUMERIC(10,2) NOT NULL,

  -- Framework version
  framework_version VARCHAR(10) NOT NULL DEFAULT 'v1.0',

  -- Metadata
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_anchored_thresholds_code ON anchored_thresholds(code);
CREATE INDEX idx_anchored_thresholds_bucket ON anchored_thresholds(bucket);
CREATE INDEX idx_anchored_thresholds_effective ON anchored_thresholds(effective_from, effective_until);

-- Insert framework anchor table (from source_of_truth doc)
INSERT INTO anchored_thresholds (code, bucket, earnings_quality, balance_sheet_quality, primary_metric, max_threshold, comfortable_threshold, very_good_threshold, steal_threshold) VALUES
  ('1AA', 1, 'A', 'A', 'forward_pe', 10.0, 8.5, 7.0, 5.5),
  ('1BA', 1, 'B', 'A', 'forward_pe', 8.5, 7.0, 5.5, 4.0),
  ('2AA', 2, 'A', 'A', 'forward_pe', 16.0, 14.0, 12.5, 11.0),
  ('2BA', 2, 'B', 'A', 'forward_pe', 13.5, 12.0, 10.5, 9.0),
  ('3AA', 3, 'A', 'A', 'forward_operating_earnings_ex_excess_cash', 18.5, 17.0, 15.5, 14.0),
  ('3BA', 3, 'B', 'A', 'forward_pe', 15.0, 13.5, 12.0, 10.5),
  ('4AA', 4, 'A', 'A', 'forward_pe', 22.0, 20.0, 18.0, 16.0),
  ('4BA', 4, 'B', 'A', 'forward_pe', 14.5, 13.0, 11.5, 10.0),
  ('5AA', 5, 'A', 'A', 'forward_ev_ebit', 20.0, 17.0, 14.5, 12.0),
  ('5BA', 5, 'B', 'A', 'forward_ev_ebit', 17.0, 15.0, 13.0, 11.0),
  ('5BB', 5, 'B', 'B', 'forward_ev_ebit', 15.0, 13.0, 11.0, 9.0),
  ('6AA', 6, 'A', 'A', 'ev_sales', 12.0, 10.0, 8.0, 6.0),
  ('6BA', 6, 'B', 'A', 'ev_sales', 9.0, 7.0, 5.5, 4.0),
  ('6BB', 6, 'B', 'B', 'ev_sales', 7.0, 5.5, 4.5, 3.0),
  ('7AA', 7, 'A', 'A', 'ev_sales', 18.0, 15.0, 11.0, 8.0),
  ('7BA', 7, 'B', 'A', 'ev_sales', 14.0, 11.0, 8.5, 6.0);
```

---

### tsr_hurdles

```sql
CREATE TABLE tsr_hurdles (
  id SERIAL PRIMARY KEY,
  bucket INT NOT NULL UNIQUE CHECK (bucket BETWEEN 1 AND 8),

  -- Base hurdle
  base_hurdle_label VARCHAR(20) NOT NULL, -- e.g., "12-13%"
  base_hurdle_default NUMERIC(5,2) NOT NULL, -- e.g., 12.5

  -- Quality adjustments
  earnings_quality_a_adjustment NUMERIC(5,2) NOT NULL DEFAULT -1.0, -- -1.0%
  earnings_quality_b_adjustment NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  earnings_quality_c_adjustment NUMERIC(5,2) NOT NULL DEFAULT 2.5,

  balance_sheet_a_adjustment NUMERIC(5,2) NOT NULL DEFAULT -0.5,
  balance_sheet_b_adjustment NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  balance_sheet_c_adjustment NUMERIC(5,2) NOT NULL DEFAULT 1.75,

  -- Framework version
  framework_version VARCHAR(10) NOT NULL DEFAULT 'v1.0',

  -- Metadata
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert framework TSR hurdles (from source_of_truth doc)
INSERT INTO tsr_hurdles (bucket, base_hurdle_label, base_hurdle_default) VALUES
  (1, '14-16%+', 15.0),
  (2, '10-11%', 10.5),
  (3, '11-12%', 11.5),
  (4, '12-13%', 12.5),
  (5, '14-16%', 15.0),
  (6, '18-20%+', 19.0),
  (7, '25%+', 25.0),
  (8, 'No normal hurdle', NULL);
```

---

### framework_version

```sql
CREATE TABLE framework_version (
  id SERIAL PRIMARY KEY,
  version VARCHAR(10) NOT NULL UNIQUE,
  description TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO framework_version (version, description) VALUES
  ('v1.0', '3AA Investment Classification and Monitoring Framework - Initial V1');
```

---

## Multi-User Tables (Per-User State)

**See ADR-007 for full multi-user architecture rationale.**

### users

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;
```

---

### user_sessions

```sql
CREATE TABLE user_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Session data
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
```

---

### user_monitored_stocks (Watchlist)

**Per-user watchlist** - which stocks from universe the user monitors.

```sql
CREATE TABLE user_monitored_stocks (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- Metadata
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT, -- Optional user notes

  PRIMARY KEY (user_id, ticker)
);

CREATE INDEX idx_user_monitored_stocks_user_id ON user_monitored_stocks(user_id);
CREATE INDEX idx_user_monitored_stocks_ticker ON user_monitored_stocks(ticker);
```

**Note:** Alerts are only generated for stocks in user's monitor list.

---

### user_classification_overrides

**Per-user classification overrides** - replaces `final_code` from single-user `classification_state`.

```sql
CREATE TABLE user_classification_overrides (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- User's manual classification
  final_bucket INT CHECK (final_bucket BETWEEN 1 AND 8),
  final_earnings_quality CHAR(1) CHECK (final_earnings_quality IN ('A', 'B', 'C')),
  final_balance_sheet_quality CHAR(1) CHECK (final_balance_sheet_quality IN ('A', 'B', 'C')),
  final_code VARCHAR(5) NOT NULL, -- e.g., "3AA"

  -- Override metadata
  override_reason TEXT,
  overridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overridden_by UUID REFERENCES users(user_id), -- Support for admin overrides

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, ticker)
);

CREATE INDEX idx_user_classification_overrides_user_id ON user_classification_overrides(user_id);
CREATE INDEX idx_user_classification_overrides_ticker ON user_classification_overrides(ticker);
```

**Active Code Resolution:**
```sql
-- Get active code for user (override || system suggestion)
SELECT COALESCE(uco.final_code, cs.suggested_code) AS active_code
FROM classification_state cs
LEFT JOIN user_classification_overrides uco
  ON cs.ticker = uco.ticker AND uco.user_id = $1
WHERE cs.ticker = $2;
```

---

### user_valuation_overrides (Rare)

**Per-user threshold overrides** - replaces threshold override logic from single-user model.

```sql
CREATE TABLE user_valuation_overrides (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- User's manual thresholds
  max_threshold NUMERIC(10,2),
  comfortable_threshold NUMERIC(10,2),
  very_good_threshold NUMERIC(10,2),
  steal_threshold NUMERIC(10,2),

  -- Override metadata
  override_reason TEXT,
  overridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, ticker)
);

CREATE INDEX idx_user_valuation_overrides_user_id ON user_valuation_overrides(user_id);
```

**Note:** Rare edge case (expect <1% of stocks to have per-user threshold overrides).

---

### user_alert_preferences

**Per-user alert settings** - muting, priority thresholds, notification preferences.

```sql
CREATE TABLE user_alert_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,

  -- Alert filtering
  muted_alert_families JSONB DEFAULT '[]', -- ["data_quality"]
  priority_threshold VARCHAR(20) DEFAULT 'low' CHECK (
    priority_threshold IN ('critical', 'high', 'medium', 'low')
  ), -- Only show alerts at or above this priority

  -- Notification preferences (future)
  email_notifications_enabled BOOLEAN DEFAULT FALSE,
  email_digest_frequency VARCHAR(20) DEFAULT 'daily', -- 'immediate', 'daily', 'weekly', 'never'

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### user_preferences

**Per-user UI settings** - display preferences, default filters, saved views.

```sql
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,

  -- UI preferences
  default_sort VARCHAR(50) DEFAULT 'zone_asc', -- 'market_cap_desc', 'ticker_asc', etc.
  default_filters JSONB DEFAULT '{}', -- {"bucket": [4, 5, 6], "zone": ["steal_zone"]}
  display_density VARCHAR(20) DEFAULT 'comfortable' CHECK (
    display_density IN ('compact', 'comfortable', 'spacious')
  ),

  -- Additional preferences (extensible)
  preferences JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### user_override_history (Audit Trail)

**Per-user override audit trail** - tracks when users change overrides.

```sql
CREATE TABLE user_override_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- What changed
  override_type VARCHAR(20) NOT NULL CHECK (
    override_type IN ('classification', 'valuation_thresholds')
  ),

  -- Old vs new values
  old_value JSONB, -- {"final_code": "4AA"}
  new_value JSONB, -- {"final_code": "3AA"}

  -- Change metadata
  change_reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_override_history_user_id ON user_override_history(user_id);
CREATE INDEX idx_user_override_history_ticker ON user_override_history(ticker);
CREATE INDEX idx_user_override_history_changed_at ON user_override_history(changed_at DESC);
```

---

### user_monitoring_history (Audit Trail)

**Per-user watchlist audit trail** - tracks when users add/remove stocks from monitor list.

```sql
CREATE TABLE user_monitoring_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,

  -- Action
  action VARCHAR(20) NOT NULL CHECK (action IN ('added', 'removed')),

  -- Metadata
  action_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_monitoring_history_user_id ON user_monitoring_history(user_id);
CREATE INDEX idx_user_monitoring_history_action_at ON user_monitoring_history(action_at DESC);
```

---

## Audit Trail Strategy

**Decision:** Full state snapshots in history tables

**Rationale:**
- Enables complete reconstruction of any point in time
- Simplifies queries (no need to replay deltas)
- Storage is cheap; debugging is expensive

**Tradeoff:**
- Higher storage cost vs delta approach
- Accepted for V1 (universe ~1000 stocks, history events ~10K/month)

**Implementation:**
- `classification_history.context_snapshot`: Full `{reason_codes, scores, metadata}`
- `valuation_history.context_snapshot`: Full `{thresholds, tsr_hurdles, metric_reason}`
- `alert_history.alert_snapshot`: Full alert payload

**Retention:**
- Indefinite for V1 (reassess if >1M history records)

**Alternative Considered:** Delta-based (only changed fields)
- **Rejected:** Reconstruction complexity not worth storage savings in V1

---

## Indexing Strategy

**Principles:**
1. Index fields used in WHERE clauses
2. Index foreign keys for join performance
3. Partial indexes for common filtered queries
4. Composite indexes for common query patterns

**Query Patterns:**
- "Show all unreviewed classifications" → `idx_classification_status`
- "Show all active alerts in steal/very good zone" → `idx_alerts_active_alerts`, `idx_valuation_zone_interested`
- "Show classification history for ticker" → `idx_classification_history_ticker_changed`
- "Show recent zone transitions" → `idx_valuation_history_zone_transitions`

---

## Data Retention

**V1 Policy:**
- `stocks`: Indefinite (soft delete via `in_universe = FALSE`)
- `classification_state/valuation_state`: Indefinite (current state only)
- `*_history` tables: Indefinite for V1
- `alerts`: Active alerts indefinite; resolved alerts 1 year
- `alert_history`: 1 year

**Future Consideration:** Archive to cold storage after 2 years

---

## Framework Configuration Management

**Storage Mechanism:** Database tables (`anchored_thresholds`, `tsr_hurdles`)

**Versioning Strategy:**
- `framework_version` table tracks versions
- Each config row has `effective_from` / `effective_until` timestamps
- Historical calculations use framework version active at computation time

**Updates:**
- New framework version: Insert new rows with new `effective_from`
- Set old rows' `effective_until = new_effective_from`
- Never DELETE old framework config (needed for historical reconstruction)

**Validation:**
- On app startup: Verify exactly one active framework version
- Verify all anchored codes have thresholds in descending order
- Verify TSR hurdles exist for buckets 1-7

**Alternative Considered:** YAML/JSON config files
- **Rejected:** Database provides better versioning, querying, and referential integrity

---

## Migration Strategy

**Initial Setup:**
1. Create all tables in dependency order (stocks → classification_state → history, etc.)
2. Insert framework config (anchored_thresholds, tsr_hurdles)
3. Insert framework_version v1.0

**Data Seeding:**
- Empty universe initially
- Data ingestion (RFC-004) populates `stocks` table
- Classification engine populates `classification_state`
- Valuation engine populates `valuation_state`

**Schema Changes:**
- Use migrations (e.g., Flyway, Liquibase, or custom scripts)
- Never DROP columns (add nullable columns, deprecate old)
- Version all migrations

---

## Constraints & Invariants

**Enforced by Database:**
1. `classification_state.ticker` REFERENCES `stocks.ticker` (CASCADE DELETE)
2. Thresholds: `max > comfortable > very_good > steal` (enforced by CHECK or trigger)
3. Confidence: must be 'high', 'medium', or 'low'
4. Alert dedup: UNIQUE INDEX on `dedup_key` for active non-suppressed alerts

**Enforced by Application:**
1. `valuation_state.active_code = final_code || suggested_code` (computed)
2. Classification history event created on every `suggested_code` change
3. Valuation history event created on every `valuation_zone` change

---

## Performance Considerations

**Expected Scale (V1):**
- ~1,000 stocks in universe
- ~10,000 classification history events/month
- ~10,000 valuation history events/month
- ~5,000 alerts/month
- Total DB size: <5 GB in year 1

**Query Performance:**
- Indexes support all common queries <100ms
- Full table scans acceptable for nightly batch processing
- No need for denormalization in V1

**Write Performance:**
- Alert generation: bulk inserts acceptable (nightly batch)
- History events: asynchronous writes acceptable

---

## Open Questions

1. **Should stocks table include ALL fundamentals or separate table?**
   - Decision: Single table for V1 (simpler joins, acceptable size)
   - Reconsider if >50 fundamental fields

2. **Soft delete vs hard delete for out-of-universe stocks?**
   - Decision: Soft delete (`in_universe = FALSE`)
   - Preserves historical data and audit trail

3. **Framework config: DB vs files?**
   - Decision: DB tables (better versioning, querying)
   - Files acceptable for local dev, DB for production

---

## Required ADRs

1. **ADR-007: Audit Trail Storage Strategy** (full snapshots vs deltas) - DECIDED: Full snapshots
2. **ADR-008: Framework Configuration Storage** (DB vs YAML) - DECIDED: DB tables
3. **ADR-009: Soft Delete Strategy for Universe Changes**

---

## Amendment — 2026-04-21: Classification Flag Sourcing + E1–E6 Enrichment Columns

### Change 1: Flag column descriptions updated
The `-- Manual flags` comment block has been renamed to `-- Classification flags` to reflect that these are now auto-detected by the classification enrichment pipeline (EPIC-003 and EPIC-003.1), with manual override supported. No schema changes.

### Change 2: E1–E6 qualitative enrichment score columns (EPIC-003.1)

The following columns will be added in STORY-039 (EPIC-003.1) via migration. They are listed here for specification completeness:

```sql
-- V1.0 (EPIC-003.1 STORY-039): Qualitative enrichment scores from LLM enrichment
-- Half-integer precision (1.00, 1.50, 2.00 ... 5.00). NULL if LLM confidence < 0.60.
-- Provenance tracked in data_provider_provenance JSONB (no separate confidence columns).
moat_strength_score           DECIMAL(3,2),   -- 1=no moat, 5=very wide moat
pricing_power_score           DECIMAL(3,2),   -- 1=price-taker, 5=strong pricing power
revenue_recurrence_score      DECIMAL(3,2),   -- 1=transactional, 5=fully recurring
margin_durability_score       DECIMAL(3,2),   -- 1=commodity pressure, 5=structurally protected
capital_intensity_score       DECIMAL(3,2),   -- 1=asset-light, 5=heavy capex burden
qualitative_cyclicality_score DECIMAL(3,2),   -- 1=counter-cyclical, 5=highly cyclical
```

Confidence for each score is stored in `data_provider_provenance` keyed by field name (consistent with provenance approach used throughout V1 — no separate `_confidence` columns).

### Related
ADR-012, RFC-007, RFC-001 Amendment 2026-04-21

## Amendment — 2026-04-25: Quarterly Financial History Data Layer (RFC-008)

Two new tables are added to the canonical data model. Full schema is specified in ADR-015.

### New Table: `stock_quarterly_history`

Stores raw quarterly financial statements (last 12+ fiscal quarters per stock) plus per-quarter derived margins. One row per `(ticker, fiscal_year, fiscal_quarter, source_provider)`.

Primary key: `id BIGSERIAL`; unique constraint on `(ticker, fiscal_year, fiscal_quarter, source_provider)`.

Raw fields: `revenue`, `gross_profit`, `operating_income`, `net_income`, `capex`, `cash_from_operations`, `free_cash_flow`, `share_based_compensation`, `depreciation_and_amortization`, `diluted_shares_outstanding`.

Per-quarter derived: `gross_margin`, `operating_margin`, `net_margin`, `cfo_to_net_income_ratio`, `fcf_margin`, `sbc_as_pct_revenue`, `dilution_yoy`.

Source provider: `tiingo` (V1 only). Sync cadence: earnings-triggered (ADR-016).

### New Table: `stock_derived_metrics`

One row per ticker. Stores computed trend/trajectory metrics for EPIC-004 classification consumption.

Contains: TTM rollups from quarterly history, margin trajectory slopes (4q/8q), margin stability scores (0.0–1.0), operating leverage ratios and flags, earnings quality trend score (−1.0 to +1.0), dilution/SBC metrics, capital intensity metrics, provenance JSONB.

Refreshed immediately after `stock_quarterly_history` is updated for a ticker. Not primary data — a computed projection from `stock_quarterly_history`.

### Impact on `ClassificationInput`

`toClassificationInput()` gains a JOIN to `stock_derived_metrics`. When a row exists for the ticker, the ~20 trend/trajectory fields defined in RFC-008 §Classifier-Facing Derived Fields are added to `ClassificationInput`. When no row exists (quarterly history not yet available), all trend fields are NULL — scorers treat absent trend fields as missing data and do not error.

### Related

RFC-008, ADR-015 (storage decision), ADR-016 (refresh cadence), RFC-004 Amendment 2026-04-25

---

**END RFC-002**
