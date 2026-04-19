# STORY-002: Design and Document RFC-002 Database Schema

**Epic:** EPIC-001 — Platform Foundation & Deployment
**Status:** ready
**Dependencies:** None
**Estimated Complexity:** Medium

## Story Overview

Design and document the complete canonical data model for the 3AA Monitoring Product in RFC-002, including all tables, relationships, JSONB structures, indexing strategies, and data retention policies.

## Acceptance Criteria

1. RFC-002 document exists at `/docs/rfc/RFC-002-canonical-data-model-persistence.md`
2. All required tables are defined with complete SQL schema definitions
3. JSONB field structures are documented with examples
4. Entity relationships are documented with diagrams
5. Indexing strategy is defined for common query patterns
6. Data retention policies are specified
7. Framework configuration storage approach is documented
8. Migration strategy is outlined

## Evidence Required

- [x] RFC-002 document created
- [x] Minimum 17 tables defined with SQL schemas
- [x] JSONB structures documented
- [x] Entity relationship diagram included
- [x] Indexing strategy documented
- [x] Data retention policy specified

## Task Breakdown

### TASK-002-001: Verify RFC-002 Document Exists and Structure

**Description:** Verify that RFC-002 exists in the correct location with proper metadata and structure.

**Acceptance Criteria:**
- RFC-002 file exists at `/docs/rfc/RFC-002-canonical-data-model-persistence.md`
- Document has required metadata (Status, Tier, Created, Dependencies)
- Document status is ACCEPTED
- Document structure includes Context, Goals, Schema Definitions, etc.

**BDD Scenario:**
```gherkin
Given the RFC directory exists at /docs/rfc/
When I check for RFC-002-canonical-data-model-persistence.md
Then the file should exist
And the file should contain "Status: ACCEPTED"
And the file should have sections for Schema Definitions
```

---

### TASK-002-002: Validate All Required Tables Are Defined

**Description:** Verify that all required database tables are defined with complete SQL CREATE TABLE statements.

**Acceptance Criteria:**
- At least 17 tables are defined
- Each table has a complete SQL CREATE TABLE statement
- Tables include: stocks, classification_state, classification_history, valuation_state, valuation_history, alerts, alert_history, anchored_thresholds, tsr_hurdles, framework_version, users, user_sessions, user_monitored_stocks, user_classification_overrides, user_valuation_overrides, user_alert_preferences, user_preferences
- All tables have appropriate PRIMARY KEY constraints
- Foreign key relationships are defined

**BDD Scenario:**
```gherkin
Given RFC-002 document exists
When I count the CREATE TABLE statements
Then I should find at least 17 table definitions
And each table should have a PRIMARY KEY
And tables should include all core entities (stocks, classification_state, valuation_state, alerts, users, etc.)
```

**Verification Commands:**
```bash
grep -c "CREATE TABLE" docs/rfc/RFC-002-canonical-data-model-persistence.md  # Should be >= 17
grep "CREATE TABLE" docs/rfc/RFC-002-canonical-data-model-persistence.md     # List all tables
```

---

### TASK-002-003: Verify JSONB Structures Are Documented

**Description:** Verify that all JSONB fields have their structures documented with field descriptions and examples.

**Acceptance Criteria:**
- All JSONB columns are identified in table schemas
- JSONB field structures are documented with nested field names
- Examples are provided for complex JSONB structures
- JSONB fields include comments explaining their purpose

**BDD Scenario:**
```gherkin
Given RFC-002 document exists
When I search for JSONB field definitions
Then I should find JSONB columns with structure documentation
And JSONB fields should have explanatory comments
And complex structures should have examples
```

**Verification Commands:**
```bash
grep -i "JSONB" docs/rfc/RFC-002-canonical-data-model-persistence.md  # List all JSONB fields
```

---

### TASK-002-004: Validate Entity Relationships and Diagrams

**Description:** Verify that entity relationships are documented and an entity relationship diagram is provided.

**Acceptance Criteria:**
- Entity relationship diagram is included
- Diagram shows shared (system-computed) vs user-scoped entities
- Foreign key relationships are clearly documented
- Cardinality (1:1, 1:n, etc.) is specified

**BDD Scenario:**
```gherkin
Given RFC-002 document exists
When I look for entity relationship documentation
Then I should find an entity relationship diagram
And the diagram should distinguish shared vs user-scoped entities
And foreign key relationships should be documented
```

---

### TASK-002-005: Verify Supporting Documentation

**Description:** Verify that indexing strategy, data retention policies, and migration strategy are documented.

**Acceptance Criteria:**
- Indexing strategy section exists with query patterns
- Data retention policy is specified for each table type
- Migration strategy is outlined
- Performance considerations are documented
- Constraints and invariants are defined

**BDD Scenario:**
```gherkin
Given RFC-002 document exists
When I check for supporting sections
Then I should find "Indexing Strategy" section
And I should find "Data Retention" section
And I should find "Migration Strategy" section
And I should find "Performance Considerations" section
```

---

### TASK-002-006: Update Implementation Tracking

**Description:** Update implementation tracking documents to mark STORY-002 as complete.

**Acceptance Criteria:**
- IMPLEMENTATION-PLAN-V1.md updated with STORY-002 status = done
- IMPLEMENTATION-LOG.md updated with STORY-002 completion entry
- stories/README.md updated with progress (2/9 complete)
- Git commit created with proper traceability tags

**BDD Scenario:**
```gherkin
Given all STORY-002 tasks are complete
When I update implementation tracking
Then STORY-002 should be marked as "done"
And implementation log should have completion entry
And changes should be committed with EPIC-001/STORY-002 tag
```

---

## Traceability

**PRD Reference:** Section 9C (Data Architecture)
**RFC Reference:** RFC-002 (Canonical Data Model & Persistence Layer)
**ADR References:**
- ADR-003 (Audit Trail - Full State Snapshots)
- ADR-007 (Multi-User Architecture)
- ADR-010 (Technology Stack - TypeScript + Next.js + Prisma)

---

**Created:** 2026-04-19
**Last Updated:** 2026-04-19 20:45 UTC
