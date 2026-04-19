# EPIC-004 — Classification Engine & Universe Screen

## Purpose
Generate rules-based 3AA classification suggestions (bucket, earnings quality, balance sheet quality) with confidence levels and reason codes. Deliver Universe/Monitor List screen (Screen 2) as primary stock browsing and classification management interface. Enable per-user classification overrides while maintaining shared system suggestions.

## Outcome
Every stock in universe has:
- System-generated classification suggestion (suggested_code, confidence_level, reason_codes, scores)
- Classification state persisted (`classification_state` table - shared)
- Users can browse universe, filter stocks, and independently override classifications via UI
- Classification history audited (`classification_history` table)
- Recomputation triggers functional

**UI Delivered:** Screen 2 (Universe / Monitor List) with classification display and override capability

## Scope In
- Bucket scoring algorithm (Buckets 1-8, additive rule scoring per RFC-001)
- Earnings quality scoring (A/B/C grades, moat/FCF/ROIC indicators)
- Balance sheet quality scoring (A/B/C grades, leverage/coverage indicators)
- Tie-break resolution (3 vs 4, 4 vs 5, 5 vs 6, 6 vs 7)
- Confidence computation (high/medium/low based on score separation + missing data penalty)
- Special case overrides (binary_flag → Bucket 8, holding_company_flag logic)
- Classification state persistence (`classification_state` table - shared, system suggestions)
- User classification overrides (`user_classification_overrides` table - per-user)
- Classification history audit trail (`classification_history` - tracks system suggestion changes)
- Recomputation triggers (material fundamental change, scheduled nightly refresh)
- Cloud Scheduler job (classification recompute, 8pm ET Mon-Fri)
- HTTP cron endpoint (`/api/cron/classification`)
- **Screen 2: Universe / Monitor List UI** (stock table with 1000 stocks, filters, sort, pagination, add/remove from monitor list, classification override modal)
- **Monitor list management** (add/remove stocks to `user_monitored_stocks` table)
- **Classification override UI** (modal with code selector, reason text input, save)

## Scope Out
- Machine learning classification (V1 is rules-only)
- User-defined classification rules (custom scoring)
- Automated classification rule tuning
- Valuation display (covered in EPIC-005)
- Alerts display (covered in EPIC-006)

## Dependencies
- **PRD:** Section 10 (Workflow 1 - Classification), Section 9B Screen 2 (Universe / Monitor List)
- **RFCs:** RFC-001 (Classification Engine Architecture), RFC-002 (Data Model - classification tables)
- **ADRs:** ADR-007 (Multi-User Architecture - shared suggestions + per-user overrides), ADR-010 (Next.js)
- **Upstream epics:** EPIC-002 (Auth - requires signed-in users), EPIC-003 (Data Ingestion - requires fresh fundamental data)

## Inputs
- Stock fundamental data (from stocks table: revenue_growth_fwd, eps_growth_fwd, fcf_conversion, roic, net_debt_to_ebitda, etc.)
- Manual flags (holding_company_flag, insurer_flag, binary_flag, cyclicality_flag, optionality_flag)
- Prior classification state (for change detection, classification_history)
- User session (for per-user override UI)

## Outputs
- Classification suggestions (`classification_state` table: suggested_code, confidence_level, reason_codes JSONB, scores JSONB)
- User overrides (`user_classification_overrides` table: final_code, override_reason per user)
- Classification history (`classification_history` table: old_suggested_code → new_suggested_code transitions)
- Active code per user (query: COALESCE(user_override.final_code, classification_state.suggested_code))
- User monitored stocks (`user_monitored_stocks` table: user_id, ticker pairs)
- **Screen 2: Universe UI** (functional stock browsing, filtering, monitor list management, classification override)

## Flows Covered
- **Classification suggestion generation:** Fundamentals → bucket scoring → quality scoring → tie-break → confidence → persist to classification_state → log classification_history if changed
- **User override creation (UI):** User clicks "Override" on stock row → modal opens → user selects code (dropdown with buckets 1-8, qualities A/B/C) → enters reason (required text field) → saves → INSERT/UPDATE user_classification_overrides → modal closes → UI updates to show user override
- **User override removal (UI):** User clicks "Remove Override" → DELETE user_classification_overrides → UI updates to show system suggestion
- **Recomputation trigger:** Fundamental data changed materially (revenue_growth_fwd delta >5%) → recompute classification → UPDATE classification_state → INSERT classification_history
- **Scheduled refresh:** Cloud Scheduler triggers /api/cron/classification (8pm ET) → FOR EACH stock → recompute classification → UPDATE classification_state → log history if changed
- **Low confidence flagging:** Missing >5 critical fields → suggested_code=null, confidence='low' → UI shows "Insufficient Data"
- **Universe browsing (UI):** User navigates to /universe → fetch stocks with classification + user overrides → render table (50 stocks/page) → apply filters (sector, market cap, code, zone) → apply sort (market cap, ticker, zone)
- **Monitor list management (UI):** User clicks "Add to Monitor List" → POST /api/monitored-stocks → INSERT user_monitored_stocks → visual indicator updated → User clicks "Remove from Monitor List" → DELETE user_monitored_stocks → indicator cleared

## Acceptance Criteria
- [ ] Bucket scorer implemented (Buckets 1-8, additive rule scoring, reason codes generated)
- [ ] Earnings quality scorer implemented (A/B/C, moat/FCF/ROIC indicators, reason codes)
- [ ] Balance sheet scorer implemented (A/B/C, leverage/coverage indicators, reason codes)
- [ ] Tie-break resolver implemented (3 vs 4, 4 vs 5, 5 vs 6, 6 vs 7 rules)
- [ ] Confidence computer implemented (high/medium/low based on score separation >3, missing data <5 fields)
- [ ] Special case overrides implemented (binary_flag → Bucket 8, holding_company_flag → consider 3AA)
- [ ] `classification_state` table populated (suggested_code, confidence_level, reason_codes, scores for all in_universe stocks)
- [ ] User classification override functional (POST /api/classification-override → INSERT/UPDATE user_classification_overrides)
- [ ] Active code resolution query functional (SELECT COALESCE(uco.final_code, cs.suggested_code) FROM classification_state cs LEFT JOIN user_classification_overrides uco ...)
- [ ] Classification history logged (INSERT classification_history on every suggested_code change)
- [ ] Recomputation triggers implemented (material change detection: revenue_growth_fwd delta >5%, eps_growth_fwd delta >5%)
- [ ] Cloud Scheduler job configured (classification recompute 8pm ET Mon-Fri)
- [ ] Classification deterministic (same inputs → same outputs, tested with 100 runs)
- [ ] Low confidence flagging (missing >5 critical fields → suggested_code=null, confidence='low')
- [ ] **Universe screen UI functional** (renders stock table, 1000 stocks paginated 50/page)
- [ ] **Filters functional** (sector dropdown, market cap slider, code selector, zone selector - zone selector disabled until EPIC-005)
- [ ] **Sort functional** (clickable column headers: market cap, ticker, zone)
- [ ] **Pagination functional** (next/prev buttons, page indicator: "Page 1 of 20")
- [ ] **Monitor list add/remove functional** (button toggles "Monitored" badge, updates user_monitored_stocks table)
- [ ] **Classification override modal functional** (opens on "Override" click, code selector, reason text field, save button)
- [ ] **Override modal validation** (reason required, min 10 characters, error shown if empty)
- [ ] **Active code displayed** (table shows "System Code" and "Your Code" columns, "Your Code" shows override or "-")

## Test Strategy Expectations

**Unit tests:**
- Bucket scoring (revenue_growth_fwd=10%, eps_growth_fwd=12% → Bucket 4 score calculation)
- Earnings quality scoring (fcf_conversion=0.85, roic=0.22 → A grade score)
- Balance sheet scoring (net_debt_to_ebitda=1.5, interest_coverage=8.0 → B grade score)
- Tie-break resolution (Bucket 3 and 4 scores tied → choose 4 if fcf_conversion >0.85 AND roic >0.20)
- Confidence computation (score separation bucket=5, earnings=4, balance=3 → high confidence; score separation <2 → low confidence)
- Special case overrides (binary_flag=true → forced Bucket 8, ignores scoring)
- Missing data handling (7 critical fields missing → suggested_code=null, confidence='low')
- Determinism (classify AAPL twice with same inputs → identical suggested_code, scores, confidence)
- Active code resolution (user override='3AA', system suggestion='4AA' → active_code='3AA')

**Integration tests:**
- Full classification flow (fundamentals → suggested_code='4AA', confidence='high', reason_codes=['rev_growth_8_15_pct', 'high_fcf_conversion'])
- User override creation (POST /api/classification-override {ticker: 'AAPL', final_code: '3AA', reason: 'Mature business'} → user_classification_overrides row inserted)
- User override removal (DELETE /api/classification-override/AAPL → user_classification_overrides row deleted)
- Recomputation trigger (UPDATE stocks SET revenue_growth_fwd=5.0 WHERE ticker='AAPL' → classification recompute triggered → classification_state updated if changed)
- Classification history logging (suggested_code changed 4AA → 3AA → classification_history row inserted with old/new codes)
- Cloud Scheduler trigger (POST /api/cron/classification with OIDC token → classification recompute runs for all stocks)
- Monitor list add (POST /api/monitored-stocks {ticker: 'AAPL'} → user_monitored_stocks row inserted)
- Monitor list remove (DELETE /api/monitored-stocks/AAPL → user_monitored_stocks row deleted)

**Contract/schema tests:**
- classification_state table schema (suggested_code VARCHAR(5), confidence_level VARCHAR(10) IN ('high','medium','low'), reason_codes JSONB, scores JSONB)
- user_classification_overrides table schema (user_id UUID FK, ticker VARCHAR(10) FK, final_code VARCHAR(5), override_reason TEXT, PK(user_id, ticker))
- classification_history table schema (old_suggested_code, new_suggested_code, context_snapshot JSONB)
- user_monitored_stocks table schema (user_id UUID FK, ticker VARCHAR(10) FK, PK(user_id, ticker))
- ClassificationResult interface (suggested_bucket INT, suggested_earnings_quality CHAR(1), confidence_level, reason_codes: string[], scores: {bucket: Record<number, number>, ...})
- API request/response schemas (POST /api/classification-override body: {ticker, final_code, reason}, response: {success: boolean})

**BDD acceptance tests:**
- "Given stock with revenue_growth_fwd=10% and eps_growth_fwd=12%, when classification runs, then suggested_bucket=4"
- "Given stock with fcf_conversion=0.85 and roic=0.22, when classification runs, then suggested_earnings_quality='A'"
- "Given stock with net_debt_to_ebitda=1.5 and interest_coverage=8, when classification runs, then suggested_balance_sheet_quality='B'"
- "Given user overrides suggested_code 4AA to 3AA, when querying active_code for that user, then active_code='3AA' returned"
- "Given suggested_code changed 4AA → 3AA, when recompute runs, then classification_history logged with old='4AA', new='3AA'"
- "Given >5 critical fields missing, when classification runs, then suggested_code=null and confidence='low'"
- "Given authenticated user on Universe screen, when user clicks Add to Monitor List for AAPL, then AAPL added to user's monitored_stocks"
- "Given user on Universe screen with AAPL monitored, when user clicks Remove from Monitor List, then AAPL removed from user's monitored_stocks"
- "Given user clicks Override on AAPL (suggested 4AA), when user selects 3AA and enters reason, then user_classification_overrides updated and UI shows 'Your Code: 3AA'"

**E2E tests:**
- Full nightly batch (data ingestion → classification recompute → classification_state updated for all stocks)
- User override workflow (sign in → navigate to Universe → filter to show AAPL → click Override → select 3AA → enter reason → save → verify UI shows override)
- Monitor list workflow (sign in → navigate to Universe → click Add to Monitor List for 5 stocks → verify Monitored badge on all 5 → navigate away → return → verify still monitored)

## Regression / Invariant Risks

**Classification drift:**
- Risk: Rule weights change silently, stocks reclassified without reason
- Protection: Determinism tests (100 runs same inputs → same outputs), version classification algorithm

**User override lost:**
- Risk: user_classification_overrides accidentally deleted (schema change, migration error)
- Protection: Foreign key CASCADE prevents orphaned overrides, backups, tests verify persistence

**Determinism broken:**
- Risk: Same inputs produce different outputs due to race condition or non-deterministic logic
- Protection: Unit tests run classification 100 times, assert identical results, code review for randomness

**Confidence calculation broken:**
- Risk: High confidence assigned to low-quality data (missing fields ignored)
- Protection: Integration tests verify confidence='low' when missing >5 critical fields

**History gaps:**
- Risk: Classification changes not logged in classification_history
- Protection: Integration tests verify classification_history row inserted on every suggested_code change

**Recomputation trigger missed:**
- Risk: Material change not detected (revenue_growth_fwd delta >5% ignored)
- Protection: Integration tests verify recomputation triggered on material change

**User isolation broken:**
- Risk: User A's override affects User B's active_code
- Protection: Integration tests verify active_code query filters by user_id, User A override invisible to User B

**Invariants to protect:**
- Classification deterministic (same inputs → same outputs, no randomness)
- System suggestions never overwrite user overrides (user_classification_overrides preserved across recomputes)
- Classification history complete (every suggested_code change logged with old/new values)
- Confidence reflects data quality (low confidence when missing >5 critical fields, high when score separation >3)
- Active code resolution correct (user override || system suggestion, never null if both exist)
- Classification recomputation idempotent (running twice with same inputs produces same classification_state)
- User override requires reason (cannot save override without reason text)

## Key Risks / Edge Cases

**Data quality edge cases:**
- All bucket scores tied (no clear winner, tie-break cascade exhausted → default to Bucket 5?)
- Missing all fundamental fields (cannot classify, suggested_code=null, confidence='low')
- Negative earnings (fcf_conversion undefined, scoring breaks → handle gracefully)
- Contradictory flags (binary_flag=true + holding_company_flag=true → binary_flag takes precedence per RFC-001)

**Multi-user edge cases:**
- User A overrides AAPL to 3AA, User B overrides AAPL to 4AA (both valid, isolated, each sees own override)
- System suggestion changes 4AA → 3AA, User A override is 4AA (now matches old suggestion, notify user via UI badge "System now matches your override"?)
- User override deleted while valuation uses it (active_code query returns system suggestion, valuation recomputed next batch)

**UI edge cases:**
- User opens classification override modal, navigates away (modal state cleanup, unsaved changes lost)
- Stock in monitor list, then dropped from universe (in_universe=FALSE, stock still shown in monitor list with "Out of Universe" badge?)
- User filters to zero results (sector=Technology, code=7AA → no matches, show "No stocks match filters")
- Pagination on filtered results (filter to 50 stocks → only 1 page, next/prev disabled)

**Classification engine edge cases:**
- Bucket 8 stock (binary_flag=true, no quality grades assigned, suggested_earnings_quality=null, suggested_balance_sheet_quality=null)
- Holding company 3AA (special case, but classification engine assigns normally, valuation engine handles metric selection)
- Stock dropped from universe (in_universe=FALSE, classification_state preserved for audit, no longer recomputed)
- Recomputation triggered while classification already running (concurrency: queue recomputes, prevent duplicate processing)

## Likely Stories

- **STORY-046:** Implement bucket scoring algorithm (Buckets 1-8, additive scoring, reason codes)
- **STORY-047:** Implement earnings quality scoring (A/B/C, moat/FCF/ROIC indicators)
- **STORY-048:** Implement balance sheet quality scoring (A/B/C, leverage/coverage indicators)
- **STORY-049:** Implement tie-break resolver (3 vs 4, 4 vs 5, etc.)
- **STORY-050:** Implement confidence computer (score separation + missing data penalty)
- **STORY-051:** Implement special case overrides (binary_flag, holding_company_flag)
- **STORY-052:** Implement classification state persistence (classification_state table UPSERT)
- **STORY-053:** Implement classification history logging (INSERT on suggested_code change)
- **STORY-054:** Implement user classification override API (POST /api/classification-override, DELETE /api/classification-override/:ticker)
- **STORY-055:** Implement active code resolution query (COALESCE user override || system suggestion)
- **STORY-056:** Implement recomputation trigger detection (material change: revenue_growth_fwd delta >5%, eps_growth_fwd delta >5%)
- **STORY-057:** Implement classification recompute job (/api/cron/classification)
- **STORY-058:** Configure Cloud Scheduler job (classification 8pm ET Mon-Fri)
- **STORY-059:** Implement monitor list API (POST /api/monitored-stocks, DELETE /api/monitored-stocks/:ticker)
- **STORY-060:** Build Universe screen UI (stock table, 1000 stocks, pagination 50/page)
- **STORY-061:** Implement Universe filters (sector dropdown, market cap slider, code selector)
- **STORY-062:** Implement Universe sort (clickable column headers: market cap, ticker, code)
- **STORY-063:** Implement monitor list UI (Add/Remove buttons, Monitored badge)
- **STORY-064:** Build classification override modal (code selector, reason text field, save button)
- **STORY-065:** Implement override modal validation (reason required, min 10 chars)
- **STORY-066:** Add integration tests (classification flow, user override, history logging)
- **STORY-067:** Add E2E tests (Universe screen, override workflow, monitor list workflow)

## Definition of Done

- [ ] Implementation complete (classification engine functional, user overrides working, Universe UI delivered)
- [ ] Tests added and passing (unit, integration, contract, BDD, E2E for classification and UI)
- [ ] Regression coverage added (determinism, user override isolation, history logging, UI workflows)
- [ ] Docs updated (README classification section, algorithm documentation, Universe screen user guide)
- [ ] Telemetry/logging added (classification suggestions, low confidence warnings, user overrides, monitor list changes)
- [ ] Migrations included (classification_state, user_classification_overrides, classification_history, user_monitored_stocks tables)
- [ ] Traceability links recorded (code comments reference RFC-001, PRD Section 10, PRD Section 9B Screen 2)
- [ ] Determinism validated (same stock classified 100 times → identical results)
- [ ] Universe coverage validated (all ~1000 in_universe stocks classified or marked low confidence)
- [ ] Universe screen accessible at /universe (requires authentication, redirects if not signed in)
- [ ] UI responsive (works on desktop, tablet, mobile)

## Traceability

- **PRD:** Section 10 (Workflow 1 - Classification), Section 9B Screen 2 (Universe / Monitor List)
- **RFC:** RFC-001 (Classification Engine Architecture), RFC-002 (Data Model - classification tables, user_monitored_stocks)
- **ADR:** ADR-007 (Multi-User Architecture - shared suggestions + per-user overrides), ADR-010 (Next.js)

---

**END EPIC-004**
