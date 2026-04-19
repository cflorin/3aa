# V1 Architecture Status

**Last Updated:** 2026-04-19
**Product:** 3AA Monitoring Product V1
**Scope:** classify → value → monitor → alert → inspect

---

## Tier 1 Core Architecture - COMPLETE ✅

All 5 required Tier 1 RFCs have been completed and are ready for implementation.

### RFC-001: Classification Engine Architecture ✅
**Status:** COMPLETE
**Location:** `/docs/rfc/RFC-001-classification-engine-architecture.md`

**Defines:**
- Deterministic scoring algorithm (additive scoring per bucket/quality)
- Tie-break resolution rules (3 vs 4, 4 vs 5, 5 vs 6, 6 vs 7)
- Confidence computation (high/medium/low)
- Manual override semantics (preserve both suggested and final codes)
- Special case overrides (binary_flag forces Bucket 8)
- Missing data handling strategy

**Key Interfaces:**
```typescript
interface ClassificationEngine {
  classifyStock(input: ClassificationInput): ClassificationResult;
  shouldRecompute(current: ClassificationInput, previous: ClassificationInput): RecomputeDecision;
}
```

---

### RFC-002: Canonical Data Model & Persistence Layer ✅
**Status:** COMPLETE
**Location:** `/docs/rfc/RFC-002-canonical-data-model-persistence.md`

**Defines:**
- Complete SQL schemas for 7 core tables + framework config tables
- Multi-provider data architecture support (Tiingo + FMP)
- Provenance tracking via JSONB fields
- Audit trail structure (full state snapshots, not deltas)
- Data freshness status tracking
- Framework configuration storage (anchored_thresholds, tsr_hurdles)

**Core Tables:**
- `stocks` - Universe identity and fundamental data with multi-provider support
- `classification_state` - Current suggested/final codes
- `classification_history` - Full audit trail
- `valuation_state` - Current metrics, thresholds, zones
- `valuation_history` - Full audit trail
- `alerts` - Active/acknowledged/resolved alerts
- `alert_history` - Archived alerts
- `anchored_thresholds` - Framework threshold table
- `tsr_hurdles` - Base TSR hurdles by bucket

**Critical Features:**
- `data_provider_provenance` JSONB field for field-level source tracking
- `forward_pe_source` enum: `tiingo | fmp | computed_trailing | manual_override | missing`
- Immutable history tables for full auditability

---

### RFC-003: Valuation & Threshold Engine Architecture ✅
**Status:** COMPLETE
**Location:** `/docs/rfc/RFC-003-valuation-threshold-engine-architecture.md`

**Defines:**
- Metric selection rules by bucket (Forward P/E for 1-4, Forward EV/EBIT for 5, EV/Sales for 6-7)
- Current multiple computation approach
- Anchored threshold lookup vs derived threshold generation
- TSR hurdle calculation with quality adjustments
- Valuation zone assignment (steal/very_good/comfortable/max/expensive)
- Secondary adjustments (gross margin, dilution, cyclicality)
- Multi-provider data architecture (FMP primary for forward estimates)

**Key Logic:**
```typescript
function selectPrimaryMetric(active_code: string, flags: ManualFlags): {
  primary_metric: string;
  metric_reason: string;
}
```

**Threshold Source Transparency:**
- `anchored` - Explicitly defined in framework table
- `derived` - Mechanically derived using downgrade rules
- `manual_override` - User judgment override

---

### RFC-004: Data Ingestion & Refresh Pipeline ✅
**Status:** COMPLETE
**Location:** `/docs/rfc/RFC-004-data-ingestion-refresh-pipeline.md`
**Related ADR:** ADR-015: Multi-Provider Data Architecture

**Defines:**
- Provider-agnostic VendorAdapter abstraction
- ProviderOrchestrator for field-level fallback logic
- Tiingo + FMP support with configurable provider strategy
- Forward estimate handling (FMP primary, Tiingo fallback, computed trailing as final fallback)
- Provenance tracking for all synced fields
- Refresh scheduling (daily EOD batch)
- Change detection for recompute triggers
- Universe eligibility filtering ($5bn+ market cap, US)

**Provider Selection Strategy:**
| Field Category | Primary | Fallback | Rationale |
|----------------|---------|----------|-----------|
| EOD Prices | Tiingo | FMP | Either reliable |
| Historical Fundamentals | Tiingo | FMP | Tiingo comprehensive |
| **Forward Estimates** | **FMP** | **Tiingo** | **FMP superior coverage (~85% vs ~60%)** |

**Refresh Schedule:**
| Task | Frequency | Time |
|------|-----------|------|
| Universe Sync | Weekly | Sunday 2am |
| Price Sync | Daily | 5pm ET |
| Fundamentals Sync | Daily | 6pm ET |
| Forward Estimates Sync | Daily | 7pm ET |
| Recompute Triggers | Daily | 8:30pm ET |

**Key Interfaces:**
```typescript
interface VendorAdapter {
  readonly providerName: 'tiingo' | 'fmp';
  fetchUniverse(minMarketCapMillions: number): Promise<UniverseStock[]>;
  fetchEODPrice(ticker: string, date?: Date): Promise<PriceData | null>;
  fetchFundamentals(ticker: string): Promise<FundamentalData | null>;
  fetchForwardEstimates(ticker: string): Promise<ForwardEstimates | null>;
}

interface ProviderOrchestrator {
  fetchFieldWithFallback<T>(
    ticker: string,
    fieldName: string,
    providers: VendorAdapter[]
  ): Promise<FieldResult<T>>;
}
```

---

### RFC-005: Monitoring & Alerts Engine Architecture ✅
**Status:** COMPLETE
**Location:** `/docs/rfc/RFC-005-monitoring-alerts-engine-architecture.md`

**Defines:**
- State diffing algorithm (current vs prior state comparison)
- 3 alert families: valuation_opportunity, classification_change, data_quality
- Alert generation triggers (zone entry, code change, stale data)
- Deduplication strategy with cooldown windows (24h for valuation/classification, 12h for data quality)
- Priority assignment rules (steal_zone=critical, very_good_zone=high)
- Alert lifecycle (active → acknowledged → resolved → archived)
- Alert inspection view requirements (read-only, no decision workflows)

**Alert Families:**

1. **Valuation Opportunity Alerts**
   - Generate on entry to `very_good_zone` or `steal_zone`
   - Generate on `very_good_zone` → `steal_zone` transition
   - DO NOT generate for `comfortable_zone` or `max_zone`

2. **Classification Change Alerts**
   - Generate when `suggested_code` changes materially
   - Generate when `confidence_level` drops from high → medium/low

3. **Data Quality Alerts**
   - Generate when `data_freshness_status` degrades
   - Generate when critical field becomes missing

**Monitoring Schedule:**
```
8:30 PM ET  - State snapshot capture
8:35 PM ET  - State diff detection
8:40 PM ET  - Alert generation
8:45 PM ET  - Deduplication filter
8:50 PM ET  - Alert persistence
9:00 PM ET  - Alert inspection view updated
```

**Key Interfaces:**
```typescript
interface Alert {
  alert_id: string;
  ticker: string;
  alert_family: 'valuation_opportunity' | 'classification_change' | 'data_quality';
  alert_type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  metadata: { prior_state: any; current_state: any; change_summary: any; };
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  created_at: Date;
}
```

---

## Architecture Decision Records

### ADR-015: Multi-Provider Data Architecture ✅
**Status:** ACCEPTED
**Location:** `/docs/adr/ADR-015-multi-provider-data-architecture.md`

**Decision:** V1 shall implement multi-provider data architecture supporting Tiingo and FMP via VendorAdapter abstraction, with field-level provider selection and provenance tracking.

**Rationale:**
- FMP provides ~85% forward estimate coverage vs Tiingo's ~60%
- Bucket 1-4 stocks require forward P/E for valuation
- Missing forward estimates force `manual_required` state (not scalable for 1000-stock universe)
- Multi-provider reduces manual intervention by ~25%

**Consequences:**
- ✅ Data quality optimization via best provider per field category
- ✅ Resilience to single provider outage
- ✅ Future-proof for Bloomberg, FactSet, etc.
- ⚠️ Complexity in orchestration, fallback logic, provenance tracking
- ⚠️ Dual API subscription costs (acceptable for V1 scale)

---

## V1 Architecture Summary

### What's Defined
✅ Classification engine (deterministic scoring, tie-breaks, confidence)
✅ Data model (7 core tables + framework config, multi-provider support)
✅ Valuation engine (metric selection, threshold assignment, zone computation)
✅ Data ingestion (multi-provider orchestration, daily batch refresh)
✅ Monitoring & alerts (state diffing, 3 alert families, deduplication)

### What's NOT Defined (Implementation Details)
- Specific technology stack (Postgres vs MySQL, Node.js vs Python)
- UI framework and component design
- Deployment architecture (Docker, Kubernetes, serverless)
- Specific vendor API implementations (implementation detail)
- Error retry policies (operational concern)
- Caching strategies (premature optimization for V1)

### What's Out of V1 Scope
❌ Manual TSR estimation workflow
❌ Deep review / thesis journaling
❌ Portfolio construction recommendations
❌ Entry permission / stabilization rules
❌ Buy/sell/trim decision workflows
❌ Execution and trade management

---

## Next Steps

### Option 1: Tier 2 Supporting RFCs (Optional)
These refine operational characteristics but are NOT required for V1 implementation:

- **RFC-006: Workflow Orchestration** → Likely downgrade to **ADR: V1 Batch Processing Strategy**
- **RFC-007: Framework Configuration** → Likely downgrade to **ADR: Config Storage Strategy**
- **RFC-008: Observability & Telemetry** → Likely downgrade to **ADR: V1 Logging Strategy**
- **API Contracts Extraction** → Extract to `/specs/contracts/` (not full RFC)
- **ADR: Deployment Architecture** → Single-process vs microservices
- **ADR: Performance Assumptions** → 1000 stocks, nightly batch, <2s latency

**Recommendation:** Default to simplicity for V1. Create ADRs only if Tier 1 RFCs left unresolved operational questions.

---

### Option 2: Implementation Specs (Detailed Algorithm Documentation)
Extract detailed specifications from RFCs for implementation:

- `/specs/engines/classification-scoring-rules.md` - Bucket/quality scoring tables
- `/specs/engines/valuation-metric-selection.md` - Metric selection decision tree
- `/specs/engines/threshold-derivation-algorithm.md` - Mechanical derivation formulas
- `/specs/schemas/stocks-schema.sql` - Complete SQL DDL
- `/specs/schemas/classification-schema.sql` - Classification tables DDL
- `/specs/schemas/valuation-schema.sql` - Valuation tables DDL
- `/specs/schemas/alerts-schema.sql` - Alerts tables DDL
- `/specs/contracts/classification-engine.ts` - TypeScript interfaces
- `/specs/contracts/valuation-engine.ts` - TypeScript interfaces
- `/specs/contracts/monitoring-engine.ts` - TypeScript interfaces
- `/specs/contracts/data-ingestion.ts` - TypeScript interfaces

---

### Option 3: User Stories and Implementation Tasks
Break RFCs into implementation tasks:

- `/stories/epics/EPIC-001-classification-engine.md`
- `/stories/epics/EPIC-002-data-model-setup.md`
- `/stories/epics/EPIC-003-valuation-engine.md`
- `/stories/epics/EPIC-004-data-ingestion.md`
- `/stories/epics/EPIC-005-monitoring-alerts.md`

Each epic would contain:
- `/stories/tasks/TASK-001-setup-database-schema.md` (references RFC-002)
- `/stories/tasks/TASK-002-implement-classification-scoring.md` (references RFC-001)
- `/stories/tasks/TASK-003-implement-tiingo-adapter.md` (references RFC-004, ADR-015)
- etc.

---

### Option 4: Begin Implementation
Start coding based on completed RFCs:

1. Database schema creation (RFC-002)
2. Provider adapter implementations (RFC-004)
3. Classification engine implementation (RFC-001)
4. Valuation engine implementation (RFC-003)
5. Monitoring engine implementation (RFC-005)

---

## API Key Requirements (V1)

Based on ADR-015, V1 launch requires:
- `TIINGO_API_KEY` - For historical fundamentals, EOD prices, fallback forward estimates
- `FMP_API_KEY` - For primary forward estimates, fallback fundamentals

---

## Documentation Completeness

### ✅ Complete
- Product Requirements (7 PRD documents in `/docs/prd/`)
- V1 Core Architecture (5 Tier 1 RFCs)
- Multi-provider data strategy (ADR-015)
- RFC governance framework (`/docs/architecture/v1-rfc-structure.md`)

### 🔄 Optional / Deferred
- Tier 2 Supporting RFCs (likely downgrade to ADRs)
- Detailed implementation specs (extract from RFCs as needed)
- User stories and task breakdown
- BDD test specifications
- Operational runbooks

---

## Tier 1 RFC Cross-References

**Classification → Valuation:**
- RFC-001 defines `suggested_code` and `final_code`
- RFC-003 consumes `active_code = final_code || suggested_code`

**Classification → Monitoring:**
- RFC-001 defines `classification_state` schema
- RFC-005 consumes classification state for diff detection

**Valuation → Monitoring:**
- RFC-003 defines `valuation_state` schema and valuation zones
- RFC-005 consumes valuation state for alert generation

**Data Model → All Engines:**
- RFC-002 defines canonical schemas
- All engines (RFC-001, RFC-003, RFC-004, RFC-005) read/write to these tables

**Data Ingestion → All Engines:**
- RFC-004 populates `stocks` table
- Classification/Valuation engines consume stock fundamentals
- Monitoring engine triggers on data quality degradation

---

## Architecture Principles Established

1. **Provider-agnostic data layer** - VendorAdapter abstraction supports multiple providers
2. **Field-level provenance** - Track source provider for every data field
3. **Explicit failure handling** - Missing data → `manual_required`, never silent fabrication
4. **Immutable audit trails** - Full state snapshots, never deltas
5. **Threshold source transparency** - Always distinguish anchored vs derived vs manual override
6. **Low-noise alerts** - Deduplication, cooldown windows, zone-entry-only triggers
7. **Manual override preservation** - Store both system suggestion and user override
8. **Deterministic engine behavior** - Same inputs produce same outputs
9. **Batch processing for V1** - Nightly batch, not event-driven (simplicity)
10. **Read-only inspection** - Alert view is informational, not decision workflow

---

**Status:** All Tier 1 architecture complete. Ready for implementation or optional refinement.

**Last Review:** 2026-04-19
