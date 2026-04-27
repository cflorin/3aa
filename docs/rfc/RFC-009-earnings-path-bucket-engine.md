# RFC-009: Earnings Path Bucket Engine

**Status:** DRAFT
**Tier:** 1 (Core Architecture — replaces bucket-scoring logic in RFC-001)
**Created:** 2026-04-27
**Author:** cflorin (design), Claude (derivation)
**Input spec:** ChatGPT *Bucket Classification Amendment — Earnings Path Engine Spec* (2026-04-27)
**Dependencies:** RFC-001 (supersedes §Bucket Scorer), RFC-008 (quarterly history data layer), ADR-017 (regime selector — amended by this RFC), ADR-018 (cyclical overlay)
**Supersedes:** §Bucket Scorer in RFC-001; ADR-013 (scoring weights — replaced in full by EPIC-009 story)
**Creates New Decisions:** YES (operating leverage engine, FY2 forward EPS, regime-selector semantic update)

---

## 1. Context and Motivation

EPIC-008 decoupled valuation from classification, giving the regime selector its own layer. This renders the old bucket model — which mixed business archetype, operating leverage, cyclicality, and valuation implications into a single score — redundant in its mixing of concerns.

The replacement principle (from the input spec):

> **Bucket should classify the expected normalized per-share earnings growth path over the next 3–5 years.**

Revenue, operating leverage, and cyclicality still matter, but only insofar as they affect that expected earnings path.

---

## 2. Goals

1. Replace the point-scoring BucketScorer with a formula-based Earnings Path Engine.
2. Define bucket as a band of expected normalized per-share earnings growth.
3. Model operating leverage as an explicit 5-state engine with numeric contribution.
4. Normalize cyclicality (do not penalize structural growth; do penalize cyclical peak inflation).
5. Account for dilution and SBC burden in the per-share path.
6. Keep LLM qualitative signals bounded to ±2% modifier — never dominant.
7. Update the regime selector to use the new bucket semantics.
8. Preserve determinism and auditability.

## 3. Non-Goals

1. Change the Earnings Quality or Balance Sheet Quality dimensions.
2. Change the regime selector's margin/profitability gate conditions (those are financial reality checks, not growth proxies).
3. Modify user override mechanics.
4. Change the Bucket 8 invariant (`binary_flag = true` → Bucket 8).

---

## 4. New Bucket Semantics

Each bucket represents a band of expected normalized medium-term per-share earnings growth.

| Bucket | Meaning | Expected normalised per-share EPS growth |
|--------|---------|------------------------------------------|
| 1 | Earnings decline / impairment | < 0% |
| 2 | Low growth | 0–5% |
| 3 | Steady moderate growth | 5–10% |
| 4 | Durable low-teens growth | 10–18% |
| 5 | High-teens / 20s growth | 18–30% |
| 6 | Very high earnings growth | 30–50% |
| 7 | Extreme / optionality-heavy | > 50% or visibility-dependent |
| 8 | Binary / not classifiable by earnings path | n/a |

Bucket 8 invariant preserved: `binary_flag = true` forces Bucket 8 regardless of computed growth path.

---

## 5. Architecture Overview

The engine has three layers:

```
┌─────────────────────────────────────────────┐
│  Layer A — Numeric Growth Engine            │
│  normalized_revenue_growth                  │
│  normalized_eps_hist_growth                 │
│  normalized_eps_fwd_growth                  │
│  → base_expected_earnings_growth            │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│  Layer B — Path Modifiers                   │
│  + operating_leverage_contribution          │
│  + qualitative_visibility_modifier          │
│  − cyclical_peak_penalty                    │
│  − dilution_penalty                         │
│  − sbc_penalty                              │
│  → expected_normalized_eps_growth           │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│  Layer C — Bucket Mapper                    │
│  expected_normalized_eps_growth → Bucket    │
└─────────────────────────────────────────────┘
```

---

## 6. Input Blocks

### 6.1 Revenue Inputs (all already stored)

| Field | Source |
|-------|--------|
| Last 20 quarters of quarterly revenue | `StockQuarterlyHistory.revenue` |
| `revenue_growth_fwd` | `Stock.revenueGrowthFwd` |
| TTM revenue per quarter (rolling) | Derived from quarterly history |
| `revenue_growth_hist_long` | New derived field — long-window CAGR/slope |
| `revenue_growth_hist_recent` | New derived field — 8-quarter window |
| `revenue_growth_acceleration` | New derived field — recent minus long |
| `normalized_revenue_growth` | New derived field — see §7 |

### 6.2 Earnings Inputs (mostly stored; FY2 is new)

| Field | Source |
|-------|--------|
| Last 20 quarters of diluted EPS (reconstructed from net_income / diluted_shares) | `StockQuarterlyHistory` |
| `eps_growth_fwd` | `Stock.epsGrowthFwd` |
| `eps_fy2_avg` (FY2 analyst consensus EPS) | **New** — FMP analyst-estimates FY+2 entry; see §8 fallback chain |
| `eps_growth_hist_long` | New derived field |
| `eps_growth_hist_recent` | New derived field |
| `normalized_eps_hist_growth` | New derived field |
| `normalized_eps_fwd_growth` | New derived field |

### 6.3 Operating Leverage Inputs (all already stored)

| Field | Source |
|-------|--------|
| Last 20 quarters of gross_profit, operating_income, revenue | `StockQuarterlyHistory` |
| FCF conversion TTM history | `StockDerivedMetrics.fcfConversionTtm` |
| `operating_leverage_state` | **New** — 5-state enum (replaces `pre_operating_leverage_flag` boolean) |
| `operating_leverage_contribution` | **New** — numeric modifier |
| Note: SG&A/R&D not stored separately; opex derived as `gross_profit − operating_income` | Sufficient for all leverage metrics |

### 6.4 Cyclicality Inputs (live since EPIC-008)

| Field | Source |
|-------|--------|
| `structural_cyclicality_score` | `Stock.structuralCyclicalityScore` |
| `cycle_position` | `Stock.cyclePosition` |
| Revenue and margin volatility | Derived from quarterly history |

### 6.5 Qualitative Support Inputs (all already stored by LLM enrichment)

| Field | Source |
|-------|--------|
| `moat_strength_score` | `Stock.moatStrengthScore` |
| `pricing_power_score` | `Stock.pricingPowerScore` |
| `revenue_recurrence_score` | `Stock.revenueRecurrenceScore` |
| `margin_durability_score` | `Stock.marginDurabilityScore` |
| `capital_intensity_score` | `Stock.capitalIntensityScore` |
| `qualitative_cyclicality_score` | `Stock.qualitativeCyclicalityScore` |

---

## 7. Revenue Engine

### 7.1 Series Construction

For each quarter *q* in the 20-quarter window, compute `revenue_ttm_q` = sum of revenue over the 4 quarters ending at *q*.

### 7.2 History Windows

```
revenue_growth_hist_long   = CAGR or OLS log-slope over the full TTM window available
revenue_growth_hist_recent = CAGR or OLS log-slope over the 8 most recent quarters
revenue_growth_acceleration = revenue_growth_hist_recent − revenue_growth_hist_long
```

### 7.3 Normalised Revenue Growth Formula

```
normalized_revenue_growth =
  0.40 × revenue_growth_hist_long
+ 0.30 × revenue_growth_hist_recent
+ 0.30 × revenue_growth_fwd
```

Re-weighting rules (applied when a component is absent):
- If `revenue_growth_fwd` absent: split its 0.30 weight → 0.18 to long, 0.12 to recent.
- If `revenue_growth_hist_long` absent (< 12 quarters): assign full weight to recent + fwd equally.
- Caps: do not cap for acquisitions/disposals unless clearly non-recurring and flagged; instead reduce `bucket_confidence` when one-period distortions are detected.

---

## 8. Earnings Engine

### 8.1 EPS Series

Primary: rolling TTM diluted EPS (reconstructed from `net_income` / `diluted_shares_outstanding` per quarter).
Fallback (when EPS is negative or noisy for ≥ 6 of the last 12 quarters): use rolling TTM operating earnings per share (`operating_income` / `diluted_shares_outstanding`).

The engine always uses per-share values to capture dilution effects in the history itself.

### 8.2 Historical EPS Growth

```
eps_growth_hist_long   = CAGR or OLS log-slope over full EPS TTM window
eps_growth_hist_recent = CAGR or OLS log-slope over 8 most recent quarters
normalized_eps_hist_growth = 0.60 × eps_growth_hist_long + 0.40 × eps_growth_hist_recent
```

Long history weighted higher because recent noise should not dominate.

### 8.3 Forward EPS — FY2 Fallback Chain

**Preferred source:** FY2 `epsAvg` from FMP analyst-estimates (the FY+2 entry in the annual estimates array; already returned by the existing `fetchForwardEstimates` API call — needs persistence only).

Define `normalized_eps_fwd_growth` using the FY0→FY2 CAGR when available.

**Fallback chain (applied in order; each step reduces `bucket_confidence`):**

| Level | Condition | Derivation | Confidence reduction |
|-------|-----------|------------|---------------------|
| **L1** | FY2 `epsAvg` available | `((epsAvg_fy2 / epsAvg_fy0)^0.5) − 1` (2-year CAGR) | 0 |
| **L2** | FY2 entry exists but `epsAvg` null | `epsNtm × (1 + revenueGrowthFwd)` as proxy for FY2 EPS; single-step estimate | −0.10 |
| **L3** | Only NTM available | `(epsNtm − epsMostRecentFy) / |epsMostRecentFy|` (1-year forward only) | −0.15 |
| **L4** | NTM EPS absent | Exclude `normalized_eps_fwd_growth`; re-weight base formula to `0.60 × rev + 0.40 × eps_hist` | −0.25 |

When EPS is negative at the base (FY0), the FY2 growth computation is meaningless; use Level 4 regardless of FY2 availability. Reduce confidence by −0.25.

---

## 9. Operating Leverage Engine

This is the most important modifying layer. Operating leverage must be a first-class state, not a flag.

### 9.1 Required Metrics

All computable from existing `StockQuarterlyHistory` fields:

```
opex_ttm = gross_profit_ttm − operating_income_ttm   (derived; SG&A+R&D equivalent)
gross_profit_growth_hist_recent   = 8q CAGR of rolling TTM gross_profit
opex_growth_hist_recent           = 8q CAGR of rolling TTM opex
gross_profit_minus_opex_growth_spread_recent = gross_profit_growth_hist_recent − opex_growth_hist_recent
incremental_operating_margin = Δoperating_income_ttm / Δrevenue_ttm  (4Q comparison)
gross_profit_drop_through    = Δoperating_income_ttm / Δgross_profit_ttm  (4Q comparison)
operating_margin_expansion   = operating_margin_ttm_current − operating_margin_ttm_4Q_ago
fcf_conversion_trend         = sign of slope of fcf_conversion over 6 most recent quarters
```

### 9.2 Operating Leverage States and Rules

**`none`** — no meaningful leverage occurring
- `operating_margin_expansion < 0.02`
- `incremental_operating_margin < 0.15`
- `gross_profit_minus_opex_growth_spread_recent ≤ 0`

**`gradual`** — consistent but modest leverage
- `operating_margin_expansion` in [0.02, 0.06)
- `incremental_operating_margin` in [0.15, 0.35)
- `gross_profit_minus_opex_growth_spread_recent > 0`
- Pattern must persist over ≥ 3 quarters

**`emerging_now`** — strongest positive case; structural, not cyclical
- `operating_margin_expansion ≥ 0.06`
- `incremental_operating_margin ≥ 0.35`
- `gross_profit_minus_opex_growth_spread_recent ≥ 0.08`
- `operating_income_growth_hist_recent > normalized_revenue_growth`
- `fcf_conversion_trend > 0`
- AND: `structural_cyclicality_score < 2` (otherwise → `cyclical_rebound` instead)

**`cyclical_rebound`** — operating metrics improve, but cycle rather than structure drives it
- Leverage metrics similar to `emerging_now` OR `gradual`
- BUT: `structural_cyclicality_score ≥ 2` AND cycle_position is recovering from depressed toward normal/elevated

**`deteriorating`** — revenue grows but earnings conversion worsens
- `operating_margin_expansion ≤ −0.02`
- OR `gross_profit_minus_opex_growth_spread_recent < −0.03`
- OR `incremental_operating_margin < 0`

### 9.3 Operating Leverage Contribution

| State | Contribution |
|-------|-------------|
| `none` | 0% |
| `gradual` | +3% |
| `emerging_now` | +8% |
| `cyclical_rebound` | +2% (capped; see §10 interaction) |
| `deteriorating` | −4% |

The asymmetry is intentional: `emerging_now` must matter materially more than `gradual`, and `cyclical_rebound` must never approximate `emerging_now`.

### 9.4 Universal Thresholds

Operating leverage thresholds are universal across all sectors in V1. Sector-family tuning is deferred to a future story once production data reveals systematic miscalibrations.

---

## 10. Cyclicality Normalization

### 10.1 Cyclical Peak Penalty Formula

Cyclicality adjusts the path; it does not replace it.

| `structural_cyclicality_score` | `cycle_position` | Penalty |
|-------------------------------|-----------------|---------|
| 0 | any | 0% |
| 1 | normal / insufficient_data | 0% |
| 1 | elevated / peak | −2% |
| 2 | normal / insufficient_data | −2% |
| 2 | elevated / peak | −5% |
| 3 | normal / insufficient_data | −4% |
| 3 | elevated / peak | −8% |
| any | depressed | 0% |

Do not penalize depressed cyclicals — that would compound the cyclical trough.

### 10.2 Interaction with Operating Leverage

When `operating_leverage_state = cyclical_rebound`:
- Cap operating leverage contribution at +2% (already defined in §9.3).
- Cyclical peak penalty still applies in full as above.
- This prevents a cyclical snapback from masquerading as structural compounding.

---

## 11. Dilution and SBC Penalties

### 11.1 Dilution Penalty

Uses existing `Stock.shareCountGrowth3y` field.

| `share_count_growth_3y` | Penalty |
|------------------------|---------|
| ≤ 3% | 0% |
| 3% – 7% | −1% |
| 7% – 12% | −3% |
| > 12% | −6% |

### 11.2 SBC Burden Penalty

Uses existing `StockDerivedMetrics.sbcAsPctRevenueTtm` field.

| `sbc_as_pct_revenue_ttm` | Additional penalty |
|-------------------------|-------------------|
| ≤ 8% | 0% |
| 8% – 15% | −1% |
| > 15% | −3% |

---

## 12. Qualitative Visibility Modifier

LLM signals support quality and visibility assessment only. Hard cap: ±2%.

```
qualitative_visibility_modifier =
  +2%  when: moat_strength_score ≥ 4 AND pricing_power_score ≥ 4
             AND revenue_recurrence_score ≥ 4 AND margin_durability_score ≥ 4
   0%  when: mixed signals or missing data
  −2%  when: moat_strength_score ≤ 2 OR margin_durability_score ≤ 2
             OR capital_intensity_score ≤ 2 (high capital intensity, low margin durability)
```

**Hard guardrails — LLM signals may never override:**
- Negative profitability (bucket cannot be lifted above 2 on qualitative signals alone)
- `binary_flag = true` (Bucket 8 is absolute)
- Cyclical peak penalty (qualitative modifier does not reduce cyclical penalties)
- Revenue / leverage hard evidence

---

## 13. Final Earnings-Path Formula

### 13.1 Base Growth

```
base_expected_earnings_growth =
    0.45 × normalized_revenue_growth
  + 0.35 × normalized_eps_fwd_growth
  + 0.20 × normalized_eps_hist_growth
```

Revenue receives the highest weight because it is typically the most durable signal.
Forward EPS is weighted heavily because bucket is explicitly medium-term.
Historical EPS matters but should not dominate when the business is transitioning.

Re-weighting when `normalized_eps_fwd_growth` uses L4 fallback: see §8.3.

### 13.2 Full Adjusted Formula

```
expected_normalized_eps_growth =
    base_expected_earnings_growth
  + operating_leverage_contribution
  + qualitative_visibility_modifier
  − cyclical_peak_penalty
  − dilution_penalty
  − sbc_penalty
```

---

## 14. Bucket Mapper

Map `expected_normalized_eps_growth` directly to bucket:

| `expected_normalized_eps_growth` | Bucket |
|----------------------------------|--------|
| < 0% | 1 |
| 0% – 5% | 2 |
| 5% – 10% | 3 |
| 10% – 18% | 4 |
| 18% – 30% | 5 |
| 30% – 50% | 6 |
| > 50% | 7 |

**Bucket 8 override:** `binary_flag = true` forces Bucket 8 regardless of computed value. This is applied before the mapper.

**No tie-break resolver needed.** The formula produces a single continuous number; ties are impossible. Bucket bands are half-open intervals (lower bound inclusive, upper bound exclusive).

---

## 15. Immature / Negative-Earnings Names

When EPS history is negative or meaningless (< 12 valid quarterly EPS data points, or ≥ 6 of the last 12 quarters show negative diluted EPS):

- Use `normalized_revenue_growth` as the primary signal.
- Use `operating_leverage_state` to assess earnings-path visibility.
- Use gross margin profile (`grossMarginTtm`) as a quality gate.
- Apply Level 4 EPS fallback (§8.3).

**Candidate rules for immature names:**
- Bucket 6 candidate: very strong revenue growth + `emerging_now` leverage + credible gross margins + FCF trajectory improving → bucket from formula likely lands ≥ 30%.
- Bucket 7 candidate: extreme revenue growth + optionality-heavy + lower visibility → formula result > 50% or confidence too low for ≤ 7.
- Bucket 8 candidate: binary/event-driven path where even revenue trajectory is unreliable → `binary_flag = true`.

---

## 16. Regime Selector — Updated Semantic (ADR-017 Amendment)

### 16.1 Problem with Current Semantics

The current regime selector (ADR-017) uses raw `revenueGrowthFwd` as a proxy for growth classification (e.g. `>= 0.20` gates profitable_growth_pe). With the new bucket system, the bucket itself directly encodes the normalized earnings growth regime, making `revenueGrowthFwd`-as-growth-proxy weaker and potentially inconsistent.

### 16.2 Proposed Updated Semantic

**Principle:** Bucket replaces `revenueGrowthFwd` as the primary growth signal for regime routing. Margin and profitability conditions remain as financial reality checks.

**Updated Step 1 (Sales-valued path):**
- Current trigger includes `preOperatingLeverageFlag`.
- After EPIC-009, `preOperatingLeverageFlag` is replaced by `operatingLeverageState`.
- New trigger: fires when NOT profitable OR (`operatingLeverageState = emerging_now` AND margins < 10%) OR low-margin+high-growth (unchanged raw condition for continuity).
- `operatingLeverageState = emerging_now` routes to sales path when margins are still low, correctly routing names like Uber-in-2021 to EV/Sales rather than P/E.

**Updated Step 2 (Profitable high-growth PE):**
- Current condition: `revenueGrowthFwd ≥ 0.20` AND operating margin ≥ 25% AND profitable AND FCF-positive.
- New condition: `bucket ∈ {4, 5, 6, 7}` (expected EPS growth ≥ 10%) AND operating margin ≥ 25% AND profitable AND FCF-positive.
- Rationale: bucket is a more durable signal than single-year forward revenue; a stock with bucket 5 but temporarily muted revenue growth (e.g. NVIDIA during inventory correction) should still route to profitable_growth_pe.

**Updated Step 4 (Profitable transitional EV/EBIT):**
- Current condition: `revenueGrowthFwd ≥ 0.15` AND profitable AND FCF AND margin in [10%, 25%).
- New condition: `bucket ∈ {3, 4}` (expected EPS growth 5–18%) AND same profitability/margin conditions.
- Rationale: moderate-growth profitable names at lower margins are the intended EV/EBIT universe.

**All other steps (0A/0B/0C/0D, 3, 4.5, 5, 6) are unchanged.**

### 16.3 Backward Compatibility

During EPIC-009 implementation, add a `bucketGrowthTierGate` helper function that derives the bucket condition cleanly. The raw `revenueGrowthFwd` conditions are retained as fallback for the transition period (any stock without a computed bucket from the new engine falls back to old raw conditions).

---

## 17. Output Fields

The bucket engine must output at minimum:

| Field | Type | Description |
|-------|------|-------------|
| `bucket_suggested` | int | Mapped bucket 1–8 |
| `expected_normalized_eps_growth` | decimal | Final formula result |
| `normalized_revenue_growth` | decimal | Revenue engine output |
| `normalized_eps_hist_growth` | decimal | Historical EPS engine output |
| `normalized_eps_fwd_growth` | decimal | Forward EPS engine output (with fallback level noted) |
| `operating_leverage_state` | enum | none/gradual/emerging_now/cyclical_rebound/deteriorating |
| `operating_leverage_contribution` | decimal | Numeric modifier applied |
| `cyclical_peak_penalty` | decimal | Applied penalty |
| `dilution_penalty` | decimal | Applied penalty |
| `sbc_penalty` | decimal | Applied penalty |
| `qualitative_visibility_modifier` | decimal | Applied modifier |
| `bucket_confidence` | decimal | Confidence score (0–1); reduced by fallback chain and data gaps |
| `bucket_reason_codes` | string[] | Ordered list of signals that drove the bucket outcome |
| `fwd_eps_fallback_level` | int | 1–4; 1 = FY2 direct, 4 = eps_fwd excluded |

---

## 18. Guardrails

1. **Cyclical rebound ≠ structural leverage.** `cyclical_rebound` state is capped at +2% contribution and cyclical penalty still applies.
2. **Revenue gate.** A stock cannot reach bucket ≥ 4 on bottom-line rebound alone if `normalized_revenue_growth < 0.05`. Bucket is floored at 3 in this case regardless of EPS signals.
3. **`emerging_now` is the strongest positive uplift.** No other modifier should produce a larger single positive effect.
4. **Per-share invariant.** All EPS computations use per-share values. Aggregate earnings growth must not be used as a direct input.
5. **Missing data → reduce confidence, not precision.** If forward data is weak, reduce `bucket_confidence` and widen reason codes; do not invent estimates.
6. **LLM cap.** Qualitative visibility modifier cannot exceed ±2% and cannot override any hard negative guardrail.

---

## 19. Open Questions (Resolved for RFC Freeze)

| Question | Resolution |
|----------|-----------|
| FY2 availability fallback | 4-level fallback chain defined in §8.3 |
| Operating leverage threshold universality | Universal thresholds in V1; sector tuning deferred |
| User override migration | No migration needed — no overrides exist in current data |
| Regime selector semantic update | Bucket replaces `revenueGrowthFwd` gates in Steps 2 and 4 (§16) |
| Bucket 8 invariant | Preserved unchanged |
| FY2 implementation detail (FY0–FY2 vs NTM–FY2) | Use FY0→FY2 CAGR (two fiscal years of growth); NTM used only if FY2 absent (L2/L3 fallback) |

---

## 20. Documentation Impact Summary

| Document | Change |
|----------|--------|
| RFC-001 | §Bucket Scorer section replaced by reference to this RFC |
| RFC-002 | Minor amendment: add `eps_fy2_avg` to forward estimates schema |
| RFC-008 | Amendment: add new derived fields table (revenue growth windows, EPS TTM windows, leverage metrics) |
| **ADR-013** | **Full replacement** — point weights → formula weights defined in this RFC |
| ADR-014 | Amendment: tie-break resolver removed; confidence reduction rules updated |
| ADR-012 | Amendment: LLM modifier hard-capped at ±2%; guardrail language added |
| ADR-017 | Amendment: Steps 2 and 4 gates updated per §16 of this RFC |
| **New ADR-019** | Operating Leverage State Engine — formalize §9 as a standalone ADR |

---

## 21. Epic Impact

This RFC is the design basis for **EPIC-009: Earnings Path Bucket Engine**.

Suggested story decomposition:

| Story | Scope |
|-------|-------|
| STORY-100 | Schema migration — new fields: `operating_leverage_state`, `expected_normalized_eps_growth`, `operating_leverage_contribution`, `cyclical_peak_penalty`, `dilution_penalty`, `sbc_penalty`, `qualitative_visibility_modifier`, `bucket_reason_codes`, `fwd_eps_fallback_level`, `eps_fy2_avg` |
| STORY-101 | FMP adapter extension — persist FY2 EPS from existing analyst-estimates fetch |
| STORY-102 | Revenue engine — `normalized_revenue_growth`, history windows, acceleration |
| STORY-103 | Earnings engine — `normalized_eps_hist_growth`, `normalized_eps_fwd_growth`, fallback chain |
| STORY-104 | Operating leverage engine — 5-state classification, all derived leverage metrics |
| STORY-105 | Cyclicality normalization — `cyclical_peak_penalty` using EPIC-008 outputs |
| STORY-106 | Dilution + SBC penalties — wire `share_count_growth_3y` and `sbc_as_pct_revenue_ttm` |
| STORY-107 | Qualitative visibility modifier — bounded LLM modifier from existing scores |
| STORY-108 | Final formula + bucket mapper — assemble engine, replace BucketScorer |
| STORY-109 | Regime selector update — ADR-017 Steps 2 and 4 updated per §16 |
| STORY-110 | Pipeline integration — wire into classification batch + add-stock pipeline |
| STORY-111 | Regression + integration tests — golden-set BDD (Uber, MSFT, NVDA, Ford archetypes) |

---

## 22. Illustrative Expected Outcomes

| Archetype | Drivers | Expected bucket |
|-----------|---------|-----------------|
| Uber-type | Strong revenue + `emerging_now` leverage + improving FCF | 5 or 6 |
| Microsoft-type compounder | Durable revenue + `gradual` leverage + strong quality | 4 or 5 |
| NVIDIA-type cyclical compounder | Extraordinary revenue + strong FCF + real cyclicality + score 3 | 5 or 6 (cyclical penalty applied) |
| Ford-type cyclical | `cyclical_rebound` leverage + significant cyclical penalty + weaker durability | 2 or 3 |
| Early-stage SaaS (negative EPS) | Strong revenue + `emerging_now` + credible gross margins | 6 (L4 fallback; lower confidence) |

---

*RFC-009 status: DRAFT — requires PRD amendment (§bucket semantics) and ADR-013/ADR-019 authoring before implementation begins.*
