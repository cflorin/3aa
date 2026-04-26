# STORY-082 — Confidence-Based Valuation Metric Demotion

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Status
`planned`

## Purpose
When the classification engine assigns a stock a `low`-confidence code, the winning bucket was not clearly distinguishable from the runner-up. Applying a growth-stage metric (e.g. EV/Sales for bucket 6) to such a stock risks a category error — the company may genuinely belong in a lower bucket with an earnings-based metric. This story makes the valuation engine conservative under uncertainty by demoting the effective bucket by one step when confidence is `low`.

## Story
As the valuation engine,
I want to use an effective bucket of `bucket − 1` whenever classification confidence is `low`,
so that borderline stocks are evaluated on the more conservative metric rather than one designed for a growth stage they may not have reached.

## Outcome
- `computeValuation()` accepts `confidenceLevel` in `ValuationInput` and derives an `effectiveCode` before all downstream stages.
- Metric selection, threshold derivation, TSR hurdle calculation, and secondary adjustments all operate on `effectiveCode`.
- The original `activeCode` is preserved in `ValuationResult` for auditability; `effectiveCode` is also returned so callers can detect demotion.
- `persistValuationState` passes `confidenceLevel` from `classificationState` into the valuation input.
- The universe list `valMetricLabel` / `valMetricValue` fallback path (no computed valuationState) applies the same demotion rule when `confidence_level === 'low'`.
- The stock detail **Classification tab** renders a visible demotion notice when `effectiveCode !== activeCode`, showing: original bucket, effective bucket, and confidence level.
- `medium` and `high` confidence: no change — effective bucket equals active bucket.
- Floor: bucket 1 cannot be demoted further.

## Acceptance Criteria

### Domain

**Scenario 1 — B6 low confidence demotes to B5 metric (EV/EBIT)**
```
Given activeCode = '6BA', confidenceLevel = 'low'
When computeValuation() is called
Then effectiveCode = '5BA'
And primaryMetric = 'forward_ev_ebit'
And thresholds are derived from '5BA' anchor
```

**Scenario 2 — B5 low confidence demotes to B4 metric (Fwd P/E)**
```
Given activeCode = '5AA', confidenceLevel = 'low'
When computeValuation() is called
Then effectiveCode = '4AA'
And primaryMetric = 'forward_pe'
```

**Scenario 3 — Medium confidence: no demotion**
```
Given activeCode = '6BA', confidenceLevel = 'medium'
When computeValuation() is called
Then effectiveCode = '6BA'
And primaryMetric = 'ev_sales'
```

**Scenario 4 — Floor: B1 low confidence stays B1**
```
Given activeCode = '1AA', confidenceLevel = 'low'
When computeValuation() is called
Then effectiveCode = '1AA'
And primaryMetric = 'forward_pe'
```

**Scenario 5 — EQ and BS grades preserved on demotion**
```
Given activeCode = '6CB', confidenceLevel = 'low'
When computeValuation() is called
Then effectiveCode = '5CB'
```

**Scenario 6 — Null confidence treated as no demotion**
```
Given activeCode = '6BA', confidenceLevel = null
When computeValuation() is called
Then effectiveCode = '6BA'
```

### Persistence

**Scenario 7 — persistValuationState reads confidence from classificationState**
```
Given classificationState.confidenceLevel = 'low' for ticker 'XYZ'
And activeCode = '6BA'
When persistValuationState('XYZ') is called
Then computeValuation is invoked with confidenceLevel = 'low'
And the stored valuationState.activeCode = '6BA' (original preserved)
```

### UI — Universe list fallback

**Scenario 8 — valMetricLabel uses demoted bucket when no valuationState and confidence low**
```
Given stock: active_code = '6BA', confidence_level = 'low', currentMultipleBasis = null
Then valMetricLabel returns 'EV/EBIT'  (bucket 5 metric, not EV/Sales)
```

**Scenario 9 — valMetricLabel unchanged for medium confidence**
```
Given stock: active_code = '6BA', confidence_level = 'medium', currentMultipleBasis = null
Then valMetricLabel returns 'EV/Sales'
```

### UI — Classification tab demotion notice

**Scenario 10 — Demotion notice shown**
```
Given a stock with activeCode = '6BA' and effectiveCode = '5BA'
When the Classification tab renders
Then a notice is visible: "Valued as B5 (demoted from B6 — low confidence)"
```

**Scenario 11 — No notice when no demotion**
```
Given a stock with activeCode = '6BA' and effectiveCode = '6BA'
When the Classification tab renders
Then no demotion notice is present
```

## Scope In
- `src/domain/valuation/types.ts` — add `confidenceLevel?: 'high' | 'medium' | 'low' | null` to `ValuationInput`; add `effectiveCode: string` to `ValuationResult`
- `src/domain/valuation/compute-valuation.ts` — derive `effectiveCode` before Stage 1; thread through all stages
- `src/modules/valuation/valuation-persistence.service.ts` — read `confidenceLevel` from `classificationState` when building `ValuationInput`
- `src/components/universe/StockTable.tsx` — `valMetricLabel` and `valMetricValue` fallback applies demotion when `confidence_level === 'low'`
- Stock detail Classification tab component — demotion notice badge/callout
- Unit tests: domain demotion scenarios (Scenarios 1–6 above)
- Integration tests: persistence passes confidence (Scenario 7)
- Unit tests: `valMetricLabel` demotion fallback (Scenarios 8–9)
- Component tests: Classification tab notice (Scenarios 10–11)

## Scope Out
- Changing the displayed `active_code` or `suggested_code` — these remain the original classification
- Applying demotion to `medium` confidence
- Multi-step demotion (only one bucket step down)
- Alert generation changes (EPIC-006 scope)

## Tasks

| ID | Task | Estimate |
|----|------|----------|
| TASK-082-001 | RFC-003 + ADR-014 + ADR-005 documentation amendments | done (2026-04-26) |
| TASK-082-002 | Add `confidenceLevel` to `ValuationInput`; derive and return `effectiveCode` in `compute-valuation.ts` | S |
| TASK-082-003 | Pass `confidenceLevel` from `classificationState` in `valuation-persistence.service.ts` | S |
| TASK-082-004 | Update `valMetricLabel` / `valMetricValue` fallback in `StockTable.tsx` | S |
| TASK-082-005 | Classification tab demotion notice component | S |
| TASK-082-006 | Unit tests — domain demotion (Scenarios 1–6) | S |
| TASK-082-007 | Unit tests — `valMetricLabel` fallback demotion (Scenarios 8–9); component tests — demotion notice (Scenarios 10–11) | S |
| TASK-082-008 | Integration test — persistence passes confidence correctly (Scenario 7) | S |
| TASK-082-009 | Update implementation log | S |

## Baseline References
- RFC-003 §Confidence-Based Effective Bucket (amended 2026-04-26)
- ADR-014 §Amendment: Valuation Metric Demotion (2026-04-26)
- ADR-005 §Confidence-Based Effective Code (amended 2026-04-26)
- ADR-004 (rules-first, conservative defaults — consistent with this change)
