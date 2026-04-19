# 3AA Threshold Derivation Spec — Valuation Zones & TSR Hurdles (v1.0)

## Purpose
Define how the system assigns valuation thresholds and TSR hurdles for every final or suggested **3AA code**.

This spec governs:
- `primary_metric`
- `max`
- `comfortable`
- `very_good`
- `steal`
- `base_tsr_hurdle`
- `adjusted_tsr_hurdle`
- `threshold_source` = `anchored | derived | manual_override`

The goal is to make the framework fully operational even when a specific code is not explicitly listed in the anchored table.

---

## Design Principles

1. **Use explicit anchors where the framework provides them**
2. **Derive missing cases mechanically**, using the framework’s downgrade logic
3. **Never hide derivation** — always label thresholds as `anchored` or `derived`
4. **Do not overfit** — prefer conservative derivation to false precision
5. **Separate valuation thresholds from TSR hurdles**
6. **Allow manual override** when the investor has a specific judgment (e.g., market pessimism override)

---

## Stage 1 — Primary Metric Selection

The first step is to assign the correct valuation metric from the final code.

### Rule set
- **Buckets 1–4** → `forward_pe`
- **Exception: 3AA Berkshire / holding-company / insurer-type stalwarts** → `forward_operating_earnings_ex_excess_cash`
- **Bucket 5** →
  - default `forward_ev_ebit`
  - use `ev_sales` instead if `pre_operating_leverage_flag = true`
- **Buckets 6–7** → `ev_sales`
- **Bucket 8** → `no_stable_metric`

### Output
- `primary_metric`
- `metric_reason`

---

## Stage 2 — Anchored Threshold Table

These thresholds are explicit anchors and should be stored in the system as canonical references.

### Profitable / earnings-anchored buckets

| Code | Primary Metric | Max | Comfortable | Very Good | Steal |
|---|---|---:|---:|---:|---:|
| 1AA | Fwd P/E | 10.0 | 8.5 | 7.0 | 5.5 |
| 1BA | Fwd P/E | 8.5 | 7.0 | 5.5 | 4.0 |
| 2AA | Fwd P/E | 16.0 | 14.0 | 12.5 | 11.0 |
| 2BA | Fwd P/E | 13.5 | 12.0 | 10.5 | 9.0 |
| 3AA | Fwd op earnings ex excess cash | 18.5 | 17.0 | 15.5 | 14.0 |
| 3BA | Fwd P/E | 15.0 | 13.5 | 12.0 | 10.5 |
| 4AA | Fwd P/E | 22.0 | 20.0 | 18.0 | 16.0 |
| 4BA | Fwd P/E | 14.5 | 13.0 | 11.5 | 10.0 |

### Operating leverage / transition growers

| Code | Primary Metric | Max | Comfortable | Very Good | Steal |
|---|---|---:|---:|---:|---:|
| 5AA | Fwd EV/EBIT | 20.0 | 17.0 | 14.5 | 12.0 |
| 5BA | Fwd EV/EBIT | 17.0 | 15.0 | 13.0 | 11.0 |
| 5BB | Fwd EV/EBIT | 15.0 | 13.0 | 11.0 | 9.0 |

### High-growth / low-profit buckets

| Code | Primary Metric | Max | Comfortable | Very Good | Steal |
|---|---|---:|---:|---:|---:|
| 6AA | EV/Sales | 12.0 | 10.0 | 8.0 | 6.0 |
| 6BA | EV/Sales | 9.0 | 7.0 | 5.5 | 4.0 |
| 6BB | EV/Sales | 7.0 | 5.5 | 4.5 | 3.0 |
| 7AA | EV/Sales | 18.0 | 15.0 | 11.0 | 8.0 |
| 7BA | EV/Sales | 14.0 | 11.0 | 8.5 | 6.0 |
| 8X  | No stable metric | n/a | n/a | n/a | n/a |

These must always return `threshold_source='anchored'`.

---

## Stage 3 — Derivation Rules for Missing Codes

If a final code does not exist in the anchored table, derive its thresholds mechanically.

### General derivation policy
1. Find the nearest **anchored reference code** in the same bucket and metric family.
2. Apply quality adjustments according to the framework.
3. Output `threshold_source='derived'`.
4. Store `derived_from_code` and `derivation_notes[]`.

---

## Stage 3A — P/E Buckets (1–4)

### Reference anchors
Use the nearest anchored code in the same bucket:
- Bucket 1: `1AA`, `1BA`
- Bucket 2: `2AA`, `2BA`
- Bucket 3: `3AA`, `3BA`
- Bucket 4: `4AA`, `4BA`

### Adjustment rules
For P/E buckets:
- **Earnings quality A → B**: subtract approximately **2–3 turns**
- **Balance sheet A → B**: subtract approximately **1 turn**
- **Any C on either axis**: subtract another **~2 turns**, and usually flag as speculative / avoid for core

### Deterministic implementation rule
Use the following default mechanical shifts from the **bucket AA anchor**:
- `A/A` → no adjustment
- `B/A` → subtract **2.5 turns** from each threshold
- `A/B` → subtract **1.0 turn** from each threshold
- `B/B` → subtract **3.5 turns** from each threshold
- Any `C` in earnings quality → subtract **2.0 additional turns**
- Any `C` in balance sheet → subtract **2.0 additional turns**

### Examples
- `4AA` anchored: 22 / 20 / 18 / 16
- `4BA` anchored: 14.5 / 13 / 11.5 / 10  
  *(Note: because this is explicitly anchored, always use the anchor, not the mechanical rule.)*
- `4BB` derived from `4BA` or `4AA`:
  - recommended: derive from `4BA` by subtracting **1.0 turn** for B balance sheet
  - output might be: 13.5 / 12.0 / 10.5 / 9.0
- `3BB` derived from `3BA` by subtracting **1.0 turn**:
  - 14.0 / 12.5 / 11.0 / 9.5
- `3CA` derived from `3BA` by subtracting **2.0 turns** for earnings fragility:
  - 13.0 / 11.5 / 10.0 / 8.5

### Floor rule
Never allow any threshold to fall below:
- `1.0x` for P/E metrics
- and maintain descending order: `max > comfortable > very_good > steal`

---

## Stage 3B — EV/EBIT Bucket (5)

### Reference anchors
- `5AA`
- `5BA`
- `5BB`

### Adjustment rules
For Bucket 5 EV/EBIT:
- **Earnings quality A → B**: subtract **2 turns**
- **Balance sheet A → B**: subtract **1–1.5 turns**
- **Any C**: subtract another **~2 turns**

### Deterministic implementation rule
Default shifts from nearest anchor:
- `A/A` → no adjustment
- `B/A` → subtract **2.0 turns**
- `A/B` → subtract **1.25 turns**
- `B/B` → subtract **3.0 turns**
- Any `C` in earnings quality → subtract **2.0 additional turns**
- Any `C` in balance sheet → subtract **2.0 additional turns**

### Examples
- `5AA` anchored: 20 / 17 / 14.5 / 12
- `5BA` anchored: 17 / 15 / 13 / 11
- `5BB` anchored: 15 / 13 / 11 / 9
- `5BC` derived from `5BB` by subtracting **2.0 turns**:
  - 13 / 11 / 9 / 7
- `5CA` derived from `5BA` by subtracting **2.0 turns**:
  - 15 / 13 / 11 / 9

### Pre-operating-leverage switch
If `pre_operating_leverage_flag = true`, switch the metric from `forward_ev_ebit` to `ev_sales`, then use Bucket 6-style derivation logic instead.

---

## Stage 3C — EV/Sales Buckets (6–7)

### Reference anchors
- `6AA`, `6BA`, `6BB`
- `7AA`, `7BA`

### Adjustment rules
For EV/Sales buckets:
- **Earnings quality A → B**: subtract **2.0x sales**
- **Balance sheet A → B**: subtract **1.0x sales**
- **Any C**: subtract another **1.5–2.0x sales**

### Deterministic implementation rule
Default shifts from nearest anchor:
- `A/A` → no adjustment
- `B/A` → subtract **2.0x**
- `A/B` → subtract **1.0x**
- `B/B` → subtract **3.0x**
- Any `C` in earnings quality → subtract **1.75x additional**
- Any `C` in balance sheet → subtract **1.75x additional**

### Examples
- `6AA` anchored: 12 / 10 / 8 / 6
- `6BA` anchored: 9 / 7 / 5.5 / 4
- `6BB` anchored: 7 / 5.5 / 4.5 / 3
- `6BC` derived from `6BB` by subtracting **1.75x**:
  - 5.25 / 3.75 / 2.75 / 1.25
- `7BB` derived from `7BA` by subtracting **1.0x** for balance sheet downgrade:
  - 13 / 10 / 7.5 / 5

### Floor rule
Never allow any EV/Sales threshold below `0.5x`.

---

## Stage 4 — TSR Hurdles

### Base TSR hurdle by bucket
| Bucket | Base TSR Hurdle |
|---|---|
| 1 | 14–16%+ |
| 2 | 10–11% |
| 3 | 11–12% |
| 4 | 12–13% |
| 5 | 14–16% |
| 6 | 18–20%+ |
| 7 | 25%+ |
| 8 | No normal hurdle |

### Deterministic base hurdle defaults
Use the midpoint / practical default for monitoring:
- Bucket 1 → `15.0%`
- Bucket 2 → `10.5%`
- Bucket 3 → `11.5%`
- Bucket 4 → `12.5%`
- Bucket 5 → `15.0%`
- Bucket 6 → `19.0%`
- Bucket 7 → `25.0%`
- Bucket 8 → `null`

Store both:
- `base_tsr_hurdle_label` (e.g. `12–13%`)
- `base_tsr_hurdle_default` (e.g. `12.5`)

### Quality adjustments
#### Earnings quality
- **A** → reduce hurdle by **1.0%**
- **B** → no change
- **C** → add **2.5%**

#### Balance sheet quality
- **A** → reduce hurdle by **0.5%**
- **B** → no change
- **C** → add **1.75%**

### Adjusted TSR hurdle formula

a) Start with `base_tsr_hurdle_default`

b) Apply earnings-quality adjustment

c) Apply balance-sheet adjustment


d) Output:
- `adjusted_tsr_hurdle`
- `tsr_hurdle_reason_codes[]`

### Examples
- `4AA`: 12.5 − 1.0 − 0.5 = **11.0%**
- `4BA`: 12.5 + 0 − 0.5 = **12.0%**
- `3AA`: 11.5 − 1.0 − 0.5 = **10.0%**
- `5BB`: 15.0 + 0 + 0 = **15.0%**
- `6BA`: 19.0 + 0 − 0.5 = **18.5%**
- `6CC`: 19.0 + 2.5 + 1.75 = **23.25%**

### Important note
The framework’s narrative examples sometimes imply approximate rather than exact hurdle levels. The system should therefore:
- use the deterministic formula by default
- allow **manual override** for the adjusted hurdle
- label whether hurdle is `default` or `overridden`

---

## Stage 5 — Additional Valuation Adjustments

These do **not** change the code. They adjust the valuation thresholds or context.

### 5.1 Gross margin adjustment for EV/Sales names (Buckets 6–7)
- `gross_margin > 80%` → add **+1.0x sales** to all thresholds
- `gross_margin 60–80%` → no change
- `gross_margin < 60%` → subtract **1.0x to 2.0x sales**

Default implementation:
- `>80%` → `+1.0x`
- `60–80%` → `0`
- `<60%` → `-1.5x`

Store as:
- `gross_margin_adjustment_applied`
- `gross_margin_adjustment_value`

### 5.2 Cyclicality adjustment
If `cyclicality_flag = true` and earnings appear cyclically inflated:
- do **not** use spot / peak earnings blindly
- allow a `mid_cycle_override` flag
- allow user to override current multiple basis manually

Output fields:
- `cyclicality_adjustment_required`
- `multiple_basis = spot | mid_cycle | manual`

### 5.3 Dilution / SBC adjustment (Buckets 5–7)
If dilution is material:
- for P/E / EV/EBIT → subtract **1 turn**
- for EV/Sales → subtract **1.0x sales**

Default trigger:
- `share_count_growth_3y > 5%` OR manual `material_dilution_flag = true`

### 5.4 Market pessimism override
If `market_pessimism_flag = true`, the system should not automatically change thresholds, but should allow a note:
- `cheap_due_to_lower_quality`
- or `cheap_due_to_unusual_market_pessimism`

This distinction should be recorded explicitly because the framework says it matters.

---

## Stage 6 — Valuation Zone Assignment

Once `current_multiple` and thresholds are known, assign a zone:

- `above_max`
- `max_zone` (current multiple <= max and > comfortable)
- `comfortable_zone`
- `very_good_zone`
- `steal_zone`
- `not_applicable` (Bucket 8 or no stable metric)

### Rule order
- if `current_multiple <= steal` → `steal_zone`
- else if `current_multiple <= very_good` → `very_good_zone`
- else if `current_multiple <= comfortable` → `comfortable_zone`
- else if `current_multiple <= max` → `max_zone`
- else → `above_max`

---

## Stage 7 — Output Schema

```json
{
  "ticker": "ADBE",
  "final_code": "4BA",
  "primary_metric": "forward_pe",
  "current_multiple": 12.8,
  "thresholds": {
    "max": 14.5,
    "comfortable": 13.0,
    "very_good": 11.5,
    "steal": 10.0,
    "threshold_source": "anchored",
    "derived_from_code": null,
    "adjustments": []
  },
  "tsr": {
    "base_hurdle_default": 12.5,
    "adjusted_hurdle": 12.0,
    "hurdle_source": "default",
    "reason_codes": ["bucket_4_base", "bs_A_minus_0_5"]
  },
  "valuation_zone": "comfortable_zone"
}
```

---

## Stage 8 — Manual Overrides

Allow manual override for:
- `primary_metric`
- threshold grid
- adjusted TSR hurdle
- current multiple basis

If overridden:
- `threshold_source='manual_override'`
- preserve the original system-derived values separately
- require `override_reason`

---

## Acceptance Criteria

- Every code that exists in the anchor table returns anchored thresholds
- Missing codes return mechanically derived thresholds with `threshold_source='derived'`
- Thresholds preserve descending order and reasonable floors
- Base and adjusted TSR hurdles are always present except for Bucket 8
- Additional adjustments (gross margin, dilution, cyclicality) are applied only when triggered and always logged
- The UI can clearly display whether a stock is in `max`, `comfortable`, `very good`, or `steal`
- Manual overrides never destroy the system-generated values; they supersede them operationally

---

## Implementation Notes

- Prefer anchored thresholds whenever available
- Derivation should be simple, transparent, and conservative
- The system should not pretend derived thresholds are equal in authority to explicit anchors
- Bucket 8 should bypass normal valuation-zone logic and be labeled `speculation_only`
- Downstream workflows must use:
  - `manual_override` values if present
  - otherwise anchored/derived values

This spec should be implemented as a transparent decision layer, not a hidden model.

