// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-081: EPIC-005 Regression & Integration Tests
// TASK-081-006: persistValuationState — shouldRecompute guard + compute + upsert contract

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
import {
  persistValuationState,
  getValuationState,
} from '../../../src/modules/valuation/valuation-persistence.service';
import type { AnchoredThresholdRow, TsrHurdleRow } from '../../../src/domain/valuation/types';

const ANCHORED: AnchoredThresholdRow[] = [
  { code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe', maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0 },
];

const HURDLES: TsrHurdleRow[] = [
  { bucket: 4, baseHurdleLabel: '12-13%', baseHurdleDefault: 12.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
];

const STOCK_4AA = {
  ticker: 'TEST',
  forwardPe: 19,
  forwardEvEbit: null,
  evSales: null,
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

const UPSERT_RESULT = {
  ticker: 'TEST',
  activeCode: '4AA',
  primaryMetric: 'forward_pe',
  metricReason: 'bucket_1_4_default',
  currentMultiple: 19,
  currentMultipleBasis: 'spot',
  maxThreshold: 22.0,
  comfortableThreshold: 20.0,
  veryGoodThreshold: 18.0,
  stealThreshold: 16.0,
  thresholdSource: 'anchored',
  derivedFromCode: null,
  thresholdAdjustments: [],
  baseTsrHurdleLabel: '12-13%',
  baseTsrHurdleDefault: 12.5,
  adjustedTsrHurdle: 11.0,
  hurdleSource: 'default',
  tsrReasonCodes: ['bucket_4_base', 'eq_A_adj', 'bs_A_adj'],
  valuationZone: 'comfortable_zone',
  valuationStateStatus: 'ready',
  grossMarginAdjustmentApplied: false,
  dilutionAdjustmentApplied: false,
  cyclicalityContextFlag: false,
  metricSource: 'forward_pe',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.valuationState.upsert.mockResolvedValue(UPSERT_RESULT);
  mockTx.valuationHistory.create.mockResolvedValue({});
  (prisma.anchoredThreshold.findMany as jest.Mock).mockResolvedValue(ANCHORED);
  (prisma.tsrHurdle.findMany as jest.Mock).mockResolvedValue(HURDLES);
  (prisma.stock.findUnique as jest.Mock).mockResolvedValue(STOCK_4AA);
  (prisma.valuationState.upsert as jest.Mock).mockResolvedValue(UPSERT_RESULT);
  (prisma.valuationHistory.create as jest.Mock).mockResolvedValue({});
  // $transaction executes the callback with the tx proxy
  (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx));
});

describe('EPIC-005/STORY-081/TASK-081-006: persistValuationState — guard + compute + upsert', () => {

  // ── Status: updated (first compute, no prior state) ───────────────────────────

  it('Returns status=updated when no prior state (first compute)', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await persistValuationState('TEST');

    expect(result.status).toBe('updated');
    expect(result.ticker).toBe('TEST');
    expect(mockTx.valuationState.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockTx.valuationState.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ ticker: 'TEST' });
    expect(upsertCall.create.activeCode).toBe('4AA');
    expect(upsertCall.create.valuationZone).toBe('comfortable_zone');
  });

  // ── Status: skipped (prior state matches current — shouldRecompute=false) ─────

  it('Returns status=skipped when prior state unchanged (shouldRecompute=false)', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: 19,       // same as current
      adjustedTsrHurdle: 11.0,
      valuationZone: 'comfortable_zone',
      version: 2,
    });

    const result = await persistValuationState('TEST');

    expect(result.status).toBe('skipped');
    expect(mockTx.valuationState.upsert).not.toHaveBeenCalled();
  });

  // ── Status: updated when multiple changes ≥5% ────────────────────────────────

  it('Recomputes and returns status=updated when multiple changed ≥5%', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: 15,   // was 15, now 19 = 26.7% change
      adjustedTsrHurdle: 11.0,
      valuationZone: 'steal_zone',
      version: 1,
    });

    const result = await persistValuationState('TEST');

    expect(result.status).toBe('updated');
    expect(mockTx.valuationState.upsert).toHaveBeenCalledTimes(1);
  });

  // ── Force flag bypasses shouldRecompute guard ─────────────────────────────────

  it('Force=true bypasses shouldRecompute guard and always recomputes', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: 19,   // unchanged — would normally skip
      adjustedTsrHurdle: 11.0,
      valuationZone: 'comfortable_zone',
      version: 3,
    });

    const result = await persistValuationState('TEST', { force: true });

    expect(result.status).toBe('updated');
    expect(mockTx.valuationState.upsert).toHaveBeenCalledTimes(1);
  });

  // ── Status: error when classification missing ─────────────────────────────────

  it('Returns status=error when no classificationState found', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await persistValuationState('TEST');

    expect(result.status).toBe('error');
    expect(result.reason).toBe('classification_required');
    expect(prisma.valuationState.upsert).not.toHaveBeenCalled();
  });

  // ── Status: error when stock not found ────────────────────────────────────────

  it('Returns status=error when stock record not found', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await persistValuationState('TEST');

    expect(result.status).toBe('error');
    expect(result.reason).toBe('stock_not_found');
  });

  // ── ADR-007: upsert uses suggestedCode, not userClassificationOverride ─────────

  it('Upsert create uses suggestedCode (4AA) from classificationState, not any other code', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue(null);

    await persistValuationState('TEST');

    const upsertCall = mockTx.valuationState.upsert.mock.calls[0][0];
    expect(upsertCall.create.activeCode).toBe('4AA');
    expect(upsertCall.update.activeCode).toBe('4AA');
  });

  // ── getValuationState: returns null for unknown ticker ────────────────────────

  it('getValuationState returns null for unknown ticker', async () => {
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getValuationState('UNKNOWN');

    expect(result).toBeNull();
    expect(prisma.valuationState.findUnique).toHaveBeenCalledWith({ where: { ticker: 'UNKNOWN' } });
  });
});
