// EPIC-003: Data Ingestion & Universe Management
// STORY-021: Forward Estimates Sync Job
// TASK-021-003: Integration tests — syncForwardEstimates() with real test DB
// BC-021-001: file did not exist; created with TEST_TICKER = 'T_EST' (VarChar(10) safe)

import { PrismaClient } from '@prisma/client';
import { syncForwardEstimates } from '../../../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { ForwardEstimates, ProvenanceEntry } from '../../../src/modules/data-ingestion/types';

const prisma = new PrismaClient();

const FIXED_NOW = new Date('2024-01-16T23:00:00.000Z');
// BC-021-001: VarChar(10) ticker constraint; 'T_EST' = 5 chars
const TEST_TICKER = 'T_EST';

function makeMockAdapter(
  name: 'tiingo' | 'fmp',
  returnValue: ForwardEstimates | null,
): VendorAdapter {
  return {
    providerName: name,
    capabilities: { forwardEstimateCoverage: name === 'fmp' ? 'full' : 'partial', rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: jest.fn(),
    fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn().mockResolvedValue(returnValue),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

describe('EPIC-003/STORY-021/TASK-021-003: syncForwardEstimates() integration tests', () => {
  beforeEach(async () => {
    await prisma.stock.upsert({
      where: { ticker: TEST_TICKER },
      create: {
        ticker: TEST_TICKER,
        companyName: 'Integration Test Stock',
        country: 'US',
        inUniverse: true,
        dataFreshnessStatus: 'missing',
        trailingPe: 25,
        epsGrowthFwd: 10,
      },
      update: { inUniverse: true, trailingPe: 25, epsGrowthFwd: 10, cyclicalityFlag: null },
    });
  });

  afterEach(async () => {
    await prisma.stock.deleteMany({ where: { ticker: TEST_TICKER } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('full three-level fallback: FMP null → Tiingo null → computed trailing → correct DB value and provenance', async () => {
    // Both providers return null → computed fallback: 25 / (1 + 10/100) = 22.727...
    await syncForwardEstimates(
      makeMockAdapter('fmp', null),
      makeMockAdapter('tiingo', null),
      { now: FIXED_NOW },
    );

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { forwardPe: true, dataLastSyncedAt: true, dataProviderProvenance: true },
    });

    expect(row).not.toBeNull();
    expect(Number(row!.forwardPe)).toBeCloseTo(22.727, 2);
    expect(row!.dataLastSyncedAt).toBeTruthy();

    const prov = row!.dataProviderProvenance as unknown as Record<string, ProvenanceEntry>;
    expect(prov['forward_pe']).toBeDefined();
    expect(prov['forward_pe'].provider).toBe('computed_trailing');
    expect(prov['forward_pe'].fallback_used).toBe(true);
    expect(typeof prov['forward_pe'].fallback_used).toBe('boolean');
    expect(prov['forward_pe'].synced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('cyclicality_flag=TRUE blocks computed fallback; forward_pe not written', async () => {
    // Override cyclicality flag to TRUE to block computed fallback
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: { cyclicalityFlag: true },
    });

    const result = await syncForwardEstimates(
      makeMockAdapter('fmp', null),
      makeMockAdapter('tiingo', null),
      { now: FIXED_NOW },
    );

    expect(result.no_estimates_count).toBe(1);
    expect(result.computed_fallback_count).toBe(0);

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { forwardPe: true },
    });
    expect(row!.forwardPe).toBeNull();
  });

  it('FMP provides forward_pe → written with provider=fmp, fallback_used=false; data_last_synced_at updated', async () => {
    await syncForwardEstimates(
      makeMockAdapter('fmp', { ticker: TEST_TICKER, forward_pe: 22.0, forward_ev_ebit: 14.0 }),
      makeMockAdapter('tiingo', null),
      { now: FIXED_NOW },
    );

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { forwardPe: true, forwardEvEbit: true, dataLastSyncedAt: true, dataProviderProvenance: true },
    });

    expect(Number(row!.forwardPe)).toBeCloseTo(22.0);
    expect(Number(row!.forwardEvEbit)).toBeCloseTo(14.0);
    expect(row!.dataLastSyncedAt).toBeTruthy();

    const prov = row!.dataProviderProvenance as unknown as Record<string, ProvenanceEntry>;
    expect(prov['forward_pe'].provider).toBe('fmp');
    expect(prov['forward_pe'].fallback_used).toBe(false);
    expect(typeof prov['forward_pe'].fallback_used).toBe('boolean');
  });

  it('idempotency: running twice with same data yields stable forward_pe', async () => {
    const fmpData = { ticker: TEST_TICKER, forward_pe: 22.0, forward_ev_ebit: null };

    const result1 = await syncForwardEstimates(
      makeMockAdapter('fmp', fmpData),
      makeMockAdapter('tiingo', null),
      { now: FIXED_NOW },
    );
    const result2 = await syncForwardEstimates(
      makeMockAdapter('fmp', fmpData),
      makeMockAdapter('tiingo', null),
      { now: FIXED_NOW },
    );

    expect(result1.stocks_updated).toBe(1);
    expect(result2.stocks_updated).toBe(1);

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { forwardPe: true },
    });
    expect(Number(row!.forwardPe)).toBeCloseTo(22.0);
  });

  it('existing non-null forward_pe not overwritten when providers null and computed fallback blocked', async () => {
    // Seed a known forward_pe value; block computed fallback via cyclicality_flag
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: { forwardPe: 20.0, cyclicalityFlag: true },
    });

    const result = await syncForwardEstimates(
      makeMockAdapter('fmp', null),
      makeMockAdapter('tiingo', null),
      { now: FIXED_NOW },
    );

    expect(result.stocks_updated).toBe(0);

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { forwardPe: true },
    });
    expect(Number(row!.forwardPe)).toBeCloseTo(20.0);
  });
});
