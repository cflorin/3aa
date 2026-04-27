# ADR-013: Classification Scoring Algorithm Weights

**Status:** SUPERSEDED by RFC-009 (Earnings Path Bucket Engine) — effective EPIC-009 implementation
**Created:** 2026-04-23
**Superseded:** 2026-04-27 (RFC-009 accepted; point-scoring weights replaced by formula weights)
**Relates to:** RFC-009 §§7–14 (Earnings Path Engine formulas); RFC-001 §Bucket Scorer; ADR-004; ADR-014; ADR-019 (Operating Leverage State Engine)

---

> **⚠️ SUPERSEDED**
>
> The point-scoring system defined in this ADR (BucketScorer additive weights, `REV_PRIMARY`, `EPS_PRIMARY`, etc.) is replaced by the formula-based Earnings Path Engine defined in RFC-009.
>
> **What changes:** Bucket is no longer assigned by accumulating integer points against revenue/EPS growth ranges. It is now computed as a continuous `expected_normalized_eps_growth` value and mapped to a bucket band. See RFC-009 §§7–14 for the complete formula specification.
>
> **What does NOT change:** Earnings Quality (EQ) and Balance Sheet (BS) scoring remain unchanged. The EQ/BS point weights below remain in force.
>
> **Implementation target:** EPIC-009 (STORY-108 — Final Formula + Bucket Mapper). Until EPIC-009 is live, the V1 point-scoring code remains active in `src/domain/classification/bucket-scorer.ts` and `src/domain/classification/scoring-weights.ts`.

---

## V1 Bucket Scorer (Active until EPIC-009 / STORY-108)

The V1 bucket scorer uses additive point weights. The bucket with the highest total score wins, subject to tie-break resolution defined in ADR-014.

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

### Bucket-Specific Growth Ranges (V1)

| Bucket | `revenue_growth_fwd` primary | Notes |
|---|---|---|
| 1 | ≤ 2% | Decline / harvest |
| 2 | (2%, 3%] | Slow / mature |
| 3 | (3%, 8%) | Boundary: 3% exclusive, 8% exclusive |
| 4 | [8%, 15%] | 8% inclusive, 15% inclusive |
| 5 | [10%, 20%] | Requires `pre_operating_leverage_flag` for tie-break |
| 6 | (15%, 35%] | High-growth |
| 7 | > 35% | Hypergrowth |
| 8 | Any | Forced by `binary_flag=true` |

---

## V2 Bucket Scorer — Formula Weights (Effective EPIC-009)

Replaces the point-scoring system above. Bucket is computed from `expected_normalized_eps_growth` using the formula defined in RFC-009 §13.

### Base Growth Formula

```
base_expected_earnings_growth =
    0.45 × normalized_revenue_growth
  + 0.35 × normalized_eps_fwd_growth
  + 0.20 × normalized_eps_hist_growth
```

Component weights rationale:
- Revenue (0.45): most durable signal; less distorted by one-off events than EPS.
- Forward EPS (0.35): bucket is explicitly medium-term; analyst consensus is the primary forward signal.
- Historical EPS (0.20): corroborates trajectory but should not dominate when business is transitioning.

### Full Adjusted Formula

```
expected_normalized_eps_growth =
    base_expected_earnings_growth
  + operating_leverage_contribution      (ADR-019 §Numeric Contribution)
  + qualitative_visibility_modifier      (RFC-009 §12; hard cap ±2%)
  − cyclical_peak_penalty                (ADR-018; RFC-009 §10)
  − dilution_penalty                     (RFC-009 §11.1)
  − sbc_penalty                          (RFC-009 §11.2)
```

### Component Weight Details

| Component | Weight / Source | Range |
|-----------|----------------|-------|
| `normalized_revenue_growth` | 0.45 in base formula | RFC-009 §7 |
| `normalized_eps_fwd_growth` | 0.35 in base formula | RFC-009 §8.3; fallback chain L1–L4 |
| `normalized_eps_hist_growth` | 0.20 in base formula | RFC-009 §8.2 |
| `operating_leverage_contribution` | +8% / +3% / +2% / 0% / −4% by state | ADR-019 |
| `qualitative_visibility_modifier` | ±2% hard cap | RFC-009 §12 |
| `cyclical_peak_penalty` | 0% to −8% by score × cycle position | ADR-018; RFC-009 §10 |
| `dilution_penalty` | 0% to −6% by share count growth band | RFC-009 §11.1 |
| `sbc_penalty` | 0% to −3% by SBC/revenue band | RFC-009 §11.2 |

### Bucket Bands (V2)

| `expected_normalized_eps_growth` | Bucket |
|----------------------------------|--------|
| < 0% | 1 |
| 0% – 5% | 2 |
| 5% – 10% | 3 |
| 10% – 18% | 4 |
| 18% – 30% | 5 |
| 30% – 50% | 6 |
| > 50% | 7 |
| `binary_flag = true` (override) | 8 |

Bands are half-open intervals: lower bound inclusive, upper exclusive. No tie-break resolver needed — the formula produces a single continuous number.

---

## Earnings Quality (EQ) Scorer Point Weights — Unchanged

EQ scoring is not affected by the bucket engine change. These weights remain in force.

| Weight Constant | Value | Fires When |
|---|---|---|
| `EQ_FCF_STRONG` | **2** | `fcf_conversion > 0.80` → contributes to EQ-A |
| `EQ_FCF_MODERATE` | **2** | `fcf_conversion ∈ [0.50, 0.80]` → contributes to EQ-B |
| `EQ_FCF_WEAK` | **2** | `fcf_conversion < 0.50` or `fcf_positive = false` → contributes to EQ-C |
| `EQ_MOAT_STRONG` | **2** | `moat_strength_score ≥ 4.0` → contributes to EQ-A |
| `EQ_MOAT_MODERATE` | **1** | `moat_strength_score ∈ [2.5, 4.0)` → contributes to EQ-B |
| `EQ_MOAT_WEAK` | **1** | `moat_strength_score < 2.5` → contributes to EQ-C |
| `EQ_NI_POSITIVE` | **1** | `net_income_positive = true` → contributes to EQ-A and EQ-B |
| `EQ_EPS_DECLINING` | **1** | `eps_growth_3y < 0` → contributes to EQ-C |
| `EQ_EPS_REV_SPREAD_MODERATE` | **1** | `(eps_growth_3y − revenue_growth_3y) ∈ [−0.20, −0.10)` → contributes to EQ-C |
| `EQ_EPS_REV_SPREAD_SEVERE` | **3** | `(eps_growth_3y − revenue_growth_3y) < −0.20` → contributes to EQ-C |

`EQ_EPS_REV_SPREAD_MODERATE` and `EQ_EPS_REV_SPREAD_SEVERE` are mutually exclusive. `EQ_EPS_DECLINING` stacks with whichever spread signal fires.

**Amendment 2026-04-25:** `EQ_FCF_STRONG` lowered from 3 → 2; EQ volatility signals (`EQ_EPS_DECLINING`, `EQ_EPS_REV_SPREAD_MODERATE/SEVERE`) added. See original ADR-013 amendment note for full rationale.

---

## Balance Sheet (BS) Scorer Point Weights — Unchanged

| Weight Constant | Value | Fires When |
|---|---|---|
| `BS_DEBT_LOW` | **3** | `net_debt_to_ebitda < 1.0` → contributes to BS-A |
| `BS_DEBT_MODERATE` | **2** | `net_debt_to_ebitda ∈ [1.0, 2.5]` → contributes to BS-B |
| `BS_DEBT_HIGH` | **3** | `net_debt_to_ebitda > 2.5` → contributes to BS-C |
| `BS_COVERAGE_STRONG` | **2** | `interest_coverage > 12.0` → contributes to BS-A |
| `BS_COVERAGE_MODERATE` | **1** | `interest_coverage ∈ [5.0, 12.0]` → contributes to BS-B |
| `BS_COVERAGE_WEAK` | **2** | `interest_coverage < 5.0` → contributes to BS-C |
| `BS_CAPITAL_INTENSITY` | **1** | `capital_intensity_score ≥ 4.0` → contributes to BS-C direction |

Net-cash position (`net_debt_to_ebitda ≤ 0`): additional +1 to BS-A score.

**Amendment 2026-04-25:** `BS_DEBT_HIGH` raised from 2 → 3. See original amendment note for rationale.

---

## Tie-Break Resolver (V1 only — removed in V2)

The tie-break resolver (ADR-014) applies only to V1 point-scoring. In V2, the formula produces a single continuous number; no ties are possible. ADR-014 will be amended by EPIC-009 to remove tie-break rules and update confidence reduction logic.

---

## Implementation Notes

- V1 weights: `src/domain/classification/scoring-weights.ts` — constants named `SCORING_WEIGHTS_V1`
- V2 formula: new service at `src/domain/classification/earnings-path-engine.ts` (EPIC-009 target)
- EQ/BS scorers import from `scoring-weights.ts` — unchanged
- Do NOT inline magic numbers in scorer implementations

---

## Traceability

- RFC-009 §§7–14 (V2 formula specification)
- RFC-001 §Bucket Scorer (V1 architecture — partially superseded)
- ADR-004 (rules-first classification)
- ADR-014 (confidence thresholds — tie-break rules to be removed in EPIC-009)
- ADR-019 (Operating Leverage State Engine — operating_leverage_contribution)
- ADR-018 (Cyclical Overlay — cyclical_peak_penalty)
