// EPIC-004: Classification Engine & Universe Screen
// STORY-047: Classification Recompute Batch Job
// TASK-047-005: Unit tests — shouldRecompute (pure function) + route 401 guard
// RFC-001 §shouldRecompute; ADR-013 (5% threshold)

import { shouldRecompute } from '../../../src/domain/classification/recompute';
import type { ClassificationInput } from '../../../src/domain/classification/types';

// ── Base input factory ────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    revenue_growth_fwd: 0.10,
    revenue_growth_3y: 0.12,
    eps_growth_fwd: 0.08,
    eps_growth_3y: 0.09,
    gross_profit_growth: 0.11,
    operating_margin: 0.30,
    fcf_margin: 0.25,
    fcf_conversion: 0.85,
    roic: 0.20,
    fcf_positive: true,
    net_income_positive: true,
    net_debt_to_ebitda: 0.5,
    interest_coverage: 20.0,
    moat_strength_score: 4.0,
    pricing_power_score: 3.5,
    revenue_recurrence_score: 4.5,
    margin_durability_score: 3.5,
    capital_intensity_score: 2.0,
    qualitative_cyclicality_score: 2.0,
    holding_company_flag: false,
    insurer_flag: false,
    cyclicality_flag: false,
    optionality_flag: false,
    binary_flag: false,
    pre_operating_leverage_flag: false,
    ...overrides,
  };
}

describe('EPIC-004/STORY-047/TASK-047-005: shouldRecompute', () => {

  describe('(a) Null previous → always recompute', () => {
    it('previous=null → true (first classification)', () => {
      expect(shouldRecompute(makeInput(), null)).toBe(true);
    });
  });

  describe('(b) revenue_growth_fwd delta', () => {
    it('delta 6% (0.10 → 0.16) → true', () => {
      const prev = makeInput({ revenue_growth_fwd: 0.10 });
      const curr = makeInput({ revenue_growth_fwd: 0.16 });
      expect(shouldRecompute(curr, prev)).toBe(true);
    });

    it('delta exactly 5% (0.10 → 0.15) → false (boundary: not strictly greater)', () => {
      const prev = makeInput({ revenue_growth_fwd: 0.10 });
      const curr = makeInput({ revenue_growth_fwd: 0.15 });
      expect(shouldRecompute(curr, prev)).toBe(false);
    });

    it('delta 0.2% (0.10 → 0.102) → false', () => {
      const prev = makeInput({ revenue_growth_fwd: 0.10 });
      const curr = makeInput({ revenue_growth_fwd: 0.102 });
      expect(shouldRecompute(curr, prev)).toBe(false);
    });

    it('negative delta 6% (0.10 → 0.04) → true', () => {
      const prev = makeInput({ revenue_growth_fwd: 0.10 });
      const curr = makeInput({ revenue_growth_fwd: 0.04 });
      expect(shouldRecompute(curr, prev)).toBe(true);
    });
  });

  describe('(c) eps_growth_fwd delta', () => {
    it('delta 6% → true', () => {
      const prev = makeInput({ eps_growth_fwd: 0.08 });
      const curr = makeInput({ eps_growth_fwd: 0.14 });
      expect(shouldRecompute(curr, prev)).toBe(true);
    });

    it('delta 2% → false', () => {
      const prev = makeInput({ eps_growth_fwd: 0.08 });
      const curr = makeInput({ eps_growth_fwd: 0.10 });
      expect(shouldRecompute(curr, prev)).toBe(false);
    });
  });

  describe('(d) Flag changes', () => {
    it('binary_flag false→true → true', () => {
      const prev = makeInput({ binary_flag: false });
      const curr = makeInput({ binary_flag: true });
      expect(shouldRecompute(curr, prev)).toBe(true);
    });

    it('holding_company_flag null→true → true', () => {
      const prev = makeInput({ holding_company_flag: null });
      const curr = makeInput({ holding_company_flag: true });
      expect(shouldRecompute(curr, prev)).toBe(true);
    });

    it('cyclicality_flag true→false → true', () => {
      const prev = makeInput({ cyclicality_flag: true });
      const curr = makeInput({ cyclicality_flag: false });
      expect(shouldRecompute(curr, prev)).toBe(true);
    });

    it('pre_operating_leverage_flag changed → true', () => {
      const prev = makeInput({ pre_operating_leverage_flag: false });
      const curr = makeInput({ pre_operating_leverage_flag: true });
      expect(shouldRecompute(curr, prev)).toBe(true);
    });
  });

  describe('(e) No material change → skip', () => {
    it('identical inputs → false', () => {
      const base = makeInput();
      expect(shouldRecompute(base, { ...base })).toBe(false);
    });

    it('only non-monitored field changes (operating_margin) → false', () => {
      const prev = makeInput({ operating_margin: 0.30 });
      const curr = makeInput({ operating_margin: 0.20 });
      expect(shouldRecompute(curr, prev)).toBe(false);
    });
  });

  describe('(f) Null field handling', () => {
    it('both revenue_growth_fwd null → treated as 0 delta → false', () => {
      const prev = makeInput({ revenue_growth_fwd: null });
      const curr = makeInput({ revenue_growth_fwd: null });
      expect(shouldRecompute(curr, prev)).toBe(false);
    });

    it('prev null, curr 0.04 — delta 4% < 5% → false', () => {
      const prev = makeInput({ revenue_growth_fwd: null });
      const curr = makeInput({ revenue_growth_fwd: 0.04 });
      expect(shouldRecompute(curr, prev)).toBe(false);
    });
  });
});
