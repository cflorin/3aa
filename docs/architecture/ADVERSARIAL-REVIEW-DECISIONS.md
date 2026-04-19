# Adversarial Review - Decision Matrix & Resolution Plan

**Date:** 2026-04-19
**Source:** `/docs/other/3_aa_v_1_docs_adversarial_review_memo_for_claude.md`

---

## Decision Matrix

| Issue | Decision | Rationale | Action Required |
|-------|----------|-----------|-----------------|
| **#1: Per-user active code vs shared valuation** | **ACCEPT - Clarify Semantics** | User classification overrides affect **inspection display only**, not operational valuation/alerts in V1. Alerts generated from **shared system state**. | Patch RFCs to make explicit: user overrides are for review/inspection; alerts use shared valuation computed from system suggested_code |
| **#2: Multi-user assumptions inconsistent** | **ACCEPT - Normalize** | V1 is definitively multi-user from day 1. Remove all single-user language. | Patch PRD and ADR-002 to remove single-user references |
| **#3: ADR numbering drift** | **ACCEPT - Fix References** | RFC-004 references ADR-015/016/017 but actual ADRs are 001-007. Critical traceability issue. | Check RFC-004 and fix all stale ADR references |
| **#4: Audit model incomplete** | **RESOLVED by Issue #1** | Since user overrides don't affect alerts in V1, alert history from shared state is complete. | Document in alert payload that alerts use shared system state |
| **#5: User valuation overrides expensive** | **ACCEPT with Constraints** | Keep user_valuation_overrides but constrain to **inspection-only** (don't affect alerts). Rare (<1%), low risk. | Patch RFC-003 and RFC-005 to clarify overrides don't affect alert generation |
| **#6: Alert philosophy alignment** | **ACCEPT - Make Explicit** | RFC-005 narrows to very_good/steal only. This is correct for V1. PRD should reflect this. | Patch PRD to tighten alert policy language |
| **#7: Provider assumptions too concrete** | **ACCEPT - Downgrade to Assumptions** | Tiingo/FMP coverage percentages are unvalidated. Document as provisional assumptions. | Patch RFC-004 to mark coverage claims as "assumed until validated" |
| **#8: Fallback logic needs guardrails** | **ACCEPT - Add Constraints** | Fallback formulas (trailing P/E × growth) need explicit bounds. | Patch RFC-003 to add guardrails: skip fallback when denominator negative/unstable |
| **#9: Refresh schedule inconsistencies** | **ACCEPT - Normalize** | Minor inconsistencies between RFC-004 and ADR-002 timing. | Cross-check RFC-004 and ADR-002 schedules and normalize |
| **#10: Security model underspecified** | **ACCEPT - Make Explicit** | Application-layer filtering is sufficient for V1. RLS deferred. | Patch ADR-007 to explicitly state V1 uses app-layer filtering, RLS deferred to V2 |
| **#11: PRD persona reconciliation** | **RESOLVED by Issue #2** | Already fixing multi-user normalization. | Covered by Issue #2 patches |
| **#12: Manual-required UX semantics** | **ACCEPT - Document UX** | Backend uses manual_required but UX consequence unclear. | Patch PRD Core UX to show manual_required handling in inspection view |
| **#13: Batch runtime estimates** | **ACCEPT - Label as Assumptions** | Runtime estimates are reasonable but unvalidated. | Patch ADR-002 to label estimates as "planning assumptions" |

---

## Critical Architectural Decision (Issue #1)

### The Problem
Current docs imply:
- Classification suggestions are **shared**
- Classification overrides are **per-user**
- `active_code = final_code || suggested_code` is resolved **per user**
- Valuation computation is **shared/system-computed**
- Monitoring uses the **user's active code**

**This creates inconsistency:** If User A overrides AAPL from `4AA` to `3AA`, does valuation recompute? Do alerts change?

### The Decision

**V1 Semantics:**

1. **System Classification** (shared):
   - Classification engine computes `suggested_code` for all stocks
   - Stored in `classification_state` (shared table)
   - Used by valuation engine

2. **System Valuation** (shared):
   - Valuation engine computes thresholds/zones using `suggested_code`
   - Stored in `valuation_state` (shared table)
   - **This is the operational valuation used for alerts**

3. **User Classification Overrides** (per-user):
   - User can override `suggested_code` to `final_code`
   - Stored in `user_classification_overrides`
   - **Affects inspection display only**
   - **Does NOT affect alert generation in V1**

4. **User Valuation Overrides** (per-user, rare):
   - User can override specific thresholds
   - Stored in `user_valuation_overrides`
   - **Affects inspection display only**
   - **Does NOT affect alert generation in V1**

5. **Alert Generation** (per-user, from shared state):
   - Alerts generated for stocks in `user_monitored_stocks`
   - Uses **shared** `classification_state.suggested_code`
   - Uses **shared** `valuation_state` thresholds/zones
   - User overrides visible in alert inspection but didn't trigger alert

### Why This Decision?

**V1 is Monitoring-First:**
- Primary goal: surface opportunities automatically using consistent framework
- User overrides are for personal judgment/review, not operational monitoring
- Keeps alert logic simple and consistent across users

**Reduces Complexity:**
- No per-user valuation recomputation needed
- No per-user alert threshold divergence
- Audit trail is straightforward (alerts from shared state)

**Preserves User Autonomy:**
- Users can still override for inspection/review
- Users see both system suggestion and their override
- Clear labeling: "Alert triggered by system valuation; your override: 3AA"

**V2 Evolution Path:**
- Can add "Use my overrides for alerts" user preference
- Would require per-user valuation recomputation
- Clear upgrade path when justified by user demand

---

## Execution Plan

### Phase 1: Critical Fixes (Issue #1, #5)
1. **RFC-005 (Monitoring & Alerts):**
   - Add section: "User Overrides and Alert Generation"
   - Clarify alerts use shared system state
   - Document override visibility in alert payload

2. **RFC-003 (Valuation Engine):**
   - Add section: "User Valuation Overrides Scope"
   - Clarify overrides affect inspection only, not alerts
   - Document rare usage (<1%)

3. **ADR-004 (Classification Automation):**
   - Add section: "Override Scope - Inspection vs Alerts"
   - Clarify V1 overrides don't affect operational valuation

4. **ADR-007 (Multi-User Architecture):**
   - Add explicit statement about override scope
   - Document V1 vs V2 evolution path

### Phase 2: Normalization (Issues #2, #11)
5. **PRD Section 1:**
   - Remove "single long-term investor" language
   - Replace with "multi-user web application for long-term investors"

6. **ADR-002 (Nightly Batch):**
   - Remove "single user (not multi-tenant)" language from V1 Characteristics
   - Update to "Multi-user (10-100 users expected)"

### Phase 3: Reference Fixes (Issue #3)
7. **RFC-004 (Data Ingestion):**
   - Check for ADR-015/016/017 references
   - Replace with correct ADR-001 through ADR-007 references

### Phase 4: Remaining Issues (Issues #6-#10, #12-#13)
8. **PRD Section 9B (Core UX):**
   - Tighten alert policy language (very_good/steal only)
   - Add manual_required UX handling in inspection view

9. **RFC-004 (Data Ingestion):**
   - Downgrade provider coverage percentages to "assumed until validated"

10. **RFC-003 (Valuation Engine):**
    - Add fallback guardrails (skip when denominator negative/unstable)

11. **ADR-002 (Nightly Batch):**
    - Label runtime estimates as "planning assumptions (unvalidated)"

12. **ADR-007 (Multi-User Architecture):**
    - Add security section: V1 uses app-layer filtering, RLS deferred

13. **Cross-check schedules:**
    - RFC-004 vs ADR-002 timing consistency

---

## Post-Execution Verification

- [ ] All RFCs explicitly state user override scope (inspection vs alerts)
- [ ] All multi-user language consistent (no single-user references)
- [ ] All ADR references use correct numbering (001-007)
- [ ] All unvalidated assumptions labeled as such
- [ ] All guardrails documented for fallback logic
- [ ] Security model explicitly documented in ADR-007

---

**Ready to Execute**
