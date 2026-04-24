# EPIC-004 — Classification Engine & Universe Screen

**Status:** planned — stories decomposed (STORY-041–052), ready for implementation
**Last updated:** 2026-04-23 (revised after adversarial review; see revision notes below)

## Purpose
Generate rules-based 3AA classification suggestions (bucket, earnings quality, balance sheet quality) with confidence levels and reason codes. Deliver Universe Screen (Screen 2) as the primary stock browsing and classification management interface. Enable per-user classification overrides while maintaining shared system suggestions. All stocks are monitored by default; users can deactivate individual stocks.

## Outcome
Every `in_universe=TRUE` stock has:
- System-generated classification suggestion (`suggested_code`, `confidence_level`, `reason_codes`, `scores`)
- Classification state persisted (`classification_state` table — shared)
- Classification history audited (`classification_history` table)
- Users can browse all in-universe stocks, filter/sort, deactivate/reactivate monitoring, and override classifications via UI
- Recomputation functional (nightly batch job + `shouldRecompute()` delta detection)

**UI Delivered:** Screen 2 (Universe Screen) with classification display, monitoring controls, and override capability; Stock Detail Screen (`/stocks/[ticker]`) with 4-tab drill-down

## Scope In
- Bucket scoring algorithm (Buckets 1–8, additive rule scoring per RFC-001 and ADR-013)
- Earnings quality scoring (A/B/C grades)
- Balance sheet quality scoring (A/B/C grades)
- Tie-break resolution (3 vs 4, 4 vs 5, 5 vs 6, 6 vs 7)
- Confidence computation (high/medium/low per ADR-014)
- Special case overrides (`binary_flag` → Bucket 8; `holding_company_flag` logic)
- Classification state persistence (`classification_state` table with `input_snapshot`)
- Classification history audit trail (`classification_history` with `old_suggested_code`, `new_suggested_code`, `context_snapshot`)
- `shouldRecompute()` using `classification_state.input_snapshot` as prior input source
- User classification overrides (`user_classification_overrides` table — per-user)
- User monitoring preferences (`user_deactivated_stocks` table — per-user deactivation)
- Nightly batch job: `POST /api/cron/classification` (OIDC via `verifySchedulerToken`, reuses existing placeholder)
- **Screen 2: Universe Screen** (all in-universe stocks, paginated 50/page, text search + filters + sort, monitoring toggle, override modal with history; row click navigates to stock detail)
- **Stock Detail Screen** (`/stocks/[ticker]`): 4-tab drill-down — Classification (score bars, confidence steps, tie-breaks, E1–E6, override), Fundamentals (all metrics + 7 flags), Valuation (placeholder), History (classification timeline)

## Scope Out
- Machine learning classification
- User-defined classification rules
- Valuation display (EPIC-005)
- Alerts display (EPIC-006)

## Monitoring Model (revised 2026-04-23)

**Previous model (stale):** per-user add/remove monitor list → Screen 2 shows only monitored stocks.

**Current model:** all `in_universe=TRUE` stocks are monitored by default. Users can deactivate individual stocks (stops alert generation for that user). Screen 2 shows ALL in-universe stocks with per-user `is_active` status. EPIC-006 alert engine reads `user_deactivated_stocks` to skip deactivated stocks per user.

- Table: `user_deactivated_stocks (user_id, ticker) PK, deactivated_at` — presence = deactivated; absence = active
- `GET /api/universe` returns all `in_universe=TRUE` stocks with derived `is_active` per user

## API Routes

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/cron/classification` | OIDC (`verifySchedulerToken`) | Nightly batch recompute |
| `POST` | `/api/classification-override` | Session | Set user override |
| `DELETE` | `/api/classification-override/[ticker]` | Session | Clear user override → 204 No Content |
| `GET` | `/api/stocks/[ticker]/classification` | Session | Get classification with active_code |
| `GET` | `/api/stocks/[ticker]/classification/history` | Session | Get classification history (STORY-051) |
| `PUT` | `/api/stocks/[ticker]/monitoring` | Session | Deactivate / reactivate stock |
| `GET` | `/api/universe` | Session | All in-universe stocks with monitoring status and classification |
| `GET` | `/api/universe/sectors` | Session | Distinct sectors for filter dropdown |
| `GET` | `/api/stocks/[ticker]/detail` | Session | Full stock detail: classification, fundamentals, enrichment, override, history data |

## Data Model

### `classification_state` (shared, system-computed, one row per ticker)
- `ticker VARCHAR PK`
- `suggested_code VARCHAR(5) NULLABLE` — null when data too sparse
- `confidence_level VARCHAR(10) NOT NULL` — `'high'|'medium'|'low'` — NEVER null
- `reason_codes JSONB NOT NULL`
- `scores JSONB NOT NULL` — `{ bucket: Record<1-8, number>, eq: Record<A-C, number>, bs: Record<A-C, number> }`
- `input_snapshot JSONB NOT NULL` — serialized `ClassificationInput` used in last run (source for `shouldRecompute()`)
- `classified_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

### `classification_history` (append-only audit log)
- `id UUID PK`
- `ticker VARCHAR NOT NULL`
- `old_suggested_code VARCHAR(5) NULLABLE`
- `new_suggested_code VARCHAR(5) NULLABLE`
- `context_snapshot JSONB NOT NULL` — `{ input_snapshot, scores, reason_codes }`
- `classified_at TIMESTAMPTZ NOT NULL`

### `user_classification_overrides` (per-user)
- `(user_id, ticker) PK`
- `final_code VARCHAR(5) NOT NULL`
- `override_reason TEXT NOT NULL` — required, minimum 10 characters
- `overridden_at TIMESTAMPTZ NOT NULL`

### `user_deactivated_stocks` (per-user)
- `(user_id, ticker) PK`
- `deactivated_at TIMESTAMPTZ NOT NULL`

## Active Code Resolution
```sql
SELECT COALESCE(uco.final_code, cs.suggested_code) AS active_code
FROM classification_state cs
LEFT JOIN user_classification_overrides uco
  ON uco.ticker = cs.ticker AND uco.user_id = $userId
WHERE cs.ticker = $ticker
```

## Dependencies
- **PRD:** §10 (Workflow 1 — Classification), §9B Screen 2 (Universe / Monitor List)
- **RFCs:** RFC-001 (Classification Engine Architecture), RFC-002 (Data Model)
- **ADRs:** ADR-007 (Multi-User Architecture), ADR-013 (Scoring Weights), ADR-014 (Confidence Thresholds), ADR-008 (Cron OIDC Auth)
- **Upstream epics:** EPIC-002 (Auth), EPIC-003 (Data Ingestion), EPIC-003.1 (LLM Enrichment)

## Inputs
- Stock fundamental data from `stocks` table
- Flags: `holding_company_flag`, `insurer_flag`, `binary_flag`, `cyclicality_flag`, `optionality_flag`, `pre_operating_leverage_flag`
- E1–E6 enrichment scores from `stocks` table (optional, from EPIC-003.1)
- Prior classification state (`classification_state.input_snapshot`) for change detection

## Key Invariants
- `confidence_level` NEVER null — always `'high'|'medium'|'low'`
- `suggested_code = null` → `confidence_level = 'low'` (insufficient data, not uncertain confidence)
- User overrides NEVER affect `classification_state.suggested_code`
- Override reason REQUIRED (min 10 chars)
- DELETE override returns 204 No Content
- Batch job queries `WHERE in_universe = TRUE` only
- `classification_state.input_snapshot` is the sole source of previous inputs for `shouldRecompute()`
- User classification override is `display_only` in V1 — alert generation uses `suggested_code`

## Stories

| Story | Title | Status |
|---|---|---|
| STORY-041 | Bucket Scoring Algorithm | planned |
| STORY-042 | Earnings Quality and Balance Sheet Quality Scoring | planned |
| STORY-043 | Classification Result Assembly (Tie-Break, Confidence, Special Cases) | planned |
| STORY-044 | Classification State Persistence and History (incl. `input_snapshot`) | planned |
| STORY-045 | User Classification Override API | planned |
| STORY-046 | User Monitoring Preferences API (all-default, per-user deactivation) | planned |
| STORY-047 | Classification Recompute Batch Job | planned |
| STORY-048 | Universe Screen: Stock Table (all in-universe, paginated) | planned |
| STORY-049 | Universe Screen: Filters and Sort | planned |
| STORY-050 | Monitoring: Deactivate/Reactivate UI | planned |
| STORY-051 | Classification Override Modal (with history section) | planned |
| STORY-052 | EPIC-004 End-to-End Tests | planned |
| STORY-053 | Stock Detail Page (4-tab: Classification, Fundamentals, Valuation placeholder, History) | planned |

Story specs: `stories/tasks/EPIC-004-classification-engine-universe-screen/`

## Regression / Invariant Risks

- **Classification drift:** rule weight change → stocks reclassify silently — golden-set regression tests (5 fixture stocks)
- **Determinism broken:** non-deterministic logic → 100-run determinism test
- **User override lost:** migration error deletes override rows — FK constraints + backup tests
- **Confidence null emitted:** `confidence_level = null` in API response — contract test on every response
- **`shouldRecompute` cannot compare:** if `input_snapshot` missing → recomputes every run (degraded perf, not wrong behavior)
- **Deactivated stock hidden:** stock should remain visible in universe screen with `is_active=false` — not removed from table
- **Alert reads override:** if EPIC-006 reads `active_code` instead of `suggested_code` — document V1 constraint in override API

## Revision Notes (2026-04-23)

Changes from original epic doc:
1. **Monitoring model:** "add/remove monitor list" → "all-default-monitored, per-user deactivation via `user_deactivated_stocks`"
2. **`input_snapshot`:** added to `classification_state` to support `shouldRecompute()` (fixes state gap)
3. **`classification_history` schema:** standardised to `old_suggested_code`, `new_suggested_code`, `context_snapshot` (aligns with RFC)
4. **Cron auth:** `POST /api/cron/classification` + OIDC `verifySchedulerToken` (not bearer secret; not GET)
5. **Override routes:** `POST /api/classification-override`, `DELETE /api/classification-override/[ticker]` → 204
6. **Override reason:** required, min 10 chars
7. **ADR-013/ADR-014:** created to fill the missing scoring-weights and confidence-threshold ADR gap
8. **Story count:** 22 granular stories → 12 meaningful stories (STORY-041–052)

**Revision 2 (2026-04-23) — UI prototype analysis:**
9. **STORY-053 added:** Stock Detail Page (`/stocks/[ticker]`) — identified from `screen-stock-detail.jsx` prototype; was not in original decomposition
10. **ClassificationResult expanded:** `confidenceBreakdown` and `tieBreaksFired` added to interface (STORY-043) and persistence (STORY-044) — required for detail screen display
11. **Universe Screen (STORY-048):** Row click navigates to detail page; Zone + Market Cap columns added; metric color-coding added
12. **Filters (STORY-049):** Text search (ticker + company name) added; Market Cap becomes default sort column
13. **watchSignal:** Deferred to EPIC-006 (not in STORY-053 scope)

## Definition of Done
- [ ] All STORY-041–053 complete with tests passing
- [ ] Classification engine deterministic (100-run test)
- [ ] All in-universe stocks have `classification_state` rows
- [ ] Universe screen accessible at `/universe`, requires authentication
- [ ] Override modal accessible, history displayed, reason required
- [ ] EPIC-004 E2E tests passing in CI

## Traceability
- **PRD:** §10 (Classification), §9B Screen 2
- **RFC:** RFC-001 (Classification Engine), RFC-002 (Data Model)
- **ADR:** ADR-007, ADR-008, ADR-013, ADR-014
