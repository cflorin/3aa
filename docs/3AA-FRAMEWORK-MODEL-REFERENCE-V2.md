# 3AA Investment Framework — Model Reference V2

**Version:** 2.0 DRAFT (incorporating all amendments through 2026-04-27; RFC-009 Earnings Path Engine)
**Status:** Draft — submitted for adversarial critique
**Audience:** Human investors (primary) · LLM implementation (secondary)
**Supersedes:** Version 1.0 (2026-04-27)

---

## What Changed from V1

V2 makes one structural change and one semantic change:

**Structural change — Bucket Engine replaced:**
The V1 point-scoring BucketScorer (additive integer weights against revenue/EPS growth ranges) is replaced by a formula-based **Earnings Path Engine**. The engine computes a continuous number — `expected_normalized_eps_growth` — and maps it to a bucket band. No tie-break resolver is needed.

**Semantic change — What bucket means:**
V1 bucket described a business archetype (e.g. "Operating Leverage Grower"). V2 bucket describes the **expected normalised medium-term per-share earnings growth regime**. The two systems are not directly comparable; every stock in the universe will be reclassified when the new engine goes live.

**What did NOT change:**
- Earnings Quality (EQ) and Balance Sheet (BS) scoring
- Valuation regime selector logic (except Steps 2 and 4 gates — see §6)
- Threshold families, quality downgrade steps, cyclical overlay
- TSR hurdles
- Classification state model, user override mechanics, audit trail

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [The 3AA Code System](#2-the-3aa-code-system)
3. [Bucket Engine — Earnings Path](#3-bucket-engine--earnings-path)
4. [Earnings Quality and Balance Sheet Scoring](#4-earnings-quality-and-balance-sheet-scoring)
5. [Classification State Model](#5-classification-state-model)
6. [Valuation Regime Selection](#6-valuation-regime-selection)
7. [Threshold Framework](#7-threshold-framework)
8. [Cyclical Model](#8-cyclical-model)
9. [TSR Hurdles](#9-tsr-hurdles)
10. [Complete Valuation Workflow](#10-complete-valuation-workflow)
11. [Appendices](#11-appendices)

---

## 1. Introduction

The 3AA framework is a systematic, rules-based approach to classifying and valuing publicly traded companies. Its core principle: **the same earnings growth does not deserve the same multiple**. Two companies growing at 15% per year may warrant entirely different valuations depending on the durability of that growth, the quality of earnings, and the financial strength of the business.

The framework produces, for each stock:

1. A **3AA code** — a three-character label encoding earnings growth regime and quality
2. A **valuation regime** — the correct metric and threshold family for that company
3. **Four threshold levels** — max, comfortable, very good, steal — defining when a stock is cheap or expensive
4. An **adjusted TSR hurdle** — the minimum total return required to justify ownership

The framework is transparent, deterministic, and human-auditable. Every output traces to an explicit rule.

### 1.1 Key Design Principles

- **Rules-first:** Identical inputs always produce identical outputs. No black boxes.
- **Metric appropriateness:** A pre-profit grower should not be valued on P/E; a profitable compounder should not be forced onto EV/Sales.
- **Quality matters proportionally:** Better earnings quality and balance sheet strength earn lower required returns and higher acceptable multiples.
- **Conservative defaults:** When data is missing or ambiguous, the system reduces confidence and widens reason codes. It does not invent precision.
- **Per-share invariant:** Bucket is about per-share earnings compounding, not aggregate earnings. Dilution is penalised explicitly.
- **Cyclical and structural compounding are different things.** A cyclical rebound is not structural leverage. The engine distinguishes them.

### 1.2 Two-Layer Architecture

V2 separates two previously entangled concepts:

```
Layer 1 — Classification
  Bucket   = expected normalized per-share earnings growth regime (§3)
  EQ grade = durability and quality of earnings (§4)
  BS grade = financial strength and resilience (§4)
  → produces 3AA code, e.g. "4AA", "5BA"

Layer 2 — Valuation
  Regime selector = which metric and threshold family applies (§6)
  Threshold engine = four levels: max / comfortable / very good / steal (§7)
  Cyclical overlay = cycle-position adjustment to thresholds (§8)
  TSR hurdle = minimum required return (§9)
```

**Bucket does not determine the valuation metric.** That is regime's job. Bucket determines TSR hurdle and provides growth-tier input to the regime selector — but the regime is computed from financial fundamentals (profitability, margins, FCF), not bucket alone.

---

## 2. The 3AA Code System

### 2.1 Code Format

A 3AA code has three characters: `{Bucket}{EarningsQuality}{BalanceSheetQuality}`

Examples: `4AA`, `5BA`, `6BB`, `3AA`

- **Bucket** (digit 1–8): the earnings growth regime — expected normalised medium-term per-share EPS growth band
- **Earnings Quality** (letter A/B/C): durability and quality of earnings
- **Balance Sheet Quality** (letter A/B/C): financial strength and resilience

### 2.2 The Eight Buckets

Buckets represent **bands of expected normalised medium-term per-share earnings growth** over a 3–5 year horizon. The bucket is computed by the Earnings Path Engine (§3) and mapped from a continuous number.

| Bucket | Meaning | Expected normalised per-share EPS growth | V1 label (superseded) |
|--------|---------|------------------------------------------|-----------------------|
| 1 | Earnings decline / impairment | < 0% | Decline / Harvest |
| 2 | Low growth | 0–5% | Defensive Cash Machine |
| 3 | Steady moderate growth | 5–10% | Durable Stalwart |
| 4 | Durable low-teens growth | 10–18% | Elite Compounder |
| 5 | High-teens / 20s growth | 18–30% | Operating Leverage Grower |
| 6 | Very high earnings growth | 30–50% | High-Growth Emerging Compounder |
| 7 | Extreme / optionality-heavy | > 50% or visibility-dependent | Hypergrowth / Venture-Like |
| 8 | Binary / not classifiable | n/a | Lottery / Binary |

**Bucket 8 invariant:** `binary_flag = true` forces Bucket 8 unconditionally, regardless of any computed growth path. This is applied before the bucket mapper.

**Note on V1 bucket labels:** The old bucket labels (e.g. "Elite Compounder" for Bucket 4) remain useful as human shorthand for the type of business that typically lands in that bucket. However, they are no longer the *definition* of the bucket. A company that used to be a Bucket 5 "Operating Leverage Grower" may now be Bucket 4 or Bucket 6 depending on what the engine computes for `expected_normalized_eps_growth`.

**Directional illustrative examples under V2:**

| Bucket | Illustrative names (directional, not guaranteed) |
|--------|--------------------------------------------------|
| 1 | Structurally declining businesses; EPS CAGR clearly negative |
| 2 | Mature stalwarts with low single-digit EPS growth; slow-growth utilities |
| 3 | Large-cap staples, diversified defensives growing 5–10% earnings |
| 4 | Microsoft-type durable compounders at 10–18% normalised EPS |
| 5 | NVIDIA-type at normal cycle (strong leverage, 18–30% normalised EPS); Uber post-leverage inflection |
| 6 | High-growth platform businesses with 30–50% normalised EPS path |
| 7 | Extreme EPS paths; pre-profit names with > 50% normalised path once profitable |
| 8 | Speculative biotech; binary litigation plays |

### 2.3 Earnings Quality Grades (EQ)

The first letter. Measures durability and quality of earnings. **Unchanged from V1.**

#### Grade A — Elite Earnings Quality

- Elite moat: monopoly-like position, irreplaceable workflow, pricing power
- Recurring or deeply embedded revenue; low customer churn
- Long runway of durable growth visible across cycles
- Margins stable or improving
- FCF conversion > 80%
- ROIC high and sustained

**Examples:** Microsoft, dominant workflow software, natural monopoly infrastructure with pricing power.

#### Grade B — Good Earnings Quality

- Real business, real earnings, good franchise
- Good durability — not elite
- More cyclical, competitive, or execution-sensitive than A
- FCF conversion roughly 50–80%
- Margins can wobble; earnings revision risk is moderate

**Examples:** Google Search (with a durability haircut), Uber (if model believed but not fully confident), diversified industrial franchises.

#### Grade C — Fragile / Lower-Quality Earnings

- Weak moat; substitutable product or service
- Weak or inconsistent FCF
- High margin volatility
- High earnings revision risk; execution dependence is high

**Examples:** Speculative growth stories, marginal cyclicals with no pricing power, story stocks.

### 2.4 Balance Sheet Grades (BS)

The second letter. Measures financial strength and resilience. **Unchanged from V1.**

#### Grade A — Fortress

| Metric | Typical Range |
|--------|--------------|
| Net debt / EBITDA | < 1× or net cash |
| Interest coverage | > 12× |
| Liquidity runway | 2+ years |
| Share count | Flat or declining; no habitual dilution |

#### Grade B — Sound

| Metric | Typical Range |
|--------|--------------|
| Net debt / EBITDA | 1–2.5× |
| Interest coverage | 5–12× |
| Refinancing needs | Manageable |
| Dilution | Limited |

#### Grade C — Fragile

| Metric | Typical Range |
|--------|--------------|
| Net debt / EBITDA | > 2.5× |
| Interest coverage | < 5× |
| Liquidity | Tight |
| Share count | Rising materially |

### 2.5 Special Classification Flags

| Flag | Meaning | V2 status |
|------|---------|-----------|
| `holding_company_flag` | Diverse subsidiary structure; consolidated metrics not comparable | Unchanged |
| `insurer_flag` | Insurance operations distort standard metrics | Unchanged |
| `binary_flag` | Binary outcome; forces Bucket 8 unconditionally | Unchanged |
| `bank_flag` | Bank / broker-dealer; fully outside automated framework | Unchanged |
| `operating_leverage_state` | 5-state enum (see §3.4): `none` / `gradual` / `emerging_now` / `cyclical_rebound` / `deteriorating` | **New in V2** |
| `pre_operating_leverage_flag` | Legacy boolean; deprecated in V2. Retained as read-only for backward compatibility | **Deprecated** |
| `cyclicality_flag` | Legacy boolean; replaced by `structural_cyclicality_score >= 1` | Legacy / computed |
| `market_pessimism_flag` | Market appears pessimistic vs. quality; interpretive label only | Unchanged |
| `material_dilution_flag` | Material dilution warrants threshold haircut | Unchanged |

> **Note on `structural_cyclicality_score`:** This is the active cyclicality field (integer 0–3). It replaces the boolean `cyclicality_flag` for all new logic. See §8.

---

## 3. Bucket Engine — Earnings Path

### 3.1 Architecture Overview

The Earnings Path Engine computes a single number — `expected_normalized_eps_growth` — from five input blocks. This number is mapped directly to Bucket 1–8.

```
┌──────────────────────────────────────────────────┐
│  LAYER A — Numeric Growth Engine                 │
│                                                  │
│  Revenue Engine     → normalized_revenue_growth  │
│  Earnings Engine    → normalized_eps_hist_growth │
│                     + normalized_eps_fwd_growth  │
│                                                  │
│  base_expected_earnings_growth =                 │
│    0.45 × normalized_revenue_growth              │
│  + 0.35 × normalized_eps_fwd_growth              │
│  + 0.20 × normalized_eps_hist_growth             │
└──────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────┐
│  LAYER B — Path Modifiers                        │
│                                                  │
│  + operating_leverage_contribution   (§3.4)      │
│  + qualitative_visibility_modifier   (§3.7)      │
│  − cyclical_peak_penalty             (§3.5)      │
│  − dilution_penalty                  (§3.6)      │
│  − sbc_penalty                       (§3.6)      │
│                                                  │
│  → expected_normalized_eps_growth                │
└──────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────┐
│  LAYER C — Bucket Mapper                         │
│                                                  │
│  < 0%    → Bucket 1                             │
│  0–5%    → Bucket 2                             │
│  5–10%   → Bucket 3                             │
│  10–18%  → Bucket 4                             │
│  18–30%  → Bucket 5                             │
│  30–50%  → Bucket 6                             │
│  > 50%   → Bucket 7                             │
│  binary_flag = true → Bucket 8 (override)       │
└──────────────────────────────────────────────────┘
```

**Weight rationale:**
- Revenue (0.45): the most durable signal; harder to fabricate or temporarily distort than EPS.
- Forward EPS (0.35): bucket is explicitly medium-term; analyst consensus is the primary forward anchor.
- Historical EPS (0.20): corroborates trajectory but should not dominate when the business is transitioning.

### 3.2 Revenue Engine

#### 3.2.1 TTM Revenue Series

For each quarter *q* in the 20-quarter history window:

```
revenue_ttm_q = sum of revenue over the 4 quarters ending at q
```

Compute a rolling TTM series for all available quarters.

#### 3.2.2 History Windows

```
revenue_growth_hist_long   = OLS log-slope (or CAGR) over the full TTM series available
revenue_growth_hist_recent = OLS log-slope (or CAGR) over the 8 most recent quarters
revenue_growth_acceleration = revenue_growth_hist_recent − revenue_growth_hist_long
```

If fewer than 8 quarters are available for the recent window, use whatever is available but reduce `bucket_confidence` by 0.10.

#### 3.2.3 Normalised Revenue Growth

```
normalized_revenue_growth =
    0.40 × revenue_growth_hist_long
  + 0.30 × revenue_growth_hist_recent
  + 0.30 × revenue_growth_fwd
```

**Re-weighting rules when a component is absent:**

| Missing component | Re-weighting |
|------------------|-------------|
| `revenue_growth_fwd` | Distribute its 0.30 weight: +0.18 to long, +0.12 to recent |
| `revenue_growth_hist_long` (< 12 quarters) | Split between recent and fwd: 0.50 each |
| Both history components | Use `revenue_growth_fwd` alone; confidence −0.20 |

**Cap policy:** Do not cap extreme single-quarter distortions from acquisitions or disposals. Instead, if one quarter contributes > 50% of the period growth, record a `data_quality_flag` and reduce `bucket_confidence` by 0.10. Leave the number uncapped to preserve auditability.

### 3.3 Earnings Engine

#### 3.3.1 EPS Series Construction

**Primary series:** Rolling TTM diluted EPS, reconstructed per quarter:

```
eps_ttm_q = sum(net_income over 4 quarters ending at q)
           / avg(diluted_shares_outstanding over same 4 quarters)
```

**Fallback series** (used when EPS is not meaningful): Rolling TTM operating EPS:

```
ops_eps_ttm_q = sum(operating_income over 4 quarters ending at q)
               / avg(diluted_shares_outstanding over same 4 quarters)
```

The fallback activates when: EPS is negative or distorted in ≥ 6 of the last 12 quarters. When the fallback activates, reduce `bucket_confidence` by 0.10.

Always use per-share values. Aggregate earnings growth must not be used as a direct input.

#### 3.3.2 Historical EPS Growth

```
eps_growth_hist_long   = OLS log-slope or CAGR over full EPS TTM series
eps_growth_hist_recent = OLS log-slope or CAGR over 8 most recent quarters
normalized_eps_hist_growth = 0.60 × eps_growth_hist_long + 0.40 × eps_growth_hist_recent
```

Long history weighted higher (0.60) because recent noise should not dominate; recent acceleration still matters (0.40).

#### 3.3.3 Forward EPS — FY2 Fallback Chain

**Preferred source:** FY2 annual `epsAvg` from FMP analyst-estimates (the FY+2 entry in the annual estimates array — already returned by the existing API call, needs persistence only).

`normalized_eps_fwd_growth` uses the **FY0→FY2 CAGR** when available.

**Fallback chain — apply in order; each level reduces `bucket_confidence`:**

| Level | Condition | Derivation | Confidence reduction |
|-------|-----------|------------|---------------------|
| **L1** | FY2 `epsAvg` available | `((epsAvg_fy2 / epsAvg_fy0)^0.5) − 1` (annualised 2-year CAGR) | 0 |
| **L2** | FY2 entry exists but `epsAvg` is null | `epsNtm × (1 + revenueGrowthFwd)` as proxy for FY2 EPS; 1-step extrapolation | −0.10 |
| **L3** | Only NTM available | `(epsNtm − epsMostRecentFy) / |epsMostRecentFy|` (1-year fwd only) | −0.15 |
| **L4** | NTM EPS absent OR base EPS negative | Exclude `normalized_eps_fwd_growth`; re-weight base formula to `0.60 × revenue + 0.40 × eps_hist` | −0.25 |

**FY0 definition:** The most recently completed fiscal year (the `mostRecentCompletedFy` entry — last analyst-estimates entry with date ≤ today).

**Negative base rule:** When `epsAvg_fy0 < 0` (or zero), the FY2 CAGR computation is undefined. Apply Level 4 regardless of FY2 data availability.

### 3.4 Operating Leverage Engine

This is the most important modifying layer. Operating leverage must be a first-class state with a numeric contribution, not a boolean flag.

#### 3.4.1 Required Derived Metrics

All computable from existing `StockQuarterlyHistory` fields. `opex` is derived as `gross_profit − operating_income` — no separate SG&A/R&D breakdown required.

| Metric | Definition |
|--------|-----------|
| `opex_ttm_q` | `gross_profit_ttm_q − operating_income_ttm_q` (rolling) |
| `gross_profit_growth_hist_recent` | 8-quarter CAGR or OLS slope of rolling TTM gross profit |
| `opex_growth_hist_recent` | 8-quarter CAGR or OLS slope of rolling TTM opex |
| `gross_profit_minus_opex_growth_spread_recent` | `gross_profit_growth_hist_recent − opex_growth_hist_recent` |
| `incremental_operating_margin` | `Δoperating_income_ttm / Δrevenue_ttm` (trailing 4 quarters) |
| `gross_profit_drop_through` | `Δoperating_income_ttm / Δgross_profit_ttm` (trailing 4 quarters) |
| `operating_margin_expansion` | `operating_margin_ttm_now − operating_margin_ttm_4Q_ago` |
| `fcf_conversion_trend` | Sign of OLS slope of `fcf_conversion` over 6 most recent quarters |
| `operating_income_growth_hist_recent` | 8-quarter CAGR or OLS slope of rolling TTM operating income |

#### 3.4.2 State Classification Rules

States are evaluated in precedence order. First match wins.

**Precedence:** `deteriorating` → `emerging_now` → `cyclical_rebound` → `gradual` → `none`

---

**State: `deteriorating`** — triggered by any single condition:
- `operating_margin_expansion ≤ −0.02` (margin compressed ≥ 2pp)
- OR `gross_profit_minus_opex_growth_spread_recent < −0.03` (opex outgrowing gross profit by > 3%)
- OR `incremental_operating_margin < 0` (revenue grew but operating income fell)

---

**State: `emerging_now`** — ALL of the following must hold:
- `operating_margin_expansion ≥ 0.06` (margin expanded ≥ 6pp)
- `incremental_operating_margin ≥ 0.35` (strong operating leverage)
- `gross_profit_minus_opex_growth_spread_recent ≥ 0.08` (GP outgrowing opex by ≥ 8%)
- `operating_income_growth_hist_recent > normalized_revenue_growth` (earnings growing faster than revenue)
- `fcf_conversion_trend > 0` (FCF conversion improving)
- `structural_cyclicality_score < 2` (if ≥ 2, classify as `cyclical_rebound` instead)

*This is the Uber/Cloudflare scenario: structural inflection, not a cyclical bounce.*

---

**State: `cyclical_rebound`** — operating metrics resemble `emerging_now` or `gradual` BUT:
- `structural_cyclicality_score ≥ 2`
- AND cycle position is recovering from depressed toward normal or elevated

*The operating metrics are improving, but the structural cyclicality score signals that part of the improvement is cycle recovery, not durable structural leverage.*

---

**State: `gradual`** — ALL of the following must hold:
- `operating_margin_expansion ∈ [0.02, 0.06)` (modest but real margin improvement)
- `incremental_operating_margin ∈ [0.15, 0.35)` (positive but moderate)
- `gross_profit_minus_opex_growth_spread_recent > 0` (GP outgrowing opex)
- Pattern persisted ≥ 3 consecutive quarters

---

**State: `none`** — default when no other state fires:
- `operating_margin_expansion < 0.02`
- `incremental_operating_margin < 0.15`
- `gross_profit_minus_opex_growth_spread_recent ≤ 0`

---

#### 3.4.3 Operating Leverage Contribution

| State | Contribution to `expected_normalized_eps_growth` |
|-------|--------------------------------------------------|
| `none` | **0%** |
| `gradual` | **+3%** |
| `emerging_now` | **+8%** |
| `cyclical_rebound` | **+2%** (hard cap; cannot be elevated by any other signal) |
| `deteriorating` | **−4%** |

**Asymmetry rationale:** `emerging_now` is the intended strongest positive signal in the entire engine. A genuine structural operating leverage inflection is one of the most investable events in the framework, and the +8% contribution reflects that. `cyclical_rebound` is capped at +2% precisely because it can *look like* `emerging_now` but is driven partly by cycle recovery — an unreliable foundation.

**Universal thresholds (V2.0):** All state thresholds above are universal across sectors. Sector-specific tuning (e.g. different `incremental_operating_margin` floors for capital-intensive industrials) is deferred to a future version once production data reveals systematic miscalibrations.

### 3.5 Cyclicality Normalisation

Cyclicality adjusts the earnings path; it does not replace it. Cyclical rebound is not structural compounding.

#### 3.5.1 Cyclical Peak Penalty Matrix

This penalty reduces `expected_normalized_eps_growth` for companies where current earnings may reflect elevated cyclical conditions. It is not a threshold overlay (that is applied separately in §7) — it is an earnings-path correction.

| `structural_cyclicality_score` | `cycle_position` | Penalty |
|-------------------------------|-----------------|---------|
| 0 | any | 0% |
| 1 | `normal` / `insufficient_data` | 0% |
| 1 | `elevated` / `peak` | −2% |
| 2 | `normal` / `insufficient_data` | −2% |
| 2 | `elevated` / `peak` | −5% |
| 3 | `normal` / `insufficient_data` | −4% |
| 3 | `elevated` / `peak` | −8% |
| any | `depressed` | 0% |

**Do not penalise depressed cyclicals in the bucket engine.** Depressed earnings are already below normal; penalising them in the bucket computation would produce a double-penalty (they already score poorly in the earnings engine from low historical EPS).

#### 3.5.2 Interaction with Operating Leverage State

When `operating_leverage_state = cyclical_rebound`:
- Operating leverage contribution is capped at +2% (already defined in §3.4.3).
- The cyclical peak penalty from the matrix above still applies in full.
- These two rules together prevent a cyclical snapback from masquerading as structural compounding.

**Concrete example (Ford-type cyclical at normal cycle, score 3):**
- Operating leverage state: `cyclical_rebound` → contribution = +2%
- Cyclical peak penalty: score 3, normal cycle → −4%
- Net effect: −2% drag on the earnings path

**Same example at elevated cycle:**
- Cyclical_rebound contribution: +2%
- Cyclical peak penalty: score 3, elevated → −8%
- Net effect: −6% drag

### 3.6 Dilution and SBC Penalties

Bucket is about per-share earnings growth. Dilution and stock-based compensation both erode the per-share path.

#### 3.6.1 Dilution Penalty

Uses `share_count_growth_3y` (already stored).

| `share_count_growth_3y` | Penalty |
|------------------------|---------|
| ≤ 3% | 0% |
| (3%, 7%] | −1% |
| (7%, 12%] | −3% |
| > 12% | −6% |

#### 3.6.2 SBC Burden Penalty

Uses `sbc_as_pct_revenue_ttm` (already computed in derived metrics).

| `sbc_as_pct_revenue_ttm` | Additional penalty |
|-------------------------|-------------------|
| ≤ 8% | 0% |
| (8%, 15%] | −1% |
| > 15% | −3% |

### 3.7 Qualitative Visibility Modifier

LLM signals support quality and visibility assessment only. They must never replace arithmetic.

**Hard cap: ±2%. No exceptions.**

```
qualitative_visibility_modifier =
  +2%  when ALL of: moat_strength_score ≥ 4
                     AND pricing_power_score ≥ 4
                     AND revenue_recurrence_score ≥ 4
                     AND margin_durability_score ≥ 4
   0%  when: mixed signals, or any qualifying score is missing
  −2%  when ANY of: moat_strength_score ≤ 2
                     OR margin_durability_score ≤ 2
                     OR capital_intensity_score ≤ 2 (high capex, low margin durability)
```

**Guardrails — LLM modifier may never:**
- Elevate a bucket beyond where the arithmetic places it (cannot add more than +2%)
- Override a negative profitability outcome
- Reduce cyclical peak penalties
- Override the `binary_flag = true` → Bucket 8 invariant
- Elevate a stock with `deteriorating` operating leverage above where the formula places it

### 3.8 Final Formula and Bucket Mapper

#### 3.8.1 Base Growth

```
base_expected_earnings_growth =
    0.45 × normalized_revenue_growth
  + 0.35 × normalized_eps_fwd_growth
  + 0.20 × normalized_eps_hist_growth
```

If `normalized_eps_fwd_growth` is absent (L4 fallback), substitute:
```
base_expected_earnings_growth =
    0.60 × normalized_revenue_growth
  + 0.40 × normalized_eps_hist_growth
```

#### 3.8.2 Full Adjusted Formula

```
expected_normalized_eps_growth =
    base_expected_earnings_growth
  + operating_leverage_contribution
  + qualitative_visibility_modifier
  − cyclical_peak_penalty
  − dilution_penalty
  − sbc_penalty
```

#### 3.8.3 Bucket Mapper

Map `expected_normalized_eps_growth` to bucket using these bands. Bands are half-open intervals (lower bound inclusive, upper bound exclusive):

| `expected_normalized_eps_growth` | Bucket |
|----------------------------------|--------|
| < 0% | 1 |
| 0% – < 5% | 2 |
| 5% – < 10% | 3 |
| 10% – < 18% | 4 |
| 18% – < 30% | 5 |
| 30% – < 50% | 6 |
| ≥ 50% | 7 |

**Bucket 8 override:** If `binary_flag = true`, assign Bucket 8 unconditionally. This check runs before the mapper; the formula is not computed.

No tie-break resolver is needed — the formula produces a single continuous number, and a continuous number always falls in exactly one half-open interval.

### 3.9 Immature / Negative-Earnings Names

When EPS history is not meaningful (EPS negative or missing in ≥ 6 of the last 12 quarters):

1. Apply Level 4 fallback (§3.3.3): exclude `normalized_eps_fwd_growth`; re-weight to `0.60 × revenue + 0.40 × eps_hist`.
2. If `eps_hist` is also not computable (all negative), reduce further to `1.0 × normalized_revenue_growth` as the base; confidence −0.30.
3. Operating leverage state remains active and contributes its normal modifier.
4. Qualitative modifier applies normally.
5. Cyclical and dilution penalties apply normally.

**Expected outcomes for immature names:**

| Profile | Expected bucket | Reasoning |
|---------|----------------|-----------|
| Very strong revenue growth + `emerging_now` leverage + credible gross margins + improving FCF | 6 (L4 fallback; lower confidence) | Formula driven primarily by revenue + leverage |
| Extreme revenue growth + lower visibility + optionality dominant | 7 | Formula > 50%; or confidence too low to bucket below 7 |
| Binary / event-driven / earnings path not modelable | 8 | `binary_flag = true` |

### 3.10 Guardrails

These invariants must hold in every implementation:

1. **`emerging_now` is the strongest single positive modifier (+8%).** No other signal in the engine may produce a larger positive effect.
2. **`cyclical_rebound` is hard-capped at +2%.** No data combination may elevate this.
3. **Revenue gate.** A stock cannot reach Bucket ≥ 4 (`expected_normalized_eps_growth ≥ 10%`) if `normalized_revenue_growth < 5%`, regardless of EPS signals. Floor the bucket at 3 in this case.
4. **Per-share invariant.** All EPS computations use per-share values. Aggregate earnings growth must not substitute for per-share in any formula component.
5. **Missing data → reduce confidence, not precision.** Missing or unreliable forward data reduces `bucket_confidence` and widens reason codes. The engine must not fabricate estimates.
6. **LLM cap enforced absolutely.** The qualitative visibility modifier is capped at ±2%. The cap is not a soft guideline.
7. **Bucket 8 is unconditional.** `binary_flag = true` assigns Bucket 8 before any computation runs.

### 3.11 Engine Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `bucket_suggested` | int 1–8 | Mapped bucket |
| `expected_normalized_eps_growth` | decimal | Full formula result (the number mapped to bucket) |
| `normalized_revenue_growth` | decimal | Revenue engine output |
| `normalized_eps_hist_growth` | decimal | Historical EPS engine output |
| `normalized_eps_fwd_growth` | decimal | Forward EPS engine output (null if L4 fallback used) |
| `operating_leverage_state` | enum | none / gradual / emerging_now / cyclical_rebound / deteriorating |
| `operating_leverage_contribution` | decimal | Numeric modifier applied to formula |
| `cyclical_peak_penalty` | decimal | Applied penalty (positive value; subtracted in formula) |
| `dilution_penalty` | decimal | Applied dilution penalty |
| `sbc_penalty` | decimal | Applied SBC burden penalty |
| `qualitative_visibility_modifier` | decimal | Applied LLM modifier (−0.02 to +0.02) |
| `bucket_confidence` | decimal 0–1 | Overall confidence; reduced by fallbacks and data gaps |
| `bucket_reason_codes` | string[] | Ordered list of signals that drove the bucket outcome |
| `fwd_eps_fallback_level` | int 1–4 | Which fallback level was used for forward EPS |
| `revenue_growth_hist_long` | decimal | Component of normalized_revenue_growth |
| `revenue_growth_hist_recent` | decimal | Component of normalized_revenue_growth |
| `revenue_growth_acceleration` | decimal | Recent minus long revenue growth |
| `incremental_operating_margin` | decimal | Trailing 4Q incremental margin |
| `gross_profit_drop_through` | decimal | Trailing 4Q GP drop-through |
| `operating_margin_expansion` | decimal | TTM vs 4Q-ago margin delta |

---

## 4. Earnings Quality and Balance Sheet Scoring

**Unchanged from V1.** These dimensions are independent of the bucket engine change.

### 4.1 Earnings Quality Scoring

The EQ scorer uses additive point weights. Grade A/B/C is determined by which grade accumulates the highest total points.

**EQ Scoring Weights:**

| Signal | Weight | Direction | Condition |
|--------|--------|-----------|-----------|
| `EQ_FCF_STRONG` | 2 | → A | `fcf_conversion > 0.80` |
| `EQ_FCF_MODERATE` | 2 | → B | `fcf_conversion ∈ [0.50, 0.80]` |
| `EQ_FCF_WEAK` | 2 | → C | `fcf_conversion < 0.50` or `fcf_positive = false` |
| `EQ_MOAT_STRONG` | 2 | → A | `moat_strength_score ≥ 4.0` |
| `EQ_MOAT_MODERATE` | 1 | → B | `moat_strength_score ∈ [2.5, 4.0)` |
| `EQ_MOAT_WEAK` | 1 | → C | `moat_strength_score < 2.5` |
| `EQ_NI_POSITIVE` | 1 | → A, B | `net_income_positive = true` |
| `EQ_EPS_DECLINING` | 1 | → C | `eps_growth_3y < 0` |
| `EQ_EPS_REV_SPREAD_MODERATE` | 1 | → C | `(eps_growth_3y − revenue_growth_3y) ∈ [−0.20, −0.10)` |
| `EQ_EPS_REV_SPREAD_SEVERE` | 3 | → C | `(eps_growth_3y − revenue_growth_3y) < −0.20` |

`EQ_EPS_REV_SPREAD_MODERATE` and `EQ_EPS_REV_SPREAD_SEVERE` are mutually exclusive. `EQ_EPS_DECLINING` stacks with whichever spread signal fires.

**Grade assignment:** Highest total wins. Tie: A > B > C.

**Grade A FCF boundary:** `fcf_conversion == 0.80` is classified as moderate (B direction). Strong threshold is strictly `> 0.80`.

### 4.2 Balance Sheet Scoring

**BS Scoring Weights:**

| Signal | Weight | Direction | Condition |
|--------|--------|-----------|-----------|
| `BS_DEBT_LOW` | 3 | → A | `net_debt_to_ebitda < 1.0` |
| `BS_DEBT_MODERATE` | 2 | → B | `net_debt_to_ebitda ∈ [1.0, 2.5]` |
| `BS_DEBT_HIGH` | 3 | → C | `net_debt_to_ebitda > 2.5` |
| `BS_COVERAGE_STRONG` | 2 | → A | `interest_coverage > 12.0` |
| `BS_COVERAGE_MODERATE` | 1 | → B | `interest_coverage ∈ [5.0, 12.0]` |
| `BS_COVERAGE_WEAK` | 2 | → C | `interest_coverage < 5.0` |
| `BS_CAPITAL_INTENSITY` | 1 | → C | `capital_intensity_score ≥ 4.0` |

Net-cash position (`net_debt_to_ebitda ≤ 0`): additional +1 to A score. Net cash is stronger than the < 1× threshold.

### 4.3 LLM Enrichment Layer

Six qualitative scores (E1–E6) from the classification enrichment pipeline:

| Score | Concept | Scale | Used in |
|-------|---------|-------|---------|
| E1 `moat_strength_score` | Moat quality | 1–5 | EQ scoring, qualitative modifier |
| E2 `pricing_power_score` | Pricing power | 1–5 | Cyclicality modifier, qualitative modifier |
| E3 `revenue_recurrence_score` | Revenue recurrence | 1–5 | Qualitative modifier |
| E4 `margin_durability_score` | Margin durability | 1–5 | EQ scoring, qualitative modifier |
| E5 `capital_intensity_score` | Capital intensity | 1–5 | BS scoring, qualitative modifier |
| E6 `qualitative_cyclicality_score` | Cyclicality | 1–5 | Structural cyclicality score modifier |

LLM signals adjust EQ/BS scoring and contribute up to ±2% to the qualitative visibility modifier. They cannot override hard profitability gates or the Bucket 8 invariant.

### 4.4 Confidence-Based Effective Bucket Demotion

When classification confidence is **low**, the valuation engine uses a demoted effective bucket for metric and threshold selection. This ensures uncertain classifications do not generate overly generous thresholds.

| Actual Bucket | Low-Confidence Effective Bucket |
|--------------|--------------------------------|
| 4 | 3 |
| 5 | 4 |
| 6 | 5 |
| 7 | 6 |
| 1, 2, 3, 8 | Unchanged |

---

## 5. Classification State Model

**Unchanged from V1.**

Each stock moves through four states:

```
unreviewed → accepted     (user accepts suggestion)
unreviewed → overridden   (user overrides suggestion)
accepted   → needs_review (suggested code changes on recompute)
overridden → needs_review (suggested code changes on recompute)
needs_review → accepted   (user re-accepts new suggestion)
needs_review → overridden (user sets new override)
```

**Key guarantee:** `final_code` is **never** changed by the system. Only a user action changes `final_code`. The system updates `suggested_code` and sets status to `needs_review` when new data warrants reclassification.

**Override semantics under V2:** Existing overrides are semantically against the V1 bucket definition. When the V2 engine goes live, all `suggested_code` values will be recomputed; existing `final_code` overrides are preserved but will be flagged as `needs_review` to prompt the user to re-evaluate their overrides against the new engine output.

---

## 6. Valuation Regime Selection

### 6.1 Why Regimes Exist

The valuation regime separates "what kind of company is this" (bucket) from "which metric and threshold applies" (regime). NVIDIA and Walmart can both be in Bucket 3 or 4 under the same earnings-path computation, yet warrant completely different valuation treatment. The regime selector makes this distinction using live financial fundamentals.

### 6.2 The Ten Regimes

| Regime | Primary Metric | Purpose |
|--------|---------------|---------|
| `not_applicable` | `no_stable_metric` | Bucket 8; lottery / binary outcomes |
| `financial_special_case` | `forward_operating_earnings_ex_excess_cash` | Insurers and holding companies, any bucket |
| `sales_growth_standard` | `ev_sales` | Immature / low-margin / pre-profit growth |
| `sales_growth_hyper` | `ev_sales` | High gross margin, high growth; distinct (higher) threshold family |
| `profitable_growth_pe` | `forward_pe` | Profitable high-growth compounder |
| `cyclical_earnings` | `forward_ev_ebit` | Cyclical with real earnings; EV/EBIT avoids cycle distortion |
| `profitable_growth_ev_ebit` | `forward_ev_ebit` | Profitable but scaling / transitional; margin 10–25% |
| `high_amortisation_earnings` | `forward_ev_ebitda` | Profitable with heavy acquired-intangible D&A; GAAP P/E materially distorted |
| `mature_pe` | `forward_pe` | Stable profitable; classic P/E |
| `manual_required` | `no_stable_metric` | Catch-all; no safe automated metric |

### 6.3 Regime Selector Inputs

| Input | Source |
|-------|--------|
| `bucket` | Parsed from `active_code` |
| `net_income_positive` | `net_income_ttm > 0` |
| `fcf_positive` | `free_cash_flow_ttm > 0` |
| `operating_margin_ttm` | `stock_derived_metrics.operating_margin_ttm` |
| `gross_margin_ttm` | `stock_derived_metrics.gross_margin_ttm` |
| `revenue_growth_fwd` | `stock.revenue_growth_fwd` |
| `fcf_conversion_ttm` | `free_cash_flow_ttm / net_income_ttm` |
| `structural_cyclicality_score` | `stock.structural_cyclicality_score` (0–3) |
| `ebitda_ntm` | FMP `ebitdaAvg` for NTM period |
| `ebit_ntm` | FMP `ebitAvg` for NTM period |
| `bank_flag` | `stock.bank_flag` |
| `insurer_flag` | `stock.insurer_flag` |
| `holding_company_flag` | `stock.holding_company_flag` |
| `pre_operating_leverage_flag` | `stock.pre_operating_leverage_flag` *(legacy; in V2 Step 1, consider replacing with `operating_leverage_state = emerging_now AND operating_margin_ttm < 0.10`)* |

### 6.4 Step-by-Step Rules

Rules execute in strict precedence order. The first rule that fires determines the regime; subsequent rules are not evaluated.

---

#### Step 0A — Bucket 8 Exclusion

```
IF bucket = 8
THEN regime = not_applicable
```

Binary / lottery stocks have no stable metric by framework definition.

---

#### Step 0B — Bank Flag

```
IF bank_flag = true
THEN regime = manual_required
```

Banks and financial institutions are fully outside the automated framework. EV/EBIT is meaningless for banks (deposits are not comparable to corporate debt). P/E requires loan-loss normalisation beyond framework scope. ROE and P/TBV are practitioner metrics outside current scope. **Fires regardless of bucket.**

Examples: JPM, BAC, GS, MS, WFC, C.

---

#### Step 0C — Insurer Flag

```
IF insurer_flag = true
THEN regime = financial_special_case
     primary_metric = forward_operating_earnings_ex_excess_cash
```

Insurance companies have non-operating investment income that distorts standard metrics. **Fires regardless of bucket.**

---

#### Step 0D — Holding Company Flag

```
IF holding_company_flag = true
THEN regime = financial_special_case
     primary_metric = forward_operating_earnings_ex_excess_cash
```

Consolidated P/E or EV/EBIT reflects an incoherent mix of underlying businesses. **Fires regardless of bucket.**

> **`financial_special_case` semantics:** The metric type is known (`forward_operating_earnings_ex_excess_cash`) but the normalised earnings value and thresholds must be supplied by the user. Until provided, `valuation_state_status = 'manual_required'`. Berkshire Hathaway: both `insurer_flag` and `holding_company_flag`; Step 0C fires first.

---

#### Step 1 — Sales-Valued Growth Path

```
IF any of:
  net_income_positive = false
  (operating_margin_ttm < 0.10 AND revenue_growth_fwd >= 0.10)
  pre_operating_leverage_flag = true
THEN:
  IF revenue_growth_fwd >= 0.40 AND gross_margin_ttm >= 0.70:
    regime = sales_growth_hyper
  ELSE:
    regime = sales_growth_standard
```

Companies that are loss-making or operating below 10% margin on a growth trajectory are not ready for earnings-based valuation.

**Why the 10% margin gate requires `revenue_growth_fwd >= 0.10`:** Mature profitable businesses with structurally low margins (large-format retail, distribution) have sub-10% operating margins for competitive/structural reasons, not because they are pre-scale. A low-margin, low-growth business should reach `mature_pe` via Step 5 — not EV/Sales.

**V2 note on `pre_operating_leverage_flag`:** In V2, the intent of this flag is better captured by `operating_leverage_state = emerging_now AND operating_margin_ttm < 0.10`. A full replacement is deferred to the EPIC-009 STORY-109 update.

---

#### Step 2 — Profitable High-Growth PE Path *(V2: bucket-gated)*

**V2 condition (effective when EPIC-009 engine is live):**

```
IF all of:
  bucket ∈ {4, 5, 6, 7}        (expected normalised EPS growth ≥ 10%)
  operating_margin_ttm >= 0.25
  net_income_positive = true
  fcf_positive = true
  fcf_conversion_ttm >= 0.60
THEN regime = profitable_growth_pe
```

**V1 condition (fallback during transition — used when bucket not yet computed by new engine):**

```
revenue_growth_fwd >= 0.20  (in place of bucket gate)
```

**Rationale for change:** Bucket, computed from the normalised earnings path, is a more durable signal than single-year forward revenue. A stock with bucket 4–7 has passed through the operating leverage engine, cyclicality normalisation, and forward estimates synthesis — it represents a richer judgment than `revenue_growth_fwd` alone. A NVIDIA-type stock with temporarily muted forward revenue (inventory correction, mid-cycle revenue softness) but strong structural earnings path should still qualify for `profitable_growth_pe`.

**Precedence over Step 3:** A cyclical name that qualifies Step 2 remains in `profitable_growth_pe`. The cyclical overlay is applied separately at the threshold level. It must not be shunted into `cyclical_earnings` solely because of cyclicality score.

**Score-3 exception:** `structural_cyclicality_score = 3` re-routes to `cyclical_earnings` even if all Step 2 conditions are met. A score-3 cyclical does not support the full `profitable_growth_pe` family even with a haircut.

---

#### Step 3 — Cyclical Earnings Path

```
IF all of:
  structural_cyclicality_score >= 1
  net_income_positive = true
  operating_margin_ttm >= 0.10
THEN regime = cyclical_earnings
```

Cyclicals with real earnings should not be treated as immature sales-valued growth names. EV/EBIT is the cleaner anchor because it uses enterprise value (less cycle-sensitive) and operating earnings (avoids financing distortion).

---

#### Step 4 — Profitable Transitional EV/EBIT *(V2: bucket-gated)*

**V2 condition (effective when EPIC-009 engine is live):**

```
IF all of:
  bucket ∈ {3, 4}              (expected normalised EPS growth 5–18%)
  net_income_positive = true
  fcf_positive = true
  operating_margin_ttm >= 0.10 AND < 0.25
THEN regime = profitable_growth_ev_ebit
```

**V1 condition (fallback during transition):**

```
revenue_growth_fwd >= 0.15  (in place of bucket gate)
```

Profitable, growing, but still in a scaling phase. EV/EBIT captures value at the enterprise level without per-share reinvestment distortion. The `< 0.25` upper bound forms a clean partition with Step 2 (≥ 0.25).

---

#### Step 4.5 — High Amortisation Earnings

```
IF all of:
  ebitda_ntm is not null
  ebit_ntm is not null and > 0
  ebitda_ntm / ebit_ntm >= 1.30   (implied D&A >= 30% of EBIT)
  net_income_positive = true
  fcf_positive = true
THEN regime = high_amortisation_earnings
```

Companies with ≥ 30% D&A burden relative to EBIT carry large acquired-intangible amortisation charges that depress GAAP EPS without affecting cash earnings. EV/EBITDA at the enterprise level adds back these non-cash charges and is the sell-side standard for pharma and large-cap acquirers.

**Calibration examples:**

| Stock | ebitda/ebit | Triggers? |
|-------|-------------|-----------|
| ABBV | 1.76× | Yes |
| PFE | 1.38× | Yes |
| JNJ | 1.35× | Yes |
| MRK | 1.19× | No |
| AZN | 1.17× | No |
| MSFT | 1.19× | No |

---

#### Step 5 — Mature PE Default

```
IF net_income_positive = true AND fcf_positive = true
THEN regime = mature_pe
```

Stable profitable companies that did not qualify for any growth, cyclical, or high-amortisation path.

---

#### Step 6 — Catch-All

```
ELSE regime = manual_required
```

---

### 6.5 Precedence Rules

| Priority | Step | Reason |
|----------|------|--------|
| 1 | Bucket 8 (0A) | Binary stocks; no metric applies |
| 2 | Bank flag (0B) | Banks fully outside automated framework |
| 3 | Financial special cases (0C/0D) | Non-standard earnings base; metric type known but inputs manual |
| 4 | Sales-valued path (1) | Cannot fake profitability; unprofitable names must not reach P/E regimes |
| 5 | Profitable high-growth PE (2) | NVIDIA/MSFT must reach Step 2 before Step 3 |
| 6 | Cyclical earnings (3) | Cyclical risk is distinct from transitional growth |
| 7 | Profitable transitional (4) | Moderate-growth names in scaling phase; not ready for premium P/E |
| 8 | High amortisation (4.5) | Mature names with D&A distortion; after growth paths checked |
| 9 | Mature PE (5) | Final automated path for stable profitable names |

### 6.6 Growth Tier within `profitable_growth_pe` (V2)

The three growth tiers remain, but in V2 they are keyed on **bucket** rather than `revenue_growth_fwd`:

| Bucket | Growth tier | Rationale |
|--------|------------|-----------|
| 7 | `high` | > 50% expected EPS growth |
| 6 | `high` | 30–50% expected EPS growth |
| 5 | `mid` | 18–30% expected EPS growth |
| 4 | `standard` | 10–18% expected EPS growth |

`revenue_growth_fwd` bands are retained as tie-breaker within a bucket and as fallback during transition.

**Threshold quads by tier** (unchanged from V1):

| Tier | Max | Comfortable | Very Good | Steal |
|------|-----|-------------|-----------|-------|
| `high` | 36× | 30× | 24× | 18× |
| `mid` | 30× | 25× | 21× | 17× |
| `standard` | 26× | 22× | 19× | 16× |

### 6.7 Illustrative Stock Assignments (V2)

Directional expectations; actual regime depends on live financial data at computation time.

| Stock | Expected Bucket (V2) | Expected Regime | Key Reason |
|-------|---------------------|----------------|------------|
| NVDA (normal cycle) | 5 or 6 | `profitable_growth_pe` | Bucket ∈ {4–7} + 65% op margin + strong FCF |
| MSFT | 4 | `profitable_growth_pe` or `mature_pe` | Bucket 4 qualifies Step 2 if margin/FCF conditions met |
| AAPL | 4 | `profitable_growth_pe` or `mature_pe` | High margin and FCF; bucket is swing factor |
| WMT | 2 or 3 | `mature_pe` | Bucket 2–3; Step 2 and 4 fail (bucket too low) |
| MU | 3 or 4 (normal cycle) | `cyclical_earnings` | FCF conversion < 0.60 bars Step 2; cyclical score ≥ 1 |
| XOM / CVX | 2 or 3 | `cyclical_earnings` | Energy cyclicals; cyclicality score ≥ 1 |
| JPM | any | `manual_required` | `bank_flag = true`; Step 0B |
| BRK | any | `financial_special_case` | `insurer_flag + holding_company_flag`; Step 0C |
| ABBV | 3 | `high_amortisation_earnings` | Mature, profitable, ebitda/ebit = 1.76× |
| DE | 2 or 3 | `cyclical_earnings` | Cyclical; modest normalised EPS growth |
| Uber (post-leverage) | 5 | `profitable_growth_pe` or `sales_growth_standard` | Depends on current op margin vs 10% / 25% gates |

---

## 7. Threshold Framework

**Unchanged from V1.** This section is reproduced in full for document self-containment.

### 7.1 The Four Threshold Levels

| Level | Name | Interpretation |
|-------|------|---------------|
| **Max** | Upper bound | Not cheap. Acceptable only when quality is high and the opportunity is rare. Do not overpay above this. |
| **Comfortable** | Core build zone | The investor should be comfortable building a position here. |
| **Very Good** | Lean-in zone | The gap between price and fair value is meaningfully attractive. Increase conviction. |
| **Steal** | Gift zone | Rare dislocation. Unusually asymmetric upside if the thesis remains intact. |

### 7.2 Base Threshold Families (A/A Quality)

| Regime | Primary Metric | Max | Comfortable | Very Good | Steal |
|--------|---------------|-----|-------------|-----------|-------|
| `mature_pe` | Forward P/E | 22.0× | 20.0× | 18.0× | 16.0× |
| `profitable_growth_pe` (high tier, ≥ Bucket 6) | Forward P/E | 36.0× | 30.0× | 24.0× | 18.0× |
| `profitable_growth_pe` (mid tier, Bucket 5) | Forward P/E | 30.0× | 25.0× | 21.0× | 17.0× |
| `profitable_growth_pe` (standard tier, Bucket 4) | Forward P/E | 26.0× | 22.0× | 19.0× | 16.0× |
| `profitable_growth_ev_ebit` | Forward EV/EBIT | 24.0× | 20.0× | 16.0× | 12.0× |
| `cyclical_earnings` | Forward EV/EBIT | 16.0× | 13.0× | 10.0× | 7.0× |
| `high_amortisation_earnings` | Forward EV/EBITDA | 18.0× | 15.0× | 12.0× | 9.0× |
| `sales_growth_standard` | EV/Sales | 12.0× | 10.0× | 8.0× | 6.0× |
| `sales_growth_hyper` | EV/Sales | 18.0× | 15.0× | 11.0× | 8.0× |
| `financial_special_case` | Fwd op. earnings ex excess cash | Manual | — | — | — |
| `not_applicable` / `manual_required` | No metric | — | — | — | — |

### 7.3 Quality Downgrade Steps

After the base quad is selected (and growth tier applied for `profitable_growth_pe`), quality grades are applied as additive subtractions from all four levels equally.

| Regime | EQ A→B | EQ B→C | BS A→B | BS B→C |
|--------|--------|--------|--------|--------|
| `mature_pe` | −2.5 | −2.0 | −1.0 | −2.0 |
| `profitable_growth_pe` | −4.0 | −4.0 | −2.0 | −3.0 |
| `profitable_growth_ev_ebit` | −3.0 | −3.0 | −1.5 | −2.0 |
| `cyclical_earnings` | −2.0 | −2.0 | −1.0 | −1.5 |
| `high_amortisation_earnings` | −2.0 | −2.0 | −1.0 | −1.5 |
| `sales_growth_standard` | −2.0 | −1.75 | −1.0 | −1.75 |
| `sales_growth_hyper` | −2.0 | −1.75 | −1.0 | −1.75 |

EQ and BS adjustments are cumulative. A B/C stock applies both the A→B step and the B→C step.

**Rationale for larger steps in `profitable_growth_pe`:** The base multiple is 36× vs 22× for `mature_pe`. A −4-turn EQ downgrade on a 36× max is proportionally equivalent to a −2.5-turn downgrade on a 22× max.

### 7.4 Full Threshold Computation Pipeline

Applied in exact order:

```
1. Look up base row from ValuationRegimeThreshold (A/A quality, tier_high reference)
2. Apply growth tier substitution (profitable_growth_pe only):
     Bucket 6 or 7 → tier_high  (36/30/24/18)
     Bucket 5      → tier_mid   (30/25/21/17)
     Bucket 4      → tier_standard (26/22/19/16)
3. Apply quality downgrade:
     total_turns = EQ_adjustment + BS_adjustment
     subtract total_turns from all four levels
4. Apply cyclical overlay (if structural_cyclicality_score >= 1 — see §8)
5. Apply secondary adjustments:
     a. Gross margin adjustment (EV/Sales regimes only)
     b. Dilution adjustment (if material_dilution_flag = true OR share_count_growth_3y > 5%)
6. Enforce floor and ordering: max > comfortable > very_good > steal >= 0.5×
```

### 7.5 Secondary Adjustments

#### Gross Margin Adjustment (EV/Sales regimes only)

| Gross Margin | Adjustment |
|-------------|-----------|
| > 80% | +1.0× to all levels |
| 60–80% | No change |
| < 60% | −1.5× from all levels |

#### Dilution / SBC Adjustment

Triggered when `share_count_growth_3y > 5%` OR `material_dilution_flag = true`.

| Primary Metric | Adjustment |
|---------------|-----------|
| P/E or EV/EBIT | −1 turn from all levels |
| EV/Sales | −1.0× from all levels |

---

## 8. Cyclical Model

**Unchanged from V1.** The cyclical model (structural cyclicality score computation, cycle position derivation, cyclical overlay) is reproduced in full for document self-containment.

### 8.1 Structural Cyclicality Score

`structural_cyclicality_score` is an integer 0–3 measuring the inherent structural cyclicality of the business — independent of where current earnings sit in the cycle.

| Score | Description | Examples |
|-------|-------------|---------|
| 0 | Very low / none — stable recurring demand | SaaS, consumer staples, utilities, pharma |
| 1 | Mild — some revenue sensitivity, durable through mild recessions | Diversified tech, healthcare devices |
| 2 | Moderate — clear cycle, meaningful trough/peak swings | Semiconductors, enterprise tech, industrials |
| 3 | High — deep cycle, large earnings compression at trough | Energy, materials, auto, basic cyclical semis |

**Primary derivation (quantitative, last 16 quarters):**

```
revenue_volatility   = std_dev(quarterly_revenue) / mean(quarterly_revenue)
op_margin_volatility = std_dev(quarterly_operating_margin)
gross_margin_range   = max(gross_margin_quarters) − min(gross_margin_quarters)

Scoring:
  revenue_volatility > 0.25 OR op_margin_volatility > 0.12  → +1
  op_margin_range > 0.20 (20 percentage points)             → +1
  gross_margin_range > 0.15                                 → +1
  (cap at 3; default 0 if < 8 quarters of history)
```

**LLM modifier (secondary, bounded ±1):**

```
cyclical_quality_modifier = (marginDurabilityScore + pricingPowerScore) / 2

if cyclical_quality_modifier >= 4.0: score = max(0, score − 1)
if cyclical_quality_modifier <= 2.0: score = min(3, score + 1)
```

LLM modifier can only move the score ±1 level and never below 0 or above 3.

### 8.2 Cycle Position

`cycle_position` estimates where current earnings appear to sit relative to historical normal.

> **Hard framework bias — must be preserved in all implementations:** When evidence is thin, mixed, or noisy: default to `normal` or `insufficient_data`. Never infer `elevated` or `peak` unless the margin deviation is unambiguous and both conditions fire simultaneously. **False tightening from an incorrect `elevated`/`peak` call is materially worse than false normalisation.** When in doubt, assign `normal` or `insufficient_data`.

| Value | Meaning |
|-------|---------|
| `depressed` | Current earnings materially below historical normal |
| `normal` | Current earnings broadly in line with history |
| `elevated` | Current earnings materially above historical normal |
| `peak` | Current earnings at or near history-window high |
| `insufficient_data` | < 8 quarters of history |

**Derivation (quantitative only — no LLM input):**

```
ttm_op_margin    = stock_derived_metrics.operating_margin_ttm
history_avg      = mean(operating_margin_ttm across last 12 available quarters)
history_high_rev = max quarterly revenue in history window
current_rev_ttm  = stock_derived_metrics.revenue_ttm

if quarters_available < 8:
    cycle_position = insufficient_data

elif ttm_op_margin > history_avg × 1.25 AND current_rev_ttm >= history_high_rev:
    cycle_position = peak

elif ttm_op_margin > history_avg × 1.15 AND revenue trending above history midpoint:
    cycle_position = elevated

elif ttm_op_margin < history_avg × 0.85:
    cycle_position = depressed

else:
    cycle_position = normal
```

No LLM input for cycle position. The risk of stale training data producing false `elevated`/`peak` calls is too high.

### 8.3 Cyclical Overlay on Thresholds

The cyclical overlay applies **after** quality downgrade and adjusts threshold levels for cyclical risk. This is separate from the cyclical peak penalty in the bucket engine (§3.5) — that corrects the earnings-path estimate; this corrects the valuation threshold.

#### Case A: Profitable High-Growth Cyclical (`profitable_growth_pe` + score ≥ 1)

The stock is in `profitable_growth_pe` AND carries structural cyclicality. The regime stays `profitable_growth_pe`; thresholds receive a scalar haircut.

**Score-3 exception:** Re-routes to `cyclical_earnings` even if Step 2 is met (applied in regime selector, not as an overlay).

**Overlay matrix (turns subtracted from all threshold levels):**

| Score | Cycle Position | Overlay |
|-------|---------------|---------|
| 0 | any | 0 |
| 1 | depressed / normal / insufficient_data | −2.0 |
| 1 | elevated / peak | −4.0 |
| 2 | depressed / normal / insufficient_data | −4.0 |
| 2 | elevated / peak | −6.0 |
| 3 | any | → re-route to `cyclical_earnings` |

#### Case B: Cyclical Earnings (`cyclical_earnings`)

The base family (16/13/10/7) already reflects cyclical risk. Cycle position adjusts further:

| Cycle Position | Overlay |
|---------------|---------|
| elevated | −2.0 |
| peak | −3.5 |
| depressed / normal / insufficient_data | 0 |

At `depressed` cycle position: no tightening. System surfaces basis warning: *"Spot earnings may be below normal. Consider mid-cycle basis."*

---

## 9. TSR Hurdles

**Unchanged from V1.**

### 9.1 Base TSR Hurdles by Bucket

The TSR hurdle remains bucket-keyed. Under V2, the bucket numbers carry different earnings-growth semantics but the hurdle table is unchanged pending V2 calibration.

| Bucket | Base Hurdle Range | Deterministic Default |
|--------|------------------|----------------------|
| 1 | 14–16%+ | 15.0% |
| 2 | 10–11% | 10.5% |
| 3 | 11–12% | 11.5% |
| 4 | 12–13% | 12.5% |
| 5 | 14–16% | 15.0% |
| 6 | 18–20%+ | 19.0% |
| 7 | 25%+ | 25.0% |
| 8 | No normal hurdle | null |

> **Note for V2 calibration:** The TSR hurdle bands were calibrated against V1 bucket archetypes. Under V2, bucket semantics are narrower (pure growth bands). A recalibration pass is deferred until the engine is live and a production dataset can be assessed. For now, the V1 table is used as-is.

### 9.2 Quality Adjustments

| Grade | Earnings Quality Adjustment | Balance Sheet Adjustment |
|-------|---------------------------|-------------------------|
| A | −1.0% | −0.5% |
| B | 0% | 0% |
| C | +2.5% | +1.75% |

```
adjusted_tsr_hurdle = base_hurdle_default
                    + earnings_quality_adjustment
                    + balance_sheet_adjustment
```

### 9.3 Worked Examples

| Code | Base | EQ Adj. | BS Adj. | Adjusted Hurdle |
|------|------|---------|---------|----------------|
| 4AA | 12.5% | −1.0% | −0.5% | **11.0%** |
| 4BA | 12.5% | 0% | −0.5% | **12.0%** |
| 3AA | 11.5% | −1.0% | −0.5% | **10.0%** |
| 5BB | 15.0% | 0% | 0% | **15.0%** |
| 6BA | 19.0% | 0% | −0.5% | **18.5%** |
| 6CC | 19.0% | +2.5% | +1.75% | **23.25%** |

---

## 10. Complete Valuation Workflow

### 10.1 End-to-End Pipeline

```
INPUT: ticker, financial data, quarterly history, flags, LLM enrichment scores

── CLASSIFICATION PHASE ──────────────────────────────────────────────────

Step 1 → Bucket Engine (Earnings Path — §3)
         a. Revenue engine → normalized_revenue_growth
         b. Earnings engine → normalized_eps_hist_growth, normalized_eps_fwd_growth
         c. Operating leverage engine → operating_leverage_state + contribution
         d. Cyclicality normalisation → cyclical_peak_penalty
         e. Dilution + SBC → penalties
         f. Qualitative modifier (LLM, bounded ±2%)
         g. Final formula → expected_normalized_eps_growth
         h. Mapper → bucket_suggested

Step 2 → EQ Scorer → earnings_quality_suggested (A/B/C)

Step 3 → BS Scorer → balance_sheet_quality_suggested (A/B/C)

Step 4 → Confidence Computer → bucket_confidence
         Apply effective bucket demotion if confidence = low

Step 5 → Manual Override
         If final_code exists: use final_code; else use suggested_code

── VALUATION PHASE ───────────────────────────────────────────────────────

Step 6 → Regime Selector (§6.4)
         Run Steps 0A → 0B → 0C → 0D → 1 → 2 → 3 → 4 → 4.5 → 5 → 6
         First rule fires = assigned regime

Step 7 → Primary metric selection (determined by regime)

Step 8 → Current multiple computation (live price + forward estimates)

Step 9 → Threshold assignment
         9a. Base quad from ValuationRegimeThreshold (A/A)
         9b. Growth tier override (profitable_growth_pe: bucket → tier)
         9c. Quality downgrade (REGIME_DOWNGRADE_CONFIG)
         9d. Cyclical overlay (if structural_cyclicality_score >= 1)
         9e. Secondary adjustments (gross margin, dilution)
         9f. Enforce floor and ordering

Step 10 → TSR hurdle (base by bucket + EQ adj + BS adj)

Step 11 → Valuation zone assignment (compare multiple to thresholds)

Step 12 → Persist and surface
```

### 10.2 Current Multiple Computation

| Metric | Computation |
|--------|------------|
| `forward_pe` | Share price / forward EPS |
| `forward_ev_ebit` | Enterprise value / forward EBIT |
| `forward_ev_ebitda` | Enterprise value / forward EBITDA |
| `ev_sales` | Enterprise value / TTM revenue |
| `forward_operating_earnings_ex_excess_cash` | (Market cap − excess cash) / normalised operating earnings |

**Cyclicality basis flag:** When `structural_cyclicality_score ≥ 1`, records `current_multiple_basis`: `spot` (current earnings) / `mid_cycle` (user-specified) / `manual_override`.

### 10.3 Valuation Zone Assignment

```
if current_multiple <= steal:       zone = steal_zone
if current_multiple <= very_good:   zone = very_good_zone
if current_multiple <= comfortable: zone = comfortable_zone
if current_multiple <= max:         zone = max_zone
else:                               zone = above_max
```

Special: `not_applicable`, `financial_special_case` (awaiting user inputs), `manual_required` → no numeric zone.

---

## 11. Appendices

### Appendix A: Bucket Engine Pseudocode

For LLM implementation — the exact logic in executable form.

```typescript
// ── Earnings Path Engine — V2 ─────────────────────────────────────────

interface QuarterlyRow {
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  dilutedShares: number;
  freeCashFlow: number;
  shareBasedCompensation: number;
}

interface BucketEngineInput {
  // Quarterly history (up to 20 quarters, ascending order)
  quarterlyHistory: QuarterlyRow[];

  // Forward estimates
  revenueGrowthFwd: number | null;
  epsNtm: number | null;
  epsMostRecentFy: number | null;
  epsFy2: number | null;

  // Cyclicality (from CyclicalScoreService)
  structuralCyclicalityScore: number;       // 0–3
  cyclePosition: string;                    // depressed/normal/elevated/peak/insufficient_data

  // Dilution
  shareCountGrowth3y: number;
  sbcAsPctRevenueTtm: number | null;

  // LLM enrichment scores (1–5)
  moatStrengthScore: number | null;
  pricingPowerScore: number | null;
  revenueRecurrenceScore: number | null;
  marginDurabilityScore: number | null;
  capitalIntensityScore: number | null;

  // Flags
  binaryFlag: boolean;
}

interface BucketEngineOutput {
  bucketSuggested: number;
  expectedNormalizedEpsGrowth: number;
  normalizedRevenueGrowth: number;
  normalizedEpsHistGrowth: number;
  normalizedEpsFwdGrowth: number | null;
  operatingLeverageState: 'none' | 'gradual' | 'emerging_now' | 'cyclical_rebound' | 'deteriorating';
  operatingLeverageContribution: number;
  cyclicalPeakPenalty: number;
  dilutionPenalty: number;
  sbcPenalty: number;
  qualitativeVisibilityModifier: number;
  bucketConfidence: number;
  bucketReasonCodes: string[];
  fwdEpsFallbackLevel: 1 | 2 | 3 | 4;
}

// ── Bucket Mapper ─────────────────────────────────────────────────────

function mapToBucket(expectedGrowth: number, binaryFlag: boolean): number {
  if (binaryFlag) return 8;
  if (expectedGrowth < 0)    return 1;
  if (expectedGrowth < 0.05) return 2;
  if (expectedGrowth < 0.10) return 3;
  if (expectedGrowth < 0.18) return 4;
  if (expectedGrowth < 0.30) return 5;
  if (expectedGrowth < 0.50) return 6;
  return 7;
}

// ── Revenue Engine ────────────────────────────────────────────────────

function computeNormalizedRevenueGrowth(
  revenueTtmSeries: number[],  // TTM values, ascending chronological order
  revenueGrowthFwd: number | null,
): { value: number; confidenceReduction: number } {
  let confidence = 0;

  const n = revenueTtmSeries.length;
  const longGrowth  = computeCAGR(revenueTtmSeries);
  const recentGrowth = n >= 8 ? computeCAGR(revenueTtmSeries.slice(-8)) : null;

  if (recentGrowth === null) confidence += 0.10;

  const components = [
    { weight: 0.40, value: longGrowth },
    { weight: 0.30, value: recentGrowth },
    { weight: 0.30, value: revenueGrowthFwd },
  ].filter(c => c.value !== null);

  // Re-weight proportionally when components are absent
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const normalized = components.reduce((s, c) => s + (c.weight / totalWeight) * c.value!, 0);

  if (revenueGrowthFwd === null) confidence += 0.05;
  if (n < 12) confidence += 0.10;

  return { value: normalized, confidenceReduction: confidence };
}

// ── Forward EPS Fallback Chain ────────────────────────────────────────

function computeNormalizedEpsFwd(
  epsNtm: number | null,
  epsMostRecentFy: number | null,
  epsFy2: number | null,
  revenueGrowthFwd: number | null,
): { value: number | null; level: 1 | 2 | 3 | 4; confidenceReduction: number } {
  const epsFy0 = epsMostRecentFy;

  // L1: FY2 direct CAGR
  if (epsFy2 !== null && epsFy0 !== null && epsFy0 > 0 && epsFy2 > 0) {
    return { value: Math.sqrt(epsFy2 / epsFy0) - 1, level: 1, confidenceReduction: 0 };
  }

  // L2: FY2 extrapolation
  if (epsFy2 !== null && epsNtm !== null && revenueGrowthFwd !== null) {
    const epsFy2Proxy = epsNtm * (1 + revenueGrowthFwd);
    if (epsNtm > 0) {
      return { value: epsFy2Proxy / epsNtm - 1, level: 2, confidenceReduction: 0.10 };
    }
  }

  // L3: NTM single-year
  if (epsNtm !== null && epsFy0 !== null && Math.abs(epsFy0) > 0) {
    return { value: (epsNtm - epsFy0) / Math.abs(epsFy0), level: 3, confidenceReduction: 0.15 };
  }

  // L4: Exclude
  return { value: null, level: 4, confidenceReduction: 0.25 };
}

// ── Operating Leverage Engine ─────────────────────────────────────────

type OpLeverageState = 'none' | 'gradual' | 'emerging_now' | 'cyclical_rebound' | 'deteriorating';

function computeOperatingLeverageState(
  opMarginExpansion: number,
  incrementalOpMargin: number,
  gpMinusOpexSpreadRecent: number,
  opIncomeGrowthRecent: number,
  normalizedRevenueGrowth: number,
  fcfConversionTrend: number,  // positive = improving
  cyclicalityScore: number,
  cyclePosition: string,
): OpLeverageState {
  // Precedence: deteriorating → emerging_now → cyclical_rebound → gradual → none

  if (opMarginExpansion <= -0.02
   || gpMinusOpexSpreadRecent < -0.03
   || incrementalOpMargin < 0) {
    return 'deteriorating';
  }

  if (opMarginExpansion >= 0.06
   && incrementalOpMargin >= 0.35
   && gpMinusOpexSpreadRecent >= 0.08
   && opIncomeGrowthRecent > normalizedRevenueGrowth
   && fcfConversionTrend > 0) {
    // Must not be high-cyclicality rebound
    if (cyclicalityScore >= 2) return 'cyclical_rebound';
    return 'emerging_now';
  }

  const rebounding = cyclicalityScore >= 2
    && ['normal', 'elevated', 'peak'].includes(cyclePosition)
    && (opMarginExpansion >= 0.02 || gpMinusOpexSpreadRecent > 0);
  if (rebounding) return 'cyclical_rebound';

  if (opMarginExpansion >= 0.02
   && opMarginExpansion < 0.06
   && incrementalOpMargin >= 0.15
   && incrementalOpMargin < 0.35
   && gpMinusOpexSpreadRecent > 0) {
    return 'gradual';
  }

  return 'none';
}

const OP_LEVERAGE_CONTRIBUTION: Record<OpLeverageState, number> = {
  none:             0.00,
  gradual:          0.03,
  emerging_now:     0.08,
  cyclical_rebound: 0.02,  // hard cap
  deteriorating:   -0.04,
};

// ── Cyclical Peak Penalty ─────────────────────────────────────────────

function computeCyclicalPeakPenalty(score: number, cyclePos: string): number {
  if (cyclePos === 'depressed' || score === 0) return 0;
  const elevated = cyclePos === 'elevated' || cyclePos === 'peak';
  if (score === 1) return elevated ? 0.02 : 0;
  if (score === 2) return elevated ? 0.05 : 0.02;
  if (score === 3) return elevated ? 0.08 : 0.04;
  return 0;
}

// ── Dilution Penalties ────────────────────────────────────────────────

function computeDilutionPenalty(shareCountGrowth3y: number): number {
  if (shareCountGrowth3y <= 0.03) return 0;
  if (shareCountGrowth3y <= 0.07) return 0.01;
  if (shareCountGrowth3y <= 0.12) return 0.03;
  return 0.06;
}

function computeSbcPenalty(sbcAsPctRevenue: number | null): number {
  if (sbcAsPctRevenue === null || sbcAsPctRevenue <= 0.08) return 0;
  if (sbcAsPctRevenue <= 0.15) return 0.01;
  return 0.03;
}

// ── Qualitative Visibility Modifier ──────────────────────────────────

function computeQualitativeModifier(
  moat: number | null,
  pricingPower: number | null,
  recurrence: number | null,
  marginDurability: number | null,
  capitalIntensity: number | null,
): number {
  const allStrong = [moat, pricingPower, recurrence, marginDurability]
    .every(s => s !== null && s >= 4);
  if (allStrong) return 0.02;

  const anyWeak = moat !== null && moat <= 2
               || marginDurability !== null && marginDurability <= 2
               || capitalIntensity !== null && capitalIntensity <= 2;
  if (anyWeak) return -0.02;

  return 0;
}
```

---

### Appendix B: Regime Selector Pseudocode (V2)

```typescript
type ValuationRegime =
  | 'not_applicable' | 'financial_special_case'
  | 'sales_growth_standard' | 'sales_growth_hyper'
  | 'profitable_growth_pe' | 'cyclical_earnings'
  | 'profitable_growth_ev_ebit' | 'high_amortisation_earnings'
  | 'mature_pe' | 'manual_required';

interface RegimeInput {
  bucket: number;                       // 1–8 (from V2 Earnings Path Engine)
  netIncomePositive: boolean;
  fcfPositive: boolean;
  operatingMarginTtm: number | null;
  grossMarginTtm: number | null;
  revenueGrowthFwd: number | null;      // used for Step 1 and transition fallback
  fcfConversionTtm: number | null;
  structuralCyclicalityScore: number;   // 0–3
  ebitdaNtm: number | null;
  ebitNtm: number | null;
  preOperatingLeverageFlag: boolean;    // legacy; see Step 1 note
  holdingCompanyFlag: boolean;
  insurerFlag: boolean;
  bankFlag: boolean;
  // Transition flag: true when EPIC-009 engine is live and bucket is V2-computed
  v2BucketAvailable: boolean;
}

function selectRegime(input: RegimeInput): ValuationRegime {
  const { bucket, netIncomePositive, fcfPositive,
          operatingMarginTtm: opMargin, grossMarginTtm: grossMargin,
          revenueGrowthFwd: revGrowth, fcfConversionTtm: fcfConv,
          structuralCyclicalityScore: cyclScore,
          ebitdaNtm, ebitNtm,
          preOperatingLeverageFlag, holdingCompanyFlag, insurerFlag, bankFlag,
          v2BucketAvailable } = input;

  // Step 0A
  if (bucket === 8) return 'not_applicable';

  // Step 0B — Bank flag
  if (bankFlag) return 'manual_required';

  // Step 0C — Insurer
  if (insurerFlag) return 'financial_special_case';

  // Step 0D — Holding company
  if (holdingCompanyFlag) return 'financial_special_case';

  // Step 1
  const step1Fires =
    !netIncomePositive ||
    (opMargin !== null && opMargin < 0.10 && revGrowth !== null && revGrowth >= 0.10) ||
    preOperatingLeverageFlag;

  if (step1Fires) {
    const hyper = revGrowth !== null && revGrowth >= 0.40
               && grossMargin !== null && grossMargin >= 0.70;
    return hyper ? 'sales_growth_hyper' : 'sales_growth_standard';
  }

  // Step 2 — V2: bucket-gated; V1 fallback: revenue_growth_fwd
  const step2GrowthGate = v2BucketAvailable
    ? [4, 5, 6, 7].includes(bucket)
    : (revGrowth !== null && revGrowth >= 0.20);

  const step2 = step2GrowthGate
             && opMargin !== null && opMargin >= 0.25
             && netIncomePositive
             && fcfPositive
             && fcfConv !== null && fcfConv >= 0.60;

  if (step2) {
    // Score-3 exception: re-route to cyclical_earnings
    if (cyclScore >= 3) return 'cyclical_earnings';
    return 'profitable_growth_pe';
  }

  // Step 3
  if (cyclScore >= 1 && netIncomePositive && opMargin !== null && opMargin >= 0.10) {
    return 'cyclical_earnings';
  }

  // Step 4 — V2: bucket-gated; V1 fallback: revenue_growth_fwd
  const step4GrowthGate = v2BucketAvailable
    ? [3, 4].includes(bucket)
    : (revGrowth !== null && revGrowth >= 0.15);

  if (step4GrowthGate
   && netIncomePositive && fcfPositive
   && opMargin !== null && opMargin >= 0.10 && opMargin < 0.25) {
    return 'profitable_growth_ev_ebit';
  }

  // Step 4.5 — High amortisation
  if (ebitdaNtm !== null && ebitNtm !== null && ebitNtm > 0
   && ebitdaNtm / ebitNtm >= 1.30
   && netIncomePositive && fcfPositive) {
    return 'high_amortisation_earnings';
  }

  // Step 5
  if (netIncomePositive && fcfPositive) return 'mature_pe';

  // Step 6
  return 'manual_required';
}
```

---

### Appendix C: Threshold Computation Pseudocode

```typescript
type GrowthTier = 'high' | 'mid' | 'standard';

interface ThresholdQuad { max: number; comfortable: number; veryGood: number; steal: number; }

const BASE_FAMILIES: Record<string, ThresholdQuad> = {
  mature_pe:                  { max: 22, comfortable: 20, veryGood: 18, steal: 16 },
  profitable_growth_pe:       { max: 36, comfortable: 30, veryGood: 24, steal: 18 },
  profitable_growth_ev_ebit:  { max: 24, comfortable: 20, veryGood: 16, steal: 12 },
  cyclical_earnings:          { max: 16, comfortable: 13, veryGood: 10, steal:  7 },
  high_amortisation_earnings: { max: 18, comfortable: 15, veryGood: 12, steal:  9 },
  sales_growth_standard:      { max: 12, comfortable: 10, veryGood:  8, steal:  6 },
  sales_growth_hyper:         { max: 18, comfortable: 15, veryGood: 11, steal:  8 },
};

// Growth tier — V2: keyed on bucket
const GROWTH_TIER_CONFIG: Record<GrowthTier, ThresholdQuad> = {
  high:     { max: 36, comfortable: 30, veryGood: 24, steal: 18 },
  mid:      { max: 30, comfortable: 25, veryGood: 21, steal: 17 },
  standard: { max: 26, comfortable: 22, veryGood: 19, steal: 16 },
};

function resolveTier(bucket: number): GrowthTier {
  if (bucket >= 6) return 'high';
  if (bucket === 5) return 'mid';
  return 'standard';  // bucket 4
}

const REGIME_DOWNGRADE_CONFIG = {
  mature_pe:                  { eqAb: 2.5, eqBc: 2.0, bsAb: 1.0, bsBc: 2.0 },
  profitable_growth_pe:       { eqAb: 4.0, eqBc: 4.0, bsAb: 2.0, bsBc: 3.0 },
  profitable_growth_ev_ebit:  { eqAb: 3.0, eqBc: 3.0, bsAb: 1.5, bsBc: 2.0 },
  cyclical_earnings:          { eqAb: 2.0, eqBc: 2.0, bsAb: 1.0, bsBc: 1.5 },
  high_amortisation_earnings: { eqAb: 2.0, eqBc: 2.0, bsAb: 1.0, bsBc: 1.5 },
  sales_growth_standard:      { eqAb: 2.0, eqBc: 1.75, bsAb: 1.0, bsBc: 1.75 },
  sales_growth_hyper:         { eqAb: 2.0, eqBc: 1.75, bsAb: 1.0, bsBc: 1.75 },
};

function computeThresholds(
  regime: string, bucket: number,
  eqGrade: 'A'|'B'|'C', bsGrade: 'A'|'B'|'C',
  cyclScore: number, cyclePos: string,
  grossMargin: number|null, materialDilution: boolean,
): ThresholdQuad {
  let base = { ...BASE_FAMILIES[regime] };

  // Growth tier
  if (regime === 'profitable_growth_pe') {
    base = { ...GROWTH_TIER_CONFIG[resolveTier(bucket)] };
  }

  // Quality downgrade
  const cfg = REGIME_DOWNGRADE_CONFIG[regime];
  if (cfg) {
    const eqAdj = eqGrade === 'B' ? cfg.eqAb : eqGrade === 'C' ? cfg.eqAb + cfg.eqBc : 0;
    const bsAdj = bsGrade === 'B' ? cfg.bsAb : bsGrade === 'C' ? cfg.bsAb + cfg.bsBc : 0;
    base = sub(base, eqAdj + bsAdj);
  }

  // Cyclical overlay
  if (regime === 'profitable_growth_pe' && cyclScore >= 1 && cyclScore < 3) {
    const elevated = cyclePos === 'elevated' || cyclePos === 'peak';
    const overlay = cyclScore === 1 ? (elevated ? 4.0 : 2.0)
                  : cyclScore === 2 ? (elevated ? 6.0 : 4.0) : 0;
    base = sub(base, overlay);
  }
  if (regime === 'cyclical_earnings') {
    const overlay = cyclePos === 'peak' ? 3.5 : cyclePos === 'elevated' ? 2.0 : 0;
    base = sub(base, overlay);
  }

  // Gross margin (EV/Sales only)
  if (regime === 'sales_growth_standard' || regime === 'sales_growth_hyper') {
    const gmAdj = grossMargin === null ? 0 : grossMargin > 0.80 ? 1.0 : grossMargin < 0.60 ? -1.5 : 0;
    base = sub(base, -gmAdj);
  }

  // Dilution
  if (materialDilution) base = sub(base, 1.0);

  return enforceFloor(base);
}

function sub(q: ThresholdQuad, t: number): ThresholdQuad {
  return { max: q.max-t, comfortable: q.comfortable-t, veryGood: q.veryGood-t, steal: q.steal-t };
}
function enforceFloor(q: ThresholdQuad): ThresholdQuad {
  const s = Math.max(q.steal, 0.5);
  const vg = Math.max(q.veryGood, s + 0.5);
  const c = Math.max(q.comfortable, vg + 0.5);
  const m = Math.max(q.max, c + 0.5);
  return { max: m, comfortable: c, veryGood: vg, steal: s };
}
```

---

### Appendix D: Complete Worked Examples (V2)

#### Example 1: NVIDIA (NVDA) — V2 Bucket Assignment and Valuation

**Engine inputs (assumed; normal cycle):**
- Quarterly history: 20 quarters available; strong revenue growth, expanding gross profit, operating income inflecting sharply
- `revenue_growth_hist_long` = 35%, `revenue_growth_hist_recent` = 85% (data centre boom), `revenue_growth_fwd` = 60%
- `eps_growth_hist_long` = 28%, `eps_growth_hist_recent` = 110%, `eps_fy2_avg` available (L1)
- `operating_margin_expansion` = +22pp (EBIT margins expanded from 18% to 40%+ over 8 quarters)
- `incremental_operating_margin` = 0.58, `gross_profit_minus_opex_spread` = +18%
- `structural_cyclicality_score` = 2, `cycle_position` = normal
- `share_count_growth_3y` = −1% (buybacks), `sbc_as_pct_revenue_ttm` = 4%
- All qualitative scores ≥ 4 (moat, pricing power, recurrence, margin durability)

**Bucket computation:**

```
normalized_revenue_growth = 0.40×35% + 0.30×85% + 0.30×60% = 14% + 25.5% + 18% = 57.5%
normalized_eps_hist_growth = 0.60×28% + 0.40×110% = 16.8% + 44% = 60.8%
normalized_eps_fwd_growth  = L1 CAGR from FY2 data ≈ 45% (hypothetical)

base_growth = 0.45×57.5% + 0.35×45% + 0.20×60.8% = 25.9% + 15.8% + 12.2% = 53.8%

operating_leverage_state: emerging_now (margin +22pp ≥ 6pp; incr. OM 0.58 ≥ 0.35; spread +18% ≥ 8%; BUT cyclScore=2 ≥ 2) → cyclical_rebound
  → contribution = +2% (capped by cyclical_rebound rule)

cyclical_peak_penalty: score=2, normal → −2%
dilution_penalty: −1% growth → 0%
sbc_penalty: 4% → 0%
qualitative_modifier: all ≥ 4 → +2%

expected_normalized_eps_growth = 53.8% + 2% + 2% − 2% − 0% − 0% = 55.8%
```

**Bucket 7** (> 50%)

> Note: The operating leverage state resolves as `cyclical_rebound` rather than `emerging_now` because `structural_cyclicality_score = 2 ≥ 2`. This correctly caps the leverage contribution at +2%. However, the base growth is so strong (53.8%) that NVDA still maps to Bucket 7. In a more subdued revenue environment, this distinction would matter materially.

**Regime:**
- Step 2: bucket ∈ {4,5,6,7} ✓; op_margin ≈ 55% ≥ 25% ✓; profitable ✓; FCF ✓; FCF conv ≥ 0.60 ✓ → **`profitable_growth_pe`**
- Growth tier: bucket 7 → **`high`** → base 36/30/24/18
- Cyclical overlay (score 2, normal): −4.0 → **32/26/20/14**
- TSR (bucket 7, A/A): 25% − 1% − 0.5% = **23.5%**

---

#### Example 2: Microsoft (MSFT) — Durable Compounder

**Engine inputs (assumed):**
- `revenue_growth_hist_long` = 13%, `revenue_growth_hist_recent` = 16%, `revenue_growth_fwd` = 15%
- `eps_growth_hist_long` = 15%, `eps_growth_hist_recent` = 17%, `eps_fy2` available
- `operating_margin_expansion` = +3pp (gradual Azure leverage), `incremental_operating_margin` = 0.25
- `structural_cyclicality_score` = 0, `cycle_position` = normal
- `share_count_growth_3y` = −2% (buybacks), `sbc_as_pct_revenue_ttm` = 4%
- All qualitative scores ≥ 4

```
normalized_revenue_growth  = 0.40×13% + 0.30×16% + 0.30×15% = 14.1%
normalized_eps_hist_growth = 0.60×15% + 0.40×17% = 15.8%
normalized_eps_fwd_growth  = L1 CAGR ≈ 16% (hypothetical)

base_growth = 0.45×14.1% + 0.35×16% + 0.20×15.8% = 6.3% + 5.6% + 3.2% = 15.1%

operating_leverage_state: gradual → +3%
cyclical_peak_penalty: score=0 → 0%
dilution_penalty: buybacks → 0%
sbc_penalty: 4% → 0%
qualitative_modifier: all ≥ 4 → +2%

expected_normalized_eps_growth = 15.1% + 3% + 2% = 20.1%
```

**Bucket 5** (18–30%) → Regime: bucket ∈ {4,5,6,7} ✓; op_margin ~45% ≥ 25% ✓; profitable ✓; FCF ✓ → **`profitable_growth_pe`**

Growth tier: bucket 5 → **`mid`** → base 30/25/21/17
Quality downgrade (A/A): 0 → **30/25/21/17**
TSR (bucket 5, A/A): 15% − 1% − 0.5% = **13.5%**

---

#### Example 3: Uber (Post-Leverage Inflection)

**Engine inputs (assumed):**
- `revenue_growth_hist_long` = 25%, `revenue_growth_hist_recent` = 18%, `revenue_growth_fwd` = 16%
- `eps_growth_hist_long` = N/A (historically negative), `eps_growth_hist_recent` = improving
- EPS only recently positive; L4 fallback applies → base re-weighted to `0.60 × rev + 0.40 × eps_hist`
- `operating_margin_expansion` = +12pp (step-change from negative to +10%+), `incremental_operating_margin` = 0.42
- `gross_profit_minus_opex_spread` = +14%, FCF conversion improving: `fcf_conversion_trend > 0`
- `structural_cyclicality_score` = 0, `cycle_position` = normal
- `share_count_growth_3y` = 2%, `sbc_as_pct_revenue_ttm` = 9%
- LLM scores: moat=3 (growing but not elite), pricing power=3, recurrence=4, margin durability=3

```
normalized_revenue_growth  = 0.60×20% + … ≈ 21% (L4 re-weighting applied)
normalized_eps_hist_growth = limited (fallback) ≈ 10% (improving trend, imprecise)

base_growth (L4) = 0.60×21% + 0.40×10% = 12.6% + 4% = 16.6%

operating_leverage_state: emerging_now (margin +12pp ≥ 6%; incr. OM 0.42 ≥ 0.35; spread +14% ≥ 8%; FCF improving; cyclScore=0 < 2) → +8%
cyclical_peak_penalty: 0
dilution_penalty: 2% → 0%
sbc_penalty: 9% → −1%
qualitative_modifier: mixed → 0%

expected_normalized_eps_growth = 16.6% + 8% − 1% = 23.6%
```

**Bucket 5** (18–30%)

Regime: op_margin ~10% < 25% → Step 2 fails; Step 3 cyclicality=0 fails; Step 4: bucket ∈ {3,4}? No, bucket 5 → fails; Step 5: not profitable yet fully stable → if net_income_positive and FCF_positive → **`mature_pe`** or **`profitable_growth_ev_ebit`** (depending on actual margins at computation time).

> The regime selector reflects *current* financial state, not the earnings-path projection. If Uber's operating margin is at 10–25% and profitable, it would route to `profitable_growth_ev_ebit` (Step 4 V2: bucket ∈ {3,4} fails → Step 5 if profitable). This is correct — Uber is still in a scaling phase; EV/EBIT at an enterprise level is more appropriate than P/E at this point.

---

#### Example 4: Ford (F) — Deep Cyclical with Cyclical Rebound

**Engine inputs (assumed; elevated cycle):**
- `revenue_growth_hist_long` = 3%, `revenue_growth_hist_recent` = 8%, `revenue_growth_fwd` = 4%
- EPS volatile; recent rebound strong; `eps_growth_hist_long` = 5% (noisy), `eps_growth_hist_recent` = 22%
- `operating_margin_expansion` = +5pp (rebound from COVID lows), `incremental_operating_margin` = 0.28
- `structural_cyclicality_score` = 3, `cycle_position` = elevated
- `share_count_growth_3y` = 1%, `sbc_as_pct_revenue_ttm` = 1%
- LLM: moat=2 (weak, commoditised), margin durability=2

```
normalized_revenue_growth  = 0.40×3% + 0.30×8% + 0.30×4% = 1.2% + 2.4% + 1.2% = 4.8%
normalized_eps_hist_growth = 0.60×5% + 0.40×22% = 3% + 8.8% = 11.8%
normalized_eps_fwd_growth  = L1/L3 ≈ 6% (hypothetical)

base_growth = 0.45×4.8% + 0.35×6% + 0.20×11.8% = 2.2% + 2.1% + 2.4% = 6.6%

operating_leverage_state: cyclical_rebound (score=3 ≥ 2; cycle recovering) → +2% (capped)
cyclical_peak_penalty: score=3, elevated → −8%
dilution_penalty: 0%
sbc_penalty: 0%
qualitative_modifier: moat ≤ 2 AND margin durability ≤ 2 → −2%

expected_normalized_eps_growth = 6.6% + 2% − 8% − 2% = −1.4%
```

**Bucket 1** (< 0%)

Regime: net_income_positive ✓; op_margin >10% ✓; cyclicality_score=3 ≥ 1 → **`cyclical_earnings`**
Base (A/A → apply B/B): 16/13/10/7 − 3.0 = 13/10/7/4
Cycle overlay (elevated): −2.0 → **11/8/5/2**

> This correctly captures Ford at an elevated cycle: the combination of weak structural growth, strong cyclicality penalty, and qualitative weakness produces a negative normalised EPS path (Bucket 1), while the regime selector correctly routes it to `cyclical_earnings` with tightened thresholds.

---

### Appendix E: Open Items for V2 Adversarial Review

The following questions are flagged for critique:

1. **Revenue weight (0.45) vs EPS fwd weight (0.35):** Is revenue appropriately weighted more heavily than forward EPS, or does the higher EPS weight produce better calibration for mature names?

2. **Operating leverage `emerging_now` contribution (+8%):** Is +8% the right asymmetric uplift? Is it too generous for names where the leverage is uncertain, or correctly large for genuinely inflecting businesses?

3. **Cyclical rebound cap (+2%):** Does +2% produce the right outcome for mid-cycle industrials vs genuine structural leveragers? Should the cap vary by cyclicality score?

4. **Cyclical peak penalty at elevated/peak for score 3 (−8%):** Does −8% produce reasonable outcomes? For a score-3 cyclical at peak, the combined effect (capped leverage +2%, peak penalty −8%, qualitative modifier potentially −2%) can produce very negative normalised EPS growth. Is this too aggressive?

5. **Revenue guardrail (floor at Bucket 3 if `normalized_revenue_growth < 5%`):** Is this guardrail correctly specified? Could it incorrectly floor mature businesses with cyclically low revenue growth?

6. **FY2 fallback L2 extrapolation:** `epsNtm × (1 + revenueGrowthFwd)` as FY2 proxy — is this reasonable? Should L2 use a different extrapolation?

7. **TSR hurdle calibration:** The hurdle table is unchanged from V1. Under V2, Bucket 1 means negative EPS growth (not just "harvest-type" businesses). Does a 15% hurdle for Bucket 1 still make sense, or should it be higher (avoid signal)?

8. **Regime selector Step 2/4 transition:** The `v2BucketAvailable` flag ensures backward compatibility. Should the transition be gated on a fleet-wide reprocessing event, or per-stock as new engine data becomes available?

---

### Appendix F: Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| 1.0 | 2026-04-27 | Initial authoritative reference; valuation regime decoupling (EPIC-008) |
| 2.0 DRAFT | 2026-04-27 | Bucket engine replaced (RFC-009): point-scoring → formula; bucket = earnings growth band; operating leverage 5-state; FY2 fallback chain; regime Steps 2/4 bucket-gated |

---

*End of 3AA Framework Model Reference — Version 2.0 DRAFT (2026-04-27)*
*Submit for adversarial critique before implementation begins.*
