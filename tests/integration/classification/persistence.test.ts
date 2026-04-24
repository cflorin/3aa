// EPIC-004: Classification Engine & Universe Screen
// STORY-044: Classification State Persistence and History
// TASK-044-005: Integration tests — persistClassification, getClassificationState, getClassificationHistory
//
// Requires: test DB at DATABASE_URL with MSFT stock record present
// RFC-001 §Classification State, §Classification History; ADR-007, ADR-001

import { PrismaClient } from '@prisma/client';
import {
  persistClassification,
  getClassificationState,
  getClassificationHistory,
} from '../../../src/domain/classification/persistence';
import type { ClassificationResult, ClassificationInput } from '../../../src/domain/classification/types';

const prisma = new PrismaClient();

const TICKER = 'MSFT';

// Minimal ClassificationInput — only fields needed to pass the null-gate
const SAMPLE_INPUT: ClassificationInput = {
  revenue_growth_fwd: 0.0724, revenue_growth_3y: 0.1439,
  eps_growth_fwd: 0.0281, eps_growth_3y: 0.2118, gross_profit_growth: 0.1529,
  operating_margin: 0.49, fcf_margin: 0.39, fcf_conversion: 0.6491, roic: 0.2638,
  fcf_positive: true, net_income_positive: true,
  net_debt_to_ebitda: 0.22, interest_coverage: 56.44,
  moat_strength_score: 5, pricing_power_score: 4.5, revenue_recurrence_score: 4.5,
  margin_durability_score: 4.5, capital_intensity_score: 2, qualitative_cyclicality_score: 2,
  holding_company_flag: false, insurer_flag: false, cyclicality_flag: false,
  optionality_flag: false, binary_flag: false, pre_operating_leverage_flag: false,
};

function makeResult(suggested_code: string | null): ClassificationResult {
  return {
    suggested_code,
    bucket: 3,
    eq_grade: 'A',
    bs_grade: 'A',
    confidence_level: 'low',
    reason_codes: ['rev_fwd_primary', 'moat_enrichment_bonus'],
    scores: {
      bucket: { 1: 0, 2: 2, 3: 8, 4: 7, 5: 4, 6: 3, 7: 0, 8: 0 },
      eq: { A: 6, B: 1, C: 0 },
      bs: { A: 5, B: 0, C: 0 },
    },
    missing_field_count: 0,
    confidenceBreakdown: {
      steps: [
        { step: 1, label: 'null-suggestion gate', note: 'passed', band: 'low' },
        { step: 2, label: 'score margin', note: 'margin = 1', band: 'low', missing: 0 },
        { step: 3, label: 'tie-break penalty', note: '1 tie-break(s)', band: 'low', tieBreaks: 1 },
        { step: 4, label: 'missing-field penalty', note: 'missing = 0', band: 'low', missing: 0 },
        { step: 5, label: 'final', note: 'low', band: 'low' },
      ],
    },
    tieBreaksFired: [{
      rule: '3v4', description: 'Bucket 3 vs Bucket 4 tie-break',
      winner: 3, condition: 'fcf_conversion > 0.85 AND roic > 0.20 → B4; else B3',
      values: { fcf_conversion: 0.6491, roic: 0.2638 },
      outcome: 'Bucket 3 chosen: FCF or ROIC below threshold (conservative)',
      marginAtTrigger: 1,
    }],
  };
}

beforeAll(async () => {
  // Clean slate: remove any prior classification state/history for the test ticker
  await prisma.classificationHistory.deleteMany({ where: { ticker: TICKER } });
  await prisma.classificationState.deleteMany({ where: { ticker: TICKER } });
});

afterAll(async () => {
  // Clean up after all tests
  await prisma.classificationHistory.deleteMany({ where: { ticker: TICKER } });
  await prisma.classificationState.deleteMany({ where: { ticker: TICKER } });
  await prisma.$disconnect();
});

describe('EPIC-004/STORY-044/TASK-044-005: persistClassification integration tests', () => {

  describe('(a) First classification — state created, history with old=null', () => {
    it('state row created and history row inserted (null → "3AA" transition)', async () => {
      const result = makeResult('3AA');
      await persistClassification(TICKER, result, SAMPLE_INPUT);

      const state = await prisma.classificationState.findUnique({ where: { ticker: TICKER } });
      expect(state).not.toBeNull();
      expect(state!.suggestedCode).toBe('3AA');
      expect(state!.confidenceLevel).toBe('low');

      const history = await prisma.classificationHistory.findMany({ where: { ticker: TICKER } });
      expect(history).toHaveLength(1);
      expect(history[0].oldSuggestedCode).toBeNull();
      expect(history[0].newSuggestedCode).toBe('3AA');
    });
  });

  describe('(b) Identical re-classification — state updated, no new history', () => {
    it('state updated (new classifiedAt), history count unchanged', async () => {
      const before = await prisma.classificationHistory.count({ where: { ticker: TICKER } });
      const result = makeResult('3AA');

      await new Promise((r) => setTimeout(r, 10)); // ensure classifiedAt differs
      await persistClassification(TICKER, result, SAMPLE_INPUT);

      const after = await prisma.classificationHistory.count({ where: { ticker: TICKER } });
      expect(after).toBe(before); // no new history row

      const state = await prisma.classificationState.findUnique({ where: { ticker: TICKER } });
      expect(state!.suggestedCode).toBe('3AA');
    });
  });

  describe('(c) Code change "3AA" → "4AA" — history row inserted', () => {
    it('history row with old="3AA", new="4AA"', async () => {
      const result = makeResult('4AA');
      await persistClassification(TICKER, result, SAMPLE_INPUT);

      const history = await prisma.classificationHistory.findMany({
        where: { ticker: TICKER },
        orderBy: { classifiedAt: 'desc' },
      });
      expect(history[0].oldSuggestedCode).toBe('3AA');
      expect(history[0].newSuggestedCode).toBe('4AA');
    });
  });

  describe('(d) null → null — no history row inserted', () => {
    it('null→null does not produce a history row', async () => {
      // First set state to null
      const nullResult = makeResult(null);
      await persistClassification(TICKER, nullResult, SAMPLE_INPUT);

      const beforeCount = await prisma.classificationHistory.count({ where: { ticker: TICKER } });

      // Second null classification
      await persistClassification(TICKER, nullResult, SAMPLE_INPUT);

      const afterCount = await prisma.classificationHistory.count({ where: { ticker: TICKER } });
      expect(afterCount).toBe(beforeCount); // no new row for null→null
    });
  });

  describe('(e) non-null → null — history row inserted', () => {
    it('restoring "3AA" then setting null inserts history row', async () => {
      // Restore to "3AA"
      await persistClassification(TICKER, makeResult('3AA'), SAMPLE_INPUT);

      const beforeCount = await prisma.classificationHistory.count({ where: { ticker: TICKER } });

      // Now set to null
      await persistClassification(TICKER, makeResult(null), SAMPLE_INPUT);

      const afterCount = await prisma.classificationHistory.count({ where: { ticker: TICKER } });
      expect(afterCount).toBe(beforeCount + 1);

      const latest = await prisma.classificationHistory.findFirst({
        where: { ticker: TICKER },
        orderBy: { classifiedAt: 'desc' },
      });
      expect(latest!.oldSuggestedCode).toBe('3AA');
      expect(latest!.newSuggestedCode).toBeNull();
    });
  });

  describe('(f) input_snapshot round-trip — JSONB fidelity', () => {
    it('getClassificationState returns input fields with correct numeric precision', async () => {
      await persistClassification(TICKER, makeResult('3AA'), SAMPLE_INPUT);

      const state = await getClassificationState(TICKER);
      expect(state).not.toBeNull();
      expect(state!.input_snapshot.revenue_growth_fwd).toBeCloseTo(0.0724, 6);
      expect(state!.input_snapshot.fcf_conversion).toBeCloseTo(0.6491, 6);
      expect(state!.input_snapshot.net_debt_to_ebitda).toBeCloseTo(0.22, 6);
      expect(state!.input_snapshot.fcf_positive).toBe(true);
    });

    it('context_snapshot in history contains input_snapshot, scores, reason_codes', async () => {
      const history = await getClassificationHistory(TICKER, 1);
      expect(history.length).toBeGreaterThan(0);
      const latest = history[0];
      expect(latest.context_snapshot.input_snapshot).toBeDefined();
      expect(latest.context_snapshot.scores).toBeDefined();
      expect(Array.isArray(latest.context_snapshot.reason_codes)).toBe(true);
    });
  });

  describe('(g) getClassificationHistory — ordering and limit', () => {
    it('returns rows ordered classified_at DESC', async () => {
      const history = await getClassificationHistory(TICKER);
      for (let i = 1; i < history.length; i++) {
        expect(history[i - 1].classified_at.getTime()).toBeGreaterThanOrEqual(
          history[i].classified_at.getTime(),
        );
      }
    });

    it('limit parameter is respected', async () => {
      const all = await getClassificationHistory(TICKER);
      const limited = await getClassificationHistory(TICKER, 1);
      expect(limited).toHaveLength(1);
      if (all.length > 0) expect(limited[0].id).toBe(all[0].id);
    });
  });

  describe('(h) Output contract — shape of returned objects', () => {
    it('getClassificationState returns ClassificationState with all required fields', async () => {
      const state = await getClassificationState(TICKER);
      expect(state).not.toBeNull();
      expect(typeof state!.ticker).toBe('string');
      expect(['high', 'medium', 'low']).toContain(state!.confidence_level);
      expect(Array.isArray(state!.reason_codes)).toBe(true);
      expect(typeof state!.scores).toBe('object');
      expect(typeof state!.input_snapshot).toBe('object');
      expect(state!.classified_at).toBeInstanceOf(Date);
      expect(state!.updated_at).toBeInstanceOf(Date);
    });

    it('getClassificationState returns null for unknown ticker', async () => {
      const state = await getClassificationState('UNKNOWN_TICKER_XYZ');
      expect(state).toBeNull();
    });

    it('getClassificationHistory rows have all required fields', async () => {
      const history = await getClassificationHistory(TICKER);
      expect(history.length).toBeGreaterThan(0);
      for (const row of history) {
        expect(typeof row.id).toBe('string'); // UUID
        expect(typeof row.ticker).toBe('string');
        expect(row.context_snapshot).toBeDefined();
        expect(row.classified_at).toBeInstanceOf(Date);
      }
    });

    it('input_snapshot is always non-null after persistClassification (shouldRecompute contract)', async () => {
      const state = await getClassificationState(TICKER);
      expect(state!.input_snapshot).not.toBeNull();
      expect(state!.input_snapshot).not.toBeUndefined();
    });
  });
});
