# STORY-032 — Share Count Growth (3-Year CAGR)

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
done ✅ (2026-04-21, unit_verified — 14/14 tests passing)

## Purpose
`share_count_growth_3y` is a required `FundamentalFields` input for RFC-001's classification engine and the sole source for `material_dilution_flag` (STORY-033). It is currently written by the nightly fundamentals sync using `weightedAverageShsOutDil` from FMP's annual income statement, but without a dedicated service, standalone admin route, or explicit method provenance.

**BC-032-001 (resolved as Path A 2026-04-21):** The story originally specified FMP's `/v3/historical-market-capitalization/{ticker}?limit=1500` for a `Math.round(marketCap / price)` derivation. Investigation confirmed: v3 endpoint is locked (legacy users only); stable equivalent returns only ~3 months of entries with no `price` field; all historical shares endpoints return `[]`. Path A adopted: use `weightedAverageShsOutDil` from the annual income statement as the authoritative and consistent source for both anchors.

**Consistency constraint satisfied:** Both `shares_current` (FY0) and `shares_3y_ago` (FY-3) come from `weightedAverageShsOutDil` in the same income statement response — same endpoint, same methodology. The original concern (mixing profile `sharesOutstanding` with income statement shares) does not apply.

## Story
As a **developer**,
I want **`share_count_growth_3y` computed from FMP's annual income statement using a consistent derivation for both current and 3-year-ago shares, with a standalone sync service and proper provenance** —
so that **the 3-year CAGR is internally consistent, `material_dilution_flag` in STORY-033 has a reliable input, and the sync can be run independently of the nightly fundamentals job**.

## Outcome
- `share_count_growth_3y` = `((shares_fy0 / shares_fy3) ^ (1/3)) - 1`
- Both anchors from `weightedAverageShsOutDil` in FMP annual income statement (`limit=5`, newest-first index 0 = FY0, index 3 = FY-3)
- Null if fewer than 4 annual entries or either anchor ≤ 0
- Provenance: `{ provider: "fmp", method: "income_statement_cagr", period_start, period_end, synced_at }`
- `period_start` = fiscal year end date of FY-3 entry; `period_end` = fiscal year end date of FY0 entry
- No schema migration needed (column already exists in RFC-002 schema)
- Income-statement write path removed from `buildUpdateFromFundamentals()` to prevent nightly overwrite

---

## BDD Scenarios

```
Feature: Share Count Growth (3-Year CAGR)

  Scenario: Positive CAGR (dilution)
    Given a stock with ≥4 annual income statement entries
    And share count has grown from FY-3 to FY0
    When computeShareCountGrowth3y is called with those entries
    Then it returns a positive decimal CAGR
    And period_start = FY-3 date, period_end = FY0 date

  Scenario: Negative CAGR (buyback)
    Given a stock with consistent share count reduction over 3 fiscal years
    When computeShareCountGrowth3y is called
    Then it returns a negative CAGR

  Scenario: Insufficient history — fewer than 4 annual entries
    Given a stock with only 3 annual income statement entries
    When computeShareCountGrowth3y is called
    Then it returns null
    And the sync service records the stock as skipped

  Scenario: shares_fy3 = 0 (implausible data guard)
    Given the FY-3 entry has weightedAverageShsOutDil = 0
    When computeShareCountGrowth3y is called
    Then it returns null

  Scenario: shares_fy0 = 0
    Given the FY0 entry has weightedAverageShsOutDil = 0
    When computeShareCountGrowth3y is called
    Then it returns null

  Scenario: Successful full sync run
    Given computeShareCountGrowth3y returns a valid CAGR for a stock
    When syncShareCount runs
    Then share_count_growth_3y is written to the DB
    And provenance includes provider=fmp, method=income_statement_cagr,
        period_start (FY-3 date), period_end (FY0 date), synced_at

  Scenario: 402 from income statement endpoint
    Given FMP returns 402 for the income statement endpoint
    When fetchAnnualShareCounts is called
    Then it returns []
    And the sync service records the stock as skipped

  Scenario: Admin route — authenticated call
    Given a valid ADMIN_API_KEY in the request header
    When POST /api/admin/sync/share-count is called
    Then the sync runs and returns { updated, skipped, errors } with HTTP 200

  Scenario: Admin route — unauthenticated call
    Given no or invalid ADMIN_API_KEY
    When POST /api/admin/sync/share-count is called
    Then the response is HTTP 401
```

---

## Test Plan

| Layer | File | Tests | Coverage |
|-------|------|-------|----------|
| Unit | `tests/unit/data-ingestion/story-032-share-count-growth.test.ts` | 14 | fetchAnnualShareCounts (3), computeShareCountGrowth3y (6), ShareCountSyncService (3), admin route (2) |
| Regression update | `tests/unit/data-ingestion/story-029-growth-cagrs.test.ts` | update 1 assertion | share_count_growth_3y → null from FMP adapter |
| Regression check | `tests/unit/data-ingestion/fmp.adapter.test.ts` | update if present | share_count_growth_3y → null |
| Integration (optional) | Smoke test — live AAPL call | 1 | Marked `@smoke`; excluded from CI; not a completion gate |

All unit test fixtures: **synthetic** (no live API calls).

---

## Scope In

### TASK-032-001 — Validate FMP Endpoint Access
**Status:** done
**Result:** BC-032-001 — historical market cap endpoint unusable. Path A adopted.
See implementation log entry 2026-04-21.

---

### TASK-032-002 — Extend ProvenanceEntry Type + FMPAdapter.fetchAnnualShareCounts()
**Status:** ready

**Files:**
- `src/modules/data-ingestion/types.ts` — extend `ProvenanceEntry`:
  ```typescript
  method?: string;        // e.g. "income_statement_cagr", "sector_rule", "sic_code"
  period_start?: string;  // ISO date string — start anchor of computation window
  fallback_used?: boolean; // was required; make optional (backward-compatible)
  ```
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — add:
  ```typescript
  // EPIC-003: STORY-032: TASK-032-002
  async fetchAnnualShareCounts(ticker: string): Promise<{ date: string; shares: number }[]>
  ```
  - Calls `/income-statement?symbol={ticker}&period=annual&limit=5` (same path as `fetchFundamentals`)
  - Extracts `{ date: string(item.date), shares: Number(item.weightedAverageShsOutDil) }` per entry
  - Filters entries where `weightedAverageShsOutDil` is null, undefined, or ≤ 0
  - Returns array sorted newest-first (FMP returns descending — enforce sort defensively)
  - 402 or null response → return `[]`

**Regression:** All existing callers of `ProvenanceEntry` still compile — making `fallback_used` optional is backward-compatible since all callers set it explicitly.

**DoD:**
- [ ] `ProvenanceEntry` extended; all existing files compile without new errors
- [ ] `fetchAnnualShareCounts()` implemented; 402 → `[]`

---

### TASK-032-003 — Implement computeShareCountGrowth3y() Pure Utility Function
**Status:** ready

**Files:**
- `src/modules/data-ingestion/utils/share-count-growth.ts` (new)

```typescript
// EPIC-003: STORY-032: TASK-032-003

export interface ShareCountGrowthResult {
  growth: number;      // decimal CAGR, e.g. -0.04 = -4% annualized
  periodStart: string; // ISO date of FY-3 entry
  periodEnd: string;   // ISO date of FY0 entry
}

export function computeShareCountGrowth3y(
  entries: { date: string; shares: number }[], // newest-first, annual
): ShareCountGrowthResult | null
```

Logic:
- Returns null if `entries.length < 4`
- `current = entries[0]`; `threeYearsAgo = entries[3]`
- Returns null if `current.shares <= 0` or `threeYearsAgo.shares <= 0`
- `growth = Math.pow(current.shares / threeYearsAgo.shares, 1/3) - 1`
- No external dependencies; no imports beyond built-ins

**DoD:**
- [ ] Pure function created; all null conditions handled; no external dependencies

---

### TASK-032-004 — Implement ShareCountSyncService
**Status:** ready

**Files:**
- `src/modules/data-ingestion/jobs/share-count-sync.service.ts` (new)

```typescript
// EPIC-003: STORY-032: TASK-032-004
export interface ShareCountSyncResult {
  updated: number;
  skipped: number;
  errors: number;
}

export async function syncShareCount(
  fmpAdapter: FMPAdapter,
): Promise<ShareCountSyncResult>
```

Per stock:
1. `fmpAdapter.fetchAnnualShareCounts(ticker)`
2. `computeShareCountGrowth3y(entries)`
3. Null → `skipped++`; no DB write
4. Throws → `errors++`; log structured JSON; continue (never abort run)
5. Result → `prisma.stock.update`:
   - `shareCountGrowth3y: result.growth`
   - Provenance merge: spread existing `dataProviderProvenance` JSONB, overwrite `share_count_growth_3y` key:
     `{ provider: 'fmp', method: 'income_statement_cagr', period_start: result.periodStart, period_end: result.periodEnd, synced_at: new Date().toISOString() }`

Reads in-universe stocks: `prisma.stock.findMany({ where: { inUniverse: true }, select: { ticker: true } })`.

**DoD:**
- [ ] Service never aborts on per-stock error
- [ ] Provenance merge spreads existing JSONB; only `share_count_growth_3y` key overwritten

---

### TASK-032-005 — Remove Income-Statement share_count_growth_3y from Fundamentals Sync
**Status:** ready | **Depends on:** TASK-032-004 (replacement must exist first)

**Files:**
- `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts`:
  - Remove the `shareCountGrowth3y` write block from `buildUpdateFromFundamentals()`
- `src/modules/data-ingestion/adapters/fmp.adapter.ts`:
  - Remove dead variables: `shares0`, `shares3`, `shareCountGrowth3y` computation block
  - Set `share_count_growth_3y: null` in `fetchFundamentals()` return object
- `src/modules/data-ingestion/types.ts`:
  - Update `FundamentalData.share_count_growth_3y` JSDoc: "Always null from FMP adapter after STORY-032. Authoritative source: ShareCountSyncService."

**Tests to update in this task:**
- `tests/unit/data-ingestion/story-029-growth-cagrs.test.ts`: update `share_count_growth_3y` assertion to `null`
- `tests/unit/data-ingestion/fmp.adapter.test.ts`: update any `share_count_growth_3y` assertion to `null`

**DoD:**
- [ ] `buildUpdateFromFundamentals()` no longer writes `shareCountGrowth3y`
- [ ] Dead computation block removed from `fmp.adapter.ts`
- [ ] Affected test assertions updated; full unit suite passes

---

### TASK-032-006 — Admin Route POST /api/admin/sync/share-count
**Status:** ready | **Depends on:** TASK-032-004

**Files:**
- `src/app/api/admin/sync/share-count/route.ts` (new file, new directory)

Auth: `validateAdminApiKey(req)` from `@/lib/admin-auth` → 401 on failure.
Success: `syncShareCount(new FMPAdapter())` → JSON + 200.
Error: catch → `{ error: 'Internal server error' }` + 500.

**DoD:**
- [ ] 401 on missing/invalid key; 200 with `ShareCountSyncResult` on success

---

### TASK-032-007 — Unit Tests
**Status:** ready | **Depends on:** TASK-032-002 through TASK-032-006

**New file:** `tests/unit/data-ingestion/story-032-share-count-growth.test.ts`

```
describe('EPIC-003/STORY-032: Share Count Growth')
```

FMPAdapter.fetchAnnualShareCounts() — 3 tests:
1. Normal 5-entry response → 4 valid entries (zero-shares entry filtered), newest-first
2. Empty/null API response → `[]`
3. 402 (fmpFetch returns null) → `[]`

computeShareCountGrowth3y() — 6 tests:
1. Positive CAGR (dilution): correct value; correct period_start / period_end
2. Negative CAGR (buyback): correct negative value
3. Fewer than 4 entries → null
4. `entries[3].shares = 0` → null
5. `entries[0].shares = 0` → null
6. Exactly 4 entries with valid data → non-null result

ShareCountSyncService — 3 tests (mocked prisma + adapter):
1. Valid result → `prisma.stock.update` called; correct `shareCountGrowth3y` and provenance shape
2. Null result → no DB update; `skipped` incremented
3. Adapter throws → `errors` incremented; next stock still processed

Admin route — 2 tests:
1. Valid ADMIN_API_KEY → 200 with `{ updated, skipped, errors }`
2. No ADMIN_API_KEY → 401

All fixtures: **synthetic**.

**DoD:**
- [ ] 14 new tests passing
- [ ] story-029 assertion confirmed passing after TASK-032-005 update
- [ ] No existing tests broken

---

## Acceptance Criteria
- [ ] Both share count anchors come from `weightedAverageShsOutDil` in the annual income statement
- [ ] Null result when fewer than 4 annual entries or either anchor ≤ 0
- [ ] Provenance records `method: "income_statement_cagr"`, `period_start`, `period_end`
- [ ] Admin route uses existing admin auth middleware
- [ ] Income-statement write path removed from nightly fundamentals sync
- [ ] Unit tests passing

## Dependencies
- STORY-027 (shares_outstanding pipeline exists; NOT used as input here)
- STORY-029 (income-statement CAGR already computed; write path removed by TASK-032-005)
- EPIC-002 admin route auth pattern (`validateAdminApiKey`)
