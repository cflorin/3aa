# Claude Implementation Guide for 3AA Monitoring Product

## Project Overview
This is the 3AA Monitoring Product V1 implementation. This document provides mandatory operating rules for Claude during implementation.

## Frozen Baseline (DO NOT MODIFY WITHOUT APPROVAL)
- **Version:** V1.0 (frozen 2026-04-19; amendments below)
- **PRD:** `/docs/prd/PRD.md`
- **RFCs:** RFC-001 through RFC-008 (accepted; RFC-001/002/004 amended 2026-04-21; RFC-007 added 2026-04-21; RFC-008 added 2026-04-25 — quarterly financial history data layer; RFC-001/002/004 amended 2026-04-25; RFC-001/RFC-003/ADR-005 amended 2026-04-27 — valuation regime decoupling)
- **ADRs:** ADR-001 through ADR-018 (accepted; ADR-012 added 2026-04-21; ADR-013/ADR-014 added 2026-04-23; ADR-013/ADR-014 amended 2026-04-25; ADR-015/ADR-016 added 2026-04-25; ADR-001/ADR-002 amended 2026-04-25; ADR-017/ADR-018 added 2026-04-27 — regime selection + cyclical overlay; ADR-005 amended 2026-04-27)
- **Validated Epics:** EPIC-001 through EPIC-005; EPIC-008 fully designed (valuation regime decoupling — implement after EPIC-007)

## Current State (as of 2026-04-27) — READ THIS FIRST

**Quick orientation for a new Claude session:**

| Item | Value |
|------|-------|
| Overall progress | 6/8 epics complete; EPIC-008 decomposed and ready |
| Last completed | EPIC-005 ✅ Valuation Threshold Engine |
| Next epic | EPIC-008 — Valuation Regime Decoupling (stories decomposed 2026-04-27) |
| Active story | **None** — begin with STORY-089 (Schema Migration) |
| Unit tests | ~1568 passing (2026-04-26 baseline) |
| Git branch | `main` |
| GitHub | https://github.com/cflorin/3aa |

**Completed epics:**
- EPIC-001 ✅ Platform Foundation & Deployment (STORY-001–009)
- EPIC-002 ✅ Authentication & User Management (STORY-010–014)
- EPIC-003 ✅ Data Ingestion & Universe Management (STORY-015–033)
- EPIC-003.1 ✅ Classification LLM Enrichment (STORY-034–040)
- EPIC-004 ✅ Classification Engine & Universe Screen (STORY-041–088, except STORY-074 Bulk CSV Import — deferred)
- EPIC-005 ✅ Valuation Threshold Engine (STORY-075–086)

**What was just completed (EPIC-005 + extras):**
- Full valuation domain layer: metric selector, threshold assigner, zone assigner (`src/domain/valuation/`)
- Valuation state persistence + history (`src/modules/valuation/`)
- Valuation batch job + cron route + stock-add pipeline integration
- User valuation override API (GET/PUT/DELETE)
- Stock Detail valuation tab + universe screen valuation columns + filters
- Recompute Classification + Recompute Valuations admin buttons
- Confidence-based metric demotion (STORY-082) + confidence floor bucket selection (STORY-083)
- **EPIC-008 baseline fully designed + decomposed (2026-04-27):** 8 stories (STORY-089–096); regime selector (ADR-017), cyclical overlay (ADR-018), growth tier overlay, bank_flag, CyclicalScoreService; docs frozen with 5 ChatGPT feedback fixes applied

**Next action required:**
1. Begin STORY-089 — Schema Migration (Regime Decoupling + ValuationRegimeThreshold seed)
2. Proceed through STORY-090–096 in dependency order (see EPIC-008 epic spec)
3. EPIC-006 and EPIC-007 follow EPIC-008

**STORY-074 status:** Bulk CSV Import spec exists but was not implemented. Defer to post-EPIC-007 or fold into EPIC-008 operational tooling if needed.

**Key files for orientation:**
- Implementation plan: `/docs/architecture/IMPLEMENTATION-PLAN-V1.md`
- Implementation log: `/docs/architecture/IMPLEMENTATION-LOG.md`
- Stories index: `/stories/README.md`
- Live stock data snapshot: `/data/universe-snapshot-5.md`

## Implementation Tracking Requirements (MANDATORY)

**These rules are mandatory and cannot be skipped during implementation.**

### Before Starting Any Implementation Work
1. **Consult the implementation plan** (`/docs/architecture/IMPLEMENTATION-PLAN-V1.md`)
   - Verify current active epic/story
   - Confirm story status is `ready` (validated + tasks decomposed)
   - Check dependencies are satisfied
   - Identify integration checkpoints

2. **Check for blockers** in implementation plan
   - Do not start work on blocked items
   - Resolve blockers before proceeding

3. **Link work to epic/story/task**
   - All implementation work MUST be linked to a specific epic, story, and task
   - Do NOT start implementation without this linkage
   - Do NOT create "quick fixes" or "improvements" outside the planned structure

### During Implementation
1. **Follow the implementation order**
   - Work epic by epic, story by story, task by task
   - Do NOT jump ahead to later epics/stories
   - Do NOT work on multiple stories in parallel unless explicitly planned

2. **Track progress continuously**
   - Update story/task status as work progresses (planned → in_progress → in_review → done)
   - Update implementation plan with current active work
   - Mark blockers immediately when encountered

3. **Maintain evidence as you go**
   - Create tests as implementation progresses (not after the fact)
   - Update documentation inline (not as a cleanup phase)
   - Record traceability links in code comments

### After Each Meaningful Implementation Step
1. **Update the implementation log** (`/docs/architecture/IMPLEMENTATION-LOG.md`)
   - Log every task completion
   - Log every significant file change
   - Log every test addition/update
   - Log every blocker encountered
   - Log any baseline impacts

2. **Required log entry fields (all mandatory):**
   - Timestamp (ISO 8601)
   - Epic/Story/Task ID
   - Action taken
   - Files changed (paths, created/modified/deleted)
   - Tests added/updated
   - Result/status
   - Blockers/issues found
   - Baseline impact (YES/NO, explain if YES)
   - Next action

3. **Evidence required for completion:**
   - Do NOT mark work done without recording evidence
   - Evidence includes: tests passing, docs updated, migrations applied, traceability recorded

### Completing Work Items
1. **Task completion requires:**
   - [ ] Implementation complete
   - [ ] Tests added and passing
   - [ ] Regression coverage added where needed
   - [ ] Code comments include traceability links
   - [ ] Implementation log updated
   - [ ] Task status updated to `done`

2. **Story completion requires:**
   - [ ] All tasks done
   - [ ] Story-level acceptance criteria met
   - [ ] Story-level tests passing
   - [ ] Documentation updated where needed
   - [ ] Implementation log entry for story completion
   - [ ] Story status updated to `done`

3. **Epic completion requires:**
   - [ ] All stories done
   - [ ] Epic-level acceptance criteria met
   - [ ] Integration checkpoint passed
   - [ ] Deployment milestone reached (if applicable)
   - [ ] Implementation log entry for epic completion
   - [ ] Epic status updated to `done`

### Regression and Testing Requirements
1. **Do NOT skip tests**
   - Every new function/component requires unit tests
   - Every new endpoint requires integration tests
   - Every user-facing feature requires E2E tests
   - Regression tests added for every bug fix

2. **Test coverage expectations:**
   - Unit tests: >80% coverage for new code
   - Integration tests: All critical paths covered
   - E2E tests: All user workflows covered

3. **Test evidence required:**
   - Log test file paths in implementation log
   - Record test pass/fail status
   - Do NOT proceed if tests are failing

### Baseline Change Protocol (CRITICAL)
1. **If implementation conflicts with frozen baseline:**
   - **STOP** current implementation immediately
   - **DO NOT** silently adjust architecture to fit implementation
   - **DO NOT** proceed without approval

2. **Document the conflict:**
   - Create entry in implementation log with `Baseline Impact: YES`
   - Describe: current baseline assumption, discovered conflict, proposed resolution

3. **Raise for resolution:**
   - Create issue documenting conflict
   - Propose RFC amendment or ADR update if needed
   - Wait for approval before proceeding

4. **After baseline change approved:**
   - Update affected baseline documents (PRD/RFC/ADR)
   - Update implementation plan to reflect change
   - Log baseline update in implementation log
   - Resume implementation

### Prohibited Actions
**The following actions are FORBIDDEN during implementation:**

- ❌ Starting implementation without consulting implementation plan
- ❌ Skipping implementation log updates
- ❌ Marking work done without evidence (tests, docs, traceability)
- ❌ Working on items not linked to epic/story/task
- ❌ Silently changing frozen baseline assumptions
- ❌ Skipping tests or regression coverage
- ❌ Creating "temporary" code without tests
- ❌ Jumping ahead to later epics/stories out of order
- ❌ Committing code without traceability comments
- ❌ Proceeding when blocked without logging the blocker

### Required Operating Discipline
Implementation must proceed with:
- **Rigor:** Every step documented, every change tracked
- **Traceability:** Every file links to epic/story/task, every decision links to baseline
- **Evidence:** Every completion claim backed by passing tests and updated docs
- **Discipline:** No shortcuts, no skipped steps, no silent changes

**These requirements are not suggestions. They are mandatory operating rules for V1 implementation.**

## Code Traceability Format
Every implementation file must include traceability comments:

```typescript
// EPIC-001: Platform Foundation & Deployment
// STORY-003: Provision Core GCP Infrastructure
// TASK-003-001: Create Cloud Run service configuration

export const cloudRunConfig = {
  // implementation
};
```

## Testing Standards
- Unit tests: `tests/unit/**/*.test.ts`
- Integration tests: `tests/integration/**/*.test.ts`
- E2E tests: `tests/e2e/**/*.test.ts`
- Test naming: `describe('EPIC-XXX/STORY-XXX/TASK-XXX: [description]')`

## Documentation Standards
- All PRD/RFC/ADR changes require approval
- All code must have inline comments explaining "why" (not just "what")
- All configuration must be documented
- All deployment procedures must be documented

## Version Control Standards
- Commit messages format: `[EPIC-XXX/STORY-XXX/TASK-XXX] Brief description`
- All commits must reference epic/story/task
- No commits without tests (except documentation-only changes)

## Implementation Resources
- **Implementation Plan:** `/docs/architecture/IMPLEMENTATION-PLAN-V1.md`
- **Implementation Log:** `/docs/architecture/IMPLEMENTATION-LOG.md`
- **Stories Index:** `/stories/README.md`
- **Epic Specs:** `/stories/epics/`
- **Story Specs:** `/stories/tasks/`

---

**This document is authoritative. When in doubt, consult this document and the implementation plan.**

**Last Updated:** 2026-04-22 00:00 UTC
