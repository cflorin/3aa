# V1 RFC Roadmap and Analysis

**Date:** 2026-04-19
**Status:** Planning
**V1 Scope:** classify → value → monitor → alert → inspect

## 1. Architecture Synthesis

### Core V1 Product Loop
```
Stock enters universe
    ↓
Classification Engine → suggested_code + confidence
    ↓
Manual Review/Override → final_code
    ↓
Valuation Engine → metric + thresholds + zone + TSR hurdle
    ↓
Monitoring Engine → compare current vs prior state
    ↓
Alert Generation → zone transitions, classification changes, data quality issues
    ↓
Alert Feed → deduplicated, prioritized alerts
    ↓
Alert Inspection View → read-only stock detail showing why alert fired
```

### Major Architectural Components Required

**1. Classification Engine**
- Input: Stock fundamentals + manual flags
- Output: Suggested 3AA code, confidence, reason codes
- Characteristics: Deterministic, rules-based, additive scoring
- Persistence: classification_state, classification_history
- Dependencies: None (foundational)

**2. Valuation & Threshold Engine**
- Input: Active code (final_code || suggested_code)
- Output: Primary metric, current multiple, thresholds, zone, TSR hurdle
- Characteristics: Deterministic metric selection, anchored/derived thresholds
- Persistence: valuation_state, valuation_history
- Dependencies: Classification output, threshold anchor tables

**3. Monitoring & Alerts Engine**
- Input: Current framework state (classification + valuation)
- Output: Alert events (valuation, classification, data quality)
- Characteristics: State diffing, deduplication, prioritization
- Persistence: alerts, alert_history
- Dependencies: Both classification and valuation outputs

**4. Data Model & Persistence Layer**
- Responsibility: Canonical schema for all entities
- Entities: stocks, classification_state/history, valuation_state/history, alerts/history
- Characteristics: Full audit trail, immutable history events
- Dependencies: None (foundational)

**5. Data Ingestion & Refresh Pipeline**
- Input: External vendor data (fundamentals, prices)
- Output: Populated stock fundamentals, freshness metadata
- Characteristics: Scheduled refresh, change detection, recompute triggers
- Persistence: stocks table, data_freshness metadata
- Dependencies: Data model

**6. Universe Management**
- Responsibility: Filter eligible stocks ($5bn+ market cap, US-listed)
- Output: In/out of universe status
- Characteristics: Scheduled evaluation, historical eligibility tracking
- Dependencies: Stock data

**7. Framework Configuration Management**
- Responsibility: Store and version anchored threshold tables, TSR hurdle tables
- Output: Canonical framework parameters
- Characteristics: Versioned, immutable, auditable changes
- Dependencies: None (foundational)

### Cross-Cutting Concerns

**Event-Driven Coordination**
- Classification change → triggers valuation recompute
- Valuation change → triggers alert evaluation
- Data refresh → triggers classification/valuation recompute

**Observability**
- Structured logging for all engine operations
- Metrics for confidence distributions, alert rates, missing data patterns
- Distributed tracing for full workflow visibility

**State Consistency**
- Transactional boundaries between classification and valuation updates
- Idempotent recomputation (same inputs → same outputs)
- Concurrent update handling (if data refreshes during manual override)

---

## 2. Full RFC Candidate List

### Tier 1: Core Engines (V1 Critical Path)
1. **RFC-001: Classification Engine Architecture** ✅ (already outlined)
2. **RFC-002: Canonical Data Model & Persistence Layer**
3. **RFC-003: Valuation & Threshold Engine Architecture**
4. **RFC-004: Monitoring & Alerts Engine Architecture**

### Tier 2: Infrastructure & Integration (V1 Required)
5. **RFC-005: Data Ingestion & Refresh Pipeline**
6. **RFC-006: Framework Configuration Management**
7. **RFC-007: Universe Management & Eligibility**

### Tier 3: System-Level Concerns (V1 Required)
8. **RFC-008: Event-Driven Workflow Orchestration**
9. **RFC-009: Observability & Telemetry Architecture**
10. **RFC-010: API Contracts & Service Boundaries**

### Tier 4: User-Facing Layer (V1 Required)
11. **RFC-011: Alert Inspection View Architecture** (minimal - read-only rendering)

### Tier 5: V1.1+ Deferred
12. **RFC-012: Manual TSR Workflow** (explicitly out of V1 scope)
13. **RFC-013: Portfolio Construction** (explicitly out of V1 scope)
14. **RFC-014: Entry Permission & Stabilization** (explicitly out of V1 scope)

---

## 3. Recommended RFCs for V1

**INCLUDE in V1:**
- RFC-001 through RFC-011 (all Tier 1-4)

**EXCLUDE from V1:**
- RFC-012 through RFC-014 (Tier 5)

**Rationale:**
- Tier 1 engines implement the core product loop
- Tier 2 infrastructure provides data and configuration
- Tier 3 system concerns ensure production readiness
- Tier 4 delivers the inspection view (monitoring output)
- Tier 5 explicitly excluded per V1 scope boundaries

---

## 4. Recommended Order

### Phase 1: Foundation (Weeks 1-2)
```
RFC-002: Data Model & Persistence Layer
    ↓
RFC-006: Framework Configuration Management
```
**Why first:** These are foundational; all engines depend on schema and configuration.

### Phase 2: Core Engines (Weeks 3-6)
```
RFC-001: Classification Engine Architecture
    ↓
RFC-003: Valuation & Threshold Engine Architecture
    ↓ (parallel)
RFC-007: Universe Management & Eligibility
```
**Why this order:** Classification has no dependencies. Valuation depends on classification output. Universe management can proceed in parallel once data model is frozen.

### Phase 3: Integration & Orchestration (Weeks 7-8)
```
RFC-005: Data Ingestion & Refresh Pipeline
    ↓
RFC-008: Event-Driven Workflow Orchestration
```
**Why now:** Engines exist; now define how data flows through them and how they coordinate.

### Phase 4: Monitoring Output (Weeks 9-10)
```
RFC-004: Monitoring & Alerts Engine Architecture
    ↓
RFC-011: Alert Inspection View Architecture
```
**Why last:** Monitoring consumes all prior outputs. Inspection view renders monitoring output.

### Phase 5: Production Readiness (Weeks 11-12)
```
RFC-009: Observability & Telemetry Architecture
    ↓
RFC-010: API Contracts & Service Boundaries
```
**Why last:** Once all components exist, finalize contracts and observability.

### Adjusted Sequence (Dependency-Optimized)

**Actual Recommended Order:**
1. **RFC-002: Data Model & Persistence Layer** (no dependencies)
2. **RFC-006: Framework Configuration Management** (no dependencies)
3. **RFC-001: Classification Engine Architecture** (depends: RFC-002)
4. **RFC-003: Valuation & Threshold Engine Architecture** (depends: RFC-001, RFC-002, RFC-006)
5. **RFC-007: Universe Management & Eligibility** (depends: RFC-002)
6. **RFC-005: Data Ingestion & Refresh Pipeline** (depends: RFC-002, RFC-007)
7. **RFC-008: Event-Driven Workflow Orchestration** (depends: RFC-001, RFC-003, RFC-005)
8. **RFC-004: Monitoring & Alerts Engine Architecture** (depends: RFC-001, RFC-003, RFC-008)
9. **RFC-010: API Contracts & Service Boundaries** (depends: all engines)
10. **RFC-011: Alert Inspection View Architecture** (depends: RFC-004, RFC-010)
11. **RFC-009: Observability & Telemetry Architecture** (cross-cutting; can be written earlier but benefits from seeing all components)

---

## 5. What Should NOT Be RFCs

### UI Component Implementation
- **Not RFC:** Specific React components for alerts feed
- **Not RFC:** Form controls for manual override
- **Not RFC:** Styling, themes, responsive design
- **Why:** Implementation detail; V1 PRDs specify UX requirements sufficiently

### Deployment & Infrastructure
- **Not RFC:** Kubernetes manifests
- **Not RFC:** CI/CD pipeline configuration
- **Not RFC:** Database choice (Postgres vs MySQL)
- **Why:** Operational concern, not architectural decision affecting product behavior

### Specific Test Cases
- **Not RFC:** Unit test for "bucket 3 vs 4 tie-break with revenue growth 7.5%"
- **Why:** Test specifications go in `/tests/bdd/`, not RFCs

### Out-of-Scope V1 Features
- **Not RFC (yet):** Manual TSR estimation workflow
- **Not RFC (yet):** Portfolio position tracking
- **Not RFC (yet):** Entry permission technical indicators
- **Why:** Explicitly excluded from V1 scope

### Vendor-Specific Integrations
- **Not RFC:** "How to integrate Yahoo Finance API"
- **Why:** RFC-005 defines ingestion architecture; specific vendor adapters are implementation details

### Configuration Files
- **Not RFC:** Exact JSON structure for app config
- **Why:** Implementation detail unless it affects architectural contracts

---

## 6. Missing Prerequisite Documents

### Critical Gaps for V1 Implementation

**GAP-001: Exact Rule Weights and Thresholds**
- **Missing:** Numeric score values for each classification rule
- **Needed for:** RFC-001 implementation
- **Recommendation:** Create **ADR-001: Classification Scoring Algorithm Weights**
- **Example:** "Bucket 4 rule 'revenue_growth_fwd in [8%, 15%]' contributes +3 points"

**GAP-002: Confidence Tier Boundaries**
- **Missing:** Exact numeric thresholds for high/medium/low confidence
- **Needed for:** RFC-001 implementation
- **Recommendation:** Create **ADR-002: Confidence Threshold Boundaries**
- **Example:** "High confidence requires score separation ≥5 AND missing_fields ≤1"

**GAP-003: Recomputation Trigger Precision**
- **Missing:** Exact % change thresholds for "material fundamental update"
- **Needed for:** RFC-005, RFC-008 implementation
- **Recommendation:** Create **ADR-003: Recomputation Trigger Thresholds**
- **Example:** "revenue_growth_fwd change ≥5% absolute triggers recompute"

**GAP-004: Threshold Derivation Rounding Rules**
- **Missing:** How derived thresholds are rounded (nearest 0.5? 0.1?)
- **Needed for:** RFC-003 implementation
- **Recommendation:** Create **ADR-004: Threshold Derivation Rounding Policy**
- **Example:** "All P/E thresholds rounded to nearest 0.5x"

**GAP-005: Alert Deduplication Key Design**
- **Missing:** Exact dedup key structure and hash algorithm
- **Needed for:** RFC-004 implementation
- **Recommendation:** Create **ADR-005: Alert Deduplication Strategy**
- **Example:** "dedup_key = SHA256(ticker + alert_type + zone + active_code)"

**GAP-006: Data Freshness SLAs**
- **Missing:** Exact staleness thresholds per data category
- **Needed for:** RFC-005 implementation
- **Recommendation:** Create **Spec: Data Freshness Requirements** in `/specs/schemas/`
- **Example:** "Prices: stale after 1 day; Fundamentals: stale after 7 days"

**GAP-007: Historical State Snapshot Depth**
- **Missing:** Full state vs delta storage for audit trail
- **Needed for:** RFC-002 implementation
- **Recommendation:** Create **ADR-006: Audit Trail Storage Strategy**
- **Example:** "Store full state snapshot on every classification_history event"

**GAP-008: Concurrent Update Conflict Resolution**
- **Missing:** What happens if user overrides during auto-recompute?
- **Needed for:** RFC-008 implementation
- **Recommendation:** Create **ADR-007: Concurrent Update Conflict Resolution**
- **Example:** "Manual override always wins; discard in-flight recompute"

### Nice-to-Have (Not Blocking V1)

**OPTIONAL-001: Metric Calculation Specifications**
- **Missing:** Exact formulas for forward P/E, EV/EBIT, etc.
- **Reason:** Can assume vendor provides these directly
- **Recommendation:** Document in `/specs/schemas/vendor-data-contracts.md`

**OPTIONAL-002: UI Wireframes**
- **Missing:** Detailed screen mockups for alerts feed, inspection view
- **Reason:** UX requirements in PRDs are sufficient; final UI is iterative
- **Recommendation:** Create in `/docs/architecture/ui-mockups/` if needed

---

## 7. Exact RFCs to Write Next (In Order)

### Immediate Next Steps (Write These RFCs)

#### 1. RFC-002: Canonical Data Model & Persistence Layer
**Why First:** Foundation for all engines; no dependencies
**Includes:**
- Complete SQL schema for all V1 entities
- Entity relationships and foreign keys
- Indexing strategy for performance
- Audit trail event structure
- Data retention policies
- Migration strategy from empty DB to initial state

**Dependencies:** None
**Blocks:** RFC-001, RFC-003, RFC-004, RFC-005, RFC-007

---

#### 2. RFC-006: Framework Configuration Management
**Why Second:** Provides anchored threshold tables and TSR hurdle tables needed by valuation engine
**Includes:**
- Storage mechanism for anchored threshold table (DB vs config file vs code)
- Versioning strategy for framework parameters
- How to handle framework updates without breaking history
- Configuration validation on startup
- Rollback strategy if framework config is corrupted

**Dependencies:** None (can be config files or DB table)
**Blocks:** RFC-003

---

#### 3. RFC-001: Classification Engine Architecture
**Why Third:** No engine dependencies; ready to implement once data model exists
**Includes:** (Already outlined previously)
- Bucket/quality scoring algorithms
- Tie-break rules
- Confidence computation
- Missing data handling
- Manual override semantics
- Recomputation triggers
- Classification state persistence

**Dependencies:** RFC-002
**Blocks:** RFC-003, RFC-008

---

#### 4. RFC-003: Valuation & Threshold Engine Architecture
**Why Fourth:** Depends on classification output and framework config
**Includes:**
- Metric selection rules by bucket
- Current multiple computation
- Threshold lookup (anchored) vs derivation (missing codes)
- TSR hurdle calculation with quality adjustments
- Valuation zone assignment
- Secondary adjustments (gross margin, dilution, cyclicality)
- Valuation state persistence
- Recomputation triggers

**Dependencies:** RFC-001, RFC-002, RFC-006
**Blocks:** RFC-004, RFC-008

---

#### 5. RFC-007: Universe Management & Eligibility
**Why Fifth:** Defines which stocks enter the system; relatively independent
**Includes:**
- Eligibility criteria (market cap, country)
- Universe refresh cadence
- In/out of universe transitions
- Historical eligibility tracking
- Handling stocks that drop below threshold
- Persistence of universe membership changes

**Dependencies:** RFC-002
**Blocks:** RFC-005

---

#### 6. RFC-005: Data Ingestion & Refresh Pipeline
**Why Sixth:** Needs to know data model and universe scope
**Includes:**
- Vendor data source architecture (abstract interface)
- Refresh scheduling (daily, weekly, on-demand)
- Change detection for recompute triggers
- Data validation and quality checks
- Freshness tracking
- Failure handling (partial refresh, stale data)
- Idempotency guarantees

**Dependencies:** RFC-002, RFC-007
**Blocks:** RFC-008

---

#### 7. RFC-008: Event-Driven Workflow Orchestration
**Why Seventh:** Coordinates classification → valuation → monitoring flow
**Includes:**
- Event types (classification_changed, valuation_changed, data_refreshed)
- Event bus architecture (sync vs async, in-process vs message queue)
- Recomputation cascade logic
- Transactional boundaries
- Idempotency and retry logic
- Dead letter queue for failed events
- Ordering guarantees

**Dependencies:** RFC-001, RFC-003, RFC-005
**Blocks:** RFC-004

---

#### 8. RFC-004: Monitoring & Alerts Engine Architecture
**Why Eighth:** Consumes all prior workflow outputs
**Includes:**
- State diffing algorithm (current vs prior)
- Alert family detection (valuation, classification, data quality)
- Deduplication strategy and cooldown windows
- Priority assignment rules
- Alert payload structure
- Alert state transitions (active, acknowledged, resolved, suppressed)
- Alert persistence and history
- Alert feed querying and filtering

**Dependencies:** RFC-001, RFC-003, RFC-008
**Blocks:** RFC-011

---

#### 9. RFC-010: API Contracts & Service Boundaries
**Why Ninth:** Formalizes interfaces between all components
**Includes:**
- Classification Engine API contract
- Valuation Engine API contract
- Monitoring Engine API contract
- Universe Manager API contract
- Data Ingestion API contract
- Internal event schemas
- Error handling conventions
- Versioning strategy

**Dependencies:** All engine RFCs
**Blocks:** RFC-011

---

#### 10. RFC-011: Alert Inspection View Architecture
**Why Tenth:** Renders monitoring output for user consumption
**Includes:**
- Data retrieval for stock detail (joins classification + valuation + alert)
- Alert explanation logic (why did this alert fire?)
- Recent alert history for stock
- Read-only guarantee (no state mutations)
- Caching strategy for performance
- Rendering requirements (not React specifics, but data structure)

**Dependencies:** RFC-004, RFC-010
**Blocks:** None (end of critical path)

---

#### 11. RFC-009: Observability & Telemetry Architecture
**Why Last:** Cross-cutting; benefits from seeing all components
**Includes:**
- Structured logging schema
- Metrics taxonomy (counters, histograms, gauges)
- Distributed tracing strategy
- Error tracking and alerting
- Performance monitoring
- Audit log querying
- Dashboard requirements

**Dependencies:** None (cross-cutting), but benefits from all prior RFCs
**Blocks:** None

---

## Summary: Write These 11 RFCs in This Exact Order

1. ✅ **RFC-001: Classification Engine Architecture** (already outlined)
2. **RFC-002: Canonical Data Model & Persistence Layer**
3. **RFC-006: Framework Configuration Management**
4. **RFC-003: Valuation & Threshold Engine Architecture**
5. **RFC-007: Universe Management & Eligibility**
6. **RFC-005: Data Ingestion & Refresh Pipeline**
7. **RFC-008: Event-Driven Workflow Orchestration**
8. **RFC-004: Monitoring & Alerts Engine Architecture**
9. **RFC-010: API Contracts & Service Boundaries**
10. **RFC-011: Alert Inspection View Architecture**
11. **RFC-009: Observability & Telemetry Architecture**

---

## Document Precedence Applied

All recommendations above strictly follow:
1. ✅ **source_of_truth_investment_framework_3AA.md** - Framework rules, bucket definitions, threshold tables
2. ✅ **3_aa_product_full_v_1_prd_v_1.md** - V1 scope boundaries, workflow sequence, exclusions
3. ✅ **Workflow PRDs** - Classification, valuation, monitoring workflow details
4. ✅ **Engine/spec docs** - Rules engine spec, threshold derivation spec

No RFC introduces scope beyond these documents.

---

**End of RFC Roadmap Analysis**
