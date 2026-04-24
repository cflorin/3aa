# 3AA Rules Engine Spec — Auto-Suggestion (v1.0)

## Purpose
Define a deterministic, rules-first engine that suggests a **3AA code** for each stock in the universe:

- **Bucket** = business stage / earnings-growth structure
- **Earnings Quality letter** = A / B / C
- **Balance Sheet Quality letter** = A / B / C

The engine must:
- produce a **suggested code**
- provide **confidence** and **reason codes**
- allow **manual override**
- be conservative when data is missing or conflicting

This is a **suggestion engine**, not the final authority. Final classification is always manually overridable.

---

## Scope
Universe:
- US-listed stocks only
- market cap > $5bn

Inputs are fundamental / valuation / quality fields already available or derivable from data vendors.

Outputs:
- `suggested_bucket`
- `suggested_earnings_quality`
- `suggested_balance_sheet_quality`
- `suggested_code`
- `confidence_level`
- `reason_codes[]`
- `manual_override_code`
- `manual_override_reason`

---

## High-Level Design
The engine runs in three sequential stages:

1. **Bucket suggestion**
2. **Earnings quality suggestion**
3. **Balance sheet quality suggestion**

Then it assembles:
- `suggested_code = bucket + earnings_quality + balance_sheet_quality`

The engine should also output:
- a **score breakdown** for each layer
- a **confidence score**
- a list of **triggered rules**

---

## Core Input Fields

### Identity / universe
- `ticker`
- `company_name`
- `sector`
- `industry`
- `market_cap`
- `country`

### Growth / profitability
- `revenue_growth_3y`
- `revenue_growth_fwd`
- `eps_growth_3y`
- `eps_growth_fwd`
- `gross_margin`
- `operating_margin`
- `gross_profit_growth`
- `fcf_margin`
- `fcf_conversion`
- `roic`
- `net_income_positive`
- `fcf_positive`

### Balance sheet / financing
- `cash_and_equivalents`
- `total_debt`
- `net_debt_to_ebitda`
- `interest_coverage`
- `share_count_growth_3y`
- `liquidity_runway_years` (if derivable)

### Valuation inputs
- `forward_pe`
- `forward_ev_ebit`
- `ev_sales`
- `forward_operating_earnings_ex_cash`

### Manual / derived flags
- `holding_company_flag`
- `insurer_flag`
- `cyclicality_flag`
- `optionality_flag`
- `binary_flag`
- `market_pessimism_flag`
- `pre_operating_leverage_flag`

---

## Stage 1 — Bucket Suggestion

### Bucket selection philosophy
Bucket is determined primarily by:
- business stage
- earnings-growth structure
- whether the thesis is mature earnings, compound growth, operating leverage, or optional future scaling

This is **not** a simple risk ranking.

### Scoring approach
For each stock, compute a score for Buckets 1–8.
The suggested bucket is the one with the highest score after tie-break logic.

Each bucket should be scored with simple additive rules, e.g.:
- match on revenue growth range
- match on EPS growth range
- match on profit maturity
- match on reinvestment / optionality characteristics

### Bucket 1 — Decline / harvest
Suggest when most are true:
- `revenue_growth_fwd` or `revenue_growth_3y` in `[-10%, +2%]`
- `eps_growth_fwd` or `eps_growth_3y <= 0–2%`
- low reinvestment runway or weak growth reinvestment logic
- thesis resembles harvest / income / liquidation / asset value

Reason codes:
- `rev_decline_or_flat`
- `eps_decline_or_flat`
- `weak_reinvestment_runway`

### Bucket 2 — Defensive cash machine
Suggest when most are true:
- revenue growth `0–4%`
- EPS growth `0–6%`
- high cash generation
- stable margins
- low market-excitement dependence
- mature / recession-resistant profile

Reason codes:
- `low_growth_stable`
- `high_cash_generation`
- `stable_margins`
- `limited_reinvestment_runway`

### Bucket 3 — Durable stalwart
Suggest when most are true:
- revenue growth `3–8%`
- EPS growth `6–10%`
- strong FCF
- low impairment risk
- moderate durable growth, not explosive

Reason codes:
- `moderate_durable_growth`
- `strong_fcf`
- `low_impairment_profile`

### Bucket 4 — Elite compounder
Suggest when most are true:
- revenue growth `8–15%`
- EPS growth `12–18%`
- high FCF conversion
- elite moat / exceptional durability
- rare discount windows

Reason codes:
- `mid_teens_compounder`
- `high_fcf_conversion`
- `elite_moat_profile`
- `rare_discount_window_type`

### Bucket 5 — Operating leverage grower
Suggest when most are true:
- revenue growth `10–20%`
- gross profit growth `15–25%+`
- EPS growth mid-teens to 30% but less stable
- operating margin still materially expanding
- thesis depends significantly on operating leverage

Reason codes:
- `operating_leverage_story`
- `margin_expansion_key_driver`
- `earnings_less_mature_than_bucket4`

### Bucket 6 — High-growth emerging compounder
Suggest when most are true:
- revenue growth `20–35%+`
- earnings base low / inconsistent / immature
- FCF breakeven to improving
- value depends on scaling into durable earnings power

Reason codes:
- `high_topline_growth`
- `immature_profit_base`
- `future_earnings_optional`

### Bucket 7 — Hypergrowth / venture-like
Suggest when most are true:
- revenue growth `40–100%+`
- little earnings anchor
- future optionality dominates valuation
- assumptions very sensitive

Reason codes:
- `hypergrowth`
- `low_earnings_anchor`
- `valuation_high_optionality`

### Bucket 8 — Lottery / binary
Suggest when either is true:
- `binary_flag = true`
- normal earnings framework clearly not suitable

Reason codes:
- `binary_outcome_profile`
- `standard_metric_not_useful`

---

## Bucket Tie-Break Rules

### 3 vs 4
If both score closely:
- choose **4** only if moat / durability / margin quality / FCF conversion are clearly exceptional
- otherwise default to **3**

### 4 vs 5
If both score closely:
- choose **4** if the business already behaves like a durable earnings compounder
- choose **5** if the thesis still depends materially on future operating leverage / margin expansion

### 5 vs 6
If both score closely:
- choose **5** if forward EBIT is meaningful and EV/EBIT is sensible
- choose **6** if profit base is still too immature and EV/Sales is more appropriate

### 6 vs 7
If both score closely:
- choose **7** only if future optionality overwhelmingly dominates current economics
- otherwise default to **6**

### Special-case overrides
- if `holding_company_flag` or `insurer_flag` and growth profile matches Bucket 3 stalwart logic, prefer **3** over 4/5
- if `binary_flag = true`, force **8** regardless of other scores

---

## Stage 2 — Earnings Quality Suggestion

### Suggest A (elite)
Suggest **A** if most are true:
- strong moat / irreplaceable workflow / monopoly-like position
- visible pricing power
- recurring or deeply embedded revenue
- low churn risk
- long durable growth runway
- margins stable or improving
- `fcf_conversion > 80%`
- gross margin stable or rising
- `roic` high

Reason codes:
- `elite_moat`
- `pricing_power`
- `recurring_or_embedded_revenue`
- `low_churn_risk`
- `high_fcf_conversion`
- `high_roic`

### Suggest B (good)
Suggest **B** if most are true:
- real franchise and real earnings
- good durability but not elite
- more cyclical, more competitive, or more execution-sensitive than A
- `fcf_conversion` roughly `50–80%`
- margins wobble more than A

Reason codes:
- `good_franchise`
- `real_earnings`
- `moderate_cyclicality_or_competition`
- `fcf_conversion_midrange`

### Suggest C (fragile)
Suggest **C** if any cluster is true:
- weak moat
- narrative / commodity dependence
- weak or inconsistent FCF
- high margin volatility
- high earnings revision risk

Reason codes:
- `weak_moat`
- `fragile_cash_generation`
- `high_margin_volatility`
- `high_revision_risk`

### Earnings-quality tie-break
If A and B are close:
- default to **B** unless there is explicit evidence of elite durability

If B and C are close:
- default to **C** if FCF is inconsistent or moat confidence is low

---

## Stage 3 — Balance Sheet Quality Suggestion

### Suggest A (fortress)
Suggest **A** if most are true:
- net cash or `net_debt_to_ebitda < 1.0x`
- `interest_coverage > 12x`
- low refinancing dependence
- dilution unlikely
- liquidity buffer strong

Reason codes:
- `net_cash_or_low_leverage`
- `high_interest_coverage`
- `minimal_refi_risk`
- `low_dilution_risk`

### Suggest B (sound)
Suggest **B** if most are true:
- `net_debt_to_ebitda` between `1.0x and 2.5x`
- `interest_coverage` between `5x and 12x`
- leverage manageable
- refinancing needs manageable
- dilution limited

Reason codes:
- `manageable_leverage`
- `adequate_interest_coverage`
- `sound_but_not_fortress`

### Suggest C (fragile)
Suggest **C** if any cluster is true:
- `net_debt_to_ebitda > 2.5x`
- `interest_coverage < 5x`
- liquidity tight
- refinancing matters materially
- share count rising meaningfully

Reason codes:
- `high_leverage`
- `weak_interest_coverage`
- `tight_liquidity`
- `meaningful_refi_risk`
- `material_dilution`

### Balance-sheet tie-break
If A and B are close:
- default to **B** unless balance sheet clearly creates strategic optionality in downturns

If B and C are close:
- default to **C** if refinancing or dilution risk is visible

---

## Confidence Model

### High confidence
Use `high` when:
- bucket winner is clearly ahead of runner-up
- earnings-quality and balance-sheet letters are unambiguous
- key data coverage is complete
- no major tie-break ambiguity

### Medium confidence
Use `medium` when:
- one layer is ambiguous
- one or two important fields are missing
- tie-break rules were needed

### Low confidence
Use `low` when:
- multiple layers are ambiguous
- many important inputs are missing
- business is clearly a judgment-heavy edge case
- `holding_company_flag`, `insurer_flag`, `optionality_flag`, or `market_pessimism_flag` materially complicates classification

---

## Missing Data Rules
- If key growth inputs are missing, lower bucket confidence by one level
- If `fcf_conversion` or margin history is missing, lower earnings-quality confidence by one level
- If leverage or interest-coverage data is missing, lower balance-sheet confidence by one level
- If too many core fields are missing, output `suggested_code = null` and `confidence = low`

---

## Output Schema

```json
{
  "ticker": "MSFT",
  "suggested_bucket": 4,
  "suggested_earnings_quality": "A",
  "suggested_balance_sheet_quality": "A",
  "suggested_code": "4AA",
  "confidence_level": "high",
  "reason_codes": [
    "mid_teens_compounder",
    "high_fcf_conversion",
    "elite_moat",
    "net_cash_or_low_leverage"
  ],
  "scores": {
    "bucket": { "3": 5, "4": 9, "5": 4 },
    "earnings_quality": { "A": 8, "B": 3, "C": 0 },
    "balance_sheet_quality": { "A": 7, "B": 2, "C": 0 }
  },
  "manual_override_code": null,
  "manual_override_reason": null
}
```

---

## Manual Override Rules
- User can override any suggested code
- Override must be stored separately from suggested code
- UI must always show:
  - suggested code
  - final code
  - why suggested
  - why overridden

Override does not delete the suggestion; it supersedes it operationally.

---

## Acceptance Criteria
- Every stock receives either:
  - a suggested code + confidence + reasons, or
  - a null suggestion with low-confidence explanation
- The engine is deterministic: same inputs produce same outputs
- Bucket tie-break rules work consistently for 3/4, 4/5, 5/6, 6/7 edge cases
- Manual override always takes precedence for downstream valuation logic
- Reason codes are human-readable enough to justify the suggestion in the UI

---

## V0 Implementation Notes
- This engine should be rules-based only, no ML
- Conservative defaults are preferred over aggressive classification
- In ambiguous cases, suggestion should be weaker, not more precise
- Downstream modules must use:
  - `final_code` if present
  - otherwise `suggested_code`

This makes the stock workflow compatible with a rules-first, judgment-final pr