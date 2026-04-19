# RFC-005: Monitoring & Alerts Engine Architecture

**Status:** ACCEPTED
**Tier:** 1 (Core Architecture)
**Created:** 2026-04-19
**Dependencies:** RFC-002 (Data Model), RFC-003 (Valuation Engine), RFC-004 (Data Ingestion)
**Creates New Decisions:** YES
**Refines Existing:** NO

---

## Context / Problem

**V1 is a multi-user web application** (ADR-007). Each user monitors a personal subset of the 1000-stock universe.

V1 requires **per-user monitoring** to detect:
- Valuation opportunities (stock enters favorable zone)
- Classification changes (material shift in business stage/quality)
- Data quality issues (stale data, missing fields, provider failures)

**Key Constraints:**
- Alerts are **per-user**, not global
- Alerts generated only for stocks in user's monitor list (`user_monitored_stocks`)
- Alert acknowledgement/resolution is per-user (User A acknowledges, User B still sees active)

Without automated monitoring, users cannot track meaningful state changes across their monitored stocks at scale.

---

## Goals

1. Define alert families and generation triggers
2. Design state diffing algorithm (detect material changes)
3. Specify deduplication and cooldown strategy
4. Establish priority assignment rules
5. Define alert state lifecycle (active → acknowledged → resolved)
6. Specify alert inspection view data requirements
7. Ensure alerts do NOT include decision workflow (V1 scope boundary)

---

## Non-Goals

1. Portfolio construction recommendations (out of V1 scope)
2. Entry permission/stabilization logic (out of V1 scope)
3. Decision journaling and execution workflows (out of V1 scope)
4. Real-time alerting (V1 is daily batch-based)
5. Custom user-defined alert rules (V2+ feature)

---

## High-Level Architecture (Per-User Processing)

```
┌──────────────────────────────────────────────────┐
│    Monitoring & Alerts Engine (Per-User)        │
│                                                  │
│  FOR EACH ACTIVE USER:                           │
│                                                  │
│  ┌──────────────────────────────────┐            │
│  │  Get User's Monitored Stocks     │            │
│  │  (from user_monitored_stocks)    │            │
│  └────────┬─────────────────────────┘            │
│           │                                      │
│           ▼                                      │
│  ┌──────────────────────────────────┐            │
│  │  State Snapshot Manager          │            │
│  │  - Capture current state         │            │
│  │  - Retrieve prior state          │            │
│  │  - Use user's active_code        │            │
│  └────────┬─────────────────────────┘            │
│           │                                      │
│           ▼                                      │
│  ┌──────────────────────────────────┐            │
│  │  State Diff Engine               │            │
│  │  - Compare current vs prior      │            │
│  │  - Detect material changes       │            │
│  │  - Per monitored stock           │            │
│  └────────┬─────────────────────────┘            │
│           │                                      │
│           ▼                                      │
│  ┌──────────────────────────────────┐            │
│  │  Alert Generator                 │            │
│  │  - Valuation alerts              │            │
│  │  - Classification alerts         │            │
│  │  - Data quality alerts           │            │
│  │  - Include user_id               │            │
│  └────────┬─────────────────────────┘            │
│           │                                      │
│           ▼                                      │
│  ┌──────────────────────────────────┐            │
│  │  User Preference Filter          │            │
│  │  - Apply muted alert families    │            │
│  │  - Apply priority threshold      │            │
│  └────────┬─────────────────────────┘            │
│           │                                      │
│           ▼                                      │
│  ┌──────────────────────────────────┐            │
│  │  Deduplication Filter            │            │
│  │  - Check cooldown windows        │            │
│  │  - Suppress duplicate alerts     │            │
│  │  - Per-user dedup                │            │
│  └────────┬─────────────────────────┘            │
│           │                                      │
│           ▼                                      │
│  ┌──────────────────────────────────┐            │
│  │  Priority Assigner               │            │
│  │  - Zone-based priority           │            │
│  │  - Quality adjustments           │            │
│  └────────┬─────────────────────────┘            │
│           │                                      │
│           ▼                                      │
│  ┌──────────────────────────────────┐            │
│  │  Alert Persistence               │            │
│  │  - Write to alerts (with user_id)│            │
│  │  - Update alert_history          │            │
│  └──────────────────────────────────┘            │
│                                                  │
│  REPEAT FOR NEXT USER                            │
└──────────────────────────────────────────────────┘
```

**Key:** Alert generation runs sequentially for each user. Each user sees alerts only for their monitored stocks.

---

## Alert Families

### 1. Valuation Opportunity Alerts

**Trigger:** Stock enters or moves deeper into favorable valuation zone

**Generation Rules:**
- Generate when stock crosses into `very_good_zone` or `steal_zone`
- Generate when stock moves from `very_good_zone` → `steal_zone`
- DO NOT generate for every price tick within same zone
- DO NOT generate for `comfortable_zone` or `max_zone` (informational only)

**Example:**
```
AAPL entered STEAL ZONE
Code: 4AA | Forward P/E: 18.2x (threshold: 22x)
Priority: CRITICAL
```

### 2. Classification Change Alerts

**Trigger:** Material change in suggested classification

**Generation Rules:**
- Generate when `suggested_code` changes (e.g., 4AA → 3AA)
- Generate when `confidence_level` drops from `high` → `medium` or `low`
- DO NOT generate for minor score fluctuations within same bucket/quality

**Example:**
```
MSFT classification downgraded
Previous: 4AA (high confidence) → Current: 3AA (high confidence)
Reason: Revenue growth dropped below stalwart threshold
Priority: HIGH
```

### 3. Data Quality Alerts

**Trigger:** Data freshness degradation or missing critical fields

**Generation Rules:**
- Generate when `data_freshness_status` changes `fresh` → `stale` or `missing`
- Generate when critical field becomes `null` (e.g., `forward_pe` for Bucket 1-4)
- Generate when all providers fail for critical field

**Example:**
```
GOOGL data quality issue
Forward P/E missing (all providers failed)
Classification: 4AA → MANUAL_REQUIRED
Priority: MEDIUM
```

---

## State Diffing Algorithm

### State Snapshot Capture (Per-User)

**CRITICAL V1 SEMANTICS:** Alert generation uses **shared system state** (RFC-003 valuation_state). User classification/valuation overrides affect **inspection display only**, not operational alert generation.

```typescript
interface StateSnapshot {
  ticker: string;
  user_id: string; // Per-user snapshot (for audit trail)
  snapshot_timestamp: Date;

  // Classification state (SYSTEM suggestion used for alerts)
  suggested_code: string | null; // From classification_state (shared)
  confidence_level: 'high' | 'medium' | 'low';

  // User override context (for alert payload, NOT used for alert generation)
  user_override_code: string | null; // From user_classification_overrides (if exists)
  user_has_override: boolean; // True if user has classification override

  // Valuation state (from SHARED valuation_state table)
  valuation_zone: 'steal_zone' | 'very_good_zone' | 'comfortable_zone' | 'max_zone' | 'expensive';
  current_multiple: number | null;
  primary_metric: string | null;

  // Data quality
  data_freshness_status: 'fresh' | 'stale' | 'missing';
  missing_critical_fields: string[];
}
```

**Key:** Snapshots are per-user (each user monitors different stocks), but valuation_zone comes from shared `valuation_state` computed using system `suggested_code`, not user overrides.

### Diff Detection

```typescript
interface StateDiff {
  ticker: string;
  change_type: 'classification' | 'valuation' | 'data_quality';

  // Classification changes
  classification_change?: {
    prior_code: string | null;
    current_code: string | null;
    confidence_degraded: boolean;
  };

  // Valuation changes
  valuation_change?: {
    prior_zone: string;
    current_zone: string;
    zone_improved: boolean; // Entered more favorable zone
    prior_multiple: number | null;
    current_multiple: number | null;
  };

  // Data quality changes
  data_quality_change?: {
    prior_status: string;
    current_status: string;
    new_missing_fields: string[];
  };
}

async function detectMaterialChanges(
  current: StateSnapshot,
  prior: StateSnapshot | null,
  userId: string // Per-user detection (for monitored stocks)
): Promise<StateDiff[]> {
  const diffs: StateDiff[] = [];

  if (!prior) return diffs; // First run, no prior state

  // Check classification change (using SYSTEM suggested_code, not user override)
  if (current.suggested_code !== prior.suggested_code) {
    diffs.push({
      ticker: current.ticker,
      change_type: 'classification',
      classification_change: {
        prior_code: prior.suggested_code, // System's prior suggestion
        current_code: current.suggested_code, // System's current suggestion
        confidence_degraded: (
          current.confidence_level === 'low' && prior.confidence_level === 'high'
        )
      }
    });
  }

  // Check valuation zone change
  if (current.valuation_zone !== prior.valuation_zone) {
    const FAVORABLE_ZONES = ['steal_zone', 'very_good_zone'];
    const zone_improved = (
      FAVORABLE_ZONES.includes(current.valuation_zone) &&
      !FAVORABLE_ZONES.includes(prior.valuation_zone)
    ) || (
      current.valuation_zone === 'steal_zone' &&
      prior.valuation_zone === 'very_good_zone'
    );

    // Only alert on favorable zone entry
    if (zone_improved) {
      diffs.push({
        ticker: current.ticker,
        change_type: 'valuation',
        valuation_change: {
          prior_zone: prior.valuation_zone,
          current_zone: current.valuation_zone,
          zone_improved: true,
          prior_multiple: prior.current_multiple,
          current_multiple: current.current_multiple
        }
      });
    }
  }

  // Check data quality degradation
  if (current.data_freshness_status !== prior.data_freshness_status) {
    const quality_degraded = (
      (current.data_freshness_status === 'stale' && prior.data_freshness_status === 'fresh') ||
      (current.data_freshness_status === 'missing' && prior.data_freshness_status !== 'missing')
    );

    if (quality_degraded) {
      diffs.push({
        ticker: current.ticker,
        change_type: 'data_quality',
        data_quality_change: {
          prior_status: prior.data_freshness_status,
          current_status: current.data_freshness_status,
          new_missing_fields: current.missing_critical_fields.filter(
            f => !prior.missing_critical_fields.includes(f)
          )
        }
      });
    }
  }

  return diffs;
}
```

---

## Alert Generation

### Alert Structure (Per-User)

```typescript
interface Alert {
  alert_id: string; // UUID
  user_id: string; // NEW: Per-user alert (only for user's monitored stocks)
  ticker: string;
  alert_family: 'valuation_opportunity' | 'classification_change' | 'data_quality';
  alert_type: string; // 'steal_zone_entry', 'code_downgrade', 'stale_data', etc.
  priority: 'critical' | 'high' | 'medium' | 'low';

  title: string; // "AAPL entered STEAL ZONE"
  message: string; // Detailed description

  metadata: {
    prior_state: any;
    current_state: any;
    change_summary: any;
  };

  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  created_at: Date;
  acknowledged_at?: Date;
  resolved_at?: Date;
}
```

**Key:** Each alert belongs to a specific user. User A acknowledging an alert does not affect User B's view of the same alert.

### Generation Logic (Per-User)

```typescript
async function generateAlertsForUser(
  userId: string,
  diffs: StateDiff[]
): Promise<Alert[]> {
  const alerts: Alert[] = [];

  for (const diff of diffs) {
    if (diff.change_type === 'valuation' && diff.valuation_change?.zone_improved) {
      const priority = diff.valuation_change.current_zone === 'steal_zone'
        ? 'critical'
        : 'high';

      alerts.push({
        alert_id: generateUUID(),
        user_id: userId, // NEW: Per-user alert
        ticker: diff.ticker,
        alert_family: 'valuation_opportunity',
        alert_type: `${diff.valuation_change.current_zone}_entry`,
        priority,
        title: `${diff.ticker} entered ${diff.valuation_change.current_zone.replace('_', ' ').toUpperCase()}`,
        message: buildValuationMessage(diff),
        metadata: {
          prior_state: { zone: diff.valuation_change.prior_zone, multiple: diff.valuation_change.prior_multiple },
          current_state: { zone: diff.valuation_change.current_zone, multiple: diff.valuation_change.current_multiple },
          change_summary: { zone_improved: true }
        },
        status: 'active',
        created_at: new Date()
      });
    }

    if (diff.change_type === 'classification') {
      alerts.push({
        alert_id: generateUUID(),
        user_id: userId, // NEW: Per-user alert
        ticker: diff.ticker,
        alert_family: 'classification_change',
        alert_type: diff.classification_change!.confidence_degraded ? 'confidence_drop' : 'code_change',
        priority: 'high',
        title: `${diff.ticker} classification changed`,
        message: buildClassificationMessage(diff),
        metadata: {
          prior_state: { code: diff.classification_change!.prior_code },
          current_state: { code: diff.classification_change!.current_code },
          change_summary: { confidence_degraded: diff.classification_change!.confidence_degraded }
        },
        status: 'active',
        created_at: new Date()
      });
    }

    if (diff.change_type === 'data_quality') {
      alerts.push({
        alert_id: generateUUID(),
        user_id: userId, // NEW: Per-user alert
        ticker: diff.ticker,
        alert_family: 'data_quality',
        alert_type: `data_${diff.data_quality_change!.current_status}`,
        priority: 'medium',
        title: `${diff.ticker} data quality issue`,
        message: buildDataQualityMessage(diff),
        metadata: {
          prior_state: { status: diff.data_quality_change!.prior_status },
          current_state: {
            status: diff.data_quality_change!.current_status,
            missing_fields: diff.data_quality_change!.new_missing_fields
          },
          change_summary: { quality_degraded: true }
        },
        status: 'active',
        created_at: new Date()
      });
    }
  }

  return alerts;
}
```

---

## User Overrides and Alert Generation (V1 Scope)

### Critical V1 Decision

**User classification and valuation overrides affect inspection display only. They do NOT affect operational alert generation in V1.**

### Rationale

**V1 is Monitoring-First:**
- Primary goal: surface opportunities automatically using consistent framework across all users
- User overrides are for personal judgment/review during inspection
- Keeping alert logic deterministic and consistent simplifies V1 implementation

**Prevents Per-User Valuation Complexity:**
- If user overrides affected alerts, would require per-user valuation recomputation
- Example: User A overrides AAPL from 4AA → 3AA, which changes metric family → different thresholds → different zone
- V1 avoids this by computing valuation once (shared) and using for all user alerts

**Preserves User Autonomy:**
- Users can still override classification/thresholds for inspection/review
- Alert payload shows both system state and user override for context
- User sees: "Alert triggered by system valuation (4AA, steal zone); your override: 3AA"

### Implementation Pattern

```typescript
// Alert generation uses SHARED system state
async function generateAlertsForUser(
  userId: string,
  monitoredTickers: string[]
): Promise<Alert[]> {
  // Get state snapshots using SYSTEM suggested_code
  const snapshots = await db.query(`
    SELECT
      cs.ticker,
      cs.suggested_code, -- System suggestion (used for alerts)
      vs.valuation_zone,  -- From shared valuation_state
      vs.current_multiple,
      uco.final_code AS user_override_code, -- User override (for context only)
      CASE WHEN uco.final_code IS NOT NULL THEN true ELSE false END AS user_has_override
    FROM classification_state cs
    JOIN valuation_state vs ON cs.ticker = vs.ticker
    LEFT JOIN user_classification_overrides uco
      ON cs.ticker = uco.ticker AND uco.user_id = $1
    WHERE cs.ticker = ANY($2)
  `, [userId, monitoredTickers]);

  // Alerts generated from shared system state
  // user_override_code included in alert metadata for inspection view
  const alerts = detectChangesAndGenerateAlerts(snapshots);
  return alerts;
}
```

### Alert Payload Structure

```typescript
{
  alert_id: "uuid",
  user_id: "user-uuid",
  ticker: "AAPL",
  alert_family: "valuation_opportunity",
  alert_type: "steal_zone_entry",
  priority: "critical",
  title: "AAPL entered STEAL ZONE",
  message: "Forward P/E dropped to 18.2x (threshold: 22.0x)",
  metadata: {
    // System state (used to generate alert)
    system_classification: "4AA",
    system_valuation_zone: "steal_zone",
    system_current_multiple: 18.2,
    system_threshold: 22.0,

    // User override context (for inspection display)
    user_override_classification: "3AA", // null if no override
    user_has_classification_override: true,
    user_override_reason: "Mature business, growth slowing",

    // Change summary
    prior_zone: "comfortable_zone",
    current_zone: "steal_zone",
    zone_improved: true
  },
  status: "active",
  created_at: "2026-04-18T20:35:00Z"
}
```

### V2 Evolution Path

**If user demand justifies per-user alert customization:**
1. Add user preference: "Use my classification overrides for alerts"
2. Implement per-user valuation recomputation (on-demand or batched)
3. Update alert generation to use user-specific effective valuation
4. Maintain backward compatibility (default: system state)

**Cost/Benefit for V1:**
- Per-user valuation recomputation: ~0.1s × 100 stocks × 10 users = 100s (adds ~1.5 min to nightly batch)
- Complexity: Per-user valuation state management, audit trail complexity
- Benefit: Users get alerts tuned to their personal classification judgments
- **Decision:** Defer to V2. V1 keeps it simple with shared system state.

---

## Deduplication & Cooldown Strategy

### Cooldown Windows

| Alert Family | Cooldown Period | Rationale |
|--------------|----------------|-----------|
| Valuation Opportunity | 24 hours | Prevent alert spam on price volatility |
| Classification Change | 24 hours | Material changes are rare |
| Data Quality | 12 hours | Faster notification for operational issues |

### Deduplication Logic

```typescript
async function deduplicateAlerts(
  pendingAlerts: Alert[]
): Promise<Alert[]> {
  const dedupedAlerts: Alert[] = [];

  for (const alert of pendingAlerts) {
    const cooldownHours = alert.alert_family === 'data_quality' ? 12 : 24;

    const recentSimilar = await db.query(`
      SELECT alert_id FROM alerts
      WHERE ticker = $1
        AND alert_family = $2
        AND alert_type = $3
        AND created_at > NOW() - INTERVAL '${cooldownHours} hours'
      LIMIT 1
    `, [alert.ticker, alert.alert_family, alert.alert_type]);

    if (recentSimilar.rows.length === 0) {
      dedupedAlerts.push(alert);
    } else {
      // Suppress duplicate
      await logSuppressedAlert(alert, 'cooldown_active');
    }
  }

  return dedupedAlerts;
}
```

---

## Priority Assignment Rules

### Base Priority

| Zone / Event | Priority |
|--------------|----------|
| Steal Zone Entry | CRITICAL |
| Very Good Zone Entry | HIGH |
| Classification Downgrade (bucket change) | HIGH |
| Confidence Drop (high → low) | MEDIUM |
| Data Quality Issue | MEDIUM |
| Comfortable Zone Entry | LOW (not alerted by default) |

### Quality Adjustments

For valuation alerts, adjust priority based on classification quality:

```typescript
function adjustPriorityForQuality(
  basePriority: string,
  code: string
): string {
  const quality = code.slice(1); // "AA", "AB", "BA", etc.

  if (quality === 'AA' && basePriority === 'high') {
    return 'critical'; // AA-quality stocks in very_good_zone upgraded to critical
  }

  if (quality.includes('C') && basePriority === 'critical') {
    return 'high'; // C-quality stocks downgraded (weaker fundamentals)
  }

  return basePriority;
}
```

---

## Alert State Lifecycle

```
┌─────────┐
│ ACTIVE  │ ◄─── Generated by monitoring engine
└────┬────┘
     │
     ├──► User views alert in inspection view
     │
     ▼
┌──────────────┐
│ ACKNOWLEDGED │ ◄─── User marks "I've seen this"
└──────┬───────┘
       │
       ├──► User researches stock
       │
       ▼
┌──────────┐
│ RESOLVED │ ◄─── Condition no longer applies OR user dismisses
└──────────┘
       │
       └──► Alert archived to alert_history

Alternative path:
┌─────────┐
│ ACTIVE  │
└────┬────┘
     │
     ▼
┌────────────┐
│ SUPPRESSED │ ◄─── Auto-suppressed by deduplication filter
└────────────┘
```

### State Transitions

```typescript
enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  SUPPRESSED = 'suppressed'
}

interface AlertStateTransition {
  from: AlertStatus;
  to: AlertStatus;
  allowed: boolean;
  requires_user_action: boolean;
}

const ALLOWED_TRANSITIONS: AlertStateTransition[] = [
  { from: AlertStatus.ACTIVE, to: AlertStatus.ACKNOWLEDGED, allowed: true, requires_user_action: true },
  { from: AlertStatus.ACKNOWLEDGED, to: AlertStatus.RESOLVED, allowed: true, requires_user_action: true },
  { from: AlertStatus.ACTIVE, to: AlertStatus.RESOLVED, allowed: true, requires_user_action: true },
  { from: AlertStatus.ACTIVE, to: AlertStatus.SUPPRESSED, allowed: true, requires_user_action: false },
];
```

---

## Alert Inspection View (V1 Read-Only)

### View Requirements

**MUST INCLUDE:**
- Alert list (filterable by family, priority, status)
- Per-alert detail: ticker, title, message, metadata, timestamp
- Classification snapshot (current code, confidence, reason_codes)
- Valuation snapshot (current zone, multiple, thresholds)
- Historical state comparison (prior vs current)

**MUST NOT INCLUDE:**
- "Add to watchlist" button (portfolio construction out of scope)
- "Mark for entry" button (entry permission out of scope)
- Decision workflow UI (out of scope)
- Trade execution features (out of scope)

### Example Alert Detail View

```
╔══════════════════════════════════════════════════════════╗
║ ALERT: AAPL entered STEAL ZONE                           ║
║ Priority: CRITICAL | Created: 2026-04-18 20:35 ET        ║
╠══════════════════════════════════════════════════════════╣
║ Ticker: AAPL                                             ║
║ Classification: 4AA (high confidence)                    ║
║ Valuation Zone: STEAL ZONE                               ║
║                                                          ║
║ Current State:                                           ║
║   Forward P/E: 18.2x                                     ║
║   Steal Threshold: 22.0x                                 ║
║   Discount: 17% below threshold                          ║
║                                                          ║
║ Prior State (2026-04-17):                                ║
║   Forward P/E: 22.8x                                     ║
║   Zone: COMFORTABLE ZONE                                 ║
║                                                          ║
║ Change Summary:                                          ║
║   Forward P/E dropped 4.6x (20% decline)                 ║
║   Crossed from comfortable → steal zone                  ║
║                                                          ║
║ [ Acknowledge ]  [ Resolve ]  [ View Full Stock Detail ] ║
╚══════════════════════════════════════════════════════════╝
```

---

## Monitoring Pipeline Schedule (V1 Batch - Per-User Processing)

```
Daily Schedule:
  5:00 PM ET  - Price sync completes (shared)
  6:00 PM ET  - Fundamentals sync completes (shared)
  7:00 PM ET  - Forward estimates sync completes (shared)
  8:00 PM ET  - Classification recompute runs (shared)
  8:15 PM ET  - Valuation recompute runs (shared)
  8:30 PM ET  - FOR EACH ACTIVE USER (sequential):
                  - Get user's monitored stocks
                  - Capture state snapshot (with user's active_code)
                  - Detect state diffs vs prior snapshot
                  - Generate alerts (with user_id)
                  - Apply user alert preferences (mute/priority filter)
                  - Deduplication filter (per-user)
                  - Persist alerts (with user_id)
  9:00 PM ET  - All user alerts persisted
```

**Critical:**
- Shared computation (classification, valuation) runs once
- Alert generation runs per-user sequentially
- Estimated runtime: 10 users × 100 monitored stocks/user × 0.1s/stock = 100s

**Scaling:** For 100 users, estimated runtime = 1000s (~17 min), still within nightly window.

---

## Implementation Notes

### Data Model Integration

**Uses RFC-002 tables:**
- `classification_state` - Current classification for diff detection
- `classification_history` - Prior state retrieval
- `valuation_state` - Current valuation for diff detection
- `valuation_history` - Prior state retrieval
- `alerts` - Active/acknowledged/resolved alerts (NEW)
- `alert_history` - Archived alerts (NEW)

**New Tables Required:**

```sql
CREATE TABLE alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker),
  alert_family VARCHAR(50) NOT NULL CHECK (
    alert_family IN ('valuation_opportunity', 'classification_change', 'data_quality')
  ),
  alert_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),

  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'acknowledged', 'resolved', 'suppressed')
  ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  INDEX idx_alerts_ticker (ticker),
  INDEX idx_alerts_status (status),
  INDEX idx_alerts_priority (priority),
  INDEX idx_alerts_created_at (created_at DESC)
);

CREATE TABLE alert_history (
  alert_id UUID PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  alert_family VARCHAR(50) NOT NULL,
  alert_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL,

  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  INDEX idx_alert_history_ticker (ticker),
  INDEX idx_alert_history_archived_at (archived_at DESC)
);
```

---

## Testing Strategy

### Unit Tests
- State diff detection logic
- Alert generation rules
- Deduplication filtering
- Priority assignment

### Integration Tests
- End-to-end monitoring pipeline execution
- Alert persistence and retrieval
- State transition validation

### Test Cases

**Valuation Zone Transitions:**
```typescript
describe('ValuationAlertGeneration', () => {
  it('generates CRITICAL alert on steal zone entry', async () => {
    const prior = { zone: 'comfortable_zone', multiple: 22.8 };
    const current = { zone: 'steal_zone', multiple: 18.2 };
    const alert = await generateValuationAlert('AAPL', prior, current);
    expect(alert.priority).toBe('critical');
  });

  it('does NOT alert on max → comfortable transition', async () => {
    const prior = { zone: 'max_zone', multiple: 28.0 };
    const current = { zone: 'comfortable_zone', multiple: 26.0 };
    const alert = await generateValuationAlert('AAPL', prior, current);
    expect(alert).toBeNull(); // No alert for less favorable zones
  });
});
```

**Deduplication:**
```typescript
describe('AlertDeduplication', () => {
  it('suppresses duplicate alert within 24h cooldown', async () => {
    await createAlert('AAPL', 'valuation_opportunity', 'steal_zone_entry');
    await advanceTime(12, 'hours');

    const newAlert = { ticker: 'AAPL', alert_family: 'valuation_opportunity', alert_type: 'steal_zone_entry' };
    const result = await deduplicateAlerts([newAlert]);
    expect(result).toHaveLength(0); // Suppressed
  });

  it('allows alert after 24h cooldown expires', async () => {
    await createAlert('AAPL', 'valuation_opportunity', 'steal_zone_entry');
    await advanceTime(25, 'hours');

    const newAlert = { ticker: 'AAPL', alert_family: 'valuation_opportunity', alert_type: 'steal_zone_entry' };
    const result = await deduplicateAlerts([newAlert]);
    expect(result).toHaveLength(1); // Allowed
  });
});
```

---

## Performance Considerations

**V1 Scale:** 1000 stocks, daily batch processing

**Expected Load:**
- State snapshots: 1000 rows/day
- State diffs: ~10-50 material changes/day (1-5% of universe)
- Alert generation: ~10-50 alerts/day
- Alert persistence: <1s for batch write

**Optimization:**
- Batch state snapshot retrieval (single query for all tickers)
- Parallel diff detection (per-ticker independent)
- Index on `alerts.created_at DESC` for cooldown queries

---

## Required ADRs

**None.** This RFC creates new architectural decisions for the monitoring subsystem.

**Related ADRs:**
- ADR-001: Multi-Provider Data Architecture (referenced for data quality alerts)
- ADR-007: Multi-User Architecture (per-user alert generation)

---

## Open Questions

1. **Alert delivery mechanism:** V1 uses in-app view only. Email/SMS notifications deferred to V2?
2. **Alert archival policy:** Keep `alert_history` indefinitely or purge after N days?
3. **User-configurable cooldowns:** V1 uses hardcoded 12h/24h. Allow customization in V2?

---

**END RFC-005**
