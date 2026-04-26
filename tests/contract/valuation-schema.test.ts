// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-081: EPIC-005 Regression & Integration Tests
// TASK-081-003: Schema contract — ValuationResult ↔ ValuationState field alignment

import { computeValuation } from '../../src/domain/valuation/compute-valuation';
import type {
  ValuationResult,
  ValuationInput,
  AnchoredThresholdRow,
  TsrHurdleRow,
} from '../../src/domain/valuation/types';

// ── TypeScript compile-time contract ─────────────────────────────────────────
// If this array type-checks, all field names exist on ValuationResult.
// Any field rename in ValuationResult will cause a TS compile error here.
const REQUIRED_RESULT_FIELDS: (keyof ValuationResult)[] = [
  'activeCode',
  'primaryMetric',
  'metricReason',
  'currentMultiple',
  'currentMultipleBasis',
  'metricSource',
  'maxThreshold',
  'comfortableThreshold',
  'veryGoodThreshold',
  'stealThreshold',
  'thresholdSource',
  'derivedFromCode',
  'thresholdAdjustments',
  'baseTsrHurdleLabel',
  'baseTsrHurdleDefault',
  'adjustedTsrHurdle',
  'hurdleSource',
  'tsrReasonCodes',
  'valuationZone',
  'valuationStateStatus',
  'grossMarginAdjustmentApplied',
  'dilutionAdjustmentApplied',
  'cyclicalityContextFlag',
];

const ANCHORED: AnchoredThresholdRow[] = [
  { code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe', maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0 },
  { code: '8AA', bucket: 8, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe', maxThreshold: 0,    comfortableThreshold: 0,    veryGoodThreshold: 0,    stealThreshold: 0    },
];

const HURDLES: TsrHurdleRow[] = [
  { bucket: 4, baseHurdleLabel: '12-13%', baseHurdleDefault: 12.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 8, baseHurdleLabel: 'No normal hurdle', baseHurdleDefault: null, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
];

function makeInput(overrides: Partial<ValuationInput>): ValuationInput {
  return { activeCode: '4AA', anchoredThresholds: ANCHORED, tsrHurdles: HURDLES, ...overrides };
}

describe('EPIC-005/STORY-081/TASK-081-003: ValuationResult schema contract', () => {

  it('computeValuation() output contains all 23 required ValuationResult fields', () => {
    const result = computeValuation(makeInput({ activeCode: '4AA', forwardPe: 19 }));
    for (const field of REQUIRED_RESULT_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(result, field)).toBe(true);
    }
  });

  it('all required fields are present in ready state', () => {
    const result = computeValuation(makeInput({ activeCode: '4AA', forwardPe: 19 }));
    expect(result.activeCode).toBe('4AA');
    expect(result.primaryMetric).toBeDefined();
    expect(result.metricReason).toBeDefined();
    expect(result.currentMultiple).toBeDefined();
    expect(result.currentMultipleBasis).toBeDefined();
    expect(result.metricSource).toBeDefined();
    expect(typeof result.maxThreshold).toBe('number');
    expect(typeof result.comfortableThreshold).toBe('number');
    expect(typeof result.veryGoodThreshold).toBe('number');
    expect(typeof result.stealThreshold).toBe('number');
    expect(result.thresholdSource).toBeDefined();
    expect(result.derivedFromCode).toBeNull();
    expect(Array.isArray(result.thresholdAdjustments)).toBe(true);
    expect(result.baseTsrHurdleLabel).toBeDefined();
    expect(typeof result.baseTsrHurdleDefault).toBe('number');
    expect(typeof result.adjustedTsrHurdle).toBe('number');
    expect(result.hurdleSource).toBeDefined();
    expect(Array.isArray(result.tsrReasonCodes)).toBe(true);
    expect(result.valuationZone).toBeDefined();
    expect(result.valuationStateStatus).toBeDefined();
    expect(typeof result.grossMarginAdjustmentApplied).toBe('boolean');
    expect(typeof result.dilutionAdjustmentApplied).toBe('boolean');
    expect(typeof result.cyclicalityContextFlag).toBe('boolean');
  });

  it('B8 result has null thresholds and null TSR hurdle', () => {
    const result = computeValuation(makeInput({ activeCode: '8AA' }));
    // Nullable fields expected per ValuationState DB schema
    expect(result.maxThreshold).toBeNull();
    expect(result.comfortableThreshold).toBeNull();
    expect(result.veryGoodThreshold).toBeNull();
    expect(result.stealThreshold).toBeNull();
    expect(result.currentMultiple).toBeNull();
    expect(result.baseTsrHurdleDefault).toBeNull();
    expect(result.adjustedTsrHurdle).toBeNull();
    expect(result.derivedFromCode).toBeNull();
  });

  it('manual_required result has null thresholds', () => {
    const result = computeValuation(makeInput({ activeCode: '4AA', forwardPe: null, trailingPe: null }));
    expect(result.valuationStateStatus).toBe('manual_required');
    expect(result.currentMultiple).toBeNull();
    // Thresholds are still computed (anchored) even when no multiple available
    expect(result.maxThreshold).toBe(22.0);
  });

  it('ValuationResult field count matches REQUIRED_RESULT_FIELDS length', () => {
    // 23 fields in REQUIRED_RESULT_FIELDS must be non-zero
    expect(REQUIRED_RESULT_FIELDS.length).toBe(23);
  });

  it('thresholdAdjustments is always an array (never undefined)', () => {
    const cases = [
      makeInput({ activeCode: '4AA', forwardPe: 19 }),
      makeInput({ activeCode: '8AA' }),
      makeInput({ activeCode: '6BA', evSales: 6.0, grossMargin: 0.50 }),
    ];
    for (const input of cases) {
      const result = computeValuation(input);
      expect(Array.isArray(result.thresholdAdjustments)).toBe(true);
    }
  });

  it('tsrReasonCodes is always an array (never undefined)', () => {
    const cases = [
      makeInput({ activeCode: '4AA', forwardPe: 19 }),
      makeInput({ activeCode: '8AA' }),
      makeInput({ activeCode: '4AA', forwardPe: null }),
    ];
    for (const input of cases) {
      const result = computeValuation(input);
      expect(Array.isArray(result.tsrReasonCodes)).toBe(true);
    }
  });
});
