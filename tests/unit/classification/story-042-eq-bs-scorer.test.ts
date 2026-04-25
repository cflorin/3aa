// EPIC-004: Classification Engine & Universe Screen
// STORY-042: Earnings Quality and Balance Sheet Quality Scoring
// TASK-042-004: Unit tests — per-rule, boundary, winner, contract, null, golden-set, determinism
// ADR-013 §Earnings Quality Scorer Point Weights; §Balance Sheet Scorer Point Weights

import { EarningsQualityScorer } from '../../../src/domain/classification/eq-scorer';
import { BalanceSheetQualityScorer } from '../../../src/domain/classification/bs-scorer';
import type { ClassificationInput } from '../../../src/domain/classification/types';
import {
  MSFT_EQ_GOLDEN_SCORES, MSFT_BS_GOLDEN_SCORES,
  UNH_EQ_GOLDEN_SCORES, UNH_BS_GOLDEN_SCORES,
} from './fixtures/eq-bs-scorer-golden';

// Null-safe builder — only set the fields you care about; everything else is null
function makeInput(overrides: Partial<ClassificationInput>): ClassificationInput {
  return {
    revenue_growth_fwd: null, revenue_growth_3y: null, eps_growth_fwd: null, eps_growth_3y: null,
    gross_profit_growth: null, operating_margin: null, fcf_margin: null, fcf_conversion: null,
    roic: null, fcf_positive: null, net_income_positive: null,
    net_debt_to_ebitda: null, interest_coverage: null,
    moat_strength_score: null, pricing_power_score: null, revenue_recurrence_score: null,
    margin_durability_score: null, capital_intensity_score: null, qualitative_cyclicality_score: null,
    holding_company_flag: null, insurer_flag: null, cyclicality_flag: null,
    optionality_flag: null, binary_flag: null, pre_operating_leverage_flag: null,
    ...overrides,
  };
}

describe('EPIC-004/STORY-042/TASK-042-004: EQ and BS Scorers', () => {

  // ─── EQ Scorer ────────────────────────────────────────────────────────────

  describe('(a) EQ per-rule tests', () => {
    it('fcf_conversion=0.90 → scores.A includes EQ_FCF_STRONG (3)', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.90 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(3);
      expect(r.reason_codes).toContain('high_fcf_conversion');
    });

    it('fcf_conversion=0.65 → scores.B includes EQ_FCF_MODERATE (2)', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.65 }));
      expect(r.scores.B).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('moderate_fcf_conversion');
    });

    it('fcf_conversion=0.40 → scores.C includes EQ_FCF_WEAK (2)', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.40 }));
      expect(r.scores.C).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('weak_fcf_conversion');
    });

    it('fcf_positive=false → scores.C includes EQ_FCF_WEAK (2), reason fcf_not_positive', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.65, fcf_positive: false }));
      // moderate_fcf_conversion fires (to B), fcf_not_positive fires (to C)
      expect(r.scores.C).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('fcf_not_positive');
    });

    it('moat_strength_score=4.5 → scores.A includes EQ_MOAT_STRONG (2)', () => {
      const r = EarningsQualityScorer(makeInput({ moat_strength_score: 4.5 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('elite_moat');
    });

    it('moat_strength_score=3.0 → scores.B includes EQ_MOAT_MODERATE (1)', () => {
      const r = EarningsQualityScorer(makeInput({ moat_strength_score: 3.0 }));
      expect(r.scores.B).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('good_franchise');
    });

    it('moat_strength_score=2.0 → scores.C includes EQ_MOAT_WEAK (1)', () => {
      const r = EarningsQualityScorer(makeInput({ moat_strength_score: 2.0 }));
      expect(r.scores.C).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('weak_moat');
    });

    it('net_income_positive=true → scores.A and scores.B each +EQ_NI_POSITIVE (1)', () => {
      const r = EarningsQualityScorer(makeInput({ net_income_positive: true }));
      expect(r.scores.A).toBe(1);
      expect(r.scores.B).toBe(1);
      expect(r.reason_codes).toContain('real_earnings');
    });
  });

  describe('(b) EQ winner tests', () => {
    it('MSFT-like input → winner=A', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 1.43, moat_strength_score: 5.0, net_income_positive: true }));
      expect(r.winner).toBe('A');
      expect(r.scores.A).toBe(6); // FCF_STRONG(3) + MOAT_STRONG(2) + NI(1)
      expect(r.scores.B).toBe(1); // NI(1)
      expect(r.scores.C).toBe(0);
    });

    it('EQ-B winner: moderate FCF + moderate moat, no NI', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.65, moat_strength_score: 3.0 }));
      expect(r.winner).toBe('B');
      expect(r.scores.A).toBe(0);
      expect(r.scores.B).toBe(3); // FCF_MODERATE(2) + MOAT_MODERATE(1)
      expect(r.scores.C).toBe(0);
    });

    it('EQ-C winner: weak FCF + weak moat', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.40, moat_strength_score: 2.0 }));
      expect(r.winner).toBe('C');
      expect(r.scores.A).toBe(0);
      expect(r.scores.B).toBe(0);
      expect(r.scores.C).toBe(3); // FCF_WEAK(2) + MOAT_WEAK(1)
    });
  });

  describe('(c) EQ boundary tests', () => {
    it('fcf_conversion=0.80 → fires Moderate (B += 2), NOT Strong (A unchanged)', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.80 }));
      expect(r.scores.B).toBe(2);
      expect(r.scores.A).toBe(0);
      expect(r.reason_codes).toContain('moderate_fcf_conversion');
      expect(r.reason_codes).not.toContain('high_fcf_conversion');
    });

    it('fcf_conversion=0.8001 → fires Strong (A += 3), NOT Moderate', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.8001 }));
      expect(r.scores.A).toBe(3);
      expect(r.scores.B).toBe(0);
    });

    it('fcf_conversion=0.50 → fires Moderate (B += 2), NOT Weak (C unchanged)', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.50 }));
      expect(r.scores.B).toBe(2);
      expect(r.scores.C).toBe(0);
    });

    it('fcf_conversion=0.4999 → fires Weak (C += 2), NOT Moderate', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.4999 }));
      expect(r.scores.C).toBe(2);
      expect(r.scores.B).toBe(0);
    });

    it('moat_strength_score=4.0 → fires Strong (A += 2), NOT Moderate', () => {
      const r = EarningsQualityScorer(makeInput({ moat_strength_score: 4.0 }));
      expect(r.scores.A).toBe(2);
      expect(r.scores.B).toBe(0);
    });

    it('moat_strength_score=2.5 → fires Moderate (B += 1), NOT Weak', () => {
      const r = EarningsQualityScorer(makeInput({ moat_strength_score: 2.5 }));
      expect(r.scores.B).toBe(1);
      expect(r.scores.C).toBe(0);
    });

    it('moat_strength_score=2.4999 → fires Weak (C += 1), NOT Moderate', () => {
      const r = EarningsQualityScorer(makeInput({ moat_strength_score: 2.4999 }));
      expect(r.scores.C).toBe(1);
      expect(r.scores.B).toBe(0);
    });
  });

  describe('(d) EQ null and all-null tests', () => {
    it('all fields null → scores 0, missing_field_count=3, no exception', () => {
      const r = EarningsQualityScorer(makeInput({}));
      expect(r.scores.A).toBe(0);
      expect(r.scores.B).toBe(0);
      expect(r.scores.C).toBe(0);
      expect(r.missing_field_count).toBe(3);
      expect(r.winner).toBeNull();
    });

    it('fcf_conversion=null → FCF rules do not fire', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: null }));
      expect(r.reason_codes).not.toContain('high_fcf_conversion');
      expect(r.reason_codes).not.toContain('moderate_fcf_conversion');
      expect(r.reason_codes).not.toContain('weak_fcf_conversion');
    });

    it('moat_strength_score=null → moat rules do not fire', () => {
      const r = EarningsQualityScorer(makeInput({ moat_strength_score: null }));
      expect(r.reason_codes).not.toContain('elite_moat');
      expect(r.reason_codes).not.toContain('good_franchise');
      expect(r.reason_codes).not.toContain('weak_moat');
    });

    it('fcf_positive=null → fcf_not_positive rule does not fire', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_positive: null }));
      expect(r.reason_codes).not.toContain('fcf_not_positive');
    });

    it('missing_field_count=0 when all 3 primary EQ fields present', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.90, fcf_positive: true, net_income_positive: true }));
      expect(r.missing_field_count).toBe(0);
    });

    it('missing_field_count=3 when all 3 primary EQ fields null', () => {
      const r = EarningsQualityScorer(makeInput({}));
      expect(r.missing_field_count).toBe(3);
    });
  });

  describe('(e) EQ contract tests', () => {
    it('scores keys are exactly A, B, C', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.90 }));
      expect(Object.keys(r.scores).sort()).toEqual(['A', 'B', 'C']);
    });

    it('all score values are non-negative numbers', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.40, moat_strength_score: 2.0 }));
      for (const v of Object.values(r.scores)) {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });

    it('reason_codes is always an array of non-empty strings', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.90 }));
      expect(Array.isArray(r.reason_codes)).toBe(true);
      for (const code of r.reason_codes) {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      }
    });

    it('winner is null when all scores 0', () => {
      const r = EarningsQualityScorer(makeInput({}));
      expect(r.winner).toBeNull();
    });

    it('winner is one of A, B, C when scores > 0', () => {
      const r = EarningsQualityScorer(makeInput({ fcf_conversion: 0.90 }));
      expect(['A', 'B', 'C']).toContain(r.winner);
    });

    it('output shape has all required fields', () => {
      const r = EarningsQualityScorer(makeInput({}));
      expect(r).toHaveProperty('scores');
      expect(r).toHaveProperty('winner');
      expect(r).toHaveProperty('reason_codes');
      expect(r).toHaveProperty('missing_field_count');
    });
  });

  // ─── EQ E2/E3/E4 enrichment rules (BUG-CE-002) ───────────────────────────

  describe('(e2) EQ pricing_power, revenue_recurrence, margin_durability rules', () => {
    it('[BUG-CE-002] pricing_power_score=4.5 → scores.A += 2, reason strong_pricing_power', () => {
      const r = EarningsQualityScorer(makeInput({ pricing_power_score: 4.5 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('strong_pricing_power');
    });

    it('[BUG-CE-002] pricing_power_score=3.0 → scores.B += 1, reason moderate_pricing_power', () => {
      const r = EarningsQualityScorer(makeInput({ pricing_power_score: 3.0 }));
      expect(r.scores.B).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('moderate_pricing_power');
    });

    it('[BUG-CE-002] pricing_power_score=2.0 → scores.C += 1, reason weak_pricing_power', () => {
      const r = EarningsQualityScorer(makeInput({ pricing_power_score: 2.0 }));
      expect(r.scores.C).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('weak_pricing_power');
    });

    it('[BUG-CE-002] pricing_power_score=4.0 boundary → A (strong, not moderate)', () => {
      const r = EarningsQualityScorer(makeInput({ pricing_power_score: 4.0 }));
      expect(r.scores.A).toBe(2);
      expect(r.scores.B).toBe(0);
    });

    it('[BUG-CE-002] pricing_power_score=2.5 boundary → B (moderate, not weak)', () => {
      const r = EarningsQualityScorer(makeInput({ pricing_power_score: 2.5 }));
      expect(r.scores.B).toBe(1);
      expect(r.scores.C).toBe(0);
    });

    it('[BUG-CE-002] revenue_recurrence_score=4.5 → scores.A += 2, reason strong_revenue_recurrence', () => {
      const r = EarningsQualityScorer(makeInput({ revenue_recurrence_score: 4.5 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('strong_revenue_recurrence');
    });

    it('[BUG-CE-002] revenue_recurrence_score=2.0 → scores.C += 1, reason weak_revenue_recurrence', () => {
      const r = EarningsQualityScorer(makeInput({ revenue_recurrence_score: 2.0 }));
      expect(r.scores.C).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('weak_revenue_recurrence');
    });

    it('[BUG-CE-002] margin_durability_score=4.5 → scores.A += 2, reason strong_margin_durability', () => {
      const r = EarningsQualityScorer(makeInput({ margin_durability_score: 4.5 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('strong_margin_durability');
    });

    it('[BUG-CE-002] margin_durability_score=3.0 → scores.B += 1, reason moderate_margin_durability', () => {
      const r = EarningsQualityScorer(makeInput({ margin_durability_score: 3.0 }));
      expect(r.scores.B).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('moderate_margin_durability');
    });

    it('[BUG-CE-002] UBER-like input → winner=B (weak FCF context + moderate enrichment signals)', () => {
      // UBER: fcf_conversion=0.97→A(+3), moat=3.5→B(+1), NI→A(+1)B(+1), pricing=3.0→B(+1), recurrence=2.5→B(+1), margin_dur=3.0→B(+1)
      const r = EarningsQualityScorer(makeInput({
        fcf_conversion: 0.97,
        moat_strength_score: 3.5,
        net_income_positive: true,
        pricing_power_score: 3.0,
        revenue_recurrence_score: 2.5,
        margin_durability_score: 3.0,
      }));
      expect(r.winner).toBe('B');
    });

    it('[BUG-CE-002] pricing_power_score=null → E2 rule does not fire', () => {
      const r = EarningsQualityScorer(makeInput({ pricing_power_score: null }));
      expect(r.reason_codes).not.toContain('strong_pricing_power');
      expect(r.reason_codes).not.toContain('moderate_pricing_power');
      expect(r.reason_codes).not.toContain('weak_pricing_power');
    });
  });

  // ─── BS Scorer ────────────────────────────────────────────────────────────

  describe('(f) BS per-rule tests', () => {
    it('net_debt_to_ebitda=0.22 → scores.A includes BS_DEBT_LOW (3)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 0.22 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(3);
      expect(r.reason_codes).toContain('low_leverage');
    });

    it('net_debt_to_ebitda=-1.46 → scores.A includes DEBT_LOW (3) + NET_CASH_BONUS (1) = 4 (at minimum)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: -1.46 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(4);
      expect(r.reason_codes).toContain('low_leverage');
      expect(r.reason_codes).toContain('net_cash_position');
    });

    it('net_debt_to_ebitda=1.5 → scores.B includes BS_DEBT_MODERATE (2)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 1.5 }));
      expect(r.scores.B).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('manageable_leverage');
    });

    it('net_debt_to_ebitda=3.01 → scores.C includes BS_DEBT_HIGH (3)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 3.01 }));
      expect(r.scores.C).toBeGreaterThanOrEqual(3);
      expect(r.reason_codes).toContain('high_leverage');
    });

    it('interest_coverage=56.4 → scores.A includes BS_COVERAGE_STRONG (2)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: 56.4 }));
      expect(r.scores.A).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('high_interest_coverage');
    });

    it('interest_coverage=8.0 → scores.B includes BS_COVERAGE_MODERATE (1)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: 8.0 }));
      expect(r.scores.B).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('adequate_interest_coverage');
    });

    it('interest_coverage=4.5 → scores.C includes BS_COVERAGE_WEAK (2)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: 4.5 }));
      expect(r.scores.C).toBeGreaterThanOrEqual(2);
      expect(r.reason_codes).toContain('weak_interest_coverage');
    });

    it('capital_intensity_score=4.5 → scores.C includes BS_CAPITAL_INTENSITY (1)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ capital_intensity_score: 4.5 }));
      expect(r.scores.C).toBeGreaterThanOrEqual(1);
      expect(r.reason_codes).toContain('high_capital_intensity');
    });
  });

  describe('(g) BS winner tests', () => {
    it('MSFT-like: net_debt=0.22, coverage=56.4 → winner=A', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 0.22, interest_coverage: 56.4 }));
      expect(r.winner).toBe('A');
      expect(r.scores.A).toBe(5); // DEBT_LOW(3) + COVERAGE_STRONG(2)
      expect(r.scores.B).toBe(0);
      expect(r.scores.C).toBe(0);
    });

    it('net cash position: net_debt=-1.46, coverage=16.43 → winner=A, scores.A=6', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: -1.46, interest_coverage: 16.43 }));
      expect(r.winner).toBe('A');
      expect(r.scores.A).toBe(6); // DEBT_LOW(3) + NET_CASH_BONUS(1) + COVERAGE_STRONG(2)
    });

    it('UNH-like: net_debt=3.01, coverage=4.48 → winner=C', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 3.01, interest_coverage: 4.48 }));
      expect(r.winner).toBe('C');
      expect(r.scores.A).toBe(0);
      expect(r.scores.B).toBe(0);
      expect(r.scores.C).toBe(5); // DEBT_HIGH(3) + COVERAGE_WEAK(2)
    });

    // [ADR-013 amendment 2026-04-25] regression: high debt must never tie-break to BS-A
    it('high debt + strong coverage → winner=C, not A (ADR-013 amendment)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 3.0, interest_coverage: 15.0 }));
      expect(r.winner).toBe('C');
      expect(r.scores.C).toBe(3); // DEBT_HIGH(3)
      expect(r.scores.A).toBe(2); // COVERAGE_STRONG(2)
      expect(r.scores.C).toBeGreaterThan(r.scores.A);
    });
  });

  describe('(h) BS boundary tests', () => {
    it('net_debt_to_ebitda=1.0 → Moderate fires (B += 2), Low does NOT (< 1.0 is false)', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 1.0 }));
      expect(r.scores.B).toBe(2);
      expect(r.scores.A).toBe(0);
      expect(r.reason_codes).toContain('manageable_leverage');
      expect(r.reason_codes).not.toContain('low_leverage');
    });

    it('net_debt_to_ebitda=0.9999 → Low fires (A += 3), Moderate does NOT', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 0.9999 }));
      expect(r.scores.A).toBe(3);
      expect(r.scores.B).toBe(0);
    });

    it('net_debt_to_ebitda=0.0 → Low fires (3) + Net Cash Bonus fires (1) → A gets 4', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 0.0 }));
      expect(r.scores.A).toBe(4);
      expect(r.reason_codes).toContain('low_leverage');
      expect(r.reason_codes).toContain('net_cash_position');
    });

    it('net_debt_to_ebitda=2.5 → Moderate fires (B += 2), High does NOT', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 2.5 }));
      expect(r.scores.B).toBe(2);
      expect(r.scores.C).toBe(0);
    });

    it('net_debt_to_ebitda=2.5001 → High fires (C += 3), Moderate does NOT', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 2.5001 }));
      expect(r.scores.C).toBe(3);
      expect(r.scores.B).toBe(0);
    });

    it('interest_coverage=12.0 → Moderate fires (B += 1), Strong does NOT', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: 12.0 }));
      expect(r.scores.B).toBe(1);
      expect(r.scores.A).toBe(0);
      expect(r.reason_codes).toContain('adequate_interest_coverage');
      expect(r.reason_codes).not.toContain('high_interest_coverage');
    });

    it('interest_coverage=12.0001 → Strong fires (A += 2), Moderate does NOT', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: 12.0001 }));
      expect(r.scores.A).toBe(2);
      expect(r.scores.B).toBe(0);
    });

    it('interest_coverage=5.0 → Moderate fires (B += 1), Weak does NOT', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: 5.0 }));
      expect(r.scores.B).toBe(1);
      expect(r.scores.C).toBe(0);
    });

    it('interest_coverage=4.9999 → Weak fires (C += 2), Moderate does NOT', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: 4.9999 }));
      expect(r.scores.C).toBe(2);
      expect(r.scores.B).toBe(0);
    });
  });

  describe('(i) BS null tests', () => {
    it('all fields null → scores 0, missing_field_count=2, no exception', () => {
      const r = BalanceSheetQualityScorer(makeInput({}));
      expect(r.scores.A).toBe(0);
      expect(r.scores.B).toBe(0);
      expect(r.scores.C).toBe(0);
      expect(r.missing_field_count).toBe(2);
      expect(r.winner).toBeNull();
    });

    it('net_debt_to_ebitda=null → leverage rules do not fire', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: null }));
      expect(r.reason_codes).not.toContain('low_leverage');
      expect(r.reason_codes).not.toContain('manageable_leverage');
      expect(r.reason_codes).not.toContain('high_leverage');
    });

    it('interest_coverage=null → coverage rules do not fire', () => {
      const r = BalanceSheetQualityScorer(makeInput({ interest_coverage: null }));
      expect(r.reason_codes).not.toContain('high_interest_coverage');
      expect(r.reason_codes).not.toContain('adequate_interest_coverage');
      expect(r.reason_codes).not.toContain('weak_interest_coverage');
    });

    it('capital_intensity_score=null → capital intensity rule does not fire', () => {
      const r = BalanceSheetQualityScorer(makeInput({ capital_intensity_score: null }));
      expect(r.reason_codes).not.toContain('high_capital_intensity');
    });

    it('missing_field_count=0 when both primary BS fields present', () => {
      const r = BalanceSheetQualityScorer(makeInput({ net_debt_to_ebitda: 0.22, interest_coverage: 56.4 }));
      expect(r.missing_field_count).toBe(0);
    });

    it('missing_field_count=2 when both primary BS fields null', () => {
      const r = BalanceSheetQualityScorer(makeInput({}));
      expect(r.missing_field_count).toBe(2);
    });
  });

  // ─── Golden-set regression ─────────────────────────────────────────────────

  describe('(j) Golden-set regression (from eq-bs-scorer-golden.ts)', () => {
    it('MSFT EQ: scores match MSFT_EQ_GOLDEN_SCORES', () => {
      const r = EarningsQualityScorer(makeInput({
        fcf_conversion: 1.43,
        moat_strength_score: 5.0,
        net_income_positive: true,
        fcf_positive: true,
      }));
      expect(r.scores.A).toBe(MSFT_EQ_GOLDEN_SCORES.A);
      expect(r.scores.B).toBe(MSFT_EQ_GOLDEN_SCORES.B);
      expect(r.scores.C).toBe(MSFT_EQ_GOLDEN_SCORES.C);
    });

    it('MSFT BS: scores match MSFT_BS_GOLDEN_SCORES', () => {
      const r = BalanceSheetQualityScorer(makeInput({
        net_debt_to_ebitda: 0.22,
        interest_coverage: 56.4,
      }));
      expect(r.scores.A).toBe(MSFT_BS_GOLDEN_SCORES.A);
      expect(r.scores.B).toBe(MSFT_BS_GOLDEN_SCORES.B);
      expect(r.scores.C).toBe(MSFT_BS_GOLDEN_SCORES.C);
    });

    it('UNH EQ: scores match UNH_EQ_GOLDEN_SCORES', () => {
      const r = EarningsQualityScorer(makeInput({
        fcf_conversion: 0.97,
        moat_strength_score: 4.0,
        net_income_positive: true,
        fcf_positive: true,
      }));
      expect(r.scores.A).toBe(UNH_EQ_GOLDEN_SCORES.A);
      expect(r.scores.B).toBe(UNH_EQ_GOLDEN_SCORES.B);
      expect(r.scores.C).toBe(UNH_EQ_GOLDEN_SCORES.C);
    });

    it('UNH BS: scores match UNH_BS_GOLDEN_SCORES', () => {
      const r = BalanceSheetQualityScorer(makeInput({
        net_debt_to_ebitda: 3.01,
        interest_coverage: 4.48,
      }));
      expect(r.scores.A).toBe(UNH_BS_GOLDEN_SCORES.A);
      expect(r.scores.B).toBe(UNH_BS_GOLDEN_SCORES.B);
      expect(r.scores.C).toBe(UNH_BS_GOLDEN_SCORES.C);
    });
  });

  // ─── Determinism ───────────────────────────────────────────────────────────

  describe('(k) Determinism', () => {
    it('100 runs with MSFT-like fixture → identical EarningsQualityScorer output', () => {
      const input = makeInput({ fcf_conversion: 1.43, moat_strength_score: 5.0, net_income_positive: true });
      const first = EarningsQualityScorer(input);
      for (let i = 0; i < 99; i++) {
        const r = EarningsQualityScorer(input);
        expect(r.scores.A).toBe(first.scores.A);
        expect(r.scores.B).toBe(first.scores.B);
        expect(r.scores.C).toBe(first.scores.C);
        expect(r.winner).toBe(first.winner);
        expect(r.reason_codes).toEqual(first.reason_codes);
      }
    });

    it('100 runs with UNH-like fixture → identical BalanceSheetQualityScorer output', () => {
      const input = makeInput({ net_debt_to_ebitda: 3.01, interest_coverage: 4.48 });
      const first = BalanceSheetQualityScorer(input);
      for (let i = 0; i < 99; i++) {
        const r = BalanceSheetQualityScorer(input);
        expect(r.scores.A).toBe(first.scores.A);
        expect(r.scores.B).toBe(first.scores.B);
        expect(r.scores.C).toBe(first.scores.C);
        expect(r.winner).toBe(first.winner);
        expect(r.reason_codes).toEqual(first.reason_codes);
      }
    });
  });
});
