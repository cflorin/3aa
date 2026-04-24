# ADR-014: Classification Confidence Threshold Boundaries

**Status:** ACCEPTED
**Created:** 2026-04-23
**Supersedes:** N/A
**Relates to:** RFC-001 §Confidence Computation; ADR-013 (scoring weights); ADR-004 (rules-first classification)

---

## Context

RFC-001 §Confidence Computation requires the classifier to emit a `confidence_level` of `high`, `medium`, or `low`, and `null` classification when data is too sparse to suggest a code. RFC-001 originally referenced `ADR-002: Confidence Threshold Boundaries` for the exact boundary values — but that document does not exist in this repository (existing ADR-002 covers nightly batch orchestration). This ADR fills that gap.

The confidence signal has two consumers:
1. **Display:** Universe screen shows `high`/`medium`/`low` badge; users understand how much to trust the system suggestion.
2. **Alert system (EPIC-006):** Alerts should not fire on `low`-confidence stocks without user review. High-confidence stocks can be acted on with less friction.

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

**Step 5 — Final confidence = result after all penalties applied.**

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

## Traceability

- RFC-001 §Confidence Computation
- `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 3
- EPIC-004 §Confidence invariants: "confidence='low' when missing >5 critical fields, high when score separation >3"
- ADR-013 (scoring weights — calibration depends on weight values)
- ADR-004 (rules-first classification, conservative defaults)
