# STORY-002 — Design and Document RFC-002 Database Schema

## Epic
EPIC-001 — Platform Foundation & Deployment

## Purpose
Define the canonical database schema (RFC-002) that serves as the single source of truth for all V1 tables, columns, constraints, indexes, and relationships, ensuring consistency between documentation and implementation.

## Story
As a **system architect**,
I want **a comprehensive database schema specification (RFC-002)**,
so that **all implementation (Prisma schema, migrations) derives from a single canonical definition**.

## Outcome
- RFC-002 document exists with complete schema definitions for all 17 V1 tables
- All tables, columns, types, constraints, indexes, foreign keys documented
- JSONB field structures specified
- Relationships and cascade behaviors defined
- Schema traceable to PRD requirements
- Schema ready for Prisma implementation (STORY-004)

## Scope In
- Define all 17 tables: stocks, classification_state, valuation_state, alerts, users, user_sessions, user_monitored_stocks, user_classification_overrides, user_valuation_overrides, user_alert_preferences, user_preferences, classification_history, valuation_history, alert_history, anchored_thresholds, tsr_hurdles, framework_version
- Specify column names, data types, nullability, defaults
- Define primary keys, foreign keys, unique constraints
- Define CHECK constraints (e.g., thresholds descending order)
- Define indexes (performance, uniqueness)
- Define JSONB structures (data_provider_provenance, alert_details, default_filters, default_sort, user_preferences JSONB fields)
- Specify foreign key cascade behaviors (ON DELETE CASCADE, ON UPDATE CASCADE)
- Document table relationships (entity-relationship descriptions)
- Traceability to PRD sections (data requirements, multi-user architecture)

## Scope Out
- Prisma schema implementation (STORY-004)
- Migration scripts (STORY-004)
- Seed data content (STORY-005 - framework config)
- Database performance tuning (query optimization deferred)
- Multi-tenancy schema isolation (V1 uses user_id filtering, not schema-per-tenant)
- Historical data retention policies (V1 retains all history indefinitely)

## Dependencies
- **Epic:** EPIC-001 (Platform Foundation & Deployment)
- **PRD:** Section 15 (Data Requirements), Section 9C (Platform Architecture), Section 9A (Multi-User Architecture)
- **RFCs:** None (this IS RFC-002, foundational)
- **ADRs:** ADR-007 (Multi-User Architecture), ADR-008 (Google Cloud - Postgres), ADR-010 (Prisma ORM)
- **Upstream stories:** None (foundational)

## Preconditions
- PRD Section 15 (Data Requirements) reviewed
- ADR-007 (Multi-User Architecture) defines shared vs per-user state
- Understanding of V1 product loop (classify → value → monitor → alert → inspect)

## Inputs
- PRD Section 15 (Data Requirements)
- Epic specs (EPIC-002 through EPIC-007 - table requirements)
- ADR-007 (Multi-User Architecture - user isolation patterns)
- 3AA framework requirements (anchored thresholds, TSR hurdles structure)

## Outputs
- `/docs/rfc/RFC-002-canonical-data-model.md` (RFC document)
- Complete schema for all 17 tables
- JSONB field schemas (structure examples, required fields)
- Entity-relationship diagram (text-based or Mermaid diagram)
- Index definitions with rationale
- Constraint definitions with rationale
- Traceability matrix (table/column → PRD section)

## Acceptance Criteria
- [ ] RFC-002 document created in `/docs/rfc/`
- [ ] All 17 tables defined with complete column specifications
- [ ] Primary keys defined for all tables
- [ ] Foreign keys defined with ON DELETE CASCADE where appropriate (classification_state.ticker → stocks.ticker, valuation_state.ticker → stocks.ticker, alerts.ticker → stocks.ticker, alerts.user_id → users.user_id, etc.)
- [ ] Unique constraints defined (users.email UNIQUE, user_sessions.session_id UNIQUE, etc.)
- [ ] CHECK constraints specified (anchored_thresholds: max_threshold > comfortable_threshold > very_good_threshold > steal_threshold)
- [ ] Indexes defined for common queries (stocks.in_universe, classification_state.suggested_code, alerts.user_id + triggered_at, etc.)
- [ ] JSONB structures documented (data_provider_provenance: {field_name: {provider, synced_at, fallback_used}}, alert_details: {old_code, new_code, old_zone, new_zone}, etc.)
- [ ] Shared vs per-user tables clearly identified (shared: stocks, classification_state, valuation_state, anchored_thresholds, tsr_hurdles; per-user: alerts, user_monitored_stocks, user_classification_overrides, user_alert_preferences, etc.)
- [ ] Traceability to PRD documented (each table/column references PRD section)
- [ ] Entity-relationship descriptions included (stocks 1→N classification_state, users 1→N alerts, etc.)

## Test Strategy Expectations

**Unit tests:**
- N/A (RFC-002 is documentation, not code)

**Integration tests:**
- N/A (validation happens in STORY-004 when Prisma schema is implemented)

**Contract/schema tests:**
- RFC-002 completeness check (all 17 tables present, no tables missing)
- RFC-002 JSONB schema validation (validate example JSONB structures parse correctly)
- Constraint specification completeness (all foreign keys have ON DELETE/ON UPDATE behavior specified)

**BDD acceptance tests:**
- "Given RFC-002 document, when reviewing stocks table, then ticker, company_name, sector, industry, market_cap, in_universe columns present"
- "Given RFC-002 document, when reviewing foreign keys, then all child tables reference parent tables with CASCADE defined"
- "Given RFC-002 document, when reviewing JSONB structures, then data_provider_provenance structure includes {provider, synced_at, fallback_used}"

**E2E tests:**
- N/A (RFC-002 is design documentation)

## Regression / Invariant Risks

**Schema drift:**
- Risk: Implementation (Prisma schema) diverges from RFC-002 canonical definition
- Protection: STORY-004 includes contract tests to validate Prisma schema matches RFC-002

**Incomplete JSONB specification:**
- Risk: JSONB fields used inconsistently (missing required fields, different structures)
- Protection: Document required vs optional fields, provide canonical examples

**Missing constraints:**
- Risk: Business rules not enforced at database level (e.g., thresholds not descending)
- Protection: Specify CHECK constraints in RFC-002, enforce in migrations

**Foreign key cascade errors:**
- Risk: Deleting parent record doesn't cascade to children (orphaned records) or cascades incorrectly
- Protection: Document ON DELETE CASCADE for all foreign keys, specify expected behavior

**Invariants to protect:**
- RFC-002 is single source of truth (all implementation derives from RFC-002)
- All tables have primary keys (no tables without unique identifiers)
- Foreign keys always have cascade behavior specified (no implicit behavior)
- JSONB structures consistent across application (same field names, same structure)
- Shared state tables have no user_id (stocks, classification_state, valuation_state)
- Per-user tables always have user_id foreign key (alerts, user_monitored_stocks, user_classification_overrides)

## Key Risks / Edge Cases

**Table relationship edge cases:**
- Cascade delete propagation (delete stock → cascade to classification_state, valuation_state, alerts, user_monitored_stocks, user_classification_overrides, user_valuation_overrides)
- Orphaned records if cascade not defined (user_monitored_stocks references deleted stock)
- Circular foreign key dependencies (none expected in V1)

**JSONB structure edge cases:**
- Nested JSONB (user_preferences.default_filters contains nested objects)
- JSONB nullability (data_provider_provenance JSONB NOT NULL vs JSONB DEFAULT '{}')
- JSONB evolution (V2 adds fields, backward compatibility)

**Index strategy edge cases:**
- Composite indexes (user_id, ticker) vs separate indexes
- JSONB indexing (GIN indexes on JSONB fields for querying)
- Index size (too many indexes slow writes, too few slow reads)

**Multi-user isolation edge cases:**
- Shared state modifications (classification_state updates affect all users)
- Per-user overrides (user_classification_overrides shadows classification_state.suggested_code)
- User deletion cascade (delete user → cascade to all user-specific data: alerts, monitored stocks, overrides, preferences)

## Definition of Done

- [ ] RFC-002 document created in `/docs/rfc/RFC-002-canonical-data-model.md`
- [ ] All 17 tables documented with complete specifications
- [ ] Foreign keys and cascade behaviors defined
- [ ] JSONB structures documented with examples
- [ ] Indexes defined with query rationale
- [ ] Traceability to PRD recorded (table/column → PRD section mapping)
- [ ] Entity-relationship descriptions included
- [ ] Shared vs per-user tables identified
- [ ] Document committed to GitHub repository
- [ ] Traceability links recorded (RFC-002 references PRD Section 15, ADR-007)

## Traceability

- **Epic:** EPIC-001 — Platform Foundation & Deployment
- **PRD:** Section 15 (Data Requirements), Section 9A (Multi-User Architecture), Section 9C (Platform Architecture)
- **RFC:** None (this story creates RFC-002)
- **ADR:** ADR-007 (Multi-User Architecture), ADR-008 (Google Cloud - Postgres), ADR-010 (Prisma ORM)

---

**END STORY-002**
