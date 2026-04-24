# EPIC-003 — Data Ingestion & Universe Management

## Purpose
Sync stock data from external providers (Tiingo, FMP), maintain the eligible universe ($5bn+ US stocks), and enable classification/valuation engines with fresh fundamental data. This epic establishes the nightly batch data pipeline foundation.

## Outcome
Nightly batch data pipeline operational:
- Universe refreshed (stocks with market cap >$5bn, US only)
- EOD prices synced (Tiingo or FMP, daily)
- Fundamentals synced (growth, profitability, balance sheet metrics)
- Forward estimates synced (FMP primary, Tiingo fallback, computed trailing fallback)
- Data freshness tracked (fresh/stale/missing status)
- Cloud Scheduler triggers data ingestion jobs (5pm-7pm ET window)
- Provider abstraction layer enables multi-provider fallback

**UI Delivered:** None (backend pipeline only)

## Scope In
- Provider abstraction layer (VendorAdapter interface per RFC-004)
- Tiingo adapter implementation (universe, prices, fundamentals, partial forward estimates)
- FMP adapter implementation (universe, prices, fundamentals, strong forward estimates coverage)
- Provider orchestrator (fallback logic, provenance tracking, field-level provider selection)
- Universe sync job (query both providers, merge, filter $5bn+ market cap + US, mark in_universe=TRUE/FALSE)
- Price sync job (EOD current_price, daily refresh)
- Fundamentals sync job (revenue_growth, eps_growth, fcf_conversion, roic, net_debt_to_ebitda, etc.)
- Forward estimates sync job (forward_pe, forward_ev_ebit with FMP primary + Tiingo fallback + computed trailing fallback)
- Data freshness tracking (data_freshness_status field: fresh/stale/missing, data_last_synced_at)
- Provenance tracking (data_provider_provenance JSONB: {field → {provider, synced_at, fallback_used}})
- Cloud Scheduler job configuration (3 jobs: price-sync 5pm ET, fundamentals 6pm ET, estimates 7pm ET)
- HTTP cron endpoints (`/api/cron/price-sync`, `/api/cron/fundamentals`, `/api/cron/estimates`)
- OIDC authentication for cron endpoints (Cloud Scheduler service account verification)
- Error handling and retry logic (provider failures, rate limits, exponential backoff)
- Provider API key management (read from Secret Manager)

## Scope Out
- Real-time intraday data (V1 is EOD batch-based)
- Alternative providers beyond Tiingo/FMP (V2+)
- Manual data entry UI (no admin override interface)
- Data quality dashboards (observability UI deferred)
- Historical data backfill (V1 starts fresh from current date)
- Stock metadata editing UI (sector/industry overrides)

## Dependencies
- **PRD:** Section 15 (Data Requirements), Section 16 (Data Freshness Rules)
- **RFCs:** RFC-002 (Data Model - stocks table), RFC-004 (Data Ingestion & Refresh Pipeline)
- **ADRs:** ADR-001 (Multi-Provider Data Architecture), ADR-002 (Nightly Batch Orchestration)
- **Upstream epics:** EPIC-001 (Platform Foundation - requires database, Cloud Scheduler, Secret Manager)

## Inputs
- Tiingo API key (from Secret Manager: TIINGO_API_KEY)
- FMP API key (from Secret Manager: FMP_API_KEY)
- Vendor API responses (universe data, EOD prices, fundamentals, forward estimates)
- Prior stocks table state (for change detection, in_universe status)

## Outputs
- `stocks` table populated and updated (ticker, company_name, sector, industry, market_cap, in_universe, fundamentals, prices)
- Data provenance tracked (data_provider_provenance JSONB per field: {provider, synced_at, fallback_used})
- Data freshness status (data_freshness_status: fresh if synced <2 days for prices, <90 days for fundamentals)
- Cloud Scheduler jobs configured and functional (3 jobs triggering HTTP endpoints)
- Provider adapters operational (Tiingo, FMP)
- Stocks marked in_universe=TRUE (eligible for classification/valuation) or FALSE (dropped from universe)

## Flows Covered
- **Universe sync:** Fetch from Tiingo → fetch from FMP → merge (union) → filter (market_cap > $5bn AND country = 'US') → UPSERT stocks → mark in_universe=TRUE → mark dropped stocks in_universe=FALSE
- **Price sync:** FOR EACH in_universe stock → fetchFieldWithFallback('eod_price', [TiingoAdapter, FMPAdapter]) → UPDATE stocks.current_price → track provenance
- **Fundamentals sync:** FOR EACH in_universe stock → fetch growth metrics (revenue_growth_fwd, eps_growth_fwd) → fetch profitability (fcf_conversion, roic, margins) → fetch balance sheet (net_debt_to_ebitda, interest_coverage) → UPDATE stocks → track provenance
- **Forward estimates sync:** FOR EACH in_universe stock → fetchFieldWithFallback('forward_pe', [FMPAdapter, TiingoAdapter]) → IF null AND trailing_pe + eps_growth_fwd available → compute forward_pe = trailing_pe / (1 + eps_growth_fwd/100) → UPDATE stocks.forward_pe → track provenance (provider='computed_trailing' if fallback used)
- **Data freshness check:** FOR EACH stock → compare data_last_synced_at to NOW() → IF >2 days for prices OR >90 days for fundamentals → UPDATE data_freshness_status='stale'
- **Provider fallback:** Primary provider fails (FMP API 500 error) → retry with fallback provider (Tiingo) → log fallback usage → track in provenance.fallback_used=TRUE
- **Cloud Scheduler trigger:** Cloud Scheduler POST /api/cron/price-sync (OIDC token) → verify service account → run price sync → return 200 OK with summary ({stocks_updated: 1000, errors: 0})

## Acceptance Criteria
- [ ] VendorAdapter interface defined (fetchUniverse, fetchEODPrice, fetchFundamentals, fetchForwardEstimates methods)
- [ ] Tiingo adapter implemented (all methods functional, API key from Secret Manager)
- [ ] FMP adapter implemented (all methods functional, API key from Secret Manager)
- [ ] Provider orchestrator implemented (fetchFieldWithFallback logic with primary/fallback array)
- [ ] Universe sync functional (merges Tiingo + FMP, filters $5bn+ US, marks in_universe correctly)
- [ ] Price sync functional (updates current_price daily for in_universe stocks)
- [ ] Fundamentals sync functional (updates growth/profitability/balance sheet metrics)
- [ ] Forward estimates sync functional (forward_pe, forward_ev_ebit with multi-level fallback: FMP → Tiingo → computed trailing)
- [ ] Data provenance tracked (data_provider_provenance JSONB contains {field: {provider, synced_at, fallback_used}} for each synced field)
- [ ] Data freshness status computed (fresh if prices synced <2 days, stale if >2 days, missing if never synced)
- [ ] Cloud Scheduler jobs created (price-sync 5pm ET Mon-Fri, fundamentals 6pm ET Mon-Fri, estimates 7pm ET Mon-Fri)
- [ ] OIDC auth enforced on cron endpoints (requests without valid service account token → 401 Unauthorized)
- [ ] Provider rate limits respected (Tiingo: 1000 req/hr, FMP: 250 req/min, adapters enforce limits)
- [ ] Error handling implemented (provider failures logged, retries with exponential backoff up to 3 attempts)
- [ ] API keys loaded from Secret Manager (not hardcoded, read at runtime)
- [ ] Universe size validated (~1000 stocks expected for $5bn+ US filter)
- [ ] Computed fallback safety guardrails (negative trailing_pe → skip fallback, cyclicality_flag → skip fallback)

## Test Strategy Expectations

**Unit tests:**
- VendorAdapter interface compliance (Tiingo/FMP adapters implement all required methods)
- Provider orchestrator fallback logic (primary returns null → fallback called → result returned)
- Universe filter logic (market_cap=$4.9bn country=US → excluded, market_cap=$5.1bn country=US → included)
- Data freshness calculation (synced_at = 2 days ago → fresh, synced_at = 3 days ago → stale for prices)
- Forward estimate computed fallback (trailing_pe=20, eps_growth_fwd=10% → forward_pe=18.18)
- Computed fallback safety (trailing_pe=-5 → fallback skipped, returns null)
- Provenance tracking (field updated via fallback → provenance.fallback_used=true)
- Rate limit enforcement (101 requests in 1 hour to Tiingo → error, request queued)

**Integration tests:**
- Tiingo adapter live test (fetchUniverse → returns >500 stocks with market_cap, sector, industry)
- FMP adapter live test (fetchUniverse → returns >500 stocks)
- Universe sync end-to-end (fetch → merge → filter → UPSERT stocks → verify in_universe=TRUE count ~1000)
- Price sync end-to-end (fetch prices → UPDATE current_price → verify provenance contains {provider: 'tiingo' or 'fmp'})
- Fundamentals sync end-to-end (fetch → UPDATE stocks → verify revenue_growth_fwd, eps_growth_fwd populated)
- Forward estimates sync with fallback (mock FMP failure → Tiingo succeeds → provenance shows provider='tiingo', fallback_used=true)
- Computed trailing fallback (forward_pe missing from both providers → computed from trailing_pe → provenance shows provider='computed_trailing')
- Cloud Scheduler trigger test (POST /api/cron/price-sync with OIDC token → 200 OK → price sync runs)
- OIDC auth test (POST /api/cron/price-sync without token → 401 Unauthorized)
- Provider failure retry (mock Tiingo 500 error → retry with exponential backoff → 3 attempts → log error)

**Contract/schema tests:**
- VendorAdapter interface contract (all methods return Promise<T | null>)
- Tiingo API response schema (universe endpoint returns {ticker, name, market_cap, sector, industry})
- FMP API response schema (universe endpoint returns {symbol, companyName, marketCap, sector, industry})
- stocks table schema (all fundamental fields present: revenue_growth_fwd NUMERIC, fcf_conversion NUMERIC, etc.)
- data_provider_provenance JSONB schema (validate structure: {field_name: {provider: string, synced_at: timestamp, fallback_used: boolean}})

**BDD acceptance tests:**
- "Given Tiingo and FMP available, when universe sync runs, then stocks table contains only $5bn+ US stocks"
- "Given stock AAPL in universe, when price sync runs, then current_price updated and provenance tracked"
- "Given FMP forward_pe missing for AAPL, when estimates sync runs, then Tiingo fallback used and provenance shows fallback_used=true"
- "Given both providers fail for forward_pe, when estimates sync runs and trailing_pe available, then computed fallback used and provenance shows provider='computed_trailing'"
- "Given last price sync >2 days ago, when freshness check runs, then data_freshness_status='stale'"
- "Given stock market_cap drops to $4.5bn, when universe sync runs, then in_universe=FALSE"

**E2E tests:**
- Full nightly batch data sequence (universe sync → price sync → fundamentals sync → estimates sync, all succeed)
- Provider failure scenario (Tiingo down → FMP fallback succeeds → batch completes with warnings logged)

## Regression / Invariant Risks

**Provider schema change:**
- Risk: Tiingo/FMP response format changes, adapter breaks
- Protection: Contract tests validate API response schemas, version adapters

**Data overwrite:**
- Risk: Fallback provider overwrites valid data with null
- Protection: fetchFieldWithFallback only overwrites if current value is null, tests verify

**Universe drift:**
- Risk: Stocks drop below $5bn but not marked in_universe=FALSE
- Protection: Universe sync UPSERT always sets in_universe based on current market_cap

**Data staleness not detected:**
- Risk: Freshness check logic broken, stale data marked as fresh
- Protection: Integration tests verify freshness calculation, monitor data_last_synced_at

**Provenance lost:**
- Risk: Data updated without tracking source provider
- Protection: Every UPDATE must include provenance JSONB update, tests enforce

**Rate limit exceeded:**
- Risk: Adapter makes too many requests, provider blocks API key
- Protection: Rate limiter enforces provider limits, tests verify enforcement

**Invariants to protect:**
- Universe contains only $5bn+ US stocks (in_universe=TRUE enforces market_cap AND country filters)
- Data provenance always tracked (every field update logs source provider in data_provider_provenance)
- Data freshness status accurate (reflects actual sync timestamps: fresh <2 days for prices, <90 days for fundamentals)
- Fallback logic preserves data (fallback does not overwrite valid value with null)
- Provider rate limits never exceeded (adapters enforce 1000 req/hr for Tiingo, 250 req/min for FMP)
- stocks table never has orphaned records (classification_state, valuation_state reference stocks via FK)
- Computed fallback only when safe (skips if negative earnings, cyclicality_flag set)

## Key Risks / Edge Cases

**Provider availability risks:**
- Tiingo API down for extended period (>1 day, prices stale)
- FMP rate limit exceeded (250 req/min, batch takes too long)
- Provider returns stale data (timestamp in response is old)
- Provider schema change breaks adapter (response format different)

**Data quality risks:**
- Forward estimate missing from both providers (computed fallback required)
- Negative earnings/EBIT (trailing_pe negative, computed fallback unsafe → skip)
- Market cap drops to $4.9bn (stock marked in_universe=FALSE, classification/valuation state preserved)
- Stock ticker changed by exchange (old ticker stale, new ticker appears as new stock)

**Batch performance risks:**
- Universe sync takes >30 min (1000 stocks × 2 providers × API latency)
- Price sync takes >30 min (1000 stocks × 1 API call each)
- Rate limits cause batch to span multiple hours (sequential processing slow)

**Edge cases:**
- Stock in universe yesterday, dropped today (in_universe=FALSE, historical classification/valuation data retained)
- Duplicate ticker across providers (merge logic uses Set to dedupe by ticker)
- Provider returns null for required field (mark as missing, log data quality issue, do not UPDATE)
- Clock skew (provider timestamp vs server timestamp, freshness calculation off by hours)
- Stock added to universe mid-day (appears in next batch, classified in next classification run)

## Likely Stories

- **STORY-028:** Define VendorAdapter interface (TypeScript interface with method signatures)
- **STORY-029:** Implement TiingoAdapter (fetchUniverse, fetchEODPrice, fetchFundamentals, fetchForwardEstimates)
- **STORY-030:** Implement FMPAdapter (same methods as Tiingo)
- **STORY-031:** Implement ProviderOrchestrator (fetchFieldWithFallback with primary/fallback array)
- **STORY-032:** Implement universe sync job (merge providers, filter, UPSERT stocks, mark in_universe)
- **STORY-033:** Implement price sync job (fetch EOD prices, UPDATE current_price, track provenance)
- **STORY-034:** Implement fundamentals sync job (fetch growth/profitability/balance sheet, UPDATE stocks)
- **STORY-035:** Implement forward estimates sync job (multi-level fallback: FMP → Tiingo → computed trailing)
- **STORY-036:** Implement data freshness tracking (calculate fresh/stale/missing based on sync timestamps)
- **STORY-037:** Implement computed trailing fallback (forward_pe = trailing_pe / (1 + eps_growth_fwd/100))
- **STORY-038:** Add safety guardrails to computed fallback (skip if negative earnings or cyclicality_flag)
- **STORY-039:** Implement cron endpoints (`/api/cron/price-sync`, `/api/cron/fundamentals`, `/api/cron/estimates`)
- **STORY-040:** Implement OIDC authentication for cron endpoints (verify Cloud Scheduler service account)
- **STORY-041:** Configure Cloud Scheduler jobs (3 jobs with correct schedule, OIDC auth)
- **STORY-042:** Implement provider rate limiting (enforce Tiingo 1000 req/hr, FMP 250 req/min)
- **STORY-043:** Implement error handling and retry logic (exponential backoff, max 3 retries)
- **STORY-044:** Add integration tests (provider adapters, sync jobs, fallback logic)
- **STORY-045:** Add contract tests (API response schemas, provenance JSONB structure)

## Definition of Done

- [ ] Implementation complete (all sync jobs functional, provider adapters working, fallback logic operational)
- [ ] Tests added and passing (unit, integration, contract, BDD for sync jobs and fallback)
- [ ] Regression coverage added (provider fallback, data freshness, provenance tracking, computed fallback safety)
- [ ] Docs updated (README data ingestion section, provider configuration, API key setup)
- [ ] Telemetry/logging added (sync job execution times, provider fallback usage, errors, stocks synced count)
- [ ] Migrations included (stocks table schema updates if needed, indexes added)
- [ ] Traceability links recorded (code comments reference RFC-004, ADR-001)
- [ ] Cloud Scheduler jobs tested (manual trigger succeeds, OIDC auth works)
- [ ] Provider API keys in Secret Manager (verified readable at runtime)
- [ ] Universe size validated (after universe sync, in_universe=TRUE count ~1000 stocks)
- [ ] Computed fallback tested (negative earnings skipped, cyclicality_flag honored)

## Traceability

- **PRD:** Section 15 (Data Requirements), Section 16 (Data Freshness Rules)
- **RFC:** RFC-002 (Data Model - stocks table), RFC-004 (Data Ingestion & Refresh Pipeline)
- **ADR:** ADR-001 (Multi-Provider Data Architecture), ADR-002 (Nightly Batch Orchestration)

---

**END EPIC-003**
