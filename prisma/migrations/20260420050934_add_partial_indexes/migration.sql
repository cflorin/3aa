-- EPIC-001/STORY-004/TASK-004-007: Partial indexes from RFC-002
-- Prisma does not support partial indexes in schema.prisma; applied here via raw SQL.

-- stocks: only index rows actually in universe (common filter)
CREATE INDEX idx_stocks_in_universe ON stocks(in_universe) WHERE in_universe = TRUE;
CREATE INDEX idx_stocks_market_cap ON stocks(market_cap) WHERE in_universe = TRUE;

-- valuation_state: fast lookup for actionable zones only
CREATE INDEX idx_valuation_zone_interested ON valuation_state(valuation_zone)
  WHERE valuation_zone IN ('steal_zone', 'very_good_zone', 'comfortable_zone');

-- alerts: fast per-user active alert lookup
CREATE INDEX idx_alerts_user_active ON alerts(user_id, alert_state, triggered_at DESC)
  WHERE alert_state = 'active';

-- alerts: deduplication — only one active+non-suppressed alert per dedup_key
CREATE UNIQUE INDEX idx_alerts_dedup_active ON alerts(dedup_key)
  WHERE alert_state = 'active' AND suppressed = FALSE;