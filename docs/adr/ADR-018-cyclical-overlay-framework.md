# ADR-018: Cyclical Overlay Framework

**Status:** ACCEPTED
**Date:** 2026-04-27
**Deciders:** Product Team
**Related:** ADR-017 (Regime Selection), RFC-003 Amendment 2026-04-27, ADR-012 (LLM Enrichment)

---

## Context

V1 cyclical handling is limited to:
- Blocking trailing P/E fallback when `cyclicality_flag = true`
- Storing `current_multiple_basis = 'spot_cyclical'` as context
- No threshold adjustment of any kind

This means a highly cyclical name at peak earnings has the same threshold grid as at normal earnings. It also means high-quality profitable cyclicals (NVIDIA-like) and low-quality classic cyclicals (Ford-like) receive identical treatment.

Two problems to solve:
1. High-quality profitable cyclicals should remain in a premium regime with a threshold haircut, not be forced into the same regime as commodities producers
2. All cyclicals should have their threshold grid adjusted for cycle position

---

## Decision

Introduce a two-dimensional cyclicality model:

1. `structural_cyclicality_score` (int 0–3): degree of inherent cyclicality
2. `cycle_position` (enum): where current earnings appear to sit relative to history

These two dimensions, combined with the regime assigned by ADR-017, determine whether and how much a cyclical threshold overlay is applied.

**Key principle:** Cyclicality is not a regime-switching trigger (except for low-quality cyclicals falling into `cyclical_earnings`). For high-quality profitable cyclicals in `profitable_growth_pe`, cyclicality acts as a threshold haircut. The regime does not change; the thresholds do.

---

## `structural_cyclicality_score` (0–3)

Measures the inherent, structural cyclicality of the business regardless of current cycle position.

| Score | Description | Examples |
|-------|-------------|---------|
| 0 | Very low / none — stable recurring demand | SaaS, consumer staples, utilities, pharma |
| 1 | Mild — some revenue sensitivity to macro, durable through mild recessions | Diversified tech, healthcare devices |
| 2 | Moderate — clear cycle, meaningful trough/peak swings | Semiconductors, enterprise tech, industrials |
| 3 | High — deep cycle, large earnings compression at trough | Energy, materials, auto, basic cyclical semis |

### Derivation

**Primary source: quantitative history from `stock_quarterly_history` (Tiingo, up to 16 quarters).**

```
revenue_volatility    = std_dev(quarterly_revenue) / mean(quarterly_revenue)
op_margin_volatility  = std_dev(quarterly_op_margin)
gross_margin_range    = max(gross_margin_ttm_quarters) - min(gross_margin_ttm_quarters)
```

Scoring heuristic (starting point — subject to calibration):
- `revenue_volatility > 0.25` OR `op_margin_volatility > 0.12` → score += 1
- `op_margin_range > 0.20` (20 percentage points) → score += 1
- `gross_margin_range > 0.15` → score += 1

Cap at 3. Default 0 if fewer than 8 quarters of history.

**LLM modifier (secondary, bounded):**

`marginDurabilityScore` and `pricingPowerScore` from `ClassificationEnrichmentScore` (EPIC-003.1) may adjust the quantitative score by ±1 level:

```
cyclical_quality_modifier = (marginDurabilityScore + pricingPowerScore) / 2

if cyclical_quality_modifier >= 4.0:  score = max(0, score - 1)  // high quality → less cyclical risk
if cyclical_quality_modifier <= 2.0:  score = min(3, score + 1)  // low quality → more cyclical risk
```

**Hard constraints on LLM modifier:**
- Maximum effect: ±1 level
- Cannot reduce score below 0 or above 3
- Cannot override the quantitative signal if confidence is low
- Never allows LLM to bypass hard profitability gates in the regime selector

---

## `cycle_position`

Estimates where current earnings appear to sit relative to historical normal. This is a conservative first-pass estimate — not a market-timing claim.

| Position | Meaning |
|----------|---------|
| `depressed` | Current earnings materially below historical normal |
| `normal` | Current earnings broadly in line with history |
| `elevated` | Current earnings materially above historical normal |
| `peak` | Current earnings at or near history-window high |
| `insufficient_data` | Not enough history to estimate position |

### Derivation (conservative)

**Hard framework bias — must be preserved in all implementations:**

> When evidence is thin, mixed, or noisy: default to `normal` or `insufficient_data`. Never infer `elevated` or `peak` unless the margin deviation is unambiguous and both conditions fire simultaneously. **False tightening from an incorrect `elevated` / `peak` call is materially worse than false normalisation from a `normal` call.** A `normal` inference that turns out to be `elevated` causes the system to allow a slightly too-generous threshold — a tolerable error. An `elevated` inference that turns out to be `normal` causes the system to unnecessarily tighten thresholds for a non-peak name — a more harmful error that could cause the user to undervalue a correctly-priced stock.

**Default rule: when in doubt, assign `normal` or `insufficient_data`.**

```
ttm_op_margin    = stock_derived_metrics.operating_margin_ttm
history_avg      = mean of operating_margin_ttm across last 12 available quarters
history_high_rev = max quarterly revenue in history window
current_rev_ttm  = stock_derived_metrics.revenue_ttm
```

Assignment (strict thresholds intentional):
```
if quarters_available < 8:
    cycle_position = insufficient_data

elif ttm_op_margin > history_avg × 1.25 AND current_rev_ttm is at history-window high:
    cycle_position = peak

elif ttm_op_margin > history_avg × 1.15 AND revenue_growth trending above history midpoint:
    cycle_position = elevated

elif ttm_op_margin < history_avg × 0.85:
    cycle_position = depressed

else:
    cycle_position = normal
```

**Why strict thresholds?**  
With only 16 quarters of post-COVID history (starting ~2022Q2), the history window captures mostly an expansion period with a 2022 rate-hike slowdown. This is insufficient to observe a full economic cycle for most companies. False `elevated` or `peak` signals are worse than false `normal` — they would incorrectly tighten thresholds for non-peak names. The 15% and 25% margins of deviation are conservative specifically to avoid this error.

**No LLM input for cycle_position.** Cycle position is derived purely from quantitative data. LLM confidence scores are not used for cycle position assignment — the risk of hallucination or stale training data is too high for a live inference about current earnings position.

---

## Cyclical Overlay — Two Cases

### Case A: Profitable high-growth cyclical (`profitable_growth_pe` + score ≥ 1)

The stock qualified for `profitable_growth_pe` (Step 2 in ADR-017) AND carries structural cyclicality.

**Action:** Keep regime as `profitable_growth_pe`. Apply threshold haircut.

```typescript
function computeProfitableGrowthCyclicalOverlay(
  score: number,
  position: CyclePosition,
): number {  // turns to subtract from all thresholds
  if (score === 0) return 0;

  // Score 3: do not overlay; re-route to cyclical_earnings or manual_required
  // (handled upstream in regime selector: score=3 forces Step 3 path)
  if (score === 3) return 0;

  if (score === 1) {
    return (position === 'elevated' || position === 'peak') ? 4.0 : 2.0;
  }
  if (score === 2) {
    return (position === 'elevated' || position === 'peak') ? 6.0 : 4.0;
  }
  return 0;
}
```

**Overlay matrix for `profitable_growth_pe`:**

| Score | Position | Overlay (subtract from all thresholds) |
|-------|----------|---------------------------------------|
| 0 | any | 0 (no overlay) |
| 1 | normal / depressed / insufficient_data | −2.0 turns |
| 1 | elevated / peak | −4.0 turns |
| 2 | normal / depressed / insufficient_data | −4.0 turns |
| 2 | elevated / peak | −6.0 turns |
| 3 | any | re-route to `cyclical_earnings` (not an overlay) |

**Score = 3 behaviour:** A `structural_cyclicality_score` of 3 overrides Step 2 in the regime selector. Even if financial characteristics qualify the stock for `profitable_growth_pe`, a score-3 stock is instead routed to `cyclical_earnings` or `manual_required`. This prevents highly cyclical names from receiving the full `profitable_growth_pe` family even with a haircut.

**Example (NVIDIA-style at score=2, elevated):**

```
Base profitable_growth_pe A/A: 36 / 30 / 24 / 18
Apply B/B quality: − (4.0+2.0) = −6.0 → 30 / 24 / 18 / 12
Apply cyclical overlay: −6.0 → 24 / 18 / 12 / 6  [peak-elevated, high structural score]
Apply cyclical overlay: −4.0 → 26 / 20 / 14 / 8  [normal, moderate structural score]
```

NVIDIA at normal cycle, moderate cyclicality, A/A quality:
```
Base: 36 / 30 / 24 / 18
Overlay −4.0: 32 / 26 / 20 / 14
```
Still significantly above `mature_pe` (22 / 20 / 18 / 16). Correct.

### Case B: Lower-quality cyclical in `cyclical_earnings`

The stock is in `cyclical_earnings` (Step 3 in ADR-017). Threshold family is already stricter.

Cycle position adjusts the thresholds further:

```typescript
function computeCyclicalEarningsOverlay(position: CyclePosition): number {
  if (position === 'elevated') return 2.0;
  if (position === 'peak') return 3.5;
  // depressed: no tightening — earnings are below normal; basis warning surfaced instead
  // normal / insufficient_data: no tightening
  return 0;
}
```

**`depressed` cycle position for `cyclical_earnings`:** No automatic tightening. Instead, the system surfaces a basis warning: "Spot earnings may be below normal. Consider mid-cycle basis." The user can manually adjust `current_multiple_basis = 'mid_cycle'` if they have a mid-cycle estimate. Automatic tightening at depressed earnings would incorrectly penalise already-cheap stocks.

---

## Persisted Fields

The following fields are added to `valuation_state` (see RFC-001 Amendment for schema):

| Field | Type | Description |
|-------|------|-------------|
| `structural_cyclicality_score_snapshot` | int | Score at time of computation |
| `cycle_position_snapshot` | varchar | Cycle position at time of computation |
| `cyclical_overlay_applied` | boolean | Whether any overlay was applied |
| `cyclical_overlay_value` | decimal | Turns subtracted (negative) |
| `cyclical_confidence` | varchar | `high / medium / low / insufficient_data` |

`cyclical_confidence` reflects confidence in the overlay calculation:
- `high`: 12+ quarters of history, clear signal, consistent LLM signals
- `medium`: 8–12 quarters, moderate signal clarity
- `low`: 8+ quarters but mixed signals, or LLM confidence is low
- `insufficient_data`: fewer than 8 quarters

---

## Recomputation Triggers

Valuation recompute is triggered when:
- `structural_cyclicality_score` changes (score changes → regime may change)
- `cycle_position` changes (position changes → overlay amount changes)
- `operating_margin_ttm` changes materially (underlying input to both)

These are added to `shouldRecompute()` in the valuation domain layer.

---

## Distinguishing NVIDIA from Micron from Ford

| Stock | Score | Expected Regime | Overlay? | Reasoning |
|-------|-------|----------------|----------|-----------|
| NVDA (normal cycle) | 2 | `profitable_growth_pe` | −4 turns | High margin, strong FCF, qualifies Step 2; cyclical overlay applied |
| NVDA (elevated cycle) | 2 | `profitable_growth_pe` | −6 turns | Same regime; larger haircut for elevated earnings |
| MU (normal cycle) | 2–3 | `cyclical_earnings` | 0 | Does not qualify Step 2 (op margin <25% mid-cycle or FCF conversion borderline) |
| MU (elevated cycle) | 2–3 | `cyclical_earnings` | −2 turns | In cyclical_earnings; cycle position overlay applies |
| F (Ford) | 3 | `cyclical_earnings` | 0–3.5 turns | Score 3: forced into cyclical_earnings; cycle overlay for elevated |
| XOM (normal) | 2 | `cyclical_earnings` | 0 | Energy cyclical; does not qualify Step 2 (margins don't meet bar) |

---

## Consequences

**Positive:**
- NVIDIA and Micron are now treated differently, reflecting their different quality/durability profiles
- Threshold grids respond to cycle position for the first time
- The cyclical_earnings family (16/13/10/7) correctly reflects the risk discount for lower-quality cyclicals
- Cyclicality is transparent: persisted fields show exactly what was applied and why

**Negative:**
- 16 quarters of post-COVID history is insufficient to observe a full cycle for many companies; `cycle_position` will default to `normal` or `insufficient_data` for a significant portion of the universe
- LLM enrichment signals from EPIC-003.1 introduce dependency on that pipeline's quality; low-confidence LLM scores must not cause large regime or overlay shifts
- Score-3 re-routing (forcing `cyclical_earnings`) is a hard rule; a borderline score-3 stock that has genuinely transitioned to a durable business may be incorrectly treated

**Mitigations:**
- Conservative cycle inference defaults prevent false tightening
- LLM modifier is capped at ±1 level
- Score-3 routing is overrideable via `primary_metric_override` if the user disagrees
- `cyclical_confidence` field surfaces data quality to the user

---

**END ADR-018**
