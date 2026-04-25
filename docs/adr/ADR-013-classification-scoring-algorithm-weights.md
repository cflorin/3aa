# ADR-013: Classification Scoring Algorithm Point Weights

**Status:** ACCEPTED (amended 2026-04-25)
**Created:** 2026-04-23
**Supersedes:** N/A
**Relates to:** RFC-001 §Bucket Scorer; ADR-004 (rules-first classification); ADR-014 (confidence thresholds)

---

## Context

RFC-001 §Bucket Scorer specifies an additive scoring architecture: each rule that fires contributes points to one bucket's total score. The highest-scoring bucket wins (subject to tie-break resolution in STORY-043). RFC-001 originally referenced `ADR-001: Classification Scoring Algorithm Weights` for the exact additive point values — but that document does not exist in this repository (existing ADR-001 covers data architecture). This ADR fills that gap.

Point weights must satisfy four constraints:
1. A stock that clearly matches a single bucket should produce a margin ≥ 4 points over all other buckets (enabling `high` confidence per ADR-014).
2. A stock with genuine dual-bucket signal (e.g., MSFT with forward revenue in the Bucket 3 zone but 3y CAGR in the Bucket 4 zone) should produce a margin of 2–3 points (enabling `medium` confidence).
3. All weights must be positive integers to preserve determinism.
4. Enrichment bonuses (E1–E6 LLM scores) must be smaller than primary fundamental weights so they nudge but do not override fundamental-based scores.

---

## Decision

### Bucket Scorer Point Weights

| Weight Constant | Value | Fires When |
|---|---|---|
| `REV_PRIMARY` | **3** | `revenue_growth_fwd` in the bucket's primary range |
| `REV_SECONDARY` | **2** | `revenue_growth_3y` or `gross_profit_growth` in the bucket's range |
| `EPS_PRIMARY` | **2** | `eps_growth_fwd` in the bucket's range |
| `EPS_SECONDARY` | **1** | `eps_growth_3y` in the bucket's range |
| `PROFITABILITY` | **1** | Each of: `operating_margin` in range, `fcf_positive=true`, `net_income_positive=true` (up to 3 separate +1s) |
| `FCF_CONVERSION` | **1** | `fcf_conversion` in the expected range for that bucket |
| `FLAG_PRIMARY` | **2** | `pre_operating_leverage_flag=true` → Bucket 5; `binary_flag=true` → Bucket 8 |
| `ENRICHMENT_BONUS` | **1** | Per qualifying enrichment score meeting threshold (max 3 enrichment bonuses per bucket) |

### Bucket-Specific Growth Ranges

| Bucket | `revenue_growth_fwd` primary | `revenue_growth_fwd` notes |
|---|---|---|
| 1 | ≤ 2% | Decline / harvest |
| 2 | (2%, 3%] | Slow / mature |
| 3 | (3%, 8%) | Boundary: 3% exclusive, 8% exclusive |
| 4 | [8%, 15%] | Boundary: 8% inclusive, 15% inclusive |
| 5 | [10%, 20%] | Operating leverage thesis; requires `pre_operating_leverage_flag` for tie-break |
| 6 | (15%, 35%] | High-growth |
| 7 | > 35% | Hypergrowth |
| 8 | Any | Forced by `binary_flag=true`; scored 0 by BucketScorer; override in assembly |

**Boundary handling at exactly 8%:** `revenue_growth_fwd == 8.0` fires Bucket 4 (inclusive lower bound). Bucket 3 range is exclusive of 8.0.

**Overlapping ranges (5 and 6):** Both can accumulate points from the same stock. Highest total wins; tie-break rule 5v6 applies when scores are within 1 point (per ADR-014).

### Earnings Quality (EQ) Scorer Point Weights

| Weight Constant | Value | Fires When |
|---|---|---|
| `EQ_FCF_STRONG` | **3** | `fcf_conversion > 0.80` → contributes to EQ-A |
| `EQ_FCF_MODERATE` | **2** | `fcf_conversion` in `[0.50, 0.80]` → contributes to EQ-B |
| `EQ_FCF_WEAK` | **2** | `fcf_conversion < 0.50` or `fcf_positive = false` → contributes to EQ-C |
| `EQ_MOAT_STRONG` | **2** | `moat_strength_score ≥ 4.0` → contributes to EQ-A |
| `EQ_MOAT_MODERATE` | **1** | `moat_strength_score` in `[2.5, 4.0)` → contributes to EQ-B |
| `EQ_MOAT_WEAK` | **1** | `moat_strength_score < 2.5` → contributes to EQ-C |
| `EQ_NI_POSITIVE` | **1** | `net_income_positive = true` → contributes to EQ-A and EQ-B |

**EQ-A/B boundary at FCF conversion 80%:** `fcf_conversion == 0.80` is classified as moderate (`EQ_FCF_MODERATE`). The strong threshold is strictly `> 0.80`.

### Balance Sheet (BS) Scorer Point Weights

| Weight Constant | Value | Fires When |
|---|---|---|
| `BS_DEBT_LOW` | **3** | `net_debt_to_ebitda < 1.0` → contributes to BS-A |
| `BS_DEBT_MODERATE` | **2** | `net_debt_to_ebitda` in `[1.0, 2.5]` → contributes to BS-B |
| `BS_DEBT_HIGH` | ~~2~~ → **3** | `net_debt_to_ebitda > 2.5` → contributes to BS-C |
| `BS_COVERAGE_STRONG` | **2** | `interest_coverage > 12.0` → contributes to BS-A |
| `BS_COVERAGE_MODERATE` | **1** | `interest_coverage` in `[5.0, 12.0]` → contributes to BS-B |
| `BS_COVERAGE_WEAK` | **2** | `interest_coverage < 5.0` → contributes to BS-C |
| `BS_CAPITAL_INTENSITY` | **1** | `capital_intensity_score ≥ 4.0` → contributes to BS-C direction |

**Net-cash position (`net_debt_to_ebitda ≤ 0`):** Treated as even stronger than `< 1.0`; add additional +1 to BS-A score. Net-cash is better than BS-A threshold.

> **Amendment 2026-04-25 — `BS_DEBT_HIGH` raised from 2 → 3**
>
> With `BS_DEBT_HIGH = 2` and `BS_COVERAGE_STRONG = 2`, a company with high leverage
> (net_debt/EBITDA > 2.5) and strong interest coverage (> 12×) produced A:2, C:2 — a tie
> resolved to **BS-A** by the A > B > C tie-break. A highly leveraged company must never
> grade as A balance sheet quality regardless of how well it covers interest in a given period.
> Raising `BS_DEBT_HIGH` to 3 ensures high leverage always wins (C:3 > A:2), giving the
> correct BS-C outcome. The full corrected outcome matrix for all leverage × coverage
> combinations is verified in `tests/unit/classification/story-042-eq-bs-scorer.test.ts`.

---

## Rationale

### Why these specific values?

**Primary revenue = 3 points:** Revenue growth is the most reliable single bucket signal. Awarding the highest single weight anchors the scoring on the most observable metric.

**EPS primary = 2, secondary = 1:** EPS growth is correlated with revenue but can be distorted by buybacks, one-offs, and GAAP timing. Lower weight reflects this reduced reliability vs. revenue.

**Flag = 2 points:** `pre_operating_leverage_flag` is a strong qualitative signal that should be enough to tip a tie-break but not dominate fundamental scoring.

**Enrichment = 1 point (max 3 per bucket):** LLM enrichment scores provide directional corroboration; they should not override fundamental signals, only nudge them.

**FCF primary = 3, moat = 2, debt = 3:** EQ and BS scorers are symmetric with the bucket scorer in their top-weight values so grade separations are comparable in magnitude.

### Why not decimal weights?

Decimal weights create rounding ambiguity in boundary conditions and compromise determinism guarantees. Integer weights are unambiguous.

### Calibration check (representative stocks)

| Stock | Expected bucket | Estimated bucket-winner score | Estimated second-place score | Expected margin |
|---|---|---|---|---|
| MSFT | 4 | ~7 (3y rev + 3y EPS + op margin + moat) | ~5 (fwd rev in B3 + op margin + moat) | ~2 → medium confidence |
| ADBE | 4 | ~6 | ~4 | ~2 → medium confidence |
| TSLA | 5 | ~5 | ~4 | ~1 → low confidence |
| UBER | 5 | ~6 | ~4 | ~2 → medium confidence |
| UNH | 3 | ~5 | ~2 | ~3 → medium/low confidence |

These estimates assume data as of the 2026-04-21 snapshot. Actual scores depend on which specific rules fire for each stock's field values.

---

## Consequences

- **Positive:** Scoring is transparent, auditable, and trivially unit-testable. Each fired rule can be explained in a reason code.
- **Positive:** Integer weights preserve strict determinism (no floating-point comparison edge cases).
- **Negative:** Coarse granularity (1–3 points) means many stocks will score close to their neighbors, producing `medium` or `low` confidence. This is intentional — the system should be honest about borderline cases.
- **Risk:** If the framework's bucket profiles are materially changed, these weights need recalibration. Version the weights as constants in the codebase (e.g., `SCORING_WEIGHTS_V1`) to make future changes traceable.

---

## Implementation Notes

- Export all weight constants from `src/domain/classification/scoring-weights.ts`
- Each scorer (`BucketScorer`, `EarningsQualityScorer`, `BalanceSheetQualityScorer`) imports from that file
- Do NOT inline magic numbers in scorer implementations — always reference the named constant
- Unit tests should import the same constants so tests don't diverge from implementation

---

## Traceability

- RFC-001 §Bucket Scorer, §Scoring Algorithm
- `docs/prd/3_aa_rules_engine_spec_auto_suggestion_v_1.md` §Stage 1
- `docs/prd/source_of_truth_investment_framework_3AA.md` §Part I–II
- ADR-004 (rules-first classification, conservative defaults)
- ADR-014 (confidence threshold boundaries — consumes the margins produced by these weights)
