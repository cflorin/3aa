# EPIC-005 — Valuation & Threshold Engine + Enhanced Universe

## Purpose
Select primary valuation metric, assign threshold grids (anchored or derived), compute TSR hurdles, and determine valuation zones. Enhance Universe screen to display valuation data (zones, thresholds, TSR hurdles). Enable per-user threshold overrides while maintaining shared system state.

## Outcome
Every classified stock has:
- Primary metric selected (Forward P/E, EV/EBIT, EV/Sales, special cases)
- Current multiple computed (with forward estimate fallbacks)
- Threshold grid assigned (anchored from DB or mechanically derived)
- TSR hurdle calculated (base + quality adjustments)
- Valuation zone assigned (steal, very good, comfortable, max, expensive)
- Valuation state persisted (`valuation_state` table - shared)
- Universe screen enhanced to show valuation zones, thresholds, TSR hurdles

**UI Delivered:** Enhanced Universe screen (Screen 2) with valuation columns, zone filtering, zone sorting

## Scope In
- Primary metric selection logic (bucket-based rules, special cases: holding companies, pre-operating-leverage)
- Current multiple computation (spot calculation, forward estimate fallback chain per RFC-003)
- Anchored threshold lookup (`anchored_thresholds` table, 16 codes)
- Derived threshold generation (mechanical derivation for missing codes, quality downgrades)
- Secondary adjustments (gross margin for EV/Sales Buckets 6-7, dilution for Buckets 5-7, cyclicality flagging)
- TSR hurdle calculation (base hurdle from `tsr_hurdles` table + quality adjustments)
- Valuation zone assignment (compare current_multiple to thresholds → zone)
- Valuation state persistence (`valuation_state` table - shared, system computation)
- User valuation overrides (`user_valuation_overrides` table - rare, per-user threshold overrides)
- Valuation history audit trail (`valuation_history` - zone transitions)
- Recomputation triggers (classification suggested_code changed, price changed, metric value changed)
- Cloud Scheduler job (valuation recompute, 8:15pm ET Mon-Fri)
- HTTP cron endpoint (`/api/cron/valuation`)
- **Universe screen enhancements:** Add valuation zone column, current multiple column, thresholds display, TSR hurdle display
- **Zone filter:** Add zone selector to filters (steal, very good, comfortable, max, expensive)
- **Zone sort:** Enable sort by zone (steal first, expensive last)

## Scope Out
- Manual TSR estimation workflow (out of V1 scope)
- Entry permission / stabilization rules (out of V1 scope)
- Mid-cycle earnings adjustment (deferred to V1.1)
- Portfolio valuation aggregation
- User threshold override UI (threshold override API available, but UI deferred to EPIC-007 Settings)
- Alert generation (covered in EPIC-006)

## Dependencies
- **PRD:** Section 11 (Workflow 2 - Valuation & Thresholds), Section 9B Screen 2 (Universe enhancements)
- **RFCs:** RFC-002 (Data Model - valuation tables, anchored_thresholds, tsr_hurdles), RFC-003 (Valuation & Threshold Engine Architecture)
- **ADRs:** ADR-007 (Multi-User Architecture - shared valuation + per-user overrides), ADR-010 (Next.js)
- **Upstream epics:** EPIC-004 (Classification Engine - requires suggested_code for metric selection)

## Inputs
- Active classification code (from classification_state.suggested_code - V1 uses system suggestion, NOT user override for valuation computation)
- Stock fundamental data (current_price, forward_pe, forward_ev_ebit, ev_sales, gross_margin, share_count_growth_3y)
- Manual flags (holding_company_flag, insurer_flag, pre_operating_leverage_flag, cyclicality_flag, material_dilution_flag)
- Anchored thresholds (from anchored_thresholds table)
- TSR hurdles (from tsr_hurdles table)
- User session (for per-user threshold override queries, though UI not in this epic)

## Outputs
- Valuation state (`valuation_state` table: primary_metric, current_multiple, max/comfortable/very_good/steal thresholds, valuation_zone, adjusted_tsr_hurdle, threshold_source)
- User threshold overrides (`user_valuation_overrides` table - rare, API available but UI deferred)
- Valuation history (`valuation_history` table: zone transitions with context_snapshot)
- Active thresholds per user (query: COALESCE(user_valuation_overrides, valuation_state) - though UI deferred)
- **Enhanced Universe UI:** Valuation zone column, current multiple column, thresholds tooltip, TSR hurdle column, zone filter, zone sort

## Flows Covered
- **Metric selection:** Active_code (from classification_state.suggested_code) → bucket-based rules → special case handling (3AA + holding_company_flag → forward_operating_earnings_ex_excess_cash) → primary_metric assigned
- **Current multiple computation:** Primary_metric → fetch from stocks table → forward estimate fallback if missing (forward_pe missing → compute from trailing_pe / (1 + eps_growth_fwd/100)) → current_multiple
- **Anchored threshold lookup:** Active_code → query anchored_thresholds WHERE code=active_code → IF found THEN thresholds, threshold_source='anchored'
- **Derived threshold generation:** Active_code NOT IN anchored_thresholds → find anchor reference (same bucket, highest quality) → apply quality downgrades (B-grade → -2.5 turns, C-grade → -4.5 turns for P/E) → derived thresholds, threshold_source='derived'
- **Secondary adjustments:** IF bucket IN (6,7) AND gross_margin >80% THEN thresholds += 1.0x sales; IF share_count_growth_3y >5% OR material_dilution_flag THEN thresholds -= 1.0 turn (for P/E) or -1.0x sales (for EV/Sales)
- **TSR hurdle calculation:** Bucket → base_hurdle from tsr_hurdles table → earnings_quality adjustment (A: -1.0%, B: 0%, C: +2.5%) → balance_sheet adjustment (A: -0.5%, B: 0%, C: +1.75%) → adjusted_tsr_hurdle
- **Valuation zone assignment:** Current_multiple vs thresholds → IF current_multiple <= steal_threshold THEN 'steal_zone', ELSIF <= very_good_threshold THEN 'very_good_zone', ELSIF <= comfortable_threshold THEN 'comfortable_zone', ELSIF <= max_threshold THEN 'max_zone', ELSE 'above_max'
- **Valuation state persistence:** UPSERT valuation_state table with primary_metric, current_multiple, thresholds, valuation_zone, adjusted_tsr_hurdle
- **Recomputation trigger:** Classification suggested_code changed (4AA → 3AA) → metric changes (forward_pe → forward_operating_earnings_ex_excess_cash for 3AA holding company) → recompute valuation → UPDATE valuation_state → INSERT valuation_history if zone changed
- **Scheduled refresh:** Cloud Scheduler POST /api/cron/valuation (8:15pm ET) → FOR EACH classified stock → recompute valuation → UPDATE valuation_state
- **Universe screen display (UI):** Fetch stocks with classification + valuation + user overrides → render table with new columns: "Zone" (badge with color: red=steal, green=very_good, yellow=comfortable, gray=max), "Current Multiple" (18.2x), "TSR Hurdle" (11.5%), thresholds tooltip on hover → zone filter dropdown → zone sort option

## Acceptance Criteria
- [ ] Metric selector implemented (Buckets 1-4 → forward_pe, Bucket 5 → forward_ev_ebit or ev_sales if pre_operating_leverage_flag, Buckets 6-7 → ev_sales, Bucket 8 → no_stable_metric)
- [ ] Special case metric selection (3AA + holding_company_flag → forward_operating_earnings_ex_excess_cash)
- [ ] Current multiple computation with fallback (forward_pe missing → computed from trailing_pe / (1 + eps_growth_fwd/100), safety: skip if trailing_pe <0 or cyclicality_flag)
- [ ] Anchored threshold lookup implemented (query anchored_thresholds, returns thresholds for 16 anchored codes)
- [ ] Derived threshold generation implemented (mechanical derivation: find anchor → apply quality downgrades → floor enforcement)
- [ ] Secondary adjustments implemented (gross margin: >80% +1.0x sales, <60% -1.5x sales; dilution: >5% -1.0 turn or -1.0x sales)
- [ ] TSR hurdle calculation implemented (base_hurdle + earnings_quality_adjustment + balance_sheet_adjustment)
- [ ] Valuation zone assignment implemented (current_multiple vs thresholds → zone)
- [ ] `valuation_state` table populated (primary_metric, current_multiple, thresholds, valuation_zone, adjusted_tsr_hurdle for all classified stocks)
- [ ] Valuation history logged (INSERT valuation_history on zone transition: comfortable → steal)
- [ ] Recomputation triggers implemented (classification suggested_code change, current_price change >1%, metric value change >5%)
- [ ] Cloud Scheduler job configured (valuation recompute 8:15pm ET Mon-Fri)
- [ ] V1 semantics enforced (valuation uses system suggested_code from classification_state, NOT user override from user_classification_overrides)
- [ ] **Universe screen enhanced with valuation columns** (Zone, Current Multiple, TSR Hurdle)
- [ ] **Zone column displays colored badge** (red=steal, green=very_good, yellow=comfortable, gray=max, black=above_max)
- [ ] **Thresholds tooltip** (hover over Zone badge → tooltip shows max=22.0x, comfortable=20.0x, very_good=18.0x, steal=16.0x, source=anchored)
- [ ] **Zone filter functional** (zone selector dropdown: All, Steal, Very Good, Comfortable, Max, Above Max)
- [ ] **Zone sort functional** (sort by zone: steal → very good → comfortable → max → above_max order)
- [ ] **TSR Hurdle column displays percentage** (11.5%)

## Test Strategy Expectations

**Unit tests:**
- Metric selection (Bucket 4 + no flags → forward_pe; Bucket 5 + pre_operating_leverage_flag → ev_sales; 3AA + holding_company_flag → forward_operating_earnings_ex_excess_cash)
- Current multiple fallback (forward_pe missing, trailing_pe=20, eps_growth_fwd=10% → forward_pe=18.18)
- Current multiple fallback safety (trailing_pe=-5 → fallback skipped, returns null; cyclicality_flag=true → fallback skipped)
- Anchored threshold lookup (code='4AA' → max=22, comfortable=20, very_good=18, steal=16, threshold_source='anchored')
- Derived threshold generation (code='4AB' not anchored → derive from 4AA with B-grade downgrade → max=19.5, comfortable=17.5, very_good=15.5, steal=13.5, threshold_source='derived')
- Secondary adjustments (gross_margin=85%, bucket=6 → thresholds += 1.0x sales; share_count_growth_3y=6% → thresholds -= 1.0x sales)
- TSR hurdle calculation (bucket=4, earnings_quality='A', balance_sheet='A' → base=12.5%, adjusted=12.5-1.0-0.5=11.0%)
- Valuation zone assignment (current_multiple=18.0, steal=16, very_good=18, comfortable=20 → zone='very_good_zone')
- Active thresholds resolution (user override present → returns user thresholds; user override absent → returns system thresholds)

**Integration tests:**
- Full valuation flow (active_code='4AA' → metric='forward_pe' → current_multiple=18.2 → anchored thresholds → zone='very_good_zone' → tsr_hurdle=11.0%)
- Anchored threshold lookup (query anchored_thresholds WHERE code='4AA' → returns row with thresholds)
- Derived threshold generation (code='4AB' → derive from 4AA → verify thresholds derived_from_code='4AA', threshold_source='derived')
- Recomputation trigger (UPDATE classification_state SET suggested_code='3AA' WHERE ticker='AAPL' → valuation recompute triggered → metric changes → valuation_state updated)
- Valuation history logging (zone changed comfortable → steal → valuation_history row inserted with old_valuation_zone='comfortable_zone', new_valuation_zone='steal_zone')
- Cloud Scheduler trigger (POST /api/cron/valuation with OIDC token → valuation recompute runs for all classified stocks)
- Zone filter (POST /api/stocks?zone=steal_zone → returns only stocks with valuation_zone='steal_zone')
- Zone sort (GET /api/stocks?sort=zone → returns stocks ordered: steal first, very_good, comfortable, max, above_max last)

**Contract/schema tests:**
- valuation_state table schema (primary_metric VARCHAR(50), current_multiple NUMERIC(10,2), max/comfortable/very_good/steal_threshold NUMERIC(10,2), valuation_zone VARCHAR(20), adjusted_tsr_hurdle NUMERIC(5,2), threshold_source VARCHAR(20))
- user_valuation_overrides table schema (user_id UUID FK, ticker VARCHAR(10) FK, max/comfortable/very_good/steal_threshold NUMERIC(10,2), override_reason TEXT)
- valuation_history table schema (old_valuation_zone, new_valuation_zone, context_snapshot JSONB)
- anchored_thresholds table schema (16 rows, code UNIQUE, thresholds descending order enforced)
- tsr_hurdles table schema (7 rows, bucket 1-7, base_hurdle_default, quality adjustments)
- API response schema (GET /api/stocks includes valuation_zone, current_multiple, adjusted_tsr_hurdle fields)

**BDD acceptance tests:**
- "Given classification 4AA, when valuation runs, then primary_metric='forward_pe' and anchored thresholds used"
- "Given forward_pe=18 and thresholds (steal=16, very_good=18, comfortable=20, max=22), when valuation runs, then valuation_zone='very_good_zone'"
- "Given classification 4AB not anchored, when valuation runs, then thresholds derived from 4AA with B-grade downgrade and threshold_source='derived'"
- "Given gross_margin=85% and bucket=6, when valuation runs, then thresholds adjusted +1.0x sales"
- "Given zone changed comfortable → steal, when valuation runs, then valuation_history logged with old/new zones"
- "Given user on Universe screen, when zone filter set to 'Steal', then only stocks with zone='steal_zone' displayed"
- "Given user on Universe screen, when sort by Zone selected, then stocks ordered steal → very_good → comfortable → max → above_max"

**E2E tests:**
- Full nightly batch (classification → valuation recompute → valuation_state updated for all classified stocks)
- Universe screen with valuation (sign in → navigate to /universe → see Zone column with colored badges → filter by zone=steal → see only steal stocks → sort by zone → see correct order)

## Regression / Invariant Risks

**Threshold derivation broken:**
- Risk: Derived thresholds violate descending order (max < comfortable)
- Protection: Unit tests verify descending order after derivation, floor enforcement prevents negative thresholds

**Fallback overwrites valid data:**
- Risk: Computed forward_pe overwrites valid provider forward_pe
- Protection: Fallback only computes if forward_pe is null, never overwrites existing value

**Zone assignment incorrect:**
- Risk: current_multiple=17.9, steal=18 → assigned 'comfortable_zone' instead of 'very_good_zone' (boundary error)
- Protection: Unit tests with boundary values (17.99, 18.0, 18.01), integration tests verify zone assignment

**TSR hurdle calculation broken:**
- Risk: Quality adjustments not applied (earnings_quality='A' → no -1.0% adjustment)
- Protection: Unit tests verify all quality combinations, integration tests check tsr_hurdles table query

**User override lost:**
- Risk: user_valuation_overrides accidentally deleted (schema change, migration error)
- Protection: Foreign key CASCADE prevents orphaned overrides, backups, tests verify persistence

**Valuation recomputation uses user override:**
- Risk: V1 semantics violated - valuation uses user override instead of system suggested_code
- Protection: Integration tests verify valuation query uses classification_state.suggested_code, NOT user_classification_overrides.final_code

**Invariants to protect:**
- Thresholds always descending order (max > comfortable > very_good > steal, enforced in derivation + CHECK constraint)
- Valuation deterministic (same inputs → same outputs, no randomness)
- Valuation uses system suggested_code, NOT user override (V1 semantics, alert generation relies on this)
- User threshold overrides do not affect alert generation (alerts use shared valuation_state, not user overrides)
- Valuation history complete (every zone transition logged with old/new zones + context_snapshot)
- Anchored thresholds immutable for V1 (never modified, only queried)
- TSR hurdles immutable for V1 (never modified, only queried)
- Computed fallback only when safe (skips if negative earnings, cyclicality_flag set)

## Key Risks / Edge Cases

**Metric selection edge cases:**
- Pre-operating-leverage flag changes mid-V1 (Bucket 5 metric switches ev_ebit → ev_sales, thresholds change, zone changes)
- Holding company flag set after classification (3AA metric changes to forward_operating_earnings_ex_excess_cash, but value missing → manual_required)

**Threshold derivation edge cases:**
- Derived thresholds floor out at 1.0x (EV/EBIT) or 0.5x (EV/Sales), zone assignment breaks if current_multiple < floor
- Anchor reference not found (no anchored code for same bucket → fallback to default bucket anchor? or mark manual_required?)

**Fallback edge cases:**
- Forward estimate fallback unsafe (trailing_pe=-10, computed forward_pe=-9.09 → skip fallback, return null)
- Cyclicality flag set (forward estimate fallback skipped even if trailing data available → current_multiple=null, zone=not_applicable)

**UI edge cases:**
- Valuation zone='not_applicable' (Bucket 8 or missing metric → display badge color gray with text "N/A")
- Thresholds tooltip shows derived source (tooltip includes "Source: Derived from 4AA" instead of "Source: Anchored")
- User filters by zone=steal but no stocks match (display "No stocks in Steal zone")

**System edge cases:**
- Bucket 8 stock (no_stable_metric, valuation_zone='not_applicable', current_multiple=null, thresholds=null)
- Valuation recomputation while valuation already running (concurrency: queue recomputes, prevent duplicate processing)
- Classification suggested_code changes during valuation batch (valuation uses stale code → acceptable, next batch uses new code)

## Likely Stories

- **STORY-068:** Implement metric selector (bucket-based rules + special cases)
- **STORY-069:** Implement current multiple computation (with forward estimate fallback + safety guardrails)
- **STORY-070:** Implement anchored threshold lookup (query anchored_thresholds table)
- **STORY-071:** Implement derived threshold generation (mechanical derivation with quality downgrades)
- **STORY-072:** Implement secondary adjustments (gross margin, dilution)
- **STORY-073:** Implement TSR hurdle calculator (base + quality adjustments)
- **STORY-074:** Implement valuation zone assigner (current_multiple vs thresholds)
- **STORY-075:** Implement valuation state persistence (valuation_state table UPSERT)
- **STORY-076:** Implement valuation history logging (INSERT on zone transition)
- **STORY-077:** Implement recomputation trigger detection (classification change, price change, metric change)
- **STORY-078:** Implement valuation recompute job (/api/cron/valuation)
- **STORY-079:** Configure Cloud Scheduler job (valuation 8:15pm ET Mon-Fri)
- **STORY-080:** Enhance Universe screen with valuation columns (Zone, Current Multiple, TSR Hurdle)
- **STORY-081:** Implement zone badge UI (colored badge with tooltip showing thresholds)
- **STORY-082:** Implement zone filter (dropdown: All, Steal, Very Good, Comfortable, Max, Above Max)
- **STORY-083:** Implement zone sort (order: steal → very_good → comfortable → max → above_max)
- **STORY-084:** Add integration tests (valuation flow, threshold derivation, zone assignment, history logging)
- **STORY-085:** Add E2E tests (Universe screen with valuation, zone filter, zone sort)

## Definition of Done

- [ ] Implementation complete (valuation engine functional, Universe UI enhanced with valuation)
- [ ] Tests added and passing (unit, integration, contract, BDD, E2E for valuation and UI)
- [ ] Regression coverage added (threshold derivation, fallback logic, zone assignment, V1 semantics)
- [ ] Docs updated (README valuation section, threshold derivation algorithm, Universe screen user guide)
- [ ] Telemetry/logging added (metric selection, derived thresholds, zone transitions, zone filter usage)
- [ ] Migrations included (valuation_state, user_valuation_overrides, valuation_history tables)
- [ ] Traceability links recorded (code comments reference RFC-003, PRD Section 11, PRD Section 9B Screen 2)
- [ ] Anchored thresholds validated (16 codes in database, thresholds descending order)
- [ ] V1 semantics validated (valuation uses system suggested_code from classification_state, NOT user override)
- [ ] Universe screen valuation columns functional (Zone badge, Current Multiple, TSR Hurdle displayed correctly)
- [ ] Zone filter functional (filters stocks to selected zone)
- [ ] Zone sort functional (stocks ordered by zone: steal first, above_max last)

## Traceability

- **PRD:** Section 11 (Workflow 2 - Valuation & Thresholds), Section 9B Screen 2 (Universe enhancements)
- **RFC:** RFC-002 (Data Model - valuation tables, anchored_thresholds, tsr_hurdles), RFC-003 (Valuation & Threshold Engine Architecture)
- **ADR:** ADR-007 (Multi-User Architecture - shared valuation + per-user overrides), ADR-010 (Next.js)

---

**END EPIC-005**
