// EPIC-003: Data Ingestion & Universe Management
// STORY-018: Universe Sync Job
// TASK-018-003: Integration tests — syncUniverse() against real test DB
// ADR-003: No delete on drop — verified by integration tests

import { PrismaClient } from '@prisma/client';
import { syncUniverse } from '../../../src/modules/data-ingestion/jobs/universe-sync.service';
import type { VendorAdapter } from '../../../src/modules/data-ingestion/ports/vendor-adapter.interface';
import type { UniverseStock } from '../../../src/modules/data-ingestion/types';

const prisma = new PrismaClient();

// VarChar(10) ticker constraint: prefix must be short enough to leave room for suffix.
// 'INTTEST_' (8 chars) + any suffix exceeded 10 chars. 'T_' (2 chars) + 7-char max suffix = 9 chars.
const TEST_PREFIX = 'T_';

function makeStock(overrides: Partial<UniverseStock> = {}): UniverseStock {
  return {
    ticker: `${TEST_PREFIX}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    company_name: 'Test Company',
    exchange: 'NASDAQ',
    market_cap_millions: 10000,
    country: 'US',
    sector: 'Technology',
    industry: 'Software',
    ...overrides,
  };
}

function makeMockAdapter(
  name: 'tiingo' | 'fmp',
  stocks: UniverseStock[],
): VendorAdapter {
  return {
    providerName: name,
    capabilities: { forwardEstimateCoverage: 'partial', rateLimit: { requestsPerHour: 1000 } },
    fetchUniverse: jest.fn().mockResolvedValue(stocks),
    fetchEODPrice: jest.fn(),
    fetchFundamentals: jest.fn(),
    fetchForwardEstimates: jest.fn(),
    fetchMetadata: jest.fn(),
  } as unknown as VendorAdapter;
}

describe('EPIC-003/STORY-018/TASK-018-003: syncUniverse() integration tests', () => {
  afterEach(async () => {
    await prisma.stock.deleteMany({ where: { ticker: { startsWith: TEST_PREFIX } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('inserts new stocks with in_universe=TRUE and data_freshness_status=missing', async () => {
    const ticker = `${TEST_PREFIX}NEWSTK`;
    const stock = makeStock({ ticker, company_name: 'New Test Co' });

    const tiingo = makeMockAdapter('tiingo', [stock]);
    const fmp = makeMockAdapter('fmp', []);

    await syncUniverse(tiingo, fmp);

    const row = await prisma.stock.findUnique({ where: { ticker } });
    expect(row).not.toBeNull();
    expect(row!.inUniverse).toBe(true);
    expect(row!.dataFreshnessStatus).toBe('missing');
  });

  it('marks previously-in-universe stock as in_universe=FALSE when absent from merged set', async () => {
    const ticker = `${TEST_PREFIX}DROPPED`;
    const stock = makeStock({ ticker });

    // First run: stock is in universe
    await syncUniverse(
      makeMockAdapter('tiingo', [stock]),
      makeMockAdapter('fmp', []),
    );

    // Verify in_universe=TRUE
    let row = await prisma.stock.findUnique({ where: { ticker } });
    expect(row!.inUniverse).toBe(true);

    // Second run: stock replaced by a different one
    const otherTicker = `${TEST_PREFIX}OTHER1`;
    await syncUniverse(
      makeMockAdapter('tiingo', [makeStock({ ticker: otherTicker })]),
      makeMockAdapter('fmp', []),
    );

    // Verify row still exists (not deleted, per ADR-003) with in_universe=FALSE
    row = await prisma.stock.findUnique({ where: { ticker } });
    expect(row).not.toBeNull();
    expect(row!.inUniverse).toBe(false);
  });

  it('idempotency: running twice with same data yields same result', async () => {
    const ticker = `${TEST_PREFIX}IDEM`;
    const stock = makeStock({ ticker });

    const run1 = await syncUniverse(
      makeMockAdapter('tiingo', [stock]),
      makeMockAdapter('fmp', []),
    );
    const run2 = await syncUniverse(
      makeMockAdapter('tiingo', [stock]),
      makeMockAdapter('fmp', []),
    );

    expect(run2.stocks_dropped).toBe(0);

    const count = await prisma.stock.count({ where: { ticker } });
    expect(count).toBe(1); // Exactly one row — no duplicate insert
    void run1;
  });

  it('does not delete historical data — dropped stock row retained (ADR-003)', async () => {
    const ticker = `${TEST_PREFIX}HIST`;
    const otherTicker = `${TEST_PREFIX}KEEP`;
    const stock = makeStock({ ticker });

    // First run: original stock in universe
    await syncUniverse(
      makeMockAdapter('tiingo', [stock]),
      makeMockAdapter('fmp', []),
    );

    // Second run: original stock replaced by a different one
    await syncUniverse(
      makeMockAdapter('tiingo', [makeStock({ ticker: otherTicker })]),
      makeMockAdapter('fmp', []),
    );

    // Original ticker row must still exist (not deleted)
    const row = await prisma.stock.findUnique({ where: { ticker } });
    expect(row).not.toBeNull();
    expect(row!.inUniverse).toBe(false);
  });
});
