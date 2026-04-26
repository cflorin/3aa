// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-082: Confidence-Based Valuation Metric Demotion
// TASK-082-008: Persistence mocked unit test — confidence handoff (Scenario 7)

const mockTx = {
  valuationState: { upsert: jest.fn() },
  valuationHistory: { create: jest.fn() },
};

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    classificationState: { findUnique: jest.fn() },
    valuationState: { findUnique: jest.fn(), upsert: jest.fn() },
    anchoredThreshold: { findMany: jest.fn() },
    tsrHurdle: { findMany: jest.fn() },
    stock: { findUnique: jest.fn() },
    valuationHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@/infrastructure/database/prisma';
import { persistValuationState } from '../../../src/modules/valuation/valuation-persistence.service';
import type { AnchoredThresholdRow, TsrHurdleRow } from '../../../src/domain/valuation/types';

// Anchors for both B5 (effective after demotion) and B6 (original)
const ANCHORED: AnchoredThresholdRow[] = [
  { code: '5BA', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit', maxThreshold: 17.0, comfortableThreshold: 15.0, veryGoodThreshold: 13.0, stealThreshold: 11.0 },
  { code: '6BA', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',        maxThreshold: 9.0,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
];

const HURDLES: TsrHurdleRow[] = [
  { bucket: 5, baseHurdleLabel: '14-16%', baseHurdleDefault: 15.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 6, baseHurdleLabel: '18-20%+', baseHurdleDefault: 19.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
];

// Stock with EV/EBIT available (B5 metric after demotion) but also EV/Sales available
const STOCK_6BA = {
  ticker: 'XYZ',
  forwardPe: null,
  forwardEvEbit: 14.0,
  evSales: 6.0,
  trailingPe: null,
  trailingEvEbit: null,
  grossMargin: null,
  shareCountGrowth3y: null,
  epsGrowthFwd: null,
  materialDilutionFlag: false,
  holdingCompanyFlag: false,
  insurerFlag: false,
  cyclicalityFlag: false,
  preOperatingLeverageFlag: false,
  forwardOperatingEarningsExExcessCash: null,
};

const BASE_UPSERT_RESULT = {
  ticker: 'XYZ',
  activeCode: '6BA',
  primaryMetric: 'forward_ev_ebit',
  metricReason: 'bucket_5',
  currentMultiple: 14.0,
  currentMultipleBasis: 'spot',
  maxThreshold: 17.0,
  comfortableThreshold: 15.0,
  veryGoodThreshold: 13.0,
  stealThreshold: 11.0,
  thresholdSource: 'anchored',
  derivedFromCode: null,
  thresholdAdjustments: [],
  baseTsrHurdleLabel: '14-16%',
  baseTsrHurdleDefault: 15.0,
  adjustedTsrHurdle: 14.5,
  hurdleSource: 'default',
  tsrReasonCodes: [],
  valuationZone: 'comfortable_zone',
  valuationStateStatus: 'ready',
  grossMarginAdjustmentApplied: false,
  dilutionAdjustmentApplied: false,
  cyclicalityContextFlag: false,
  version: 1,
  computedAt: new Date(),
  changedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
  mockTx.valuationState.upsert.mockResolvedValue(BASE_UPSERT_RESULT);
  mockTx.valuationHistory.create.mockResolvedValue({});
  (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.anchoredThreshold.findMany as jest.Mock).mockResolvedValue(ANCHORED);
  (prisma.tsrHurdle.findMany as jest.Mock).mockResolvedValue(HURDLES);
  (prisma.stock.findUnique as jest.Mock).mockResolvedValue(STOCK_6BA);
});

describe('EPIC-005/STORY-082/TASK-082-008: persistence confidence handoff', () => {

  // Scenario 7: low confidence → demotion → B5 metric persisted with original B6 activeCode
  it('Scenario 7 — low confidence: persistValuationState uses demoted metric, preserves original activeCode', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({
      suggestedCode: '6BA',
      confidenceLevel: 'low',
    });

    const result = await persistValuationState('XYZ');

    expect(result.status).toBe('updated');

    // activeCode in upsert call must be the original classification code (ADR-007)
    const upsertCall = mockTx.valuationState.upsert.mock.calls[0][0];
    expect(upsertCall.create.activeCode).toBe('6BA');
    expect(upsertCall.update.activeCode).toBe('6BA');

    // metric must be EV/EBIT (B5 after demotion), not EV/Sales (B6)
    expect(upsertCall.create.primaryMetric).toBe('forward_ev_ebit');
    expect(upsertCall.update.primaryMetric).toBe('forward_ev_ebit');

    // thresholds must come from B5 anchor (max=17.0), not B6 (max=9.0)
    expect(Number(upsertCall.create.maxThreshold)).toBe(17.0);
  });

  it('medium confidence: no demotion — EV/Sales used for B6 stock', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({
      suggestedCode: '6BA',
      confidenceLevel: 'medium',
    });

    // Adjust mock upsert return for medium confidence (no demotion)
    mockTx.valuationState.upsert.mockResolvedValue({
      ...BASE_UPSERT_RESULT,
      primaryMetric: 'ev_sales',
      currentMultiple: 6.0,
      maxThreshold: 9.0,
      valuationZone: 'comfortable_zone',
    });

    const result = await persistValuationState('XYZ');
    expect(result.status).toBe('updated');

    const upsertCall = mockTx.valuationState.upsert.mock.calls[0][0];
    expect(upsertCall.create.primaryMetric).toBe('ev_sales');
    expect(Number(upsertCall.create.maxThreshold)).toBe(9.0);
  });

  it('null confidence: no demotion (treats as no confidence signal)', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({
      suggestedCode: '6BA',
      confidenceLevel: null,
    });

    mockTx.valuationState.upsert.mockResolvedValue({
      ...BASE_UPSERT_RESULT,
      primaryMetric: 'ev_sales',
      currentMultiple: 6.0,
      maxThreshold: 9.0,
      valuationZone: 'comfortable_zone',
    });

    const result = await persistValuationState('XYZ');
    expect(result.status).toBe('updated');

    const upsertCall = mockTx.valuationState.upsert.mock.calls[0][0];
    expect(upsertCall.create.primaryMetric).toBe('ev_sales');
  });
});
