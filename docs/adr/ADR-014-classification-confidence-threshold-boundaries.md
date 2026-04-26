# ADR-014: Classification Confidence Threshold Boundaries

**Status:** ACCEPTED
**Created:** 2026-04-23
**Supersedes:** N/A
**Relates to:** RFC-001 §Confidence Computation; ADR-013 (scoring weights); ADR-004 (rules-first classification)

---

## Context

RFC-001 §Confidence Computation requires the classifier to emit a `confidence_level` of `high`, `medium`, or `low`, and `null` classification when data is too sparse to suggest a code. RFC-001 originally referenced `ADR-002: Confidence Threshold Boundaries` for the exact boundary values — but that document does not exist in this repository (existing ADR-002 covers nightly batch orchestration). This ADR fills that gap.

The confidence signal has three consumers:
1. **Display:** Universe screen shows `high`/`medium`/`low` badge; users understand how much to trust the system suggestion.
2. **Alert system (EPIC-006):** Alerts should not fire on `low`-confidence stocks without user review. High-confidence stocks can be acted on with less friction.
3. **Valuation metric demotion (EPIC-005 amendment, 2026-04-26):** When `confidence_level = 'low'`, the valuation engine uses an effective bucket of `bucket − 1` (floor 1) for metric selection and threshold derivation. See RFC-003 §Confidence-Based Effective Bucket.

Confidence is a function of three inputs:
- **Score separation (margin):** winning bucket score minus second-highest bucket score (from ADR-013 weights)
- **Tie-break count:** how many tie-break rules were needed to resolve the winner
- **Missing field count:** how many critical fundamental fields were null/undefined

---

## Decision

### Critical Fields Definition

The following fields are "critical" for confidence purposes. Missing count is the number of these that are null or undefined for a given stock:

1. `revenue_growth_fwd`
2. `revenue_growth_3y`
3. `eps_growth_fwd`
4. `eps_growth_3y`
5. `fcf_conversion`
6. `fcf_positive`
7. `net_income_positive`
8. `operating_margin`
9. `net_debt_to_ebitda`
10. `interest_coverage`

Total critical field count = 10. `missing_field_count` is the count of these that are null.

### Null-Suggestion Threshold

When `missing_field_count > 5` (6 or more critical fields are null): emit `suggested_code = null`, `confidence_level = 'low'`.

Rationale: fewer than half the critical fields present means the scoring is too speculative to be actionable.

### Confidence Computation Rules (in priority order)

**Step 1 — Null-suggestion gate (checked first):**
```
if missing_field_count > 5:
  → suggested_code = null, confidence_level = 'low', STOP
```

**Step 2 — Score separation (margin = winner_score - second_place_score):**

| Margin | Score-based confidence candidate |
|---|---|
| ≥ 4 | `high` |
| ≥ 2 and < 4 | `medium` |
| < 2 | `low` |

**Step 3 — Tie-break penalty:**

| Tie-breaks applied | Penalty |
|---|---|
| 0 | No change |
| 1 | Degrade one level (high → medium, medium → low, low stays low) |
| ≥ 2 | Force `low` |

**Step 4 — Missing-field penalty:**

| missing_field_count | Penalty |
|---|---|
| 0–2 | No change |
| 3–4 | Degrade one level |
| 5 | Force `low` |

**Step 5 — Trajectory quality penalty (requires RFC-008 quarterly history layer):**

When `stock_derived_metrics` is populated for a stock:

| Condition | Penalty |
|---|---|
| `quarters_available < 4` | Force `low` (insufficient trend history) |
| `quarters_available < 8` | Cap at `medium` (4-quarter trends available, 8-quarter trends NULL) |
| `operating_margin_stability_score < 0.40` | Degrade one level (highly volatile margins) |
| `deteriorating_cash_conversion_flag = true` AND (`suggested_eq IN ('A', 'B')`) | Degrade one level (classification not supported by cash trend) |
| `earnings_quality_trend_score < -0.50` | Degrade one level (strongly deteriorating quality) |

When `stock_derived_metrics` is NULL or not yet populated for a stock (quarterly history not yet available):
- Step 5 is skipped entirely; steps 1–4 apply as before.
- This ensures backwards compatibility during the EPIC-003 quarterly history rollout.

**Step 6 — Final confidence = result after all penalties applied.**

### Summary Table (representative cases)

| Margin | Tie-breaks | Missing fields | Final confidence |
|---|---|---|---|
| 5 | 0 | 0 | `high` |
| 4 | 0 | 2 | `high` |
| 4 | 1 | 0 | `medium` |
| 3 | 0 | 0 | `medium` |
| 2 | 0 | 3 | `low` |
| 1 | 0 | 0 | `low` |
| any | ≥ 2 | any | `low` |
| any | any | > 5 | `null` suggestion + `low` |

### Expected confidence for known stocks (calibration check)

Based on ADR-013 weight estimates and 2026-04-21 data snapshot:

| Stock | Margin estimate | Tie-breaks | Missing | Expected confidence |
|---|---|---|---|---|
| MSFT | ~2 | 1 (3v4 or 4v5) | 0 | `low`–`medium` (tie-break degrades medium → low) |
| ADBE | ~2 | 0 | 0 | `medium` |
| TSLA | ~1 | 1–2 | 1–2 | `low` |
| UBER | ~2 | 1 | 0 | `low`–`medium` |
| UNH | ~3 | 1 | 0 | `medium` |

**Note:** These are estimates. Exact confidence for any stock is determined by running the scorer with real data. Do not hard-code expected confidence for MSFT or TSLA in golden-set tests — instead, test that the confidence rules themselves compute correctly for synthetic inputs with known margins.

---

## Rationale

### Why margin ≥ 4 for `high`?

With ADR-013 weights, a clear single-bucket stock (all primary rules fire for one bucket, nothing for others) accumulates 3 + 2 + 2 + 1 + 1 + 1 = 10 points for the winner and 0–1 for all others. Margin of ~9 is "undeniable". A margin ≥ 4 ensures at least two distinct signals distinguish the winner from the runner-up.

### Why degrade on tie-break?

A tie-break means the scoring algorithm alone couldn't resolve the winner — the resolution required a meta-rule. This is inherently less certain than a clear scoring win, even if the tie-break is principled.

### Why missing_field_count > 5 → null, not > 3 or > 7?

- At > 3 missing: too aggressive; many stocks have a few forward estimates missing but enough data to classify.
- At > 7 missing: too lenient; a stock missing 8 of 10 fields should not receive a code with medium confidence.
- At > 5 (half the critical fields missing): this is the boundary below which scoring becomes speculative, matching the EPIC-004 spec: "Missing >5 critical fields → suggested_code=null, confidence='low'".

### Why `confidence = 'low'` (not `null`) when suggestion is null?

`confidence = null` would mean "we don't know how confident we are." `confidence = 'low'` means "we are confident the data is insufficient." The latter is more actionable for the UI.

---

## Consequences

- **Positive:** Users get an honest signal about classifier certainty. The system does not over-claim `high` confidence on borderline classifications.
- **Positive:** The boundary values are auditable and testable with simple synthetic inputs.
- **Negative:** With these thresholds, many real stocks (especially in the 3/4 and 4/5 boundary zones with typical tie-breaks) will produce `medium` or `low` rather than `high` confidence. This is intentional — the framework explicitly acknowledges judgment-dependence for many classifications.
- **Risk:** If ADR-013 weights change, the margin distribution changes and these thresholds may need recalibration. Both ADRs should be reviewed together whenever scoring weights are adjusted.

---

## Implementation Notes

- Export confidence constants from `src/domain/classification/confidence-thresholds.ts`
- `CRITICAL_FIELDS` list exported as a typed tuple for use in missing-field counting
- `NULL_SUGGESTION_THRESHOLD = 5` (i.e., `missing_field_count > 5`)
- `HIGH_MARGIN_THRESHOLD = 4`
- `MEDIUM_MARGIN_THRESHOLD = 2`
- Confidence computation in `classifyStock()` (STORY-043) follows the 5-step procedure above
- The 5-step procedure must be executed in order; step 1 is a short-circuit

---

## Amendment: Valuation Metric Demotion (2026-04-26)

The third consumer of `confidence_level` was added in EPIC-005. The rule is fully specified in RFC-003 §Confidence-Based Effective Bucket. Key points:

- Demotion applies only to `low` confidence; `medium` and `high` use the original bucket unchanged.
- Demotion shifts the **valuation metric and threshold derivation** only — the persisted `active_code` and `suggested_code` are not modified.
- The stock detail Classification tab shows a demotion indicator when `effectiveCode !== activeCode`.
- The floor is bucket 1; a stock already in bucket 1 with low confidence does not demote further.

---

## Amendment: Confidence-Floor Bucket Selection (2026-04-26)

**STORY-083: Confidence-Floor Bucket Selection**

The classification engine must never persist a `low`-confidence classification when a lower bucket with at least `medium` confidence is available. The rule: if the initial winning bucket produces `low` confidence, iterate downward through remaining candidate buckets (by score rank) until a bucket achieving at least `medium` confidence is found. That bucket becomes `suggested_code`.

### Algorithm

Executed in `classifyStock()` immediately after step 5 (confidence computation), before step 6 (code assembly):

1. **Gate:** only runs when `confidence_level === 'low'` AND `finalBucket ∉ {null, 8}` AND `binary_flag !== true`.
2. **Save raw result:** capture `rawSuggestedCode` (pre-floor code) and `rawConfidenceLevel = 'low'` for audit/UI.
3. **Iterative search:** maintain a set of excluded buckets (initially `{finalBucket}`):
   a. Set excluded bucket scores to `-Infinity` in a copy of `bucketResult.scores`.
   b. Re-run `resolveTieBreaks()` on the modified scores.
   c. If no candidate returned (or candidate is bucket 8), stop — no floor available.
   d. Compute `candidateMargin = candidateScore − secondBestScore` (among non-excluded buckets).
   e. Re-run `computeConfidence(candidateMargin, candidateTieBreaks.length, missing, …)`.
   f. If `candidateConf !== 'low'` → accept candidate: update `finalBucket`, `tieBreaksFired`, `confidence_level`, `steps`; set `confidenceFloorApplied = true`; **break**.
   g. Otherwise, add candidate to excluded set and repeat (max 6 iterations).
4. If no medium-or-better bucket found after all iterations, the original low-confidence bucket is retained.

### Bucket 8 and binary_flag exemption

Bucket 8 (`binary_risk`) is exempt: these stocks genuinely lack stable metrics and should not be force-mapped to a lower bucket. Stocks with `binary_flag = true` are also exempt (they are forced to B8 by the override rule).

### Audit fields added to ClassificationResult

| Field | Type | Meaning |
|---|---|---|
| `rawSuggestedCode` | `string \| null` | Code before floor search (set when floor was applied) |
| `rawConfidenceLevel` | `'low' \| null` | Always `'low'` when floor was applied; null otherwise |
| `confidenceFloorApplied` | `boolean` | True when floor search changed the final bucket |

These fields are persisted in the `scores` JSONB column alongside `tieBreaksFired` and `confidenceBreakdown`. No schema migration required.

### UI impact

The stock detail Classification tab shows the raw-to-floor transition when `confidenceFloorApplied = true`:
- Raw (pre-floor): `rawSuggestedCode` with `low` confidence label
- Arrow →
- Final (post-floor): `suggested_code` with actual `confidence_level` badge

---

## Traceability

- RFC-001 §Confidence Computation
- RFC-003 §Confidence-Based Effective Bucket (amendment 2026-04-26)
- `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 3
- EPIC-004 §Confidence invariants: "confidence='low' when missing >5 critical fields, high when score separation >3"
- EPIC-005 STORY-082: Confidence-Based Valuation Metric Demotion
- EPIC-005 STORY-083: Confidence-Floor Bucket Selection
- ADR-013 (scoring weights — calibration depends on weight values)
- ADR-004 (rules-first classification, conservative defaults)
