# STORY-083: Confidence-Floor Bucket Selection

**Epic:** EPIC-005 — Valuation Threshold Engine & Enhanced Universe
**Status:** in_progress
**Priority:** P0 — correctness bug; low-confidence classifications must not be persisted when a better bucket exists

---

## Background

The classification engine previously persisted whatever bucket scored highest, even if confidence was `low`. A `low`-confidence classification means the scoring margin was too thin, too many tie-breaks fired, or data quality was poor. In all these cases the system should not recommend a valuation approach based on an uncertain bucket.

The fix: after computing the initial confidence, if it is `low`, iterate downward through remaining candidate buckets (by score rank) until finding one with at least `medium` confidence. That bucket becomes `suggested_code`.

**Reference:** ADR-014 §Confidence-Floor Bucket Selection (2026-04-26 amendment)

---

## Acceptance Criteria

### AC-1: Low-confidence winner triggers downward search

**Given** a stock whose initial winning bucket has `low` confidence,
**When** the classifier runs,
**Then** the engine searches lower-ranked buckets for one achieving ≥ `medium` confidence.

### AC-2: First medium-or-better candidate is accepted

**Given** the search finds a candidate bucket with `medium` confidence,
**When** that candidate is evaluated,
**Then** `suggested_code` is set to the candidate bucket, `confidence_level` = `medium`, and `confidenceFloorApplied = true`.

### AC-3: Raw pre-floor code preserved for audit

**Given** the floor was applied,
**When** the result is returned,
**Then** `rawSuggestedCode` = the original pre-floor code, `rawConfidenceLevel = 'low'`.

### AC-4: Bucket 8 (binary_risk) exempt

**Given** a stock classified as bucket 8 (binary_flag = true),
**When** the classifier runs,
**Then** no confidence-floor search is performed; bucket 8 is retained even if confidence is `low`.

### AC-5: Floor 1 — no bucket below bucket 1

**Given** a stock whose initial winner is bucket 1 with `low` confidence,
**When** no lower bucket exists,
**Then** bucket 1 is retained with `low` confidence; `confidenceFloorApplied = false`.

### AC-6: No medium candidate — retain original low-confidence result

**Given** the search exhausts all candidate buckets and none achieves ≥ `medium` confidence,
**When** the result is returned,
**Then** the original bucket is retained with `low` confidence; `confidenceFloorApplied = false`.

### AC-7: High-confidence stock unaffected

**Given** a stock whose initial winning bucket has `high` confidence,
**When** the classifier runs,
**Then** the confidence-floor search does not execute; no raw fields are set.

### AC-8: Persistence stores raw fields in JSONB

**Given** the floor was applied,
**When** `persistClassification` is called,
**Then** the `scores` JSONB column contains `rawSuggestedCode`, `rawConfidenceLevel = 'low'`, `confidenceFloorApplied = true`.

### AC-9: Detail API exposes pre-floor code

**Given** the floor was applied for a stock,
**When** `GET /api/stocks/[ticker]/detail` is called,
**Then** the response includes `raw_suggested_code`, `raw_confidence_level = 'low'`, `confidence_floor_applied = true`.

### AC-10: Stock detail Classification tab shows pre-floor → active transition

**Given** `confidence_floor_applied = true` in the API response,
**When** the Classification tab is displayed,
**Then** the "Active Code" section shows: `[rawCode] (low) → [suggestedCode] (medium/high)` with a green confidence-floor notice.

---

## BDD Scenarios

### Scenario 1: MSFT-like B6 low → B5 medium

```
Given: active_code = '6BA', initial confidence = 'low' (margin 2, 1 tie-break → degraded to low)
       B5 score gives margin ≥ 2 with no tie-break → 'medium'
When:  classifyStock() runs
Then:  suggested_code = '5BA'
       confidence_level = 'medium'
       rawSuggestedCode = '6BA'
       rawConfidenceLevel = 'low'
       confidenceFloorApplied = true
```

### Scenario 2: No valid fallback — retain B6 low

```
Given: Only B6 has a positive score; all other buckets score 0
When:  classifyStock() runs
Then:  suggested_code = '6BA'
       confidence_level = 'low'
       confidenceFloorApplied = false (or absent)
```

### Scenario 3: Two iterations — B6 low, B5 low, B4 medium

```
Given: B6 score → low, B5 score → low, B4 score → medium
When:  classifyStock() runs
Then:  suggested_code includes bucket 4 code
       confidence_level = 'medium'
       rawSuggestedCode includes bucket 6 code
       confidenceFloorApplied = true
```

### Scenario 4: B8 exempt

```
Given: binary_flag = true (forced to bucket 8)
When:  classifyStock() runs
Then:  suggested_code = '8'
       confidenceFloorApplied = false (search never ran)
```

### Scenario 5: Medium-confidence stock — floor not triggered

```
Given: Initial confidence = 'medium'
When:  classifyStock() runs
Then:  rawSuggestedCode is undefined/absent
       confidenceFloorApplied is false/absent
```

---

## Tasks

- [x] TASK-083-001: Amend ADR-014 with confidence-floor algorithm specification
- [x] TASK-083-002: Update `ClassificationResult` and `ClassificationScoresPayload` in `types.ts`
- [x] TASK-083-003: Implement confidence-floor search in `classifyStock()` (step 5b)
- [x] TASK-083-004: Update `persistClassification()` to include raw fields in JSONB
- [x] TASK-083-005: Update detail API to return `raw_suggested_code` / `raw_confidence_level` / `confidence_floor_applied`
- [x] TASK-083-006: Update `StockDetailClient.tsx` to display pre-floor → active transition
- [x] TASK-083-007: Unit tests — comprehensive coverage of floor search algorithm
- [x] TASK-083-008: Validate against real data: MSFT, ADBE, TSLA, UBER, UNH after re-classification

---

## Notes

- No DB schema migration needed — `rawSuggestedCode` etc. are stored in the existing `scores` JSONB column
- `monitoring.ts` `deriveDisplayCode` is kept as a safety net for stocks not yet re-classified after STORY-083 deployment; it becomes redundant once re-classification runs
- `StockTable.tsx` `effective_code` logic is also kept as safety net for the same reason
