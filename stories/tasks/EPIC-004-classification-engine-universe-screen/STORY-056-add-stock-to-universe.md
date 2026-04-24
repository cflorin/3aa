# STORY-056 — Add Stock to Universe

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Allow a user to add a single stock to the universe by entering a ticker. The system runs the full data ingestion + enrichment + classification pipeline for that stock automatically. The UI shows live progress as each pipeline stage completes. The resulting classified stock appears in the universe table.

The capability is designed API-first so it can be reused in future epics (bulk import, watchlist addition, alert creation) without duplicating pipeline logic.

## Story
As a user,
I want to type a ticker symbol and add it to my universe,
so that the system automatically fetches all its data, classifies it, and adds it to my monitored list.

## Outcome
The universe screen header gains an "Add Stock" button. Clicking opens a modal with a ticker input field. Submitting calls `POST /api/universe/stocks` which creates the stock record and kicks off the full pipeline. The modal shows a progress indicator updating through each stage (Fetching data → Computing metrics → Running LLM enrichment → Classifying). When complete, the stock appears in the universe table and the modal closes.

---

## Architecture: API-First Design

### Core endpoint: `POST /api/universe/stocks`

- **Auth:** authenticated session
- **Request body:** `{ ticker: string }`
- **Behaviour:** synchronous pipeline — runs all stages inline, returns when classification is complete
- **Response 200:** full stock object with `classificationState` (same shape as `GET /api/universe`)
- **Response 400:** `{ error: "invalid_ticker" }` — ticker blank or non-alphanumeric
- **Response 404:** `{ error: "ticker_not_found" }` — ticker not found in data providers (Tiingo lookup fails)
- **Response 409:** `{ error: "already_in_universe", ticker }` — stock already exists with `inUniverse = true`
- **Response 500:** `{ error: "pipeline_failed", stage, message }` — partial failure with stage name
- File: `src/app/api/universe/stocks/route.ts` (POST handler)

### Companion: `GET /api/universe/stocks/[ticker]`
Returns a single stock object (same shape as a row in `GET /api/universe`). Used to re-add a previously removed stock and confirm its classification post-add. Also useful for future programmatic lookups.
File: `src/app/api/universe/stocks/[ticker]/route.ts` (GET handler, alongside DELETE from STORY-055)

### Why synchronous (not async/polling)
A single stock pipeline takes approximately 15–30 seconds (dominated by the LLM enrichment call). Within that window:
- Synchronous with streaming progress events (SSE) is simpler than a polling job system
- No job queue, no persistence, no cleanup needed
- If the call fails at any stage, the error is returned directly with the failing stage name
- A future bulk-add story (10–100 tickers) would switch to async polling — STORY-056 deliberately stays synchronous to keep the implementation minimal

### Progress signalling: Server-Sent Events (SSE)

The frontend calls `POST /api/universe/stocks` but the response is streamed as SSE. Each pipeline stage emits a progress event before executing:

```
data: {"stage":"validate","label":"Validating ticker…","step":1,"total":8}
data: {"stage":"create_record","label":"Creating stock record…","step":2,"total":8}
data: {"stage":"fundamentals","label":"Fetching fundamentals…","step":3,"total":8}
data: {"stage":"estimates","label":"Fetching forward estimates…","step":4,"total":8}
data: {"stage":"metrics","label":"Computing metrics (ROIC, CAGRs, market cap)…","step":5,"total":8}
data: {"stage":"flags","label":"Computing deterministic flags…","step":6,"total":8}
data: {"stage":"enrichment","label":"Running LLM enrichment…","step":7,"total":8}
data: {"stage":"classification","label":"Classifying…","step":8,"total":8}
data: {"stage":"done","result":{...stock object...}}
```

On error:
```
data: {"stage":"error","failedStage":"enrichment","message":"LLM timeout"}
```

The SSE stream uses `Content-Type: text/event-stream`. The frontend uses the `EventSource` API (or a fetch-based SSE reader for POST requests, since `EventSource` only supports GET).

### Pipeline stages executed by `POST /api/universe/stocks`

| Step | Stage | Service called | Notes |
|------|-------|----------------|-------|
| 1 | validate | — | Check ticker format; check not already in universe |
| 2 | create_record | `prisma.stock.create` | `inUniverse: true`, minimal fields |
| 3 | fundamentals | `syncFundamentalsForTicker(ticker)` | Tiingo + FMP fundamentals |
| 4 | estimates | `syncForwardEstimatesForTicker(ticker)` | Forward estimates sync |
| 5 | metrics | `computeMetricsForTicker(ticker)` | Market cap, EV, ROIC, 3y CAGRs, share count growth |
| 6 | flags | `syncDeterministicFlagsForTicker(ticker)` | Calls `computeDeterministicFlags()` |
| 7 | enrichment | `runEnrichmentForTicker(ticker)` | LLM call — longest stage (~10–15s) |
| 8 | classification | `classifyTicker(ticker)` | Bucket/EQ/BS scoring, saves classificationState |

Each stage function already exists (built in EPIC-003/EPIC-003.1/EPIC-004) but operates on all in-universe stocks. STORY-056 adds a **single-ticker variant** of each, or passes a ticker filter to the existing batch functions where the architecture allows it.

### Re-adding a removed stock
If `stocks` row exists but `inUniverse = false` (previously removed via STORY-055):
- Skip `create_record` stage — set `inUniverse = true` instead
- Run all data + classification stages normally from stage 3
- Existing history preserved; new classification appended to `classificationHistory`

---

## Scope In
- "Add Stock" button in universe screen header
- Add Stock modal: ticker input field + submit button + progress indicator
- `POST /api/universe/stocks` with SSE streaming response
- `GET /api/universe/stocks/[ticker]` (single stock lookup)
- Single-ticker pipeline functions (thin wrappers around existing batch services)
- Re-add a previously removed stock (sets `inUniverse = true`, re-runs pipeline)
- Progress UI: step-by-step label + progress bar (step N of 8)
- On completion: modal closes, stock appears in universe table (table reloads or row appended)
- On error: modal shows error state with failing stage name + retry button

## Scope Out
- Bulk add (multiple tickers at once) — separate story
- Admin-only restriction — any authenticated user can add a stock
- Duplicate detection across users (universe is shared; if stock already in universe → 409)
- Offline / queued add (no job persistence — synchronous only)
- Validation against a predefined allowed-ticker list

## Dependencies
- Epic: EPIC-004
- Upstream: STORY-048 (universe screen — "Add Stock" button added to header)
- Upstream: STORY-020 (fundamentals sync service — single-ticker variant needed)
- Upstream: STORY-021 (forward estimates sync — single-ticker variant needed)
- Upstream: STORY-027 (market cap sync — single-ticker variant needed)
- Upstream: STORY-033 (deterministic flags — single-ticker variant needed)
- Upstream: STORY-038 (classification enrichment sync — single-ticker variant needed)
- Upstream: STORY-047 (classification batch job — single-ticker variant needed)
- Related: STORY-055 (remove stock — inverse; DELETE handler in same route file)

## Preconditions
- All data ingestion services operational (EPIC-003 ✅)
- LLM enrichment service operational (EPIC-003.1 ✅)
- Classification engine operational (EPIC-004 ✅)
- Authenticated user session

## Inputs
- Ticker string (user-entered, e.g. `"NVDA"`)

## Outputs
- Stock row created/updated in DB with `inUniverse = true`
- Full data populated via pipeline (fundamentals, estimates, metrics, flags, enrichment)
- `classificationState` computed and persisted
- Stock appears in universe screen table

## Acceptance Criteria
- [ ] "Add Stock" button visible in universe screen header
- [ ] Clicking "Add Stock" opens modal with ticker input
- [ ] Submitting a blank or invalid ticker → inline validation error; no API call
- [ ] Submitting valid ticker → SSE stream starts; progress indicator shows each stage label + step count
- [ ] LLM enrichment stage takes the longest — progress indicator must remain active (not time out)
- [ ] On completion → modal closes; stock appears in universe table with its 3AA code badge
- [ ] On `ticker_not_found` (404) → modal shows "Ticker not found in data providers" error
- [ ] On `already_in_universe` (409) → modal shows "This stock is already in your universe"
- [ ] On pipeline error → modal shows error with failing stage name + Retry button
- [ ] Re-adding a previously removed stock works: sets `inUniverse = true`, re-runs full pipeline, history preserved
- [ ] `GET /api/universe/stocks/[ticker]` returns stock object for any in-universe stock
- [ ] All pipeline stages complete successfully for benchmark tickers: ADBE, MSFT, TSLA, UBER, UNH

## Test Strategy
- **Unit tests:**
  - POST route: 400 for invalid ticker, 409 for duplicate, 404 for unknown ticker
  - Mock each pipeline stage; verify stages called in order
  - SSE output: verify `data:` events emitted for each stage
  - Re-add path: verify `inUniverse = true` update instead of create
  - Single-ticker variants of each pipeline service: unit-test with mock Prisma + mock providers
- **Integration / smoke test (benchmark stocks):**
  - Add each of the 5 benchmark stocks (ADBE, MSFT, TSLA, UBER, UNH) via the API
  - Verify classification results match expected codes (with tolerance for expected deviations)
  - Verify progress events emitted in correct order
- **Component tests:**
  - Add Stock modal: ticker input validation, progress bar stepping, done state, error state

## Regression / Invariant Risks
- **Existing universe data corrupted:** pipeline stages for a new stock must not touch other stocks' rows
- **Duplicate stock creation:** 409 guard prevents two rows for the same ticker
- **Pipeline partial failure:** if stage 5 fails after stage 3–4 have written data, the stock row exists but is incomplete; the API returns the failing stage and the UI shows retry — retry re-runs from stage 3

## Key Risks / Edge Cases
- **LLM timeout (>30s):** enrichment stage can timeout; route must handle gracefully and return `{ stage: "error", failedStage: "enrichment" }` — stock row will be in DB but unclassified; user can retry
- **Unknown ticker accepted by providers:** some tickers exist in Tiingo but have no fundamentals; pipeline should proceed but classification may land at low-confidence with missing fields
- **Re-add after partial pipeline:** if the stock row exists but `inUniverse = false` with partial data, re-add must re-run all stages from fundamentals, not skip to classification

## Definition of Done
- [ ] `POST /api/universe/stocks` with SSE streaming implemented and tested
- [ ] `GET /api/universe/stocks/[ticker]` implemented and tested
- [ ] Single-ticker pipeline stage functions implemented (or ticker-filtered batch calls)
- [ ] "Add Stock" button + modal implemented in universe screen
- [ ] Progress indicator steps through all 8 stages with correct labels
- [ ] All 3 error states implemented: invalid ticker, not found, pipeline failure
- [ ] Benchmark test: all 5 stocks (ADBE, MSFT, TSLA, UBER, UNH) successfully added via API
- [ ] Unit tests for route (400/404/409/500), SSE events, stage ordering
- [ ] Unit tests for each single-ticker service function
- [ ] Component tests for modal (input validation, progress, done, error)
- [ ] Traceability comments in all new files
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §Universe Management
- RFC: RFC-003 §Monitor List Management
- RFC: RFC-001 §Data Ingestion Pipeline (pipeline stages)
- Inverse operation: STORY-055 (Remove Stock from Universe)
