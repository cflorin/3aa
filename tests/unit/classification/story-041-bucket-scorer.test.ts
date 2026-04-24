// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-004: Unit tests — per-rule, winner, boundary, missing-field, invariants,
//               CRITICAL_FIELDS membership, enrichment bonus, determinism
// TASK-041-005: Golden-set regression tests (locked against 2026-04-24 test DB snapshot)
//
// All fixtures: synthetic or captured from test DB (no live DB at test time)
// RFC-001 §Bucket Scorer; ADR-013 §Bucket Scorer Point Weights; ADR-014 §Critical Fields

import { BucketScorer } from '../../../src/domain/classification/bucket-scorer';
import {
  CRITICAL_FIELDS,
  NULL_SUGGESTION_THRESHOLD,
} from '../../../src/domain/classification/confidence-thresholds';
import {
  REV_PRIMARY,
  REV_SECONDARY,
  EPS_PRIMARY,
  EPS_SECONDARY,
  PROFITABILITY,
  FCF_CONVERSION_WEIGHT,
  FLAG_PRIMARY,
  ENRICHMENT_BONUS,
} from '../../../src/domain/classification/scoring-weights';
import type { ClassificationInput } from '../../../src/domain/classification/types';
import {
  MSFT_GOLDEN_INPUT, MSFT_GOLDEN_SCORES,
  ADBE_GOLDEN_INPUT, ADBE_GOLDEN_SCORES,
  TSLA_GOLDEN_INPUT, TSLA_GOLDEN_SCORES,
  UBER_GOLDEN_INPUT, UBER_GOLDEN_SCORES,
  UNH_GOLDEN_INPUT, UNH_GOLDEN_SCORES,
} from './fixtures/bucket-scorer-golden';

// ─── Test fixture helpers ─────────────────────────────────────────────────────

function emptyInput(): ClassificationInput {
  return {
    revenue_growth_fwd: null,
    revenue_growth_3y: null,
    eps_growth_fwd: null,
    eps_growth_3y: null,
    gross_profit_growth: null,
    operating_margin: null,
    fcf_margin: null,
    fcf_conversion: null,
    roic: null,
    fcf_positive: null,
    net_income_positive: null,
    net_debt_to_ebitda: null,
    interest_coverage: null,
    moat_strength_score: null,
    pricing_power_score: null,
    revenue_recurrence_score: null,
    margin_durability_score: null,
    capital_intensity_score: null,
    qualitative_cyclicality_score: null,
    holding_company_flag: null,
    insurer_flag: null,
    cyclicality_flag: null,
    optionality_flag: null,
    binary_flag: null,
    pre_operating_leverage_flag: null,
  };
}

// MSFT-like synthetic fixture — used for determinism test; does not reflect actual MSFT data
const MSFT_LIKE_FIXTURE: ClassificationInput = {
  ...emptyInput(),
  revenue_growth_fwd: 0.12,   // B4 and B5
  revenue_growth_3y: 0.14,    // B4 and B5
  eps_growth_fwd: 0.14,       // B4 and B5
  eps_growth_3y: 0.12,        // B4 and B5
  operating_margin: 0.42,     // fires profitability for B3/B4
  fcf_conversion: 0.85,       // fires FCF conversion for B3/B4
  fcf_positive: true,
  net_income_positive: true,
  moat_strength_score: 4.5,   // fires moat enrichment bonus
  net_debt_to_ebitda: -0.2,
  interest_coverage: 25.0,
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-041/TASK-041-004: BucketScorer', () => {

  // ── (a) Per-rule tests ──────────────────────────────────────────────────────

  describe('(a) Per-rule tests', () => {
    it('revenue_growth_fwd=0.10 → scores[4] includes REV_PRIMARY (3 pts)', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.10 });
      expect(r.scores[4]).toBe(REV_PRIMARY);
    });

    it('revenue_growth_fwd=0.05 → scores[3] includes REV_PRIMARY', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.05 });
      expect(r.scores[3]).toBe(REV_PRIMARY);
    });

    it('revenue_growth_fwd=0.25 → scores[6] includes REV_PRIMARY', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.25 });
      expect(r.scores[6]).toBe(REV_PRIMARY);
    });

    it('revenue_growth_fwd=-0.05 → scores[1] includes REV_PRIMARY', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: -0.05 });
      expect(r.scores[1]).toBe(REV_PRIMARY);
    });

    it('revenue_growth_fwd=0.60 → scores[7] includes REV_PRIMARY', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.60 });
      expect(r.scores[7]).toBe(REV_PRIMARY);
    });

    it('revenue_growth_3y=0.10 → scores[4] includes REV_SECONDARY (2 pts)', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_3y: 0.10 });
      expect(r.scores[4]).toBe(REV_SECONDARY);
    });

    it('gross_profit_growth=0.10 → scores[4] includes REV_SECONDARY', () => {
      const r = BucketScorer({ ...emptyInput(), gross_profit_growth: 0.10 });
      expect(r.scores[4]).toBe(REV_SECONDARY);
    });

    it('eps_growth_fwd=0.14 → scores[4] includes EPS_PRIMARY (2 pts)', () => {
      const r = BucketScorer({ ...emptyInput(), eps_growth_fwd: 0.14 });
      expect(r.scores[4]).toBe(EPS_PRIMARY);
    });

    it('eps_growth_3y=0.07 → scores[3] includes EPS_SECONDARY (1 pt)', () => {
      const r = BucketScorer({ ...emptyInput(), eps_growth_3y: 0.07 });
      expect(r.scores[3]).toBe(EPS_SECONDARY);
    });

    it('fcf_positive=true → scores[3] and scores[4] each += PROFITABILITY', () => {
      const r = BucketScorer({ ...emptyInput(), fcf_positive: true });
      expect(r.scores[3]).toBe(PROFITABILITY);
      expect(r.scores[4]).toBe(PROFITABILITY);
    });

    it('net_income_positive=true → scores[3] and scores[4] each += PROFITABILITY', () => {
      const r = BucketScorer({ ...emptyInput(), net_income_positive: true });
      expect(r.scores[3]).toBe(PROFITABILITY);
      expect(r.scores[4]).toBe(PROFITABILITY);
    });

    it('operating_margin=0.20 → scores[3] and scores[4] each += PROFITABILITY', () => {
      const r = BucketScorer({ ...emptyInput(), operating_margin: 0.20 });
      expect(r.scores[3]).toBe(PROFITABILITY);
      expect(r.scores[4]).toBe(PROFITABILITY);
    });

    it('fcf_conversion=0.60 → scores[3] and scores[4] each += FCF_CONVERSION_WEIGHT', () => {
      const r = BucketScorer({ ...emptyInput(), fcf_conversion: 0.60 });
      expect(r.scores[3]).toBe(FCF_CONVERSION_WEIGHT);
      expect(r.scores[4]).toBe(FCF_CONVERSION_WEIGHT);
    });

    it('pre_operating_leverage_flag=true → scores[5] += FLAG_PRIMARY (2 pts)', () => {
      const r = BucketScorer({ ...emptyInput(), pre_operating_leverage_flag: true });
      expect(r.scores[5]).toBe(FLAG_PRIMARY);
    });
  });

  // ── (b) Bucket winner tests ─────────────────────────────────────────────────

  describe('(b) Bucket winner tests', () => {
    it('Bucket 4 winner: revenue_growth_fwd=0.10, eps_growth_fwd=0.14, fcf_positive=true', () => {
      const r = BucketScorer({
        ...emptyInput(),
        revenue_growth_fwd: 0.10,
        eps_growth_fwd: 0.14,
        fcf_positive: true,
      });
      // B4: REV_PRIMARY(3) + EPS_PRIMARY(2) + PROFITABILITY(1) = 6
      // B5: REV_PRIMARY(3) + EPS_PRIMARY(2) = 5
      expect(r.winner).toBe(4);
      expect(r.scores[4]).toBeGreaterThan(r.scores[5]);
      expect(r.scores[8]).toBe(0); // Bucket 8 invariant
    });

    it('Bucket 3 winner: revenue_growth_fwd=0.05, eps_growth_3y=0.07', () => {
      const r = BucketScorer({
        ...emptyInput(),
        revenue_growth_fwd: 0.05,
        eps_growth_3y: 0.07,
      });
      expect(r.winner).toBe(3);
      expect(r.scores[3]).toBe(REV_PRIMARY + EPS_SECONDARY); // 4
      expect(r.scores[8]).toBe(0);
    });

    it('Bucket 6 winner: revenue_growth_fwd=0.25', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.25 });
      expect(r.winner).toBe(6);
      expect(r.scores[6]).toBe(REV_PRIMARY);
      expect(r.scores[5]).toBe(0); // 0.25 > B5_MAX (0.20)
      expect(r.scores[8]).toBe(0);
    });

    it('Bucket 7 winner: revenue_growth_fwd=0.60', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.60 });
      expect(r.winner).toBe(7);
      expect(r.scores[7]).toBe(REV_PRIMARY);
      expect(r.scores[8]).toBe(0);
    });

    it('Bucket 1 winner: revenue_growth_fwd=-0.05', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: -0.05 });
      expect(r.winner).toBe(1);
      expect(r.scores[1]).toBe(REV_PRIMARY);
      expect(r.scores[8]).toBe(0);
    });
  });

  // ── (c) Boundary tests ──────────────────────────────────────────────────────

  describe('(c) Boundary tests', () => {
    it('revenue_growth_fwd=0.08 → REV_PRIMARY fires Bucket 4, NOT Bucket 3 (inclusive lower)', () => {
      // ADR-013: 8.0% is inclusive lower bound for Bucket 4 — exact boundary
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.08 });
      expect(r.scores[4]).toBe(REV_PRIMARY);
      expect(r.scores[3]).toBe(0);
    });

    it('revenue_growth_fwd=0.079999 → REV_PRIMARY fires Bucket 3, NOT Bucket 4', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.079999 });
      expect(r.scores[3]).toBe(REV_PRIMARY);
      expect(r.scores[4]).toBe(0);
    });

    it('revenue_growth_fwd=0.03 → Bucket 2 fires (inclusive 3%), Bucket 3 does NOT', () => {
      // B2 = (2%, 3%] — 3% is inclusive upper bound of B2
      // B3 = (3%, 8%) — exclusive lower bound means 3% does NOT fire B3
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.03 });
      expect(r.scores[2]).toBe(REV_PRIMARY);
      expect(r.scores[3]).toBe(0);
    });

    it('revenue_growth_fwd=0.02 → Bucket 1 fires, Bucket 2 does NOT (exclusive lower of B2)', () => {
      // B1: ≤ 2% (inclusive); B2: > 2% exclusive lower
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.02 });
      expect(r.scores[1]).toBe(REV_PRIMARY);
      expect(r.scores[2]).toBe(0);
    });

    it('revenue_growth_fwd=0.10 → Bucket 4 AND Bucket 5 both fire (overlap by design)', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.10 });
      expect(r.scores[4]).toBe(REV_PRIMARY);
      expect(r.scores[5]).toBe(REV_PRIMARY);
    });

    it('revenue_growth_fwd=0.15 → Bucket 4 and B5 fire, Bucket 6 does NOT (exclusive lower)', () => {
      // B4: [8%, 15%] inclusive — 15% fires B4
      // B5: [10%, 20%] — 15% fires B5
      // B6: (15%, 35%] exclusive lower — 15% does NOT fire B6
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.15 });
      expect(r.scores[4]).toBe(REV_PRIMARY);
      expect(r.scores[5]).toBe(REV_PRIMARY);
      expect(r.scores[6]).toBe(0);
    });

    it('revenue_growth_fwd=0.35 → Bucket 6 fires, Bucket 7 does NOT (inclusive upper of B6)', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.35 });
      expect(r.scores[6]).toBe(REV_PRIMARY);
      expect(r.scores[7]).toBe(0);
    });

    it('revenue_growth_fwd=0.3501 → Bucket 7 fires, Bucket 6 does NOT', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.3501 });
      expect(r.scores[7]).toBe(REV_PRIMARY);
      expect(r.scores[6]).toBe(0);
    });

    it('moat_strength_score=4.0 → enrichment bonus fires (inclusive threshold)', () => {
      const r = BucketScorer({ ...emptyInput(), moat_strength_score: 4.0 });
      expect(r.scores[3]).toBe(ENRICHMENT_BONUS);
      expect(r.scores[4]).toBe(ENRICHMENT_BONUS);
    });

    it('moat_strength_score=3.9999 → enrichment bonus does NOT fire', () => {
      const r = BucketScorer({ ...emptyInput(), moat_strength_score: 3.9999 });
      expect(r.scores[3]).toBe(0);
      expect(r.scores[4]).toBe(0);
    });

    it('operating_margin just below threshold (0.1499) → profitability does NOT fire', () => {
      const r = BucketScorer({ ...emptyInput(), operating_margin: 0.1499 });
      expect(r.scores[3]).toBe(0);
      expect(r.scores[4]).toBe(0);
    });

    it('fcf_conversion just below threshold (0.4999) → FCF conversion does NOT fire', () => {
      const r = BucketScorer({ ...emptyInput(), fcf_conversion: 0.4999 });
      expect(r.scores[3]).toBe(0);
      expect(r.scores[4]).toBe(0);
    });
  });

  // ── (d) Missing-field tests ──────────────────────────────────────────────────

  describe('(d) Missing-field tests', () => {
    it('all fields null → all scores 0, missing_field_count=10, no exception', () => {
      const r = BucketScorer(emptyInput());
      expect(Object.values(r.scores).every(s => s === 0)).toBe(true);
      expect(r.missing_field_count).toBe(10);
      expect(r.winner).toBeNull();
    });

    it('revenue_growth_fwd=0.10 only → scores[4]=REV_PRIMARY, missing_field_count=9', () => {
      // 9 of 10 critical fields still null
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.10 });
      expect(r.scores[4]).toBe(REV_PRIMARY);
      expect(r.missing_field_count).toBe(9);
    });

    it('pre_operating_leverage_flag=null → FLAG_PRIMARY does not fire for Bucket 5', () => {
      const r = BucketScorer({ ...emptyInput(), pre_operating_leverage_flag: null });
      expect(r.scores[5]).toBe(0);
    });

    it('non-critical fields null do not affect missing_field_count', () => {
      // Flags and enrichment scores are NOT in CRITICAL_FIELDS
      const r = BucketScorer({
        ...emptyInput(),
        // All 10 critical fields set:
        revenue_growth_fwd: 0.10,
        revenue_growth_3y: 0.08,
        eps_growth_fwd: 0.10,
        eps_growth_3y: 0.08,
        fcf_conversion: 0.70,
        fcf_positive: true,
        net_income_positive: true,
        operating_margin: 0.20,
        net_debt_to_ebitda: 1.5,
        interest_coverage: 8.0,
        // Non-critical fields left null (flags, enrichment)
      });
      expect(r.missing_field_count).toBe(0);
    });
  });

  // ── (e) Invariant / contract tests ─────────────────────────────────────────

  describe('(e) Invariant / contract tests', () => {
    const testCases: Array<[string, Partial<ClassificationInput>]> = [
      ['empty input', {}],
      ['binary_flag=true', { binary_flag: true }],
      ['Bucket 4 signals', { revenue_growth_fwd: 0.10, fcf_positive: true }],
      ['Bucket 7 signal', { revenue_growth_fwd: 0.50 }],
    ];

    it.each(testCases)('scores[8] === 0 for %s', (_label, override) => {
      const r = BucketScorer({ ...emptyInput(), ...override });
      expect(r.scores[8]).toBe(0);
    });

    it('reason_codes is always an array of non-empty strings', () => {
      const inputs: Partial<ClassificationInput>[] = [
        {},
        { revenue_growth_fwd: 0.10 },
        { binary_flag: true, insurer_flag: true },
        { optionality_flag: true },
      ];
      for (const override of inputs) {
        const r = BucketScorer({ ...emptyInput(), ...override });
        expect(Array.isArray(r.reason_codes)).toBe(true);
        for (const code of r.reason_codes) {
          expect(typeof code).toBe('string');
          expect(code.length).toBeGreaterThan(0);
        }
      }
    });

    it('output shape: scores keys 1–8, reason_codes array, missing_field_count number ≥ 0', () => {
      const r = BucketScorer(emptyInput());
      expect(Object.keys(r.scores).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(Array.isArray(r.reason_codes)).toBe(true);
      expect(typeof r.missing_field_count).toBe('number');
      expect(r.missing_field_count).toBeGreaterThanOrEqual(0);
    });

    it('margin is non-negative', () => {
      const r = BucketScorer({ ...emptyInput(), revenue_growth_fwd: 0.10, eps_growth_fwd: 0.10 });
      expect(r.margin).toBeGreaterThanOrEqual(0);
    });

    it('binary_flag=true does not affect BucketScorer scores (override is in STORY-043)', () => {
      const r = BucketScorer({ ...emptyInput(), binary_flag: true });
      expect(r.scores[8]).toBe(0);
      expect(Object.values(r.scores).every(s => s === 0)).toBe(true);
    });
  });

  // ── (f) CRITICAL_FIELDS membership test (ADR-014 §Critical Fields Definition) ──

  describe('(f) CRITICAL_FIELDS membership', () => {
    it('CRITICAL_FIELDS contains exactly 10 fields per ADR-014', () => {
      expect(CRITICAL_FIELDS.length).toBe(10);
    });

    it('CRITICAL_FIELDS contains exactly the specified field names', () => {
      const expected = new Set([
        'revenue_growth_fwd',
        'revenue_growth_3y',
        'eps_growth_fwd',
        'eps_growth_3y',
        'fcf_conversion',
        'fcf_positive',
        'net_income_positive',
        'operating_margin',
        'net_debt_to_ebitda',
        'interest_coverage',
      ]);
      const actual = new Set(CRITICAL_FIELDS as unknown as string[]);
      expect(actual).toEqual(expected);
    });

    it('CRITICAL_FIELDS does not contain flag fields', () => {
      const flagFields = ['binary_flag', 'holding_company_flag', 'cyclicality_flag', 'insurer_flag', 'optionality_flag', 'pre_operating_leverage_flag'];
      for (const flag of flagFields) {
        expect(CRITICAL_FIELDS).not.toContain(flag);
      }
    });

    it('CRITICAL_FIELDS does not contain enrichment score fields', () => {
      const enrichmentFields = ['moat_strength_score', 'pricing_power_score', 'revenue_recurrence_score', 'margin_durability_score', 'capital_intensity_score', 'qualitative_cyclicality_score'];
      for (const field of enrichmentFields) {
        expect(CRITICAL_FIELDS).not.toContain(field);
      }
    });

    it('NULL_SUGGESTION_THRESHOLD is 5', () => {
      expect(NULL_SUGGESTION_THRESHOLD).toBe(5);
    });
  });

  // ── (g) Enrichment bonus tests ──────────────────────────────────────────────

  describe('(g) Enrichment bonus tests', () => {
    it('moat_strength_score=4.5 → Bucket 3 +ENRICHMENT_BONUS and Bucket 4 +ENRICHMENT_BONUS', () => {
      const baseline = BucketScorer(emptyInput());
      const r = BucketScorer({ ...emptyInput(), moat_strength_score: 4.5 });
      expect(r.scores[3]).toBe(baseline.scores[3] + ENRICHMENT_BONUS);
      expect(r.scores[4]).toBe(baseline.scores[4] + ENRICHMENT_BONUS);
      expect(r.reason_codes).toContain('moat_enrichment_bonus');
    });

    it('moat_strength_score=3.5 → no enrichment bonus, no moat reason code', () => {
      const r = BucketScorer({ ...emptyInput(), moat_strength_score: 3.5 });
      expect(r.scores[3]).toBe(0);
      expect(r.scores[4]).toBe(0);
      expect(r.reason_codes).not.toContain('moat_enrichment_bonus');
    });

    it('moat_strength_score=null → no crash, no bonus', () => {
      expect(() => BucketScorer({ ...emptyInput(), moat_strength_score: null })).not.toThrow();
      const r = BucketScorer({ ...emptyInput(), moat_strength_score: null });
      expect(r.scores[3]).toBe(0);
      expect(r.scores[4]).toBe(0);
    });

    it('capital_intensity_score=4.0 → Bucket 5 +ENRICHMENT_BONUS', () => {
      const r = BucketScorer({ ...emptyInput(), capital_intensity_score: 4.0 });
      expect(r.scores[5]).toBe(ENRICHMENT_BONUS);
      expect(r.reason_codes).toContain('capital_intensity_enrichment_bonus');
    });

    it('qualitative_cyclicality_score=4.0 → Bucket 5 +ENRICHMENT_BONUS AND Bucket 6 +ENRICHMENT_BONUS', () => {
      const r = BucketScorer({ ...emptyInput(), qualitative_cyclicality_score: 4.0 });
      expect(r.scores[5]).toBe(ENRICHMENT_BONUS);
      expect(r.scores[6]).toBe(ENRICHMENT_BONUS);
      expect(r.reason_codes).toContain('cyclicality_enrichment_bonus');
    });

    it('enrichment scores not in CRITICAL_FIELDS — do not affect missing_field_count', () => {
      const rNone = BucketScorer(emptyInput());
      const rWithEnrichment = BucketScorer({ ...emptyInput(), moat_strength_score: 4.5, capital_intensity_score: 4.0 });
      // Both have same missing_field_count since enrichment is not critical
      expect(rWithEnrichment.missing_field_count).toBe(rNone.missing_field_count);
    });
  });

  // ── (h) Determinism test ────────────────────────────────────────────────────

  describe('(h) Determinism test', () => {
    it('100 runs with MSFT-like fixture produce identical output', () => {
      const first = BucketScorer(MSFT_LIKE_FIXTURE);
      const firstSerialized = JSON.stringify(first);
      for (let i = 1; i < 100; i++) {
        const result = BucketScorer(MSFT_LIKE_FIXTURE);
        expect(JSON.stringify(result)).toBe(firstSerialized);
      }
    });
  });

  // ── (i) Golden-set regression tests (TASK-041-005) ────────────────────────
  // Locked against 2026-04-24 test DB snapshot. Failures = ADR-013 weight drift.

  describe('(i) Golden-set regression tests', () => {
    it('MSFT: scores match locked fixture (winner=B3, B3=8, B4=7)', () => {
      expect(BucketScorer(MSFT_GOLDEN_INPUT).scores).toEqual(MSFT_GOLDEN_SCORES);
    });

    it('ADBE: scores match locked fixture (winner=B4, B4=9, B3=8)', () => {
      expect(BucketScorer(ADBE_GOLDEN_INPUT).scores).toEqual(ADBE_GOLDEN_SCORES);
    });

    it('TSLA: scores match locked fixture (winner=B4, B4=6, B3=5)', () => {
      expect(BucketScorer(TSLA_GOLDEN_INPUT).scores).toEqual(TSLA_GOLDEN_SCORES);
    });

    it('UBER: scores match locked fixture (winner=B5, B5=7, B4=6)', () => {
      expect(BucketScorer(UBER_GOLDEN_INPUT).scores).toEqual(UBER_GOLDEN_SCORES);
    });

    it('UNH: scores match locked fixture (B1=B4=6, margin=0 due to negative metrics)', () => {
      expect(BucketScorer(UNH_GOLDEN_INPUT).scores).toEqual(UNH_GOLDEN_SCORES);
    });

    it('all golden-set stocks: scores[8] === 0 (Bucket 8 invariant)', () => {
      for (const input of [MSFT_GOLDEN_INPUT, ADBE_GOLDEN_INPUT, TSLA_GOLDEN_INPUT, UBER_GOLDEN_INPUT, UNH_GOLDEN_INPUT]) {
        expect(BucketScorer(input).scores[8]).toBe(0);
      }
    });
  });

});
