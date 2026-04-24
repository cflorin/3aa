# EPIC-006 — Monitoring & Alerts Engine with Alerts UI

## Purpose
Enable users to monitor specific stocks, detect classification/valuation changes, generate personalized alerts, and review alert context via Alerts Feed and Inspection screens. This epic delivers the core monitoring loop (state diffing, alert generation, deduplication) and the alert review UI (Screens 3 & 4).

## Outcome
Users can:
- Monitor stocks from Universe screen (Add/Remove Monitor List buttons)
- Receive alerts for classification/valuation changes on monitored stocks
- Review alerts in Alerts Feed (Screen 3: filter, sort, acknowledge, resolve)
- Inspect full alert context (Screen 4: classification/valuation details, historical timeline, override capability)
- Configure alert preferences (alert types enabled/disabled)

**UI Delivered:** Screen 3 (Alerts Feed), Screen 4 (Alert Inspection)

## Scope In
- Monitor list management (user_monitored_stocks table: add/remove stocks)
- State diffing logic (compare classification_state/valuation_state snapshots, detect changes)
- Alert generation rules (classification change, zone change, threshold breach)
- Alert deduplication (avoid duplicate alerts for same event)
- Per-user alert processing (generate alerts only for monitored stocks)
- Alert lifecycle (new → acknowledged → resolved)
- Alert history table (alerts: alert_id, user_id, ticker, alert_type, triggered_at, acknowledged_at, resolved_at)
- Alert metadata storage (alert_details JSONB: old_code, new_code, old_zone, new_zone, threshold, current_multiple)
- **Screen 3: Alerts Feed UI** (alert list, filters by type/status, sort by date, acknowledge/resolve buttons, pagination)
- **Screen 4: Alert Inspection UI** (full alert context, classification/valuation details, historical timeline, override modal, resolve button)
- Alert API endpoints (`GET /api/alerts`, `POST /api/alerts/:id/acknowledge`, `POST /api/alerts/:id/resolve`)
- Monitor list API endpoints (`POST /api/monitor-list/add`, `DELETE /api/monitor-list/remove`)
- Alert generation cron job (Cloud Scheduler 8:30pm ET, POST /api/cron/generate-alerts)
- User alert preferences table (user_alert_preferences: classification_change_enabled, zone_change_enabled, threshold_breach_enabled)
- Alert notification delivery (in-app only for V1, no email/push)

## Scope Out
- Email alerts (V2+)
- Push notifications (V2+)
- Slack/webhook integrations (V2+)
- Custom alert rules (user-defined thresholds, V2+)
- Bulk alert actions (acknowledge all, resolve all, V2+)
- Alert snooze functionality (V2+)
- Alerts for non-monitored stocks (V1 only alerts on monitored stocks)
- Real-time alert generation (V1 is nightly batch only)
- Alert delivery guarantees (V1 best-effort, no SLA)

## Dependencies
- **PRD:** Section 4 (Monitoring & Alerts), Section 9B Screen 3 (Alerts Feed), Section 9B Screen 4 (Alert Inspection)
- **RFCs:** RFC-002 (Data Model - alerts, user_monitored_stocks, user_alert_preferences), RFC-005 (Monitoring & Alerts Engine)
- **ADRs:** ADR-007 (Multi-User Architecture - per-user alerts), ADR-009 (Modular Monolith)
- **Upstream epics:** EPIC-002 (Authentication - user_id for per-user alerts), EPIC-004 (Classification state), EPIC-005 (Valuation state)

## Inputs
- Current classification_state snapshot (suggested_code, earnings_quality_grade, balance_sheet_quality_grade)
- Current valuation_state snapshot (zone, current_multiple, anchored_thresholds)
- Prior classification_state/valuation_state snapshots (from classification_history, valuation_history)
- user_monitored_stocks table (which stocks each user monitors)
- user_alert_preferences table (which alert types enabled per user)

## Outputs
- alerts table populated (per-user alerts for monitored stocks)
- Alert Feed UI (Screen 3: list of alerts, filterable, sortable, actionable)
- Alert Inspection UI (Screen 4: full alert context, timeline, override capability)
- user_monitored_stocks updated (add/remove via Universe screen buttons)
- Cloud Scheduler job configured (generate-alerts 8:30pm ET Mon-Fri)
- Alert API endpoints functional (GET, acknowledge, resolve)

## Flows Covered
- **Add to monitor list (UI):** User clicks "Monitor" button on Universe screen → POST /api/monitor-list/add → INSERT user_monitored_stocks → button changes to "Monitoring" (green)
- **Remove from monitor list (UI):** User clicks "Monitoring" button → confirmation modal → DELETE user_monitored_stocks → button changes to "Monitor" (gray)
- **Alert generation (batch):** Cloud Scheduler triggers /api/cron/generate-alerts → FOR EACH user → FOR EACH monitored stock → fetch current state + historical state → detect changes (classification, zone, threshold breach) → check deduplication (no duplicate alert for same event in last 24h) → check user preferences (alert type enabled?) → INSERT alerts → return summary ({alerts_generated: 150})
- **Classification change alert:** Prior suggested_code='3AA', current suggested_code='4AA' → alert_type='classification_change', alert_details={old_code: '3AA', new_code: '4AA', change_date: '2026-04-19'}
- **Zone change alert:** Prior zone='comfortable', current zone='very_good' → alert_type='zone_change', alert_details={old_zone: 'comfortable', new_zone: 'very_good', threshold: 18.0, current_multiple: 17.5}
- **Threshold breach alert:** Current multiple crosses steal threshold (18.5 → 15.8, steal=16.0) → alert_type='threshold_breach', alert_details={threshold_name: 'steal', threshold_value: 16.0, current_multiple: 15.8, prior_multiple: 18.5}
- **View Alerts Feed (UI):** User navigates to /alerts → GET /api/alerts?status=new&type=all → render alert list → show filters (type dropdown, status tabs), sort (newest first), pagination (20/page)
- **Acknowledge alert (UI):** User clicks "Acknowledge" button → POST /api/alerts/:id/acknowledge → UPDATE alerts SET acknowledged_at=NOW() → alert status changes to "acknowledged" → UI updates
- **Inspect alert (UI):** User clicks alert row → navigate to /alerts/:id → GET /api/alerts/:id → render full alert context (classification/valuation details, historical timeline, current state vs prior state) → show "Resolve" button
- **Resolve alert (UI):** User clicks "Resolve" on inspection screen → POST /api/alerts/:id/resolve → UPDATE alerts SET resolved_at=NOW() → redirect to /alerts
- **Alert deduplication:** Alert for AAPL zone_change 'comfortable'→'very_good' exists with triggered_at within last 24h → skip duplicate alert generation

## Acceptance Criteria
- [ ] user_monitored_stocks table created (user_id, ticker composite PK, added_at TIMESTAMPTZ)
- [ ] alerts table created (alert_id UUID PK, user_id FK, ticker FK, alert_type ENUM, triggered_at TIMESTAMPTZ, acknowledged_at, resolved_at, alert_details JSONB)
- [ ] user_alert_preferences table created (user_id PK, classification_change_enabled BOOLEAN DEFAULT TRUE, zone_change_enabled BOOLEAN DEFAULT TRUE, threshold_breach_enabled BOOLEAN DEFAULT TRUE)
- [ ] Monitor list add/remove functional (POST /api/monitor-list/add, DELETE /api/monitor-list/remove)
- [ ] Alert generation logic functional (state diffing detects classification/zone/threshold changes)
- [ ] Alert deduplication enforced (no duplicate alerts for same ticker+type within 24h)
- [ ] Per-user alert processing (alerts generated only for stocks in user_monitored_stocks)
- [ ] User alert preferences respected (disabled alert types not generated)
- [ ] Cloud Scheduler job created (generate-alerts 8:30pm ET Mon-Fri, OIDC auth)
- [ ] Alert Feed UI functional (Screen 3: alert list, filters, sort, acknowledge/resolve buttons)
- [ ] Alert Inspection UI functional (Screen 4: full context, timeline, override modal, resolve button)
- [ ] Alert API endpoints functional (GET /api/alerts returns paginated list, POST acknowledge/resolve update status)
- [ ] Alert lifecycle enforced (new → acknowledged → resolved, no backward transitions)
- [ ] Alert history preserved (resolved alerts remain queryable, not deleted)
- [ ] Monitor list UI integration (Universe screen shows "Monitor"/"Monitoring" button state correctly)

## Test Strategy Expectations

**Unit tests:**
- State diffing logic (prior code='3AA', current code='4AA' → change detected)
- Alert deduplication (duplicate within 24h → skipped, duplicate after 24h → allowed)
- Zone change detection (prior zone='comfortable', current zone='very_good' → alert triggered)
- Threshold breach detection (current_multiple crosses steal threshold → alert triggered)
- User preference filtering (classification_change_enabled=FALSE → alert not generated)
- Alert lifecycle state machine (new → acknowledged allowed, acknowledged → new forbidden)

**Integration tests:**
- Monitor list add/remove (POST /api/monitor-list/add → INSERT user_monitored_stocks → GET /api/monitor-list → stock present)
- Alert generation end-to-end (state change + monitored stock + preferences enabled → alert created)
- Alert generation with preferences disabled (zone_change_enabled=FALSE → no zone change alert)
- Alert deduplication (generate alert for AAPL zone change → run again within 24h → no duplicate)
- Alert acknowledge (POST /api/alerts/:id/acknowledge → acknowledged_at set → GET /api/alerts → status='acknowledged')
- Alert resolve (POST /api/alerts/:id/resolve → resolved_at set → GET /api/alerts → status='resolved')
- Alert API pagination (generate 50 alerts → GET /api/alerts?limit=20 → returns 20 alerts, has_more=true)
- Alert filtering (generate mixed alerts → GET /api/alerts?type=zone_change → returns only zone change alerts)

**Contract/schema tests:**
- alerts table schema (alert_type ENUM: classification_change, zone_change, threshold_breach)
- alert_details JSONB schema (validate structure for each alert type)
- Alert API response schema (GET /api/alerts returns {alerts: Alert[], total: number, has_more: boolean})
- Monitor list API request schema (POST /api/monitor-list/add body: {ticker: string})

**BDD acceptance tests:**
- "Given user monitors AAPL, when classification changes from 3AA to 4AA, then classification_change alert generated"
- "Given user monitors AAPL, when zone changes from comfortable to very_good, then zone_change alert generated"
- "Given user monitors AAPL, when current_multiple crosses steal threshold, then threshold_breach alert generated"
- "Given zone_change alert exists for AAPL within 24h, when alert generation runs again with same change, then no duplicate alert"
- "Given user has classification_change_enabled=FALSE, when classification changes, then no alert generated"
- "Given new alert, when user acknowledges, then acknowledged_at set and status='acknowledged'"
- "Given acknowledged alert, when user resolves, then resolved_at set and status='resolved'"
- "Given user clicks Monitor on AAPL, when POST succeeds, then button shows 'Monitoring' and AAPL in monitor list"

**E2E tests:**
- Full monitoring workflow (Universe screen → click Monitor → alert generated overnight → view Alerts Feed → acknowledge → inspect → resolve)
- Alert Feed filtering (filter by type: zone_change only → only zone change alerts shown)
- Alert Inspection workflow (click alert in feed → inspect screen renders → classification/valuation details shown → resolve → redirect to feed)
- Monitor list persistence (add AAPL to monitor list → sign out → sign in → AAPL still monitored)

## Regression / Invariant Risks

**Alert duplication:**
- Risk: Same alert generated multiple times for same event
- Protection: Deduplication logic (check alerts within 24h for same ticker+type), integration tests verify

**Cross-user alert leakage:**
- Risk: User A sees User B's alerts
- Protection: Alert queries always filter by user_id, tests verify user isolation

**Alert generation for non-monitored stocks:**
- Risk: Alerts generated for stocks not in user_monitored_stocks
- Protection: Alert generation only processes monitored stocks, tests enforce

**User preferences not respected:**
- Risk: Alerts generated despite preference disabled
- Protection: Preference check before alert INSERT, tests verify disabled types not generated

**Alert lifecycle violations:**
- Risk: Resolved alert transitions back to new
- Protection: State machine validation, database constraints (resolved_at NOT NULL → cannot clear)

**Monitor list inconsistency:**
- Risk: Universe screen shows "Monitoring" but user_monitored_stocks missing row
- Protection: UI state derives from database, tests verify consistency

**Invariants to protect:**
- Alert deduplication enforced (no duplicate alerts for same ticker+type+event within 24h)
- User isolation enforced (alerts always filtered by user_id, no cross-user access)
- Alerts only for monitored stocks (alerts.ticker must exist in user_monitored_stocks for that user)
- User preferences respected (disabled alert types never generated)
- Alert lifecycle unidirectional (new → acknowledged → resolved, no backward transitions)
- Alert history complete (resolved alerts preserved, never deleted)
- Monitor list state consistent (UI button state matches database user_monitored_stocks)
- Alert metadata complete (alert_details JSONB contains all context: old/new values, thresholds, dates)

## Key Risks / Edge Cases

**State diffing risks:**
- Classification/valuation recompute runs but no actual change (suggested_code unchanged, no alert needed)
- Multiple changes in one batch (code AND zone change simultaneously, generate both alerts or one combined?)
- Historical state missing (classification_history empty for stock, cannot compute diff)
- State change reverts (3AA→4AA on day 1, 4AA→3AA on day 2, two alerts generated?)

**Alert generation performance:**
- 1000 monitored stocks × 100 users = 100K state diffs per batch (batch takes >30 min)
- Alert generation rate limited by database write throughput
- Alert history table bloat (1M+ alerts over months, query performance degrades)

**User preference edge cases:**
- User disables all alert types (no alerts generated, silent monitoring)
- User changes preference mid-batch (batch uses stale preferences?)
- Preference defaults (new user: all alerts enabled by default)

**Monitor list edge cases:**
- User monitors stock, stock drops from universe (in_universe=FALSE, still generate alerts?)
- User monitors 500 stocks (alert volume overwhelming, UX degraded)
- Stock ticker changed (GOOGL → GOOG, monitor list stale ticker)
- Monitor list add while stock already monitored (idempotent INSERT or error?)

**Alert lifecycle edge cases:**
- User acknowledges alert but never resolves (acknowledged_at set, resolved_at NULL forever)
- User resolves without acknowledging (skip acknowledged state, go directly to resolved)
- Alert deleted while user viewing inspection screen (inspection fails gracefully)

**UI edge cases:**
- Alerts Feed with 0 alerts (empty state: "No alerts yet, start monitoring stocks!")
- Alert Inspection for deleted stock (ticker not in stocks table anymore, graceful degradation)
- Pagination boundary (exactly 20 alerts, has_more=false)
- Monitor button state race condition (user clicks Monitor twice rapidly, duplicate INSERT?)

## Likely Stories

- **STORY-046:** Create user_monitored_stocks and user_alert_preferences tables (Prisma migration)
- **STORY-047:** Create alerts table with alert_type ENUM and alert_details JSONB (Prisma migration)
- **STORY-048:** Implement monitor list add/remove endpoints (POST /api/monitor-list/add, DELETE /api/monitor-list/remove)
- **STORY-049:** Implement state diffing logic (compare classification_state/valuation_state snapshots)
- **STORY-050:** Implement alert generation rules (classification change, zone change, threshold breach detection)
- **STORY-051:** Implement alert deduplication logic (check alerts within 24h for same ticker+type)
- **STORY-052:** Implement per-user alert processing (filter by user_monitored_stocks, respect user_alert_preferences)
- **STORY-053:** Implement alert generation cron job (Cloud Scheduler 8:30pm ET, /api/cron/generate-alerts endpoint)
- **STORY-054:** Implement alert API endpoints (GET /api/alerts, POST acknowledge, POST resolve)
- **STORY-055:** Build Alerts Feed UI (Screen 3: alert list, filters, sort, acknowledge/resolve buttons, pagination)
- **STORY-056:** Build Alert Inspection UI (Screen 4: full context, classification/valuation details, timeline, resolve button)
- **STORY-057:** Integrate monitor list buttons into Universe screen (Add/Remove Monitor buttons, state persistence)
- **STORY-058:** Implement alert lifecycle state machine (new → acknowledged → resolved validation)
- **STORY-059:** Add alert generation integration tests (state diffing, deduplication, per-user processing)
- **STORY-060:** Add Alerts Feed E2E tests (filter, sort, acknowledge, resolve workflows)
- **STORY-061:** Add Alert Inspection E2E tests (view full context, override from alert, resolve)

## Definition of Done

- [ ] Implementation complete (alert generation, state diffing, deduplication, monitor list, Alerts Feed UI, Alert Inspection UI)
- [ ] Tests added and passing (unit, integration, contract, BDD, E2E for alerts and monitoring)
- [ ] Regression coverage added (alert deduplication, user isolation, lifecycle enforcement, monitor list consistency)
- [ ] Docs updated (README alerts section, Alerts Feed screenshot, Alert Inspection screenshot)
- [ ] Telemetry/logging added (alerts generated count per user, alert types breakdown, acknowledge/resolve events)
- [ ] Migrations included (user_monitored_stocks, alerts, user_alert_preferences tables committed)
- [ ] Traceability links recorded (code comments reference RFC-005, PRD Section 4)
- [ ] Cloud Scheduler job tested (manual trigger succeeds, alerts generated)
- [ ] Alert deduplication validated (duplicate alerts not created within 24h window)
- [ ] User isolation validated (User A cannot see User B's alerts, tests enforce)
- [ ] Monitor list state consistent (Universe screen button state matches database)
- [ ] Alerts Feed accessible at /alerts (renders correctly, functional)
- [ ] Alert Inspection accessible at /alerts/:id (renders full context, resolves correctly)

## Traceability

- **PRD:** Section 4 (Monitoring & Alerts), Section 9B Screen 3 (Alerts Feed), Section 9B Screen 4 (Alert Inspection)
- **RFC:** RFC-002 (Data Model - alerts, user_monitored_stocks, user_alert_preferences), RFC-005 (Monitoring & Alerts Engine)
- **ADR:** ADR-007 (Multi-User Architecture - per-user alerts), ADR-009 (Modular Monolith)

---

**END EPIC-006**
