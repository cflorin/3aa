// EPIC-003: Data Ingestion & Universe Management
// STORY-019: Price Sync Job
// TASK-019-003: Integration tests — syncPrices() with real test DB

import { PrismaClient } from '@prisma/client';
import { syncPrices } from '../../../src/modules/data-ingestion/jobs/price-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { ProvenanceEntry } from '../../../src/modules/data-ingestion/types';

const prisma = new PrismaClient();

const FIXED_NOW = new Date('2024-01-15T22:00:00.000Z');
// VarChar(10) ticker constraint: 'INTTEST_PRICE' = 13 chars exceeds limit. 'T_PRICE' = 7 chars.
const TEST_TICKER = 'T_PRICE';

function makeMockAdapter(
  name: 'tiingo' | 'fmp',
  priceClose: number | null,
): VendorAdapter {
  return {
    providerName: name,
    capabilities: { forwardEstimateCoverage: 'partial', rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: jest.fn(),
    fetchEODPrice: priceClose !== null
      ? jest.fn().mockResolvedValue({ ticker: TEST_TICKER, date: FIXED_NOW, close: priceClose })
      : jest.fn().mockResolvedValue(null),
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

describe('EPIC-003/STORY-019/TASK-019-003: syncPrices() integration tests', () => {
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

  it('writes current_price and provenance to DB after successful sync', async () => {
    await syncPrices(
      makeMockAdapter('tiingo', 185.5),
      makeMockAdapter('fmp', null),
      { now: FIXED_NOW },
    );

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { currentPrice: true, priceLastUpdatedAt: true, dataProviderProvenance: true },
    });

    expect(row).not.toBeNull();
    expect(Number(row!.currentPrice)).toBeCloseTo(185.5);
    expect(row!.priceLastUpdatedAt).toBeTruthy();

    const prov = row!.dataProviderProvenance as Record<string, ProvenanceEntry>;
    const currentPriceProv = prov['current_price'];
    expect(currentPriceProv).toBeDefined();
    expect(currentPriceProv.provider).toBe('tiingo');
    expect(currentPriceProv.fallback_used).toBe(false);
    expect(typeof currentPriceProv.fallback_used).toBe('boolean');
    expect(currentPriceProv.synced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes fallback provenance when FMP used because Tiingo returned null', async () => {
    await syncPrices(
      makeMockAdapter('tiingo', null),
      makeMockAdapter('fmp', 184.0),
      { now: FIXED_NOW },
    );

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { currentPrice: true, dataProviderProvenance: true },
    });

    expect(Number(row!.currentPrice)).toBeCloseTo(184.0);

    const prov = row!.dataProviderProvenance as Record<string, ProvenanceEntry>;
    const currentPriceProv = prov['current_price'];
    expect(currentPriceProv.provider).toBe('fmp');
    expect(currentPriceProv.fallback_used).toBe(true);
    expect(typeof currentPriceProv.fallback_used).toBe('boolean');
  });

  it('does not modify current_price when both providers return null', async () => {
    // Seed a known current_price
    await prisma.stock.update({
      where: { ticker: TEST_TICKER },
      data: { currentPrice: 100 },
    });

    const result = await syncPrices(
      makeMockAdapter('tiingo', null),
      makeMockAdapter('fmp', null),
      { now: FIXED_NOW },
    );

    expect(result.errors).toBe(1);
    expect(result.stocks_updated).toBe(0);

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { currentPrice: true },
    });
    expect(Number(row!.currentPrice)).toBeCloseTo(100);
  });

  it('idempotency: running twice with same data yields same current_price', async () => {
    await syncPrices(makeMockAdapter('tiingo', 200.0), makeMockAdapter('fmp', null), { now: FIXED_NOW });
    await syncPrices(makeMockAdapter('tiingo', 200.0), makeMockAdapter('fmp', null), { now: FIXED_NOW });

    const row = await prisma.stock.findUnique({
      where: { ticker: TEST_TICKER },
      select: { currentPrice: true },
    });
    expect(Number(row!.currentPrice)).toBeCloseTo(200.0);
  });
});
