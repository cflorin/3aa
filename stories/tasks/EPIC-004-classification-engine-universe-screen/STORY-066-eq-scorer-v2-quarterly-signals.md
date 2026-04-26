# STORY-066 — EQ Scorer v2: Quarterly-Driven Earnings Quality Signals

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Upgrade the Earnings Quality (EQ) scorer to use quarterly-derived signals when `quarters_available >= 4`, replacing the interim proxy signals (`EQ_EPS_DECLINING`, `EQ_EPS_REV_SPREAD_MODERATE/SEVERE`) with accurate CFO/NI trend, FCF trend, and accruals signals from `stock_derived_metrics`. Proxy signals are retained as fallback when quarterly data is unavailable (< 4 quarters).

## Story
As the **classification engine**,
I want **the EQ scorer to consume quarterly-derived earnings quality signals when available**,
so that **EQ ratings reflect actual cash-flow and accruals trends rather than proxy approximations when quarterly history is present**.

## Outcome
- EQ scorer updated in `src/modules/classification-engine/scorers/earnings-quality.scorer.ts`
- When `trend_metrics` present and `quarters_available >= 4`: uses `earnings_quality_trend_score`, `deteriorating_cash_conversion_flag`, FCF trend fields from `ClassificationTrendMetrics` to drive EQ scoring
- When `trend_metrics` absent or `quarters_available < 4`: falls back to existing proxy signals (`EQ_EPS_DECLINING`, spread signals) — ADR-013 interim label remains
- EQ signal mapping: `earnings_quality_trend_score < -0.30` → negative EQ pressure; `earnings_quality_trend_score > 0.30` → positive EQ signal; `deteriorating_cash_conversion_flag = true` → negative EQ flag (analogous to existing `EQ_CASH_FLOW_NEGATIVE` logic)
- `operating_leverage_emerging_flag` from `trend_metrics` used as EQ complement signal (positive operating leverage as quality indicator)
- Scoring thresholds defined; A/B/C/D outcome mapping documented in scorer
- Existing unit tests for proxy-signal paths continue to pass; new unit tests cover quarterly-signal paths and graceful degradation

## Scope In
- `src/modules/classification-engine/scorers/earnings-quality.scorer.ts`
- Signal branching: quarterly path (`quarters_available >= 4`) vs proxy path (`< 4` or absent)
- `earnings_quality_trend_score` mapped to EQ score contribution
- `deteriorating_cash_conversion_flag` mapped as negative EQ flag
- `operating_leverage_emerging_flag` as positive EQ complement
- Graceful degradation: `trend_metrics` absent or `quarters_available < 4` → proxy path unchanged

## Scope Out
- Balance sheet scorer dilution enhancements — STORY-067
- Bucket scorer changes — STORY-068
- Confidence trajectory penalty — STORY-069
- ADR-013 interim label amendment (separate editorial task after these stories complete)

## Dependencies
- **Epic:** EPIC-004
- **RFCs:** RFC-001 Amendment 2026-04-25, RFC-008 §Use in All Three Scorers
- **ADRs:** ADR-013 Amendment 2026-04-25 (EQ proxy signals interim; quarterly signals primary when available)
- **Upstream:** STORY-065 (ClassificationTrendMetrics wired into ClassificationInput), STORY-062 (trend metrics populated)

## Preconditions
- `ClassificationTrendMetrics` type defined and wired into `ClassificationInput.trend_metrics` (STORY-065)
- `earnings_quality_trend_score`, `deteriorating_cash_conversion_flag`, `operating_leverage_emerging_flag` fields available in `ClassificationTrendMetrics`
- Existing EQ scorer with proxy signal paths

## Inputs
- `ClassificationInput.trend_metrics?.earnings_quality_trend_score`
- `ClassificationInput.trend_metrics?.deteriorating_cash_conversion_flag`
- `ClassificationInput.trend_metrics?.operating_leverage_emerging_flag`
- `ClassificationInput.trend_metrics?.quarters_available`
- Existing proxy signals (for fallback path)

## Outputs
- EQ score with quarterly-accurate signals when available
- Same EQ score interface as today (no breaking change to scorer output shape)

## Acceptance Criteria
- [ ] When `quarters_available >= 4`: `earnings_quality_trend_score < -0.30` reduces EQ score
- [ ] When `quarters_available >= 4`: `deteriorating_cash_conversion_flag = true` contributes negative EQ signal
- [ ] When `quarters_available < 4` or `trend_metrics` absent: proxy signals used unchanged
- [ ] Fallback path passes all existing EQ scorer unit tests without modification
- [ ] New quarterly path tested: positive trend score → improved EQ; negative trend + flag → degraded EQ; null trend_metrics → proxy path taken
- [ ] No crash when `trend_metrics` is undefined
- [ ] Scorer output shape unchanged (no new required fields in return type)

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 Amendment 2026-04-25, RFC-008 §Use in All Three Scorers
- ADR: ADR-013 Amendment 2026-04-25 (interim EQ proxy signal label)
