# 3AA Investment Framework — Model Reference

**Version:** 1.0 (incorporating all amendments through 2026-04-27)  
**Status:** Authoritative reference  
**Audience:** Human investors (primary) · LLM implementation (secondary)

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [The 3AA Code System](#2-the-3aa-code-system)
3. [Classification Engine](#3-classification-engine)
4. [Valuation Regime Selection](#4-valuation-regime-selection)
5. [Threshold Framework](#5-threshold-framework)
6. [Cyclical Model](#6-cyclical-model)
7. [TSR Hurdles](#7-tsr-hurdles)
8. [Complete Valuation Workflow](#8-complete-valuation-workflow)
9. [Appendices](#9-appendices)

---

## 1. Introduction

The 3AA framework is a systematic, rules-based approach to classifying and valuing publicly traded companies. Its core principle: **the same earnings growth does not deserve the same multiple**. Two companies growing at 15% per year may warrant entirely different valuations depending on the durability of that growth, the quality of earnings, and the financial strength of the business.

The framework produces, for each stock:

1. A **3AA code** — a three-character label encoding business archetype and quality
2. A **valuation regime** — the correct metric and threshold family for that company
3. **Four threshold levels** — max, comfortable, very good, steal — defining when a stock is cheap or expensive
4. An **adjusted TSR hurdle** — the minimum total return required to justify ownership

The framework is designed to be transparent, deterministic, and human-auditable. Every output traces to an explicit rule.

### Key Design Principles

- **Rules-first:** Identical inputs always produce identical outputs. No black boxes.
- **Metric appropriateness:** A pre-profit grower should not be valued on P/E; a profitable compounder should not be forced onto EV/Sales.
- **Quality matters proportionally:** Better earnings quality and balance sheet strength earn lower required returns and higher acceptable multiples.
- **Conservative defaults:** When data is missing or ambiguous, the system defaults to more conservative outputs.

---

## 2. The 3AA Code System

### 2.1 Code Format

A 3AA code has three characters: `{Bucket}{EarningsQuality}{BalanceSheetQuality}`

Examples: `4AA`, `5BA`, `6BB`, `3AA`

- **Bucket** (digit 1–8): the business archetype — what kind of company this is
- **Earnings Quality** (letter A/B/C): durability and quality of earnings
- **Balance Sheet Quality** (letter A/B/C): financial strength and resilience

### 2.2 The Eight Buckets

Buckets represent business archetypes based on growth profile and earnings maturity.

---

#### Bucket 1 — Decline / Harvest

A shrinking or structurally impaired business where the central question is how to extract remaining value rather than grow.

| Characteristic | Typical Range |
|---|---|
| Revenue growth | −10% to +2% |
| EPS growth | Negative to flat |
| Reinvestment opportunities | Weak |
| Thesis type | Liquidation, income extraction, deep value, asset harvest |

**Examples:** Legacy media, structural commodity decline, mature coal assets.  
**Base TSR hurdle:** 14–16%+ (or avoid)

---

#### Bucket 2 — Defensive Cash Machine

Flat to low-growth business, highly cash-generative, often recession-resistant, with limited reinvestment runway.

| Characteristic | Typical Range |
|---|---|
| Revenue growth | 0–4% |
| EPS growth | 0–6% |
| Free cash flow conversion | Usually high |
| Margins | Stable |

**Examples:** Mature tobacco companies, payments networks past growth peak, regulated utilities with no expansion.  
**Base TSR hurdle:** 10–11%

---

#### Bucket 3 — Durable Stalwart

Blue-chip compounder with durable moderate earnings growth over a long period. Low impairment risk.

| Characteristic | Typical Range |
|---|---|
| Revenue growth | 3–8% |
| EPS growth | 6–10% |
| Free cash flow | Strong |
| Growth style | Steady, durable, not explosive |

**Examples:** Berkshire Hathaway (holding company / insurer treatment applies — see §4.3), large healthcare conglomerates.  
**Base TSR hurdle:** 11–12%

---

#### Bucket 4 — Elite Compounder

Very high-quality business compounding earnings at mid-teens with exceptional durability and moat quality. Mispricings tend to be brief.

| Characteristic | Typical Range |
|---|---|
| Revenue growth | 8–15% |
| EPS growth | 12–18% |
| FCF conversion | High |
| Moat quality | Elite |

**Examples:** Microsoft (when growth supports Bucket 4 criteria), dominant workflow or platform software.  
**Base TSR hurdle:** 12–13%

---

#### Bucket 5 — Operating Leverage Grower

Business where a large share of the earnings thesis depends on operating leverage materialising on top of decent topline growth. Key question: is the company pre- or post-operating-leverage phase?

| Characteristic | Typical Range |
|---|---|
| Revenue growth | 10–20% |
| Gross profit growth | 15–25%+ |
| EPS growth | Mid-teens to 30%, less stable |
| Operating margin | Still expanding materially |

**Examples:** Amazon (depending on phase), Uber (if model is believed), late-stage platform businesses.  
**Base TSR hurdle:** 14–16%

---

#### Bucket 6 — High-Growth Emerging Compounder

High topline growth with a low, emerging, or inconsistent current profit base. Future value depends substantially on scaling into durable earnings power.

| Characteristic | Typical Range |
|---|---|
| Revenue growth | 20–35%+ |
| Earnings | Low / immature / inconsistent |
| FCF | Breakeven to improving |

**Examples:** AMD at early phases, high-growth SaaS before margin maturity.  
**Base TSR hurdle:** 18–20%+

---

#### Bucket 7 — Hypergrowth / Venture-Like

Extreme topline growth with little earnings anchor. Valuation is dominated by future optionality. The thesis is highly sensitive to future assumptions.

| Characteristic | Typical Range |
|---|---|
| Revenue growth | 40–100%+ |
| Earnings | Negligible or negative |
| Capital dependence | High |

**Examples:** Pre-profit AI platforms, venture-stage hypergrowth.  
**Base TSR hurdle:** 25%+

---

#### Bucket 8 — Lottery / Binary

Highly binary outcome business where a standard earnings-based framework is not appropriate. Value depends on a small number of events or approvals.

**Examples:** Speculative biotech awaiting FDA approval, binary litigation outcomes.  
**Valuation:** No standard multiple. This is speculation only.

---

### 2.3 Earnings Quality Grades (EQ)

The first letter of the code. Measures the durability and quality of earnings.

#### Grade A — Elite Earnings Quality

The business has a strong, durable, near-irreplaceable competitive position.

**Markers:**
- Strong moat: monopoly-like position, irreplaceable workflow, pricing power
- Recurring or deeply embedded revenue; low customer churn
- Long runway of durable growth visible across cycles
- Margins stable or improving
- FCF conversion typically **> 80%**
- ROIC high and sustained

**Examples:** Microsoft, dominant workflow software, natural monopoly infrastructure with pricing power.

#### Grade B — Good Earnings Quality

Real business, real earnings, good franchise — but more cyclical, more competitive, or more execution-sensitive than Grade A.

**Markers:**
- Good durability, not elite
- More vulnerable to cycle or competition than A
- FCF conversion approximately **50–80%**
- Margins can wobble; earnings revision risk is moderate

**Examples:** Google Search (if a Search durability haircut is applied), Uber (if the model is believed but not with full confidence), diversified industrial franchises.

#### Grade C — Fragile / Lower-Quality Earnings

Weak moat, commodity or narrative-sensitive, earnings rely on favourable conditions rather than durable strength.

**Markers:**
- Weak moat; substitutable product or service
- Weak or inconsistent FCF
- High margin volatility
- High earnings revision risk; execution dependence is high

**Examples:** Speculative growth stories, marginal cyclicals with no pricing power, story stocks.

---

### 2.4 Balance Sheet Grades (BS)

The second letter of the code. Measures financial strength and resilience.

#### Grade A — Fortress

Near-zero leverage, large liquidity buffer. Can continue investing through a downturn without raising capital.

| Metric | Typical Range |
|---|---|
| Net debt / EBITDA | < 1× or net cash |
| Interest coverage | > 12× |
| Liquidity runway | 2+ years |
| Share count | Flat or declining; no habitual dilution |

**Examples:** Microsoft, Berkshire Hathaway, cash-rich mega-cap platforms.

#### Grade B — Sound

Leverage is manageable. Balance sheet is not a problem, but offers less optionality than A in a stress scenario.

| Metric | Typical Range |
|---|---|
| Net debt / EBITDA | 1–2.5× |
| Interest coverage | 5–12× |
| Refinancing needs | Manageable |
| Dilution | Limited |

#### Grade C — Fragile

Meaningful leverage, possible need to raise capital, dilution risk. A downturn can materially damage the equity story.

| Metric | Typical Range |
|---|---|
| Net debt / EBITDA | > 2.5× |
| Interest coverage | < 5× |
| Liquidity | Tight |
| Share count | Rising materially |

**Examples:** Leveraged cyclicals, speculative growers needing external capital.

---

### 2.5 Special Classification Flags

These flags override or modify the standard classification or valuation logic:

| Flag | Meaning |
|---|---|
| `holding_company_flag` | Company owns stakes in diverse businesses; consolidated metrics not directly comparable. **Applies regardless of bucket.** |
| `insurer_flag` | Insurance/reinsurance operations distort standard metrics. **Applies regardless of bucket.** |
| `pre_operating_leverage_flag` | Business model implies future margin expansion not yet materialised. Forces EV/Sales metric even if profitable. |
| `binary_flag` | Binary outcome; forces Bucket 8. |
| `cyclicality_flag` | Preserved for backward compatibility; computed as `structural_cyclicality_score >= 1`. |
| `market_pessimism_flag` | Market appears unusually pessimistic vs. fundamental quality; interpretive label only. |
| `material_dilution_flag` | Material share count dilution warrants threshold haircut. |

> **Note on `structural_cyclicality_score`:** This is the active cyclicality field (integer 0–3). It replaces the boolean `cyclicality_flag` for all new logic. See §6.

---

## 3. Classification Engine

### 3.1 Universe Eligibility

The classification engine operates on:
- US-listed stocks only
- Market cap > $5 billion
- Sufficient data to attempt classification

### 3.2 Classification Pipeline

The engine runs six sequential stages:

```
Stage 1: Bucket Scorer        → score each bucket 1–8
Stage 2: Earnings Quality     → score each grade A/B/C
Stage 3: Balance Sheet        → score each grade A/B/C
Stage 4: Tie-Break Resolver   → resolve ambiguity using framework rules
Stage 5: Confidence Computer  → score certainty of suggestion
Stage 6: Manual Override      → apply user corrections
```

### 3.3 Required Inputs

**Identity / Universe**

| Field | Description |
|---|---|
| `ticker` | Stock ticker |
| `company_name` | Company name |
| `sector` | GICS sector |
| `industry` | GICS industry |
| `market_cap` | Market capitalisation (USD) |

**Growth / Profitability**

| Field | Description |
|---|---|
| `revenue_growth_3y` | 3-year trailing revenue CAGR |
| `revenue_growth_fwd` | Forward revenue growth estimate |
| `eps_growth_3y` | 3-year trailing EPS CAGR |
| `eps_growth_fwd` | Forward EPS growth estimate |
| `gross_margin` | Trailing gross margin |
| `operating_margin` | Trailing operating margin |
| `gross_profit_growth` | Trailing gross profit growth |
| `fcf_margin` | Free cash flow margin |
| `fcf_conversion` | FCF / net income |
| `roic` | Return on invested capital |
| `net_income_positive` | Boolean: net income > 0 |
| `fcf_positive` | Boolean: free cash flow > 0 |

**Balance Sheet**

| Field | Description |
|---|---|
| `net_debt_to_ebitda` | Leverage ratio |
| `interest_coverage` | EBIT / interest expense |
| `share_count_growth_3y` | 3-year share count CAGR |

### 3.4 Bucket Scoring Rules

Each bucket receives an additive score based on how well the stock's profile matches its archetype. The highest-scoring bucket becomes the suggestion.

**Bucket 1 — Decline / Harvest signals:**
- Revenue growth in [−10%, +2%]
- EPS growth ≤ 0–2%
- Low reinvestment runway
- Thesis resembles harvest / income / liquidation

**Bucket 2 — Defensive Cash Machine signals:**
- Revenue growth 0–4%
- EPS growth 0–6%
- High cash generation
- Stable margins, mature / recession-resistant profile

**Bucket 3 — Durable Stalwart signals:**
- Revenue growth 3–8%
- EPS growth 6–10%
- Strong FCF, low impairment risk

**Bucket 4 — Elite Compounder signals:**
- Revenue growth 8–15%
- EPS growth 12–18%
- High FCF conversion, elite moat quality

**Bucket 5 — Operating Leverage Grower signals:**
- Revenue growth 10–20%
- Gross profit growth 15–25%+
- Operating margin still materially expanding
- Thesis depends on operating leverage

**Bucket 6 — High-Growth Emerging Compounder signals:**
- Revenue growth 20–35%+
- Earnings base low / immature / inconsistent
- FCF breakeven to improving

**Bucket 7 — Hypergrowth / Venture-Like signals:**
- Revenue growth 40–100%+
- Little earnings anchor; future optionality dominant

**Bucket 8 — Lottery / Binary signals:**
- `binary_flag = true`, OR
- Standard earnings framework clearly inapplicable

### 3.5 Bucket Tie-Break Rules

When two buckets score close, use these precedence rules:

| Tie | Resolution |
|---|---|
| 3 vs 4 | Choose 4 **only** if moat, durability, margin quality, and FCF conversion are clearly exceptional. Otherwise default to 3. |
| 4 vs 5 | Choose 4 if the business already behaves like a durable earnings compounder. Choose 5 if the thesis still depends materially on future operating leverage. |
| 5 vs 6 | Choose 5 if forward EBIT is meaningful and EV/EBIT is sensible. Choose 6 if profit base is too immature. |
| 6 vs 7 | Choose 7 **only** if future optionality overwhelmingly dominates current economics. |
| Any vs 8 | `binary_flag = true` forces Bucket 8 regardless of other signals. |

### 3.6 Earnings Quality Scoring Rules

**Grade A signals:**
- Elite moat (irreplaceable workflow, monopoly-like position, pricing power)
- Recurring or deeply embedded revenue; low churn
- FCF conversion > 80%
- ROIC high and sustained
- Margins stable or improving over a cycle

**Grade B signals:**
- Real franchise and real earnings
- Good durability — not elite
- FCF conversion roughly 50–80%
- More cyclical, competitive, or execution-sensitive than A

**Grade C signals:**
- Weak moat
- Commodity or narrative-dependent earnings
- FCF weak or inconsistent
- High margin volatility; high earnings revision risk

### 3.7 Balance Sheet Scoring Rules

**Grade A signals:** Net debt/EBITDA < 1× or net cash; interest coverage > 12×; no habitual dilution.  
**Grade B signals:** Net debt/EBITDA 1–2.5×; interest coverage 5–12×; limited dilution.  
**Grade C signals:** Net debt/EBITDA > 2.5×; interest coverage < 5×; share count rising materially.

### 3.8 LLM Enrichment Layer

Six qualitative scores (E1–E6) from the classification enrichment pipeline provide additional signal that quantitative data cannot capture:

| Score | Concept | Scale |
|---|---|---|
| E1 | Moat quality | 1–5 |
| E2 | Pricing power | 1–5 |
| E3 | Revenue recurrence | 1–5 |
| E4 | Margin durability | 1–5 |
| E5 | Capital intensity | 1–5 |
| E6 | Qualitative cyclicality | 1–5 |

These scores influence `structural_cyclicality_score` (see §6.1) and can adjust the overall earnings quality suggestion by ±1 level, but **cannot override hard profitability gates** in the regime selector.

### 3.9 Confidence-Based Effective Bucket Demotion

When classification confidence is **low**, the valuation engine uses a demoted effective bucket for metric and threshold selection:

| Actual Bucket | Low-Confidence Effective Bucket |
|---|---|
| 4 | 3 |
| 5 | 4 |
| 6 | 5 |
| 7 | 6 |
| 1, 2, 3, 8 | Unchanged |

This ensures that uncertain classifications do not generate overly generous thresholds.

### 3.10 Classification State Model

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

---

## 4. Valuation Regime Selection

### 4.1 Why Regimes Were Introduced

The original V1 architecture coupled bucket → primary metric → threshold family in a single pipeline step. This produced two systematic errors:

1. **Profitable high-growth names** (NVIDIA, MSFT) forced into EV/Sales because of their high bucket number — completely wrong for companies with 65% operating margins and strong FCF
2. **No differentiation within P/E buckets** — NVIDIA and Walmart received the same threshold family

The solution: introduce `valuation_regime` as a formal concept computed by a deterministic rule engine. **Regime decouples metric and threshold selection from bucket.** Bucket still determines the business archetype label, TSR hurdle, and certain special-case logic — but the primary metric and threshold family are now regime-driven.

### 4.2 The Nine Regimes

| Regime | Primary Metric | Purpose |
|---|---|---|
| `not_applicable` | `no_stable_metric` | Bucket 8; lottery / binary outcomes |
| `financial_special_case` | `forward_operating_earnings_ex_excess_cash` | Insurers and holding companies, any bucket |
| `sales_growth_standard` | `ev_sales` | Immature / low-margin / pre-profit growth |
| `sales_growth_hyper` | `ev_sales` | High gross margin, high growth; distinct (higher) threshold family |
| `profitable_growth_pe` | `forward_pe` | Profitable high-growth compounder (NVIDIA-style) |
| `cyclical_earnings` | `forward_ev_ebit` | Cyclical with real earnings; EV/EBIT avoids cycle distortion |
| `profitable_growth_ev_ebit` | `forward_ev_ebit` | Profitable but scaling / transitional; margin 10–25% |
| `mature_pe` | `forward_pe` | Stable profitable; classic P/E (Walmart-style) |
| `manual_required` | `no_stable_metric` | Catch-all; no safe automated metric |

### 4.3 Regime Selector Inputs

All inputs derived from existing data — no new data sources required.

| Input | Source |
|---|---|
| `bucket` | Parsed from `active_code` |
| `net_income_positive` | `stock_derived_metrics.net_income_ttm > 0` |
| `fcf_positive` | `stock_derived_metrics.free_cash_flow_ttm > 0` |
| `operating_margin_ttm` | `stock_derived_metrics.operating_margin_ttm` |
| `gross_margin_ttm` | `stock_derived_metrics.gross_margin_ttm` |
| `revenue_growth_fwd` | `stock.revenue_growth_fwd` |
| `fcf_conversion_ttm` | `free_cash_flow_ttm / net_income_ttm` (derived field) |
| `structural_cyclicality_score` | `stock.structural_cyclicality_score` (0–3) |
| `pre_operating_leverage_flag` | `stock.pre_operating_leverage_flag` |
| `holding_company_flag` | `stock.holding_company_flag` |
| `insurer_flag` | `stock.insurer_flag` |

### 4.4 Regime Selector: Step-by-Step Rules

The rules execute in strict order. The first rule that fires determines the regime; subsequent rules are not evaluated.

---

#### Step 0A — Bucket 8 Exclusion

```
IF bucket = 8
THEN regime = not_applicable
```

Binary / lottery stocks have no stable valuation metric by framework definition. This rule fires before any financial analysis.

---

#### Step 0B — Bank Flag (any bucket)

```
IF bank_flag = true
THEN regime = manual_required
```

Banks and financial institutions (JPM, BAC, GS, MS, etc.) are fully outside the automated framework. EV/EBIT is meaningless for banks; P/E requires loan-loss normalisation beyond framework scope. `valuation_state_status = 'manual_required'`. **This rule fires regardless of bucket.**

---

#### Step 0C — Insurer Flag (any bucket)

```
IF insurer_flag = true
THEN regime = financial_special_case
     primary_metric = forward_operating_earnings_ex_excess_cash
```

Insurance companies have non-operating investment income that distorts standard metrics. Their earnings base requires explicit normalisation. **This rule fires regardless of bucket** — the prior V1 restriction to bucket 3 only is removed.

---

#### Step 0D — Holding Company Flag (any bucket)

```
IF holding_company_flag = true
THEN regime = financial_special_case
     primary_metric = forward_operating_earnings_ex_excess_cash
```

Holding companies own stakes in diverse businesses; consolidated P/E or EV/EBIT reflects an incoherent mix of underlying businesses. **This rule fires regardless of bucket.**

> **`financial_special_case` semantics:** The metric type is known (`forward_operating_earnings_ex_excess_cash`) but the normalised earnings value and thresholds must be supplied by the user. Until the user provides a normalised earnings figure and sets manual thresholds, `valuation_state_status = 'manual_required'`. This is distinct from `manual_required` (where even the metric type is ambiguous). Once inputs are provided, the regime computes normally.

> **Berkshire Hathaway note:** BRK carries both `insurer_flag` and `holding_company_flag`. Step 0C fires first. Treatment: `financial_special_case` → `forward_operating_earnings_ex_excess_cash`. If this value is not provided by the user, `valuation_state_status = 'manual_required'`.

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

**Why `fcf_positive = false` is not a Step 1 trigger:** A company that is net-income-positive but FCF-negative has a structural reason for the divergence (bank loan-book growth, major capex cycle, acquisition integration). EV/Sales is equally inappropriate for these companies. They fall through to Step 3 (`cyclical_earnings`) or Step 6 (`manual_required`) naturally.

**Why the 10% margin condition requires `revenue_growth_fwd >= 0.10`:** Mature profitable businesses with structurally low margins (large-format retail, distribution) have sub-10% operating margins for competitive/structural reasons — not because they are pre-scale. If revenue growth is also low (< 10%), the company is a mature stable low-margin business that should reach `mature_pe` via Step 5. The growth gate ensures only genuinely pre-scale, growing low-margin companies route to EV/Sales.

**The hyper-growth variant** (`sales_growth_hyper`) requires both high revenue growth (≥ 40%) and high gross margin (≥ 70%). This captures early-stage platform / SaaS names where business quality justifies a higher EV/Sales family despite immaturity.

---

#### Step 2 — Profitable High-Growth PE Path

```
IF all of:
  revenue_growth_fwd >= 0.20
  operating_margin_ttm >= 0.25
  net_income_positive = true
  fcf_positive = true
  fcf_conversion_ttm >= 0.60
THEN regime = profitable_growth_pe
```

Companies meeting all five conditions are genuinely profitable high-growth compounders. The 25%+ operating margin gate specifically prevents transitional or reinvestment-heavy growers from entering this regime. All five conditions must be met simultaneously.

**Precedence over Step 3:** A cyclical name that qualifies Step 2 remains in `profitable_growth_pe` (with a cyclical overlay applied separately — see §6). It must not be routed to `cyclical_earnings` solely because of its cyclicality score. The quality overlay handles the cyclical risk without changing the regime.

---

#### Step 3 — Cyclical Earnings Path

```
IF all of:
  structural_cyclicality_score >= 1
  net_income_positive = true
  operating_margin_ttm >= 0.10
THEN regime = cyclical_earnings
```

Cyclical companies with real earnings should not be treated as immature sales-valued growth names. But simple forward P/E can be misleading at cycle peaks or troughs. EV/EBIT is the cleaner anchor: it uses enterprise value (less cycle-sensitive) and operating earnings (avoids financing distortion). The 10% margin gate prevents deeply distressed cyclicals from entering — those fall through to `manual_required`.

---

#### Step 4 — Profitable Transitional EV/EBIT

```
IF all of:
  revenue_growth_fwd >= 0.15
  net_income_positive = true
  fcf_positive = true
  operating_margin_ttm >= 0.10 AND < 0.25
THEN regime = profitable_growth_ev_ebit
```

These businesses are profitable and growing, but still in a reinvestment or scaling phase where operating margins have not yet reached the level that supports a premium P/E regime. EV/EBIT captures value at the enterprise level without per-share distortion from reinvestment. The `< 0.25` upper bound forms a clean partition with Step 2 (≥ 0.25).

---

#### Step 5 — Mature PE Default

```
IF net_income_positive = true AND fcf_positive = true
THEN regime = mature_pe
```

Stable profitable companies that did not qualify for any growth or cyclical path. Classic P/E is appropriate. Intended to capture: Walmart, Procter & Gamble, Colgate, and similar stalwarts.

---

#### Step 6 — Catch-All

```
ELSE regime = manual_required
```

No automated metric is reliably applicable. User must manually assess.

---

### 4.5 Precedence Rules

| Priority | Rule | Reason |
|---|---|---|
| 1 | Bucket 8 exclusion | Binary stocks; no metric applies |
| 2 | Financial special cases | Non-standard earnings base; must be handled first |
| 3 | Sales-valued growth path | Cannot fake profitability; unprofitable names must not reach P/E regimes |
| 4 | Profitable high-growth PE | NVIDIA must reach Step 2 before Step 3 |
| 5 | Cyclical earnings | Cyclical risk profile is distinct from transitional growth |
| 6 | Profitable transitional | Transitional names not ready for premium P/E |
| 7 | Mature PE | Final automated path for stable profitable names |

### 4.6 Illustrative Stock Assignments

These are directional expectations; actual regime depends on live financial data at computation time.

| Stock | Expected Regime | Key Reason |
|---|---|---|
| NVDA | `profitable_growth_pe` + cyclical overlay | 65%+ op margin, 70%+ FCF conversion, ≥20% growth; cyclical overlay adjusts thresholds |
| MSFT | `profitable_growth_pe` or `mature_pe` | Depends on `revenue_growth_fwd`: ≥ 20% → profitable_growth_pe; < 20% → mature_pe |
| AAPL | `profitable_growth_pe` or `mature_pe` | High margin and FCF; growth rate is the swing factor |
| WMT | `mature_pe` | Stable profitable, low margin (retail), growth below 20%; step 1 excluded by low-growth gate |
| MU | `cyclical_earnings` | Semiconductor; FCF conversion < 0.60 bars Step 2; cyclical score ≥ 1 triggers Step 3 |
| XOM / CVX | `cyclical_earnings` | Energy cyclicals with real earnings; margins don't meet Step 2 bar |
| JPM | `manual_required` | `bank_flag = true`; Step 0B fires. Banks are fully outside automated framework |
| BAC / GS / MS | `manual_required` | `bank_flag = true`; same rationale as JPM |
| BRK | `financial_special_case` | Both `insurer_flag` and `holding_company_flag`; Step 0C fires |
| ISRG | `profitable_growth_pe` | Medical devices; high margins, consistent FCF, growth |
| SPGI | `profitable_growth_pe` | Data analytics; high margin, strong FCF |
| DE | `cyclical_earnings` | Agricultural equipment; cyclical flag |

---

## 5. Threshold Framework

### 5.1 The Four Threshold Levels

For each stock in an applicable regime, the framework produces four threshold levels. All values are expressed as multiples of the primary valuation metric (e.g., P/E, EV/EBIT, or EV/Sales).

| Level | Name | Interpretation |
|---|---|---|
| **Max** | Upper bound | Not cheap. Acceptable only when quality is high, the opportunity is valid, and a rare window may be closing. Do not overpay above this. |
| **Comfortable** | Core build zone | The investor should be comfortable building a position here. Not necessarily a bargain, but a proper opportunity. |
| **Very Good** | Lean-in zone | The gap between price and fair value is meaningfully attractive. Increase conviction here. |
| **Steal** | Gift zone | Rare dislocation. The market is likely offering unusually asymmetric upside if the thesis remains intact. |

### 5.2 Base Threshold Families (A/A Quality)

The `ValuationRegimeThreshold` table stores one row per regime representing the base family at A/A (elite earnings quality, fortress balance sheet). All other quality combinations are computed at runtime.

| Regime | Primary Metric | Max | Comfortable | Very Good | Steal |
|---|---|---|---|---|---|
| `mature_pe` | Forward P/E | 22.0× | 20.0× | 18.0× | 16.0× |
| `profitable_growth_pe` *(tier: high, ≥35% growth)* | Forward P/E | 36.0× | 30.0× | 24.0× | 18.0× |
| `profitable_growth_pe` *(tier: mid, 25–35% growth)* | Forward P/E | 30.0× | 25.0× | 21.0× | 17.0× |
| `profitable_growth_pe` *(tier: standard, 20–25% growth)* | Forward P/E | 26.0× | 22.0× | 19.0× | 16.0× |
| `profitable_growth_ev_ebit` | Forward EV/EBIT | 24.0× | 20.0× | 16.0× | 12.0× |
| `cyclical_earnings` | Forward EV/EBIT | 16.0× | 13.0× | 10.0× | 7.0× |
| `sales_growth_standard` | EV/Sales | 12.0× | 10.0× | 8.0× | 6.0× |
| `sales_growth_hyper` | EV/Sales | 18.0× | 15.0× | 11.0× | 8.0× |
| `financial_special_case` | Fwd op. earnings ex excess cash | Manual | — | — | — |
| `not_applicable` | No metric | — | — | — | — |
| `manual_required` | No metric | — | — | — | — |

> **All values are provisional** pending final calibration-basket validation (EPIC-008).

### 5.3 Growth Tier Overlay (`profitable_growth_pe` only)

The `profitable_growth_pe` base family (36/30/24/18) is calibrated for high-growth compounders (≥ 35% forward revenue growth). Step 2 also admits companies at 20–34% growth — a meaningfully wider spectrum. Growth tiers prevent lower-growth qualifiers from accessing the full NVIDIA-calibrated ceiling.

**Three tiers, determined by `revenue_growth_fwd`:**

| Tier | Growth Range | Max | Comfortable | Very Good | Steal | Spread |
|---|---|---|---|---|---|---|
| `high` | ≥ 35% | 36× | 30× | 24× | 18× | 6 / 6 / 6 |
| `mid` | 25–35% | 30× | 25× | 21× | 17× | 5 / 4 / 4 |
| `standard` | 20–25% | 26× | 22× | 19× | 16× | 4 / 3 / 3 |

**Key design principles:**

- **Steal floor:** The steal level floors at 16–17× across all tiers — at or just above `mature_pe` steal. A company passing all Step 2 quality gates (profitable, FCF-positive, ≥ 25% margin, ≥ 60% FCF conversion) earns a steal floor equivalent to the best mature company. Quality is preserved; only the growth premium is reduced.
- **Spread compression:** Lower growth implies lower uncertainty about fair value. The spread between steal and max narrows from 18 turns (high tier) to 10 turns (standard tier). A 6-turn band fits a high-growth compounder where the range of outcomes is wide; a 3-turn band better fits a profitable compounder at the margin of regime qualification.
- **Null growth invariant:** A null `revenue_growth_fwd` cannot occur in practice for `profitable_growth_pe` — Step 2 requires a non-null value ≥ 0.20. A stock reaching this regime always has a known forward growth figure; the null case is dead code and must not be handled.

### 5.4 Quality Downgrade

After the base quad is selected (and growth tier applied for `profitable_growth_pe`), quality grades are applied as additive subtractions ("turns"). The same number of turns is subtracted from all four threshold levels.

**Downgrade step values per regime (`REGIME_DOWNGRADE_CONFIG`):**

| Regime | EQ: A→B | EQ: B→C | BS: A→B | BS: B→C |
|---|---|---|---|---|
| `mature_pe` | −2.5 | −2.0 | −1.0 | −2.0 |
| `profitable_growth_pe` | −4.0 | −4.0 | −2.0 | −3.0 |
| `profitable_growth_ev_ebit` | −3.0 | −3.0 | −1.5 | −2.0 |
| `cyclical_earnings` | −2.0 | −2.0 | −1.0 | −1.5 |
| `sales_growth_standard` | −2.0 | −1.75 | −1.0 | −1.75 |
| `sales_growth_hyper` | −2.0 | −1.75 | −1.0 | −1.75 |

**Application:** Earnings quality and balance sheet adjustments are cumulative. A B/C stock applies both the A→B step and the B→C step.

**Example** — `profitable_growth_pe`, grade B/A (good earnings, fortress balance sheet):
```
Base (high tier, A/A): 36 / 30 / 24 / 18
EQ A→B: −4.0 to all levels
BS A (no change): 0
Result: 32 / 26 / 20 / 14
```

**Example** — `profitable_growth_pe`, grade B/B:
```
Base (high tier, A/A): 36 / 30 / 24 / 18
EQ A→B: −4.0
BS A→B: −2.0
Total: −6.0
Result: 30 / 24 / 18 / 12
```

**Rationale for larger steps in `profitable_growth_pe`:** The base multiple is 36× vs 22× for `mature_pe`. The same percentage-style quality risk deserves larger absolute downgrade steps when the starting multiple is higher. A −4-turn EQ downgrade on a 36× max is proportionally equivalent to a −2.5-turn downgrade on a 22× max.

### 5.5 Full Threshold Computation Pipeline

Applied in this exact order:

```
1. Look up base row from ValuationRegimeThreshold (A/A quality, tier_high reference)
2. Apply growth tier substitution (profitable_growth_pe only):
   — if tier = mid or standard, replace base quad with GROWTH_TIER_CONFIG values
3. Apply quality downgrade (REGIME_DOWNGRADE_CONFIG):
   — compute total turns = EQ adjustment + BS adjustment
   — subtract from all four threshold levels equally
4. Apply cyclical overlay (if applicable — see §6):
   — scalar subtraction from all four levels
5. Apply secondary adjustments:
   a. Gross margin adjustment (EV/Sales regimes only)
   b. Dilution adjustment (if material_dilution_flag = true)
6. Enforce floor and ordering: max > comfortable > very_good > steal ≥ 0.5×
```

### 5.6 Secondary Adjustments

#### Gross Margin Adjustment (EV/Sales regimes: `sales_growth_standard`, `sales_growth_hyper`)

| Gross Margin | Adjustment |
|---|---|
| > 80% | +1.0× sales to all levels |
| 60–80% | No change |
| < 60% | −1.5× sales from all levels |

**Rationale:** A higher gross margin justifies paying more revenue-multiple because more of each revenue dollar flows through to potential profit.

#### Dilution / SBC Adjustment

Triggered when: `share_count_growth_3y > 5%` OR `material_dilution_flag = true`

| Primary Metric | Adjustment |
|---|---|
| P/E or EV/EBIT | −1 turn from all levels |
| EV/Sales | −1.0× sales from all levels |

---

## 6. Cyclical Model

### 6.1 Structural Cyclicality Score

`structural_cyclicality_score` is an integer 0–3 measuring the inherent, structural cyclicality of the business — independent of where current earnings sit in the cycle.

| Score | Description | Examples |
|---|---|---|
| 0 | Very low / none — stable recurring demand | SaaS, consumer staples, utilities, pharma |
| 1 | Mild — some revenue sensitivity, durable through mild recessions | Diversified tech, healthcare devices |
| 2 | Moderate — clear cycle, meaningful trough/peak swings | Semiconductors, enterprise tech, industrials |
| 3 | High — deep cycle, large earnings compression at trough | Energy, materials, auto, basic cyclical semis |

**Primary derivation (quantitative history from last 16 quarters):**

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

Using `marginDurabilityScore` and `pricingPowerScore` from the enrichment pipeline:

```
cyclical_quality_modifier = (marginDurabilityScore + pricingPowerScore) / 2

if cyclical_quality_modifier >= 4.0: score = max(0, score − 1)  // high quality → less cyclical
if cyclical_quality_modifier <= 2.0: score = min(3, score + 1)  // low quality → more cyclical
```

**Hard constraints:** The LLM modifier can only move the score ±1 level and never below 0 or above 3. LLM signals **cannot override** hard profitability gates in the regime selector.

### 6.2 Cycle Position

`cycle_position` estimates where current earnings appear to sit relative to historical normal. This is a conservative first-pass estimate, not a market-timing claim.

> **Hard framework bias — must be preserved in all implementations:** When evidence is thin, mixed, or noisy: default to `normal` or `insufficient_data`. Never infer `elevated` or `peak` unless the margin deviation is unambiguous and both conditions fire simultaneously. **False tightening from an incorrect `elevated`/`peak` call is materially worse than false normalisation from a `normal` call.** A `normal` inference that turns out to be `elevated` allows a slightly too-generous threshold — a tolerable error. An `elevated` inference that turns out to be `normal` incorrectly tightens thresholds for a non-peak name — the more harmful error. **When in doubt, assign `normal` or `insufficient_data`.**

| Value | Meaning |
|---|---|
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

elif ttm_op_margin > history_avg × 1.25 AND current_rev_ttm at history-window high:
    cycle_position = peak

elif ttm_op_margin > history_avg × 1.15 AND revenue trending above history midpoint:
    cycle_position = elevated

elif ttm_op_margin < history_avg × 0.85:
    cycle_position = depressed

else:
    cycle_position = normal
```

**Why strict thresholds?** With limited post-COVID history (mostly expansion with a 2022 slowdown), the history window is insufficient to observe a full economic cycle. False `elevated` or `peak` signals are worse than false `normal` — they would incorrectly tighten thresholds for non-peak names. The 15%/25% deviation margins are deliberately conservative.

**No LLM input for cycle position.** The risk of hallucination or stale training data is too high for a live inference about current earnings position.

### 6.3 Cyclical Overlay

The cyclical overlay applies **after** quality downgrade and adjusts thresholds for cyclical risk.

#### Case A: Profitable High-Growth Cyclical (`profitable_growth_pe` + score ≥ 1)

The stock qualified for `profitable_growth_pe` (Step 2) AND carries structural cyclicality. The regime stays `profitable_growth_pe`; thresholds receive a scalar haircut.

**Score = 3 exception:** A `structural_cyclicality_score` of 3 re-routes to `cyclical_earnings` even if Step 2 financial gates are met. The quality of a score-3 cyclical does not support the full `profitable_growth_pe` family even with a haircut.

**Overlay matrix (turns to subtract from all threshold levels):**

| Score | Cycle Position | Overlay |
|---|---|---|
| 0 | any | 0 |
| 1 | depressed / normal / insufficient_data | −2.0 |
| 1 | elevated / peak | −4.0 |
| 2 | depressed / normal / insufficient_data | −4.0 |
| 2 | elevated / peak | −6.0 |
| 3 | any | re-route to `cyclical_earnings` (not an overlay) |

**Worked example — NVIDIA (score = 2, normal cycle, A/A quality, high growth tier):**

```
Base (tier high, A/A): 36 / 30 / 24 / 18
Quality downgrade (A/A): 0
Cyclical overlay (score 2, normal): −4.0
Final: 32 / 26 / 20 / 14
```

Still significantly above `mature_pe` (22/20/18/16). Correct — NVIDIA at normal cycle deserves a premium.

**At elevated cycle:**

```
Base: 36 / 30 / 24 / 18
Quality downgrade (A/A): 0
Cyclical overlay (score 2, elevated): −6.0
Final: 30 / 24 / 18 / 12
```

#### Case B: Lower-Quality Cyclical (`cyclical_earnings`)

For stocks in `cyclical_earnings`, the base family (16/13/10/7) already reflects the cyclical risk discount. Cycle position adjusts thresholds further:

| Cycle Position | Overlay |
|---|---|
| elevated | −2.0 |
| peak | −3.5 |
| depressed / normal / insufficient_data | 0 |

**At `depressed` cycle position:** No tightening — earnings are already below normal; tightening would incorrectly penalise already-cheap cyclicals. System surfaces a basis warning: *"Spot earnings may be below normal. Consider mid-cycle basis."*

#### Distinguishing NVIDIA from Micron from Ford

| Stock | Score | Regime | Overlay | Reasoning |
|---|---|---|---|---|
| NVDA (normal) | 2 | `profitable_growth_pe` | −4 turns | High margin, strong FCF, qualifies Step 2 |
| NVDA (elevated) | 2 | `profitable_growth_pe` | −6 turns | Same regime; larger haircut at elevated earnings |
| MU (normal) | 2–3 | `cyclical_earnings` | 0 | FCF conversion < 0.60 bars Step 2; falls to Step 3 |
| MU (elevated) | 2–3 | `cyclical_earnings` | −2 turns | In cyclical_earnings; cycle overlay applies |
| Ford (any) | 3 | `cyclical_earnings` | 0–3.5 turns | Score 3 forces cyclical_earnings; cycle overlay for elevated |
| XOM (normal) | 2 | `cyclical_earnings` | 0 | Energy cyclical; does not qualify Step 2 |

---

## 7. TSR Hurdles

### 7.1 Base TSR Hurdles by Bucket

The TSR hurdle remains bucket-keyed. The regime change does not affect TSR hurdle calculation.

| Bucket | Base Hurdle Range | Deterministic Default |
|---|---|---|
| 1 | 14–16%+ | 15.0% |
| 2 | 10–11% | 10.5% |
| 3 | 11–12% | 11.5% |
| 4 | 12–13% | 12.5% |
| 5 | 14–16% | 15.0% |
| 6 | 18–20%+ | 19.0% |
| 7 | 25%+ | 25.0% |
| 8 | No normal hurdle | null |

### 7.2 Quality Adjustments

Applied to the base hurdle to produce the **adjusted TSR hurdle**:

| Grade | Earnings Quality Adjustment | Balance Sheet Adjustment |
|---|---|---|
| A | −1.0% | −0.5% |
| B | 0% | 0% |
| C | +2.5% | +1.75% |

**Formula:**
```
adjusted_tsr_hurdle = base_hurdle_default
                    + earnings_quality_adjustment
                    + balance_sheet_adjustment
```

### 7.3 Worked Examples

| Code | Base | EQ Adj. | BS Adj. | Adjusted Hurdle |
|---|---|---|---|---|
| 4AA | 12.5% | −1.0% | −0.5% | **11.0%** |
| 4BA | 12.5% | 0% | −0.5% | **12.0%** |
| 3AA | 11.5% | −1.0% | −0.5% | **10.0%** |
| 5BB | 15.0% | 0% | 0% | **15.0%** |
| 6BA | 19.0% | 0% | −0.5% | **18.5%** |
| 6CC | 19.0% | +2.5% | +1.75% | **23.25%** |

---

## 8. Complete Valuation Workflow

### 8.1 End-to-End Pipeline

```
INPUT: ticker, active_code, financial data, flags

Step 1 → Confidence check
         If confidence = low: apply effective bucket demotion

Step 2 → Regime selection
         Run Steps 0A → 0B → 0C → 1 → 2 → 3 → 4 → 5 → 6
         First rule that fires = assigned regime

Step 3 → Primary metric selection
         Determined by regime (see §4.2)

Step 4 → Current multiple computation
         Compute live multiple for the assigned primary metric

Step 5 → Threshold assignment
         5a. Lookup base quad from ValuationRegimeThreshold (A/A)
         5b. Apply growth tier overlay (profitable_growth_pe only)
         5c. Apply quality downgrade (REGIME_DOWNGRADE_CONFIG)
         5d. Apply cyclical overlay (if structural_cyclicality_score ≥ 1)
         5e. Apply secondary adjustments (gross margin, dilution)
         5f. Enforce floor and ordering

Step 6 → TSR hurdle computation
         Base by bucket + EQ adjustment + BS adjustment

Step 7 → Valuation zone assignment
         Compare current multiple to threshold levels

Step 8 → Persist and surface
         Store all fields; surface regime, zone, overlays applied
```

### 8.2 Current Multiple Computation

The current multiple is computed from live price and forward estimates:

| Metric | Computation |
|---|---|
| `forward_pe` | Share price / forward EPS |
| `forward_ev_ebit` | Enterprise value / forward EBIT |
| `ev_sales` | Enterprise value / TTM revenue |
| `forward_operating_earnings_ex_excess_cash` | (Market cap − excess cash) / normalised operating earnings |

**Cyclicality basis flag:** When `structural_cyclicality_score ≥ 1`, the system records `current_multiple_basis`:
- `spot` — current earnings used as-is
- `mid_cycle` — user-specified mid-cycle earnings basis
- `manual_override` — user has manually set the basis

### 8.3 Valuation Zone Assignment

```
if current_multiple <= steal:     zone = steal_zone
if current_multiple <= very_good: zone = very_good_zone
if current_multiple <= comfortable: zone = comfortable_zone
if current_multiple <= max:       zone = max_zone
else:                             zone = above_max
```

Special zones: `not_applicable` (bucket 8, `financial_special_case` awaiting user inputs, `manual_required`). These correspond to `valuation_state_status` values that block numeric zone assignment.

### 8.4 Persisted Fields

Key fields stored in `valuation_state` for each stock:

| Field | Description |
|---|---|
| `valuation_regime` | Assigned regime |
| `primary_metric` | Primary metric used |
| `current_multiple` | Live computed multiple |
| `current_multiple_basis` | spot / mid_cycle / manual_override |
| `threshold_family` | e.g. `profitable_growth_pe_mid_BA` |
| `threshold_source` | regime_derived / manual_override |
| `max_threshold` | Computed max level |
| `comfortable_threshold` | Computed comfortable level |
| `very_good_threshold` | Computed very good level |
| `steal_threshold` | Computed steal level |
| `valuation_zone` | Current zone |
| `adjusted_tsr_hurdle` | Quality-adjusted TSR hurdle |
| `structural_cyclicality_score_snapshot` | Score at computation time |
| `cycle_position_snapshot` | Cycle position at computation time |
| `cyclical_overlay_applied` | Boolean |
| `cyclical_overlay_value` | Turns subtracted (if applied) |
| `cyclical_confidence` | high / medium / low / insufficient_data |
| `growth_tier` | high / mid / standard (profitable_growth_pe only) |
| `valuation_state_status` | classification_required / not_applicable / manual_required / computed / stale |

---

## 9. Appendices

### Appendix A: V1 Anchored Threshold Table (Frozen 2026-04-27)

The original V1 threshold table was keyed by `{bucket}{EQ}{BS}` code. It is frozen as of 2026-04-27. New computations use the regime-keyed `ValuationRegimeThreshold` table. These values are preserved for audit continuity.

**Profitable / Earnings-Anchored Buckets**

| Code | Primary Metric | Max | Comfortable | Very Good | Steal |
|---|---|---|---|---|---|
| 1AA | Fwd P/E | 10.0 | 8.5 | 7.0 | 5.5 |
| 1BA | Fwd P/E | 8.5 | 7.0 | 5.5 | 4.0 |
| 2AA | Fwd P/E | 16.0 | 14.0 | 12.5 | 11.0 |
| 2BA | Fwd P/E | 13.5 | 12.0 | 10.5 | 9.0 |
| 3AA | Fwd op. earnings ex excess cash | 18.5 | 17.0 | 15.5 | 14.0 |
| 3BA | Fwd P/E | 15.0 | 13.5 | 12.0 | 10.5 |
| 4AA | Fwd P/E | 22.0 | 20.0 | 18.0 | 16.0 |
| 4BA | Fwd P/E | 14.5 | 13.0 | 11.5 | 10.0 |

**Operating Leverage / Transition Growers**

| Code | Primary Metric | Max | Comfortable | Very Good | Steal |
|---|---|---|---|---|---|
| 5AA | Fwd EV/EBIT | 20.0 | 17.0 | 14.5 | 12.0 |
| 5BA | Fwd EV/EBIT | 17.0 | 15.0 | 13.0 | 11.0 |
| 5BB | Fwd EV/EBIT | 15.0 | 13.0 | 11.0 | 9.0 |

**High-Growth / Low-Profit Buckets**

| Code | Primary Metric | Max | Comfortable | Very Good | Steal |
|---|---|---|---|---|---|
| 6AA | EV/Sales | 12.0 | 10.0 | 8.0 | 6.0 |
| 6BA | EV/Sales | 9.0 | 7.0 | 5.5 | 4.0 |
| 6BB | EV/Sales | 7.0 | 5.5 | 4.5 | 3.0 |
| 7AA | EV/Sales | 18.0 | 15.0 | 11.0 | 8.0 |
| 7BA | EV/Sales | 14.0 | 11.0 | 8.5 | 6.0 |
| 8X | No stable metric | — | — | — | — |

**Derivation rules from nearest anchor (V1 — for reference):**

*P/E buckets (1–4):*
- EQ A→B: −2.5 turns; EQ B→C: −2.0 additional; BS A→B: −1.0 turn; BS B→C: −2.0 additional

*EV/EBIT bucket (5):*
- EQ A→B: −2.0 turns; EQ B→C: −2.0 additional; BS A→B: −1.25 turns; BS B→C: −2.0 additional

*EV/Sales buckets (6–7):*
- EQ A→B: −2.0×; EQ B→C: −1.75× additional; BS A→B: −1.0×; BS B→C: −1.75× additional

---

### Appendix B: Regime Selector Complete Pseudocode

For LLM implementation purposes — the exact logic in executable form:

```typescript
type ValuationRegime =
  | 'not_applicable'
  | 'financial_special_case'
  | 'sales_growth_standard'
  | 'sales_growth_hyper'
  | 'profitable_growth_pe'
  | 'cyclical_earnings'
  | 'profitable_growth_ev_ebit'
  | 'mature_pe'
  | 'manual_required';

interface RegimeInput {
  bucket: number;                         // 1–8
  netIncomePositive: boolean;
  fcfPositive: boolean;
  operatingMarginTtm: number | null;      // e.g. 0.25 = 25%
  grossMarginTtm: number | null;
  revenueGrowthFwd: number | null;        // e.g. 0.20 = 20%
  fcfConversionTtm: number | null;        // freeCashFlow / netIncome
  structuralCyclicalityScore: number;     // 0–3
  preOperatingLeverageFlag: boolean;
  holdingCompanyFlag: boolean;
  insurerFlag: boolean;
}

function selectRegime(input: RegimeInput): ValuationRegime {
  const { bucket, netIncomePositive, fcfPositive,
          operatingMarginTtm: opMargin, grossMarginTtm: grossMargin,
          revenueGrowthFwd: revGrowth, fcfConversionTtm: fcfConv,
          structuralCyclicalityScore: cyclScore,
          preOperatingLeverageFlag, holdingCompanyFlag, insurerFlag,
          bankFlag } = input;

  // Step 0A
  if (bucket === 8) return 'not_applicable';

  // Step 0B — Bank flag: fully outside automated framework
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

  // Step 2
  const step2 = revGrowth !== null && revGrowth >= 0.20
             && opMargin !== null && opMargin >= 0.25
             && netIncomePositive
             && fcfPositive
             && fcfConv !== null && fcfConv >= 0.60;
  if (step2) return 'profitable_growth_pe';

  // Step 3
  const step3 = cyclScore >= 1 && netIncomePositive
             && opMargin !== null && opMargin >= 0.10;
  if (step3) return 'cyclical_earnings';

  // Step 4
  const step4 = revGrowth !== null && revGrowth >= 0.15
             && netIncomePositive && fcfPositive
             && opMargin !== null && opMargin >= 0.10 && opMargin < 0.25;
  if (step4) return 'profitable_growth_ev_ebit';

  // Step 5
  if (netIncomePositive && fcfPositive) return 'mature_pe';

  // Step 6
  return 'manual_required';
}
```

---

### Appendix C: Growth Tier and Threshold Computation Pseudocode

```typescript
type GrowthTier = 'high' | 'mid' | 'standard';

interface ThresholdQuad {
  max: number;
  comfortable: number;
  veryGood: number;
  steal: number;
}

// Base regime families (A/A quality, tier_high for profitable_growth_pe)
const BASE_FAMILIES: Record<string, ThresholdQuad> = {
  mature_pe:                 { max: 22, comfortable: 20, veryGood: 18, steal: 16 },
  profitable_growth_pe:      { max: 36, comfortable: 30, veryGood: 24, steal: 18 },
  profitable_growth_ev_ebit: { max: 24, comfortable: 20, veryGood: 16, steal: 12 },
  cyclical_earnings:         { max: 16, comfortable: 13, veryGood: 10, steal:  7 },
  sales_growth_standard:     { max: 12, comfortable: 10, veryGood:  8, steal:  6 },
  sales_growth_hyper:        { max: 18, comfortable: 15, veryGood: 11, steal:  8 },
};

// Growth tier overrides (profitable_growth_pe only)
const GROWTH_TIER_CONFIG: Record<GrowthTier, ThresholdQuad> = {
  high:     { max: 36, comfortable: 30, veryGood: 24, steal: 18 },
  mid:      { max: 30, comfortable: 25, veryGood: 21, steal: 17 },
  standard: { max: 26, comfortable: 22, veryGood: 19, steal: 16 },
};

// Quality downgrade steps
const REGIME_DOWNGRADE_CONFIG = {
  mature_pe:                  { eqAb: 2.5, eqBc: 2.0, bsAb: 1.0, bsBc: 2.0 },
  profitable_growth_pe:       { eqAb: 4.0, eqBc: 4.0, bsAb: 2.0, bsBc: 3.0 },
  profitable_growth_ev_ebit:  { eqAb: 3.0, eqBc: 3.0, bsAb: 1.5, bsBc: 2.0 },
  cyclical_earnings:          { eqAb: 2.0, eqBc: 2.0, bsAb: 1.0, bsBc: 1.5 },
  sales_growth_standard:      { eqAb: 2.0, eqBc: 1.75, bsAb: 1.0, bsBc: 1.75 },
  sales_growth_hyper:         { eqAb: 2.0, eqBc: 1.75, bsAb: 1.0, bsBc: 1.75 },
};

function resolveGrowthTier(revenueGrowthFwd: number): GrowthTier {
  // Null cannot occur here: Step 2 requires non-null revenueGrowthFwd >= 0.20
  if (revenueGrowthFwd >= 0.35) return 'high';
  if (revenueGrowthFwd >= 0.25) return 'mid';
  return 'standard';
}

function computeThresholds(
  regime: string,
  eqGrade: 'A' | 'B' | 'C',
  bsGrade: 'A' | 'B' | 'C',
  revenueGrowthFwd: number | null,
  cyclicalityScore: number,
  cyclePosition: string,
  grossMargin: number | null,
  materialDilution: boolean,
): ThresholdQuad {

  // 1. Base quad
  let base = { ...BASE_FAMILIES[regime] };

  // 2. Growth tier override
  if (regime === 'profitable_growth_pe') {
    const tier = resolveGrowthTier(revenueGrowthFwd);
    base = { ...GROWTH_TIER_CONFIG[tier] };
  }

  // 3. Quality downgrade
  const cfg = REGIME_DOWNGRADE_CONFIG[regime];
  if (cfg) {
    let eqAdj = 0;
    if (eqGrade === 'B') eqAdj = cfg.eqAb;
    if (eqGrade === 'C') eqAdj = cfg.eqAb + cfg.eqBc;

    let bsAdj = 0;
    if (bsGrade === 'B') bsAdj = cfg.bsAb;
    if (bsGrade === 'C') bsAdj = cfg.bsAb + cfg.bsBc;

    const total = eqAdj + bsAdj;
    base = subtract(base, total);
  }

  // 4. Cyclical overlay
  if (regime === 'profitable_growth_pe' && cyclicalityScore >= 1 && cyclicalityScore < 3) {
    const elevated = cyclePosition === 'elevated' || cyclePosition === 'peak';
    const overlay = cyclicalityScore === 1 ? (elevated ? 4.0 : 2.0)
                  : cyclicalityScore === 2 ? (elevated ? 6.0 : 4.0) : 0;
    base = subtract(base, overlay);
  }
  if (regime === 'cyclical_earnings') {
    const overlay = cyclePosition === 'peak' ? 3.5
                  : cyclePosition === 'elevated' ? 2.0 : 0;
    base = subtract(base, overlay);
  }

  // 5a. Gross margin (EV/Sales regimes)
  if (regime === 'sales_growth_standard' || regime === 'sales_growth_hyper') {
    const gmAdj = grossMargin === null ? 0
                : grossMargin > 0.80 ? 1.0
                : grossMargin < 0.60 ? -1.5 : 0;
    base = subtract(base, -gmAdj); // add gmAdj
  }

  // 5b. Dilution
  if (materialDilution) base = subtract(base, 1.0);

  // 6. Floor and ordering
  return enforceFloorAndOrder(base);
}

function subtract(q: ThresholdQuad, turns: number): ThresholdQuad {
  return { max: q.max - turns, comfortable: q.comfortable - turns,
           veryGood: q.veryGood - turns, steal: q.steal - turns };
}

function enforceFloorAndOrder(q: ThresholdQuad): ThresholdQuad {
  const floor = 0.5;
  const s = Math.max(q.steal, floor);
  const vg = Math.max(q.veryGood, s + 0.5);
  const c = Math.max(q.comfortable, vg + 0.5);
  const m = Math.max(q.max, c + 0.5);
  return { max: m, comfortable: c, veryGood: vg, steal: s };
}
```

---

### Appendix D: Complete Worked Examples

#### Example 1: NVIDIA (NVDA) — Profitable High-Growth Cyclical

**Assumed inputs:**
- Bucket: 5 (or 4 depending on assessment), EQ: A, BS: A
- `net_income_positive` = true, `fcf_positive` = true
- `operating_margin_ttm` = 0.65 (65%), `revenue_growth_fwd` = 0.70 (70%)
- `fcf_conversion_ttm` = 0.81, `structural_cyclicality_score` = 2
- `cycle_position` = normal

**Regime selection:**
- Step 0A: bucket ≠ 8 → pass
- Step 0B: bank_flag = false → pass
- Step 0C/0D: no flags → pass
- Step 1: net_income_positive = true; op_margin 65% ≥ 10% (growth-conditioned); no pre_op_leverage flag → step 1 does NOT fire
- Step 2: rev_growth 70% ≥ 20% ✓; op_margin 65% ≥ 25% ✓; net_income_positive ✓; fcf_positive ✓; fcf_conversion 0.81 ≥ 0.60 ✓ → **`profitable_growth_pe`**

**Growth tier:** rev_growth 70% ≥ 35% → **`high`** tier → base 36/30/24/18

**Quality downgrade (A/A):** 0 turns → 36/30/24/18

**Cyclical overlay (score 2, normal):** −4.0 turns → **32/26/20/14**

**TSR hurdle (bucket 5, A/A):** 15.0% − 1.0% − 0.5% = **13.5%**

---

#### Example 2: Walmart (WMT) — Mature Low-Margin Retailer

**Assumed inputs:**
- Bucket: 3, EQ: A, BS: A
- `net_income_positive` = true, `fcf_positive` = true
- `operating_margin_ttm` = 0.0447 (4.47%), `revenue_growth_fwd` = 0.05 (5%)
- `fcf_conversion_ttm` = 0.85, `structural_cyclicality_score` = 0

**Regime selection:**
- Step 1: op_margin 4.47% < 10% BUT rev_growth 5% < 10% → growth condition fails → Step 1 does **NOT** fire
- Step 2: op_margin 4.47% < 25% → fails → Step 2 does **NOT** fire
- Step 3: cyclicality_score = 0 → fails
- Step 4: rev_growth 5% < 15% → fails
- Step 5: net_income_positive = true AND fcf_positive = true → **`mature_pe`**

**Growth tier:** N/A (not profitable_growth_pe)

**Base (A/A):** 22/20/18/16

**Quality downgrade (A/A):** 0 → **22/20/18/16**

**TSR hurdle (bucket 3, A/A):** 11.5% − 1.0% − 0.5% = **10.0%**

---

#### Example 3: A Transitional SaaS Company — Mid-Growth Profitable

**Assumed inputs:**
- Bucket: 5, EQ: B, BS: A
- `net_income_positive` = true, `fcf_positive` = true
- `operating_margin_ttm` = 0.28 (28%), `revenue_growth_fwd` = 0.28 (28%)
- `fcf_conversion_ttm` = 0.70, `structural_cyclicality_score` = 0

**Regime selection:**
- Step 1: net_income_positive = true; op_margin 28% ≥ 10%; no flag → does NOT fire
- Step 2: rev_growth 28% ≥ 20% ✓; op_margin 28% ≥ 25% ✓; net_income ✓; fcf ✓; fcf_conv 0.70 ≥ 0.60 ✓ → **`profitable_growth_pe`**

**Growth tier:** rev_growth 28%, between 25–35% → **`mid`** tier → base 30/25/21/17

**Quality downgrade (B/A):** EQ A→B = −4.0 turns → 26/21/17/13

**Cyclical overlay:** score = 0 → none

**Final thresholds: 26/21/17/13**

**TSR hurdle (bucket 5, B/A):** 15.0% + 0% − 0.5% = **14.5%**

---

#### Example 4: Micron Technology (MU) — Classic Cyclical

**Assumed inputs:**
- Bucket: 5, EQ: B, BS: B
- `net_income_positive` = true (mid-cycle), `fcf_positive` = true
- `operating_margin_ttm` = 0.20 (20% mid-cycle), `revenue_growth_fwd` = 0.15
- `fcf_conversion_ttm` = 0.43 (below 0.60 threshold), `structural_cyclicality_score` = 3

**Regime selection:**
- Step 1: net_income_positive = true; op_margin 20% ≥ 10%; → does NOT fire
- Step 2: fcf_conversion 0.43 < 0.60 → **Step 2 fails**
- Step 3: cyclicality_score 3 ≥ 1 ✓; net_income_positive ✓; op_margin 20% ≥ 10% ✓ → **`cyclical_earnings`**

**Base (B/B):** 16/13/10/7
- EQ A→B: −2.0; BS A→B: −1.0 → total −3.0 → 13/10/7/4

**Cyclical overlay (normal cycle):** 0 → **13/10/7/4**

*(At elevated cycle: −2.0 → 11/8/5/2)*

---

### Appendix E: Threshold Label Convention

The `threshold_family` field encodes how thresholds were computed:

| Regime | Format | Example |
|---|---|---|
| `profitable_growth_pe` | `{regime}_{tier}_{EQ}{BS}` | `profitable_growth_pe_mid_BA` |
| All others | `{regime}_{EQ}{BS}` | `mature_pe_AA`, `cyclical_earnings_BB` |

`threshold_source` values:
- `regime_derived` — computed from `ValuationRegimeThreshold` base row + REGIME_DOWNGRADE_CONFIG
- `manual_override` — user has manually set thresholds

---

*End of 3AA Framework Model Reference — Version 1.0 (2026-04-27)*
