// EPIC-008: Valuation Regime Decoupling
// STORY-092: RegimeSelectorService — selectRegime() Implementation
// TASK-092-001: RegimeSelectorInput type (in types.ts)
// TASK-092-002: selectRegime() pure function — ADR-017 Steps 0A–6

import type { ValuationRegime, RegimeSelectorInput } from './types';
import { parseBucket } from './metric-selector';

// Precedence rationale (ADR-017):
// 1. Bucket 8 first — no model for lottery stocks
// 2. Bank flag before other special cases — banks fully outside framework
// 3. Insurer/holding company before income tests — non-standard earnings bases
// 4. Sales-valued path before PE — unprofitable names must not reach PE regimes
// 5. Step 2 before Step 3 — NVIDIA-like qualify Step 2 before cyclical routing
// 6. Step 4 before Step 5 — transitional growth names get EV/EBIT not mature PE

export function selectRegime(input: RegimeSelectorInput): ValuationRegime {
  const bucket = parseBucket(input.activeCode);

  // ── ADR-017 Step 0A: Bucket 8 — no stable metric ─────────────────────────
  if (bucket === 8) return 'not_applicable';

  // ── ADR-017 Step 0B: Bank flag — fully outside framework ─────────────────
  if (input.bankFlag) return 'manual_required';

  // ── ADR-017 Step 0C: Insurer flag — non-standard earnings basis ───────────
  if (input.insurerFlag) return 'financial_special_case';

  // ── ADR-017 Step 0D: Holding company flag — non-standard earnings basis ───
  if (input.holdingCompanyFlag) return 'financial_special_case';

  // Derived helpers — computed inline; no separate pass through input required
  const netIncomePositive = input.netIncomeTtm !== null && input.netIncomeTtm > 0;
  const fcfPositive = input.freeCashFlowTtm !== null && input.freeCashFlowTtm > 0;

  // ── ADR-017 Step 1: Sales-valued path ────────────────────────────────────
  // Fires for unprofitable, low-margin + high-growth, or pre-operating-leverage stocks.
  // Note: op_margin < 0.10 requires rev_growth >= 0.10 to fire (WMT fix: 4.47% margin but 5% growth → does NOT fire)
  const step1Fires =
    !netIncomePositive ||
    (input.operatingMarginTtm !== null &&
      input.operatingMarginTtm < 0.10 &&
      input.revenueGrowthFwd !== null &&
      input.revenueGrowthFwd >= 0.10) ||
    input.preOperatingLeverageFlag;

  if (step1Fires) {
    if (
      input.revenueGrowthFwd !== null &&
      input.revenueGrowthFwd >= 0.40 &&
      input.grossMarginTtm !== null &&
      input.grossMarginTtm >= 0.70
    ) {
      return 'sales_growth_hyper';
    }
    return 'sales_growth_standard';
  }

  // ── ADR-017 Step 2: Profitable high-growth PE ─────────────────────────────
  // Score-3 override: if cyclicality score = 3, re-route to cyclical_earnings even if all Step 2 conditions met.
  const step2Conditions =
    input.revenueGrowthFwd !== null &&
    input.revenueGrowthFwd >= 0.20 &&
    input.operatingMarginTtm !== null &&
    input.operatingMarginTtm >= 0.25 &&
    netIncomePositive &&
    fcfPositive &&
    input.fcfConversionTtm !== null &&
    input.fcfConversionTtm >= 0.60;

  if (step2Conditions) {
    // Score-3 forces re-route to cyclical_earnings (semiconductor-like with extreme cyclicality)
    if (input.structuralCyclicalityScore >= 3) return 'cyclical_earnings';
    return 'profitable_growth_pe';
  }

  // ── ADR-017 Step 3: Cyclical earnings ─────────────────────────────────────
  if (
    input.structuralCyclicalityScore >= 1 &&
    netIncomePositive &&
    input.operatingMarginTtm !== null &&
    input.operatingMarginTtm >= 0.10
  ) {
    return 'cyclical_earnings';
  }

  // ── ADR-017 Step 4: Profitable transitional EV/EBIT ──────────────────────
  if (
    input.revenueGrowthFwd !== null &&
    input.revenueGrowthFwd >= 0.15 &&
    netIncomePositive &&
    fcfPositive &&
    input.operatingMarginTtm !== null &&
    input.operatingMarginTtm >= 0.10 &&
    input.operatingMarginTtm < 0.25
  ) {
    return 'profitable_growth_ev_ebit';
  }

  // ── ADR-017 Step 5: Mature PE ─────────────────────────────────────────────
  if (netIncomePositive && fcfPositive) {
    return 'mature_pe';
  }

  // ── ADR-017 Step 6: Catch-all ─────────────────────────────────────────────
  return 'manual_required';
}
