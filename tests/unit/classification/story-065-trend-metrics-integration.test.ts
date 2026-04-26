// EPIC-004/STORY-065: Classification Trend Metrics Integration
// RFC-001 Amendment 2026-04-25 (ClassificationTrendMetrics, toClassificationInput extension)
// ADR-016 §shouldRecompute Extension
// TDD: all external dependencies mocked; no live DB calls

import { shouldRecompute } from '../../../src/domain/classification/recompute';
import { toClassificationInput, type DerivedMetricsRow } from '../../../src/domain/classification/input-mapper';
import type { ClassificationInput } from '../../../src/domain/classification/types';

// ── Mock Prisma for batch service tests ───────────────────────────────────────
const mockStockFindMany   = jest.fn();
const mockDerivedFindMany = jest.fn();
const mockGetState        = jest.fn();
const mockPersist         = jest.fn();
const mockClassify        = jest.fn();

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findMany: (...a: unknown[]) => mockStockFindMany(...a) },
    stockDerivedMetrics: { findMany: (...a: unknown[]) => mockDerivedFindMany(...a) },
  },
}));

jest.mock('../../../src/domain/classification/persistence', () => ({
  getClassificationState: (...a: unknown[]) => mockGetState(...a),
  persistClassification:  (...a: unknown[]) => mockPersist(...a),
}));

jest.mock('../../../src/domain/classification/classifier', () => ({
  classifyStock: (...a: unknown[]) => mockClassify(...a),
}));

import { runClassificationBatch } from '../../../src/modules/classification-batch/classification-batch.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    revenue_growth_fwd: 0.10, revenue_growth_3y: 0.12,
    eps_growth_fwd: 0.08, eps_growth_3y: 0.09, gross_profit_growth: 0.11,
    operating_margin: 0.30, fcf_margin: 0.25, fcf_conversion: 0.85, roic: 0.20,
    fcf_positive: true, net_income_positive: true,
    net_debt_to_ebitda: 0.5, interest_coverage: 20.0,
    moat_strength_score: 4.0, pricing_power_score: 3.5, revenue_recurrence_score: 4.5,
    margin_durability_score: 3.5, capital_intensity_score: 2.0, qualitative_cyclicality_score: 2.0,
    holding_company_flag: false, insurer_flag: false, cyclicality_flag: false,
    optionality_flag: false, binary_flag: false, pre_operating_leverage_flag: false,
    ...overrides,
  };
}

function makeStockRow(ticker = 'AAPL') {
  return {
    ticker,
    revenueGrowthFwd: 1000, revenueGrowth3y: 1200, epsGrowthFwd: 800, epsGrowth3y: 900,
    grossProfitGrowth: 1100, operatingMargin: 0.30, fcfMargin: 0.25, fcfConversion: 0.85,
    roic: 0.20, fcfPositive: true, netIncomePositive: true,
    netDebtToEbitda: 0.5, interestCoverage: 20.0,
    moatStrengthScore: 4.0, pricingPowerScore: 3.5, revenueRecurrenceScore: 4.5,
    marginDurabilityScore: 3.5, capitalIntensityScore: 2.0, qualitativeCyclicalityScore: 2.0,
    holdingCompanyFlag: false, insurerFlag: false, cyclicalityFlag: false,
    optionalityFlag: false, binaryFlag: false, preOperatingLeverageFlag: false,
  };
}

function makeDerivedRow(opts: { ticker: string; grossMarginSlope4q?: number | null }) {
  return {
    ticker: opts.ticker,
    quartersAvailable: 8,
    revenueTtm: 392000, grossProfitTtm: 180000, operatingIncomeTtm: 112000,
    netIncomeTtm: 89000, grossMarginSlope4q: opts.grossMarginSlope4q ?? 0.015,
    operatingMarginSlope4q: 0.01, netMarginSlope4q: 0.008,
    grossMarginSlope8q: 0.02, operatingMarginSlope8q: 0.012, netMarginSlope8q: 0.009,
    grossMarginTtm: 0.455, operatingMarginTtm: 0.285, netMarginTtm: 0.227,
    fcfMarginTtm: 0.278, sbcAsPctRevenueTtm: 0.025, cfoToNetIncomeRatioTtm: 1.35,
    capexTtm: -13700, cashFromOperationsTtm: 119750, freeCashFlowTtm: 109000,
    shareBasedCompensationTtm: 9800, depreciationAndAmortizationTtm: 11900,
    operatingMarginStabilityScore: 0.78, grossMarginStabilityScore: 0.82, netMarginStabilityScore: 0.75,
    operatingLeverageRatio: 1.8, operatingIncomeAccelerationFlag: false, operatingLeverageEmergingFlag: true,
    earningsQualityTrendScore: 0.67, deterioratingCashConversionFlag: false,
    dilutedSharesOutstandingChange4q: 0.033, dilutedSharesOutstandingChange8q: 0.05,
    materialDilutionTrendFlag: true, sbcBurdenScore: 0.125,
    capexToRevenueRatioAvg4q: 0.035, capexIntensityIncreasingFlag: false,
  };
}

const mockClassifyResult = {
  suggested_code: '4AA', bucket: 4, eq_grade: 'A', bs_grade: 'A',
  confidence_level: 'high', reason_codes: [], scores: { bucket: {}, eq: {}, bs: {} },
  missing_field_count: 0, confidenceBreakdown: { steps: [] }, tieBreaksFired: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPersist.mockResolvedValue(undefined);
  mockClassify.mockReturnValue(mockClassifyResult);
});

describe('EPIC-004/STORY-065: ClassificationTrendMetrics integration', () => {

  // ── Scenario A: toClassificationInput populates trend_metrics ────────────────

  describe('Scenario A: toClassificationInput with derived metrics', () => {
    test('trend_metrics populated when derived metrics row provided', () => {
      const stock = makeStockRow();
      const derived = makeDerivedRow({ ticker: 'AAPL' });

      const input = toClassificationInput(stock, derived);

      expect(input.trend_metrics).toBeDefined();
      expect(input.trend_metrics?.grossMarginSlope4q).toBeCloseTo(0.015, 4);
      expect(input.trend_metrics?.quartersAvailable).toBe(8);
      expect(input.trend_metrics?.materialDilutionTrendFlag).toBe(true);
    });

    test('trend_metrics absent (field omitted) when no derived metrics row', () => {
      const stock = makeStockRow();

      const input = toClassificationInput(stock);

      expect(input.trend_metrics).toBeUndefined();
    });

    test('trend_metrics absent when derived metrics is null', () => {
      const stock = makeStockRow();

      const input = toClassificationInput(stock, null);

      expect(input.trend_metrics).toBeUndefined();
    });

    test('existing ClassificationInput fields unaffected when derived metrics present', () => {
      const stock = makeStockRow();
      const derived = makeDerivedRow({ ticker: 'AAPL' });

      const input = toClassificationInput(stock, derived);

      expect(input.operating_margin).toBeCloseTo(0.30, 4);
      expect(input.fcf_positive).toBe(true);
      expect(input.holding_company_flag).toBe(false);
    });

    test('boolean flags in trend_metrics preserved as-is', () => {
      const stock = makeStockRow();
      const derived = { ...makeDerivedRow({ ticker: 'AAPL' }), operatingIncomeAccelerationFlag: true };

      const input = toClassificationInput(stock, derived);

      expect(input.trend_metrics?.operatingIncomeAccelerationFlag).toBe(true);
      expect(input.trend_metrics?.deterioratingCashConversionFlag).toBe(false);
    });
  });

  // ── Scenario B: shouldRecompute quarterly_data_updated trigger ────────────────

  describe('Scenario B: shouldRecompute quarterly_data_updated trigger', () => {
    const base = makeInput();

    test('returns true when quarterlyDataUpdated=true (even if nothing else changed)', () => {
      const result = shouldRecompute(base, { ...base }, { quarterlyDataUpdated: true });

      expect(result).toBe(true);
    });

    test('returns true when quarterlyDataUpdated=true with null previous', () => {
      const result = shouldRecompute(base, null, { quarterlyDataUpdated: true });

      expect(result).toBe(true);
    });

    test('returns false when quarterlyDataUpdated=false and no other changes', () => {
      const result = shouldRecompute(base, { ...base }, { quarterlyDataUpdated: false });

      expect(result).toBe(false);
    });

    test('returns true via fundamental_change even when quarterlyDataUpdated=false', () => {
      const curr = makeInput({ revenue_growth_fwd: 0.20 }); // 10% delta > 5% threshold
      const prev = makeInput({ revenue_growth_fwd: 0.10 });

      const result = shouldRecompute(curr, prev, { quarterlyDataUpdated: false });

      expect(result).toBe(true);
    });

    test('existing behavior preserved: null previous → true without opts', () => {
      expect(shouldRecompute(base, null)).toBe(true);
    });

    test('existing behavior preserved: identical inputs → false without opts', () => {
      expect(shouldRecompute(base, { ...base })).toBe(false);
    });
  });

  // ── Scenario C: Batch orchestrator quarterly trigger ─────────────────────────

  describe('Scenario C: batch orchestrator applies quarterly_data_updated trigger', () => {
    test('triggers recompute when derived_as_of is newer than classification updated_at', async () => {
      const classifiedAt = new Date('2026-04-20T00:00:00Z');
      const derivedAsOf  = new Date('2026-04-25T19:00:00Z'); // newer

      mockStockFindMany.mockResolvedValue([makeStockRow('AAPL')]);
      mockDerivedFindMany.mockResolvedValue([{ ticker: 'AAPL', derivedAsOf }]);
      mockGetState.mockResolvedValue({
        input_snapshot: makeInput(),
        updated_at: classifiedAt,
        classified_at: classifiedAt,
      });

      const result = await runClassificationBatch();

      // Recomputed because derived_as_of > classified_at
      expect(result.recomputed).toBe(1);
      expect(result.skipped).toBe(0);
    });

    test('skips recompute when derived_as_of is older than classification updated_at', async () => {
      const derivedAsOf  = new Date('2026-04-15T00:00:00Z'); // older
      const classifiedAt = new Date('2026-04-20T00:00:00Z');

      // previous must match current: growth fields in DB are stored as percentages (1000 = 10%),
      // so after toClassificationInput they become 10.0; makeInput uses 0.10 and wouldn't match.
      const matchingPrevious = toClassificationInput(makeStockRow('AAPL'));

      mockStockFindMany.mockResolvedValue([makeStockRow('AAPL')]);
      mockDerivedFindMany.mockResolvedValue([{ ticker: 'AAPL', derivedAsOf }]);
      mockGetState.mockResolvedValue({
        input_snapshot: matchingPrevious,
        updated_at: classifiedAt,
        classified_at: classifiedAt,
      });

      const result = await runClassificationBatch();

      // No fundamental/flag change AND derived_as_of is older → skip
      expect(result.skipped).toBe(1);
      expect(result.recomputed).toBe(0);
    });

    test('no crash when no derived metrics row exists for ticker', async () => {
      mockStockFindMany.mockResolvedValue([makeStockRow('AAPL')]);
      mockDerivedFindMany.mockResolvedValue([]); // no derived metrics
      mockGetState.mockResolvedValue(null); // first classification

      const result = await runClassificationBatch();

      // previous=null → shouldRecompute returns true
      expect(result.recomputed).toBe(1);
      expect(result.errors).toBe(0);
    });
  });
});
