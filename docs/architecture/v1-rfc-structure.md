# V1 RFC Structure and Governance

**Date:** 2026-04-19
**Status:** Active
**V1 Scope:** classify → value → monitor → alert → inspect

---

## RFC Tiering System

### Tier 1: Core Architecture RFCs
**Definition:** Establish core engine behavior, data models, and product scope boundaries.

**Constraints:**
- MUST align strictly with PRD scope (no scope expansion)
- MUST be self-contained architectural decisions
- MAY create new architecture patterns and decisions
- MUST NOT depend on Tier 2 RFCs

**Governance:**
- Any conflict between Tier 1 RFCs is a critical design error requiring immediate resolution
- Changes to Tier 1 RFCs after approval require full review cycle

---

### Tier 2: Supporting Architecture RFCs
**Definition:** Refine how Tier 1 components interact, operate, and scale.

**Constraints:**
- MUST NOT redefine product scope established by Tier 1
- MUST NOT change core engine behavior established by Tier 1
- MUST NOT silently introduce new features beyond V1 boundaries
- MAY ONLY refine operational characteristics (how engines coordinate, scale, deploy)
- MUST explicitly inherit assumptions from Tier 1 dependencies
- SHOULD justify complexity vs simpler alternatives (default to simple for V1)

**Governance:**
- If Tier 2 RFC conflicts with Tier 1, Tier 1 wins
- If complexity isn't justified, downgrade to ADR or technical spec

---

## V1 RFC Set

### Tier 1: Core Architecture (5 RFCs - MUST HAVES for V1)

#### RFC-001: Classification Engine Architecture
**Status:** ✅ COMPLETE
**Tier:** 1 (Core)
**Dependencies:** None
**Creates New Decisions:** YES - defines classification algorithm, scoring, confidence model
**Refines Existing:** NO

**Establishes:**
- Deterministic rules-based classification algorithm
- Bucket/quality scoring approach
- Tie-break resolution rules
- Confidence computation model
- Missing data handling strategy
- Manual override semantics
- Classification state persistence schema

**Must NOT establish:**
- How classification is triggered (Tier 2 concern)
- UI for manual override (implementation detail)
- Performance optimization strategies (Tier 2 or implementation)

---

#### RFC-002: Canonical Data Model & Persistence Layer
**Status:** ✅ COMPLETE
**Tier:** 1 (Core)
**Dependencies:** None
**Creates New Decisions:** YES - defines canonical schema for all entities
**Refines Existing:** NO

**Establishes:**
- Complete entity schema (stocks, classification_state/history, valuation_state/history, alerts/alert_history)
- Audit trail structure (full state vs deltas)
- Primary keys, foreign keys, indexes
- Data retention policies
- Immutability guarantees for history tables
- Framework configuration storage (anchor tables, TSR hurdles)

**Must NOT establish:**
- Database technology choice (Postgres vs MySQL) - implementation detail
- Backup/recovery procedures - operational concern
- Replication strategy - Tier 2 or operational

---

#### RFC-003: Valuation & Threshold Engine Architecture
**Status:** ✅ COMPLETE
**Tier:** 1 (Core)
**Dependencies:** RFC-001 (consumes active_code), RFC-002 (persistence schema)
**Creates New Decisions:** YES - defines metric selection, threshold assignment, zone computation
**Refines Existing:** NO

**Inherits from RFC-001:**
- active_code = final_code || suggested_code
- Classification confidence levels exist but don't affect valuation logic
- Manual override semantics (preserve both suggested and final)

**Establishes:**
- Deterministic metric selection rules by bucket
- Current multiple computation approach
- Anchored threshold lookup vs derived threshold generation
- TSR hurdle calculation with quality adjustments
- Valuation zone assignment algorithm
- Secondary adjustments (gross margin, dilution, cyclicality)
- Valuation state persistence schema

**Must NOT establish:**
- How valuation is triggered after classification changes (Tier 2)
- Performance caching strategies (Tier 2 or implementation)
- UI rendering of thresholds (implementation detail)

---

#### RFC-004: Data Ingestion & Refresh Pipeline
**Status:** ✅ COMPLETE
**Tier:** 1 (Core)
**Dependencies:** RFC-002 (writes to stocks table, triggers recomputes)
**Creates New Decisions:** YES - defines data sourcing, refresh cadence, change detection
**Refines Existing:** NO

**Inherits from RFC-002:**
- stocks table schema and required fields
- Freshness metadata structure

**Establishes:**
- Abstract vendor data interface (not specific vendor implementations)
- Refresh scheduling approach (daily, weekly, on-demand)
- Change detection for recompute triggers
- Data validation and quality checks
- Freshness tracking mechanism
- Universe eligibility filtering ($5bn market cap, US-listed)
- Handling stocks that drop out of universe
- Material change thresholds (what triggers recompute)

**Must NOT establish:**
- Specific vendor API integrations (Yahoo Finance, etc.) - implementation detail
- Exact cron schedule syntax - implementation detail
- Error retry policies - Tier 2 concern

---

#### RFC-005: Monitoring & Alerts Engine Architecture
**Status:** ✅ COMPLETE
**Tier:** 1 (Core)
**Dependencies:** RFC-001 (classification state), RFC-003 (valuation state), RFC-002 (alerts schema)
**Creates New Decisions:** YES - defines alert generation, deduplication, inspection view
**Refines Existing:** NO

**Inherits from RFC-001:**
- classification_state schema and change events
- Suggested vs final code semantics

**Inherits from RFC-003:**
- valuation_state schema and valuation zones
- Zone transition definitions

**Establishes:**
- State diffing algorithm (current vs prior state comparison)
- Alert family definitions (valuation, classification, data quality)
- Alert generation triggers (zone entry, code change, stale data)
- Deduplication strategy and cooldown windows
- Priority assignment rules
- Alert state model (active, acknowledged, resolved, suppressed)
- Alert payload structure (what context is captured)
- Alert persistence and history schema
- Alert inspection view data requirements (read-only stock detail)

**Must NOT establish:**
- How alert feed is rendered in UI (implementation detail)
- Real-time push vs polling (Tier 2 concern)
- Alert notification mechanisms (email, SMS) - out of V1 scope

---

### Tier 2: Supporting Architecture (OPTIONAL - Defer or Downgrade to ADRs)

#### RFC-006: Workflow Orchestration Strategy
**Status:** Planned
**Tier:** 2 (Supporting)
**Dependencies:** RFC-001, RFC-003, RFC-004, RFC-005
**Creates New Decisions:** NO - refines existing
**Refines Existing:** YES - how engines coordinate

**Inherits from Tier 1:**
- Classification engine produces classification_state
- Valuation engine consumes active_code, produces valuation_state
- Monitoring engine compares current vs prior states
- Data ingestion triggers recomputes

**MUST Justify:**
- **Event-driven (async message queue)** vs **Scheduled batch (cron jobs)** vs **Synchronous chaining**
- Default assumption for V1: **Simple scheduled batch processing**
- Event-driven MUST justify added complexity for V1 use case

**Establishes (if justified):**
- Coordination mechanism between engines
- Transactional boundaries (if any)
- Recomputation cascade logic (classification → valuation → monitoring)
- Idempotency guarantees
- Concurrency handling (if needed for V1 scale)

**Must NOT:**
- Change engine input/output contracts (Tier 1 owns those)
- Introduce new features requiring orchestration
- Assume high-frequency updates requiring real-time coordination

**Downgrade Consideration:**
- If V1 runs nightly batch: This becomes **ADR-010: V1 Workflow Orchestration - Scheduled Batch**
- If event-driven adds no V1 value: Defer to V2

---

#### RFC-007: Framework Configuration Management
**Status:** Planned
**Tier:** 2 (Supporting) - **Likely ADR instead**
**Dependencies:** RFC-002 (framework config tables), RFC-003 (consumes anchored thresholds)
**Creates New Decisions:** NO - refines existing
**Refines Existing:** YES - how framework config is stored and versioned

**Inherits from Tier 1:**
- RFC-002 defines framework config table schema
- RFC-003 defines anchored threshold table structure

**Establishes:**
- Config storage mechanism (DB table vs versioned files vs code constants)
- Versioning strategy for framework updates
- Validation on startup
- Rollback strategy if corrupted

**Downgrade Recommendation:**
- **Make this ADR-011: Framework Configuration Storage Strategy**
- Not complex enough for full RFC
- Decision is: "Store anchored thresholds in DB table with version column" or "YAML file in /config"

---

#### Spec: API Contracts Between Engines
**Status:** Planned
**Tier:** 2 (Supporting) - **Technical Spec, not RFC**
**Dependencies:** All Tier 1 RFCs
**Creates New Decisions:** NO
**Refines Existing:** YES - formalizes contracts

**Purpose:**
- Extract and formalize TypeScript/JSON schemas from Tier 1 RFCs
- Define error handling conventions
- Define versioning strategy (if needed)

**Format:**
- TypeScript interface definitions in `/specs/contracts/`
- Not an RFC - just consolidation of existing contracts

**Files to create:**
```
/specs/contracts/classification-engine.ts
/specs/contracts/valuation-engine.ts
/specs/contracts/monitoring-engine.ts
/specs/contracts/data-ingestion.ts
```

---

#### RFC-008: Observability & Telemetry Architecture
**Status:** Planned
**Tier:** 2 (Supporting)
**Dependencies:** All Tier 1 RFCs
**Creates New Decisions:** NO - refines existing
**Refines Existing:** YES - how engines emit telemetry

**Inherits from Tier 1:**
- Each engine RFC mentions telemetry events to emit
- Audit trail requirements from RFC-002

**Establishes:**
- Structured logging schema (consolidates across engines)
- Metrics taxonomy (counters, histograms, gauges)
- Distributed tracing strategy (if multi-service)
- Error tracking integration
- Performance monitoring approach
- Dashboard requirements

**Must NOT:**
- Change what gets logged (Tier 1 defines events)
- Add new telemetry that implies new features

**Downgrade Consideration:**
- If V1 is single-process app: This becomes **ADR-012: V1 Observability - Structured Logging to Stdout**
- Complex distributed tracing might be V2

---

#### ADR-013: V1 Deployment Architecture
**Status:** Planned
**Type:** ADR (not RFC)
**Dependencies:** All Tier 1 RFCs

**Decision:**
- Single-process application vs microservices
- Deployment target (Docker container, serverless, VM)
- Database deployment (managed Postgres, local SQLite for dev)
- Scaling strategy (vertical vs horizontal)

**Why ADR not RFC:**
- Doesn't affect product behavior
- Infrastructure decision, not architectural pattern
- Can be changed without affecting code architecture

---

#### ADR-014: V1 Performance & Scaling Assumptions
**Status:** Planned
**Type:** ADR (not RFC)
**Dependencies:** All Tier 1 RFCs

**Decision:**
- Expected universe size (~1000 stocks)
- Acceptable latency for classification (< 2 seconds for full universe)
- Acceptable latency for alert generation (< 5 seconds)
- Refresh frequency (nightly batch vs hourly vs real-time)
- Concurrent user assumptions (single user for V1)

**Why ADR not RFC:**
- Establishes performance boundaries
- Justifies "simple is fine for V1" decisions
- Prevents premature optimization

---

## RFC Approval Flow

### Tier 1 RFC Review Requirements
1. ✅ Aligns with PRD scope (no expansion)
2. ✅ No conflicting decisions with other Tier 1 RFCs
3. ✅ Clearly establishes what it owns vs what is implementation detail
4. ✅ Provides concrete interface contracts
5. ✅ Addresses edge cases from PRDs

### Tier 2 RFC Review Requirements
1. ✅ Explicitly inherits from Tier 1 dependencies
2. ✅ Does NOT redefine core behavior
3. ✅ Justifies complexity vs simpler alternatives
4. ✅ Considers "Should this be an ADR instead?"
5. ✅ Demonstrates V1 necessity (not premature V2 optimization)

---

## What Should Be ADRs vs RFCs

### Make it an RFC if:
- Defines core product behavior (classification, valuation, monitoring)
- Establishes canonical data models
- Defines major subsystem architecture
- Creates contracts that multiple components depend on

### Make it an ADR if:
- Records a specific technology choice (Postgres vs MySQL)
- Documents a configuration decision (batch vs event-driven for V1)
- Captures a performance tradeoff
- Explains why we chose simplicity over complexity for V1

### Make it a Spec if:
- Formalizes contracts already defined in RFCs
- Documents algorithm details (scoring formulas)
- Defines data schemas extracted from RFCs

---

## Default Position for V1

**When in doubt, choose simplicity:**

❌ NOT: "We might need event-driven later, so let's architect for it now"
✅ YES: "V1 runs nightly batch. RFC-006 documents this. V2 can add events if needed."

❌ NOT: "Microservices for future scalability"
✅ YES: "Single-process app. ADR-013 documents this. Refactor if >10K stocks."

❌ NOT: "Complex caching layer for performance"
✅ YES: "Compute on demand. Add caching in V1.1 if <2s latency violated."

---

## V1 RFC Writing Order

### Tier 1: Core Architecture (THESE 5 ONLY)

**Phase 1: Foundation (No Dependencies)**
1. ✅ **RFC-001: Classification Engine Architecture** - COMPLETE
2. ✅ **RFC-002: Canonical Data Model & Persistence Layer** - COMPLETE

**Phase 2: Dependent Engines (Sequential)**
3. ✅ **RFC-003: Valuation & Threshold Engine Architecture** - COMPLETE
4. ✅ **RFC-004: Data Ingestion & Refresh Pipeline** - COMPLETE
5. ✅ **RFC-005: Monitoring & Alerts Engine Architecture** - COMPLETE

**ALL TIER 1 RFCs COMPLETE** (2026-04-19)

---

### Tier 2: Supporting Architecture (DEFERRED or DOWNGRADE to ADRs)

These are NOT required for V1 implementation. Address only if Tier 1 RFCs create unresolved questions:

6. **RFC-006: Workflow Orchestration** → **Likely ADR-010: V1 Batch Processing**
7. **RFC-007: Framework Config** → **Downgrade to ADR-011: Config Storage**
8. **API Contracts** → **Extract to /specs/contracts/** (not RFC)
9. **RFC-008: Observability** → **Likely ADR-012: V1 Logging Strategy**
10. **Deployment** → **ADR-013: V1 Deployment**
11. **Performance** → **ADR-014: V1 Performance Assumptions**

---

## Next Steps

1. Write RFC-001 to `/docs/rfc/RFC-001-classification-engine-architecture.md`
2. Write RFC-002 to `/docs/rfc/RFC-002-canonical-data-model-persistence.md`
3. Proceed through Tier 1 RFCs (RFC-003, RFC-004, RFC-005)
4. Evaluate Tier 2: Which should be RFCs vs ADRs vs Specs?
5. Write only what's necessary for V1 implementation

---

**End of RFC Structure Document**
