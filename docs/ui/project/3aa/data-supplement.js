// data-supplement.js — STORY-043/044 enrichment
// Patches STOCKS with tie-break results, confidence breakdown, and input_snapshot.
// Loaded after data.js — reads window.STOCKS and mutates in place.

const CLASSIFICATION_SUPPLEMENT = {
  MSFT: {
    tieBreaksFired: [
      {
        rule: "3v4",
        description: "Bucket 3 vs 4",
        winner: "4",
        condition: "fcf_conversion > 0.85 AND roic > 0.20",
        values: { fcf_conversion: 0.65, roic: 0.264 },
        outcome: "Bucket 4 selected — ROIC 26.4% clears 20% threshold; FCF conversion 65% is below 85% threshold but ROIC is decisive",
        marginAtTrigger: 0.8,
      },
    ],
    confidenceBreakdown: {
      scoreMargin: 45,
      tieBreakCount: 1,
      missingFieldCount: 0,
      steps: [
        { step: 1, label: "Null-suggestion gate", result: "pass", note: "missing_field_count = 0 ≤ 5" },
        { step: 2, label: "Score margin", raw: 45, band: "high", note: "Bucket 4 leads Bucket 3 by 45pts → margin ≥ 4 → high" },
        { step: 3, label: "Tie-break penalty", tieBreaks: 1, note: "1 tie-break applied (3v4) → degrades high → medium" },
        { step: 4, label: "Missing-field penalty", missing: 0, note: "0 missing → no penalty" },
      ],
      final: "medium",
    },
    inputSnapshot: {
      revenue_growth_fwd: 0.072, revenue_growth_3y: 0.144,
      eps_growth_fwd: 0.028, eps_growth_3y: 0.212,
      operating_margin: 0.49, fcf_conversion: 0.65, fcf_positive: true,
      net_income_positive: true, roic: 0.264,
      net_debt_ebitda: 0.22, interest_coverage: 56.4,
      moat_strength_score: 5.0, pricing_power_score: 4.5,
      revenue_recurrence_score: 4.5, margin_durability_score: 4.5,
      holding_company_flag: false, binary_flag: false,
      pre_operating_leverage_flag: false, cyclicality_flag: false,
    },
  },
  ADBE: {
    tieBreaksFired: [
      {
        rule: "3v4",
        description: "Bucket 3 vs 4",
        winner: "4",
        condition: "fcf_conversion > 0.85 AND roic > 0.20",
        values: { fcf_conversion: 1.43, roic: 0.589 },
        outcome: "Bucket 4 selected — FCF conversion 143% and ROIC 58.9% both clear thresholds decisively",
        marginAtTrigger: 0.6,
      },
    ],
    confidenceBreakdown: {
      scoreMargin: 31,
      tieBreakCount: 1,
      missingFieldCount: 0,
      steps: [
        { step: 1, label: "Null-suggestion gate", result: "pass", note: "missing_field_count = 0 ≤ 5" },
        { step: 2, label: "Score margin", raw: 31, band: "high", note: "Bucket 4 leads Bucket 3 by 31pts → margin ≥ 4 → high" },
        { step: 3, label: "Tie-break penalty", tieBreaks: 1, note: "1 tie-break applied (3v4) → degrades high → medium" },
        { step: 4, label: "Missing-field penalty", missing: 0, note: "0 missing → no penalty" },
      ],
      final: "medium",
    },
    inputSnapshot: {
      revenue_growth_fwd: 0.066, revenue_growth_3y: 0.108,
      eps_growth_fwd: 0.37, eps_growth_3y: 0.191,
      gross_margin: 0.90, operating_margin: 0.38,
      fcf_conversion: 1.43, fcf_positive: true, net_income_positive: true,
      roic: 0.589, net_debt_ebitda: 0.04, interest_coverage: 35.0,
      moat_strength_score: 4.5, pricing_power_score: 4.0,
      revenue_recurrence_score: 4.0, margin_durability_score: 4.5,
      holding_company_flag: false, binary_flag: false,
      pre_operating_leverage_flag: false, cyclicality_flag: false,
    },
  },
  TSLA: {
    tieBreaksFired: [
      {
        rule: "4v5",
        description: "Bucket 4 vs 5",
        winner: "5",
        condition: "pre_operating_leverage_flag = true",
        values: { pre_operating_leverage_flag: true },
        outcome: "Bucket 5 selected — pre_operating_leverage_flag active; investment thesis depends on margin recovery from 6%",
        marginAtTrigger: 0.3,
      },
      {
        rule: "5v6",
        description: "Bucket 5 vs 6",
        winner: "5",
        condition: "pre_operating_leverage_flag = true",
        values: { pre_operating_leverage_flag: true },
        outcome: "Bucket 5 preferred over 6 — flag present; Bucket 6 reserved for pure high-growth immature-profit cases",
        marginAtTrigger: 0.9,
      },
    ],
    confidenceBreakdown: {
      scoreMargin: 17,
      tieBreakCount: 2,
      missingFieldCount: 1,
      steps: [
        { step: 1, label: "Null-suggestion gate", result: "pass", note: "missing_field_count = 1 ≤ 5" },
        { step: 2, label: "Score margin", raw: 17, band: "high", note: "Bucket 5 leads Bucket 6 by 17pts → margin ≥ 4 → high" },
        { step: 3, label: "Tie-break penalty", tieBreaks: 2, note: "≥ 2 tie-breaks → force low (ADR-014)" },
        { step: 4, label: "Missing-field penalty", missing: 1, note: "1 missing → no additional penalty (< 3)" },
      ],
      final: "low",
    },
    inputSnapshot: {
      revenue_growth_fwd: 0.088, revenue_growth_3y: 0.052,
      eps_growth_fwd: 0.643, eps_growth_3y: -0.336,
      operating_margin: 0.06, fcf_conversion: 1.64,
      fcf_positive: true, net_income_positive: true,
      roic: 0.056, net_debt_ebitda: -1.46, interest_coverage: 16.4,
      moat_strength_score: 3.5, pricing_power_score: 2.5,
      qualitative_cyclicality_score: 4.5, capital_intensity_score: 4.5,
      holding_company_flag: false, binary_flag: false,
      pre_operating_leverage_flag: true, cyclicality_flag: true, optionality_flag: true,
    },
  },
  UBER: {
    tieBreaksFired: [
      {
        rule: "4v5",
        description: "Bucket 4 vs 5",
        winner: "5",
        condition: "pre_operating_leverage_flag = true (not set) — decided by margin recovery thesis",
        values: { pre_operating_leverage_flag: false, operating_margin: 0.12 },
        outcome: "Bucket 5 by clear score margin — not a tie-break trigger. Operating margin 12% recovering from near-zero = textbook operating leverage story.",
        marginAtTrigger: null,
      },
    ],
    confidenceBreakdown: {
      scoreMargin: 23,
      tieBreakCount: 0,
      missingFieldCount: 1,
      steps: [
        { step: 1, label: "Null-suggestion gate", result: "pass", note: "missing_field_count = 1 ≤ 5" },
        { step: 2, label: "Score margin", raw: 23, band: "high", note: "Bucket 5 leads Bucket 4 by 23pts → margin ≥ 4 → high" },
        { step: 3, label: "Tie-break penalty", tieBreaks: 0, note: "No tie-breaks triggered → no penalty" },
        { step: 4, label: "Missing-field penalty", missing: 1, note: "eps_growth_3y null → 1 missing → no penalty (< 3)" },
      ],
      final: "medium",
      note: "Confidence medium (not high) due to forward GAAP EPS -30.3% creating signal noise and cyclicality_flag complicating spot-multiple application.",
    },
    inputSnapshot: {
      revenue_growth_fwd: 0.122, revenue_growth_3y: 0.177,
      eps_growth_fwd: -0.303, eps_growth_3y: null,
      gross_profit_growth: 0.194, operating_margin: 0.12,
      fcf_conversion: 0.97, fcf_margin: 0.19,
      fcf_positive: true, net_income_positive: true,
      roic: 0.156, net_debt_ebitda: 0.40, interest_coverage: 14.0,
      moat_strength_score: 3.5, pricing_power_score: 2.5,
      revenue_recurrence_score: 2.0, qualitative_cyclicality_score: 3.5,
      holding_company_flag: false, binary_flag: false,
      pre_operating_leverage_flag: false, cyclicality_flag: true,
    },
  },
  UNH: {
    tieBreaksFired: [
      {
        rule: "1v3",
        description: "Bucket 1 vs 3 (non-standard)",
        winner: "3",
        condition: "3-year CAGR 11.3% vs fwd -1.6%; framework treats as cyclical not structural decline",
        values: { revenue_growth_3y: 0.113, revenue_growth_fwd: -0.016 },
        outcome: "Bucket 3 selected — 3-year CAGR overrides forward decline. Framework cites UNH as Bucket 3 canonical example with regulatory caveat.",
        marginAtTrigger: 0.7,
      },
    ],
    confidenceBreakdown: {
      scoreMargin: 16,
      tieBreakCount: 1,
      missingFieldCount: 0,
      steps: [
        { step: 1, label: "Null-suggestion gate", result: "pass", note: "missing_field_count = 0 ≤ 5" },
        { step: 2, label: "Score margin", raw: 16, band: "high", note: "Bucket 3 leads by 16pts → margin ≥ 4 → high" },
        { step: 3, label: "Tie-break penalty", tieBreaks: 1, note: "1 tie-break (1v3 forward-vs-historical tension) → degrades high → medium" },
        { step: 4, label: "Missing-field penalty", missing: 0, note: "0 missing → no penalty; BUT insurer_flag adds structural uncertainty note" },
      ],
      final: "low",
      note: "Final confidence forced to low by ADR-014 rule: when forward revenue is negative and conflicts with 3y CAGR, system emits low regardless of score margin — requires human judgment on cyclical vs structural.",
    },
    inputSnapshot: {
      revenue_growth_fwd: -0.016, revenue_growth_3y: 0.113,
      eps_growth_fwd: 0.347, eps_growth_3y: -0.148,
      operating_margin: 0.04, fcf_conversion: 1.33,
      fcf_positive: true, net_income_positive: true,
      roic: 0.091, net_debt_ebitda: 3.01, interest_coverage: 4.5,
      moat_strength_score: 4.0, pricing_power_score: 3.5,
      revenue_recurrence_score: 4.5, margin_durability_score: 3.5,
      holding_company_flag: false, binary_flag: false, insurer_flag: true,
      pre_operating_leverage_flag: false, cyclicality_flag: false,
    },
  },
};

// Patch STOCKS in place
if (window.STOCKS) {
  window.STOCKS = window.STOCKS.map(s => {
    const sup = CLASSIFICATION_SUPPLEMENT[s.ticker];
    return sup ? { ...s, ...sup } : s;
  });
}

Object.assign(window, { CLASSIFICATION_SUPPLEMENT });
