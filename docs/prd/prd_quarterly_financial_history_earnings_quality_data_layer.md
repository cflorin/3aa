# PRD — Quarterly Financial History & Earnings Quality Data Layer

## Status
Draft

## Owner
Product / Architecture

## Purpose
Extend the existing data and classification system so it can assess:
- earnings quality more reliably,
- emerging operating leverage more reliably,
- margin durability using trend data rather than point-in-time snapshots,
- dilution-adjusted shareholder quality,
- classification confidence using quarterly historical evidence rather than mostly static current-state fields.

This PRD defines:
1. the additional data to collect,
2. the storage and normalization model,
3. the derived metrics to compute,
4. how those metrics will be used by the classification system.

This is intended to be taken through the full design process and then decomposed into RFC / ADR / epic-story updates, primarily across EPIC-003 and EPIC-004.

---

# 1. Problem Statement

The current system is good enough for a first-pass classification, but it is still too dependent on point-in-time or lightly summarized data.

Current limitations include:
- limited ability to determine whether a company is genuinely entering an operating-leverage phase,
- limited ability to distinguish structurally strong earnings from temporarily flattering earnings,
- limited ability to assess whether free cash flow conversion is stable or noisy,
- limited visibility into margin trajectory,
- limited ability to understand dilution-adjusted progress over time,
- limited ability to differentiate improving versus deteriorating earnings quality.

This is most acute for:
- operating-leverage names,
- cyclical names,
- names where net income and cash generation diverge,
- businesses where capex intensity matters,
- businesses where SBC and dilution distort apparent profitability.

The system therefore needs a quarterly financial history layer and a derived trend layer.

---

# 2. Goal

Create a structured quarterly financial history and trend-analysis layer that enables the system to:
- evaluate earnings quality using trend and cash-conversion behavior,
- detect emerging operating leverage,
- evaluate margin durability and improvement trajectory,
- improve classifier confidence,
- support future alerting based on changes in quality or trajectory.

---

# 3. Scope

## 3.1 In Scope
- Collection of quarterly raw financial history for the last 3 fiscal years / last 12 quarters
- Fiscal period normalization and reconciliation
- Derived TTM and fiscal-year rollups
- Derived trend and quality metrics
- Derived classifier-facing fields for EPIC-004 consumption
- Provenance and period tracking
- Explicit use of the data in earnings quality and operating leverage assessment

## 3.2 Out of Scope
- Full working capital signal framework
- Full-blown filing-parsing or narrative-accounting layer
- Segment-level reporting analysis
- Manual analyst workflow
- Restatement-detection engine
- Full valuation redesign
- UI redesign in this PRD

---

# 4. Product Principles

1. **Raw data first, derived logic second**
   The system should store raw quarterly history and compute derived fields from it, not store only final summaries.

2. **Quarterly before annual**
   Annual and TTM summaries are useful, but the main source of truth for trajectory should be the quarterly layer.

3. **Fiscal-calendar aware**
   Comparisons must respect company fiscal calendars.

4. **Classifier-friendly outputs**
   EPIC-004 should consume structured derived fields, not re-analyze raw time series directly.

5. **Conservative by default**
   Missing or low-quality historical data should reduce confidence rather than force aggressive inference.

6. **Provenance always preserved**
   Every derived field should be traceable to source fields, source provider, and fiscal periods used.

---

# 5. Primary Use Cases

## 5.1 Earnings quality improvement
The classifier needs to know whether strong reported earnings are supported by:
- durable margins,
- cash generation,
- stable conversion,
- limited dilution,
- non-deteriorating operating economics.

## 5.2 Operating leverage detection
The classifier needs to know whether a company is moving into a phase where:
- revenue growth is converting more efficiently into operating profit growth,
- operating margin is improving structurally,
- the business is showing positive drop-through,
- fixed-cost leverage is starting to appear.

## 5.3 Confidence calibration
The classifier should be able to distinguish:
- stable, trend-supported classifications,
- boundary cases supported only by current snapshot data,
- deteriorating or noisy names that deserve lower confidence.

## 5.4 Future alerting
Future alerts may use this layer to identify:
- newly emerging operating leverage,
- deteriorating FCF conversion,
- weakening margin durability,
- rising dilution pressure.

---

# 6. Data Collection Requirements

## 6.1 Collection horizon
For each stock, collect:
- last 12 fiscal quarters minimum,
- and enough metadata to roll those into fiscal-year and TTM views.

If more history is cheaply available, it may be retained later, but V1 requirement is the last 12 quarters.

## 6.2 Period metadata (required)
Each quarter must store:
- ticker
- fiscal_year
- fiscal_quarter
- fiscal_period_end_date
- reported_date if available
- calendar_year
- calendar_quarter
- source_provider
- source_statement_type
- source_updated_at

These fields are required so the system can correctly compare same-quarter year-over-year and compute aligned TTM metrics.

## 6.3 Raw quarterly financial fields (required)
For each fiscal quarter, collect these absolute values:
- revenue
- gross_profit
- operating_income
- net_income
- capex
- cash_from_operations
- free_cash_flow
- share_based_compensation
- depreciation_and_amortization
- diluted_shares_outstanding

## 6.4 Raw quarterly financial fields (optional but useful if available cleanly)
These may be stored if the source provides them consistently, but they are not hard requirements for this PRD:
- R&D expense
- SG&A expense
- total operating expense
- EBIT
- EBITDA

These are useful, but the core requirement is satisfied without them.

---

# 7. Derived Per-Quarter Metrics

For each quarter, compute and persist:
- gross_margin = gross_profit / revenue
- operating_margin = operating_income / revenue
- net_margin = net_income / revenue
- capex_margin = capex / revenue
- cfo_margin = cash_from_operations / revenue
- fcf_margin = free_cash_flow / revenue
- sbc_as_pct_revenue = share_based_compensation / revenue
- sbc_as_pct_cfo = share_based_compensation / cash_from_operations
- cfo_to_net_income_ratio = cash_from_operations / net_income
- dilution_yoy = diluted_shares_outstanding vs same quarter prior year

Rules:
- any denominator that is zero or null should yield null, not an artificial value
- negative values should be preserved; do not coerce sign away
- provenance must retain which quarter(s) were used

---

# 8. Derived TTM Metrics

For each stock, compute rolling TTM values using the latest 4 fiscal quarters:
- revenue_ttm_qhist
- gross_profit_ttm_qhist
- operating_income_ttm_qhist
- net_income_ttm_qhist
- capex_ttm_qhist
- cash_from_operations_ttm_qhist
- free_cash_flow_ttm_qhist
- sbc_ttm_qhist
- depreciation_and_amortization_ttm_qhist

Also compute TTM ratios:
- gross_margin_ttm_qhist
- operating_margin_ttm_qhist
- net_margin_ttm_qhist
- capex_margin_ttm_qhist
- cfo_margin_ttm_qhist
- fcf_margin_ttm_qhist
- cfo_to_net_income_ratio_ttm
- sbc_as_pct_revenue_ttm
- sbc_as_pct_cfo_ttm

---

# 9. Derived Fiscal-Year Rollups

For each completed fiscal year in the retained horizon, compute:
- revenue_fy
- gross_profit_fy
- operating_income_fy
- net_income_fy
- capex_fy
- cash_from_operations_fy
- free_cash_flow_fy
- diluted_shares_fy

Also compute:
- gross_margin_fy
- operating_margin_fy
- net_margin_fy
- capex_margin_fy
- cfo_margin_fy
- fcf_margin_fy
- cfo_to_net_income_ratio_fy

The purpose of FY rollups is:
- multi-year smoothing,
- easier annual comparisons,
- support for 3-year trend summaries.

---

# 10. Trend and Trajectory Metrics

This is the main product value of the new layer.

## 10.1 Margin trajectory metrics
Compute:
- gross_margin_trend_4q
- gross_margin_trend_8q
- operating_margin_trend_4q
- operating_margin_trend_8q
- fcf_margin_trend_4q
- fcf_margin_trend_8q
- cfo_margin_trend_4q
- cfo_margin_trend_8q

Definition:
- trend should be computed as slope or simple net change over the relevant quarter window,
- exact implementation can be finalized later, but the semantic meaning is directional change over time.

## 10.2 Margin stability metrics
Compute:
- gross_margin_stability_score
- operating_margin_stability_score
- fcf_margin_stability_score

Definition:
- lower quarter-to-quarter volatility = more stable,
- use normalized dispersion over the last 8 quarters where possible.

## 10.3 Operating leverage metrics
Compute:
- operating_leverage_ratio_4q = change in operating_income / change in revenue over last 4 quarters
- operating_leverage_ratio_8q = change in operating_income / change in revenue over last 8 quarters
- gross_profit_drop_through_4q = change in gross_profit / change in revenue over last 4 quarters
- operating_income_acceleration_flag
- operating_margin_expansion_flag
- operating_leverage_emerging_flag

Definition intent:
- identify whether additional revenue is increasingly translating into operating profit,
- identify whether operating margins are improving, especially from low or mediocre bases,
- identify early but persistent operating-leverage behavior.

## 10.4 Earnings quality trend metrics
Compute:
- cfo_to_net_income_stability_score
- fcf_conversion_trend_4q
- fcf_conversion_trend_8q
- earnings_quality_trend_score
- cash_earnings_support_flag
- deteriorating_cash_conversion_flag

Definition intent:
- reward cases where accounting earnings are well supported by cash generation,
- penalize cases where reported earnings improve but cash support weakens,
- identify improving or deteriorating quality over time.

## 10.5 Dilution metrics
Compute:
- diluted_share_growth_1y
- diluted_share_growth_3y
- sbc_burden_score
- material_dilution_trend_flag

Definition intent:
- measure shareholder dilution over time,
- measure SBC burden relative to economics,
- identify whether apparent earnings strength is being offset by dilution.

## 10.6 Capital intensity metrics
Compute:
- capex_intensity_trend_4q
- capex_intensity_trend_8q
- maintenance_capital_burden_proxy
- reinvestment_burden_signal

Definition intent:
- distinguish asset-light from high-reinvestment businesses,
- improve interpretation of operating profit and free cash flow quality.

---

# 11. Classifier-Facing Derived Fields

EPIC-004 should not have to interpret raw quarter tables directly.

The data layer should expose classifier-facing derived fields such as:
- operating_margin_trend_4q
- operating_margin_trend_8q
- operating_margin_stability_score
- fcf_conversion_trend_4q
- fcf_conversion_trend_8q
- cfo_to_net_income_ratio_ttm
- cfo_to_net_income_stability_score
- operating_leverage_ratio_4q
- operating_leverage_ratio_8q
- operating_leverage_emerging_flag
- gross_profit_drop_through_4q
- diluted_share_growth_1y
- diluted_share_growth_3y
- sbc_burden_score
- material_dilution_trend_flag
- capex_intensity_trend_4q
- reinvestment_burden_signal
- earnings_quality_trend_score
- cash_earnings_support_flag
- deteriorating_cash_conversion_flag

These fields are intended to become explicit inputs to classification and confidence logic.

---

# 12. How the Data Will Be Used

## 12.1 Use in earnings quality assessment
Current earnings quality is too dependent on point-in-time indicators like:
- current fcf_conversion,
- current moat score,
- current profitability state.

The new layer should allow earnings quality assessment to consider:
- whether margins are stable or volatile,
- whether free cash flow conversion is improving or worsening,
- whether cash from operations supports reported net income,
- whether cash generation persists across quarters,
- whether SBC burden meaningfully weakens shareholder economics,
- whether dilution is materially offsetting operational improvement.

### Resulting product behavior
A stock should score better on earnings quality when:
- gross/operating/FCF margins are stable or improving,
- CFO supports net income,
- FCF conversion is persistently healthy,
- SBC burden is manageable,
- dilution is modest,
- quality is not deteriorating across the quarter history.

A stock should score worse on earnings quality when:
- margins are unstable or deteriorating,
- net income is not backed by cash,
- FCF conversion is noisy or falling,
- SBC burden is high,
- dilution is significant,
- recent quarters show worsening quality.

## 12.2 Use in operating leverage assessment
Current operating leverage logic is too static.

The new layer should allow the system to determine whether:
- operating margin is expanding,
- operating income is growing faster than revenue,
- fixed-cost leverage is appearing,
- gross profit growth is increasingly dropping through to operating profit,
- losses are narrowing consistently in immature businesses.

### Resulting product behavior
A stock should be more likely to be treated as an operating-leverage name when:
- operating margin trend is positive,
- operating leverage ratio is positive and meaningful,
- operating profit is scaling faster than revenue,
- the change is not just one anomalous quarter,
- multiple recent quarters point in the same direction.

A stock should be less likely to be treated as an operating-leverage name when:
- margin expansion is absent,
- revenue grows without operating leverage,
- profitability remains erratic,
- progress is one-quarter noise rather than a trend.

## 12.3 Use in classification confidence
The new layer should improve confidence by distinguishing:
- trend-supported classifications,
- noisy classifications resting on a single period,
- deteriorating names whose static snapshot still looks acceptable.

Examples:
- a stock with acceptable current FCF conversion but worsening last-6-quarter trend should likely get lower confidence,
- a stock with moderate current profitability but very strong operating-leverage emergence may justify higher confidence in a Bucket 5 direction,
- a stock with improving net income but weak CFO support should see earnings-quality confidence reduced.

---

# 13. Data Source Strategy

## 13.1 Required source categories
This PRD assumes the raw quarterly history can be sourced from the existing data-provider stack.

Priority is:
1. structured historical fundamentals source already available in provider stack,
2. same provider for consistency where possible,
3. fallback only where necessary.

## 13.2 Source requirements
The source must provide or allow derivation of:
- quarterly periodized financial statements,
- enough metadata to identify fiscal periods correctly,
- stable historical coverage for the last 12 quarters,
- enough consistency to support automated derived-field computation.

## 13.3 Provenance requirements
For every raw and derived field, provenance should preserve:
- provider
- source statement type
- fiscal periods used
- calculation method
- synced_at
- fallback_used if applicable

---

# 14. Storage Model Requirements

## 14.1 Raw quarterly history table
A new table or equivalent storage layer should exist for per-stock quarterly financial history.

Minimum conceptual shape:
- ticker
- fiscal_year
- fiscal_quarter
- fiscal_period_end_date
- reported_date
- revenue
- gross_profit
- operating_income
- net_income
- capex
- cash_from_operations
- free_cash_flow
- share_based_compensation
- depreciation_and_amortization
- diluted_shares_outstanding
- provenance metadata

Primary key should prevent duplicate quarter rows per stock/provider-period.

## 14.2 Derived quarterly / trend fields
Derived metrics may be:
- stored in separate derived tables,
- stored in the `stocks` table for current classifier-facing outputs,
- or both.

The key requirement is that EPIC-004 has efficient access to current derived features.

## 14.3 Fiscal-year reconciliation
The system must preserve:
- fiscal-year alignment,
- quarter sequencing,
- ability to reconstruct TTM views,
- ability to compare same-quarter year-over-year.

---

# 15. Functional Requirements

## 15.1 Historical ingestion
The system must ingest quarterly financial history for each eligible stock.

## 15.2 Period normalization
The system must correctly assign each row to fiscal year / fiscal quarter.

## 15.3 Derived computation
The system must compute all required derived metrics after historical ingestion updates.

## 15.4 Current-feature publication
The system must publish the current classifier-facing derived fields for each stock.

## 15.5 Missing-data handling
If some quarterly history is unavailable:
- raw missing data must not crash the pipeline,
- derived features should become null where appropriate,
- provenance should show insufficiency,
- classification can reduce confidence instead of inventing certainty.

---

# 16. Non-Functional Requirements

## 16.1 Deterministic computation
Given the same raw inputs and the same fiscal history, derived metrics must be deterministic.

## 16.2 Explainability
Every derived field used in classification should be traceable to source periods and formulas.

## 16.3 Incremental refresh
The history layer should be refreshable incrementally without recomputing the whole universe unnecessarily.

## 16.4 Auditability
When a classification changes because trajectory fields changed, it should be possible to inspect the data basis.

---

# 17. Acceptance Criteria

## Data collection
- [ ] Last 12 fiscal quarters are collected per stock where available
- [ ] Fiscal year / quarter metadata is stored and correct
- [ ] Required raw fields are present for each retained quarter where source coverage exists

## Derived metrics
- [ ] Per-quarter margins and ratio metrics are computed
- [ ] TTM rollups are computed
- [ ] Fiscal-year rollups are computed
- [ ] Operating leverage metrics are computed
- [ ] Earnings quality trend metrics are computed
- [ ] Dilution and SBC metrics are computed
- [ ] Capital intensity trend metrics are computed

## Classification support
- [ ] EPIC-004-consumable derived fields are exposed in a structured form
- [ ] Missing or partial history yields null or lower-confidence outputs rather than errors
- [ ] Provenance exists for raw and derived fields

---

# 18. Risks

## 18.1 Provider inconsistency
Historical fields may not be consistently available for all names.

## 18.2 Fiscal-period misalignment
Incorrect quarter labeling would poison all trend logic.

## 18.3 Overfitting classifier logic to noisy trends
Quarter-level metrics can be noisy; classifier use must remain conservative.

## 18.4 False precision
A derived trend score should not imply more certainty than the source data supports.

---

# 19. Open Design Questions

These should be resolved later in RFC / ADR / story work:
- exact formulas for trend and stability scores,
- where derived metrics should be stored,
- whether some classifier-facing trend fields should be booleans vs numeric scores,
- recomputation cadence for quarterly history vs derived features,
- whether some of these fields should affect bucket scoring, EQ scoring, confidence, or all three.

---

# 20. Recommended Decomposition Impact

## EPIC-003 impact
Add or extend stories to cover:
- quarterly history ingestion,
- fiscal-period reconciliation,
- raw quarterly storage,
- derived trend/trajectory computation,
- classifier-facing feature publication.

## EPIC-004 impact
Add or extend stories to cover:
- consumption of new trajectory / earnings-quality fields,
- revised earnings-quality logic,
- revised operating-leverage logic,
- revised confidence logic where trend quality matters.

---

# 21. Summary

This PRD adds a new quarterly-history-driven evidence layer to the system.

It does not try to turn the classifier into a full-blown research engine.
Instead, it gives the system the minimum serious trend data it needs to make better first-pass judgments about:
- earnings quality,
- emerging operating leverage,
- margin durability,
- dilution-adjusted progress,
- classification confidence.

That is the intended role of this capability.

