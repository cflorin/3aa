# STORY-038 — classificationEnrichmentSync Job

## Epic
EPIC-003.1 — Classification LLM Enrichment

## Status
done ✅ (2026-04-21, unit_verified — 15/15 tests passing)

## Purpose
STORY-035–037 implement individual flag detectors. This story wires them into a single schedulable batch job with incremental mode, full-run mode, and recomputation triggers that go beyond "modified recently." The core architectural decision implemented here: **one combined LLM call per stock** (not separate calls per flag) to minimize cost, avoid contradictory outputs, and reduce overlapping context transmission.

STORY-040 will extend this job to add E1–E6 qualitative scores to the same combined call.

## Combined Call Architecture

Rather than calling `HoldingCompanyDetector`, `CyclicalityDetector`, and `BinaryFlagDetector` as three separate LLM requests, this job assembles them into a single call using `combined-enrichment.md` (written in STORY-040). The combined call returns all three flags (for those requiring LLM) and all six E1–E6 scores in one response.

Pre-filters still run first (deterministic Level 1/Level 2 logic from STORY-035–037) to avoid LLM calls for stocks with deterministically known flag values. Only stocks with at least one non-deterministic field trigger an LLM call.

```
For each stock:
  1. Run all deterministic pre-filters (SIC, sector rules, biotech revenue, large-cap exclusion)
  2. Determine which flags/scores still need LLM assessment
  3. If any field needs LLM:
       → single combined call → all remaining flags + all E1–E6 scores returned together
  4. Merge results: deterministic values + LLM values
  5. Single DB update with all changed fields + provenance
```

This means even if a stock has `cyclicality_flag = TRUE` deterministically (Materials sector), the LLM call is still made to get the E1–E6 scores — but the combined call receives the pre-computed flag as context so scores are consistent with it.

## Story
As a **developer**,
I want **a `classificationEnrichmentSync` batch job that uses one combined LLM call per stock and has robust recomputation triggers** —
so that **all flags and scores are refreshed consistently, the enrichment state never silently drifts from the active prompt/model logic, and weekly costs are minimized**.

## Outcome
- Incremental mode (default): processes stocks matching any recomputation trigger
- Full mode (admin-triggered or forced): processes all in-universe stocks
- One combined LLM call per stock (for stocks that need it); deterministic-only stocks get no LLM call
- Run summary: `{ stocks_processed, stocks_updated, stocks_skipped, llm_calls_made, errors }`. Note: if BC-035-001 is triggered (SIC code unavailable from FMP), `needs_llm = true` for all stocks — expected `llm_calls_made` increases from ~300–400 to ~1,000 per run.
- Admin route: `POST /api/admin/sync/classification-enrichment?mode=incremental|full`
- Cloud Scheduler cron: Sunday 02:00 UTC

## Recomputation Triggers (incremental mode)

A stock is included in an incremental run if ANY of the following are true:

1. **New stock**: no existing provenance for any classification flag (`holding_company_flag` provenance absent)
2. **Recently modified**: `data_last_synced_at > NOW() - 30 days` (underlying data changed)
3. **Prompt version drift**: any flag/score provenance `prompt_version` ≠ current hash of the corresponding prompt file
4. **Model version drift**: any flag/score provenance `model` ≠ current `LLM_MODEL` env var value
5. **Error state**: any flag/score provenance has `error: true`

Triggers 3 and 4 ensure that when a prompt file is edited or the model is upgraded, affected stocks are automatically re-enriched on the next weekly run without a forced full-run.

## Scope In

### Task 1 — Implement pre-filter orchestrator
```typescript
// src/modules/classification-enrichment/jobs/classification-enrichment-sync.service.ts
interface PreFilterResult {
  holding_company_flag: boolean | null;   // null = needs LLM
  cyclicality_flag: boolean | null;
  binary_flag: boolean | null;
  needs_llm: boolean;
}

function runDeterministicPreFilters(stock: ClassificationEnrichmentInput): PreFilterResult
```
Runs SIC heuristic, sector rules, biotech rule, large-cap exclusion. Returns determined values; `null` = LLM assessment required. `needs_llm = true` if any field is null OR E1–E6 scores are always LLM-required.

### Task 2 — Implement recomputation trigger evaluation
```typescript
function shouldEnrich(
  stock: { dataLastSyncedAt: Date; dataProviderProvenance: Record<string, unknown> },
  currentPromptVersions: Record<string, string>,  // field → current prompt hash
  currentModel: string,
  mode: 'incremental' | 'full'
): boolean
```
Returns true if mode = 'full', or any of the 5 recomputation triggers above apply.

### Task 3 — Implement `syncClassificationEnrichment()` main service
```typescript
async function syncClassificationEnrichment(
  llmProvider: LLMProvider,
  options: { mode: 'incremental' | 'full'; now: Date }
): Promise<ClassificationEnrichmentSyncResult>
```
For each stock meeting recomputation criteria:
1. Run pre-filters
2. If `needs_llm`: make single combined call (using `combined-enrichment.md` prompt — stub in this story; STORY-040 fills the prompt body)
3. Merge pre-filter values + LLM values
4. Single `prisma.stock.update` with all changed fields and merged provenance
5. Accumulate summary

### Task 4 — Admin route
`POST /api/admin/sync/classification-enrichment?mode=incremental|full`. Existing admin auth middleware. Returns summary JSON.

### Task 5 — Unit tests
- Pre-filter orchestrator: 4 tests (all deterministic, all LLM, mixed, large-cap exclusion)
- Recomputation trigger: 5 tests (one per trigger condition)
- Sync job incremental: mock returns 3 stocks; 2 match triggers, 1 does not; verify only 2 processed
- Sync job LLM error mid-run: run continues; error accumulated; other stocks processed
- DB update: single update call per stock regardless of how many fields changed
- Provenance merge: existing provenance keys preserved; only updated keys overwritten

### Task 6 — Optional live smoke test
A single AAPL run through the full pipeline against live Claude API. Marked `@smoke` and excluded from unit and CI test runs. Not a story completion gate — documents expected output for review.

## Acceptance Criteria
- [ ] One LLM call per stock maximum (not one per flag)
- [ ] Deterministic-only stocks (e.g., Materials sector, pre-revenue biotech) receive no LLM call
- [ ] Prompt version drift triggers re-enrichment on next incremental run without admin intervention
- [ ] Model version drift triggers re-enrichment
- [ ] LLM errors do not abort the run; `errors` count correct in summary
- [ ] Single DB update per stock (verified by mock call count assertions)
- [ ] Admin route functional with existing auth middleware
- [ ] Unit tests passing

## Dependencies
- STORY-035 (HoldingCompanyDetector pre-filter logic)
- STORY-036 (CyclicalityDetector pre-filter logic)
- STORY-037 (BinaryFlagDetector pre-filter logic)
- STORY-034 (LLMProvider + PromptLoader)
- STORY-040 fills the `combined-enrichment.md` prompt body (this story creates stub; E1–E6 scores are null until STORY-040)
- STORY-032 and STORY-033 (EPIC-003) — `runDeterministicPreFilters()` reads `share_count_growth_3y` for `material_dilution_flag` context and relies on pre-populated `holding_company_flag`, `cyclicality_flag`, `binary_flag` DB defaults being accurate. EPIC-003 jobs must have completed at least one run for all in-universe stocks before EPIC-003.1 enrichment sync produces correct pre-filter results.
