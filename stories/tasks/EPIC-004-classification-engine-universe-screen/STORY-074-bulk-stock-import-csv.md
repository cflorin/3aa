# STORY-074 — Bulk Stock Import via CSV

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Allow a user to add many stocks at once by uploading a CSV file (1–500 tickers). The full
10-stage pipeline runs asynchronously per ticker in the background. The UI shows a live job
progress table that updates via polling so the user can track completions and failures without
leaving the page.

This extends the existing single-ticker "Add Stock" flow (STORY-056) rather than replacing it.
The modal gains a second mode; the single-ticker SSE path is unchanged.

## Story
As a user,
I want to upload a CSV of ticker symbols and add them all to my universe in one operation,
so that I can build a large watchlist quickly without adding stocks one at a time.

## Outcome
The "Add Stock" button is relabelled "Add Stocks". Clicking it opens the existing modal in
single-ticker mode, with a new "Bulk CSV" tab next to it. The Bulk CSV tab accepts a
.csv or .txt file (one ticker per row), previews the parsed list, and submits it.
On submit the server creates a persistent job record plus one task per ticker, then begins
processing tasks in the background. The modal transitions to a live progress table showing
per-ticker status. The user can close the modal and return; the job is still accessible
via a "Bulk Import" status indicator in the universe screen header.

---

## Architecture

### Core data model — two new tables

#### `BulkImportJob`
Represents a single CSV upload. Written on submit, updated atomically as tasks complete.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| createdBy | String | userId (FK → users) |
| status | Enum | `pending \| running \| complete \| partial_failure \| failed` |
| totalCount | Int | number of tickers parsed from CSV |
| pendingCount | Int | tasks not yet started |
| processingCount | Int | tasks currently in-flight |
| doneCount | Int | tasks completed successfully |
| failedCount | Int | tasks that errored out |
| skippedCount | Int | tickers already in universe at submit time |
| createdAt | DateTime | |
| startedAt | DateTime? | first task picked up |
| completedAt | DateTime? | all tasks finished |

#### `BulkImportTask`
One row per ticker per job. The queue the worker consumes.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| jobId | UUID | FK → BulkImportJob |
| ticker | String | upper-cased, 1–10 chars |
| status | Enum | `pending \| processing \| done \| failed \| skipped` |
| resultCode | String? | 3AA classification code on success, e.g. `4AA` |
| errorMessage | String? | last error string on failure |
| attempts | Int | default 0; incremented on each attempt |
| startedAt | DateTime? | |
| completedAt | DateTime? | |

**Key constraint:** `(jobId, ticker)` must be unique — duplicate tickers within a CSV are
deduplicated at parse time.

---

### API routes

#### `POST /api/universe/bulk-import`
Accepts a multipart/form-data upload containing the CSV file.

**Request:** `multipart/form-data` with field `file` (CSV/TXT ≤ 2 MB).

**Server logic:**
1. Auth check — 401 if no valid session.
2. Parse file: split on newlines, strip whitespace and quotes, skip blank/header rows,
   upper-case, validate each token against `TICKER_RE` (`/^[A-Z0-9.]{1,10}$/i`),
   discard invalid tokens (tracked as `invalidTickers` in response).
3. Deduplicate: unique tickers only; count duplicates removed.
4. Look up which tickers are already `inUniverse = true` → mark those tasks `skipped`.
5. If 0 valid new tickers remain → return 400 `{ error: "no_valid_tickers" }`.
6. Create `BulkImportJob` + one `BulkImportTask` per new ticker (status `pending`).
7. Fire-and-forget: trigger `POST /api/cron/bulk-import-worker` with `jobId` in the body
   (internal call, not awaited — lets the worker start immediately without waiting for
   Cloud Scheduler).
8. Return `201 { jobId, totalCount, skippedCount, invalidTickers }`.

**Limits:**
- Max 500 tickers per upload → 400 `{ error: "too_many_tickers", count }`.
- Max file size 2 MB → 400 `{ error: "file_too_large" }`.

---

#### `GET /api/universe/bulk-import/[jobId]`
Returns current job status plus task list for polling.

**Response 200:**
```json
{
  "jobId": "...",
  "status": "running",
  "totalCount": 50,
  "pendingCount": 32,
  "processingCount": 1,
  "doneCount": 14,
  "failedCount": 3,
  "skippedCount": 0,
  "createdAt": "...",
  "startedAt": "...",
  "completedAt": null,
  "tasks": [
    { "ticker": "NVDA", "status": "done",    "resultCode": "6AA", "errorMessage": null },
    { "ticker": "TSLA", "status": "done",    "resultCode": "3CA", "errorMessage": null },
    { "ticker": "FAKE", "status": "failed",  "resultCode": null,  "errorMessage": "Ticker FAKE not found." },
    { "ticker": "MSFT", "status": "skipped", "resultCode": null,  "errorMessage": "Already in universe." },
    ...
  ]
}
```

**Response 404:** job not found or does not belong to current user.

---

#### `POST /api/cron/bulk-import-worker`
The background processor. Called by Cloud Scheduler (every 1 minute) and by
`POST /api/universe/bulk-import` immediately after job creation (fire-and-forget).

**Auth:** Cloud Scheduler OIDC token (same pattern as other cron routes) OR internal
bearer token when called from the upload handler.

**Behaviour:**
1. Pick up the oldest `pending` task across all jobs (order by job `createdAt` ASC,
   then task `createdAt` ASC).
2. Atomically set task `status = processing` (optimistic lock: only update if still
   `pending` — prevents double-processing in concurrent invocations).
3. Run the full 10-stage pipeline for that ticker (reuse existing
   `syncFundamentals`, `syncForwardEstimates`, `syncMarketCapAndMultiples`,
   `syncShareCount`, `syncQuarterlyHistory`, `computeDerivedMetricsBatch`,
   `computeTrendMetricsBatch`, `syncDeterministicClassificationFlags`,
   `syncClassificationEnrichment`, `runClassificationBatch` — same as
   `POST /api/universe/stocks`).
4. On success: set task `status = done`, `resultCode` from classification, update
   job `doneCount++`, `pendingCount--`.
5. On failure: set task `status = failed` (or back to `pending` if `attempts < 2`
   for automatic retry up to 2 times), `errorMessage`, update job counters.
6. **Budget:** loop steps 1–5 until no more `pending` tasks exist for any running job
   OR 8 minutes have elapsed (safety margin vs Cloud Run's configurable timeout).
7. After each task, update job `status`:
   - All done/skipped/failed → `complete` or `partial_failure` (failed > 0).
   - Otherwise → `running`.
8. Return `200 { processed: N, remaining: M }`.

**Idempotency:** Multiple concurrent invocations are safe because of the optimistic lock
in step 2. At most one worker processes any given task.

**Retry policy:** tasks with `attempts < 2` and `status = failed` are reset to `pending`
by the worker before moving on. Third failure is terminal (`status = failed` permanently).

---

#### `GET /api/universe/bulk-import` (list endpoint)
Returns all bulk import jobs for the current user, newest first (last 20 jobs).
Used to re-open a job progress view after modal close.

**Response 200:** `{ jobs: [ { jobId, status, totalCount, doneCount, failedCount, createdAt } ] }`

---

### Frontend changes

#### Modal — two tabs

`AddStockModal.tsx` gains a tab selector at the top: **Single** | **Bulk CSV**.

- **Single tab:** existing SSE flow, completely unchanged (STORY-056 behaviour preserved).
- **Bulk CSV tab:** new mode described below.

Tab state is local to the modal; switching tabs resets the respective form.

#### Bulk CSV tab — idle state

- Drag-and-drop zone (or "click to browse") accepting `.csv`, `.txt`.
- After file selected: parse client-side to extract tickers, show preview:
  - "N tickers found"
  - First 10 tickers listed (truncated if more)
  - Warning if any lines were invalid (shown as count, not enumerated)
- "Upload & Start Import" button (disabled while no file).
- "Cancel" button.

File size validated client-side before upload (max 2 MB).

#### Bulk CSV tab — submitting state

Replaces the form with a minimal spinner: "Uploading N tickers…"

#### Bulk CSV tab — progress state (after jobId received)

The modal expands to show a live progress table:

```
Importing 50 stocks — 14 done  3 failed  32 pending
[============================        ] 28%

TICKER   STATUS        CODE    ERROR
──────────────────────────────────────
NVDA     ✓ done        6AA
TSLA     ✓ done        3CA
FAKE     ✗ failed      —       Ticker not found
MSFT     ↷ skipped     —       Already in universe
AMZN     ⏳ pending    —
...
```

- Table sorted: failed → done → processing → pending.
- Max 20 rows visible; scrollable if more.
- Progress bar: `doneCount + failedCount + skippedCount / totalCount`.
- Polling interval: 3 seconds via `setInterval`.
- When `job.status === 'complete'` or `'partial_failure'`:
  - Polling stops.
  - Summary shown: "Import complete — X added, Y failed, Z skipped."
  - "Close" button (which calls `onAdded` for each done task so the universe table refreshes).
  - "Retry Failed" button (if failedCount > 0) — calls new `POST /api/universe/bulk-import/[jobId]/retry`
    which resets all failed tasks back to pending and re-triggers the worker.

#### Persistent job indicator in header

While any job has `status = 'running'` or `'pending'`, a compact indicator appears in the
universe screen header next to the "Add Stocks" button:

```
[Import in progress — 14/50 ✓]
```

Clicking it re-opens the progress modal for the active job. Disappears when job is complete.

---

#### `POST /api/universe/bulk-import/[jobId]/retry`
Resets all `failed` tasks in the job back to `pending`, re-triggers the worker.
Returns 200 with updated job summary.

---

### CSV format spec

```
# Supported formats — all of the following are accepted:

# One column, no header:
NVDA
MSFT
TSLA

# One column, with header (detected by first row failing TICKER_RE):
Ticker
NVDA
MSFT

# Multi-column — only first column read, rest ignored:
NVDA,Technology,Large Cap
MSFT,Technology,Large Cap

# Quoted:
"NVDA","Technology"
"MSFT"

# Mixed blank lines and whitespace: ignored silently
```

Max 500 tickers per file. Duplicates deduplicated silently (count reported back).
Invalid tokens (fail `TICKER_RE`) counted and reported in the upload response but do not
fail the upload.

---

## Scope In
- Two-tab modal: Single Ticker (unchanged) + Bulk CSV (new)
- CSV parse: client-side preview + server-side authoritative parse
- `BulkImportJob` + `BulkImportTask` DB tables (Prisma migration)
- `POST /api/universe/bulk-import` — upload, parse, create job
- `GET /api/universe/bulk-import/[jobId]` — polling status endpoint
- `POST /api/cron/bulk-import-worker` — background processor
- `GET /api/universe/bulk-import` — list recent jobs (for re-open)
- `POST /api/universe/bulk-import/[jobId]/retry` — reset failed tasks
- Progress table in modal: per-ticker status, result code, error message
- Persistent header indicator while job is running
- Retry up to 2 automatic attempts per ticker; manual retry button for terminal failures
- Automatic deduplication within CSV; already-in-universe tickers marked skipped
- Button relabel: "Add Stock" → "Add Stocks"

## Scope Out
- Cancelling an in-progress job (future story — non-trivial due to running pipeline stages)
- User-level job isolation (all jobs visible to the user who created them; admin can see all)
- Webhooks / push notifications on completion (future story)
- Streaming progress per-ticker via SSE (polling is sufficient for bulk; SSE per-task adds complexity)
- Rate-limiting per user (future story; current scope: one active job per user at a time enforced by 409)
- Scheduled / recurring imports (future story)

## Dependencies
- STORY-056 (Add Stock — single-ticker pipeline, reused by worker)
- STORY-004 (Prisma schema — migration needed for two new tables)
- STORY-007 (Cloud Scheduler — worker endpoint added as 8th job)
- STORY-048 (Universe screen header — "Add Stocks" button)
- All data ingestion services (EPIC-003 ✅)
- LLM enrichment service (EPIC-003.1 ✅)
- Classification engine (EPIC-004 ✅)

## Preconditions
- Full 10-stage pipeline operational for single tickers
- Cloud Scheduler configured (can add a new 1-minute job)
- Authenticated user session

---

## BDD Scenarios

### Scenario 1 — Happy path: small CSV uploaded successfully

```
Given I am on the universe screen
  And I click "Add Stocks"
  And I click the "Bulk CSV" tab
When I upload a CSV with 3 valid tickers: NVDA, AMD, INTC
Then the client preview shows "3 tickers found"
When I click "Upload & Start Import"
Then the server creates a BulkImportJob with totalCount=3, status=pending
  And returns a jobId immediately (< 1 second)
  And the modal shows the progress table with 3 rows in "pending" status
When the worker processes each ticker
Then each row transitions: pending → processing → done
  And each done row shows the classification code (e.g. "6BA")
  And the progress bar advances
When all 3 tasks are done
Then job.status = "complete"
  And the modal shows "Import complete — 3 added, 0 failed, 0 skipped"
  And the universe table now contains NVDA, AMD, and INTC
```

### Scenario 2 — Partial failure: one ticker not found

```
Given I upload a CSV containing: NVDA, FAKEXYZ123, AMD
When the worker processes FAKEXYZ123
Then the FMP metadata call returns null
  And the task status = "failed", errorMessage = "Ticker FAKEXYZ123 not found..."
  And after 2 retry attempts, status remains "failed"
When the other tickers complete
Then job.status = "partial_failure"
  And the modal shows "Import complete — 2 added, 1 failed, 0 skipped"
  And the "Retry Failed" button is visible
When I click "Retry Failed"
Then the FAKEXYZ123 task is reset to pending
  And the worker re-attempts it
```

### Scenario 3 — Already-in-universe tickers are skipped

```
Given MSFT is already in my universe
When I upload a CSV containing: MSFT, NVDA
Then the upload response includes skippedCount=1, totalCount=1
  And the BulkImportJob has totalCount=1 (new tickers only)
  And the progress table shows:
    MSFT  ↷ skipped  Already in universe
    NVDA  ⏳ pending
When the worker processes NVDA
Then job.status transitions to complete with doneCount=1
```

### Scenario 4 — CSV with invalid tokens

```
Given I upload a CSV with:
  NVDA
  123 INVALID TICKER
  MSFT
  (blank line)
Then the client-side preview shows "2 valid tickers found, 1 invalid line ignored"
When I submit
Then the server parses 2 valid tickers: NVDA, MSFT
  And returns invalidTickers=["123 INVALID TICKER"] in the response
  And creates a job with totalCount=2
```

### Scenario 5 — File too large

```
Given I select a CSV file that is 3 MB
Then the client-side validation immediately shows "File too large (max 2 MB)"
  And no upload request is sent
```

### Scenario 6 — Over 500 tickers

```
Given I upload a CSV with 600 valid tickers
When the server parses the file
Then it returns 400 { error: "too_many_tickers", count: 600 }
  And no job is created
  And the modal shows "CSV contains 600 tickers. Maximum is 500."
```

### Scenario 7 — Re-opening progress after modal close

```
Given a bulk import job is in status "running" with 20/50 tickers done
When I close the modal
Then the universe screen header shows "Import in progress — 20/50 ✓"
When I click the indicator
Then the modal re-opens showing the live progress table for that job
  And polling resumes from the current state
```

### Scenario 8 — Worker idempotency under concurrent invocations

```
Given Cloud Scheduler fires two concurrent calls to POST /api/cron/bulk-import-worker
When both workers attempt to pick up the same pending task
Then the optimistic lock ensures only one worker sets status=processing
  And the other worker skips that task and picks the next pending one
  And no ticker is processed twice
```

### Scenario 9 — Single-ticker flow is unchanged

```
Given I click "Add Stocks"
When the modal opens
Then the "Single" tab is selected by default
  And the ticker input is focused
  And behaviour is identical to STORY-056
```

---

## Task Breakdown

### TASK-074-001 — Prisma migration: BulkImportJob + BulkImportTask tables
- Add `BulkImportJob` and `BulkImportTask` models to `schema.prisma`
- Add enums: `BulkImportJobStatus`, `BulkImportTaskStatus`
- Run `prisma migrate dev` — migration file in `prisma/migrations/`
- Update `prisma/seed.ts` if needed
- **Files:** `prisma/schema.prisma`, new migration file
- **Tests:** migration applies cleanly; schema types generated

### TASK-074-002 — CSV parse utility
- `src/modules/bulk-import/utils/csv-parser.ts`
- `parseCsvTickers(text: string): { valid: string[], invalid: string[], duplicates: number }`
- Handles: single-column, multi-column (first col only), quoted fields, blank lines, header detection
- 500-ticker cap enforced
- **Tests:** `tests/unit/modules/bulk-import/csv-parser.test.ts`

### TASK-074-003 — `POST /api/universe/bulk-import` route
- `src/app/api/universe/bulk-import/route.ts`
- Parse multipart form, call csv-parser, DB writes, fire-and-forget worker trigger
- Returns `{ jobId, totalCount, skippedCount, invalidTickers }`
- Error cases: 400 (no_valid_tickers, too_many_tickers, file_too_large), 401 (unauth)
- **Tests:** `tests/unit/api/bulk-import.route.test.ts` — all error paths + happy path with mocked DB

### TASK-074-004 — `GET /api/universe/bulk-import/[jobId]` + `GET /api/universe/bulk-import` routes
- `src/app/api/universe/bulk-import/[jobId]/route.ts`
- `src/app/api/universe/bulk-import/route.ts` (GET handler added to same file as POST)
- Include full task list in jobId response; include only summaries in list response
- 404 if jobId not found or belongs to different user
- **Tests:** 200 response shape, 404 for unknown job, 404 for other user's job

### TASK-074-005 — `POST /api/cron/bulk-import-worker` route
- `src/app/api/cron/bulk-import-worker/route.ts`
- Auth: Cloud Scheduler OIDC + internal bearer token
- Core loop: pick next pending task → atomically set processing → run 10-stage pipeline → update status
- 8-minute budget with elapsed-time guard
- Automatic retry up to 2 attempts (reset to pending on transient errors)
- Atomic job counter updates using `prisma.$transaction`
- **Tests:** `tests/unit/api/bulk-import-worker.route.test.ts`
  - processes single task to done
  - handles pipeline failure → task marked failed, attempt incremented
  - second failure → second attempt, third → terminal
  - idempotency: task already `processing` is not picked up again
  - budget guard: stops after 8-minute elapsed

### TASK-074-006 — `POST /api/universe/bulk-import/[jobId]/retry` route
- `src/app/api/universe/bulk-import/[jobId]/retry/route.ts`
- Resets `failed` tasks to `pending`, resets `failedCount`/`pendingCount`, re-triggers worker
- **Tests:** resets correct tasks, does not touch done/skipped tasks, 404 for wrong user

### TASK-074-007 — `AddStockModal.tsx` bulk CSV tab
- Add tab selector: "Single" | "Bulk CSV"
- Single tab: existing JSX unchanged (STORY-056 behaviour preserved)
- Bulk CSV tab: file picker + drag-drop zone + client-side preview + submit
- After submit: progress table with 3s polling, progress bar, per-ticker rows
- Completed state: summary + Close + Retry Failed
- Header indicator component (extracted as `BulkImportIndicator.tsx`)
- Relabel "Add Stock" button to "Add Stocks"
- **`data-testid` attributes:**
  - `tab-single`, `tab-bulk-csv`
  - `bulk-file-input`, `bulk-preview-count`, `bulk-preview-invalid-count`
  - `bulk-submit-btn`, `bulk-progress-table`, `bulk-task-row-{ticker}`
  - `bulk-task-status-{ticker}`, `bulk-task-code-{ticker}`
  - `bulk-summary`, `bulk-retry-failed-btn`, `bulk-close-btn`
  - `bulk-import-indicator` (header)
- **Tests:** `tests/unit/components/BulkImportModal.test.tsx`

### TASK-074-008 — `UniversePageClient.tsx` — header indicator integration
- Add `BulkImportIndicator` to header
- On mount: `GET /api/universe/bulk-import` to check for active jobs
- If active job found, show indicator; clicking opens modal at progress state
- Relabel button

### TASK-074-009 — Cloud Scheduler job registration
- Update `stories/tasks/EPIC-001-platform-foundation/STORY-003-provision-gcp-infrastructure.md`
  to document the 8th scheduled job: `bulk-import-worker` at `* * * * *` (every 1 minute)
- Update `cloudbuild.yaml` / deployment notes
- **Note:** the fire-and-forget from the upload handler means the scheduler is only a fallback
  for jobs that don't complete in a single worker invocation

### TASK-074-010 — Integration test: end-to-end bulk import
- `tests/integration/bulk-import.test.ts`
- Upload a 3-ticker CSV against the test DB
- Verify job created, worker processes all tasks, universe stocks created
- Verify retry logic for a simulated failure

---

## Acceptance Criteria

- [ ] "Add Stocks" button visible in universe screen header
- [ ] Modal opens with "Single" tab selected by default; existing single-ticker flow unchanged
- [ ] "Bulk CSV" tab: file picker + drag-drop zone accepts .csv and .txt files
- [ ] Client-side preview: shows valid ticker count, truncated preview list, invalid count
- [ ] Client-side validation: rejects files > 2 MB before upload
- [ ] Upload returns jobId within 1 second (job creation is fast; processing is async)
- [ ] Progress table appears after jobId received; polls every 3 seconds
- [ ] Each ticker row shows current status with appropriate icon and result code on completion
- [ ] Progress bar advances as doneCount + failedCount + skippedCount increases
- [ ] Already-in-universe tickers shown as "skipped" immediately (not queued for pipeline)
- [ ] Invalid tickers from CSV reported in upload response; not queued
- [ ] Maximum 500 tickers enforced; 400 returned with descriptive error if exceeded
- [ ] Worker processes tasks with up to 2 automatic retries on transient failures
- [ ] Terminal failures (3 attempts) remain failed permanently; shown in progress table
- [ ] "Retry Failed" button resets terminal failures and re-triggers worker
- [ ] Closing modal does not cancel the job; header indicator appears while job is running
- [ ] Clicking header indicator re-opens progress modal for the active job
- [ ] On complete: universe table contains all successfully added stocks
- [ ] Worker is idempotent: concurrent invocations do not double-process any task

## Test Strategy

**Unit tests (TASK-074-002 through TASK-074-007):**
- CSV parser: all format variants, 500-ticker cap, deduplication, empty input
- Upload route: all 400/401/409 paths; happy path with mocked DB and fire-and-forget
- Worker route: task lifecycle (pending→processing→done/failed), retry logic, budget guard, idempotency
- Retry route: resets correct tasks, preserves done/skipped
- Modal component: tab switching, file drag-drop, preview, progress table polling, completed state, retry button

**Integration test (TASK-074-010):**
- Full end-to-end against test DB with live (or lightly stubbed) pipeline services
- 3-ticker upload → worker runs → all tasks done → stocks in universe

**Regression:**
- Existing single-ticker modal tests (`tests/unit/components/AddStockModal.test.tsx`) must still pass unchanged

## Key Risks / Edge Cases

- **LLM rate limits:** processing 100 stocks × 1 enrichment call each may hit Claude API rate limits.
  The worker's serial processing naturally limits throughput; add a `sleep(500)` between tasks if
  rate limit errors are observed. This is an operational concern, not a design failure.
- **Cloud Run timeout vs job duration:** the worker runs within an 8-minute budget per invocation.
  For jobs larger than ~8 stocks (at ~60s/stock), multiple Cloud Scheduler ticks will be needed.
  Cloud Scheduler's 1-minute minimum means 100 stocks ≈ 13 scheduler ticks ≈ 13 minutes minimum.
- **Duplicate CSV uploads:** if the user uploads the same CSV twice, the second upload attempts to
  create tasks for tickers already `inUniverse = true` (from the first import that completed).
  Those tickers are skipped (409 logic reused from single-ticker path) → `skippedCount` increases.
- **Partial pipeline failure leaving orphan stock row:** same as STORY-056; the stock row exists
  but is unclassified. The task is marked failed and the retry path re-runs the full pipeline.
- **Worker dies mid-task:** Cloud Run instance crashes while task is `processing`. On next worker
  invocation, the task is still `processing`. The worker will not pick it up (status ≠ pending).
  To recover: add a "stale task" cleanup in the worker — any task in `processing` for > 10 minutes
  is reset to `pending`.

## Definition of Done

- [ ] TASK-074-001: Migration applied; `BulkImportJob` and `BulkImportTask` tables in DB
- [ ] TASK-074-002: `csv-parser.ts` with unit tests passing
- [ ] TASK-074-003: Upload route with all error paths tested
- [ ] TASK-074-004: Status polling routes with 200/404 tested
- [ ] TASK-074-005: Worker route with lifecycle, retry, budget, idempotency tested
- [ ] TASK-074-006: Retry route tested
- [ ] TASK-074-007: Modal component with all `data-testid` attributes and component tests passing
- [ ] TASK-074-008: Header indicator wired up; active job re-openable
- [ ] TASK-074-009: Cloud Scheduler job documented and deployed
- [ ] TASK-074-010: Integration test passes against test DB
- [ ] Existing single-ticker modal tests unchanged and passing
- [ ] Traceability comments in all new files (`// EPIC-004: ... STORY-074: ...`)
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- Extends: STORY-056 (Add Stock to Universe — single-ticker pipeline reused)
- PRD: `docs/prd/PRD.md` §Universe Management
- RFC: RFC-003 §Monitor List Management
- Infrastructure: STORY-003 (Cloud Scheduler — new worker cron job)
- Schema: STORY-004 (Prisma — new tables via migration)
