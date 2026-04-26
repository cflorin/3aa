# STORY-067 — BS Scorer Dilution Trend Enhancement (`material_dilution_trend_flag`, `sbc_burden_score`)

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Upgrade the Balance Sheet (BS) scorer to use the quarterly-derived dilution trend flag and SBC burden score when quarterly history is available. The existing `material_dilution_flag` (based on point-in-time TTM SBC signal) is retained as fallback; the quarterly-derived `material_dilution_trend_flag` is preferred when `quarters_available >= 4`.

## Story
As the **classification engine**,
I want **the BS scorer to use trend-based dilution signals from `stock_derived_metrics` when quarterly data is available**,
so that **BS ratings reflect sustained dilution patterns rather than single-period snapshots when we have sufficient quarterly history**.

## Outcome
- BS scorer updated in `src/modules/classification-engine/scorers/balance-sheet.scorer.ts`
- When `trend_metrics` present and `quarters_available >= 4`: uses `material_dilution_trend_flag` (4-quarter diluted share growth > 3%) instead of `material_dilution_flag`
- `sbc_burden_score` (8-quarter normalized SBC/revenue, 0.0–1.0) contributes as additive negative signal when score > 0.50
- When `trend_metrics` absent or `quarters_available < 4`: falls back to existing `material_dilution_flag` (point-in-time) — coexistence period per RFC-008 §Balance Sheet Scorer
- Transition boundary: `quarters_available >= 4` is the switch point; both flags can coexist during transition (old flag retained in `classification_flags`, trend flag added alongside)
- Scorer output: `material_dilution_trend_flag` written to classification result flags when quarterly path active
- Existing BS scorer unit tests (proxy path) continue to pass unchanged

## Scope In
- `src/modules/classification-engine/scorers/balance-sheet.scorer.ts`
- `material_dilution_trend_flag` from `ClassificationTrendMetrics` as primary dilution signal (when available)
- `sbc_burden_score` as additive signal
- Fallback to existing `material_dilution_flag` when quarterly data absent
- `pre_operating_leverage_flag` remains in BS scorer scope (bucket scorer complement — unchanged)

## Scope Out
- EQ scorer changes — STORY-066
- Bucket scorer changes — STORY-068
- Confidence trajectory penalty — STORY-069
- Removing `material_dilution_flag` — deferred (coexistence period; no hard cutover in V1)

## Dependencies
- **Epic:** EPIC-004
- **RFCs:** RFC-001 Amendment 2026-04-25, RFC-008 §Balance Sheet Scorer
- **ADRs:** ADR-013 Amendment 2026-04-25
- **Upstream:** STORY-065 (ClassificationTrendMetrics wired), STORY-062 (dilution trend and SBC fields populated)

## Preconditions
- `ClassificationTrendMetrics` type includes `material_dilution_trend_flag`, `sbc_burden_score`, `quarters_available`
- STORY-065 wires `trend_metrics` into `ClassificationInput`
- Existing `material_dilution_flag` scorer path in place

## Inputs
- `ClassificationInput.trend_metrics?.material_dilution_trend_flag`
- `ClassificationInput.trend_metrics?.sbc_burden_score`
- `ClassificationInput.trend_metrics?.quarters_available`
- Existing `material_dilution_flag` from current `ClassificationInput` (for fallback)

## Outputs
- BS score with trend-based dilution signal when quarterly data available
- Classification result flag `material_dilution_trend_flag` emitted when quarterly path active
- Same BS scorer output shape (no breaking change)

## Acceptance Criteria
- [ ] When `quarters_available >= 4`: `material_dilution_trend_flag = true` drives BS score reduction
- [ ] When `quarters_available >= 4`: `sbc_burden_score > 0.50` adds negative BS signal
- [ ] When `quarters_available < 4` or `trend_metrics` absent: existing `material_dilution_flag` path used unchanged
- [ ] `pre_operating_leverage_flag` behavior unchanged (still in BS scorer scope)
- [ ] All existing BS scorer unit tests pass without modification
- [ ] New tests: quarterly dilution path (flag true/false), SBC burden boundary (0.50 threshold), fallback to point-in-time flag
- [ ] Scorer output shape unchanged (no new required fields in return type)

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 Amendment 2026-04-25, RFC-008 §Balance Sheet Scorer
- ADR: ADR-013 Amendment 2026-04-25
