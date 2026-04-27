# ADR-019: Operating Leverage State Engine

**Status:** ACCEPTED
**Date:** 2026-04-27
**Deciders:** Product Team
**Related:** RFC-009 §9 (Operating Leverage Engine specification), ADR-013 (superseded — bucket scoring weights), RFC-001 (classification engine)

---

## Context

The previous classification system used a boolean `pre_operating_leverage_flag` to signal that a company was transitioning from revenue growth to earnings-per-share growth via operating leverage. This single bit conflated three meaningfully different cases:

1. **Gradual steady expansion** — margin improvement is real but modest and slow.
2. **Emerging structural leverage** — rapid gross profit growth over opex, inflecting operating income; the Uber/Cloudflare scenario.
3. **Cyclical rebound** — operating metrics improve strongly but partly because of cycle recovery, not durable structure.

Treating these identically as a single flag materially distorts bucket assignment: a cyclical rebound should not receive the same earnings-path uplift as a genuine structural inflection.

---

## Decision

Replace `pre_operating_leverage_flag` (boolean) with `operating_leverage_state` (5-state enum) as a first-class engine with a numeric contribution to `expected_normalized_eps_growth`.

### States

| State | Meaning |
|-------|---------|
| `none` | No meaningful leverage; margin flat or worsening |
| `gradual` | Consistent modest leverage; GP outgrowing opex modestly |
| `emerging_now` | Strong structural inflection; GP growing materially faster than opex; strongest uplift |
| `cyclical_rebound` | Operating metrics improve but structural cyclicality (score ≥ 2) implies cycle recovery contribution |
| `deteriorating` | Revenue grows but earnings conversion worsens; margins compressing |

### Required Derived Metrics

All computable from existing `StockQuarterlyHistory` fields (`revenue`, `gross_profit`, `operating_income`). `opex` is derived as `gross_profit − operating_income` (SG&A + R&D equivalent; no separate breakdown required).

| Metric | Definition |
|--------|-----------|
| `opex_ttm` | `gross_profit_ttm − operating_income_ttm` |
| `gross_profit_growth_hist_recent` | 8-quarter CAGR of rolling TTM gross profit |
| `opex_growth_hist_recent` | 8-quarter CAGR of rolling TTM opex |
| `gross_profit_minus_opex_growth_spread_recent` | `gross_profit_growth_hist_recent − opex_growth_hist_recent` |
| `incremental_operating_margin` | `Δoperating_income_ttm / Δrevenue_ttm` over trailing 4 quarters |
| `gross_profit_drop_through` | `Δoperating_income_ttm / Δgross_profit_ttm` over trailing 4 quarters |
| `operating_margin_expansion` | `operating_margin_ttm_now − operating_margin_ttm_4Q_ago` |
| `fcf_conversion_trend` | Sign of OLS slope of `fcf_conversion` over 6 most recent quarters |

### State Classification Rules

**`none`** — all of the following hold:
- `operating_margin_expansion < 0.02`
- `incremental_operating_margin < 0.15`
- `gross_profit_minus_opex_growth_spread_recent ≤ 0`

**`gradual`** — all of the following hold:
- `operating_margin_expansion ∈ [0.02, 0.06)`
- `incremental_operating_margin ∈ [0.15, 0.35)`
- `gross_profit_minus_opex_growth_spread_recent > 0`
- Pattern has persisted ≥ 3 consecutive quarters

**`emerging_now`** — all of the following hold:
- `operating_margin_expansion ≥ 0.06`
- `incremental_operating_margin ≥ 0.35`
- `gross_profit_minus_opex_growth_spread_recent ≥ 0.08`
- `operating_income_growth_hist_recent > normalized_revenue_growth`
- `fcf_conversion_trend > 0`
- AND `structural_cyclicality_score < 2` (if ≥ 2, classify as `cyclical_rebound` instead)

**`cyclical_rebound`** — operating metrics resemble `emerging_now` or `gradual` BUT:
- `structural_cyclicality_score ≥ 2`
- AND cycle position is recovering from depressed toward normal or elevated

**`deteriorating`** — any of the following hold:
- `operating_margin_expansion ≤ −0.02`
- OR `gross_profit_minus_opex_growth_spread_recent < −0.03`
- OR `incremental_operating_margin < 0`

**Precedence:** Classify in this order: `deteriorating` → `emerging_now` → `cyclical_rebound` → `gradual` → `none`. First match wins.

### Numeric Contribution to Earnings Path

| State | Contribution to `expected_normalized_eps_growth` |
|-------|--------------------------------------------------|
| `none` | 0% |
| `gradual` | +3% |
| `emerging_now` | +8% |
| `cyclical_rebound` | +2% (hard cap; not upgradeable by any other signal) |
| `deteriorating` | −4% |

**Asymmetry rationale:** `emerging_now` must matter materially more than `gradual` because operating leverage inflection is often the core investment thesis. `cyclical_rebound` must never approximate `emerging_now` — the distinction between structural compounding and cyclical snapback is fundamental to the 3AA framework.

### Interaction with Cyclical Peak Penalty (ADR-018)

When `operating_leverage_state = cyclical_rebound`:
- Operating leverage contribution is capped at +2% (enforced by state definition above).
- The `cyclical_peak_penalty` from ADR-018 still applies in full and is not reduced.
- These two rules together ensure a cyclical snapback cannot masquerade as structural compounding.

### Universal Thresholds (V1)

All thresholds above are universal across sectors in V1. Sector-family tuning (e.g., lower `incremental_operating_margin` floor for capital-intensive industrials) is deferred to a follow-on ADR once production data reveals systematic miscalibrations.

### Guardrails

1. `emerging_now` must be the single largest positive contribution in the entire engine (+8%). No other modifier exceeds this.
2. `cyclical_rebound` is structurally capped at +2%. No data combination elevates this.
3. `deteriorating` fires on any single threshold breach — not all three must hold.
4. Boolean `pre_operating_leverage_flag` is deprecated. It is retained in the schema as a legacy read-only field for backward compatibility but is no longer used as an input to bucket scoring.

---

## Rationale

### Why replace the flag with a 5-state enum?

The boolean flag produced two outcomes: "leverage is happening" or "not." The reality has five meaningfully different states with different bucket implications. The new engine makes the distinction explicit and auditable.

### Why derive `opex` as `gross_profit − operating_income`?

Storing SG&A and R&D as separate quarterly fields would require new FMP API calls and schema columns. The derived approach (`gross_profit − operating_income`) produces the correct aggregate operating expense figure and is sufficient for all required metrics. Individual line-item breakdown is deferred.

### Why cap `cyclical_rebound` at +2%?

A cyclical earnings recovery can produce the same surface-level operating metrics as genuine structural leverage. The only reliable distinguisher is the structural cyclicality score. Capping the contribution at +2% (vs +8% for `emerging_now`) preserves the critical distinction between durable compounding and cycle normalisation.

---

## Consequences

**Positive:**
- Operating leverage is auditable, reason-code-traceable, and mechanically distinct from cyclicality.
- Uber/Cloudflare-type names get the large positive uplift they deserve.
- Ford/Micron-type cyclical recoveries are explicitly bounded.

**Negative:**
- New derived metrics require additional quarterly computation (`incremental_operating_margin`, `gross_profit_drop_through`, etc.).
- `pre_operating_leverage_flag` must be audited across the universe before deprecation to confirm all existing flags are valid.

---

## Traceability

- RFC-009 §9 (Operating Leverage Engine — full specification)
- ADR-013 (superseded scoring weights)
- ADR-018 (cyclical overlay — interacts via `cyclical_rebound` cap)
- `src/domain/classification/` — implementation target
- `src/modules/data-ingestion/jobs/derived-metrics-computation.service.ts` — new derived fields to be added
