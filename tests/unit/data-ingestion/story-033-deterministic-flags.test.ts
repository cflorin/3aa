// EPIC-003: Data Ingestion & Universe Management
// STORY-033: Deterministic Classification Flags
// TASK-033-004: Unit tests — computeDeterministicFlags, syncDeterministicClassificationFlags,
//               admin route
//
// All fixtures: synthetic (no live API calls)

import { POST } from '../../../src/app/api/admin/sync/deterministic-flags/route';
import { NextRequest } from 'next/server';

// ─── Module mocks (must be at top level for jest hoisting) ────────────────────

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('@/lib/admin-auth', () => ({
  validateAdminApiKey: jest.fn(),
}));

jest.mock('../../../src/modules/data-ingestion/jobs/deterministic-classification-sync.service', () => ({
  computeDeterministicFlags: jest.fn(),
  syncDeterministicClassificationFlags: jest.fn(),
}));

import { prisma } from '@/infrastructure/database/prisma';
import { validateAdminApiKey } from '@/lib/admin-auth';
import type {
  DeterministicFlagsInput,
  DeterministicFlagsResult,
} from '../../../src/modules/data-ingestion/jobs/deterministic-classification-sync.service';

// ─── Helper: simulate Prisma Decimal ─────────────────────────────────────────

const d = (v: number) => ({ toNumber: () => v, toString: () => String(v) });

// ─── computeDeterministicFlags() ─────────────────────────────────────────────

describe('EPIC-003/STORY-033: computeDeterministicFlags()', () => {
  let computeDeterministicFlags: (input: DeterministicFlagsInput) => DeterministicFlagsResult;

  beforeAll(() => {
    computeDeterministicFlags = jest.requireActual(
      '../../../src/modules/data-ingestion/jobs/deterministic-classification-sync.service',
    ).computeDeterministicFlags;
  });

  // ── materialDilutionFlag ────────────────────────────────────────────────────

  it('materialDilutionFlag: null when shareCountGrowth3y is null', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.materialDilutionFlag).toBeNull();
  });

  it('materialDilutionFlag: FALSE at exactly 5.00% (threshold exclusive)', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: 0.05, revenueTtm: null, earningsTtm: null });
    expect(r.materialDilutionFlag).toBe(false);
  });

  it('materialDilutionFlag: TRUE at 5.01%', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: 0.0501, revenueTtm: null, earningsTtm: null });
    expect(r.materialDilutionFlag).toBe(true);
  });

  it('materialDilutionFlag: FALSE for negative CAGR (buybacks)', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: -0.04, revenueTtm: null, earningsTtm: null });
    expect(r.materialDilutionFlag).toBe(false);
  });

  // ── insurerFlag ────────────────────────────────────────────────────────────

  it('insurerFlag: null when industry is null', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBeNull();
  });

  it('insurerFlag: TRUE for "Insurance - Life"', () => {
    const r = computeDeterministicFlags({ industry: 'Insurance - Life', shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBe(true);
  });

  it('insurerFlag: TRUE for "Insurance - Property & Casualty"', () => {
    const r = computeDeterministicFlags({ industry: 'Insurance - Property & Casualty', shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBe(true);
  });

  it('insurerFlag: TRUE for "Insurance - Reinsurance"', () => {
    const r = computeDeterministicFlags({ industry: 'Insurance - Reinsurance', shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBe(true);
  });

  it('insurerFlag: TRUE for "Managed Care" (Cigna/UHC case)', () => {
    const r = computeDeterministicFlags({ industry: 'Managed Care', shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBe(true);
  });

  it('insurerFlag: TRUE for "Health Insurance"', () => {
    const r = computeDeterministicFlags({ industry: 'Health Insurance', shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBe(true);
  });

  it('insurerFlag: FALSE for "Diversified Financial Services" (no false positive)', () => {
    const r = computeDeterministicFlags({ industry: 'Diversified Financial Services', shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBe(false);
  });

  it('insurerFlag: case-insensitive match for "MANAGED CARE"', () => {
    const r = computeDeterministicFlags({ industry: 'MANAGED CARE', shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.insurerFlag).toBe(true);
  });

  // ── preOperatingLeverageFlag ────────────────────────────────────────────────

  it('preOperatingLeverageFlag: null when revenueTtm is null', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: null, earningsTtm: null });
    expect(r.preOperatingLeverageFlag).toBeNull();
  });

  it('preOperatingLeverageFlag: TRUE when revenueTtm < $50M', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: 30_000_000, earningsTtm: null });
    expect(r.preOperatingLeverageFlag).toBe(true);
  });

  it('preOperatingLeverageFlag: TRUE when revenueTtm < $200M and earningsTtm < 0', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: 100_000_000, earningsTtm: -5_000_000 });
    expect(r.preOperatingLeverageFlag).toBe(true);
  });

  it('preOperatingLeverageFlag: FALSE when revenueTtm < $200M but earningsTtm is null', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: 100_000_000, earningsTtm: null });
    expect(r.preOperatingLeverageFlag).toBe(false);
  });

  it('preOperatingLeverageFlag: FALSE when revenueTtm < $200M and earningsTtm > 0', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: 100_000_000, earningsTtm: 10_000_000 });
    expect(r.preOperatingLeverageFlag).toBe(false);
  });

  it('preOperatingLeverageFlag: FALSE when revenueTtm >= $200M even with loss', () => {
    const r = computeDeterministicFlags({ industry: null, shareCountGrowth3y: null, revenueTtm: 500_000_000, earningsTtm: -10_000_000 });
    expect(r.preOperatingLeverageFlag).toBe(false);
  });

  // ── BUG-CE-003: large-cap operating leverage rule ──────────────────────────

  it('[BUG-CE-003] preOperatingLeverageFlag: TRUE for large profitable company with op margin < 15%', () => {
    // TSLA-like: $94.8B revenue, $3.8B earnings, 6% operating margin
    const r = computeDeterministicFlags({
      industry: 'Auto - Manufacturers',
      shareCountGrowth3y: null,
      revenueTtm: 94_800_000_000,
      earningsTtm: 3_800_000_000,
      operatingMargin: 0.06,
    });
    expect(r.preOperatingLeverageFlag).toBe(true);
  });

  it('[BUG-CE-003] preOperatingLeverageFlag: TRUE for UBER-like (12% op margin, $52B revenue)', () => {
    const r = computeDeterministicFlags({
      industry: 'Software - Application',
      shareCountGrowth3y: null,
      revenueTtm: 52_000_000_000,
      earningsTtm: 10_100_000_000,
      operatingMargin: 0.12,
    });
    expect(r.preOperatingLeverageFlag).toBe(true);
  });

  it('[BUG-CE-003] preOperatingLeverageFlag: FALSE for healthcare plan (structural thin margins excluded)', () => {
    // UNH-like: $447.6B revenue, $12.1B earnings, 4% operating margin — excluded by industry
    const r = computeDeterministicFlags({
      industry: 'Medical - Healthcare Plans',
      shareCountGrowth3y: null,
      revenueTtm: 447_600_000_000,
      earningsTtm: 12_100_000_000,
      operatingMargin: 0.04,
    });
    expect(r.preOperatingLeverageFlag).toBe(false);
  });

  it('[BUG-CE-003] preOperatingLeverageFlag: FALSE when op margin >= 15% (already achieved)', () => {
    const r = computeDeterministicFlags({
      industry: 'Software - Infrastructure',
      shareCountGrowth3y: null,
      revenueTtm: 50_000_000_000,
      earningsTtm: 10_000_000_000,
      operatingMargin: 0.20,
    });
    expect(r.preOperatingLeverageFlag).toBe(false);
  });

  it('[BUG-CE-003] preOperatingLeverageFlag: FALSE when op margin <= 0 (unprofitable large-cap)', () => {
    const r = computeDeterministicFlags({
      industry: 'Software - Application',
      shareCountGrowth3y: null,
      revenueTtm: 50_000_000_000,
      earningsTtm: -1_000_000_000,
      operatingMargin: -0.02,
    });
    expect(r.preOperatingLeverageFlag).toBe(false);
  });

  it('[BUG-CE-003] preOperatingLeverageFlag: FALSE when operatingMargin omitted (optional field)', () => {
    const r = computeDeterministicFlags({
      industry: 'Software - Application',
      shareCountGrowth3y: null,
      revenueTtm: 50_000_000_000,
      earningsTtm: 5_000_000_000,
      // operatingMargin not provided → large-cap rule does not fire
    });
    expect(r.preOperatingLeverageFlag).toBe(false);
  });
});

// ─── syncDeterministicClassificationFlags() ──────────────────────────────────

describe('EPIC-003/STORY-033: syncDeterministicClassificationFlags() service', () => {
  let realSync: () => Promise<{ updated: number; skipped: number }>;

  beforeAll(() => {
    realSync = jest.requireActual(
      '../../../src/modules/data-ingestion/jobs/deterministic-classification-sync.service',
    ).syncDeterministicClassificationFlags;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.stock.update as jest.Mock).mockResolvedValue({});
  });

  it('writes all three non-null flags with correct provenance shape', async () => {
    (prisma.stock.findMany as jest.Mock).mockResolvedValue([
      {
        ticker: 'AAPL',
        industry: 'Technology',
        shareCountGrowth3y: d(-0.04),    // buybacks → materialDilutionFlag = false
        revenueTtm: d(400_000_000_000),  // large revenue, high margin → preOperatingLeverageFlag = false
        earningsTtm: d(100_000_000_000),
        operatingMargin: d(0.30),        // 30% op margin → above 15% threshold
        dataProviderProvenance: { existing_key: { provider: 'tiingo' } },
      },
    ]);

    const result = await realSync();

    expect(result).toEqual({ updated: 1, skipped: 0 });
    expect(prisma.stock.update).toHaveBeenCalledTimes(1);

    const call = (prisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ ticker: 'AAPL' });
    expect(call.data.materialDilutionFlag).toBe(false);
    expect(call.data.insurerFlag).toBe(false);
    expect(call.data.preOperatingLeverageFlag).toBe(false);

    const prov = call.data.dataProviderProvenance as Record<string, unknown>;
    // Existing key preserved
    expect((prov['existing_key'] as Record<string, unknown>)['provider']).toBe('tiingo');
    // Each flag has provenance
    for (const key of ['material_dilution_flag', 'insurer_flag', 'pre_operating_leverage_flag']) {
      const fp = prov[key] as Record<string, unknown>;
      expect(fp['provider']).toBe('deterministic_heuristic');
      expect(fp['method']).toBe('rule_based');
      expect(typeof fp['synced_at']).toBe('string');
    }
  });

  it('skips stock when all flags resolve to null (all inputs null)', async () => {
    (prisma.stock.findMany as jest.Mock).mockResolvedValue([
      {
        ticker: 'EMPTY',
        industry: null,
        shareCountGrowth3y: null,
        revenueTtm: null,
        earningsTtm: null,
        operatingMargin: null,
        dataProviderProvenance: {},
      },
    ]);

    const result = await realSync();

    expect(result).toEqual({ updated: 0, skipped: 1 });
    expect(prisma.stock.update).not.toHaveBeenCalled();
  });

  it('partial write: only non-null flags written when some inputs are null', async () => {
    (prisma.stock.findMany as jest.Mock).mockResolvedValue([
      {
        ticker: 'CI',
        industry: 'Managed Care',     // insurerFlag = true → written
        shareCountGrowth3y: null,      // materialDilutionFlag = null → NOT written
        revenueTtm: null,              // preOperatingLeverageFlag = null → NOT written
        earningsTtm: null,
        operatingMargin: null,
        dataProviderProvenance: {},
      },
    ]);

    const result = await realSync();

    expect(result).toEqual({ updated: 1, skipped: 0 });
    const call = (prisma.stock.update as jest.Mock).mock.calls[0][0];
    expect(call.data.insurerFlag).toBe(true);
    expect(call.data.materialDilutionFlag).toBeUndefined();
    expect(call.data.preOperatingLeverageFlag).toBeUndefined();

    const prov = call.data.dataProviderProvenance as Record<string, unknown>;
    expect(prov['insurer_flag']).toBeDefined();
    expect(prov['material_dilution_flag']).toBeUndefined();
    expect(prov['pre_operating_leverage_flag']).toBeUndefined();
  });
});

// ─── Admin route ─────────────────────────────────────────────────────────────

describe('EPIC-003/STORY-033: POST /api/admin/sync/deterministic-flags', () => {
  // syncDeterministicClassificationFlags is mocked at top level

  beforeEach(() => {
    jest.clearAllMocks();
    const { syncDeterministicClassificationFlags } = jest.requireMock(
      '../../../src/modules/data-ingestion/jobs/deterministic-classification-sync.service',
    ) as { syncDeterministicClassificationFlags: jest.Mock };
    syncDeterministicClassificationFlags.mockResolvedValue({ updated: 10, skipped: 2 });
  });

  it('returns 200 with sync result on valid ADMIN_API_KEY', async () => {
    (validateAdminApiKey as jest.Mock).mockReturnValue(true);

    const req = new NextRequest('http://localhost/api/admin/sync/deterministic-flags', { method: 'POST' });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ updated: 10, skipped: 2 });
  });

  it('returns 401 when ADMIN_API_KEY is missing or invalid', async () => {
    (validateAdminApiKey as jest.Mock).mockReturnValue(false);

    const req = new NextRequest('http://localhost/api/admin/sync/deterministic-flags', { method: 'POST' });
    const response = await POST(req);

    expect(response.status).toBe(401);
  });
});
