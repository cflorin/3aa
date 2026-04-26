# ADR-002: V1 Workflow Orchestration Strategy - Nightly Batch Processing

**Status:** ACCEPTED
**Date:** 2026-04-19
**Deciders:** Product Team
**Related:** RFC-001, RFC-002, RFC-003, RFC-004, RFC-005

---

## Context

The 3AA Monitoring Product V1 requires coordination of multiple engines:
- **Data Ingestion Pipeline** (RFC-004): Syncs stock universe, prices, fundamentals, forward estimates
- **Classification Engine** (RFC-001): Computes suggested bucket and quality grades
- **Valuation Engine** (RFC-003): Assigns metrics, thresholds, and valuation zones
- **Monitoring Engine** (RFC-005): Detects state changes and generates alerts

**The Question:** How should these engines be orchestrated?

### V1 Characteristics
- Universe size: ~1000 stocks
- Data source: EOD data (not real-time)
- User count: Multi-user (10-100 users expected, admin-controlled accounts)
- Required latency: Results available next morning (not real-time)
- Acceptable downtime: Overnight processing window (5pm-9pm ET)

### Orchestration Options

**Event-Driven Architecture:**
- Data ingestion publishes events to message queue
- Classification/valuation/monitoring engines subscribe to events
- Asynchronous, decoupled, scalable

**Synchronous Chaining:**
- API endpoints trigger sequential processing
- Each engine calls the next engine directly
- Simple, but blocking

**Scheduled Batch Processing:**
- Cron jobs trigger pipeline stages sequentially
- Each stage runs to completion before next starts
- Predictable, simple, leverages overnight window

---

## Decision

V1 shall use **scheduled nightly batch processing** with sequential pipeline execution.

### Pipeline Schedule (Multi-User)

```
Daily (Monday-Friday):
  5:00 PM ET - Universe Sync (weekly on Sunday only) [SHARED]
  5:00 PM ET - Price Sync (daily) [SHARED]
  6:00 PM ET - Fundamentals Sync (daily) [SHARED]
  7:00 PM ET - Forward Estimates Sync (daily) [SHARED]
  8:00 PM ET - Classification Recompute (shared suggestions) [SHARED]
  8:15 PM ET - Valuation Recompute (shared thresholds/zones) [SHARED]
  8:30 PM ET - FOR EACH ACTIVE USER (sequential): [PER-USER]
                 - Get user's monitored stocks
                 - Capture state snapshot (with user's active_code)
                 - Detect state diffs vs prior snapshot
                 - Generate alerts (with user_id)
                 - Apply user alert preferences
                 - Deduplication filter (per-user)
                 - Persist alerts (with user_id)
  9:00 PM ET - Pipeline Complete (all user alerts available)
```

**Multi-User Considerations:**
- Shared computation (classification, valuation) runs once
- Per-user alert generation runs sequentially for each user
- **Estimated runtime: 10 users × 100 monitored stocks/user × 0.1s/stock = 100s (planning assumption)**
- **For 100 users: ~17 minutes (planning assumption, still within 4-hour nightly window)**

### Orchestration Mechanism

**V1 Implementation:**
- Cron jobs or equivalent scheduled task runner
- Each stage is idempotent (safe to re-run)
- Each stage checks prerequisites (e.g., data freshness)
- Sequential execution with failure isolation

**No Complex Infrastructure Required:**
- No message queue (Kafka, RabbitMQ, etc.)
- No workflow orchestrator (Airflow, Temporal, etc.)
- No real-time event processing
- No distributed transaction coordinator

---

## Rationale

### Why Nightly Batch for V1?

**1. Aligns with Data Availability**
- EOD data from providers arrives after market close (4pm ET)
- No benefit to real-time processing when data is daily

**2. Acceptable Latency**
- User reviews alerts the next morning
- No requirement for intraday alerts
- Overnight processing window is sufficient (5pm-9pm ET)

**3. Simplicity**
- Single-process application
- Standard cron scheduling
- Easy to debug (clear start/end times, sequential logs)
- No distributed systems complexity

**4. Predictable Resource Usage**
- Peak load during 5-9pm ET window
- Idle during day (minimal resources needed)
- No need to provision for real-time spikes

**5. Complete State Consistency**
- Each pipeline run sees consistent snapshot of data
- No race conditions between engines
- No eventual consistency concerns

**6. V1 Scale is Small**
- 1000 stocks × 4 engines = ~4000 operations/night
- **Estimated runtime: <30 minutes for full universe (planning assumption, unvalidated)**
- Well within 4-hour processing window

### Why NOT Event-Driven for V1?

**Added Complexity:**
- Message queue infrastructure (setup, monitoring, failure handling)
- Asynchronous debugging (harder to trace causality)
- Eventual consistency (need to handle partial updates)
- Dead letter queues and retry logic

**No V1 Benefit:**
- Don't need real-time responsiveness
- Don't need to scale beyond 1000 stocks
- Don't need multi-tenant isolation
- Don't need to process incremental updates

**Premature Optimization:**
- Event-driven makes sense at >10K stocks or real-time requirements
- V1 doesn't have these requirements
- Can migrate to event-driven in V2 if needed

### Why NOT Synchronous Chaining?

**Tight Coupling:**
- Classification engine must know about valuation engine
- Harder to test engines in isolation
- Harder to add new engines later

**Blocking Behavior:**
- If one engine is slow, entire chain blocks
- No parallel processing of independent operations

**Batch is Better:**
- Decoupled (engines don't call each other)
- Can parallelize independent stages (e.g., price sync + fundamentals sync)
- Clear separation of concerns

---

## Consequences

### Positive ✅

**Simplicity:**
- No message queue infrastructure
- No distributed tracing needed
- Standard cron job monitoring
- Easy to reason about (sequential pipeline)

**Predictability:**
- Fixed processing schedule
- Consistent resource usage
- Clear SLAs (alerts available by 9pm ET)

**Debuggability:**
- Sequential logs easy to follow
- Clear start/end of each stage
- No async race conditions

**Cost Efficiency:**
- No always-on message queue infrastructure
- Can shut down compute resources during off-hours
- Minimal cloud costs for V1

**Future-Proof:**
- Can add new pipeline stages easily
- Can migrate to event-driven in V2 if needed
- No technical debt from over-engineering

### Negative ⚠️

**No Real-Time Updates:**
- Users must wait until next pipeline run for new data
- Cannot alert on intraday price movements
- **Mitigation:** V1 scope explicitly excludes intraday alerts

**Fixed Processing Window:**
- If pipeline takes >4 hours, alerts delayed
- No incremental updates (must reprocess entire universe)
- **Mitigation:** V1 scale (1000 stocks) well within 4-hour window

**Sequential Execution:**
- Some stages could run in parallel but don't in V1
- Slightly longer total runtime vs event-driven
- **Mitigation:** Total runtime <30 min for V1, acceptable

**Manual Retries:**
- If stage fails, requires manual re-run
- No automatic retry logic built-in
- **Mitigation:** Add simple retry wrapper around each stage

---

## Alternatives Considered

### Alternative 1: Event-Driven Architecture (Kafka/RabbitMQ)

**Approach:**
- Data ingestion publishes StockDataUpdated events
- Classification engine subscribes, computes, publishes ClassificationChanged events
- Valuation engine subscribes to ClassificationChanged
- Monitoring engine subscribes to all state changes

**Rejected Because:**
- ❌ Adds message queue infrastructure (setup, monitoring, costs)
- ❌ No V1 requirement for real-time processing
- ❌ Over-engineered for 1000-stock universe
- ❌ Harder to debug (async event flows)
- ❌ Eventual consistency complexity (partial updates)
- ✅ Would be appropriate for V2 with >10K stocks or real-time requirements

---

### Alternative 2: Synchronous API Chaining

**Approach:**
- `/api/refresh` endpoint triggers data ingestion
- Data ingestion directly calls classification engine API
- Classification engine directly calls valuation engine API
- Valuation engine directly calls monitoring engine API

**Rejected Because:**
- ❌ Tight coupling between engines
- ❌ Blocking behavior (long request timeout)
- ❌ Hard to test engines independently
- ❌ Hard to parallelize independent stages
- ✅ Simpler than event-driven, but batch is simpler still

---

### Alternative 3: Workflow Orchestrator (Apache Airflow / Temporal)

**Approach:**
- Define DAG (Directed Acyclic Graph) of pipeline stages
- Airflow schedules and monitors execution
- Built-in retry logic, alerting, visualization

**Rejected Because:**
- ❌ Heavy infrastructure (Airflow requires web server, scheduler, DB, workers)
- ❌ Over-engineered for simple sequential pipeline
- ❌ Learning curve and operational complexity
- ✅ Would be appropriate for V2 with complex branching workflows
- ✅ Cron + idempotent scripts sufficient for V1

---

### Alternative 4: Real-Time Streaming (Flink / Spark Streaming)

**Approach:**
- Continuous processing of incoming stock data
- Stateful stream processing for classification/valuation
- Real-time alert generation

**Rejected Because:**
- ❌ Massive over-engineering for V1
- ❌ V1 data is EOD (daily), not streaming
- ❌ No user requirement for real-time alerts
- ❌ Infrastructure complexity (cluster management, state checkpointing)
- ✅ Not applicable to V1 use case at all

---

## Implementation Notes

### V1 Batch Runner

**Technology Options:**
- Standard cron (Linux/Unix)
- Node.js cron library (if single-process app)
- Docker container with cron
- Cloud scheduler (AWS EventBridge, GCP Cloud Scheduler)

**Recommended:** Start with standard cron or cloud scheduler (simple, reliable)

### Idempotency Requirements

Each pipeline stage MUST be idempotent:
- Running twice with same inputs produces same result
- Safe to re-run if failure occurs mid-stage
- No partial updates (commit only after stage completes)

**Example:**
```typescript
async function runPriceSync() {
  const stocks = await db.query('SELECT ticker FROM stocks WHERE in_universe = TRUE');

  // Collect all updates first (don't commit incrementally)
  const updates = [];
  for (const stock of stocks.rows) {
    const price = await fetchPrice(stock.ticker);
    updates.push({ ticker: stock.ticker, price });
  }

  // Commit all updates in single transaction (idempotent)
  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx.query('UPDATE stocks SET current_price = $1 WHERE ticker = $2',
        [update.price, update.ticker]);
    }
  });
}
```

### Failure Handling

**V1 Strategy:**
- Each stage logs start/end with status
- If stage fails, log error and STOP pipeline (don't continue)
- Alert operator (email/Slack)
- Operator reviews logs and manually re-runs failed stage

**V2 Enhancement:**
- Add automatic retry with exponential backoff
- Add per-stock failure isolation (one stock failure doesn't block others)
- Add pipeline status dashboard

### Monitoring

**V1 Metrics:**
- Pipeline start time (daily)
- Pipeline end time (daily)
- Per-stage duration (track performance degradation)
- Per-stage success/failure count
- Alert generation count (daily)

**Alerting:**
- Pipeline didn't complete by 9:30 PM ET (delayed)
- Any stage failed (requires manual intervention)
- Zero alerts generated (possible data quality issue)

---

## Migration Path to Event-Driven (V2+)

If V1 outgrows batch processing (>10K stocks, real-time requirements, multi-tenant), migration path:

1. **Add message queue** (Kafka/RabbitMQ)
2. **Wrap existing engines** with event subscribers (engines unchanged)
3. **Publish events** from data ingestion (StockDataUpdated)
4. **Switch orchestration** from cron to event-driven
5. **Keep batch as fallback** for full universe recomputes

**Key:** Engines are already decoupled (don't call each other), so migration is clean.

---

## Platform Implementation (RFC-006)

**See RFC-006 for full platform/deployment architecture.**

### Cloud Scheduler (GCP)

V1 implements nightly batch orchestration using **Google Cloud Scheduler** (ADR-008):

**Scheduler Jobs:**

| Job Name | Cron Schedule (UTC) | ET Time | Endpoint |
|----------|---------------------|---------|----------|
| `price-sync` | `0 22 * * 1-5` | 5:00pm Mon-Fri | `/api/cron/price-sync` |
| `fundamentals-sync` | `0 23 * * 1-5` | 6:00pm | `/api/cron/fundamentals` |
| `estimates-sync` | `0 0 * * 2-6` | 7:00pm | `/api/cron/estimates` |
| `classification` | `0 1 * * 2-6` | 8:00pm | `/api/cron/classification` |
| `valuation` | `15 1 * * 2-6` | 8:15pm | `/api/cron/valuation` |
| `alerts` | `30 1 * * 2-6` | 8:30pm | `/api/cron/alerts` |

**How It Works:**
1. Cloud Scheduler triggers HTTP POST to Cloud Run endpoint
2. Authentication via OIDC token (Cloud Scheduler service account)
3. Endpoint verifies token, runs background job logic
4. Returns JSON response (success/failure)
5. Cloud Logging captures execution logs

**No Workflow Orchestrator Needed:**
- Sequential execution achieved via staggered scheduling (5pm, 6pm, 7pm, etc.)
- Each job checks prerequisites before running (data freshness validation)
- Simple, reliable, low-ops (no Airflow, Temporal, etc.)

**Failure Handling:**
- Cloud Scheduler retries on 5xx error (exponential backoff)
- Alert operator via Cloud Monitoring (if job fails repeatedly)
- Operator reviews logs, manually re-runs job if needed

**Cost:** Free (Cloud Scheduler free tier: 3 jobs/month; V1 uses 6 jobs but still within generous limits)

---

## Related Decisions

- **RFC-004:** Defines data ingestion refresh schedule (5-7pm ET)
- **RFC-005:** Defines monitoring pipeline schedule (8:30-9pm ET)
- **ADR-001:** Multi-provider data architecture (affects ingestion stage)
- **ADR-003:** Full state snapshots (affects recompute triggers)
- **RFC-006:** Platform architecture (Cloud Scheduler implementation)
- **ADR-008:** Google Cloud Platform choice (Cloud Scheduler service)

---

## Notes

- V1 pipeline runs Monday-Friday only (no weekend processing)
- Universe sync runs weekly (Sunday 5pm ET) to minimize API calls
- Pipeline can be manually triggered for ad-hoc recomputes
- **Total processing time target: <30 minutes for 1000 stocks (planning assumption, unvalidated)**

## Amendment — 2026-04-25: Quarterly History Sync Pipeline Slot (RFC-008 / ADR-016)

A new pipeline stage is added at **6:45 PM ET**: Quarterly History Sync + Derived Metrics Computation.

**Updated schedule:**

```
Daily (Monday–Friday):
  5:00 PM ET - Universe Sync (weekly on Sunday only) [SHARED]
  5:00 PM ET - Price Sync (daily) [SHARED]
  6:00 PM ET - Fundamentals Sync (daily) [SHARED]
  6:30 PM ET - Market Cap Sync (daily) [SHARED] — added EPIC-003.1
  6:45 PM ET - Quarterly History Sync + Derived Metrics Computation [SHARED]
               (earnings-triggered; Sunday: full scan of all stocks)
  7:00 PM ET - Forward Estimates Sync (daily) [SHARED]
  8:00 PM ET - Classification Recompute (daily; picks up quarterly_data_updated flags) [SHARED]
  8:15 PM ET - Valuation Recompute [SHARED]
  8:30 PM ET - FOR EACH ACTIVE USER (sequential): [PER-USER]
  9:00 PM ET - Pipeline Complete
```

The quarterly history sync is earnings-triggered (see ADR-016): for most stocks on most nights, it performs a lightweight check of `reported_date` against stored rows and exits immediately. Only when new quarterly data is detected does it perform upserts and derived metric recomputation. This keeps average nightly runtime low despite the new stage.

**Related:** RFC-008, ADR-016 (cadence decision)

---

**END ADR-002**
