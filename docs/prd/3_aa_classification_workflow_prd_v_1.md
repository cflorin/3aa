# 3AA Classification Workflow PRD (v1.0)

## Objective
Build the **Classification Workflow** for the long-term investing product. The workflow must assign each stock a **3AA-style classification** using a **rules-first auto-suggestion engine with manual override**.

The workflow exists to operationalize the framework rule: **classify first; each stock type requires its own valuation method, hurdle rate, and investment logic**.

---

## Scope (V1)
This PRD covers only the **classification workflow**.

### In scope
- Universe eligibility for classification: **US-listed stocks with market cap > $5bn**
- Rules-first suggestion of:
  - `bucket`
  - `earnings_quality`
  - `balance_sheet_quality`
  - combined `suggested_code`
- Confidence level + reason codes
- Manual override to final code
- Classification persistence and audit trail
- Reclassification flow when new data arrives
- UI for reviewing, accepting, or overriding the suggestion

### Out of scope
- Valuation metric selection and valuation zones
- TSR hurdle comparison
- Manual 5Y TSR entry
- Monitoring / alerts
- Portfolio construction
- Entry permission / technical stabilization

Those are separate workflows and separate PRDs.

---

## Background / Framework Basis
The framework defines a stock as a 3-part code:
- **Bucket** = expected normalised medium-term per-share earnings growth regime *(amended 2026-04-27 — RFC-009)*
- **First letter** = earnings quality / durability / moat quality
- **Second letter** = balance-sheet resilience and financing quality

The framework also states explicitly that stocks are different species and must be classified **before** valuation thresholds and decision rules are applied. fileciteturn4file0

---

## Success Criteria
The workflow is successful when:
- Every stock in the eligible universe can be given either:
  - a suggested code with confidence + reason codes, or
  - a low-confidence / insufficient-data outcome
- The user can review the suggestion and set a **final code**
- The system preserves both:
  - the original suggestion
  - the final overridden code if changed
- Re-running the engine is deterministic for the same input data
- Reclassification events are visible and auditable

---

## User Stories

### US-CLS-001 — Auto-suggest 3AA code
**As an** investor  
**I want** the system to auto-suggest a 3AA classification for each stock  
**So that** I do not have to classify the full universe manually from scratch.

**Acceptance Criteria**
- System outputs:
  - `suggested_bucket`
  - `suggested_earnings_quality`
  - `suggested_balance_sheet_quality`
  - `suggested_code`
- System also outputs:
  - `confidence_level`
  - `reason_codes[]`
  - score breakdown by layer
- If data is insufficient, suggestion may be null or low-confidence, but the stock still appears in the queue.

---

### US-CLS-002 — Review suggestion on stock page
**As an** investor  
**I want** to see how the system arrived at the suggested code  
**So that** I can assess whether I agree or want to override it.

**Acceptance Criteria**
- Stock page shows:
  - suggested code
  - confidence level
  - triggered reason codes
  - score breakdown by bucket / earnings quality / balance sheet quality
- UI must explain suggestion in human-readable form, not only raw numbers.

---

### US-CLS-003 — Manually override final code
**As an** investor  
**I want** to override the suggested code  
**So that** my judgment remains the final authority.

**Acceptance Criteria**
- User can set `final_code` manually
- User must provide `override_reason`
- System preserves both `suggested_code` and `final_code`
- Downstream workflows must use `final_code` if present, else `suggested_code`

---

### US-CLS-004 — Track classification history
**As an** investor  
**I want** a history of classification changes  
**So that** I can understand when the system or I changed the interpretation of a business.

**Acceptance Criteria**
- Every classification event is stored with timestamp
- Store:
  - previous suggested code
  - new suggested code
  - previous final code
  - new final code
  - cause (`new_data`, `manual_override`, `recompute`, `initial`)
- History is visible in the stock page / audit log

---

### US-CLS-005 — Recompute classification when data changes
**As a** system  
**I want** to recompute suggested codes when relevant fundamentals update  
**So that** classification stays current.

**Acceptance Criteria**
- Recompute when key inputs change materially or on scheduled refresh
- If suggestion changes, mark stock as `classification_changed`
- Do not auto-overwrite `final_code`; only update `suggested_code`

---

## Workflow Overview

### 1. Universe entry
A stock enters the workflow if:
- it is US-listed
- market cap > $5bn
- it has enough data to attempt classification

### 2. Auto-suggestion engine runs
The system computes:
- suggested bucket
- suggested earnings-quality letter
- suggested balance-sheet-quality letter
- combined suggested code
- confidence
- reason codes

The rules engine follows the separate **3AA Rules Engine Spec — Auto-Suggestion (v1.0)**.

### 3. User review
On the stock page, the investor reviews:
- suggested code
- confidence
- reasons
- data supporting the classification

### 4. Finalization
User either:
- accepts suggestion (final code = suggested code), or
- overrides it with reason

### 5. Persistence
System stores:
- suggested code
- final code
- all metadata and timestamps

### 6. Recompute
On future data refreshes, system may update `suggested_code`, but must leave `final_code` untouched until user changes it.

---

## Classification Logic (high level)
The exact rules are defined in the dedicated rules-engine spec. This PRD defines the workflow behavior around those rules.

### Bucket *(amended 2026-04-27 — RFC-009)*

Bucket represents a **band of expected normalised medium-term per-share earnings growth** (3–5 year horizon). It is computed by the Earnings Path Engine (RFC-009) from five input blocks:

1. **Revenue engine** — normalised revenue growth (long history + recent window + forward estimate)
2. **Earnings engine** — normalised EPS growth (historical TTM series + forward FY2/NTM estimates)
3. **Operating leverage engine** — 5-state modifier (`none` / `gradual` / `emerging_now` / `cyclical_rebound` / `deteriorating`) with a numeric EPS-path contribution (ADR-019)
4. **Cyclicality normalisation** — peak penalty matrix keyed on `structural_cyclicality_score` × `cycle_position` (ADR-018)
5. **Qualitative support** — bounded ±2% modifier from existing LLM enrichment scores

The final number — `expected_normalized_eps_growth` — maps directly to a bucket band:

| Bucket | Meaning | Expected normalised per-share EPS growth |
|--------|---------|------------------------------------------|
| 1 | Earnings decline / impairment | < 0% |
| 2 | Low growth | 0–5% |
| 3 | Steady moderate growth | 5–10% |
| 4 | Durable low-teens growth | 10–18% |
| 5 | High-teens / 20s growth | 18–30% |
| 6 | Very high earnings growth | 30–50% |
| 7 | Extreme / optionality-heavy | > 50% or visibility-dependent |
| 8 | Binary / not classifiable by earnings path | n/a (`binary_flag = true`) |

**Key principles:**
- Bucket is about earnings **path**, not valuation metric or business archetype (valuation is handled by the separate regime selector, ADR-017).
- Per-share invariant: all EPS computations use per-share values; dilution and SBC are penalised explicitly.
- Operating leverage is the most important single modifier; `emerging_now` state (+8% contribution) is the strongest positive signal in the engine.
- Cyclical rebound is explicitly distinguished from structural compounding — `cyclical_rebound` is capped at +2%.
- Missing data reduces `bucket_confidence`; the engine never invents precision.

### Earnings quality
Based on:
- moat
- pricing power
- FCF conversion
- margin stability
- ROIC
- durability across cycle

### Balance-sheet quality
Based on:
- leverage
- interest coverage
- dilution risk
- refinancing dependence
- liquidity buffer

The framework explicitly distinguishes these layers and requires them to be separate. fileciteturn4file0

---

## Inputs

### Required fields *(amended 2026-04-27 — RFC-009)*

**Bucket engine inputs (new / expanded):**
- Last 20 quarters of: `revenue`, `gross_profit`, `operating_income`, `net_income`, `diluted_shares_outstanding`, `free_cash_flow`, `share_based_compensation` (all from `StockQuarterlyHistory`)
- `revenue_growth_fwd` (single-year forward)
- `eps_ntm` — NTM analyst consensus EPS
- `eps_fy2_avg` — FY+2 analyst consensus EPS *(new in EPIC-009; 4-level fallback if absent)*
- `structural_cyclicality_score` (0–3), `cycle_position` (from EPIC-008)
- `share_count_growth_3y`
- `sbc_as_pct_revenue_ttm` (already computed)

**Retained inputs (used by EQ/BS scoring and regime selector):**
- `ticker`, `company_name`, `sector`, `industry`, `market_cap`, `country`
- `revenue_growth_3y`, `eps_growth_3y`
- `gross_margin`, `operating_margin`, `fcf_margin`, `fcf_conversion`, `roic`
- `net_income_positive`, `fcf_positive`
- `net_debt_to_ebitda`, `interest_coverage`

### Optional / manual flags *(amended 2026-04-27)*
- `holding_company_flag`
- `insurer_flag`
- `cyclicality_flag` *(legacy; replaced by `structural_cyclicality_score` for bucket engine)*
- `optionality_flag`
- `binary_flag` *(forces Bucket 8 unconditionally)*
- `market_pessimism_flag`
- `pre_operating_leverage_flag` *(deprecated — replaced by `operating_leverage_state` enum in EPIC-009; retained as legacy override flag)*
- `operating_leverage_state` *(new in EPIC-009 — 5-state enum; see ADR-019)*

### Missing-data behavior
- Missing key growth fields lowers bucket confidence
- Missing quality fields lowers earnings-quality confidence
- Missing leverage / interest fields lowers balance-sheet confidence
- Too many missing fields can result in `suggested_code = null`

---

## Outputs

### Core outputs
- `suggested_bucket`
- `suggested_earnings_quality`
- `suggested_balance_sheet_quality`
- `suggested_code`
- `confidence_level`
- `reason_codes[]`
- `scores.bucket`
- `scores.earnings_quality`
- `scores.balance_sheet_quality`

### Final classification fields
- `final_code`
- `override_reason`
- `override_timestamp`
- `override_user`

### Audit fields
- `classification_last_updated_at`
- `classification_source` (`auto`, `manual_override`, `recompute`)
- `previous_suggested_code`
- `previous_final_code`

---

## UX Requirements

### Universe list
Each stock row should display:
- ticker
- company
- suggested code
- final code (if overridden)
- confidence badge
- classification status (`unreviewed`, `accepted`, `overridden`, `needs_review`)

### Stock page — Classification section
Must show:
- suggested code prominently
- final code prominently
- confidence badge
- reason codes / explanation
- score breakdown by bucket / letters
- controls:
  - accept suggestion
  - override code
  - enter override reason

### Review queue
Need a queue/filter for:
- unreviewed stocks
- low-confidence suggestions
- classification_changed since last review

---

## State Model

### Classification status
Each stock must have one of:
- `unreviewed`
- `accepted`
- `overridden`
- `needs_review`

### Transition rules
- New stock → `unreviewed`
- User accepts suggestion → `accepted`
- User overrides suggestion → `overridden`
- Suggested code changes after recompute → `needs_review`

---

## Persistence / Data Model

### Minimal schema requirements
Store at least:
- `ticker`
- `suggested_code`
- `final_code`
- `confidence_level`
- `reason_codes`
- `scores_json`
- `classification_status`
- `classification_last_updated_at`
- `override_reason`
- `override_timestamp`

### Classification history table
Store:
- `ticker`
- `old_suggested_code`
- `new_suggested_code`
- `old_final_code`
- `new_final_code`
- `change_reason`
- `changed_at`

---

## Telemetry
Emit:
- `classification_suggested { ticker, suggested_code, confidence }`
- `classification_low_confidence { ticker }`
- `classification_overridden { ticker, suggested_code, final_code }`
- `classification_changed { ticker, old_suggested_code, new_suggested_code }`
- `classification_accepted { ticker, code }`

---

## Edge Cases
- **Holding company / insurer**: may need special-case bucket handling; confidence should drop if flags conflict with generic growth rules
- **Boundary names**: if `expected_normalized_eps_growth` lands near a bucket boundary (±1%), show medium confidence and explicit `bucket_reason_codes`; no tie-break resolver needed (formula is continuous)
- **Binary / speculation**: if `binary_flag = true`, system should force or strongly suggest Bucket 8
- **Incomplete data**: must not fabricate precision; low confidence is preferred over forced classification

---

## Acceptance Criteria

1. Every eligible stock can be processed by the workflow.
2. The system returns either:
   - a suggested code + confidence + reasons, or
   - a low-confidence / insufficient-data outcome.
3. User can accept or override the suggestion.
4. Manual override is always preserved and used downstream.
5. Recompute updates suggested code only, not final code.
6. Classification changes are auditable.
7. Review queue correctly surfaces:
   - unreviewed names
   - low-confidence names
   - names with changed suggestions

---

## V1 Deliverable
By the end of this workflow implementation, the product should let the investor:
- open any eligible stock
- see a rules-based suggested classification
- understand why it was suggested
- set a final code manually if needed
- maintain a durable, auditable classification state for the rest of the product to use

This workflow is the foundation for valuation, TSR comparison, and monitoring in later PRDs.


---

## Amendment Log

### Amendment 2026-04-27 — RFC-009: Earnings Path Bucket Engine

**Status:** ACCEPTED
**Scope:** Bucket definition, bucket engine specification, inputs section, edge cases

**What changed:**

1. **Bucket definition** (§Background / Framework Basis): Changed from "business stage and earnings-growth structure" to "expected normalised medium-term per-share earnings growth regime."

2. **Bucket classification logic** (§Classification Logic): Replaced single-paragraph description with full 8-bucket band table, 5-input-block architecture, and key design principles.

3. **Inputs** (§Inputs): Added Earnings Path Engine inputs (20-quarter history, `eps_fy2_avg`, cyclicality inputs); annotated deprecated fields; added `operating_leverage_state` enum.

4. **Edge cases**: Updated "Transition names" → "Boundary names"; removed tie-break reference (no longer needed in formula-based engine).

**What did NOT change:**
- Earnings Quality and Balance Sheet Quality logic and scoring
- Workflow mechanics (suggestion, override, audit trail, state model)
- Confidence, reason codes, and persistence requirements
- Acceptance criteria

**Related:** RFC-009, ADR-013 (superseded bucket weights), ADR-019 (Operating Leverage State Engine), ADR-017 Amendment 2026-04-27 (regime selector bucket gates)

**Implementation epic:** EPIC-009 (STORY-100–111)
