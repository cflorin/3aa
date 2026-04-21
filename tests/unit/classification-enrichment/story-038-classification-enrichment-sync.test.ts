// EPIC-003.1: Classification LLM Enrichment
// STORY-038: classificationEnrichmentSync Job
// TASK-038-005: Unit tests — pre-filters, recomputation triggers, sync job behavior

jest.mock('fs');
jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import fs from 'fs';
import { prisma } from '@/infrastructure/database/prisma';
import type {
  ClassificationEnrichmentInput,
  ClassificationEnrichmentSyncResult,
} from '../../../src/modules/classification-enrichment/jobs/classification-enrichment-sync.service';
import type { LLMResponse } from '../../../src/modules/classification-enrichment/ports/llm-provider.interface';

const MOCK_PROMPT_CONTENT = 'mock combined enrichment prompt stub';

const makeDecimal = (v: number) => ({ toNumber: () => v });

// LLM mock returning combined enrichment response (STORY-040 format)
const makeMockProvider = (overrides: {
  holding?: boolean;
  cyclicality?: boolean;
  binary?: boolean;
  confidence?: number;
} = {}) => ({
  providerName: 'claude' as const,
  structuredComplete: jest.fn().mockResolvedValue({
    result: {
      holding_company: { flag: overrides.holding ?? false, confidence: overrides.confidence ?? 0.90, reason: 'test' },
      cyclicality:     { flag: overrides.cyclicality ?? false, confidence: overrides.confidence ?? 0.90, reason: 'test' },
      binary_risk:     { flag: overrides.binary ?? false, confidence: overrides.confidence ?? 0.90, reason: 'test' },
      moat_strength_score:           3.0,
      pricing_power_score:           3.0,
      revenue_recurrence_score:      3.0,
      margin_durability_score:       3.0,
      capital_intensity_score:       3.0,
      qualitative_cyclicality_score: 3.0,
      scores_confidence:             0.85,
      reasoning_summary:             'test summary',
    },
    model: 'claude-test',
    promptVersion: 'abc12345',
    inputTokens: 100,
    outputTokens: 20,
  } as LLMResponse<unknown>),
});

const makeErrorProvider = () => ({
  providerName: 'claude' as const,
  structuredComplete: jest.fn().mockRejectedValue(new Error('llm network error')),
});

// Minimal DB stock row with Decimal simulation
const makeDbStock = (overrides: Partial<{
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  revenueTtm: ReturnType<typeof makeDecimal> | null;
  marketCap: ReturnType<typeof makeDecimal> | null;
  dataLastSyncedAt: Date | null;
  dataProviderProvenance: Record<string, unknown>;
}> = {}) => ({
  ticker: 'TEST',
  companyName: 'Test Corp',
  sector: 'Technology',
  industry: 'Software',
  description: null,
  revenueTtm: makeDecimal(5_000_000_000),
  marketCap: makeDecimal(50_000_000_000),
  dataLastSyncedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
  dataProviderProvenance: {},
  ...overrides,
});

describe('EPIC-003.1/STORY-038: runDeterministicPreFilters', () => {
  let runDeterministicPreFilters: typeof import('../../../src/modules/classification-enrichment/jobs/classification-enrichment-sync.service').runDeterministicPreFilters;

  beforeAll(() => {
    ({ runDeterministicPreFilters } = jest.requireActual(
      '../../../src/modules/classification-enrichment/jobs/classification-enrichment-sync.service',
    ));
  });

  const baseInput: ClassificationEnrichmentInput = {
    ticker: 'TEST',
    companyName: 'Test Corp',
    sector: 'Technology',
    industry: 'Software',
    description: null,
    sicCode: null,
    revenueTtm: 5_000_000_000,
    marketCap: 50_000_000_000,
    dataLastSyncedAt: null,
    dataProviderProvenance: {},
  };

  it('all deterministic: SIC holding + cyclical sector + large-cap exclusion → needs_llm=false', () => {
    // SIC 6720 → holding=true; Materials (cyclical) → cyclicality=true; large-cap non-gated → binary=false
    const result = runDeterministicPreFilters({
      ...baseInput,
      sector: 'Materials',
      sicCode: '6720',
      marketCap: 15_000_000_000,
    });
    expect(result.holding_company_flag).toBe(true);
    expect(result.cyclicality_flag).toBe(true);
    expect(result.binary_flag).toBe(false);
    expect(result.needs_llm).toBe(false);
  });

  it('all LLM: null sicCode + Financials sector (not CYCLICAL/DEFENSIVE) + mid-cap → needs_llm=true', () => {
    // sector=Financials: not CYCLICAL or DEFENSIVE → cyclicality=null; in LLM_GATE_SECTORS so large-cap exclusion doesn't fire;
    // revenueTtm > 50M so pre-revenue doesn't fire → binary=null; sicCode=null → holding=null
    const result = runDeterministicPreFilters({
      ...baseInput,
      sector: 'Financials',
      sicCode: null,
      revenueTtm: 500_000_000,
      marketCap: 5_000_000_000,
    });
    expect(result.holding_company_flag).toBeNull();
    expect(result.cyclicality_flag).toBeNull();
    expect(result.binary_flag).toBeNull();
    expect(result.needs_llm).toBe(true);
  });

  it('mixed: large-cap Tech binary deterministic, others need LLM', () => {
    // sector=Technology: not CYCLICAL or DEFENSIVE → cyclicality=null; no SIC → holding=null; large-cap non-gated → binary=false
    const result = runDeterministicPreFilters({
      ...baseInput,
      sector: 'Technology',
      sicCode: null,
      marketCap: 15_000_000_000,
    });
    expect(result.holding_company_flag).toBeNull();
    expect(result.cyclicality_flag).toBeNull();
    expect(result.binary_flag).toBe(false);
    expect(result.needs_llm).toBe(true);
  });

  it('large-cap Healthcare: binary remains null (LLM_GATE_SECTORS exempt)', () => {
    // Healthcare in LLM_GATE_SECTORS → large-cap exclusion does NOT fire → binary=null
    const result = runDeterministicPreFilters({
      ...baseInput,
      sector: 'Healthcare',
      revenueTtm: 5_000_000_000,
      marketCap: 400_000_000_000,
    });
    expect(result.binary_flag).toBeNull();
    expect(result.needs_llm).toBe(true);
  });
});

describe('EPIC-003.1/STORY-038: shouldEnrich', () => {
  let shouldEnrich: typeof import('../../../src/modules/classification-enrichment/jobs/classification-enrichment-sync.service').shouldEnrich;

  beforeAll(() => {
    ({ shouldEnrich } = jest.requireActual(
      '../../../src/modules/classification-enrichment/jobs/classification-enrichment-sync.service',
    ));
  });

  const CURRENT_VERSIONS = { holding_company_flag: 'v1hash1', cyclicality_flag: 'v1hash1', binary_flag: 'v1hash1' };
  const CURRENT_MODEL = 'claude-opus-4-5';
  const FRESH_PROVENANCE = {
    holding_company_flag: { provider: 'deterministic_heuristic', method: 'sic_code', confidence: 1.0 },
  };
  const OLD_DATE = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

  it('Trigger 1 — new stock (no holding_company_flag provenance) → true', () => {
    expect(shouldEnrich(
      { dataLastSyncedAt: OLD_DATE, dataProviderProvenance: {} },
      CURRENT_VERSIONS, CURRENT_MODEL, 'incremental',
    )).toBe(true);
  });

  it('Trigger 2 — recently modified data (< 30 days) → true', () => {
    expect(shouldEnrich(
      { dataLastSyncedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), dataProviderProvenance: FRESH_PROVENANCE },
      CURRENT_VERSIONS, CURRENT_MODEL, 'incremental',
    )).toBe(true);
  });

  it('Trigger 3 — prompt version drift → true', () => {
    const prov = {
      holding_company_flag: { provider: 'claude', model: CURRENT_MODEL, prompt_version: 'oldhash1' },
    };
    expect(shouldEnrich(
      { dataLastSyncedAt: OLD_DATE, dataProviderProvenance: prov },
      CURRENT_VERSIONS, CURRENT_MODEL, 'incremental',
    )).toBe(true);
  });

  it('Trigger 4 — model version drift → true', () => {
    const prov = {
      holding_company_flag: { provider: 'claude', model: 'claude-old-model', prompt_version: 'v1hash1' },
    };
    expect(shouldEnrich(
      { dataLastSyncedAt: OLD_DATE, dataProviderProvenance: prov },
      CURRENT_VERSIONS, CURRENT_MODEL, 'incremental',
    )).toBe(true);
  });

  it('Trigger 5 — error state in provenance → true', () => {
    const prov = {
      holding_company_flag: { provider: 'claude', error: true, error_message: 'timeout' },
    };
    expect(shouldEnrich(
      { dataLastSyncedAt: OLD_DATE, dataProviderProvenance: prov },
      CURRENT_VERSIONS, CURRENT_MODEL, 'incremental',
    )).toBe(true);
  });

  it('no triggers → false (stock is up-to-date)', () => {
    // Deterministic provenance (no prompt_version/model) prevents triggers 3/4; no error; old date; has provenance
    expect(shouldEnrich(
      { dataLastSyncedAt: OLD_DATE, dataProviderProvenance: FRESH_PROVENANCE },
      CURRENT_VERSIONS, CURRENT_MODEL, 'incremental',
    )).toBe(false);
  });

  it('full mode → always true regardless of triggers', () => {
    expect(shouldEnrich(
      { dataLastSyncedAt: OLD_DATE, dataProviderProvenance: FRESH_PROVENANCE },
      CURRENT_VERSIONS, CURRENT_MODEL, 'full',
    )).toBe(true);
  });
});

describe('EPIC-003.1/STORY-038: syncClassificationEnrichment', () => {
  let syncClassificationEnrichment: typeof import('../../../src/modules/classification-enrichment/jobs/classification-enrichment-sync.service').syncClassificationEnrichment;

  beforeAll(() => {
    ({ syncClassificationEnrichment } = jest.requireActual(
      '../../../src/modules/classification-enrichment/jobs/classification-enrichment-sync.service',
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue(MOCK_PROMPT_CONTENT);
    (prisma.stock.update as jest.Mock).mockResolvedValue({});
  });

  it('incremental: 3 stocks, 2 match triggers, 1 skipped', async () => {
    const stockA = makeDbStock({ ticker: 'AAAA', dataProviderProvenance: {} }); // trigger 1: new
    const stockB = makeDbStock({
      ticker: 'BBBB',
      dataLastSyncedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // trigger 2: recent
      dataProviderProvenance: { holding_company_flag: { provider: 'deterministic_heuristic' } },
    });
    const stockC = makeDbStock({
      ticker: 'CCCC',
      dataLastSyncedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // old
      dataProviderProvenance: { holding_company_flag: { provider: 'deterministic_heuristic' } },
    });

    (prisma.stock.findMany as jest.Mock).mockResolvedValue([stockA, stockB, stockC]);

    const result: ClassificationEnrichmentSyncResult = await syncClassificationEnrichment(
      makeMockProvider(),
      { mode: 'incremental', now: new Date() },
    );

    expect(result.stocks_processed).toBe(2);
    expect(result.stocks_skipped).toBe(1);
    expect(result.stocks_updated).toBe(2);
  });

  it('LLM error mid-run: run continues, errors accumulated, other stocks still processed', async () => {
    const stockA = makeDbStock({ ticker: 'AAAA', dataProviderProvenance: {} });
    const stockB = makeDbStock({ ticker: 'BBBB', dataProviderProvenance: {} });

    (prisma.stock.findMany as jest.Mock).mockResolvedValue([stockA, stockB]);
    // First call succeeds, second throws; detectCombinedEnrichment catches internally — both count as LLM calls
    const provider = {
      providerName: 'claude' as const,
      structuredComplete: jest.fn()
        .mockResolvedValueOnce({
          result: {
            holding_company: { flag: false, confidence: 0.9, reason: 'ok' },
            cyclicality:     { flag: false, confidence: 0.9, reason: 'ok' },
            binary_risk:     { flag: false, confidence: 0.9, reason: 'ok' },
            moat_strength_score: 3.0, pricing_power_score: 3.0, revenue_recurrence_score: 3.0,
            margin_durability_score: 3.0, capital_intensity_score: 3.0, qualitative_cyclicality_score: 3.0,
            scores_confidence: 0.85, reasoning_summary: 'ok',
          },
          model: 'claude-test',
          promptVersion: 'abc12345',
          inputTokens: 100,
          outputTokens: 20,
        })
        .mockRejectedValueOnce(new Error('llm network error')),
    };

    const result = await syncClassificationEnrichment(provider, { mode: 'full', now: new Date() });

    expect(result.errors).toBe(1);
    expect(result.stocks_processed).toBe(2);
    expect(result.llm_calls_made).toBe(2); // detectCombinedEnrichment never throws; both calls counted
    // Both stocks still get DB updated (error stock gets error provenance written)
    expect(prisma.stock.update).toHaveBeenCalledTimes(2);
  });

  it('single DB update per stock regardless of how many flags changed', async () => {
    const stock = makeDbStock({ ticker: 'AAAA', dataProviderProvenance: {} });
    (prisma.stock.findMany as jest.Mock).mockResolvedValue([stock]);

    await syncClassificationEnrichment(makeMockProvider(), { mode: 'full', now: new Date() });

    // Exactly 1 prisma.stock.update call for 1 stock — all 3 flags written in single update
    expect(prisma.stock.update).toHaveBeenCalledTimes(1);
  });

  it('provenance merge: existing provenance keys preserved, only updated keys overwritten', async () => {
    const existingProv = {
      some_existing_key: { provider: 'fmp', value: 'preserved' },
      holding_company_flag: { provider: 'claude', error: true },
    };
    const stock = makeDbStock({ ticker: 'AAAA', dataProviderProvenance: existingProv });
    (prisma.stock.findMany as jest.Mock).mockResolvedValue([stock]);

    await syncClassificationEnrichment(makeMockProvider(), { mode: 'full', now: new Date() });

    const updateCall = (prisma.stock.update as jest.Mock).mock.calls[0][0];
    const writtenProvenance = updateCall.data.dataProviderProvenance as Record<string, unknown>;

    // Existing non-flag key preserved
    expect(writtenProvenance['some_existing_key']).toEqual({ provider: 'fmp', value: 'preserved' });
    // holding_company_flag overwritten (was error, now updated)
    expect((writtenProvenance['holding_company_flag'] as Record<string, unknown>)?.['error']).toBeUndefined();
  });
});
