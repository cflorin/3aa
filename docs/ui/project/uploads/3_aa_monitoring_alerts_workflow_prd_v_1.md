# 3AA Monitoring & Alerts Workflow PRD (v1.0)

## Objective
Build the **Monitoring & Alerts Workflow** for the long-term investing product. This workflow is the **output layer of V1**. It must continuously evaluate stocks against the 3AA framework and surface **stocks of interest** when framework-defined conditions become actionable.

This workflow must be based only on:
- classification state
- valuation metric state
- threshold state
- valuation zone
- data quality / stale-data state
- optional user watchlist / monitored-list membership

This workflow must **not** depend on:
- manual 5-year TSR input
- decision journaling
- portfolio construction
- entry permission / technical stabilization

The workflow must also include a **read-only stock detail / alert inspection view** so the user can understand why an alert fired.

---

## Scope (V1)
This PRD covers only the **monitoring, alerting, and alert-inspection workflow**.

### In scope
- Scan eligible stocks for framework events
- Generate alerts from classification + valuation state
- Prioritize and deduplicate alerts
- Persist alert history
- Display alert feed / stocks-of-interest list
- Provide a read-only stock detail / alert inspection page
- Support optional user-monitored list / watchlist
- Track stale or invalid data states

### Out of scope
- Manual TSR
- Thesis notes
- decision statuses such as buy / hold / trim
- portfolio construction
- technical entry permission
- position sizing

Those belong to later phases.

---

## Background / Framework Basis
The 3AA framework explicitly supports a **monitoring tool** built around:
- ticker
- code
- primary metric
- current multiple
- `max`
- `comfortable`
- `very good`
- `steal`
- TSR hurdle
- notes

This workflow operationalizes that monitoring layer and turns framework state into alerts. It is the main deliverable of V1.

---

## Success Criteria
The workflow is successful when:
- Stocks of interest are surfaced automatically without requiring manual TSR input
- Alerts are generated only from framework-relevant changes
- Alerts are understandable, deduplicated, and prioritized
- User can open any alert and see the exact framework state that caused it
- System distinguishes between:
  - valuation-opportunity alerts
  - classification-change alerts
  - data-quality alerts
- Alert history is auditable

---

## User Stories

### US-ALT-001 — Alert on valuation-zone entry
**As an** investor  
**I want** alerts when a stock enters an important valuation zone  
**So that** I can quickly notice emerging opportunities.

**Acceptance Criteria**
- Alert when stock enters:
  - `max_zone`
  - `comfortable_zone`
  - `very_good_zone`
  - `steal_zone`
- Alert only on **crossing into** a new zone, not on every refresh while remaining there
- Alert payload includes zone entered, current multiple, thresholds, code, and metric

---

### US-ALT-002 — Alert on classification changes
**As an** investor  
**I want** alerts when a stock’s suggested classification changes materially  
**So that** I know when the framework’s interpretation of the business has shifted.

**Acceptance Criteria**
- Alert when:
  - bucket changes
  - earnings-quality letter changes
  - balance-sheet-quality letter changes
  - confidence drops materially
- Alert payload includes old/new suggested code and reason codes
- Final manual override does not suppress visibility of suggested-code changes

---

### US-ALT-003 — Alert on valuation data invalidity / staleness
**As an** investor  
**I want** alerts when a stock cannot be evaluated properly  
**So that** I do not rely on stale or broken framework outputs.

**Acceptance Criteria**
- Alert when:
  - current multiple cannot be computed
  - selected metric becomes invalid
  - data becomes stale beyond configured freshness threshold
  - stock moves into `manual_required` state
- Alert type is clearly marked as data-quality, not opportunity

---

### US-ALT-004 — Maintain alert feed / stocks-of-interest list
**As an** investor  
**I want** a central feed of framework-driven alerts  
**So that** I can review stocks of interest efficiently.

**Acceptance Criteria**
- Feed supports sorting/filtering by:
  - alert type
  - valuation zone
  - code
  - threshold source (`anchored`, `derived`, `manual_override`)
  - watchlist-only vs full-universe
  - freshness
- Feed can show both active alerts and recent history

---

### US-ALT-005 — Open alert inspection view
**As an** investor  
**I want** to open an alert and inspect its stock detail context  
**So that** I can understand exactly why the alert fired.

**Acceptance Criteria**
- Clicking an alert opens a read-only detail page or panel
- Alert inspection view shows:
  - ticker / company
  - suggested code
  - final code if present
  - confidence and reason codes
  - primary metric
  - current multiple
  - threshold grid
  - valuation zone
  - adjusted TSR hurdle
  - what changed to trigger the alert
- No manual TSR or decision workflow is required in this view

---

### US-ALT-006 — Deduplicate and prioritize alerts
**As a** system  
**I want** to avoid noisy or repetitive alerts  
**So that** the alert feed stays useful.

**Acceptance Criteria**
- Repeated identical alerts are suppressed within a cooldown window
- Higher-priority alerts supersede lower-priority alerts for the same stock/event family
- Alert priority rules are explicit and testable

---

## Alert Families

### 1. Valuation Opportunity Alerts
Triggered by valuation-zone transitions.

#### Trigger conditions
- `above_max -> max_zone`
- `max_zone -> comfortable_zone`
- `comfortable_zone -> very_good_zone`
- `very_good_zone -> steal_zone`

#### Alert examples
- `entered_max_zone`
- `entered_comfortable_zone`
- `entered_very_good_zone`
- `entered_steal_zone`

#### Priority
- `steal_zone` = highest
- `very_good_zone` = high
- `comfortable_zone` = medium
- `max_zone` = low

---

### 2. Classification Alerts
Triggered by changes in suggested code or confidence.

#### Trigger conditions
- bucket changed
- earnings-quality changed
- balance-sheet-quality changed
- confidence changed from `high -> medium/low`
- stock moved from `null / insufficient_data` to valid suggestion

#### Alert examples
- `classification_bucket_changed`
- `classification_quality_changed`
- `classification_confidence_dropped`
- `classification_became_available`

#### Priority
- bucket change = high
- quality/BS change = medium
- confidence change = low/medium depending on severity

---

### 3. Data Quality Alerts
Triggered when framework outputs become unreliable.

#### Trigger conditions
- missing current multiple
- invalid metric due to negative/meaningless denominator
- stale inputs beyond freshness threshold
- stock enters `manual_required` or `classification_required`

#### Alert examples
- `valuation_data_missing`
- `metric_invalid`
- `data_stale`
- `classification_required`
- `manual_required`

#### Priority
- generally medium unless stock is on monitored list, where it may become high

---

## Workflow Overview

### 1. Build monitored universe
The monitoring engine evaluates:
- all eligible universe stocks, or
- optionally a narrowed monitored list / watchlist for active user focus

Recommended V1 default:
- evaluate all eligible stocks
- allow filter to show watchlist-only in UI

### 2. Load latest framework state
For each stock, load:
- suggested code
- final code
- confidence
- primary metric
- current multiple
- thresholds
- threshold source
- valuation zone
- adjusted TSR hurdle
- freshness state

### 3. Compare to prior state
For each stock, compare current state to prior persisted state.

Detect:
- valuation-zone transitions
- classification changes
- stale / invalid transitions

### 4. Generate alerts
For each detected transition, create an alert candidate.

### 5. Deduplicate / prioritize
Before persisting:
- suppress duplicates inside cooldown window
- collapse lower-priority alerts if a higher-priority one exists for the same stock and same refresh

### 6. Persist alerts
Store alert event with full context snapshot.

### 7. Render feed
Show active alerts and history in the UI.

### 8. Allow alert inspection
Clicking an alert opens the stock detail / inspection view.

---

## Inputs

### Required framework inputs
- `ticker`
- `company_name`
- `suggested_code`
- `final_code`
- `confidence_level`
- `reason_codes[]`
- `active_code`
- `primary_metric`
- `current_multiple`
- `max_threshold`
- `comfortable_threshold`
- `very_good_threshold`
- `steal_threshold`
- `threshold_source`
- `adjusted_tsr_hurdle`
- `valuation_zone`
- `framework_state_updated_at`
- `data_freshness_status`

### Prior-state inputs
- prior suggested code
- prior confidence
- prior current multiple
- prior valuation zone
- prior freshness state

### Optional user scope inputs
- `watchlist_member`
- `monitored_priority`
- `mute_alerts`

---

## Outputs

### Alert object
Each alert should include:
- `alert_id`
- `ticker`
- `company_name`
- `alert_type`
- `alert_family` (`valuation`, `classification`, `data_quality`)
- `priority` (`low`, `medium`, `high`, `critical`)
- `triggered_at`
- `summary_text`
- `detail_payload`
- `active_code`
- `valuation_zone`
- `current_multiple`
- `threshold_source`
- `watchlist_member`
- `dedup_key`
- `suppressed` boolean

### Detail payload fields
At minimum:
- old/new zone
- old/new suggested code
- confidence
- primary metric
- thresholds
- adjusted TSR hurdle
- freshness status
- triggered reason

---

## Alert Priority Rules

### Valuation alerts
- `entered_steal_zone` → `critical`
- `entered_very_good_zone` → `high`
- `entered_comfortable_zone` → `medium`
- `entered_max_zone` → `low`

### Classification alerts
- bucket changed → `high`
- earnings-quality or balance-sheet changed → `medium`
- confidence dropped → `low` or `medium`

### Data-quality alerts
- stale data on watchlist stock → `high`
- stale data on ordinary universe stock → `low`
- metric invalid / manual required on monitored stock → `medium/high`

---

## Deduplication Rules

### Cooldown
Use alert-family-specific cooldowns:
- valuation alerts: 24h default
- classification alerts: 24h default
- data-quality alerts: 12h default

### Dedup key
Recommended:
- `ticker + alert_type + valuation_zone + active_code`

### Suppression logic
- suppress same alert inside cooldown window
- if higher-priority alert arrives for same ticker, keep higher-priority one visible
- store suppressed events for audit if desired

---

## Alert Inspection / Stock Detail View

This is a **read-only** inspection page or slide-over, not a review workflow.

### Must show
- ticker / company / current price
- suggested code
- final code if present
- confidence and reason codes
- primary metric
- current multiple
- thresholds (`max`, `comfortable`, `very good`, `steal`)
- valuation zone
- adjusted TSR hurdle
- threshold source
- alert that fired
- why it fired
- when it fired

### Nice to show
- previous zone / previous code
- freshness timestamp
- small history of recent alerts for this stock

### Must not require
- manual TSR
- thesis notes
- decision status
- portfolio actions

---

## UX Requirements

### Main alerts page
Sections:
- **Active Alerts**
- **Recent Alerts History**
- filters / search

### Required columns in feed
- ticker
- company
- active code
- alert type
- valuation zone
- primary metric
- current multiple
- priority
- triggered at
- watchlist badge

### Filters
- alert family
- priority
- bucket / code
- valuation zone
- threshold source
- watchlist only
- stale only

### Badges
- `steal`
- `very good`
- `comfortable`
- `max`
- `classification changed`
- `data stale`
- `derived thresholds`
- `watchlist`

---

## State Model

### Alert state
- `active`
- `acknowledged`
- `suppressed`
- `resolved`

### Suggested behavior
- `active` = currently visible and actionable
- `acknowledged` = user has seen it, but condition may still hold
- `resolved` = condition no longer holds or has been superseded
- `suppressed` = duplicate / cooldown case

### Resolution rules
- valuation alert resolves when stock leaves the zone or a higher-priority zone alert supersedes it
- classification alert resolves after acknowledgement or after later system state supersedes it
- stale-data alert resolves when data freshness returns to normal

---

## Persistence / Data Model

### Alerts table
Store at least:
- `alert_id`
- `ticker`
- `alert_type`
- `alert_family`
- `priority`
- `summary_text`
- `detail_payload_json`
- `active_code`
- `valuation_zone`
- `current_multiple`
- `threshold_source`
- `watchlist_member`
- `alert_state`
- `triggered_at`
- `resolved_at`
- `dedup_key`
- `suppressed`

### Alert history table (optional if separate)
May store immutable events including suppressed alerts.

---

## Telemetry
Emit:
- `alert_generated { ticker, alert_type, priority }`
- `alert_suppressed { ticker, alert_type, dedup_key }`
- `alert_resolved { ticker, alert_type }`
- `alert_inspected { ticker, alert_id }`
- `alert_feed_loaded { count_active, count_recent }`

---

## Edge Cases
- **No active code**: may generate `classification_required` alert if stock is in monitored scope
- **Bucket 8**: can still generate data-quality alerts, but should not generate normal valuation-zone alerts
- **Derived thresholds**: allowed, but UI should make this obvious
- **Manual overrides present**: use active code / active valuation state for alerts, but still display suggested-state changes where relevant
- **Rapid repeated data changes**: dedupe must suppress churn

---

## Acceptance Criteria

1. Stocks generate alerts when they cross into framework-defined valuation zones.
2. Stocks generate alerts when suggested classification changes materially.
3. Stocks generate alerts when valuation or classification data becomes stale or invalid.
4. Duplicate alerts are suppressed reliably.
5. Alert feed supports filtering and priority ordering.
6. Clicking an alert opens a read-only inspection view showing the exact framework context and trigger reason.
7. The alert system works without manual TSR, decision notes, or entry-permission logic.

---

## V1 Deliverable
By the end of this workflow implementation, the product should let the investor:
- see which stocks in the eligible universe have become framework-interesting
- understand whether that interest comes from valuation, classification change, or data issues
- inspect the full framework context behind each alert
- use the system as a disciplined stock-of-interest monitor, without requiring manual deep-review inputs

This workflow is the main output layer of V1 and completes the monitoring-first product loop:

**classify → value → monitor → alert → inspect**

