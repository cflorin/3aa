# 3AA Monitoring Product — Full V1 PRD (v1.0)

## 1) Product Summary

### Product name
**3AA Monitoring Product** *(working title)*

### Product purpose
Build a **stock-first monitoring product** for long-term investing that operationalizes the **3AA Investment Classification and Monitoring Framework** across a defined US equity universe.

The product must:
- classify stocks using a **rules-first 3AA code suggestion** with manual override,
- assign the correct valuation metric and threshold grid,
- compute a valuation zone and adjusted TSR hurdle,
- monitor the universe continuously for framework-relevant changes,
- generate **alerts for stocks of interest**, and
- provide a **read-only inspection view** that explains why an alert fired.

This V1 is explicitly a **monitoring-first** release, not a full investment decision workspace.

### Core product loop
**classify → value → monitor → alert → inspect**

---

## 2) Problem Statement

A disciplined long-term investing framework is only useful if it can be applied consistently across a broad universe without relying on memory, ad hoc spreadsheets, or emotionally biased review.

The 3AA framework is rich and specific, but without productization it is difficult to:
- classify the full universe consistently,
- apply the right valuation metric by business type,
- maintain correct threshold zones across many stocks,
- detect when a stock becomes framework-interesting,
- differentiate genuine opportunity from stale, noisy, or invalid signals.

The product should solve this by turning the framework into an operational monitoring system.

---

## 3) Product Goal

### Primary goal
Surface **framework-defined stocks of interest** automatically across the eligible universe.

### Desired outcome
At any point in time, the investor can answer:
- which stocks currently look interesting under the framework,
- why they are interesting,
- which metric and zone they are in,
- whether the signal comes from valuation, classification change, or data-quality change.

### What the product is not in V1
This product is **not** trying to do the following in V1:
- automated intrinsic-value estimation,
- manual TSR decision workflow,
- portfolio construction,
- entry-permission / technical stabilization,
- position sizing,
- execution workflows.

Those are deferred to later phases.

---

## 4) Source-of-Truth Framework

V1 must implement the uploaded **3AA Investment Classification and Monitoring Framework** as the governing logic of the product.

The framework establishes:
- the 3-part classification architecture `[Bucket][Earnings Quality][Balance Sheet Quality]`,
- bucket definitions and business-stage logic,
- earnings-quality and balance-sheet-quality grades,
- bucket-specific valuation metrics,
- threshold zones `max / comfortable / very good / steal`,
- TSR hurdle logic,
- monitoring schema and operating principles.

This PRD assumes that document is the product’s source of truth.

---

## 5) Universe Definition

### Universe scope
Eligible universe for V1:
- **US-listed stocks only**
- **Market cap > $5bn**

### Exclusions
- private companies
- non-US listings for V1
- funds / ETFs as primary universe constituents unless explicitly allowed later
- clearly binary / non-equity situations outside normal public-stock monitoring scope unless intentionally flagged

### Universe refresh
- Re-evaluate eligibility daily or weekly
- If a stock drops below the threshold, it should be marked `out_of_universe` but historical records and alerts must be retained

---

## 6) Product Scope (V1)

### In scope
1. **Classification workflow**
   - rules-first code suggestion
   - confidence / reason codes
   - manual override support
   - classification history

2. **Valuation & threshold workflow**
   - primary metric selection
   - current multiple computation
   - anchored vs derived threshold assignment
   - adjusted TSR hurdle assignment
   - valuation-zone assignment

3. **Monitoring & alerts workflow**
   - **Valuation alerts:** Entry into `very_good_zone` or `steal_zone` only (not comfortable/max zones)
   - **Classification alerts:** Material changes to suggested classification or confidence degradation
   - **Data quality alerts:** Stale data, missing critical fields, provider failures
   - Deduplication, cooldown, priority rules
   - Read-only alert inspection view

### Out of scope
- manual 5Y TSR entry
- deep review / thesis journaling
- portfolio construction
- entry permission / stabilization rules
- buy/sell/trim actioning
- execution integration

---

## 7) Key User

### Primary user
**Multi-user web application** for long-term investors using the 3AA framework rigorously.

### User characteristics
- Judgment-heavy, framework-driven investors
- Want high signal, low noise
- Do not want generic screeners or hype/news products
- Want repeatability and transparency more than automation theater
- Each user monitors a personal subset of the 1000-stock universe
- Users may disagree on classification judgments (independent overrides)

---

## 8) Product Principles

1. **Framework-first, not market-noise-first**
2. **Rules-first, judgment-final**
3. **Transparent derivation over false precision**
4. **Monitoring before decisioning**
5. **Low-noise alerts**
6. **Separation of system logic and manual judgment**
7. **Full auditability of state changes**

---

## 9) Core Functional Architecture

V1 is composed of three workflow engines and one user-facing inspection layer.

### A. Classification Engine
Determines the stock’s suggested 3AA code.

### B. Valuation & Threshold Engine
Maps the active code to the right metric, thresholds, TSR hurdle, and valuation zone.

### C. Monitoring & Alerts Engine
Compares current framework state with prior state and emits alerts.

### D. Read-Only Stock Detail / Alert Inspection View
Explains why a stock is classified and why an alert fired.

---

## 9A) Authentication & Multi-User Access

### V1 Multi-User Web Application

**V1 is a multi-user web application** requiring authenticated user accounts.

**User Management:**
- **Admin creates accounts** (no self-service signup for V1)
- Email/password authentication
- Session management (7-day expiration, configurable)
- No social login (Google, GitHub) for V1
- No two-factor authentication for V1

**User Isolation:**
- Each user has independent monitor list (watchlist)
- Each user has independent classification overrides
- Each user has independent alert feed
- Shared system data (universe, system suggestions, framework config)

**Security:**
- HTTPS required
- Secure session cookies
- Password reset (admin-assisted for V1)

### Out of Scope (V1)
- Self-service user registration
- Social login (OAuth)
- Two-factor authentication
- User roles/permissions (all users have same access level for V1)

---

## 9B) Core UX (V1 Screens)

V1 defines **5 core screens** for user interaction:

### Screen 1: Sign-In / Access

**Purpose:** Authentication and session management

**Features:**
- Email/password sign-in form
- "Forgot password" link (admin-assisted reset)
- Session persistence ("Remember me" checkbox)
- Sign-out button (in navigation)

**Validation:**
- Invalid email/password → error message
- Expired session → redirect to sign-in

**Out of Scope:**
- Self-service password reset
- Social login buttons

---

### Screen 2: Universe / Monitor List

**Purpose:** View stock universe and manage personal monitor list (watchlist)

**Features:**
1. **Universe View (All Stocks):**
   - Display 1000 stocks ($5bn+ market cap, US)
   - Columns: Ticker, Name, Market Cap, Sector, System Suggested Code, Your Code (if overridden), Current Zone
   - Filter by: Sector, Market Cap range, Classification code, Zone
   - Sort by: Zone, Market Cap, Ticker, Classification

2. **Monitor List Management:**
   - "Add to Monitor List" button for each stock
   - "Remove from Monitor List" button for monitored stocks
   - Visual indicator showing which stocks are monitored
   - Bulk add: "Monitor all Bucket 4 stocks" (optional)

3. **Classification Override:**
   - Inline "Override" button opens modal
   - Modal shows: System Suggested Code, Confidence, Reason Codes, Scores
   - User can set custom classification code
   - User must provide override reason (text field)
   - "Save Override" button

**Key Elements:**
- Stock list table (paginated, 50 stocks/page)
- Filter bar (sector dropdown, market cap slider, code selector, zone selector)
- Sort controls (column headers clickable)
- "Monitored" badge/checkmark for stocks in user's watchlist

**Behavior:**
- System suggestion visible to all users (shared)
- User override is personal (not visible to other users)
- Active code = user override || system suggestion

**Out of Scope:**
- Portfolio construction
- Position sizing
- Buy/sell actions

---

### Screen 3: Alerts Feed

**Purpose:** View and manage alerts for monitored stocks

**Features:**
1. **Alert List:**
   - Display active alerts for user's monitored stocks only
   - Columns: Ticker, Alert Title, Priority (badge), Created Time, Status
   - Sort by: Priority (critical first), Creation time (newest first)

2. **Filtering:**
   - Filter by priority: Critical, High, Medium, Low
   - Filter by alert family: Valuation, Classification, Data Quality
   - Filter by status: Active, Acknowledged, Resolved

3. **Alert Actions:**
   - "Acknowledge" button (marks alert as seen)
   - "Resolve" button (dismisses alert)
   - Click alert row → opens Alert Inspection view

4. **Priority Badges:**
   - 🔴 Critical (red)
   - 🟠 High (orange)
   - 🟡 Medium (yellow)
   - ⚫ Low (gray)

**Key Elements:**
- Alert list table (reverse chronological)
- Filter controls (priority checkboxes, family radio buttons)
- Count badge: "5 active alerts"

**Behavior:**
- Alerts generated nightly for user's monitored stocks
- Acknowledging alert does not affect other users' views
- Resolved alerts archived (not deleted)

**Out of Scope:**
- Email/SMS notifications (V1 in-app only)
- Custom alert rules
- Alert snoozing

---

### Screen 4: Alert Inspection / Stock Detail (Read-Only)

**Purpose:** Show full context for why alert fired and stock's current state

**Features:**
1. **Alert Details:**
   - Alert title, priority, creation time, type
   - Prior state vs current state comparison
   - Change summary (what triggered alert)

2. **Classification Context:**
   - System suggested code (with confidence, reason codes, scores)
   - Your override code (if present)
   - Active code (used for valuation)
   - Historical classification changes (timeline)

3. **Valuation Context:**
   - Current zone (steal, very good, comfortable, max, expensive)
   - Primary metric (Forward P/E, EV/EBIT, EV/Sales)
   - Current multiple
   - Thresholds (max, comfortable, very good, steal)
   - Threshold source (anchored, derived, manual override)
   - TSR hurdle (with quality adjustments)
   - Historical zone transitions (timeline)

4. **Data Provenance:**
   - Which provider supplied data (Tiingo, FMP, computed)
   - Data freshness status (fresh, stale, missing)
   - Last synced timestamp

5. **Manual Required Indicators:**
   - **Classification manual_required:** Display reason (e.g., "Insufficient data for automated classification")
   - **Valuation manual_required:** Display reason (e.g., "Forward P/E missing from all providers", "Negative earnings - fallback unsafe")
   - **Missing fields:** List specific missing data fields (e.g., "forward_pe: missing", "forward_ev_ebit: negative")
   - **Alert suppression status:** If manual_required, show "Alerts suppressed until data available"
   - **User action:** Highlight that user can manually override classification/thresholds to resolve

6. **Actions:**
   - "Override Classification" button (opens modal)
   - "Override Thresholds" button (rare, opens modal)
   - "Acknowledge Alert" button
   - "Resolve Alert" button

**Key Elements:**
- Alert metadata card
- Classification card (suggested + override)
- Valuation card (thresholds, zone, metric)
- Data provenance card
- Historical timeline (classification/valuation changes)

**Out of Scope:**
- Manual TSR estimation
- Entry permission workflow
- Decision journaling
- Trade execution
- Notes/commentary

---

### Screen 5: User Preferences / Settings

**Purpose:** Configure alert preferences and UI settings

**Features:**
1. **Alert Preferences:**
   - Mute alert families (checkboxes): Valuation, Classification, Data Quality
   - Priority threshold (dropdown): Only show Critical, Critical+High, Critical+High+Medium, All
   - (Future) Cooldown customization

2. **UI Preferences:**
   - Default sort order (dropdown): Zone ascending, Market cap descending, etc.
   - Default filters (multiselect): Show only Bucket 4-6, Show only steal/very good zones
   - Display density (radio): Compact, Comfortable, Spacious

3. **Account Settings:**
   - Email address (display only, admin changes)
   - Change password (form)
   - Last login timestamp

**Key Elements:**
- Tabbed interface: Alert Preferences, UI Preferences, Account Settings
- "Save Preferences" button (per tab)
- Success/error messages

**Out of Scope:**
- Custom alert rules (V2+)
- Email/SMS notification channels
- Theme customization (dark mode)

---

## 9C) Deployment & Platform Architecture

**See RFC-006, ADR-008, ADR-009, ADR-010, ADR-011 for full platform/stack/deployment specification.**

### Cloud Platform
- **Provider:** Google Cloud Platform (ADR-008)
- **Region:** us-central1 (Iowa)

### Application Architecture
- **Shape:** Modular monolith (ADR-009) - single deployment unit
- **Language:** TypeScript 5.x
- **Framework:** Next.js 14+ (App Router)
- **ORM:** Prisma 5.x
- **Database:** Cloud SQL (PostgreSQL 15)

### Deployment Model
- **Web Application:** Cloud Run (serverless containers)
  - Auto-scaling: 0-10 instances
  - Memory: 2 GiB, CPU: 2 vCPU
  - HTTPS: Automatic (managed SSL)
- **Background Jobs:** Cloud Scheduler → Cloud Run endpoints
  - Nightly batch: 5pm-9pm ET (6 sequential jobs)
- **Secrets:** Secret Manager (API keys, database credentials)
- **CI/CD:** Cloud Build (auto-deploy on git push)

### Authentication (ADR-011)
- **Strategy:** Custom email/password (bcrypt + session cookies)
- **Session Duration:** 7 days
- **User Management:** Admin-created accounts (no self-service signup)

### Observability
- **Logging:** Cloud Logging (automatic)
- **Monitoring:** Cloud Monitoring (request metrics, errors, uptime)
- **Error Tracking:** Optional Sentry integration

### Estimated Cost
- **V1 (100 users):** ~$40/month (Cloud Run ~$10, Cloud SQL ~$20, VPC ~$10)
- **V1 (1000 users):** ~$130/month (scales sub-linearly)

### Key Architectural Decisions
1. **Modular Monolith:** Single codebase, single deployment (simplicity over microservices)
2. **Cloud Run:** Serverless containers (no server management, auto-scaling)
3. **Postgres:** Industry-standard relational DB (type-safe with Prisma)
4. **TypeScript:** Type safety for complex business logic (classification, valuation)
5. **Custom Auth:** Email/password only (simple, no OAuth needed)

---

## 10) Workflow 1 — Classification

### Objective
Assign each stock a suggested **3AA code**:
- `Bucket`
- `Earnings Quality`
- `Balance Sheet Quality`

### Output fields
- `suggested_bucket`
- `suggested_earnings_quality`
- `suggested_balance_sheet_quality`
- `suggested_code`
- `confidence_level`
- `reason_codes[]`
- `manual_override_code`
- `manual_override_reason`
- `final_code`

### Rules-first requirement
The engine must be deterministic and rules-based.
No ML classification in V1.

### Classification logic summary
#### Bucket
Based on:
- revenue growth profile
- EPS growth profile
- maturity of earnings base
- whether the thesis is stable compounding, operating leverage, future scaling, or optionality

#### Earnings quality
Based on:
- moat / pricing power
- recurring or embedded revenue
- FCF conversion
- margin durability
- ROIC / durability through cycle

#### Balance sheet quality
Based on:
- leverage
- interest coverage
- liquidity
- dilution risk
- refinancing dependence

### Confidence states
- `high`
- `medium`
- `low`

### Manual override
User may override `suggested_code`; downstream logic must use:
- `final_code` if present
- otherwise `suggested_code`

### Classification states
- `unreviewed`
- `accepted`
- `overridden`
- `needs_review`

### Trigger to recompute
- material fundamental update
- scheduled refresh
- manual refresh

### Persisted history
Every classification change must be auditable.

---

## 11) Workflow 2 — Valuation & Thresholds

### Objective
Take the stock’s active code and compute the full valuation framework state.

### Active code
Use:
- `final_code` if present
- otherwise `suggested_code`

### Outputs
- `active_code`
- `primary_metric`
- `current_multiple`
- `max_threshold`
- `comfortable_threshold`
- `very_good_threshold`
- `steal_threshold`
- `threshold_source`
- `derived_from_code`
- `base_tsr_hurdle`
- `adjusted_tsr_hurdle`
- `valuation_zone`

### Metric selection rules
- Buckets 1–4 → `forward_pe`
- Bucket 3 Berkshire / holding-company / insurer special case → `forward_operating_earnings_ex_excess_cash`
- Bucket 5 → `forward_ev_ebit`
- Bucket 5 pre-operating-leverage → `ev_sales`
- Buckets 6–7 → `ev_sales`
- Bucket 8 → `no_stable_metric`

### Threshold logic
Use explicit anchored tables when available.
For missing codes, derive thresholds mechanically and label them `derived`.

### Threshold zones
- `above_max`
- `max_zone`
- `comfortable_zone`
- `very_good_zone`
- `steal_zone`
- `not_applicable`

### TSR hurdle logic
Compute:
- `base_tsr_hurdle` by bucket
- `adjusted_tsr_hurdle` using earnings-quality and balance-sheet-quality adjustments

### Secondary adjustments
Support:
- gross margin adjustment for EV/Sales names
- dilution adjustment for Buckets 5–7
- cyclicality context / mid-cycle basis
- market-pessimism interpretation note

### States
- `ready`
- `manual_required`
- `classification_required`
- `not_applicable`

---

## 12) Workflow 3 — Monitoring & Alerts

### Objective
Continuously scan the framework state of stocks and surface **stocks of interest** without requiring manual TSR or manual review.

### Alert families
#### A. Valuation Opportunity Alerts
Triggered when a stock enters a new valuation zone:
- `entered_max_zone`
- `entered_comfortable_zone`
- `entered_very_good_zone`
- `entered_steal_zone`

#### B. Classification Alerts
Triggered when suggested framework interpretation changes:
- bucket changed
- earnings-quality changed
- balance-sheet-quality changed
- confidence dropped materially
- suggestion becomes available after being unavailable

#### C. Data Quality Alerts
Triggered when framework outputs become unreliable:
- current multiple missing
- selected metric invalid
- stale data
- stock enters `manual_required`
- stock enters `classification_required`

### Alert priorities
- `critical`
- `high`
- `medium`
- `low`

### Deduplication rules
- suppress identical alerts inside cooldown window
- keep higher-priority event when overlapping
- persist suppression state for audit if needed

### Alert states
- `active`
- `acknowledged`
- `suppressed`
- `resolved`

### Alert output
Each alert must include:
- ticker / company
- alert family
- alert type
- priority
- summary text
- timestamp
- active code
- primary metric
- current multiple
- valuation zone
- threshold source
- detailed trigger payload

---

## 13) Read-Only Stock Detail / Alert Inspection View

### Purpose
Give the user enough context to understand any alert without introducing a decision workflow.

### Must show
- ticker
- company name
- current price
- suggested code
- final code if present
- confidence and reason codes
- primary metric
- current multiple
- threshold grid
- valuation zone
- threshold source
- adjusted TSR hurdle
- the alert that fired
- the specific change that triggered it
- recent alert history for the stock (optional but recommended)

### Must not require
- manual TSR input
- thesis notes
- decision status
- portfolio actions

### Role in V1
This is an **inspection surface**, not a review workflow.

---

## 14) User-Facing Screens

### 14.1 Universe / Monitor List
Purpose: high-level browsing and filtering.

Recommended columns:
- ticker
- company
- suggested code
- final code
- active code
- confidence
- primary metric
- current multiple
- valuation zone
- threshold source
- adjusted TSR hurdle
- stale-data flag
- watchlist badge (if enabled)

### 14.2 Alerts Feed
Purpose: central list of stocks of interest.

Required columns:
- ticker
- company
- alert family
- alert type
- priority
- active code
- valuation zone
- primary metric
- current multiple
- triggered at

Filters:
- alert family
- priority
- bucket / code
- valuation zone
- threshold source
- stale only
- watchlist only

### 14.3 Alert Inspection View
Purpose: explain why the alert fired.

Layout sections:
- Header
- Classification block
- Valuation block
- Alert explanation block
- Recent alert history block

---

## 15) Data Requirements

### 15.1 Universe / identity fields
- `ticker`
- `company_name`
- `sector`
- `industry`
- `market_cap`
- `country`
- `current_price`

### 15.2 Classification inputs
- `revenue_growth_3y`
- `revenue_growth_fwd`
- `eps_growth_3y`
- `eps_growth_fwd`
- `gross_margin`
- `operating_margin`
- `gross_profit_growth`
- `fcf_margin`
- `fcf_conversion`
- `roic`
- `net_income_positive`
- `fcf_positive`
- `net_debt_to_ebitda`
- `interest_coverage`
- `share_count_growth_3y`

### 15.3 Valuation inputs
- `forward_pe`
- `forward_ev_ebit`
- `ev_sales`
- `forward_operating_earnings_ex_excess_cash`
- `pre_operating_leverage_flag`
- `holding_company_flag`
- `insurer_flag`
- `cyclicality_flag`
- `market_pessimism_flag`
- `material_dilution_flag`

### 15.4 Framework state fields
- suggested code fields
- final code fields
- threshold fields
- hurdle fields
- valuation-zone field
- freshness status
- previous-state snapshot fields for alert diffing

---

## 16) Data Freshness Rules

### Freshness classes
- `fresh`
- `stale`
- `missing`

### Suggested expectations
- prices / multiples: refreshed daily or on configured cadence
- forward estimates / fundamentals: refreshed on vendor cadence
- classification recompute: daily or weekly, plus event-driven if needed

### Monitoring behavior
Stale or missing data must generate data-quality alerts under configured conditions.

---

## 17) Persistence / Data Model

### Core entities
1. `stocks`
2. `classification_state`
3. `classification_history`
4. `valuation_state`
5. `valuation_history`
6. `alerts`
7. `alert_history` (optional if separate from alerts)
8. `watchlist_membership` (optional in V1)

### Minimum fields by entity
#### `classification_state`
- ticker
- suggested code
- final code
- confidence
- reason codes
- status
- updated timestamps

#### `valuation_state`
- ticker
- active code
- primary metric
- current multiple
- thresholds
- threshold source
- adjusted TSR hurdle
- valuation zone
- freshness state

#### `alerts`
- alert id
- ticker
- alert family
- alert type
- priority
- summary
- payload
- state
- triggered at
- resolved at
- dedup key
- suppressed flag

### Audit requirement
No system-generated change should be silent.
All meaningful classification, valuation, and alert transitions must be historically reconstructable.

---

## 18) States and Transitions

### Stock framework state
A stock may be:
- `classification_required`
- `manual_required`
- `ready`
- `not_applicable`

### Alert state
An alert may be:
- `active`
- `acknowledged`
- `suppressed`
- `resolved`

### Resolution behavior
- valuation alert resolves when condition no longer holds or is superseded
- classification alert resolves after state stabilizes or is acknowledged
- data-quality alert resolves when data becomes fresh / valid again

---

## 19) Alert Logic Details

### 19.1 Valuation transition detection
Compare current zone to prior zone and alert only on meaningful entry into a new zone.

### 19.2 Classification transition detection
Compare current suggested code / confidence to prior suggested code / confidence.

### 19.3 Data-quality transition detection
Compare current freshness and validity to prior freshness and validity.

### 19.4 Deduplication
Recommended dedup key:
- `ticker + alert_type + active_code + valuation_zone`

### 19.5 Cooldown defaults
- valuation: 24h
- classification: 24h
- data quality: 12h

---

## 20) UX / Content Requirements

### Principle
Every alert must answer three questions instantly:
1. **What happened?**
2. **Why does it matter in the framework?**
3. **What is the stock’s current framework state?**

### Summary text examples
- `ADBE entered comfortable zone on derived 4BA thresholds`
- `UBER suggested code changed from 5BB to 5BA`
- `AMD valuation requires manual review: EV/EBIT invalid`

### Required labels / badges
- `anchored`
- `derived`
- `manual override`
- `classification changed`
- `data stale`
- `steal`
- `very good`
- `comfortable`
- `max`

---

## 21) Telemetry

Emit structured events for:
- classification suggestions
- low-confidence classifications
- valuation metric selection
- threshold assignment
- valuation-zone changes
- alert generation
- alert suppression
- alert resolution
- alert inspection view open
- feed load counts

---

## 22) Non-Functional Requirements

### Determinism
Given the same inputs, classification and valuation results must be identical.

### Transparency
The system must always distinguish:
- anchored vs derived vs overridden values
- suggested vs final code
- alert family and cause

### Performance
- alerts feed should load fast enough for practical daily use
- alert generation should scale across the eligible universe
- read-only stock inspection should open quickly using current state and recent alert payloads

### Reliability
- missing vendor data must degrade gracefully
- stale-data alerts must prevent silent bad-state reliance

---

## 23) Edge Cases

- **Bucket 8**: no normal valuation-zone alerts; allow only data-quality / framework-state alerts
- **Holding companies / insurers**: may require non-default metric selection
- **Pre-operating-leverage names**: metric family may switch
- **Derived thresholds**: must remain clearly labeled and visible
- **Manual override present**: use final code operationally, but still surface suggested-code changes if relevant
- **Incomplete data**: prefer low confidence / manual required over fake precision

---

## 24) Acceptance Criteria

### Classification
1. All eligible stocks can be processed by the classification workflow.
2. Suggested code, confidence, and reason codes are available or the stock is clearly marked low-confidence / insufficient-data.
3. Manual override is supported and persisted.

### Valuation
4. Every classified stock receives the correct metric or a clear `manual_required` state.
5. Anchored thresholds are used where available; missing codes are derived transparently.
6. Adjusted TSR hurdle is computed for Buckets 1–7.
7. Valuation zone is assigned correctly.

### Monitoring / Alerts
8. Alerts fire on valuation-zone entry.
9. Alerts fire on material classification changes.
10. Alerts fire on stale / invalid data states.
11. Duplicate alerts are suppressed reliably.
12. Active alerts can be filtered and inspected.

### Inspection View
13. Clicking an alert opens a read-only stock detail view with full framework context.
14. The inspection view does not require manual TSR or decision inputs.

---

## 25) Delivery Scope for V1

### Must-have deliverables
- Classification engine live for universe
- Valuation & threshold engine live for classified stocks
- Alerts engine live with valuation/classification/data-quality alerts
- Alerts feed UI
- Read-only alert inspection view
- persistence and audit trail

### Nice-to-have if time permits
- watchlist-only filter
- recent-alert history by stock
- alert acknowledgement state in UI

---

## 26) Build Order

1. **Classification workflow**
2. **Valuation & threshold workflow**
3. **Monitoring & alerts workflow**
4. **Alert inspection view**
5. **Full integration / QA / telemetry pass**

This order reflects dependency structure.

---

## 27) Risks and Mitigations

### Risk: false precision in classification
Mitigation: confidence system, conservative defaults, manual override.

### Risk: noisy alerts
Mitigation: zone-entry-only alerts, dedupe, cooldown, priority rules.

### Risk: ambiguous derived thresholds
Mitigation: explicit labeling of `derived`, preserve source, make anchored values preferred.

### Risk: broken or stale vendor data
Mitigation: freshness states, data-quality alerts, manual-required states.

### Risk: too much product scope for V1
Mitigation: exclude manual TSR, portfolio construction, and entry permission.

---

## 28) Operational Definition of Done

V1 is done when:
- the system can classify the eligible universe,
- compute valuation state for classified stocks,
- emit actionable low-noise alerts,
- let the investor inspect any alert in a clear read-only detail view,
- and do all of the above in a transparent, auditable, framework-consistent way without requiring manual TSR or portfolio workflows.

---

## 29) Explicit Self-Verification

This PRD has been intentionally written to be **self-contained and operational**, not just descriptive.

It explicitly includes:
- product objective and scope,
- universe definition,
- source-of-truth framework role,
- the three V1 workflows,
- functional architecture,
- workflow-by-workflow inputs and outputs,
- user-facing screens,
- data requirements,
- state models,
- persistence model,
- alert logic,
- edge cases,
- non-functional requirements,
- acceptance criteria,
- build order,
- risks and mitigations,
- operational definition of done.

It is designed so that an implementation team can use it as a standalone V1 product document without needing the previous chat for context.

