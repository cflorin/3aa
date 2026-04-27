# EPIC-008 — Valuation Regime Decoupling

## Status
planned

## Purpose

EPIC-005 introduced a working valuation engine but with a critical limitation: the metric and thresholds were derived from the 3AA code (bucket + EQ + BS grades). This means a 5AA semiconductor with 65% operating margins and a 5AA stable-income business receive identical treatment — the same metric, the same thresholds, the same regime. The code captures _quality_, not _earnings structure_.

EPIC-008 decouples valuation regime from the code. A new `valuation_regime` field (one of 9 values) becomes the single coupling point between classification and threshold assignment. The regime is determined by a deterministic rule engine (ADR-017) that reads the stock's financial characteristics: profitability, margins, FCF conversion, growth, cyclicality, and structural flags. Cyclical names get an additional two-dimensional overlay (ADR-018) based on structural cyclicality score and cycle position — distinguishing NVIDIA from Micron from Ford.

## Baseline References
- **ADR-017** — Valuation Regime Selection Logic (regime selector steps 0A–6)
- **ADR-018** — Cyclical Overlay Framework (structural_cyclicality_score, cycle_position, overlay matrix)
- **ADR-005 (amended 2026-04-27)** — Threshold Management: regime-keyed `ValuationRegimeThreshold` table replaces code-keyed `anchored_thresholds`
- **RFC-003 (amended 2026-04-27)** — Valuation Engine Architecture: updated interfaces, growth tier overlay, cyclical overlay, regime selector pseudocode
- **RFC-001/RFC-002 (amended 2026-04-27)** — Schema extensions: new fields on `stock` and `valuation_state`

## Stories

| ID | Story | Status |
|----|-------|--------|
| STORY-089 | Schema Migration — Regime Decoupling + ValuationRegimeThreshold Seed | planned |
| STORY-090 | Bank Flag Derivation (Deterministic Classification Flag) | planned |
| STORY-091 | CyclicalScoreService — structural_cyclicality_score + cycle_position | planned |
| STORY-092 | RegimeSelectorService — selectRegime() Implementation | planned |
| STORY-093 | ThresholdAssigner Regime Decoupling (Growth Tier + Cyclical Overlay) | planned |
| STORY-094 | Valuation Pipeline Integration | planned |
| STORY-095 | Stock Detail Page — Regime & Cyclicality Display | planned |
| STORY-096 | EPIC-008 Regression & Integration Tests | planned |

## Dependencies

- **EPIC-005 ✅** — Valuation engine, persistence, batch job, zone assigner, TSR hurdle all exist
- **EPIC-004 ✅** — Classification engine provides `suggested_code`, all classification flags
- **EPIC-003.1 ✅** — `ClassificationEnrichmentScore` provides `marginDurabilityScore` and `pricingPowerScore` for CyclicalScoreService LLM modifier
- **RFC-008 / EPIC-003 quarterly history** — `stock_quarterly_history` must be populated for CyclicalScoreService (STORY-091 degrades gracefully when history is absent)

## Execution Order

Stories must execute in dependency order:

1. **STORY-089** (schema) — unblocks everything else
2. **STORY-090** (bank flag) — depends on schema; unblocks regime selector
3. **STORY-091** (cyclical score) — depends on schema; unblocks pipeline integration
4. **STORY-092** (regime selector) — depends on schema + bank flag; unblocks threshold assigner
5. **STORY-093** (threshold assigner) — depends on regime selector + schema; central domain change
6. **STORY-094** (pipeline integration) — depends on STORY-091–093; wires everything together
7. **STORY-095** (UI) — depends on STORY-094 (regime/cyclical fields in DB)
8. **STORY-096** (regression tests) — depends on STORY-094 complete; validates golden-set

## V1 Scope Boundary

**In scope:**
- All 9 valuation regimes and the regime selector rule engine
- `bank_flag` derivation (deterministic, SIC-based)
- `structural_cyclicality_score` (0–3) and `cycle_position` (5 values)
- Growth tier overlay for `profitable_growth_pe` (high/mid/standard)
- Cyclical overlay for `profitable_growth_pe` (Case A) and `cyclical_earnings` (Case B)
- `ValuationRegimeThreshold` DB table replacing code-keyed `anchored_thresholds`
- Updated `valuation_state_status` vocabulary (5 states: classification_required / not_applicable / manual_required / computed / stale)
- Regime and cyclicality display on Stock Detail Valuation tab
- `valuation_regime` filter on Universe Screen

**Out of scope:**
- `financial_special_case` manual input UI (the regime is assigned; the user inputs normalised earnings via the existing manual override mechanism)
- Automated mid-cycle earnings estimation (user sets `current_multiple_basis = 'mid_cycle'` manually)
- The `anchored_thresholds` table is superseded but retained for backward compatibility; no hard deletion in V1
- STORY-074 (Bulk CSV Import) — remains deferred
- EPIC-006 (Monitoring) and EPIC-007 (User Preferences) — separate epics

## Integration Checkpoint Criteria

EPIC-008 is complete when ALL of the following are true:

1. **Regime selector correct** — Golden-set stocks route to expected regimes: NVDA → `profitable_growth_pe`, WMT → `mature_pe`, MU → `cyclical_earnings`, JPM → `manual_required` (bank_flag), BRK → `financial_special_case`
2. **Growth tier overlay correct** — NVDA (70% fwd growth) uses high-tier thresholds (36/30/24/18 base); standard-tier stock (22% growth, A/A) uses 26/22/19/16 base
3. **Cyclical overlay correct** — NVDA (score=2, normal cycle, A/A) → base minus 4.0 turns → 32/26/20/14
4. **Bank stocks blocked** — JPM, BAC, GS, MS all resolve to `manual_required`; no automated thresholds computed
5. **Status vocabulary** — `valuation_state_status` uses 5-state canonical vocabulary; no 'ready' or 'missing_data' in new records
6. **Recomputation triggers** — changing `structural_cyclicality_score` or `cycle_position` triggers valuation recompute on next batch run
7. **UI displays regime** — Stock Detail Valuation tab shows `valuation_regime`, growth tier (where applicable), cycle position, cyclical overlay value
8. **All 1568+ prior tests pass** — no regression in EPIC-003/004/005 test suites
9. **EPIC-008 unit tests passing** — all new story unit tests pass
