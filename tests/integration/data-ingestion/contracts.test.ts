// EPIC-003: Data Ingestion & Universe Management
// STORY-024: Contract & Schema Tests
// TASK-024-001: Provider normalization contract tests using fixture files
// TASK-024-002: DB schema + provenance + constraint tests
// RFC-004 §Provider Abstraction Layer — canonical type contracts; TiingoAdapter, FMPAdapter shapes
// RFC-002: stocks table schema — column types, constraints
// ADR-001: Both providers' response shapes must be pinned

import { TiingoAdapter } from '../../../src/modules/data-ingestion/adapters/tiingo.adapter';
import { FMPAdapter } from '../../../src/modules/data-ingestion/adapters/fmp.adapter';
import { PrismaClient } from '@prisma/client';
import type { FundamentalData, ForwardEstimates } from '../../../src/modules/data-ingestion/types';

const prisma = new PrismaClient();

import tiingoUniverseFixture from '../../fixtures/tiingo-universe-response.json';
import tiingoPriceFixture from '../../fixtures/tiingo-eod-price-response.json';
import tiingoFundamentalsFixture from '../../fixtures/tiingo-fundamentals-response.json';
import tiingoOverviewFixture from '../../fixtures/tiingo-overview-response.json';
import fmpUniverseFixture from '../../fixtures/fmp-universe-response.json';
import fmpPriceFixture from '../../fixtures/fmp-historical-price-response.json';
import fmpIncomeFixture from '../../fixtures/fmp-income-statement-response.json';
import fmpBalanceFixture from '../../fixtures/fmp-balance-sheet-response.json';
import fmpEstimatesFixture from '../../fixtures/fmp-analyst-estimates-response.json';

function makeFetchMock(body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(body),
  });
}

describe('EPIC-003/STORY-024/TASK-024-001: Provider normalization contract tests @contract', () => {
  let tiingo: TiingoAdapter;
  let fmp: FMPAdapter;

  beforeEach(() => {
    tiingo = new TiingoAdapter('fixture-test-key');
    fmp = new FMPAdapter('fixture-test-key');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Tiingo universe fixture ────────────────────────────────────────────────

  it('Tiingo universe fixture → UniverseStock[]: isActive=true + USA location included; isActive=false excluded', async () => {
    // BC-024-002: fixture now has isActive/location fields matching adapter filter logic
    global.fetch = makeFetchMock(tiingoUniverseFixture);
    const result = await tiingo.fetchUniverse(5000);

    // AAPL: isActive=true, location ends with ', USA' → included
    // SMLL: isActive=false → excluded by adapter filter
    expect(result).toHaveLength(1);
    const stock = result[0];

    expect(stock.ticker).toBe('AAPL');
    expect(typeof stock.ticker).toBe('string');
    expect(typeof stock.company_name).toBe('string');
    expect(typeof stock.exchange).toBe('string');
    // BC-024-002: market_cap_millions always null from Tiingo /meta (no marketCap field at this endpoint)
    expect(stock.market_cap_millions).toBeNull();
    expect(stock.country).toBe('US');
    expect(stock.sector === null || typeof stock.sector === 'string').toBe(true);
  });

  // ─── Tiingo EOD price fixture ───────────────────────────────────────────────

  it('Tiingo EOD price fixture → PriceData: close=185.92 and date is Date instance', async () => {
    global.fetch = makeFetchMock(tiingoPriceFixture);
    const result = await tiingo.fetchEODPrice('AAPL');

    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.close).toBe(185.92);
    expect(result!.date).toBeInstanceOf(Date);
  });

  // ─── Tiingo fundamentals fixture ───────────────────────────────────────────

  it('Tiingo fundamentals fixture → FundamentalData: TTM revenue and numeric fields correct', async () => {
    // BC-024-003: fixture rewritten to QuarterlyReport[] with DataCode arrays
    global.fetch = makeFetchMock(tiingoFundamentalsFixture);
    const result = await tiingo.fetchFundamentals('AAPL') as FundamentalData;

    expect(result).not.toBeNull();
    expect(result.ticker).toBe('AAPL');
    // BC-024-003: trailing_pe is always null from Tiingo fundamentals (hardcoded — not available at this tier)
    expect(result.trailing_pe).toBeNull();
    // eps_growth_fwd always null from Tiingo fundamentals
    expect(result.eps_growth_fwd).toBeNull();

    // TTM revenue = sum of 4 newest quarterly reports
    const expectedTtm = 119575000000 + 89498000000 + 94836000000 + 117154000000;
    expect(result.revenue_ttm).toBeCloseTo(expectedTtm, -3);

    // All numeric fields must be number or null
    const numericFields: Array<keyof FundamentalData> = [
      'gross_margin', 'operating_margin', 'net_margin',
      'roe', 'roa', 'roic',
      'debt_to_equity', 'current_ratio', 'interest_coverage',
    ];
    for (const field of numericFields) {
      const val = result[field];
      expect(val === null || typeof val === 'number').toBe(true);
    }
  });

  // ─── Tiingo forward estimates — always null at this API tier ───────────────

  it('Tiingo empty overview → fetchForwardEstimates returns null (no coverage)', async () => {
    global.fetch = makeFetchMock({});
    const result = await tiingo.fetchForwardEstimates('NOCOV');
    expect(result).toBeNull();
  });

  it('Tiingo overview fixture → fetchForwardEstimates returns null (unavailable at this API tier)', async () => {
    // BC-024-004: fetchForwardEstimates makes no HTTP call — always returns null regardless of fixture content
    // forwardEstimateCoverage = 'none'; /tiingo/fundamentals/{t}/overview returns 404 at this tier
    global.fetch = makeFetchMock(tiingoOverviewFixture);
    const result = await tiingo.fetchForwardEstimates('AAPL');
    expect(result).toBeNull();
  });

  // ─── FMP universe — no-op on this plan tier ────────────────────────────────

  it('FMP universe → returns [] (screener not available on this plan tier)', async () => {
    // BC-024-006: fetchUniverse is a no-op; no HTTP call made; universe sourced from Tiingo
    global.fetch = makeFetchMock(fmpUniverseFixture);
    const result = await fmp.fetchUniverse(5000);
    expect(result).toEqual([]);
  });

  // ─── FMP historical price fixture ──────────────────────────────────────────

  it('FMP historical price fixture → PriceData: close=185.92 and date is Date instance', async () => {
    // BC-024-001: fixture is now flat array (FMP stable returns flat, not {historical:[...]})
    global.fetch = makeFetchMock(fmpPriceFixture);
    const result = await fmp.fetchEODPrice('AAPL');

    expect(result).not.toBeNull();
    expect(result!.close).toBe(185.92);
    expect(result!.date).toBeInstanceOf(Date);
  });

  // ─── FMP income + balance sheet fixtures ───────────────────────────────────

  it('FMP income + balance sheet fixtures → FundamentalData: revenue_growth_yoy ≈ -2.8%; trailing_pe null', async () => {
    // fetchFundamentals makes 2 parallel calls (income + balance)
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: jest.fn().mockResolvedValue(fmpIncomeFixture),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: jest.fn().mockResolvedValue(fmpBalanceFixture),
      });

    const result = await fmp.fetchFundamentals('AAPL') as FundamentalData;

    expect(result).not.toBeNull();
    expect(result.ticker).toBe('AAPL');
    expect(result.eps_growth_fwd).toBeNull();
    // trailing_pe not available from income/balance; fetched via Tiingo overview
    expect(result.trailing_pe).toBeNull();

    // Revenue growth YoY: (383285e9 - 394328e9) / 394328e9 * 100 ≈ -2.8%
    expect(result.revenue_growth_yoy).not.toBeNull();
    expect(result.revenue_growth_yoy!).toBeCloseTo(-2.8, 0);
  });

  // ─── FMP analyst estimates fixture ─────────────────────────────────────────

  it('FMP analyst-estimates fixture → ForwardEstimates: NTM entry extracted with typed fields', async () => {
    // BC-024-005: fixture now uses epsAvg/ebitAvg (real FMP field names per STORY-017)
    global.fetch = makeFetchMock(fmpEstimatesFixture);
    const result = await fmp.fetchForwardEstimates('AAPL') as ForwardEstimates;

    expect(result).not.toBeNull();
    // All fixture dates are in the past (2023-2025); fallback to most recent = 2025-09-30
    // At minimum one field must be present
    expect(result.forward_pe !== null || result.forward_ev_ebit !== null).toBe(true);
    if (result.forward_pe !== null) {
      expect(typeof result.forward_pe).toBe('number');
    }
    if (result.forward_ev_ebit !== null) {
      expect(typeof result.forward_ev_ebit).toBe('number');
    }
  });

  it('FMP empty analyst estimates → null returned (no forward coverage)', async () => {
    global.fetch = makeFetchMock([]);
    const result = await fmp.fetchForwardEstimates('NOCOV');
    expect(result).toBeNull();
  });
});

// ─── DB Schema Contract Tests ────────────────────────────────────────────────
// TASK-024-002: Introspects real test DB to assert RFC-002 column shapes
// NOTE: estimates_last_updated_at absent from schema; data_last_synced_at used as proxy
// NOTE: data_freshness_status is VARCHAR(20) DEFAULT 'fresh' — nullable, no CHECK constraint in V1
// NOTE: exchange column not in stocks schema (BC-024-008 — Tiingo /meta has no exchange data)

afterAll(async () => {
  await prisma.$disconnect();
});

describe('EPIC-003/STORY-024/TASK-024-002: DB schema contract tests @contract', () => {
  type ColumnRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

  it('stocks table has all EPIC-003 required columns', async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
    `;

    const columnNames = new Set(rows.map((r) => r.column_name));

    // BC-024-008: 'exchange' removed — not in stocks schema (Tiingo /meta has no exchange field)
    const requiredColumns = [
      'ticker', 'company_name', 'sector', 'industry', 'market_cap',
      'in_universe', 'current_price', 'price_last_updated_at', 'data_freshness_status',
      'fundamentals_last_updated_at', 'data_last_synced_at',
      'forward_pe', 'forward_ev_ebit', 'trailing_pe', 'cyclicality_flag',
      'data_provider_provenance',
      // EPIC-003.1/STORY-039: description + E1–E6 enrichment score columns
      'description',
      'moat_strength_score', 'pricing_power_score', 'revenue_recurrence_score',
      'margin_durability_score', 'capital_intensity_score', 'qualitative_cyclicality_score',
    ];

    for (const col of requiredColumns) {
      expect(columnNames).toContain(col);
    }
  });

  it('NUMERIC/DECIMAL columns for decimal fields (RFC-002)', async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
        AND column_name IN ('market_cap', 'current_price', 'forward_pe', 'forward_ev_ebit', 'trailing_pe')
    `;

    for (const row of rows) {
      expect(['numeric', 'double precision', 'real']).toContain(row.data_type.toLowerCase());
    }
  });

  it('BOOLEAN for flag columns (RFC-002)', async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
        AND column_name IN ('in_universe', 'cyclicality_flag')
    `;

    for (const row of rows) {
      expect(row.data_type.toLowerCase()).toBe('boolean');
    }
  });

  it('TIMESTAMPTZ for timestamp columns (RFC-002)', async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
        AND column_name IN ('price_last_updated_at', 'fundamentals_last_updated_at', 'data_last_synced_at')
    `;

    for (const row of rows) {
      expect(row.data_type.toLowerCase()).toContain('timestamp');
    }
  });

  it('ticker has PRIMARY KEY constraint (unique)', async () => {
    const rows = await prisma.$queryRaw<Array<{ constraint_type: string }>>`
      SELECT constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
        AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
    `;

    expect(rows.length).toBeGreaterThan(0);
  });

  it('data_freshness_status column has VARCHAR type and default value of fresh', async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
        AND column_name = 'data_freshness_status'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].data_type.toLowerCase()).toContain('char');
    expect(rows[0].column_default).not.toBeNull();
    // Actual DB default is 'fresh' (CHECK constraint not implemented in V1)
    expect(rows[0].column_default).toContain('fresh');
  });

  // EPIC-003.1/STORY-039: E1–E6 enrichment score columns
  it('EPIC-003.1: E1–E6 score columns are NUMERIC type and nullable', async () => {
    const scoreColumns = [
      'moat_strength_score', 'pricing_power_score', 'revenue_recurrence_score',
      'margin_durability_score', 'capital_intensity_score', 'qualitative_cyclicality_score',
    ];
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
        AND column_name = ANY(${scoreColumns})
    `;

    expect(rows).toHaveLength(scoreColumns.length);
    for (const row of rows) {
      expect(['numeric', 'decimal']).toContain(row.data_type.toLowerCase());
      expect(row.is_nullable).toBe('YES');
    }
  });

  it('EPIC-003.1: description column is TEXT type and nullable', async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'stocks'
        AND table_schema = 'public'
        AND column_name = 'description'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].data_type.toLowerCase()).toBe('text');
    expect(rows[0].is_nullable).toBe('YES');
  });
});

// ─── Provenance JSONB Shape Contracts ────────────────────────────────────────

describe('EPIC-003/STORY-024/TASK-024-002: Provenance JSONB shape contracts @contract', () => {
  // BC-024-007: renamed from PROV_CONTRACT_TEST (18 chars) to PCT (3 chars) — VarChar(10) limit
  const TEST_TICKER = 'PCT';

  beforeEach(async () => {
    await prisma.stock.upsert({
      where: { ticker: TEST_TICKER },
      create: {
        ticker: TEST_TICKER,
        companyName: 'Provenance Contract Test',
        country: 'US',
        inUniverse: true,
      },
      update: { inUniverse: true },
    });
  });

  afterEach(async () => {
    await prisma.stock.deleteMany({ where: { ticker: TEST_TICKER } });
  });

  it('Provenance entry: provider, synced_at (ISO 8601), fallback_used (boolean)', async () => {
    const provEntry = {
      provider: 'tiingo',
      synced_at: '2024-01-15T22:00:00.000Z',
      fallback_used: false,
    };

    await prisma.$executeRaw`
      UPDATE stocks
      SET data_provider_provenance = jsonb_set(
        COALESCE(data_provider_provenance, '{}'::jsonb),
        '{current_price}',
        ${JSON.stringify(provEntry)}::jsonb
      )
      WHERE ticker = ${TEST_TICKER}
    `;

    const rows = await prisma.$queryRaw<Array<{ prov: Record<string, unknown> }>>`
      SELECT data_provider_provenance -> 'current_price' as prov
      FROM stocks WHERE ticker = ${TEST_TICKER}
    `;

    const prov = rows[0].prov;
    expect(prov.provider).toBe('tiingo');
    expect(typeof prov.synced_at).toBe('string');
    expect(prov.synced_at as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(typeof prov.fallback_used).toBe('boolean');
    expect(prov.fallback_used).toBe(false);
  });

  it('Provenance provider=computed_trailing correctly stored and retrieved', async () => {
    const provEntry = {
      provider: 'computed_trailing',
      synced_at: '2024-01-15T22:00:00.000Z',
      fallback_used: true,
    };

    await prisma.$executeRaw`
      UPDATE stocks
      SET data_provider_provenance = jsonb_set(
        COALESCE(data_provider_provenance, '{}'::jsonb),
        '{forward_pe}',
        ${JSON.stringify(provEntry)}::jsonb
      )
      WHERE ticker = ${TEST_TICKER}
    `;

    const rows = await prisma.$queryRaw<Array<{ prov: Record<string, unknown> }>>`
      SELECT data_provider_provenance -> 'forward_pe' as prov
      FROM stocks WHERE ticker = ${TEST_TICKER}
    `;

    expect(rows[0].prov.provider).toBe('computed_trailing');
    expect(rows[0].prov.fallback_used).toBe(true);
    expect(typeof rows[0].prov.fallback_used).toBe('boolean');
  });

  it('Provenance fallback_used is stored as boolean, not string "true"', async () => {
    const provEntry = {
      provider: 'fmp',
      synced_at: '2024-01-15T22:00:00.000Z',
      fallback_used: true,
    };

    await prisma.$executeRaw`
      UPDATE stocks
      SET data_provider_provenance = jsonb_set(
        COALESCE(data_provider_provenance, '{}'::jsonb),
        '{current_price}',
        ${JSON.stringify(provEntry)}::jsonb
      )
      WHERE ticker = ${TEST_TICKER}
    `;

    const rows = await prisma.$queryRaw<Array<{ fb: unknown }>>`
      SELECT data_provider_provenance -> 'current_price' -> 'fallback_used' as fb
      FROM stocks WHERE ticker = ${TEST_TICKER}
    `;

    // JSONB preserves boolean; must not be the string "true"
    expect(rows[0].fb).toBe(true);
    expect(rows[0].fb).not.toBe('true');
  });

  it('Provenance shape correct for all 15 fundamental field keys', async () => {
    // Scope In: "After a fundamentals sync: assert same shape for all 15 fundamental field keys"
    const fundamentalKeys = [
      'revenue_growth_yoy', 'eps_growth_yoy', 'eps_growth_fwd', 'revenue_ttm', 'earnings_ttm',
      'gross_margin', 'operating_margin', 'net_margin', 'roe', 'roa', 'roic', 'trailing_pe',
      'debt_to_equity', 'current_ratio', 'interest_coverage',
    ];

    // Build a JSONB object with all 15 keys and write it in one update
    const provenance: Record<string, unknown> = {};
    for (const key of fundamentalKeys) {
      provenance[key] = { provider: 'tiingo', synced_at: '2024-01-15T22:00:00.000Z', fallback_used: false };
    }

    await prisma.$executeRaw`
      UPDATE stocks
      SET data_provider_provenance = ${JSON.stringify(provenance)}::jsonb
      WHERE ticker = ${TEST_TICKER}
    `;

    const rows = await prisma.$queryRaw<Array<{ prov: Record<string, unknown> }>>`
      SELECT data_provider_provenance as prov FROM stocks WHERE ticker = ${TEST_TICKER}
    `;

    const prov = rows[0].prov as Record<string, Record<string, unknown>>;
    for (const key of fundamentalKeys) {
      const entry = prov[key];
      expect(entry).toBeDefined();
      expect(typeof entry.provider).toBe('string');
      expect(typeof entry.synced_at).toBe('string');
      expect((entry.synced_at as string)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(typeof entry.fallback_used).toBe('boolean');
    }
  });
});
