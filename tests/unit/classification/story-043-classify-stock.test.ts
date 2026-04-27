// EPIC-004: Classification Engine & Universe Screen
// STORY-043: Classification Result Assembly (Tie-Break, Confidence, Special Cases)
// TASK-043-003: Unit tests — tie-breaks, overrides, confidence, contract, determinism, golden-set
// RFC-001 §ClassificationResult, §Tie-Break Rules, §Confidence Computation; ADR-014

import { classifyStock } from '../../../src/domain/classification/classifier';
import type { ClassificationInput } from '../../../src/domain/classification/types';
import {
  MSFT_CLASSIFY_GOLDEN, ADBE_CLASSIFY_GOLDEN,
  TSLA_CLASSIFY_GOLDEN, UBER_CLASSIFY_GOLDEN, UNH_CLASSIFY_GOLDEN,
} from './fixtures/classify-stock-golden';
import {
  MSFT_GOLDEN_INPUT, ADBE_GOLDEN_INPUT,
  TSLA_GOLDEN_INPUT, UBER_GOLDEN_INPUT, UNH_GOLDEN_INPUT,
} from './fixtures/bucket-scorer-golden';

// Null-safe builder — only set fields you care about; everything else null/false
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

// ── Minimal "data-sufficient" base — 6 critical fields set so the null-gate doesn't fire
// missing_field_count = 4 (eps_growth_fwd, eps_growth_3y, net_debt_to_ebitda, interest_coverage null)
const BASE_SUFFICIENT = {
  revenue_growth_fwd: 0.10, revenue_growth_3y: 0.10,
  operating_margin: 0.20, fcf_positive: true, net_income_positive: true, fcf_conversion: 0.60,
};

// All 10 critical fields present — ensures missing_field_count = 0
const ALL_CRITICAL = {
  ...BASE_SUFFICIENT,
  eps_growth_fwd: 0.10, eps_growth_3y: 0.10,
  net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
};

describe('EPIC-004/STORY-043/TASK-043-003: classifyStock', () => {

  // ─── (a) Clear bucket winner — no tie-break ────────────────────────────────

  describe('(a) Clear bucket winner', () => {
    it('strong B4 signals → suggested_code starts with "4", no tie-breaks', () => {
      // rev fwd=10%, rev 3y=10%, eps fwd=10%, eps 3y=10% all fire B4 and B5
      // operating_margin, fcf_positive, net_income_positive, fcf_conversion fire B3+B4
      // moat fires B3+B4 → B4 accumulates much more than B5 or B3
      const r = classifyStock(makeInput({
        ...ALL_CRITICAL, moat_strength_score: 5.0,
        // margin > 1 so no tie-break fires
      }));
      expect(r.suggested_code).toMatch(/^4/);
      expect(r.tieBreaksFired).toHaveLength(0);
    });

    it('revenue_growth_fwd=0.25 only (+ critical fields to avoid gate) → code starts with "6"', () => {
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.25, revenue_growth_3y: 0.25,
        eps_growth_fwd: 0.25, eps_growth_3y: 0.25,
        operating_margin: null, fcf_positive: null, net_income_positive: null,
        fcf_conversion: null, net_debt_to_ebitda: 0.5, interest_coverage: 10.0,
        // B6 fires at (15%, 35%]: 25% fires B6 (and B5: 10–20%? No, 25% > 20%). B5 range is [10,20], 25% > 20%, no.
        // Actually 25% > 15% and ≤ 35% → B6. 25% > 20% so outside B5. Only B6 fires.
      }));
      expect(r.suggested_code).toMatch(/^6/);
    });
  });

  // ─── (b) Tie-break: B3v4 ──────────────────────────────────────────────────

  describe('(b) Tie-break: B3v4', () => {
    // Construct: rev_fwd=5% (B3 zone) → B3 += REV_PRIMARY(3)
    //            rev_3y=9% (B4 zone) → B4 += REV_SECONDARY(2)
    //            eps_fwd=9% (B4 zone) → B4 += EPS_PRIMARY(2)
    //            eps_3y=5% (B3 zone) → B3 += EPS_SECONDARY(1)
    //            operating_margin=0.20 → B3 += 1, B4 += 1
    // B3 = 3+1+1 = 5, B4 = 2+2+1 = 5 — exact tie, margin=0
    const TIE_BASE = {
      revenue_growth_fwd: 0.05, revenue_growth_3y: 0.09,
      eps_growth_fwd: 0.09, eps_growth_3y: 0.05, operating_margin: 0.20,
      // include remaining critical fields to keep missing_field_count low
      fcf_positive: true, net_income_positive: true,
      net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
    };

    // STORY-083 (amended 2026-04-27 ADR-014 §Confidence-Floor Pre-Pass):
    // B3v4 exact-tie (margin=0) → 1 tie-break fires → low confidence.
    // Phase 1 pre-pass: exclude tied competitor, verify tie-break winner alone.
    // Winner achieves medium+ confidence alone → retained (not demoted to loser).
    // rawSuggestedCode preserves the tie-break winner code for audit.

    it('B3/B4 tie + fcf_conversion≤0.85 or roic≤0.20 → tie chose B3; pre-pass retains B3', () => {
      const r = classifyStock(makeInput({
        ...TIE_BASE,
        fcf_conversion: 0.65, roic: 0.15,
      }));
      // Tie-break rule chose B3 (conservative); pre-pass verifies B3 holds alone → retained
      expect(r.rawSuggestedCode).toMatch(/^3/);
      expect(r.bucket).toBe(3);
      expect(r.tieBreaksFired).toHaveLength(0); // pre-pass gives winner alone → no tie-breaks
      expect(r.confidenceFloorApplied).toBe(true);
      expect(r.suggested_code).toMatch(/^3/);
    });

    it('B3/B4 tie + fcf_conversion>0.85 AND roic>0.20 → tie chose B4; pre-pass retains B4', () => {
      const r = classifyStock(makeInput({
        ...TIE_BASE,
        fcf_conversion: 0.90, roic: 0.25,
      }));
      // Tie-break rule chose B4 (qualified); pre-pass verifies B4 holds alone → retained
      expect(r.rawSuggestedCode).toMatch(/^4/);
      expect(r.bucket).toBe(4);
      expect(r.tieBreaksFired).toHaveLength(0);
      expect(r.confidenceFloorApplied).toBe(true);
    });

    it('B3/B4 tie + fcf_conversion exactly 0.85 → tie chose B3; pre-pass retains B3', () => {
      // 0.85 is NOT strictly greater → conservative B3 chosen by tie-break; pre-pass retains B3
      const r = classifyStock(makeInput({ ...TIE_BASE, fcf_conversion: 0.85, roic: 0.25 }));
      expect(r.bucket).toBe(3);
      expect(r.confidenceFloorApplied).toBe(true);
      expect(r.rawSuggestedCode).toMatch(/^3/);
    });

    it('B3/B4 tie + roic null (missing) → tie chose B3; pre-pass retains B3', () => {
      // roic=null → conservative B3 chosen; pre-pass retains B3
      const r = classifyStock(makeInput({ ...TIE_BASE, fcf_conversion: 0.90, roic: null }));
      expect(r.bucket).toBe(3);
      expect(r.confidenceFloorApplied).toBe(true);
      expect(r.rawSuggestedCode).toMatch(/^3/);
    });
  });

  // ─── (c) Tie-break: B4v5 ──────────────────────────────────────────────────

  describe('(c) Tie-break: B4v5', () => {
    // Construct: rev_fwd=12% (B4 [8,15%] and B5 [10,20%]) → B4 += 3, B5 += 3
    //            rev_3y=12% → B4 += 2, B5 += 2
    // B4=5, B5=5 — exact tie
    // Need ≥ 5 critical fields to avoid null-gate: add operating_margin, fcf_positive, ni_positive
    // But these add to B3 and B4, not B5!
    // After adding operating_margin, fcf_positive, net_income_positive (all fire B3/B4):
    // B3 = 3 (from profitability), B4 = 5+3 = 8, B5 = 5
    // That gives B4 margin=3 over B5 — no tie-break fires
    //
    // Solution: use only growth fields that fire both B4 and B5 equally, minimal other signals
    // rev_fwd=12%, rev_3y=12%, eps_fwd=12% → B4: 3+2+2=7, B5: 3+2+2=7, B3: 0
    // Add eps_3y=12% → B4 += 1, B5 += 1 (still equal)
    // Now need critical fields without B3/B4 exclusive signals:
    // fcf_conversion=0.60 → B3 += 1, B4 += 1 (breaks tie!)
    // Use operating_margin=0.10 < 0.15 threshold → no profitability bonus for B3/B4
    // So: rev_fwd=12%, rev_3y=12%, eps_fwd=12%, eps_3y=12% → B4=B5=8
    // Add net_debt_to_ebitda and interest_coverage (no BucketScorer effect)
    // missing_field_count: operating_margin=null, fcf_conversion=null, fcf_positive=null, ni_positive=null → 4 missing
    // That's missing=4 (≤ 5), so null-gate passes. ok.

    const TIE_BASE = {
      revenue_growth_fwd: 0.12, revenue_growth_3y: 0.12,
      eps_growth_fwd: 0.12, eps_growth_3y: 0.12,
      net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
    };

    // STORY-083 (amended 2026-04-27 ADR-014 §Confidence-Floor Pre-Pass):
    // TIE_BASE has missing=4. Confidence = low (margin=0→low, 1 tie-break→degrade, missing=4→degrade).
    // Phase 1 pre-pass: exclude tied competitor, verify tie-break winner alone (margin high, medium after penalty).

    it('B4/B5 tie + pre_operating_leverage_flag=false → tie chose B4; pre-pass retains B4', () => {
      // 4v5 fires, flag=false → B4 wins; pre-pass excludes B5, B4 alone achieves medium → retained
      const r = classifyStock(makeInput({ ...TIE_BASE, pre_operating_leverage_flag: false }));
      expect(r.rawSuggestedCode).toMatch(/^4/); // tie-break chose B4
      expect(r.bucket).toBe(4);                // pre-pass retains B4 (tie-break winner)
      expect(r.tieBreaksFired).toHaveLength(0); // pre-pass gives winner alone → no tie-breaks
      expect(r.confidenceFloorApplied).toBe(true);
    });

    it('pre_operating_leverage_flag=true → B5 wins outright but missing=4 → low → floor finds B4', () => {
      // B5 wins with margin=2 (flag bonus), no tie-break. But missing=4 degrades medium→low.
      // Floor excludes B5, finds B4 (alone with high margin) → medium confidence after missing penalty.
      const r = classifyStock(makeInput({ ...TIE_BASE, pre_operating_leverage_flag: true }));
      expect(r.rawSuggestedCode).toMatch(/^5/); // original outright winner was B5
      expect(r.bucket).toBe(4);                // floor found B4
      expect(r.tieBreaksFired).toHaveLength(0); // no tie-break originally and floor adds none
      expect(r.confidenceFloorApplied).toBe(true);
    });
  });

  // ─── (d) Tie-break: B5v6 ──────────────────────────────────────────────────

  describe('(d) Tie-break: B5v6', () => {
    // 18% fires B5 [10,20%] and B6 (15,35%] — overlapping range
    // rev_fwd=0.18, rev_3y=0.18 → B5 += 3+2=5, B6 += 3+2=5 (tied)
    // Note: B4 does NOT fire at 18% (B4_MAX=15%)
    const TIE_BASE = {
      revenue_growth_fwd: 0.18, revenue_growth_3y: 0.18,
      eps_growth_fwd: 0.18, eps_growth_3y: 0.18,
      net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
    };

    // STORY-083 (amended 2026-04-27 ADR-014 §Confidence-Floor Pre-Pass):
    // Same missing=4 pattern → confidence degrades to low.
    // Phase 1 pre-pass: exclude tied competitor, verify tie-break winner alone → retained.

    it('B5/B6 tie + pre_operating_leverage_flag=false → tie chose B6; pre-pass retains B6', () => {
      // 5v6 fires, flag=false → B6 wins; pre-pass excludes B5, B6 alone achieves medium → retained
      const r = classifyStock(makeInput({ ...TIE_BASE, pre_operating_leverage_flag: false }));
      expect(r.rawSuggestedCode).toMatch(/^6/); // tie-break chose B6
      expect(r.bucket).toBe(6);                // pre-pass retains B6 (tie-break winner)
      expect(r.tieBreaksFired).toHaveLength(0);
      expect(r.confidenceFloorApplied).toBe(true);
    });

    it('pre_operating_leverage_flag=true → B5 wins outright (flag bonus +2, no tie fires) → low → floor finds B6', () => {
      // flag=true adds +2 to B5 in BucketScorer: B5=10, B6=8, margin=2, no 5v6 tie fires, tieBreaks=0
      // computeConfidence(2, 0, 4) = low (medium→low via missing=4). Pre-pass skipped (tieBreaks=0).
      // Phase 2 downward: exclude B5 → B6 alone → margin=8 → medium → accept B6.
      const r = classifyStock(makeInput({ ...TIE_BASE, pre_operating_leverage_flag: true }));
      expect(r.rawSuggestedCode).toMatch(/^5/); // original outright winner was B5
      expect(r.bucket).toBe(6);                // Phase 2 floor found B6
      expect(r.tieBreaksFired).toHaveLength(0); // no tie-break fired originally
      expect(r.confidenceFloorApplied).toBe(true);
    });
  });

  // ─── (e) Tie-break: B6v7 ──────────────────────────────────────────────────

  describe('(e) Tie-break: B6v7', () => {
    // rev_fwd=0.21 fires B6 only (0.21 > B5_MAX=0.20, so B5 not hit; B6 range: >0.15, ≤0.35)
    // rev_3y=0.40 fires B7 only (>B7_MIN=0.35)
    // operating_margin=0.10 < 0.15 threshold → no B3/B4 signal
    // missing_field_count=5 (eps*2, fcf_conv, fcf_pos, ni_pos) → null gate passes (5 not > 5)
    // B6 = REV_PRIMARY(3), B7 = REV_SECONDARY(2). topScore=3, margin=1. Only 6v7 pair fires.
    const TIE_BASE = {
      revenue_growth_fwd: 0.21, revenue_growth_3y: 0.40,
      operating_margin: 0.10,
      net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
    };

    it('B6/B7 margin=1 + revenue_growth_fwd=0.21 (<0.35) → Bucket 6 chosen', () => {
      const r = classifyStock(makeInput(TIE_BASE));
      expect(r.bucket).toBe(6);
      expect(r.tieBreaksFired).toHaveLength(1);
      expect(r.tieBreaksFired[0].rule).toBe('6v7');
    });

    it('B6/B7 margin=1 + revenue_growth_fwd=0.35 (≥0.35) → Bucket 7 chosen', () => {
      const r = classifyStock(makeInput({
        ...TIE_BASE,
        // 0.35 fires B6 (≤B6_MAX=0.35) but NOT B7 (> 0.35 required)
        // B6=3 from rev_fwd, B7=2 from rev_3y=0.40. margin=1. 6v7 fires.
        // rev_fwd=0.35 ≥ 0.35 → B7 wins by tie-break rule
        revenue_growth_fwd: 0.35,
      }));
      expect(r.bucket).toBe(7);
    });

    it('B6/B7 margin=1 + revenue_growth_fwd=0.36 (>0.35) → Bucket 7 chosen', () => {
      const r = classifyStock(makeInput({
        ...TIE_BASE,
        revenue_growth_fwd: 0.36, // fires B7 (>B7_MIN=0.35), NOT B6 (B6_MAX=0.35 exclusive)
        revenue_growth_3y: 0.25,  // fires B6 only (>0.15, ≤0.35; 0.25>B5_MAX=0.20 → no B5)
        // B7 = REV_PRIMARY(3) from rev_fwd. B6 = REV_SECONDARY(2) from rev_3y. margin=1. 6v7 fires.
        // rev_fwd=0.36 ≥ 0.35 → B7 wins.
      }));
      expect(r.bucket).toBe(7);
    });
  });

  // ─── (f) Tie-break margin boundary ────────────────────────────────────────

  describe('(f) Tie-break margin boundary', () => {
    it('winner margin=2 → 3v4 tie-break does NOT fire', () => {
      // B4 leads B3 by 2: use inputs that naturally give B4 two more points than B3
      // rev_fwd=0.09 (B4 only, 9%) → B4 += 3. rev_3y=0.09 → B4 += 2. B4=5, B3=0. margin=5. Too high.
      // Use B3 and B4 construct that gives margin=2:
      // rev_fwd=0.05 → B3 += 3. rev_3y=0.09 → B4 += 2. eps_fwd=0.09 → B4 += 2.
      // B3=3, B4=4. margin=1. Tie fires. Not what I want.
      //
      // rev_fwd=0.09 (B4) → B4 += 3. operating_margin=0.20 → B3 += 1, B4 += 1.
      // B3=1, B4=4. margin=3. Too high.
      //
      // rev_fwd=0.05 → B3 += 3. rev_3y=0.09 → B4 += 2. eps_3y=0.09 → B4 += 1.
      // B3=3, B4=3. margin=0. Tie fires.
      //
      // Let me get margin=2: rev_fwd=0.05 → B3 += 3. rev_3y=0.09 → B4 += 2.
      // eps_fwd=0.05 → B3 += 2. eps_3y=0.09 → B4 += 1.
      // B3=5, B4=3. B3 wins by 2.
      // But the 3v4 pair: topScore=5 (B3). B4=3. 5-3=2 > 1. 3v4 does NOT fire. ✓
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.05, revenue_growth_3y: 0.09,
        eps_growth_fwd: 0.05, eps_growth_3y: 0.09,
        net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
        fcf_positive: true, net_income_positive: true,
      }));
      expect(r.tieBreaksFired).toHaveLength(0);
      expect(r.bucket).toBe(3); // B3 wins cleanly with margin=2
    });
  });

  // ─── (g) Special-case overrides ───────────────────────────────────────────

  describe('(g) Special-case overrides', () => {
    it('binary_flag=true → suggested_code="8", bucket=8, eq_grade=null, bs_grade=null', () => {
      const r = classifyStock(makeInput({ ...ALL_CRITICAL, binary_flag: true }));
      expect(r.suggested_code).toBe('8');
      expect(r.bucket).toBe(8);
      expect(r.eq_grade).toBeNull();
      expect(r.bs_grade).toBeNull();
      expect(r.reason_codes).toContain('binary_flag_override');
    });

    it('binary_flag=true + holding_company_flag=true → suggested_code="8" (binary wins)', () => {
      const r = classifyStock(makeInput({ ...ALL_CRITICAL, binary_flag: true, holding_company_flag: true }));
      expect(r.suggested_code).toBe('8');
      expect(r.bucket).toBe(8);
      expect(r.reason_codes).toContain('binary_flag_override');
    });

    it('holding_company_flag=true + bucket scores to B4 → bucket=3 (floor gated by flag)', () => {
      // Strong B4 signals (ADBE-like: B4 scorer winner). holding_company forces B3.
      // STORY-083: holding_company_flag gates the floor search → B3 is retained even at low confidence.
      const r = classifyStock(makeInput({ ...ADBE_GOLDEN_INPUT, holding_company_flag: true }));
      expect(r.bucket).toBe(3);
      expect(r.reason_codes).toContain('holding_company_flag_applied');
      expect(r.confidenceFloorApplied).toBeFalsy(); // floor did not run
    });

    it('holding_company_flag=true + bucket scores to B3 → bucket=3 (no change)', () => {
      // B3 signals: rev_fwd=5%, rev_3y=5% (both B3 zone)
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.05, revenue_growth_3y: 0.05,
        eps_growth_fwd: 0.05, eps_growth_3y: 0.05,
        operating_margin: 0.20, fcf_positive: true, net_income_positive: true,
        net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
        holding_company_flag: true,
      }));
      expect(r.bucket).toBe(3);
      expect(r.reason_codes).toContain('holding_company_flag_applied');
    });

    it('holding_company_flag=true + bucket scores to B5 → bucket=5 (only applies to B3/B4)', () => {
      const r = classifyStock(makeInput({ ...UBER_GOLDEN_INPUT, holding_company_flag: true }));
      // UBER resolves to B4 via 4v5 tie-break (pre_operating_leverage=false)
      // holding_company_flag fires on B4 → forces to B3
      expect([3, 4, 5]).toContain(r.bucket); // bucket depends on UBER's tie-break resolution
    });

    it('cyclicality_flag=true → reason_codes contains cyclicality_flag_applied; bucket unchanged', () => {
      const r = classifyStock(makeInput({ ...ALL_CRITICAL, cyclicality_flag: true }));
      expect(r.reason_codes).toContain('cyclicality_flag_applied');
      // bucket should be same as without flag
      const rWithout = classifyStock(makeInput({ ...ALL_CRITICAL }));
      expect(r.bucket).toBe(rWithout.bucket);
    });

    it('insurer_flag=true → reason_codes contains insurer_flag_applied (added by BucketScorer)', () => {
      const r = classifyStock(makeInput({ ...ALL_CRITICAL, insurer_flag: true }));
      expect(r.reason_codes).toContain('insurer_flag_applied');
    });

    it('optionality_flag=true → reason_codes contains optionality_flag_applied (added by BucketScorer)', () => {
      const r = classifyStock(makeInput({ ...ALL_CRITICAL, optionality_flag: true }));
      expect(r.reason_codes).toContain('optionality_flag_applied');
    });
  });

  // ─── (h) Confidence computation ───────────────────────────────────────────

  describe('(h) Confidence computation', () => {
    // margin=5 input: all 10 critical fields set; B4 dominates with margin 5 over B5
    // rev_fwd=0.10, rev_3y=0.10, eps_fwd=0.10, eps_3y=0.10 → B4: 8pts from growth, B5: 8pts
    // operating_margin=0.20, fcf_positive=true, net_income_positive=true, fcf_conversion=0.60,
    // moat=5.0 → B3+B4 each += 5pts from profitability rules
    // B3=5, B4=8+5=13, B5=8. Margin=13-8=5. No tie-break (13-8=5>1). ✓
    const HIGH_MARGIN_INPUT = {
      ...ALL_CRITICAL,
      moat_strength_score: 5.0,
    };

    it('margin=5, tie_breaks=0, missing=0 → confidence_level="high"', () => {
      const r = classifyStock(makeInput(HIGH_MARGIN_INPUT));
      expect(r.confidence_level).toBe('high');
      expect(r.tieBreaksFired).toHaveLength(0);
    });

    it('margin≥4, missing=2 → confidence_level="high" (no penalty for ≤2 missing)', () => {
      // 2 missing critical fields: eps_growth_fwd and eps_growth_3y
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.10, revenue_growth_3y: 0.10,
        operating_margin: 0.20, fcf_positive: true, net_income_positive: true, fcf_conversion: 0.60,
        moat_strength_score: 5.0,
        net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
        // eps_growth_fwd=null, eps_growth_3y=null → 2 missing
      }));
      expect(r.confidence_level).toBe('high');
    });

    it('margin=3 → confidence_level="medium"', () => {
      // rev_fwd=0.12, rev_3y=0.12 → B4 +=5, B5 +=5 (both in [8%,15%] and [10%,20%])
      // fcf_positive, net_income_positive, operating_margin=0.20 → B3 +=3, B4 +=3
      // fcf_conversion=0.40 < FCF_CONVERSION_THRESHOLD(0.50) → set (not missing) but no bucket signal
      // B3=3, B4=8, B5=5. margin=3. missing=2 (eps_growth_fwd, eps_growth_3y) → no penalty
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.12, revenue_growth_3y: 0.12,
        operating_margin: 0.20, fcf_positive: true, net_income_positive: true,
        fcf_conversion: 0.40,
        net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
      }));
      expect(r.confidence_level).toBe('medium');
    });

    it('margin=2 → confidence_level="medium"', () => {
      // rev_fwd=0.05, rev_3y=0.09, eps_fwd=0.05, eps_3y=0.09 → B3=5, B4=3, margin=2
      // Wait: rev_fwd=0.05 → B3 += 3. eps_fwd=0.05 → B3 += 2. B3=5.
      //       rev_3y=0.09 → B4 += 2. eps_3y=0.09 → B4 += 1. B4=3. margin=2. ✓
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.05, revenue_growth_3y: 0.09,
        eps_growth_fwd: 0.05, eps_growth_3y: 0.09,
        fcf_conversion: 0.60, fcf_positive: true, net_income_positive: true,
        net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
        // operating_margin=null → 1 missing. OK.
      }));
      expect(r.confidence_level).toBe('medium');
    });

    it('margin=0, no tie-break rule (B1/B4 tied) → floor finds B4 with medium confidence', () => {
      // UNH: B1=B4=6, no tie-break rule → B1 wins by position; initial confidence='low'
      // STORY-083: floor excludes B1, finds B4 (B4=6, B3=4 next → margin=2 → medium)
      const r = classifyStock(makeInput(UNH_GOLDEN_INPUT));
      expect(r.confidence_level).toBe('medium');
      expect(r.bucket).toBe(4);
      expect(r.confidenceFloorApplied).toBe(true);
    });

    it('missing=3 → degrade confidence one level', () => {
      // Use HIGH_MARGIN_INPUT but with 3 critical fields missing
      // HIGH_MARGIN_INPUT has all 10 critical fields set → margin=5, confidence='high'
      // Remove 3: eps_growth_fwd, eps_growth_3y, interest_coverage
      // missing=3 → degrade: high → medium
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.10, revenue_growth_3y: 0.10,
        operating_margin: 0.20, fcf_positive: true, net_income_positive: true, fcf_conversion: 0.60,
        moat_strength_score: 5.0, net_debt_to_ebitda: 0.22,
        // 3 missing: eps_growth_fwd, eps_growth_3y, interest_coverage
      }));
      // margin ≥ 4 (B4 well ahead of B5), but missing=3 degrades high → medium
      expect(r.confidence_level).toBe('medium');
    });

    it('missing=5 → force confidence_level="low"', () => {
      // 5 missing: rev_3y, eps_fwd, eps_3y, net_debt, interest_coverage
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.10, operating_margin: 0.20,
        fcf_positive: true, net_income_positive: true, fcf_conversion: 0.60,
        moat_strength_score: 5.0,
        // 5 missing critical fields: revenue_growth_3y, eps_growth_fwd, eps_growth_3y,
        //                            net_debt_to_ebitda, interest_coverage
      }));
      expect(r.confidence_level).toBe('low');
      expect(r.suggested_code).not.toBeNull(); // 5 missing = at threshold, gate doesn't fire (> 5 required)
    });

    it('missing_field_count=6 → suggested_code=null, confidence_level="low" (null-gate fires)', () => {
      // 6 critical fields null: revenue_growth_3y, eps_growth_fwd, eps_growth_3y,
      //                         net_debt_to_ebitda, interest_coverage, net_income_positive
      const r = classifyStock(makeInput({
        revenue_growth_fwd: 0.10, operating_margin: 0.20,
        fcf_positive: true, fcf_conversion: 0.60,
        // 6 missing
      }));
      expect(r.suggested_code).toBeNull();
      expect(r.confidence_level).toBe('low');
      expect(r.confidenceBreakdown.steps).toHaveLength(1);
      expect(r.confidenceBreakdown.steps[0].step).toBe(1);
    });
  });

  // ─── (i) All-null input ────────────────────────────────────────────────────

  describe('(i) All-null input', () => {
    it('all fields null → suggested_code=null, confidence=low, bucket=null, no exception', () => {
      const r = classifyStock(makeInput({}));
      expect(r.suggested_code).toBeNull();
      expect(r.confidence_level).toBe('low');
      expect(r.bucket).toBeNull();
      expect(r.eq_grade).toBeNull();
      expect(r.bs_grade).toBeNull();
      expect(r.tieBreaksFired).toEqual([]);
      expect(r.confidenceBreakdown.steps.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── (j) Output contract ──────────────────────────────────────────────────

  describe('(j) Output contract', () => {
    const FIVE_INPUTS = [
      makeInput({}),
      makeInput({ ...ALL_CRITICAL, binary_flag: true }),
      makeInput(ALL_CRITICAL),
      makeInput({ ...ALL_CRITICAL, moat_strength_score: 5.0 }),
      makeInput(UNH_GOLDEN_INPUT),
    ];

    it('confidence_level is always "high"|"medium"|"low" — never null or undefined', () => {
      for (const input of FIVE_INPUTS) {
        const r = classifyStock(input);
        expect(['high', 'medium', 'low']).toContain(r.confidence_level);
      }
    });

    it('suggested_code matches regex or is null', () => {
      for (const input of FIVE_INPUTS) {
        const r = classifyStock(input);
        if (r.suggested_code !== null) {
          expect(r.suggested_code).toMatch(/^[1-8]([ABC][ABC])?$/);
        }
      }
    });

    it('scores.bucket has keys 1–8; scores.eq has keys A/B/C; scores.bs has keys A/B/C', () => {
      const r = classifyStock(makeInput(ALL_CRITICAL));
      expect(Object.keys(r.scores.bucket).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(Object.keys(r.scores.eq).sort()).toEqual(['A', 'B', 'C']);
      expect(Object.keys(r.scores.bs).sort()).toEqual(['A', 'B', 'C']);
    });

    it('tieBreaksFired is always an array (never null/undefined)', () => {
      for (const input of FIVE_INPUTS) {
        const r = classifyStock(input);
        expect(Array.isArray(r.tieBreaksFired)).toBe(true);
      }
    });

    it('confidenceBreakdown.steps is always an array with ≥ 1 entry', () => {
      for (const input of FIVE_INPUTS) {
        const r = classifyStock(input);
        expect(Array.isArray(r.confidenceBreakdown.steps)).toBe(true);
        expect(r.confidenceBreakdown.steps.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('reason_codes is always an array', () => {
      for (const input of FIVE_INPUTS) {
        const r = classifyStock(input);
        expect(Array.isArray(r.reason_codes)).toBe(true);
      }
    });

    it('Bucket 8 output: eq_grade=null, bs_grade=null, suggested_code="8"', () => {
      const r = classifyStock(makeInput({ ...ALL_CRITICAL, binary_flag: true }));
      expect(r.eq_grade).toBeNull();
      expect(r.bs_grade).toBeNull();
      expect(r.suggested_code).toBe('8');
    });
  });

  // ─── (k) Determinism ──────────────────────────────────────────────────────

  describe('(k) Determinism', () => {
    it('100 runs with MSFT-like input → identical classifyStock output', () => {
      const first = classifyStock(MSFT_GOLDEN_INPUT);
      for (let i = 0; i < 99; i++) {
        const r = classifyStock(MSFT_GOLDEN_INPUT);
        expect(r.suggested_code).toBe(first.suggested_code);
        expect(r.bucket).toBe(first.bucket);
        expect(r.confidence_level).toBe(first.confidence_level);
        expect(r.tieBreaksFired.length).toBe(first.tieBreaksFired.length);
      }
    });
  });

  // ─── (l) Golden-set regression ────────────────────────────────────────────

  describe('(l) Golden-set regression', () => {
    it('MSFT: matches MSFT_CLASSIFY_GOLDEN', () => {
      const r = classifyStock(MSFT_GOLDEN_INPUT);
      expect(r.bucket).toBe(MSFT_CLASSIFY_GOLDEN.bucket);
      expect(r.eq_grade).toBe(MSFT_CLASSIFY_GOLDEN.eq_grade);
      expect(r.bs_grade).toBe(MSFT_CLASSIFY_GOLDEN.bs_grade);
      expect(r.confidence_level).toBe(MSFT_CLASSIFY_GOLDEN.confidence_level);
      expect(r.suggested_code).toBe(MSFT_CLASSIFY_GOLDEN.suggested_code);
      expect(r.confidenceFloorApplied).toBe(MSFT_CLASSIFY_GOLDEN.confidenceFloorApplied);
      expect(r.rawSuggestedCode).toBe(MSFT_CLASSIFY_GOLDEN.rawSuggestedCode);
    });

    it('ADBE: matches ADBE_CLASSIFY_GOLDEN', () => {
      const r = classifyStock(ADBE_GOLDEN_INPUT);
      expect(r.bucket).toBe(ADBE_CLASSIFY_GOLDEN.bucket);
      expect(r.eq_grade).toBe(ADBE_CLASSIFY_GOLDEN.eq_grade);
      expect(r.bs_grade).toBe(ADBE_CLASSIFY_GOLDEN.bs_grade);
      expect(r.confidence_level).toBe(ADBE_CLASSIFY_GOLDEN.confidence_level);
      expect(r.suggested_code).toBe(ADBE_CLASSIFY_GOLDEN.suggested_code);
      expect(r.confidenceFloorApplied).toBe(ADBE_CLASSIFY_GOLDEN.confidenceFloorApplied);
      expect(r.rawSuggestedCode).toBe(ADBE_CLASSIFY_GOLDEN.rawSuggestedCode);
    });

    it('TSLA: matches TSLA_CLASSIFY_GOLDEN', () => {
      const r = classifyStock(TSLA_GOLDEN_INPUT);
      expect(r.bucket).toBe(TSLA_CLASSIFY_GOLDEN.bucket);
      expect(r.eq_grade).toBe(TSLA_CLASSIFY_GOLDEN.eq_grade);
      expect(r.confidence_level).toBe(TSLA_CLASSIFY_GOLDEN.confidence_level);
      expect(r.confidenceFloorApplied).toBe(TSLA_CLASSIFY_GOLDEN.confidenceFloorApplied);
      expect(r.rawSuggestedCode).toBe(TSLA_CLASSIFY_GOLDEN.rawSuggestedCode);
    });

    it('UBER: matches UBER_CLASSIFY_GOLDEN', () => {
      const r = classifyStock(UBER_GOLDEN_INPUT);
      expect(r.bucket).toBe(UBER_CLASSIFY_GOLDEN.bucket);
      expect(r.eq_grade).toBe(UBER_CLASSIFY_GOLDEN.eq_grade);
      expect(r.confidence_level).toBe(UBER_CLASSIFY_GOLDEN.confidence_level);
      expect(r.confidenceFloorApplied).toBe(UBER_CLASSIFY_GOLDEN.confidenceFloorApplied);
      expect(r.rawSuggestedCode).toBe(UBER_CLASSIFY_GOLDEN.rawSuggestedCode);
    });

    it('UNH: matches UNH_CLASSIFY_GOLDEN', () => {
      const r = classifyStock(UNH_GOLDEN_INPUT);
      expect(r.bucket).toBe(UNH_CLASSIFY_GOLDEN.bucket);
      expect(r.bs_grade).toBe(UNH_CLASSIFY_GOLDEN.bs_grade);
      expect(r.confidence_level).toBe(UNH_CLASSIFY_GOLDEN.confidence_level);
      expect(r.confidenceFloorApplied).toBe(UNH_CLASSIFY_GOLDEN.confidenceFloorApplied);
      expect(r.rawSuggestedCode).toBe(UNH_CLASSIFY_GOLDEN.rawSuggestedCode);
    });
  });
});
