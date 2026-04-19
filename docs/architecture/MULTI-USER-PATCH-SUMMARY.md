# Multi-User Architecture Patch Summary

**Date:** 2026-04-19
**Scope:** V1 Multi-User Web App Support
**Related:** ADR-007

---

## What Changed

### Prior Assumption
V1 implicitly assumed single user (all state global, no authentication).

### New Assumption
V1 is **multi-user web application** with:
- Authenticated user accounts
- Shared system computation (classification/valuation)
- Per-user monitoring (watchlist, alerts, overrides, preferences)
- Core UX explicitly defined (5 screens)

---

## Files Changed

### 1. RFC-002: Data Model ✅ PATCHED

**Changes:**
- Added **"Multi-User Tables (Per-User State)"** section
- New tables:
  - `users` - User accounts, authentication
  - `user_sessions` - Session management
  - `user_monitored_stocks` - Per-user watchlist
  - `user_classification_overrides` - Per-user classification overrides (replaces `final_code` in `classification_state`)
  - `user_valuation_overrides` - Per-user threshold overrides (rare)
  - `user_alert_preferences` - Per-user alert settings
  - `user_preferences` - UI settings, default filters
  - `user_override_history` - Audit trail for overrides
  - `user_monitoring_history` - Audit trail for watchlist changes

- Modified tables:
  - `classification_state` - Removed `final_code`, `override_reason`, `classification_status` (now per-user)
  - `valuation_state` - Clarified as shared system computation
  - `alerts` - Added `user_id` column (per-user alerts)
  - `alert_history` - Added `user_id` column

- Updated entity relationship diagram to show shared vs per-user partitioning

**Key Semantic Change:**
- `classification_state.suggested_code` is **shared** (all users see same system suggestion)
- `user_classification_overrides.final_code` is **per-user** (User A can override to 3AA, User B keeps 4AA)
- Active code resolved per-user: `active_code = user_override.final_code || classification_state.suggested_code`

---

### 2. RFC-005: Monitoring & Alerts ⚠️ NEEDS PATCH

**Required Changes:**
- Clarify alerts are **per-user**, not global
- Alerts generated only for stocks in user's `user_monitored_stocks` table
- Alert acknowledgement/resolution is per-user (User A acknowledges, User B still sees active)
- Update state diffing to be per-user (compare current vs prior for user's monitored stocks only)
- Update alert generation logic to include `user_id` in all alert records

**Specific Patches Needed:**
```markdown
## Alert Generation (Per-User)

Alerts are generated **per-user** based on:
1. User's monitored stocks (`user_monitored_stocks`)
2. User's active classification code (system suggestion || user override)
3. User's alert preferences (priority threshold, muted families)

async function generateAlertsForAllUsers(): Promise<void> {
  const users = await db.query('SELECT user_id FROM users WHERE is_active = TRUE');

  for (const user of users.rows) {
    await generateAlertsForUser(user.user_id);
  }
}

async function generateAlertsForUser(userId: string): Promise<void> {
  // Get user's monitored stocks
  const monitoredStocks = await getUserMonitoredStocks(userId);

  for (const stock of monitoredStocks) {
    const currentState = await getValuationStateForUser(stock.ticker, userId);
    const priorState = await getPriorValuationStateForUser(stock.ticker, userId);

    const alert = await detectValuationAlerts(stock.ticker, currentState, priorState);

    if (alert && !isUserMuted(alert, userId)) {
      alert.user_id = userId; // Add user_id
      await saveAlert(alert);
    }
  }
}
```

---

### 3. RFC-001: Classification Engine ⚠️ NEEDS MINOR PATCH

**Required Changes:**
- Clarify `classification_state` stores **shared system suggestions**
- User overrides stored in `user_classification_overrides` (per-user table)
- Classification engine computes once per stock, updates shared `classification_state`
- Active code resolved per-user at query time

**Specific Patch:**
```markdown
## Classification State Persistence

Classification engine writes to **shared** `classification_state` table:
- `suggested_code` - System-computed classification (visible to all users)
- `confidence_level` - System confidence (high/medium/low)
- `reason_codes` - Why system suggested this code
- `scores` - Bucket/quality scores

**User overrides** stored separately in `user_classification_overrides`:
- `final_code` - User's manual classification
- `override_reason` - Why user disagrees with system
- Per-user (User A can override to 3AA, User B can keep system 4AA)

**Active code resolution** (per-user query):
```sql
SELECT COALESCE(uco.final_code, cs.suggested_code) AS active_code
FROM classification_state cs
LEFT JOIN user_classification_overrides uco
  ON cs.ticker = uco.ticker AND uco.user_id = $1
WHERE cs.ticker = $2;
```
```

---

### 4. RFC-003: Valuation Engine ⚠️ NEEDS MINOR PATCH

**Required Changes:**
- Clarify `valuation_state` stores **shared system computation**
- Based on shared classification suggestions + anchored thresholds
- User threshold overrides stored in `user_valuation_overrides` (rare, per-user)
- Active thresholds resolved per-user at query time

**Specific Patch:**
```markdown
## Valuation State Persistence

Valuation engine writes to **shared** `valuation_state` table:
- `thresholds` - System-computed thresholds (anchored or derived)
- `valuation_zone` - Current zone based on system thresholds
- `threshold_source` - anchored/derived/manual_override

**User overrides** (rare) stored in `user_valuation_overrides`:
- Per-user custom thresholds
- Expect <1% of stocks to have user overrides

**Active thresholds resolution** (per-user query):
```sql
SELECT COALESCE(uvo.max_threshold, vs.max_threshold) AS active_max_threshold,
       COALESCE(uvo.comfortable_threshold, vs.comfortable_threshold) AS active_comfortable_threshold,
       -- etc.
FROM valuation_state vs
LEFT JOIN user_valuation_overrides uvo
  ON vs.ticker = uvo.ticker AND uvo.user_id = $1
WHERE vs.ticker = $2;
```
```

---

### 5. ADR-004: Classification Automation ⚠️ NEEDS PATCH

**Required Changes:**
- Update from single-user override model to per-user override model
- Clarify `classification_state` is shared, `user_classification_overrides` is per-user
- Update code examples to show per-user query patterns

**Specific Patch:**
```markdown
## Data Model (Multi-User)

**Shared (System Suggestions):**
```sql
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY,
  suggested_code VARCHAR(5),
  confidence_level VARCHAR(10),
  reason_codes JSONB,
  scores JSONB
  -- No final_code (moved to per-user table)
);
```

**Per-User (User Overrides):**
```sql
CREATE TABLE user_classification_overrides (
  user_id UUID,
  ticker VARCHAR(10),
  final_code VARCHAR(5),
  override_reason TEXT,
  overridden_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, ticker)
);
```

**Active Code Resolution:**
User A overrides AAPL to 3AA, User B keeps system 4AA:
- User A query: `active_code = "3AA"` (from user_classification_overrides)
- User B query: `active_code = "4AA"` (from classification_state.suggested_code)
```

---

### 6. PRD: Product Full V1 ⚠️ NEEDS PATCH

**Required Changes:**
- Add **"Authentication & Access"** section
- Add **"Core UX (V1)"** section with 5 screens

**Specific Patch:**

Add new section after "V1 Scope":

```markdown
## Authentication & Access

### User Accounts

**V1 Approach:**
- Email/password authentication
- Admin creates accounts (no self-service signup)
- Session management (7-day expiration)

**Out of Scope:**
- Social login (Google, GitHub)
- Two-factor authentication
- Self-service password reset (admin-assisted only)

### Session Management

**Session Duration:** 7 days (configurable)
**Session Storage:** Database-backed (user_sessions table)
**Security:** HTTPS required, secure cookies

---

## Core UX (V1)

V1 defines 5 core screens:

### 1. Sign-In / Access
- Email/password sign-in form
- "Forgot password" (admin-assisted for V1)
- Session persistence ("Remember me")

### 2. Universe / Monitor List
- View full universe (1000 stocks, $5bn+ market cap, US)
- Filter by sector, market cap, zone, classification
- Add/remove stocks to personal monitor list
- See system-suggested classification
- Apply personal classification override (opens modal)
- Sort by zone, market cap, ticker

**Key:** Monitoring is opt-in (user selects stocks to monitor, not all 1000).

### 3. Alerts Feed
- View active alerts for user's monitored stocks only
- Filter by priority (critical, high, medium, low)
- Filter by alert family (valuation, classification, data quality)
- Sort by creation time (newest first)
- Acknowledge/resolve alerts
- Click alert → opens Stock Detail view

**Key:** Alerts are per-user, based on user's monitored stocks.

### 4. Alert Inspection / Stock Detail (Read-Only)
- View alert details (prior state, current state, change summary)
- View stock classification (system suggestion + user override if present)
- View stock valuation (thresholds, zone, metric)
- View historical changes (classification/valuation timeline)
- View data provenance (which provider supplied data)
- Override classification/thresholds (opens modal)

**Out of Scope:**
- Manual TSR estimation
- Entry permission workflow
- Decision journaling
- Trade execution

### 5. User Monitoring Preferences / Settings
- Alert preferences (mute families, priority threshold)
- UI preferences (default sort, filters, display density)
- Account settings (change password, email)

**Out of Scope:**
- Custom alert rules
- Email/SMS notifications (V1 in-app only)
```

---

### 7. ADR-007: Multi-User Architecture ✅ CREATED

**New ADR** documenting decision to use hybrid shared/per-user architecture.

**Key Decision:**
- Shared: stock data, classification suggestions, valuation computations, framework config
- Per-user: monitored stocks, classification overrides, valuation overrides, alerts, preferences

---

## Shared vs User-Scoped State

### Shared (System-Computed, Global)

| Entity | Table | Why Shared |
|--------|-------|-----------|
| Stock Universe | `stocks` | Data synced once, available to all |
| Classification Suggestions | `classification_state` | Deterministic computation (same inputs → same outputs) |
| Valuation Computations | `valuation_state` | Based on shared classifications + anchored thresholds |
| Framework Config | `anchored_thresholds`, `tsr_hurdles` | Single source of truth |
| Audit Trails | `*_history` | System suggestion changes (shared historical record) |

### User-Scoped (Per-User)

| Entity | Table | Why Per-User |
|--------|-------|-------------|
| User Accounts | `users`, `user_sessions` | Authentication, session management |
| Monitored Stocks | `user_monitored_stocks` | Personal watchlist (not all 1000 stocks) |
| Classification Overrides | `user_classification_overrides` | Judgment calls (users may disagree) |
| Valuation Overrides | `user_valuation_overrides` | Rare edge case overrides |
| Alerts | `alerts` | Generated for user's monitored stocks only |
| Alert Preferences | `user_alert_preferences` | Muting, priority thresholds |
| UI Preferences | `user_preferences` | Default sort, filters, display |
| User Audit Trails | `user_override_history`, `user_monitoring_history` | Per-user action history |

---

## Core UX (V1) - Final List

1. **Sign-In / Access** - Email/password authentication, session management
2. **Universe / Monitor List** - View 1000 stocks, add to personal watchlist, apply overrides
3. **Alerts Feed** - View/acknowledge/resolve alerts for monitored stocks
4. **Alert Inspection / Stock Detail** - Read-only stock details, full classification/valuation context
5. **User Preferences / Settings** - Alert settings, UI preferences, account settings

---

## Follow-Up Actions Required

### Before Epic Validation

1. **Patch RFC-005** - Update monitoring/alerts to clarify per-user generation
2. **Patch RFC-001** - Clarify shared classification_state + per-user overrides
3. **Patch RFC-003** - Clarify shared valuation_state + per-user overrides
4. **Patch ADR-004** - Update override model to per-user
5. **Patch PRD** - Add Authentication & Core UX sections
6. **Update ADR-002** (Nightly Batch) - Clarify batch generates alerts per-user sequentially

### No Changes Needed

- **ADR-001** (Multi-Provider) - No changes (data ingestion is shared)
- **ADR-003** (Full State Snapshots) - No changes (history strategy unchanged)
- **ADR-005** (Threshold Management) - No changes (anchored thresholds are shared)
- **ADR-006** (Alert Generation) - Minor clarification (already zone-entry based, just add per-user scoping)
- **RFC-004** (Data Ingestion) - No changes (ingestion is shared, populates shared `stocks` table)

---

## Epic-Boundary Impact

### New Epics Required

1. **EPIC: User Authentication & Session Management**
   - User account creation (admin)
   - Sign-in/sign-out flows
   - Session management
   - Password management (admin-assisted reset)

2. **EPIC: Monitor List (Watchlist) Management**
   - Add/remove stocks from personal monitor list
   - View monitored stocks
   - Bulk add (e.g., "Monitor all Bucket 4 stocks")

3. **EPIC: Per-User Classification Overrides**
   - Override UI (modal/inline edit)
   - Active code resolution (user override || system suggestion)
   - Override history tracking

4. **EPIC: Per-User Alert Generation**
   - Generate alerts for user's monitored stocks only
   - Apply user alert preferences (muting, priority threshold)
   - Alert acknowledgement/resolution (per-user state)

5. **EPIC: User Preferences & Settings**
   - Alert preference UI
   - UI preference UI (default sort, filters)
   - Account settings UI

### Modified Epics

1. **EPIC: Classification Engine** - Now writes to shared `classification_state`, not per-user
2. **EPIC: Valuation Engine** - Now writes to shared `valuation_state`, not per-user
3. **EPIC: Monitoring & Alerts** - Now generates alerts per-user, not global
4. **EPIC: Alert Inspection View** - Now shows per-user active code, user overrides

---

**END SUMMARY**
