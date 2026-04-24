# 3AA Valuation & Threshold Workflow PRD (v1.0)

## Objective
Build the **Valuation & Threshold Workflow** for the long-term investing product. This workflow must take a stock’s **final or suggested 3AA code** and turn it into a disciplined valuation decision framework:

- choose the correct **primary valuation metric**
- compute the **current multiple**
- assign the correct **threshold grid** (`max`, `comfortable`, `very_good`, `steal`)
- assign the **base TSR hurdle** and **adjusted TSR hurdle`
- classify the stock into a **valuation zone**

This workflow operationalizes the framework rule that the same growth does not deserve the same multiple and that each business type must be judged with the correct metric and hurdle.

---

## Scope (V1)
This PRD covers only the **valuation & threshold workflow**.

### In scope
- Use `final_code` if present, otherwise `suggested_code`
- Primary metric selection by bucket / special case
- Current multiple calculation
- Anchored threshold lookup
- Derived threshold generation for missing codes
- TSR hurdle assignment
- Additional mechanical adjustments (gross margin, dilution, cyclicality context)
- Valuation-zone assignment
- Persistence and audit trail for system-generated and manual override values
- UI rendering of the full valuation block on the stock page

### Out of scope
- Classification workflow itself
- Manual 5Y TSR entry and review workflow
- Monitoring / alerts
- Portfolio construction
- Entry permission / technical stabilization

Those are separate workflows and separate PRDs.

---

## Background / Framework Basis
The framework explicitly requires:
- metric selection by bucket
- threshold zones of `max`, `comfortable`, `very good`, `steal`
- bucket-specific TSR hurdles with quality adjustments
- conservative derivation for missing combinations
- clear distinction between explicit anchors and mechanically derived thresholds

This workflow must therefore be transparent, deterministic, and visibly rules-based.

---

## Success Criteria
The workflow is successful when:
- Every stock with a valid code receives either:
  - a complete valuation block, or
  - a clearly labeled `not_applicable` / `manual_required` outcome
- The system always chooses the correct primary metric for the code
- Thresholds are either:
  - **anchored** from the framework table, or
  - **derived** using explicit mechanical rules
- The stock is placed into a valuation zone correctly
- The adjusted TSR hurdle is computed deterministically and shown clearly
- All manual overrides are auditable and never overwrite the system baseline silently

---

## User Stories

### US-VAL-001 — Select primary valuation metric
**As an** investor  
**I want** the system to choose the correct valuation metric for the stock’s code  
**So that** the stock is judged on a business-appropriate basis.

**Acceptance Criteria**
- Buckets 1–4 default to `forward_pe`
- 3AA Berkshire / holding-company / insurer-like exception uses `forward_operating_earnings_ex_excess_cash`
- Bucket 5 defaults to `forward_ev_ebit`
- Bucket 5 switches to `ev_sales` if `pre_operating_leverage_flag = true`
- Buckets 6–7 use `ev_sales`
- Bucket 8 returns `no_stable_metric`

---

### US-VAL-002 — Compute current multiple
**As an** investor  
**I want** the system to compute the current multiple using the selected metric  
**So that** I can compare current valuation to the framework thresholds.

**Acceptance Criteria**
- Current multiple is stored as numeric when metric is applicable
- If the selected metric cannot be computed from available data, the workflow returns `manual_required`
- Current multiple basis is stored (`spot`, `mid_cycle`, `manual_override`)

---

### US-VAL-003 — Assign valuation thresholds
**As an** investor  
**I want** the system to assign `max`, `comfortable`, `very_good`, and `steal` thresholds  
**So that** every stock sits in a clear valuation decision architecture.

**Acceptance Criteria**
- If the code exists in the anchored table, use the anchored thresholds
- If not, derive thresholds mechanically from the framework rules
- Always label threshold source as `anchored`, `derived`, or `manual_override`
- Preserve descending order: `max > comfortable > very_good > steal`

---

### US-VAL-004 — Assign TSR hurdle
**As an** investor  
**I want** the system to compute the stock’s base and adjusted TSR hurdle  
**So that** I can later compare my manual 5Y TSR to the required hurdle.

**Acceptance Criteria**
- Base hurdle is determined by bucket
- Adjusted hurdle applies earnings-quality and balance-sheet adjustments
- Hurdle source is stored as `default` or `manual_override`

---

### US-VAL-005 — Assign valuation zone
**As an** investor  
**I want** the system to classify the stock’s current valuation into a zone  
**So that** I know whether it is above max, comfortable, very good, or steal.

**Acceptance Criteria**
- Zone is assigned using current multiple vs thresholds
- Zone values are limited to:
  - `above_max`
  - `max_zone`
  - `comfortable_zone`
  - `very_good_zone`
  - `steal_zone`
  - `not_applicable`

---

### US-VAL-006 — Manually override valuation values
**As an** investor  
**I want** to override metric / thresholds / hurdle when judgment requires it  
**So that** rare special cases are not constrained by rigid automation.

**Acceptance Criteria**
- User can override:
  - primary metric
  - threshold grid
  - adjusted TSR hurdle
  - current multiple basis
- System preserves both original system-generated values and overrides
- Override requires a reason

---

## Workflow Overview

### 1. Determine active code
Use:
- `final_code` if present
- otherwise `suggested_code`

If neither exists, valuation workflow cannot run and should return `classification_required`.

### 2. Select primary metric
Use bucket + special-case flags to choose the correct metric.

### 3. Compute current multiple
Compute the live multiple for the selected metric using current price and forward data.

### 4. Assign thresholds
Look up anchored thresholds if code is explicit.
If missing, derive mechanically from the threshold derivation engine.

### 5. Apply secondary adjustments
If triggered, apply:
- gross margin adjustment (Buckets 6–7)
- dilution adjustment (Buckets 5–7)
- cyclicality context / mid-cycle note

### 6. Assign TSR hurdles
Compute base hurdle by bucket and adjusted hurdle by code quality.

### 7. Assign valuation zone
Place the stock into the correct zone using current multiple vs thresholds.

### 8. Persist and render
Store the full valuation block and render it on the stock page.

---

## Inputs

### Required
- `ticker`
- `final_code` or `suggested_code`
- `forward_pe`
- `forward_ev_ebit`
- `ev_sales`
- `forward_operating_earnings_ex_excess_cash` (if applicable)
- `gross_margin`
- `share_count_growth_3y`
- `pre_operating_leverage_flag`
- `holding_company_flag`
- `insurer_flag`
- `cyclicality_flag`
- `market_pessimism_flag`

### Optional / manual
- `manual_primary_metric_override`
- `manual_threshold_override`
- `manual_adjusted_tsr_hurdle_override`
- `manual_multiple_basis_override`
- `material_dilution_flag`
- `mid_cycle_override`

---

## Outputs

### Core valuation outputs
- `active_code`
- `primary_metric`
- `metric_reason`
- `current_multiple`
- `current_multiple_basis`

### Threshold outputs
- `max_threshold`
- `comfortable_threshold`
- `very_good_threshold`
- `steal_threshold`
- `threshold_source`
- `derived_from_code`
- `threshold_adjustments[]`

### TSR outputs
- `base_tsr_hurdle_label`
- `base_tsr_hurdle_default`
- `adjusted_tsr_hurdle`
- `hurdle_source`
- `tsr_reason_codes[]`

### Zone output
- `valuation_zone`

### Audit outputs
- `valuation_last_updated_at`
- `valuation_override_reason`
- `valuation_history_event_id`

---

## Metric Selection Rules

### Buckets 1–4
- default metric: `forward_pe`

### Special case: Berkshire / holding company / insurer stalwart
- if `active_code` starts with `3` and `holding_company_flag = true` or `insurer_flag = true`
- use `forward_operating_earnings_ex_excess_cash`

### Bucket 5
- default metric: `forward_ev_ebit`
- if `pre_operating_leverage_flag = true`, switch to `ev_sales`

### Buckets 6–7
- metric: `ev_sales`

### Bucket 8
- metric: `no_stable_metric`
- valuation zone should be `not_applicable`

---

## Threshold Rules
The workflow depends on the dedicated **3AA Threshold Derivation Spec — Valuation Zones & TSR Hurdles (v1.0)**.

### Anchored thresholds
Use the explicit threshold table whenever code exists in it.

### Derived thresholds
If code is missing from anchors, derive according to metric family:
- P/E buckets 1–4
- EV/EBIT bucket 5
- EV/Sales buckets 6–7

### Important UX requirement
The UI must always show whether thresholds are:
- `anchored`
- `derived`
- `manual_override`

---

## TSR Hurdle Rules

### Base hurdle by bucket
- Bucket 1 → 15.0%
- Bucket 2 → 10.5%
- Bucket 3 → 11.5%
- Bucket 4 → 12.5%
- Bucket 5 → 15.0%
- Bucket 6 → 19.0%
- Bucket 7 → 25.0%
- Bucket 8 → null

### Adjustments
- Earnings quality A → −1.0%
- Earnings quality B → 0
- Earnings quality C → +2.5%
- Balance-sheet quality A → −0.5%
- Balance-sheet quality B → 0
- Balance-sheet quality C → +1.75%

The adjusted hurdle must be shown even if the user later enters manual TSR.

---

## Secondary Adjustments

### Gross margin adjustment (Buckets 6–7, EV/Sales only)
- gross margin >80% → +1.0x sales to thresholds
- gross margin 60–80% → no change
- gross margin <60% → −1.5x sales

### Dilution adjustment (Buckets 5–7)
Trigger if:
- `share_count_growth_3y > 5%` OR `material_dilution_flag = true`

Apply:
- P/E or EV/EBIT → subtract 1 turn
- EV/Sales → subtract 1.0x sales

### Cyclicality context
If `cyclicality_flag = true`:
- keep metric unless user overrides basis
- allow `current_multiple_basis = mid_cycle`
- flag in UI that spot earnings may be misleading

### Market pessimism
Do not auto-change thresholds.
Instead store an interpretive label:
- `cheap_due_to_lower_quality`
- `cheap_due_to_market_pessimism`

---

## Valuation Zone Rules
Assign in this order:
- if `primary_metric = no_stable_metric` → `not_applicable`
- else if `current_multiple <= steal_threshold` → `steal_zone`
- else if `current_multiple <= very_good_threshold` → `very_good_zone`
- else if `current_multiple <= comfortable_threshold` → `comfortable_zone`
- else if `current_multiple <= max_threshold` → `max_zone`
- else → `above_max`

---

## UX Requirements

### Universe list
Each stock row should be able to display:
- code
- primary metric
- current multiple
- max / comfortable / very good / steal
- valuation zone
- adjusted TSR hurdle
- threshold source badge

### Stock page — Valuation section
Must show:
- active code
- primary metric
- current multiple
- threshold grid
- threshold-source badge
- adjusted TSR hurdle
- valuation-zone badge
- special adjustments / notes
- override controls

### Required badges
- `anchored`
- `derived`
- `manual override`
- `cyclical`
- `dilution adjusted`
- `gross margin adjusted`
- `no stable metric`

---

## State Model
Each stock valuation block should have one of:
- `ready`
- `manual_required`
- `classification_required`
- `not_applicable`

### Transition rules
- valid code + metric + thresholds → `ready`
- missing metric data → `manual_required`
- no active code → `classification_required`
- Bucket 8 → `not_applicable`

---

## Persistence / Data Model
Store at least:
- `ticker`
- `active_code`
- `primary_metric`
- `current_multiple`
- `current_multiple_basis`
- `max_threshold`
- `comfortable_threshold`
- `very_good_threshold`
- `steal_threshold`
- `threshold_source`
- `derived_from_code`
- `adjusted_tsr_hurdle`
- `hurdle_source`
- `valuation_zone`
- `valuation_last_updated_at`
- `valuation_override_reason`

### History table
Store valuation history events with:
- old/new metric
- old/new thresholds
- old/new adjusted TSR hurdle
- old/new valuation zone
- source of change (`recompute`, `manual_override`, `code_changed`)
- timestamp

---

## Telemetry
Emit:
- `valuation_metric_selected { ticker, code, metric }`
- `valuation_thresholds_assigned { ticker, code, source }`
- `valuation_zone_changed { ticker, old_zone, new_zone }`
- `valuation_manual_override { ticker, field, reason }`
- `valuation_manual_required { ticker, reason }`

---

## Edge Cases
- **Bucket 8**: bypass normal valuation logic; show `speculation_only`
- **Holding company / insurer**: may need special metric even if generic code suggests P/E
- **Pre-operating-leverage names**: must switch metric family
- **Missing current multiple**: workflow state becomes `manual_required`
- **Negative earnings / unusable EBIT**: if selected metric becomes invalid, force `manual_required` or switch to allowed alternate only if the framework permits it
- **Derived thresholds with aggressive adjustments**: ensure thresholds do not fall below sensible floors

---

## Acceptance Criteria

1. A stock with a valid active code always receives the correct primary metric.
2. Anchored codes always use anchored thresholds.
3. Missing codes always use derived thresholds with transparent labeling.
4. Adjusted TSR hurdle is always computed for Buckets 1–7.
5. Current multiple is placed into the correct valuation zone.
6. Manual overrides preserve original system values and are auditable.
7. The stock page and universe list can render the full valuation block clearly.

---

## V1 Deliverable
By the end of this workflow implementation, the product should let the investor:
- open any classified stock
- see the correct valuation metric
- see current multiple vs threshold grid
- understand whether the stock is above max, comfortable, very good, or steal
- see the required TSR hurdle for that stock’s code
- trust that all values are either anchored, derived, or manually overridden in a transparent way

This workflow provides the valuation backbone for the stock-review and monitoring workflows.

