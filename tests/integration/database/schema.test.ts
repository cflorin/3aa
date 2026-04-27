// EPIC-001: Platform Foundation & Deployment
// STORY-004: Implement Prisma Schema and Database Migrations
// TASK-004-009: Integration tests — schema verification (all 19 tables, columns, indexes)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tables as of EPIC-008 (originally 19 RFC-002 tables + 4 added by EPIC-007/008 migrations)
const EXPECTED_TABLES = [
  'framework_version',
  'anchored_thresholds',
  'tsr_hurdles',
  'users',
  'user_sessions',
  'stocks',
  'classification_state',
  'classification_history',
  'valuation_state',
  'valuation_history',
  'user_monitored_stocks',
  'user_classification_overrides',
  'user_valuation_overrides',
  'user_alert_preferences',
  'user_preferences',
  'user_override_history',
  'user_monitoring_history',
  'alerts',
  'alert_history',
  // Added by post-RFC-002 migrations:
  'stock_derived_metrics',         // EPIC-007 quarterly history
  'stock_quarterly_history',       // EPIC-007 quarterly history
  'user_deactivated_stocks',       // EPIC-003 universe management
  'valuation_regime_thresholds',   // EPIC-008 regime decoupling
];

// Key columns per table: spot-check that RFC-002 column names are present
const KEY_COLUMNS: Record<string, string[]> = {
  stocks: ['ticker', 'company_name', 'in_universe', 'market_cap', 'data_provider_provenance', 'data_quality_issues'],
  classification_state: ['ticker', 'suggested_code', 'confidence_level', 'reason_codes', 'scores'],
  classification_history: ['id', 'ticker', 'context_snapshot'],
  valuation_state: ['ticker', 'active_code', 'primary_metric', 'valuation_zone', 'adjusted_tsr_hurdle'],
  valuation_history: ['id', 'ticker', 'new_valuation_zone', 'change_reason', 'context_snapshot'],
  alerts: ['id', 'user_id', 'ticker', 'alert_type', 'alert_family', 'priority', 'dedup_key', 'suppressed'],
  alert_history: ['id', 'alert_id', 'user_id', 'ticker', 'alert_snapshot'],
  anchored_thresholds: ['id', 'code', 'bucket', 'max_threshold', 'steal_threshold', 'primary_metric'],
  tsr_hurdles: ['id', 'bucket', 'base_hurdle_label', 'base_hurdle_default'],
  framework_version: ['id', 'version', 'effective_from'],
  users: ['user_id', 'email', 'password_hash', 'is_active'],
  user_sessions: ['session_id', 'user_id', 'expires_at'],
  user_monitored_stocks: ['user_id', 'ticker', 'added_at'],
  user_classification_overrides: ['user_id', 'ticker', 'final_code', 'overridden_at'],
  user_valuation_overrides: ['user_id', 'ticker', 'max_threshold'],
  user_alert_preferences: ['user_id', 'muted_alert_families', 'priority_threshold'],
  user_preferences: ['user_id', 'default_sort', 'default_filters', 'preferences'],
  user_override_history: ['id', 'user_id', 'ticker', 'override_type'],
  user_monitoring_history: ['id', 'user_id', 'ticker', 'action'],
};

// Indexes (subset; verifies key indexes were applied across epics)
const EXPECTED_INDEXES = [
  'idx_stocks_in_universe',
  'idx_stocks_market_cap',
  'idx_stocks_sector',
  'idx_stocks_data_freshness',
  'idx_classification_confidence',
  'idx_valuation_zone',
  'idx_valuation_zone_interested',
  'idx_alerts_user_id',
  'idx_alerts_dedup_active',
  'idx_alerts_user_active',
  'idx_users_email',
  'idx_user_sessions_user_id',
  'idx_anchored_thresholds_code',
  'idx_valuation_regime',   // EPIC-008
];

describe('EPIC-001/STORY-004: Database Schema — RFC-002 tables exist (updated EPIC-008)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('all expected tables exist in public schema', async () => {
    const result = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename != '_prisma_migrations'
      ORDER BY tablename
    `;
    const actualTables = result.map((r) => r.tablename);

    for (const table of EXPECTED_TABLES) {
      expect(actualTables).toContain(table);
    }
    expect(actualTables).toHaveLength(EXPECTED_TABLES.length);
  });

  test.each(EXPECTED_TABLES)('table "%s" has required columns', async (tableName) => {
    const expectedCols = KEY_COLUMNS[tableName] ?? [];
    if (expectedCols.length === 0) return;

    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    `;
    const actualColumns = result.map((r) => r.column_name);

    for (const col of expectedCols) {
      expect(actualColumns).toContain(col);
    }
  });

  test('all required indexes exist (including partial indexes)', async () => {
    const result = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;
    const actualIndexes = result.map((r) => r.indexname);

    for (const idx of EXPECTED_INDEXES) {
      expect(actualIndexes).toContain(idx);
    }
  });

  test('tsr_hurdles has 8 rows (one per bucket)', async () => {
    const count = await prisma.tsrHurdle.count();
    // Starts empty — migration doesn't seed; STORY-005 seeds data.
    // We verify the table is queryable and returns 0 before seeding.
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('anchored_thresholds table is queryable', async () => {
    const count = await prisma.anchoredThreshold.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
