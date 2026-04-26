# STORY-088: Quarterly Tab — Three Bug Fixes

**Epic:** EPIC-004 — Classification Engine & Universe Screen
**Status:** done
**Priority:** P0 (Bug 3 critical), P2 (Bugs 1–2 UX

---

## Background

Three bugs discovered in Stock Detail > Quarterly tab (2026-04-26):

1. **BUG-001 (UX):** Dollar values displayed without thousands separators (`$62020M` instead of `$62,020M`)
2. **BUG-002 (UX):** EQ Trend Score shows a raw decimal with no explanation of what it means
3. **BUG-003 (Critical):** Each quarter appeared twice because the API route did not filter by `sourceProvider` — the DB stores one row per `(ticker, fiscalYear, fiscalQuarter, sourceProvider)`, so stocks synced from both FMP and Tiingo had both rows returned, filling the `take: 8` limit with only 4 real quarters

---

## Root Cause Analysis

### BUG-001: No thousands separators
`StockDetailClient.tsx` line 969 used `.toFixed(0)` on raw integer:
```typescript
const fmtM = (v: number | null) => `$${(v / 1_000_000).toFixed(0)}M`;
// 62_020_000_000 → "$62020M" ❌
```
TTM B-values used `.toFixed(2)` without locale:
```typescript
`$${(v / 1_000_000_000).toFixed(2)}B`
// 1_234_000_000_000 → "$1234.00B" ❌
```

### BUG-002: EQ Trend Score no explanation
`MetricRow` component had no `tooltip` prop. Score `0.42` was opaque.

### BUG-003: Duplicate quarters
`quarterly-history/route.ts`:
```typescript
where: { ticker: upper },  // no sourceProvider filter
take: 8,
```
With 4 quarters × 2 providers (fmp + tiingo) = 8 rows returned, but only 4 unique fiscal periods. User saw Q1–Q4 each repeated twice. Derived metrics (`quarters_available`, EQ trend) were already correct because `computeDerivedMetrics` and `computeTrendMetrics` both had the FMP-first fix from STORY-085 — only the display API was broken.

---

## Acceptance Criteria

- AC-1: Dollar values in quarterly table show thousands separators: `$62,020M`, `$43,200M`
- AC-2: TTM rollup values use locale formatting: `$227.00B`, `$1,234.56B`
- AC-3: EQ Trend Score row has `ⓘ` icon; tooltip on hover explains ≥+0.3 = improving, ≤−0.3 = deteriorating
- AC-4: Each quarter appears exactly once; FMP data preferred
- AC-5: Up to 12 quarters shown (was artificially limited to 8 by duplicate rows)

---

## Tasks

- [x] TASK-088-001: Fix `quarterly-history/route.ts` — FMP-first / Tiingo-fallback, `take: 12`
- [x] TASK-088-002: Fix `fmtM` + TTM formatters in `StockDetailClient.tsx` → `toLocaleString('en-US')`
- [x] TASK-088-003: Add `tooltip` prop to `MetricRow`; pass tooltip text to EQ Trend Score row
- [x] TASK-088-004: Tests — route dedup (7 tests), StockDetail formatter+tooltip (6 new tests, 1 updated)
- [x] TASK-088-005: Story file, implementation log updated

---

## Files Changed

```
src/app/api/stocks/[ticker]/quarterly-history/route.ts  [MODIFIED — FMP-first filter, take:12]
src/components/stock-detail/StockDetailClient.tsx        [MODIFIED — fmtM, TTM formatters, MetricRow tooltip]
tests/unit/api/quarterly-history-route.test.ts          [NEW — 7 tests]
tests/unit/components/StockDetail.test.tsx              [MODIFIED — 1 updated + 6 new STORY-088 tests]
```
