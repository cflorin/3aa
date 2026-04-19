# ADR-007: Multi-User Architecture - Shared vs User State

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-002 (Data Model), RFC-005 (Monitoring), ADR-004 (Classification Override)

---

## Context

The 3AA Monitoring Product V1 is a web application that must support multiple authenticated users.

**The Question:** How should state be partitioned between shared (system-computed) and user-scoped (per-user)?

### V1 Characteristics

- **Universe:** 1000 stocks (shared across all users)
- **Framework computation:** Classification/valuation engines are deterministic
- **User monitoring:** Each user monitors subset of universe (personal watchlist)
- **User overrides:** Users may disagree on classification (judgment calls)
- **Alerts:** Generated based on user's monitored stocks only

### State Partitioning Options

**All Shared (Single Global State):**
- One classification per stock (all users see same code)
- One set of alerts (all users see same alert feed)
- No user-specific overrides or preferences

**All User-Scoped (Isolated Per User):**
- Each user has own classification/valuation computation
- Each user has own alert feed
- Complete isolation, but expensive (re-compute for each user)

**Hybrid (Shared Computation + User Overrides):**
- System computes classification/valuation once (shared)
- Users can override with personal judgments (per-user)
- Alerts generated per-user based on monitored stocks

---

## Decision

V1 shall use **hybrid architecture** with shared system computation and per-user monitoring state:

### Shared (System-Computed, Global)

1. **Stock universe data** (`stocks` table)
   - Market cap, sector, industry, fundamentals
   - Synced from data providers (Tiingo, FMP)
   - Updated nightly, visible to all users

2. **Classification suggestions** (`classification_state` table)
   - System-computed suggested codes, confidence, scores
   - Classification engine runs once per stock
   - All users see same system suggestions

3. **Valuation computations** (`valuation_state` table)
   - System-computed thresholds, zones, metrics
   - Based on shared classification + anchored thresholds
   - All users see same system zones

4. **Framework configuration** (`anchored_thresholds`, `tsr_hurdles`)
   - Global threshold table, TSR hurdles
   - Single source of truth

5. **Audit trails** (`classification_history`, `valuation_history`)
   - System suggestion changes over time
   - Shared historical record

### User-Scoped (Per-User)

1. **User accounts** (`users`, `user_sessions`)
   - Authentication, session management
   - User profiles

2. **Monitored stocks** (`user_monitored_stocks`)
   - Which stocks user chooses to monitor (watchlist)
   - Subset of universe, not all 1000 stocks

3. **Classification overrides** (`user_classification_overrides`)
   - Per-user manual classification codes
   - User A: AAPL = 3AA, User B: AAPL = 4AA (different judgments)

4. **Valuation overrides** (`user_valuation_overrides`)
   - Per-user threshold overrides (rare edge case)

5. **Alerts** (`alerts` with `user_id`)
   - Generated for user's monitored stocks only
   - Alert acknowledgement/resolution per user

6. **User preferences** (`user_alert_preferences`, `user_preferences`)
   - Alert muting, priority thresholds
   - UI settings, default filters

7. **User audit trails** (`user_override_history`, `user_monitoring_history`)
   - When user changed overrides
   - When user added/removed stocks from watchlist

---

## Rationale

### Why Hybrid (Shared + User-Scoped)?

**1. Computational Efficiency**
- Classification/valuation engines are expensive
- Running once for 1000 stocks >> running 10 times for 10 users
- Shared computation reduces infrastructure costs

**2. Framework Consistency**
- System suggestions are deterministic (same inputs → same outputs)
- All users see same starting point (system suggestions)
- Easier to debug ("Is system suggestion wrong for everyone or just User A?")

**3. User Autonomy**
- Users can disagree on judgment calls (classification is qualitative)
- User A: "AAPL is mature stalwart (3AA)"
- User B: "AAPL is still elite compounder (4AA)"
- Both valid judgments, system shouldn't force consensus

**4. Personal Monitoring**
- Each user focuses on different stocks (not all 1000)
- User A monitors tech (100 stocks), User B monitors industrials (150 stocks)
- Alert feed tailored to user's focus area

**5. Framework Evolution**
- Update anchored thresholds → all users benefit immediately
- No need to re-run classification per user
- Shared state propagates framework improvements

### Why NOT All Shared?

**Violates User Autonomy:**
- Users cannot disagree on classifications
- User A's override affects User B (not acceptable)
- Monitoring is personal (not all users care about same stocks)

**Example Conflict:**
```
User A: "Override AAPL to 3AA (mature business)"
User B sees: "AAPL is 3AA" (didn't agree to this)
User B: "No, AAPL is 4AA" (override conflict)
→ System doesn't know which override to use
```

### Why NOT All User-Scoped?

**Computational Waste:**
- 10 users × 1000 stocks = 10,000 classification runs
- Each user re-computes same deterministic results
- 10x infrastructure cost for no benefit

**Framework Updates Are Painful:**
- Update anchored thresholds → must recompute for all users
- Users see stale classifications until recompute finishes
- No single source of truth for "What does system suggest?"

---

## User Override Scope (V1 Critical Decision)

### V1 Semantics: Overrides Affect Inspection Only

**User classification and valuation overrides affect inspection/review display only. They do NOT affect operational alert generation in V1.**

### Why This Decision?

**V1 is Monitoring-First:**
- Primary goal: surface opportunities automatically using consistent framework
- Alerts generated from shared system state ensure consistency across all users
- User overrides are for personal review/judgment during inspection, not alert automation

**Avoids Per-User Valuation Complexity:**
- If user overrides affected alerts, would require per-user valuation recomputation
- Example: User A overrides AAPL from 4AA → 3AA
  - Changes metric family (4AA uses P/E, 3AA might use different adjustments)
  - Changes threshold grid (3AA has lower hurdles than 4AA)
  - Changes valuation zone (could move from steal → very good)
  - Requires full valuation engine re-run per user
- V1 avoids this by using shared system state for all alerts

**Preserves User Autonomy:**
- Users can still override classifications for inspection/review
- Alert payload includes both system state and user override for context
- User sees: "Alert triggered by system classification (4AA, steal zone); your override: 3AA"
- User can decide whether to act based on their judgment

### Implementation Pattern

**Alert Generation:**
```typescript
// Alert generation uses shared system state ONLY
async function generateAlertsForUser(userId: string): Promise<void> {
  const monitoredStocks = await getUserMonitoredStocks(userId);

  for (const stock of monitoredStocks) {
    // Use SYSTEM suggested_code (not user override) for alert detection
    const currentState = await getValuationStateFromSharedTable(stock.ticker);
    const priorState = await getPriorValuationStateFromSharedTable(stock.ticker);

    const alert = await detectValuationAlerts(stock.ticker, currentState, priorState);

    if (alert) {
      // Include user override in alert payload for inspection view context
      const userOverride = await getUserClassificationOverride(stock.ticker, userId);
      alert.user_id = userId;
      alert.metadata.system_classification = currentState.suggested_code;
      alert.metadata.user_override_classification = userOverride?.final_code || null;
      alert.metadata.user_has_override = !!userOverride;
      await saveAlert(alert);
    }
  }
}
```

**Inspection View:**
```typescript
// Inspection view shows both system state and user override
async function getStockInspectionView(ticker: string, userId: string) {
  return {
    ticker,
    // System state (used for alerts)
    system_classification: await getSystemClassification(ticker),
    system_valuation_zone: await getSystemValuationZone(ticker),
    system_thresholds: await getSystemThresholds(ticker),

    // User override (for review/display)
    user_override_classification: await getUserOverride(ticker, userId),
    user_override_reason: await getUserOverrideReason(ticker, userId),

    // Explicit label
    alert_generation_uses_system_state: true
  };
}
```

### V2 Evolution Path

**If user demand justifies per-user alert customization:**
1. Add user preference: "Use my classification overrides for alerts"
2. Implement per-user valuation recomputation (estimated +100s runtime for 10 users)
3. Update alert generation to use user-specific effective valuation
4. Maintain backward compatibility (default: system state)

**Cost/Benefit for V1:**
- Per-user valuation adds ~1.5 min to nightly batch (10 users × 0.1s × 100 stocks)
- Significant complexity: per-user state management, audit trail, threshold divergence
- Benefit: alerts tuned to user's personal classification judgments
- **Decision:** Defer to V2. Keep V1 simple with shared system state for alerts.

---

## Consequences

### Positive ✅

**Computational Efficiency:**
- Classification/valuation run once per stock
- Nightly batch completes in <30 min (not 5 hours for 10 users)
- Infrastructure costs scale with universe size, not user count

**Framework Consistency:**
- All users see same system suggestions
- Easier to debug framework rules
- Framework updates propagate immediately

**User Autonomy:**
- Users can override classifications independently
- User A's judgment doesn't affect User B
- Personal monitoring lists (not forced to track all 1000 stocks)

**Scalability:**
- Adding user = new row in `users` table
- No re-computation needed
- Scales to 100s of users without re-architecture

**Clear Semantics:**
- System suggests (shared, used for alerts)
- User overrides (personal, used for inspection display)
- Alerts use system state (V1)
- Inspection shows both system + user override
- Easy to explain: "Alerts are from framework; your overrides are your judgment"

### Negative ⚠️

**Query Complexity:**
- Must join shared + user-scoped tables to get active code
- `active_code = user_classification_overrides.final_code || classification_state.suggested_code`
- Requires per-user query (cannot pre-compute active_code globally)

**Storage Overhead:**
- Duplicate user preferences across all users
- Each user has own `user_monitored_stocks` rows
- **Mitigation:** User tables are small (100 users × 100 monitored stocks = 10K rows, negligible)

**Override Divergence:**
- User overrides may diverge from system suggestions over time
- System suggests 4AA → 3AA, but user override stuck at 4AA
- **Mitigation:** Flag when suggested_code changes (user can review override)

**Multi-Tenancy Complexity:**
- Must ensure user isolation (User A cannot see User B's overrides)
- Row-level security or application-level filtering
- **Mitigation:** Add `user_id` to all user-scoped tables, filter in application layer

---

## Alternatives Considered

### Alternative 1: All Shared (Single Global State)

**Approach:**
- One classification per stock (all users see same code)
- One valuation per stock (all users see same thresholds)
- One alert feed (all users see same alerts)
- No user overrides, no personal watchlists

**Rejected Because:**
- ❌ Users cannot disagree on classifications (forced consensus)
- ❌ No personal monitoring (all users see all 1000 stocks)
- ❌ Alert feed not tailored to user interests
- ❌ User A's changes affect User B (unacceptable)
- ✅ Would be appropriate for single-user app (not multi-user)

---

### Alternative 2: All User-Scoped (Complete Isolation)

**Approach:**
- Each user has own `classification_state` table
- Each user has own `valuation_state` table
- Classification/valuation engines run per user
- Complete data isolation

**Rejected Because:**
- ❌ Computational waste (10 users = 10x classification runs)
- ❌ Framework updates require re-computation for all users
- ❌ No shared ground truth ("What does system suggest?")
- ❌ 10x infrastructure cost for same deterministic results
- ✅ Would be appropriate for non-deterministic ML models (not rules-based)

---

### Alternative 3: Shared with User "Views" (Materialized)

**Approach:**
- System computes shared classification/valuation
- Materialize per-user views: `user_A_classification_state`
- Views combine shared state + user overrides
- Pre-compute active_code per user

**Rejected Because:**
- ❌ Materialization complexity (when to refresh views?)
- ❌ Storage duplication (10 users × 1000 stocks = 10K rows per table)
- ❌ Stale data risk (user override not reflected in view until refresh)
- ✅ On-demand query with join is simpler for V1

---

## Implementation Notes

### Active Code Resolution (Per-User Query)

```typescript
async function getActiveCodeForUser(
  ticker: string,
  userId: string
): Promise<string | null> {
  const result = await db.query(`
    SELECT
      COALESCE(uco.final_code, cs.suggested_code) AS active_code
    FROM classification_state cs
    LEFT JOIN user_classification_overrides uco
      ON cs.ticker = uco.ticker AND uco.user_id = $1
    WHERE cs.ticker = $2
  `, [userId, ticker]);

  return result.rows[0]?.active_code || null;
}
```

### User Monitored Stocks Query

```typescript
async function getUserMonitoredStocks(userId: string): Promise<Stock[]> {
  return await db.query(`
    SELECT s.*, cs.suggested_code,
           COALESCE(uco.final_code, cs.suggested_code) AS active_code,
           vs.valuation_zone
    FROM user_monitored_stocks ums
    JOIN stocks s ON ums.ticker = s.ticker
    JOIN classification_state cs ON s.ticker = cs.ticker
    JOIN valuation_state vs ON s.ticker = vs.ticker
    LEFT JOIN user_classification_overrides uco
      ON s.ticker = uco.ticker AND uco.user_id = $1
    WHERE ums.user_id = $1 AND s.in_universe = TRUE
  `, [userId]);
}
```

### Alert Generation (Per-User)

```typescript
async function generateAlertsForUser(userId: string): Promise<void> {
  // Get user's monitored stocks
  const monitoredStocks = await getUserMonitoredStocks(userId);

  for (const stock of monitoredStocks) {
    // V1: Use SHARED system state for alert detection (not user overrides)
    const currentState = await getSystemValuationState(stock.ticker);
    const priorState = await getPriorSystemValuationState(stock.ticker);

    const alert = await detectValuationAlerts(stock.ticker, currentState, priorState);

    if (alert) {
      // Get user override for context (included in alert payload, not for alert logic)
      const userOverride = await getUserClassificationOverride(stock.ticker, userId);

      alert.user_id = userId;
      alert.metadata.system_classification = currentState.suggested_code;
      alert.metadata.user_override_classification = userOverride?.final_code || null;
      await saveAlert(alert);
    }
  }
}
```

---

## User Experience Implications

### Universe List (All Stocks, Shared Suggestions)

```
╔══════════════════════════════════════════════════════════╗
║ Stock Universe (1000 stocks)                             ║
╠══════════════════════════════════════════════════════════╣
║ Ticker | Name      | Suggested Code | Your Code | Zone  ║
║ AAPL   | Apple     | 4AA            | 3AA       | Steal ║
║ MSFT   | Microsoft | 4AA            | 4AA       | Good  ║
║ GOOGL  | Alphabet  | 4AB            | —         | Comf  ║
╚══════════════════════════════════════════════════════════╝
```

**Key:**
- "Suggested Code" = shared system suggestion (all users see same)
- "Your Code" = user's personal override (or "—" if accepting suggestion)
- "Zone" = computed from active_code (user override || system suggestion)

### Monitor List (User's Watchlist)

```
╔══════════════════════════════════════════════════════════╗
║ Your Monitored Stocks (125 stocks)                       ║
╠══════════════════════════════════════════════════════════╣
║ Ticker | Name      | Active Code | Zone       | Alerts  ║
║ AAPL   | Apple     | 3AA         | Steal Zone | 🔴 NEW  ║
║ MSFT   | Microsoft | 4AA         | Very Good  | —       ║
╚══════════════════════════════════════════════════════════╝
```

**Key:**
- Only shows stocks user added to monitor list
- "Active Code" = user override || system suggestion
- Alerts generated for monitored stocks only

---

## Data Model Impact

### New Tables Required

```sql
-- User accounts
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- User sessions
CREATE TABLE user_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User monitored stocks (watchlist)
CREATE TABLE user_monitored_stocks (
  user_id UUID NOT NULL REFERENCES users(user_id),
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

-- User classification overrides
CREATE TABLE user_classification_overrides (
  user_id UUID NOT NULL REFERENCES users(user_id),
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker),
  final_code VARCHAR(5) NOT NULL,
  override_reason TEXT,
  overridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

-- User valuation overrides (rare)
CREATE TABLE user_valuation_overrides (
  user_id UUID NOT NULL REFERENCES users(user_id),
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker),
  max_threshold NUMERIC(10,2),
  comfortable_threshold NUMERIC(10,2),
  very_good_threshold NUMERIC(10,2),
  steal_threshold NUMERIC(10,2),
  override_reason TEXT,
  overridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

-- User alert preferences
CREATE TABLE user_alert_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id),
  muted_alert_families JSONB DEFAULT '[]', -- ["data_quality"]
  priority_threshold VARCHAR(20) DEFAULT 'low', -- only show critical/high/medium
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id),
  default_sort VARCHAR(50),
  default_filters JSONB,
  display_density VARCHAR(20) DEFAULT 'comfortable',
  preferences JSONB DEFAULT '{}'
);
```

### Modified Tables

```sql
-- Add user_id to alerts
ALTER TABLE alerts ADD COLUMN user_id UUID NOT NULL REFERENCES users(user_id);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);

-- Add user_id to alert_history
ALTER TABLE alert_history ADD COLUMN user_id UUID NOT NULL REFERENCES users(user_id);
CREATE INDEX idx_alert_history_user_id ON alert_history(user_id);
```

---

## Security Implications

### V1 Security Model: Application-Layer Filtering

**V1 uses application-layer filtering for user isolation. Row-level security (RLS) is deferred to V2.**

**Rationale:**
- V1 user count is small (10-100 users, admin-controlled)
- Application-layer filtering is sufficient for V1 threat model
- Avoids PostgreSQL RLS complexity and performance overhead
- Simpler to test and debug during initial rollout

**Application-Layer Filtering Pattern:**
```typescript
// ALWAYS filter by user_id in WHERE clause for user-scoped tables
async function getUserAlerts(userId: string): Promise<Alert[]> {
  return await db.query(`
    SELECT * FROM alerts
    WHERE user_id = $1 AND status = 'active'
    ORDER BY priority DESC, created_at DESC
  `, [userId]);
}
```

**Critical:** Never query user-scoped tables without `user_id` filter (risk of data leakage)

**V2 Evolution:** Add PostgreSQL row-level security policies for defense-in-depth


### Shared Data Access

**Shared tables are read-only for users:**
- `stocks` - read-only
- `classification_state` - read-only (system writes)
- `valuation_state` - read-only (system writes)
- `anchored_thresholds` - read-only

**Users can only write to:**
- `user_classification_overrides`
- `user_valuation_overrides`
- `user_monitored_stocks`
- `user_alert_preferences`
- `user_preferences`

---

## Migration Path

**V1 Launch (Multi-User from Day 1):**
- No migration needed (greenfield)
- All tables created with multi-user support

**If V1 launched single-user (hypothetical):**
1. Add `users` table, migrate implicit user to first user
2. Add `user_id` to alerts, backfill with first user
3. Migrate `classification_state.final_code` → `user_classification_overrides`
4. Create `user_monitored_stocks` (default: all stocks for first user)

---

## Related Decisions

- **RFC-002:** Data model must support multi-user architecture
- **RFC-005:** Alerts are per-user, not global
- **ADR-004:** Classification overrides are per-user
- **ADR-002:** Nightly batch generates alerts for all users (sequential per-user)

---

## Notes

- V1 supports email/password authentication (no social login)
- User registration handled by admin (no self-service signup for V1)
- Session timeout: 7 days (configurable)
- Shared computation runs once per stock (not per user)
- User overrides are sticky (persist across system recomputes)

---

**END ADR-007**
