# V1 Implementation Epics

**Baseline Version:** 1.0 (Frozen 2026-04-19)

**Product Loop:** classify → value → monitor → alert → inspect

---

## Epic Overview

| Epic ID | Epic Name | UI Delivered | Dependencies |
|---------|-----------|--------------|--------------|
| EPIC-001 | Platform Foundation & Deployment | None | None |
| EPIC-002 | Authentication & User Management | Sign-In Screen | EPIC-001 |
| EPIC-003 | Data Ingestion & Universe Management | None | EPIC-001 |
| EPIC-004 | Classification Engine & Universe Screen | Universe/Monitor List Screen | EPIC-002, EPIC-003 |
| EPIC-005 | Valuation Engine & Enhanced Universe | Universe Enhancements (zones) | EPIC-004 |
| EPIC-006 | Monitoring & Alerts with Alerts UI | Alerts Feed, Alert Inspection | EPIC-005, EPIC-002 |
| EPIC-007 | User Preferences & Settings | Settings Screen | EPIC-006 |

---

## Incremental Value Delivery

**After EPIC-002:**
- ✅ Users can sign in with email/password
- ✅ Session management functional

**After EPIC-004:**
- ✅ Users can browse 1000-stock universe
- ✅ Users can add/remove stocks from monitor list
- ✅ Users can override classifications
- ✅ Classification suggestions visible

**After EPIC-005:**
- ✅ Valuation zones visible in Universe
- ✅ Thresholds displayed
- ✅ TSR hurdles shown

**After EPIC-006:**
- ✅ Alerts generated nightly
- ✅ Users can view alerts feed
- ✅ Users can inspect alert details
- ✅ Users can acknowledge/resolve alerts

**After EPIC-007:**
- ✅ Users can configure alert preferences
- ✅ Users can customize UI settings
- ✅ Full V1 feature set complete

---

## Critical Path

```
EPIC-001 (Platform)
  ├─> EPIC-002 (Auth + Sign-In) ────────┐
  └─> EPIC-003 (Data Ingestion) ────────┤
        └─> EPIC-004 (Classification + Universe UI) ─┐
              └─> EPIC-005 (Valuation + Enhanced UI) ─┤
                    └─> EPIC-006 (Alerts + Alerts UI) ─┤
                          └─> EPIC-007 (Preferences + Settings UI)
```

---

## Out of V1 Scope

- Manual TSR estimation in screening/alerts
- Portfolio construction
- Entry permission / stabilization rules
- Decision journaling in monitoring loop
- Trade execution workflows
- Email/SMS notifications
- Social login (OAuth)
- Two-factor authentication

---

## Traceability

All epics conform to:
- **PRD:** 3_aa_product_full_v_1_prd_v_1.md
- **RFCs:** RFC-001 through RFC-006 (all ACCEPTED)
- **ADRs:** ADR-001 through ADR-011 (all ACCEPTED)
- **Baseline:** BASELINE-V1.md (version 1.0, frozen 2026-04-19)

---

**END EPIC INDEX**
