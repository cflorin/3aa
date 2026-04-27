# ADR-017: Valuation Regime Selection Logic

**Status:** ACCEPTED
**Date:** 2026-04-27
**Amended:** 2026-04-28 — Added `high_amortisation_earnings` regime (STORY-098)
**Deciders:** Product Team
**Related:** RFC-003 Amendment 2026-04-27, ADR-005 Amendment 2026-04-27, ADR-018, PRD Amendment 2026-04-27

---

## Context

The V1 valuation engine selects a stock's primary metric solely from its classification bucket. This produces incorrect valuation treatment for profitable high-growth names (forced into EV/Sales), and provides no differentiation within P/E-eligible buckets (NVIDIA and Walmart share the same threshold family).

The core problem: **bucket describes a business archetype, not a valuation regime**. Two companies in the same bucket can warrant entirely different valuation metrics and threshold families.

---

## Decision

Introduce `valuation_regime` as a formal, persisted field computed by a deterministic rule engine (the "regime selector"). The regime becomes the single coupling point between classification and threshold/metric selection.

**What bucket continues to determine:**
- Rule 0A hard exclusion (bucket 8 = `not_applicable`)
- TSR hurdle (still bucket-keyed — unchanged)
- Business archetype label and description
- Confidence-based effective bucket demotion (unchanged)

**What bucket no longer solely determines:**
- Primary metric
- Threshold family

---

## Regime Set

Ten regimes cover all automated and special-case paths:

| Regime | Primary Metric | Purpose |
|--------|---------------|---------|
| `not_applicable` | `no_stable_metric` | Bucket 8; lottery / binary |
| `financial_special_case` | `forward_operating_earnings_ex_excess_cash` | Insurer or holding company, any bucket |
| `sales_growth_standard` | `ev_sales` | Immature / low-margin / pre-profit growth |
| `sales_growth_hyper` | `ev_sales` | High-gross-margin high-growth; distinct threshold family |
| `profitable_growth_pe` | `forward_pe` | Profitable high-growth compounder |
| `cyclical_earnings` | `forward_ev_ebit` | Cyclical with real earnings; EV/EBIT is cleaner anchor |
| `profitable_growth_ev_ebit` | `forward_ev_ebit` | Profitable but scaling / transitional; margin 10–25% |
| `high_amortisation_earnings` | `forward_ev_ebitda` | Profitable mature with heavy acquired-intangible D&A (pharma, large-cap acquirers); GAAP P/E materially distorted |
| `mature_pe` | `forward_pe` | Stable profitable; classic P/E |
| `manual_required` | `no_stable_metric` | Catch-all; no safe automated metric |

---

## Regime Selection Rules (Steps 0–6)

### Required inputs

All inputs derived from existing data; no new data sources needed.

| Input | Source |
|-------|--------|
| `bucket` | parsed from `active_code` |
| `net_income_positive` | `stock_derived_metrics.net_income_ttm > 0` |
| `fcf_positive` | `stock_derived_metrics.free_cash_flow_ttm > 0` |
| `operating_margin_ttm` | `stock_derived_metrics.operating_margin_ttm` |
| `gross_margin_ttm` | `stock_derived_metrics.gross_margin_ttm` |
| `revenue_growth_fwd` | `stock.revenue_growth_fwd` |
| `fcf_conversion_ttm` | `free_cash_flow_ttm / net_income_ttm` (new derived field) |
| `structural_cyclicality_score` | `stock.structural_cyclicality_score` (0–3; replaces `cyclicality_flag`) |
| `pre_operating_leverage_flag` | `stock.pre_operating_leverage_flag` |
| `holding_company_flag` | `stock.holding_company_flag` |
| `insurer_flag` | `stock.insurer_flag` |
| `bank_flag` | `stock.bank_flag` — true for banks, broker-dealers, and financial institutions where EV-based metrics are not meaningful |

### Step 0A — Bucket 8

```
IF bucket = 8
THEN valuation_regime = not_applicable
```

Rationale: Binary / lottery stocks have no stable valuation metric by framework definition.

### Step 0B — Bank flag (any bucket)

```
IF bank_flag = true
THEN valuation_regime = manual_required
```

Rationale: Banks and financial institutions have no automated primary metric. EV/EBIT is not meaningful (deposits are not comparable to corporate debt; there is no traditional enterprise value). P/E requires normalisation for loan-loss provisions, credit cycles, and reserve releases that cannot be automated. ROE and P/TBV are practitioner metrics that are outside the current framework. Banks therefore bypass the automated regime selector entirely and route to `manual_required` — the user must provide both the metric basis and the thresholds manually.

**This rule fires regardless of bucket.** JPM, BAC, GS, MS, and similar financial institutions are explicitly excluded from automated treatment.

**Distinction from `financial_special_case`:** `financial_special_case` means "the correct metric type is known but the earnings basis requires manual normalisation." `manual_required` for banks means "even the correct metric type is ambiguous within this framework."

---

### Step 0C — Insurer flag (any bucket)

```
IF insurer_flag = true
THEN valuation_regime = financial_special_case
     primary_metric = forward_operating_earnings_ex_excess_cash
```

Rationale: Insurance companies have non-operating investment income that distorts standard metrics. Their earnings base requires explicit normalization that cannot be automated. Berkshire Hathaway's insurance and reinsurance operations make it an insurer for this purpose. **This rule fires regardless of bucket** — the V1 restriction to bucket 3 only is removed.

### Step 0D — Holding company flag (any bucket)

```
IF holding_company_flag = true
THEN valuation_regime = financial_special_case
     primary_metric = forward_operating_earnings_ex_excess_cash
```

Rationale: Holding companies own stakes in diverse businesses; consolidated P/E or EV/EBIT reflects a mix of underlying businesses that may not be comparable to operating companies. **This rule fires regardless of bucket.**

**`financial_special_case` semantics:** This regime identifies *what* to measure (forward operating earnings ex excess cash) but cannot compute the earnings basis automatically — the user must supply a normalised earnings figure. Until that figure is provided, `valuation_state_status = 'manual_required'`. Thresholds are also manual: the system does not derive them from a base family. This is distinct from the `manual_required` regime: here the metric *type* is known; only the inputs and thresholds require user action.

Berkshire Hathaway note: BRK carries both `insurer_flag` and `holding_company_flag`. Step 0C fires first. Treatment: `financial_special_case` → `forward_operating_earnings_ex_excess_cash`. If this value is not provided by the user, `valuation_state_status = 'manual_required'`.

### Step 1 — Sales-valued growth path

```
IF any of:
  net_income_positive = false
  (operating_margin_ttm < 0.10 AND revenue_growth_fwd >= 0.10)
  pre_operating_leverage_flag = true
THEN:
  IF revenue_growth_fwd >= 0.40 AND gross_margin_ttm >= 0.70:
    valuation_regime = sales_growth_hyper
  ELSE:
    valuation_regime = sales_growth_standard
```

Rationale: Companies that are loss-making or operating below 10% margin on a growth trajectory are not ready for earnings-based valuation. EV/Sales is the cleaner anchor.

**Why `fcf_positive = false` was removed from Step 1 (calibration finding 2026-04-27):**  
A company that is net-income-positive but FCF-negative has a structural reason for the divergence (bank loan-book growth, major capex cycle, acquisition integration). Routing such companies to EV/Sales is incorrect — EV/Sales is equally inappropriate for them. Instead, they fall through Steps 2–5 naturally: Step 2 fails (requires `fcf_positive = true`); if cyclical they reach Step 3 (`cyclical_earnings` → `forward_ev_ebit`); otherwise they fall to `manual_required` via Step 6. This correctly handles banks and financials without adding a new flag.

**Why `operating_margin_ttm < 0.10` is conditioned on `revenue_growth_fwd >= 0.10` (calibration finding 2026-04-27):**  
Mature profitable businesses with structurally low margins (e.g. large-format retail, distribution) have operating margins permanently below 10% for competitive/structural reasons, not because they are pre-scale. If revenue growth is also low (<10%), the company is a mature stable low-margin business — it should fall to `mature_pe` (Step 5), not EV/Sales. The growth gate `>= 0.10` ensures only growing low-margin businesses (which are genuinely in a pre-scale phase) get routed to Step 1. Companies with sub-10% margin AND low growth fall through to Step 5.

**`pre_operating_leverage_flag` data quality note:** This flag should only be set when the classification system has affirmatively identified a company as pre-operating-leverage (i.e., business model implies significant future margin expansion that hasn't materialised yet). It should NOT be set for mature businesses with structurally thin margins. EPIC-008 implementation must include a flag-quality audit for this field across the universe.

The hyper-growth variant requires both high revenue growth (≥40%) and high gross margin (≥70%). This captures early-stage platform/SaaS names where the business quality justifies a higher EV/Sales family despite immaturity.

### Step 2 — Profitable high-growth PE path

```
IF all of:
  revenue_growth_fwd >= 0.20
  operating_margin_ttm >= 0.25
  net_income_positive = true
  fcf_positive = true
  fcf_conversion_ttm >= 0.60
THEN valuation_regime = profitable_growth_pe
```

Rationale: Companies meeting all five conditions are genuinely profitable high-growth compounders. They have real earnings, strong margins, and real cash conversion. Forcing them into EV/Sales (as V1 did for bucket 5–7 names) materially misprices them. The 25%+ operating margin gate specifically prevents transitional or reinvestment-heavy growers from entering this regime.

Intended to capture: NVIDIA-style cases (high margin, strong FCF, real earnings despite high growth); dominant platform businesses with earnings quality that supports a premium P/E regime.

Precedence over Step 3: A cyclical name that qualifies Step 2 remains in `profitable_growth_pe` (with a cyclical overlay applied separately — see ADR-018). It must not be shunted into `cyclical_earnings` solely because of the cyclicality flag.

### Step 3 — Cyclical earnings path

```
IF all of:
  structural_cyclicality_score >= 1
  net_income_positive = true
  operating_margin_ttm >= 0.10
THEN valuation_regime = cyclical_earnings
```

Rationale: Cyclical companies with real earnings should not be treated as immature sales-valued growth names (wrong direction). But simple forward P/E can be misleading at cycle peaks or troughs. EV/EBIT is the cleaner anchor for cyclical names because it uses enterprise value (less sensitive to cycle) and operating earnings (avoids financing distortion). The 10% operating margin gate prevents deeply distressed cyclicals from entering — those fall through to `manual_required`.

Intended to capture: energy, materials, deep cyclical semis (Micron at normal cycle), auto/industrial cyclicals.

### Step 4 — Profitable transitional EV/EBIT

```
IF all of:
  revenue_growth_fwd >= 0.15
  net_income_positive = true
  fcf_positive = true
  operating_margin_ttm >= 0.10 AND < 0.25
THEN valuation_regime = profitable_growth_ev_ebit
```

Rationale: These businesses are profitable and growing, but still in a reinvestment or scaling phase where operating margins have not yet reached the level that supports a high-multiple P/E regime. EV/EBIT is a cleaner anchor than P/E because it captures value at the enterprise level without per-share distortion from reinvestment. The `< 0.25` upper bound forms a clean partition with Step 2 (`>= 0.25`).

### Step 4.5 — High amortisation earnings (STORY-098, 2026-04-28)

```
IF all of:
  ebitdaNtm is not null
  ebitNtm is not null
  ebitdaNtm / ebitNtm >= 1.30   (implied D&A >= 30% of EBIT)
  net_income_positive = true
  fcf_positive = true
THEN valuation_regime = high_amortisation_earnings
```

**Rationale:** Companies with ≥30% D&A burden relative to EBIT carry large acquired-intangible amortisation charges that materially depress GAAP EPS without affecting cash earnings. GAAP P/E for such companies severely understates true earnings power; forward EV/EBITDA at the enterprise level adds back these non-cash charges and is the sell-side industry standard for pharma and large-cap acquirers.

**Trigger data:** `ebitdaNtm` (FMP `ebitdaAvg`) and `ebitNtm` (FMP `ebitAvg`) are already fetched from the same FMP `/analyst-estimates` call (STORY-097). No new data sources required.

**Threshold:** `ebitdaNtm / ebitNtm >= 1.30` was calibrated against live FMP data (2026-04-28):

| Stock | ebitdaAvg/ebitAvg | Triggers? |
|-------|-------------------|-----------|
| ABBV | 1.76x | Yes — Allergan acquired-intangible amortisation |
| PFE | 1.38x | Yes — post-2021 acquisition amortisation |
| JNJ | 1.35x | Yes — acquired-intangible portfolio |
| MRK | 1.19x | No — lower relative amortisation |
| AZN | 1.17x | No — lower relative amortisation |
| MSFT | 1.19x | No — cloud D&A but modest relative to EBIT |

**Precedence note:** Step 4.5 fires only after Steps 1–4 have not matched. A pharma in a high-growth phase (≥20% revenue growth) would already be captured by Step 2 or Step 4, where EV/EBIT is already used. Step 4.5 is specifically for mature, slow-growing companies where P/E would otherwise be selected by Step 5.

**Data availability guard:** If `ebitdaNtm` or `ebitNtm` is null (FMP data gap), the step is skipped and the stock falls to `mature_pe` — no error.

### Step 5 — Mature PE default

```
IF net_income_positive = true AND fcf_positive = true
THEN valuation_regime = mature_pe
```

Rationale: Stable profitable companies that did not qualify for any growth, cyclical, or high-amortisation path. Classic P/E is appropriate. Intended to capture: Walmart, Procter & Gamble, Colgate, and similar stalwarts.

### Step 6 — Catch-all

```
ELSE valuation_regime = manual_required
```

---

## Precedence Rules

These are intentional and must be preserved:

1. Bucket 8 exclusion before anything
2. Bank flag before financial special cases — banks are explicitly outside automated scope
3. Financial special cases before financial analysis (non-standard earnings base; metric type known but inputs manual)
4. Immature/sales-valued path before anything else (cannot fake profitability)
5. **Profitable high-growth PE before cyclical** — NVIDIA must reach Step 2 before Step 3
6. Cyclical earnings before profitable transitional — cyclical risk profile is distinct
7. **High amortisation before mature PE** — a pharma with 30%+ D&A burden should not get P/E treatment
8. Mature PE as final automated path — stable profitable names not fitting any prior path

---

## Illustrative Stock Assignments

These are directional expectations, not hard-coded outputs. Actual regime depends on live financial data at computation time.

| Stock | Expected Regime | Key Reason |
|-------|----------------|------------|
| NVDA | `profitable_growth_pe` + cyclical overlay | High margin (50%+), strong FCF conversion, ≥25% op margin, high growth; cyclical overlay applies |
| MSFT | `profitable_growth_pe` or `mature_pe` | Depends on revenue_growth_fwd: ≥20% → profitable_growth_pe; <20% → mature_pe |
| AAPL | `profitable_growth_pe` or `mature_pe` | High margin and FCF; growth rate is the swing factor |
| WMT | `mature_pe` | Stable profitable, low margin (retail), growth below 20% |
| MU | `cyclical_earnings` | Semiconductor, cyclical flag, real earnings, <25% op margin at mid-cycle |
| XOM / CVX | `cyclical_earnings` | Energy cyclicals with real earnings |
| JPM | `manual_required` | `bank_flag = true` (Step 0B); EV/EBIT and automated P/E not meaningful for banks |
| BAC / GS / MS | `manual_required` | Same: `bank_flag = true` |
| BRK | `financial_special_case` | Both `insurer_flag` and `holding_company_flag`; Step 0C fires; metric type known, inputs manual |
| ISRG | `profitable_growth_pe` | Medical devices, high margins, consistent FCF, growth |
| SPGI | `profitable_growth_pe` | Data analytics, high margin, strong FCF |
| DE | `cyclical_earnings` | Agricultural equipment; cyclical |
| NOW | `profitable_growth_pe` or `sales_growth_hyper` | Depends on current FCF_conversion_ttm |
| PANW | `profitable_growth_pe` or `sales_growth_standard` | Depends on current operating_margin_ttm |
| Tesla | `sales_growth_standard` or `profitable_growth_pe` | Depends on current margin and FCF profile |
| ABBV | `high_amortisation_earnings` | ebitdaAvg/ebitAvg = 1.76x (Allergan intangible amortisation); mature, low growth, profitable → Step 4.5 fires |
| JNJ | `high_amortisation_earnings` | ebitdaAvg/ebitAvg = 1.35x; mature diversified pharma → Step 4.5 fires |
| PFE | `high_amortisation_earnings` | ebitdaAvg/ebitAvg = 1.38x; post-acquisition amortisation → Step 4.5 fires |
| MRK | `mature_pe` | ebitdaAvg/ebitAvg = 1.19x; below 1.30 threshold → Step 5 (P/E) |
| AZN | `mature_pe` | ebitdaAvg/ebitAvg = 1.17x; below 1.30 threshold → Step 5 (P/E) |

---

## Quality Downgrade Config Summary

For each regime, quality downgrades are applied using step values (in turns or x-sales):

| Regime | EQ A→B | EQ B→C | BS A→B | BS B→C |
|--------|--------|--------|--------|--------|
| `mature_pe` | 2.5 | 2.0 | 1.0 | 2.0 |
| `profitable_growth_pe` | 4.0 | 4.0 | 2.0 | 3.0 |
| `profitable_growth_ev_ebit` | 3.0 | 3.0 | 1.5 | 2.0 |
| `cyclical_earnings` | 2.0 | 2.0 | 1.0 | 1.5 |
| `high_amortisation_earnings` | 2.0 | 2.0 | 1.0 | 1.5 |
| `sales_growth_standard` | 2.0 | 1.75 | 1.0 | 1.75 |
| `sales_growth_hyper` | 2.0 | 1.75 | 1.0 | 1.75 |

Larger steps for `profitable_growth_pe` reflect the higher base multiple: a 4-turn EQ downgrade on a 36x max is proportionally equivalent to a 2.5-turn downgrade on a 22x max.

---

## Growth Tier Overlay within `profitable_growth_pe`

The base family (36/30/24/18) is calibrated for high-growth compounders (≥35% forward revenue growth). Step 2 also admits companies at 20–34% growth — these deserve a lower ceiling and a narrower spread.

### Three growth tiers

| Tier | `rev_growth_fwd` | Max | Comfortable | Very Good | Steal | Spreads |
|------|---|---|---|---|---|---|
| `high` | ≥ 35% | 36 | 30 | 24 | 18 | 6 / 6 / 6 |
| `mid` | 25–35% | 30 | 25 | 21 | 17 | 5 / 4 / 4 |
| `standard` | 20–25% | 26 | 22 | 19 | 16 | 4 / 3 / 3 |

**Steal floor rationale:** Steal floors at 16–17x across all tiers — matching `mature_pe` steal. A company passing all Step 2 quality gates is a steal at roughly the same price as a mature company regardless of growth tier; the quality floor does not degrade with growth.

**Spread compression rationale:** Lower growth implies lower uncertainty about fair value. A 6-turn spread fits a high-growth compounder where the range of outcomes is wide; a 3-turn spread better fits a profitable compounder at the margin of regime qualification.

**Interaction with cyclical overlay:** Growth tier and cyclical overlay are independent. Growth tier substitutes the base quad before quality downgrade. Cyclical overlay is applied after quality downgrade as a scalar subtraction. Both stack for cyclical names at a non-high growth tier.

**Implementation:** Resolved at runtime from `GROWTH_TIER_CONFIG` (code-level constant — not a new table row). The `ValuationRegimeThreshold` table row for `profitable_growth_pe` remains a single A/A row (36/30/24/18 = tier_high reference).

**Null `revenueGrowthFwd` cannot occur in practice here.** Step 2 requires `revenue_growth_fwd >= 0.20` as an explicit condition — if the value is null, Step 2 fails and the stock never reaches `profitable_growth_pe`. There is no null-as-high-tier fallback; that would be dead code and is therefore not defined.

The `threshold_family` label is extended to include tier: `profitable_growth_pe_high_AA`, `profitable_growth_pe_mid_BA`, etc.

---

## Backward Compatibility

- `cyclicality_flag` boolean is preserved as a generated/computed column (`structural_cyclicality_score >= 1`)
- V1 threshold records remain untouched until EPIC-008 recomputes valuation batch
- TSR hurdle calculation is unchanged (bucket-keyed)
- Confidence-based effective bucket demotion runs before regime selection (unchanged)

---

## Consequences

**Positive:**
- NVIDIA can now receive a meaningful P/E threshold family rather than EV/Sales
- Walmart and NVIDIA are unambiguously separated into distinct threshold families
- Cyclical threshold treatment is explicit rather than just contextual
- The rule engine is fully deterministic and auditable

**Negative:**
- Additional inputs required by regime selector (TTM derived metrics, forward growth)
- A stock can change regime when financial characteristics change (e.g. operating_margin_ttm crosses 0.25), requiring careful UI treatment
- `pre_operating_leverage_flag` is absorbed by Step 1 financial gates — but is preserved as an explicit override flag in case the user wants to force Step 1 even when financial gates don't fire

**Mitigations:**
- Regime changes trigger valuation recompute (existing machinery)
- `valuation_regime` is persisted — users can see why a regime was assigned
- `pre_operating_leverage_flag = true` still explicitly triggers Step 1 regardless of financial gates

---

**END ADR-017**
