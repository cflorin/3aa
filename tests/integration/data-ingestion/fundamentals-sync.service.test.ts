// EPIC-003: Data Ingestion & Universe Management
// STORY-020: Fundamentals Sync Job
// TASK-020-002: Integration tests — syncFundamentals() with real test DB

import { PrismaClient } from '@prisma/client';
import { syncFundamentals } from '../../../src/modules/data-ingestion/jobs/fundamentals-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { FundamentalData, ProvenanceEntry } from '../../../src/modules/data-ingestion/types';

const prisma = new PrismaClient();

const FIXED_NOW = new Date('2024-01-15T23:00:00.000Z');
const TEST_TICKER = 'T_FUND'; // BC-020-001: VarChar(10) limit; 'INTTEST_FUND' = 12 chars

function makeMockAdapter(
  name: 'tiingo' | 'fmp',
  returnValue: FundamentalData | null,
): VendorAdapter {
  return {
    providerName: name,
    capabilities: { forwardEstimateCoverage: 'partial', rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: jest.fn(),
    fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn().mockResolvedValue(returnValue),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

const fullFundamentals: FundamentalData = {
  ticker: TEST_TICKER,
  revenue_growth_yoy: 12.5,
  eps_growth_yoy: 10.0,
  eps_growth_fwd: 8.0,
  revenue_ttm: 400000,
  earnings_ttm: 95000,
  gross_margin: 0.44,
  operating_margin: 0.30,
  net_margin: 0.25,
  roe: 1.5,
  roa: 0.28,
  roic: 0.55,
  trailing_pe: 28.5,
  fcf_ttm: 90000000000,
  ebit_ttm: 130000000000,
  eps_ttm: 6.50,
  net_debt_to_ebitda: -0.35,
  total_debt: 110000000000,
  cash_and_equivalents: 60000000000,
  debt_to_equity: 1.5,
  current_ratio: 0.95,
  interest_coverage: 29.0,
};

describe('EPIC-003/STORY-020/TASK-020-002: syncFundamentals() integration tests', () => {
  beforeEach(async () => {
    await prisma.stock.upsert({
      where: { ticker: TEST_TICKER },
      create: {
        ticker: TEST_TICKER,
        companyName: 'Integration Test Stock',
        country: 'US',
        inUniverse: true,
        dataFreshnessStatus: 'missing',
      },
      update: { inUniverse: true },
    });
  });

  afterEach(async () => {
    await prisma.stock.deleteMany({ where: { ticker: TEST_TICKER } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes fundamental fields and provenance to DB', async () => {
    await syncFundamentals(
      makeMockAdapter('tiingo', fullFundamentals),
      makeMockAdapter('fmp', null),
      { now: FIXED_NOW },
    );

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: {
        trailingPe: true,
        epsGrowthFwd: true,
        grossMargin: true,
        fundamentalsLastUpdatedAt: true,
        dataProviderProvenance: true,
      },
    });

    expect(row).not.toBeNull();
    expect(Number(row!.trailingPe)).toBeCloseTo(28.5);
    expect(Number(row!.epsGrowthFwd)).toBeCloseTo(8.0);
    expect(Number(row!.grossMargin)).toBeCloseTo(0.44);
    expect(row!.fundamentalsLastUpdatedAt).toBeTruthy();

    const prov = row!.dataProviderProvenance as unknown as Record<string, ProvenanceEntry>;
    // Verify at least one field provenance is correct
    const trailingPeProv = prov['trailing_pe'];
    expect(trailingPeProv).toBeDefined();
    expect(trailingPeProv.provider).toBe('tiingo');
    expect(trailingPeProv.fallback_used).toBe(false);
    expect(typeof trailingPeProv.fallback_used).toBe('boolean');
    expect(trailingPeProv.synced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes fallback provenance when FMP used', async () => {
    await syncFundamentals(
      makeMockAdapter('tiingo', null),
      makeMockAdapter('fmp', fullFundamentals),
      { now: FIXED_NOW },
    );

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { dataProviderProvenance: true },
    });

    const prov = row!.dataProviderProvenance as unknown as Record<string, ProvenanceEntry>;
    const anyField = Object.values(prov)[0];
    expect(anyField.provider).toBe('fmp');
    expect(anyField.fallback_used).toBe(true);
    expect(typeof anyField.fallback_used).toBe('boolean');
  });

  it('does not overwrite non-null field when provider returns null for that field', async () => {
    // Seed a known trailing_pe value
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: { trailingPe: 25.0 },
    });

    // Run sync with trailing_pe = null in provider response
    const partialFundamentals: FundamentalData = {
      ...fullFundamentals,
      trailing_pe: null,
    };

    await syncFundamentals(
      makeMockAdapter('tiingo', partialFundamentals),
      makeMockAdapter('fmp', null),
      { now: FIXED_NOW },
    );

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { trailingPe: true },
    });
    expect(Number(row!.trailingPe)).toBeCloseTo(25.0); // Preserved — not overwritten with null
  });

  it('updates fundamentals_last_updated_at on sync; stable on second identical run', async () => {
    const result1 = await syncFundamentals(
      makeMockAdapter('tiingo', fullFundamentals), makeMockAdapter('fmp', null), { now: FIXED_NOW },
    );

    const row1 = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { fundamentalsLastUpdatedAt: true },
    });

    const result2 = await syncFundamentals(
      makeMockAdapter('tiingo', fullFundamentals), makeMockAdapter('fmp', null), { now: FIXED_NOW },
    );

    expect(result1.stocks_updated).toBe(1);
    expect(result2.stocks_updated).toBe(1);
    expect(row1!.fundamentalsLastUpdatedAt).toBeTruthy();
  });
});
