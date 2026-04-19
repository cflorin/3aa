# ADR-003: Audit Trail Persistence Strategy - Full State Snapshots

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-002 (Data Model), RFC-005 (Monitoring Engine)

---

## Context

The 3AA Monitoring Product requires full auditability:
- **Classification changes:** Track how and why a stock's classification changed over time
- **Valuation changes:** Track threshold updates, zone transitions, TSR hurdle adjustments
- **Alert history:** Understand what triggered alerts and when
- **Framework evolution:** Support framework updates without losing historical context

**The Question:** How should we persist historical state for audit and reconstruction?

### Requirements

1. **Historical reconstruction:** Given a date, reconstruct exact classification/valuation state
2. **Change attribution:** Understand what changed between two points in time
3. **Framework versioning:** Track which framework version generated each state
4. **Data provenance:** Track which provider(s) supplied data for each field
5. **Performance:** Query historical state efficiently (not prohibitively slow)

### Persistence Options

**Full State Snapshots:**
- Store complete state on every change
- Each history row contains all fields (bucket, quality, confidence, thresholds, etc.)
- Simple queries: `SELECT * FROM classification_history WHERE ticker = 'AAPL' AND effective_at <= '2026-01-15' ORDER BY effective_at DESC LIMIT 1`

**Delta-Based (Event Sourcing):**
- Store only fields that changed
- Each history row contains: `{field: 'bucket', old_value: 3, new_value: 4}`
- Requires replay to reconstruct state

**No History (Current State Only):**
- Store only latest state in `classification_state` / `valuation_state`
- No historical audit trail

---

## Decision

V1 shall use **full state snapshots** for all history tables:
- `classification_history` - Complete classification state on every change
- `valuation_history` - Complete valuation state on every change
- `alert_history` - Complete alert metadata on every status transition

### Schema Pattern

```sql
CREATE TABLE classification_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(10) NOT NULL,

  -- Complete state snapshot (not deltas)
  suggested_bucket INT,
  suggested_earnings_quality CHAR(1),
  suggested_balance_sheet_quality CHAR(1),
  suggested_code VARCHAR(5),
  final_bucket INT,
  final_earnings_quality CHAR(1),
  final_balance_sheet_quality CHAR(1),
  final_code VARCHAR(5),

  confidence_level VARCHAR(10),
  reason_codes JSONB,
  scores JSONB,

  -- Metadata
  framework_version VARCHAR(10) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(50) DEFAULT 'system',

  INDEX idx_classification_history_ticker_time (ticker, effective_at DESC)
);
```

### Snapshot Trigger

**When to create snapshot:**
- Classification changes (any field in `classification_state` changes)
- Valuation changes (zone transition, threshold update, metric change)
- Alert state transitions (active → acknowledged → resolved)

**When NOT to create snapshot:**
- Data refresh with no material change
- Framework config update (separate versioning)
- No-op recompute (same result as prior)

---

## Rationale

### Why Full State Snapshots?

**1. Simple Historical Queries**
```sql
-- Get AAPL's classification on 2026-01-15
SELECT * FROM classification_history
WHERE ticker = 'AAPL' AND effective_at <= '2026-01-15'
ORDER BY effective_at DESC LIMIT 1;
```

No replay needed. No delta merging. Single query.

**2. Complete Context in Every Row**
- Each history row is self-contained
- Debugging: read one row to understand full state
- Reporting: no joins or aggregations to reconstruct

**3. Framework Evolution Safety**
- Framework updates may change field definitions
- Snapshots preserve exact state at time of computation
- Delta-based approach breaks when field semantics change

**4. Audit Compliance**
- Each row is immutable proof of state at a point in time
- No risk of reconstruction logic bugs
- Tamper-evident (can't replay deltas differently)

**5. Performance is Acceptable for V1**
- 1000 stocks × ~10 classification changes/year = 10K rows/year
- 1000 stocks × ~50 valuation changes/year = 50K rows/year
- Total: ~60K history rows/year
- Storage: ~100 bytes/row × 60K = 6 MB/year (negligible)

### Why NOT Delta-Based?

**Complexity:**
- Requires replay logic to reconstruct state
- Replay logic must handle schema evolution
- More complex queries (aggregate deltas up to target date)

**Fragility:**
- Replay logic bugs = incorrect historical state
- Schema changes break replay (field renamed/removed)
- Hard to debug (must trace through event chain)

**No V1 Benefit:**
- Storage savings are minimal (60K rows vs ~600 delta events)
- V1 doesn't need incremental event replay
- V1 doesn't have multi-writer concurrency requiring event sourcing

**When Delta-Based Makes Sense:**
- High-frequency updates (thousands/second)
- Multi-writer concurrency with conflict resolution
- Event replay for debugging distributed systems
- V1 has none of these requirements

### Why NOT No History?

**Violates Requirements:**
- Cannot reconstruct historical state
- Cannot debug "why did classification change?"
- Cannot support framework versioning
- Cannot provide audit trail

**Not Acceptable:**
- V1 PRDs explicitly require auditability
- Framework is iterative (thresholds will be tuned)
- Need to answer: "What was AAPL's zone on Jan 15?"

---

## Consequences

### Positive ✅

**Simple Queries:**
- Point-in-time queries: single SELECT with WHERE effective_at <= target_date
- Time-series analysis: ORDER BY effective_at
- No complex replay logic

**Debuggability:**
- Each row contains complete context
- Read one row to understand exact state
- No need to trace through event chains

**Immutability:**
- History tables are append-only
- No UPDATE or DELETE operations
- Tamper-evident audit trail

**Schema Evolution Safety:**
- Add new fields without breaking history
- Old snapshots preserve exact state at time
- Framework updates don't corrupt history

**Framework Versioning:**
- Each snapshot tagged with `framework_version`
- Can compare states across framework updates
- Can analyze: "How did V2 framework re-classify stocks vs V1?"

### Negative ⚠️

**Storage Overhead:**
- Full snapshots larger than deltas
- ~100 bytes/row vs ~20 bytes/delta
- **Mitigation:** V1 scale = 60K rows/year = 6 MB (negligible)

**Redundant Data:**
- Many fields don't change between snapshots
- E.g., `company_name` duplicated across all rows
- **Mitigation:** Storage is cheap, simplicity is valuable

**Write Amplification:**
- Each change writes entire state (10-20 fields)
- More write load than delta-based
- **Mitigation:** V1 = nightly batch, not high-frequency updates

**No Built-In Diffing:**
- Must compare two snapshots to see what changed
- Delta-based has change built-in
- **Mitigation:** Add `changed_fields JSONB` column if needed

---

## Alternatives Considered

### Alternative 1: Delta-Based Event Sourcing

**Approach:**
```sql
CREATE TABLE classification_events (
  event_id UUID PRIMARY KEY,
  ticker VARCHAR(10),
  event_type VARCHAR(50), -- 'bucket_changed', 'quality_downgraded'
  changed_fields JSONB, -- {"bucket": {"old": 3, "new": 4}}
  effective_at TIMESTAMPTZ
);
```

**Reconstruction:**
```sql
-- Replay events to reconstruct state at 2026-01-15
SELECT aggregate_events(events)
FROM classification_events
WHERE ticker = 'AAPL' AND effective_at <= '2026-01-15'
ORDER BY effective_at;
```

**Rejected Because:**
- ❌ Requires custom replay logic (aggregate_events function)
- ❌ Replay logic breaks on schema changes
- ❌ More complex queries (can't just SELECT latest row)
- ❌ Debugging requires tracing event chain
- ❌ No V1 storage benefit (60K snapshots = 6 MB, deltas = 1 MB)
- ✅ Would be appropriate for high-frequency updates (V1 is nightly batch)

---

### Alternative 2: Hybrid (Snapshots + Deltas)

**Approach:**
- Store full snapshot every N changes (e.g., daily)
- Store deltas between snapshots
- Reconstruct: find nearest snapshot, replay deltas

**Rejected Because:**
- ❌ Complexity of both approaches combined
- ❌ Adds snapshot/delta coordination logic
- ❌ V1 change frequency low enough that pure snapshots work
- ✅ Would be appropriate for high-frequency updates with point-in-time queries

---

### Alternative 3: Temporal Tables (PostgreSQL/SQL Server)

**Approach:**
- Database-native temporal table support
- Automatic history tracking on UPDATE/DELETE
- Query syntax: `SELECT * FROM classification_state FOR SYSTEM_TIME AS OF '2026-01-15'`

**Rejected Because:**
- ❌ Database-specific (locks into Postgres/SQL Server)
- ❌ Less explicit control over snapshot timing
- ❌ History schema mirrors current schema (can't add history-specific fields)
- ✅ Would be appropriate if using temporal database features already
- ✅ Explicit history tables give more control for V1

---

### Alternative 4: No History (Current State Only)

**Approach:**
```sql
CREATE TABLE classification_state (
  ticker VARCHAR(10) PRIMARY KEY,
  suggested_code VARCHAR(5),
  final_code VARCHAR(5),
  updated_at TIMESTAMPTZ
);
-- No classification_history table
```

**Rejected Because:**
- ❌ Cannot answer: "What was AAPL's classification on Jan 15?"
- ❌ Cannot debug: "Why did classification change?"
- ❌ Cannot analyze framework evolution
- ❌ Violates V1 auditability requirement (PRD section 7.2)

---

## Implementation Notes

### Snapshot Creation Logic

```typescript
async function saveClassificationSnapshot(
  ticker: string,
  state: ClassificationState
): Promise<void> {
  // Only create snapshot if state actually changed
  const prior = await db.query(`
    SELECT * FROM classification_history
    WHERE ticker = $1
    ORDER BY effective_at DESC LIMIT 1
  `, [ticker]);

  if (prior.rows.length > 0 && isIdentical(state, prior.rows[0])) {
    // No change, skip snapshot
    return;
  }

  // Create snapshot
  await db.query(`
    INSERT INTO classification_history (
      ticker, suggested_code, final_code, confidence_level,
      reason_codes, scores, framework_version, effective_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `, [
    ticker,
    state.suggested_code,
    state.final_code,
    state.confidence_level,
    JSON.stringify(state.reason_codes),
    JSON.stringify(state.scores),
    FRAMEWORK_VERSION
  ]);
}
```

### Historical Query Helper

```typescript
async function getClassificationAt(
  ticker: string,
  asOfDate: Date
): Promise<ClassificationState | null> {
  const result = await db.query(`
    SELECT * FROM classification_history
    WHERE ticker = $1 AND effective_at <= $2
    ORDER BY effective_at DESC LIMIT 1
  `, [ticker, asOfDate]);

  return result.rows.length > 0 ? result.rows[0] : null;
}
```

### Change Detection Helper

```typescript
async function getClassificationChanges(
  ticker: string,
  fromDate: Date,
  toDate: Date
): Promise<ClassificationChange[]> {
  const snapshots = await db.query(`
    SELECT * FROM classification_history
    WHERE ticker = $1
      AND effective_at >= $2
      AND effective_at <= $3
    ORDER BY effective_at
  `, [ticker, fromDate, toDate]);

  const changes = [];
  for (let i = 1; i < snapshots.rows.length; i++) {
    changes.push({
      from: snapshots.rows[i - 1],
      to: snapshots.rows[i],
      changed_at: snapshots.rows[i].effective_at,
      changed_fields: detectChangedFields(
        snapshots.rows[i - 1],
        snapshots.rows[i]
      )
    });
  }

  return changes;
}
```

### Retention Policy

**V1 Policy:**
- Retain all history indefinitely (storage cost negligible)
- No automatic archival or deletion

**V2 Consideration:**
- If history table grows >10M rows, consider:
  - Archive snapshots older than 5 years to cold storage
  - Implement snapshot compression (JSONB fields)
  - Add partitioning by date range

---

## Migration Path

If V1 outgrows full snapshots (unlikely), migration options:

**Option 1: Add delta tracking alongside snapshots**
- Keep snapshots for point-in-time queries
- Add delta events for change analysis
- No breaking changes to existing queries

**Option 2: Switch to temporal tables**
- Migrate history to database-native temporal support
- Preserve existing snapshots as initial seed
- Update query logic to use temporal syntax

**Option 3: Move to event sourcing**
- Generate delta events from snapshot diffs
- Keep snapshots as materialized views
- Requires application rewrite (not recommended for V1)

---

## Related Decisions

- **RFC-002:** Defines history table schemas (classification_history, valuation_history, alert_history)
- **RFC-001:** Classification engine generates snapshots on state changes
- **RFC-003:** Valuation engine generates snapshots on zone transitions
- **RFC-005:** Monitoring engine compares current vs prior snapshots

---

## Notes

- History tables are append-only (INSERT only, no UPDATE/DELETE)
- Each snapshot includes `framework_version` for future framework evolution tracking
- `effective_at` timestamp allows point-in-time reconstruction
- Indexes on `(ticker, effective_at DESC)` optimize historical queries

---

**END ADR-003**
