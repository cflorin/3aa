# ADR-016: Quarterly History Refresh Cadence and Recompute Trigger Strategy

**Status:** ACCEPTED
**Date:** 2026-04-25
**Deciders:** Product Team
**Related:** RFC-008, ADR-002, RFC-004

---

## Context

RFC-008 defines a quarterly financial history sync stage in the data ingestion pipeline. This ADR decides:

1. When to refresh raw quarterly history from Tiingo
2. When to recompute `stock_derived_metrics` from `stock_quarterly_history`
3. Whether `shouldRecompute` gains a new trigger type for quarterly data changes

---

## Options Considered

**Option A: Nightly**
Pull all 12 quarters for every in-universe stock every night. Recompute derived metrics nightly.
- Pros: Simple to implement; always current
- Cons: Wasteful (quarterly data changes only 4× per year per stock); hits Tiingo rate limit for large universes

**Option B: Earnings-triggered**
Detect when a new quarter's data has been posted (compare `reported_date` on most recent row against stored row). Trigger sync and derivation only when new quarter detected. Run a weekly scan as backstop to catch missed updates.
- Pros: Minimal unnecessary computation; accurate trigger timing; aligns with real cadence of quarterly earnings releases
- Cons: Slightly more complex change-detection logic

**Option C: Weekly full refresh**
Pull last 12 quarters for all stocks once per week (Sunday). Recompute derived metrics after each pull.
- Pros: Simple; catches historical restatements
- Cons: Wastes ~50 API calls per stock per quarter period when no new data exists; weekly cadence may lag a new quarter by up to 7 days

---

## Decision

**Option B — Earnings-triggered, with weekly backstop scan.**

---

## Rationale

New quarterly data appears approximately 4 times per year per stock. Pulling all 12 quarters nightly (Option A) for a 1000-stock universe would generate ~1000 API calls per night for no useful update the vast majority of the time. The Tiingo rate limit is 1000 requests per hour — nightly quarterly history would consume the full hourly budget just for this stage.

Option C (weekly) reduces waste but still generates ~50 unnecessary scans per stock per year and adds up to 7-day lag after earnings.

Option B is correct behavior: sync and recompute only when there is new data. The weekly backstop ensures that if the earnings-detection logic misses a release (e.g., Tiingo reporting delay, fiscal year end boundary cases), the data is caught within 7 days.

---

## Decision Detail

### Quarterly History Sync Stage

**Primary trigger: new earnings detection**

For each in-universe stock:
1. Query Tiingo: `fetchQuarterlyStatements(ticker)` — returns newest-first sorted quarters
2. Compare the `reported_date` of the most recent returned quarter against the most recent stored row for that ticker in `stock_quarterly_history`
3. If `reported_date` is newer (or no row exists), proceed with full upsert of all returned quarters
4. If `reported_date` matches, skip — no new data

**Backstop: weekly full scan (Sunday)**

On Sundays, the quarterly history sync runs for all in-universe stocks unconditionally (ignoring the change-detection comparison). This catches:
- Tiingo reporting delays
- Historical restatements (updated values for existing quarters)
- Stocks that missed the earnings-trigger window

### Pipeline Position

The quarterly history sync runs between **Fundamentals Sync** and **Classification Recompute** in the nightly batch, but only when triggered:

```
Daily (Mon–Sat):
  5:00 PM ET  - Universe Sync (weekly: Sunday only)
  5:00 PM ET  - Price Sync (daily)
  6:00 PM ET  - Fundamentals Sync (daily)
  6:30 PM ET  - Quarterly History Sync (earnings-triggered; nightly scan for new quarters)
                → Derived Metrics Recompute (runs immediately after for changed stocks only)
  8:00 PM ET  - Classification Recompute (daily; picks up quarterly_data_updated flags)
  ...

Sunday only:
  6:30 PM ET  - Quarterly History Full Scan (all stocks; weekly backstop)
```

The 6:30 PM ET slot is already allocated to the market-cap sync job (EPIC-003.1). The quarterly history sync must be coordinated with this slot or given its own dedicated cron at 6:45 PM ET. The exact timing is resolved in EPIC-003 story decomposition.

### Derived Metrics Recompute Trigger

When `stock_quarterly_history` rows are upserted or updated for a ticker:
1. Run derived metrics computation immediately for that ticker
2. Write updated `stock_derived_metrics` row — `derived_as_of` is set to `NOW()`

No extra flag column is needed. The classification batch at 8:00 PM ET detects stocks needing recompute by querying:

```sql
SELECT sdm.ticker
FROM stock_derived_metrics sdm
JOIN classification_state cs ON cs.ticker = sdm.ticker
WHERE sdm.derived_as_of > cs.classification_last_updated_at
```

Stocks returned by this query are added to the recompute batch regardless of whether forward revenue/EPS snapshot changed.

### shouldRecompute Extension

`shouldRecompute(current, previous)` gains a third trigger type:

```typescript
type RecomputeTrigger =
  | 'fundamental_change'       // existing: forward revenue/EPS delta > 5%
  | 'flag_change'              // existing: any classification flag changed
  | 'quarterly_data_updated';  // new: stock_derived_metrics.derived_as_of > classification_last_updated_at
```

The `force` parameter (added in EPIC-004) overrides all trigger checks. The `quarterly_data_updated` trigger is detected at the batch orchestration layer (via the query above) before `shouldRecompute` is called; it is passed into `shouldRecompute` as a pre-evaluated boolean so the function remains pure. No timestamp field is added to `ClassificationInput` — the trigger is resolved externally.

---

## Consequences

### Positive

- Minimal unnecessary Tiingo API calls (4–8 per year per stock for quarterly triggers, not 365)
- Classification recompute is accurately triggered when new earnings data arrives
- Weekly backstop ensures no persistent data gaps from timing edge cases
- Clear audit trail: `reported_date` comparison is traceable and logged

### Trade-offs

- Earnings-detection logic requires comparing `reported_date` against stored rows — slightly more complex than a simple nightly pull
- The `shouldRecompute` function gains a third trigger type — adds modest complexity to change detection
- Tiingo sometimes delays `reported_date` by days after actual earnings release — the weekly backstop is the safety net for this

### ADR-002 Impact

ADR-002 pipeline schedule is amended to add the quarterly history sync slot at 6:45 PM ET (or coordinated with the 6:30 PM ET market-cap slot). The amended schedule is:

```
5:00 PM ET  - Universe Sync (weekly: Sunday)
5:00 PM ET  - Price Sync (daily)
6:00 PM ET  - Fundamentals Sync (daily)
6:30 PM ET  - Market Cap Sync (daily) [EPIC-003.1 addition]
6:45 PM ET  - Quarterly History Sync + Derived Metrics Recompute (earnings-triggered; Sun: full scan)
7:00 PM ET  - Forward Estimates Sync (daily)
8:00 PM ET  - Classification Recompute (daily)
8:15 PM ET  - Valuation Recompute (daily)
8:30 PM ET  - Per-User Alert Generation
9:00 PM ET  - Pipeline Complete
```
