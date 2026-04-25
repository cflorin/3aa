// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-076: Valuation State Persistence & History
// TASK-076-005: Unit tests — persistence service (mocked Prisma)
// Fixtures: synthetic

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findUnique: jest.fn() },
    anchoredThreshold: { findMany: jest.fn() },
    tsrHurdle: { findMany: jest.fn() },
    classificationState: { findUnique: jest.fn() },
    valuationState: { findUnique: jest.fn(), upsert: jest.fn() },
    valuationHistory: { create: jest.fn(), findMany: jest.fn() },
    userClassificationOverride: { findUnique: jest.fn() },
    userValuationOverride: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@/infrastructure/database/prisma';
import {
  loadValuationInput,
  persistValuationState,
  getValuationState,
  getValuationHistory,
  getPersonalizedValuation,
} from '@/modules/valuation/valuation-persistence.service';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ANCHORS = [
  {
    code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A',
    primaryMetric: 'forward_pe',
    maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0,
  },
  {
    code: '4BA', bucket: 4, earningsQuality: 'B', balanceSheetQuality: 'A',
    primaryMetric: 'forward_pe',
    maxThreshold: 14.5, comfortableThreshold: 13.0, veryGoodThreshold: 11.5, stealThreshold: 10.0,
  },
];

const TSR_HURDLES = [
  {
    bucket: 4, baseHurdleLabel: '12-13%', baseHurdleDefault: 12.50,
    earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5,
    balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75,
  },
];

const STOCK_AAPL = {
  ticker: 'AAPL',
  forwardPe: 20.0,
  forwardEvEbit: null,
  evSales: null,
  trailingPe: 22.0,
  trailingEvEbit: null,
  grossMargin: 0.45,
  shareCountGrowth3y: 2.0,   // 2% → 0.02 after ÷100
  epsGrowthFwd: 8.0,
  materialDilutionFlag: false,
  holdingCompanyFlag: false,
  insurerFlag: false,
  cyclicalityFlag: false,
  preOperatingLeverageFlag: false,
  forwardOperatingEarningsExExcessCash: null,
};

function setupMocks(overrides: Record<string, unknown> = {}) {
  (prisma.anchoredThreshold.findMany as jest.Mock).mockResolvedValue(ANCHORS);
  (prisma.tsrHurdle.findMany as jest.Mock).mockResolvedValue(TSR_HURDLES);
  (prisma.stock.findUnique as jest.Mock).mockResolvedValue({ ...STOCK_AAPL, ...overrides });
  (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
  (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.userClassificationOverride.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.userValuationOverride.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      valuationState: { upsert: jest.fn().mockResolvedValue({}) },
      valuationHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    await fn(tx);
    return tx;
  });
}

beforeEach(() => jest.clearAllMocks());

// ── loadValuationInput ────────────────────────────────────────────────────────

describe('EPIC-005/STORY-076/TASK-076-001: loadValuationInput', () => {
  it('returns null when stock not found', async () => {
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.anchoredThreshold.findMany as jest.Mock).mockResolvedValue(ANCHORS);
    (prisma.tsrHurdle.findMany as jest.Mock).mockResolvedValue(TSR_HURDLES);

    const result = await loadValuationInput('UNKNOWN', '4AA');
    expect(result).toBeNull();
  });

  it('assembles ValuationInput with correct field mappings', async () => {
    setupMocks();
    const result = await loadValuationInput('AAPL', '4AA');

    expect(result).not.toBeNull();
    expect(result!.activeCode).toBe('4AA');
    expect(result!.forwardPe).toBe(20.0);
    expect(result!.grossMargin).toBe(0.45);
    // shareCountGrowth3y: 2.0 in DB → 0.02 in domain (÷100)
    expect(result!.shareCountGrowth3y).toBeCloseTo(0.02);
    expect(result!.anchoredThresholds).toHaveLength(2);
    expect(result!.tsrHurdles).toHaveLength(1);
  });

  it('converts Decimal fields to numbers', async () => {
    setupMocks({ forwardPe: { toNumber: () => 18.5 } as unknown });
    // Prisma Decimal objects expose Number() conversion
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue({
      ...STOCK_AAPL,
      forwardPe: '18.50', // simulated Prisma Decimal string
    });
    const result = await loadValuationInput('AAPL', '4AA');
    expect(typeof result!.forwardPe).toBe('number');
  });

  it('passes activeCode as supplied (not derived from DB)', async () => {
    setupMocks();
    const result = await loadValuationInput('AAPL', '4BA');
    expect(result!.activeCode).toBe('4BA');
  });
});

// ── persistValuationState ─────────────────────────────────────────────────────

describe('EPIC-005/STORY-076/TASK-076-002: persistValuationState', () => {
  it('returns error when no classification_state exists', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await persistValuationState('AAPL');
    expect(result.status).toBe('error');
    expect(result.reason).toContain('classification_required');
  });

  it('returns error when stock not found', async () => {
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.anchoredThreshold.findMany as jest.Mock).mockResolvedValue(ANCHORS);
    (prisma.tsrHurdle.findMany as jest.Mock).mockResolvedValue(TSR_HURDLES);

    const result = await persistValuationState('AAPL');
    expect(result.status).toBe('error');
    expect(result.reason).toBe('stock_not_found');
  });

  it('upserts valuation_state and returns updated when prior state is null', async () => {
    setupMocks();
    const result = await persistValuationState('AAPL');

    expect(result.status).toBe('updated');
    expect(result.zone).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns skipped when shouldRecompute=false and force=false', async () => {
    setupMocks();
    // Set prior state with same code and similar multiple
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: '20.0',       // same as STOCK_AAPL.forwardPe=20.0
      adjustedTsrHurdle: '11.0',
      valuationZone: 'comfortable_zone',
      version: 3,
    });

    const result = await persistValuationState('AAPL', { force: false });
    expect(result.status).toBe('skipped');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('forces recompute when force=true even if nothing changed', async () => {
    setupMocks();
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: '20.0',
      adjustedTsrHurdle: '11.0',
      valuationZone: 'comfortable_zone',
      version: 3,
    });

    const result = await persistValuationState('AAPL', { force: true });
    expect(result.status).toBe('updated');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('appends history row when zone changes', async () => {
    setupMocks();
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: '30.0',      // previously high multiple
      adjustedTsrHurdle: '11.0',
      valuationZone: 'above_max',   // prior zone was above_max
      version: 2,
    });

    let historyCreated = false;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        valuationState: { upsert: jest.fn().mockResolvedValue({}) },
        valuationHistory: {
          create: jest.fn().mockImplementation(() => {
            historyCreated = true;
            return Promise.resolve({});
          }),
        },
      };
      await fn(tx);
    });

    await persistValuationState('AAPL', { force: true });
    expect(historyCreated).toBe(true);
  });

  it('does NOT append history row when zone is unchanged', async () => {
    setupMocks();
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: '20.0',
      adjustedTsrHurdle: '11.0',
      valuationZone: 'comfortable_zone',
      version: 5,
    });

    let historyCreated = false;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        valuationState: { upsert: jest.fn().mockResolvedValue({}) },
        valuationHistory: {
          create: jest.fn().mockImplementation(() => {
            historyCreated = true;
            return Promise.resolve({});
          }),
        },
      };
      await fn(tx);
    });

    // Force recompute but zone will be same (forwardPe=20 → comfortable with 4AA thresholds)
    await persistValuationState('AAPL', { force: true });
    expect(historyCreated).toBe(false);
  });

  it('increments version on upsert', async () => {
    setupMocks();
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({
      activeCode: '4AA', primaryMetric: 'forward_pe',
      currentMultiple: '30.0', adjustedTsrHurdle: '11.0',
      valuationZone: 'above_max', version: 7,
    });

    let upsertData: Record<string, unknown> | null = null;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        valuationState: {
          upsert: jest.fn().mockImplementation((args: { create: Record<string, unknown> }) => {
            upsertData = args.create;
            return Promise.resolve({});
          }),
        },
        valuationHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      await fn(tx);
    });

    await persistValuationState('AAPL', { force: true });
    expect(upsertData?.version).toBe(8);
  });
});

// ── getPersonalizedValuation ──────────────────────────────────────────────────

describe('EPIC-005/STORY-076/TASK-076-003: getPersonalizedValuation', () => {
  const SYSTEM_STATE = {
    ticker: 'AAPL',
    activeCode: '4AA',
    primaryMetric: 'forward_pe',
    metricReason: 'bucket_4',
    currentMultiple: '20.0',
    currentMultipleBasis: 'spot',
    maxThreshold: '22.0',
    comfortableThreshold: '20.0',
    veryGoodThreshold: '18.0',
    stealThreshold: '16.0',
    thresholdSource: 'anchored',
    derivedFromCode: null,
    thresholdAdjustments: [],
    baseTsrHurdleLabel: '12-13%',
    baseTsrHurdleDefault: '12.5',
    adjustedTsrHurdle: '11.0',
    hurdleSource: 'default',
    tsrReasonCodes: ['bucket_4_base'],
    valuationZone: 'comfortable_zone',
    valuationStateStatus: 'ready',
    valuationOverrideReason: null,
    valuationOverrideTimestamp: null,
    valuationLastUpdatedAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue(SYSTEM_STATE);
    (prisma.anchoredThreshold.findMany as jest.Mock).mockResolvedValue(ANCHORS);
    (prisma.tsrHurdle.findMany as jest.Mock).mockResolvedValue(TSR_HURDLES);
    (prisma.stock.findUnique as jest.Mock).mockResolvedValue(STOCK_AAPL);
    (prisma.userClassificationOverride.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.userValuationOverride.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.classificationState.findUnique as jest.Mock).mockResolvedValue({ suggestedCode: '4AA' });
  });

  it('returns system state directly when no override exists', async () => {
    const result = await getPersonalizedValuation('AAPL', 'user-1');
    expect(result.hasUserOverride).toBe(false);
    expect(result.systemState).toEqual(SYSTEM_STATE);
    // userResult mirrors system state (no recompute)
    expect(result.userResult?.activeCode).toBe('4AA');
    expect(result.userResult?.valuationZone).toBe('comfortable_zone');
  });

  it('recomputes with finalCode when classification override exists', async () => {
    (prisma.userClassificationOverride.findUnique as jest.Mock).mockResolvedValue({
      userId: 'user-1', ticker: 'AAPL', finalCode: '4BA',
    });

    const result = await getPersonalizedValuation('AAPL', 'user-1');
    expect(result.hasUserOverride).toBe(true);
    expect(result.userClassificationOverrideCode).toBe('4BA');
    // 4BA anchored thresholds: max=14.5 — with forwardPe=20, zone=above_max
    expect(result.userResult?.activeCode).toBe('4BA');
    expect(result.userResult?.valuationZone).toBe('above_max');
    // systemState is unchanged
    expect(result.systemState?.activeCode).toBe('4AA');
  });

  it('applies threshold overrides from UserValuationOverride', async () => {
    (prisma.userValuationOverride.findUnique as jest.Mock).mockResolvedValue({
      userId: 'user-1', ticker: 'AAPL',
      maxThreshold: '30.0', comfortableThreshold: '27.0',
      veryGoodThreshold: '18.0', stealThreshold: '15.0',
      primaryMetricOverride: null,
      forwardOperatingEarningsExExcessCash: null,
      notes: null,
    });

    const result = await getPersonalizedValuation('AAPL', 'user-1');
    expect(result.hasUserOverride).toBe(true);
    expect(result.userResult?.thresholdSource).toBe('manual_override');
    expect(result.userResult?.maxThreshold).toBe(30.0);
    // forwardPe=20: 18 < 20 ≤ 27 → comfortable_zone
    expect(result.userResult?.valuationZone).toBe('comfortable_zone');
  });

  it('systemState is not modified by override (isolation check)', async () => {
    (prisma.userValuationOverride.findUnique as jest.Mock).mockResolvedValue({
      userId: 'user-1', ticker: 'AAPL',
      maxThreshold: '30.0', comfortableThreshold: '27.0',
      veryGoodThreshold: '18.0', stealThreshold: '15.0',
      primaryMetricOverride: null, forwardOperatingEarningsExExcessCash: null, notes: null,
    });

    const result = await getPersonalizedValuation('AAPL', 'user-1');
    expect(result.systemState?.maxThreshold).toBe('22.0');  // unchanged
    expect(result.systemState?.valuationZone).toBe('comfortable_zone');
  });
});

// ── Read models ───────────────────────────────────────────────────────────────

describe('EPIC-005/STORY-076/TASK-076-004: read models', () => {
  it('getValuationState calls prisma findUnique', async () => {
    (prisma.valuationState.findUnique as jest.Mock).mockResolvedValue({ ticker: 'AAPL' });
    const result = await getValuationState('AAPL');
    expect(result).toEqual({ ticker: 'AAPL' });
    expect(prisma.valuationState.findUnique).toHaveBeenCalledWith({ where: { ticker: 'AAPL' } });
  });

  it('getValuationHistory returns ordered rows with default limit 20', async () => {
    (prisma.valuationHistory.findMany as jest.Mock).mockResolvedValue([{ id: 1n }]);
    await getValuationHistory('AAPL');
    expect(prisma.valuationHistory.findMany).toHaveBeenCalledWith({
      where: { ticker: 'AAPL' },
      orderBy: { changedAt: 'desc' },
      take: 20,
    });
  });

  it('getValuationHistory respects custom limit', async () => {
    (prisma.valuationHistory.findMany as jest.Mock).mockResolvedValue([]);
    await getValuationHistory('AAPL', 5);
    expect(prisma.valuationHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });
});
