// EPIC-003.1: Classification LLM Enrichment
// STORY-037: binary_flag — Heuristic + Targeted LLM
// TASK-037-003: Unit tests — 8 tests covering all detection paths

jest.mock('fs');

import fs from 'fs';
import type { BinaryFlagInput } from '../../../src/modules/classification-enrichment/detectors/binary-flag.detector';
import type { FlagDetectionResult } from '../../../src/modules/classification-enrichment/detectors/holding-company.detector';
import type { LLMResponse } from '../../../src/modules/classification-enrichment/ports/llm-provider.interface';

const BASE_INPUT: BinaryFlagInput = {
  ticker: 'TEST',
  company_name: 'Test Corp',
  sector: 'Technology',
  industry: 'Software',
  description: 'A software company.',
  revenue_ttm: 5_000_000_000,
  market_cap: 50_000_000_000,
};

const mockLlmResponse = (flag: boolean, confidence: number): LLMResponse<FlagDetectionResult> => ({
  result: { flag_value: flag, confidence, reason: 'test reason' },
  model: 'claude-test',
  promptVersion: 'abc12345',
  inputTokens: 100,
  outputTokens: 20,
});

const makeMockProvider = (flag: boolean, confidence: number) => ({
  providerName: 'claude' as const,
  structuredComplete: jest.fn().mockResolvedValue(mockLlmResponse(flag, confidence)),
});

const makeErrorProvider = () => ({
  providerName: 'claude' as const,
  structuredComplete: jest.fn().mockRejectedValue(new Error('network error')),
});

describe('EPIC-003.1/STORY-037: BinaryFlagDetector', () => {
  let detectBinaryFlag: typeof import('../../../src/modules/classification-enrichment/detectors/binary-flag.detector').detectBinaryFlag;
  let PromptLoader: typeof import('../../../src/modules/classification-enrichment/utils/prompt-loader').PromptLoader;

  beforeAll(() => {
    ({ detectBinaryFlag } = jest.requireActual(
      '../../../src/modules/classification-enrichment/detectors/binary-flag.detector',
    ));
    ({ PromptLoader } = jest.requireActual(
      '../../../src/modules/classification-enrichment/utils/prompt-loader',
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue(
      'Binary risk for {{company_name}} {{sector}} {{industry}} {{description}} {{revenue_ttm_billions}} {{market_cap_billions}}',
    );
  });

  it('pre-revenue Healthcare (rev < $50M) → flag=true, no LLM call', async () => {
    const provider = makeMockProvider(false, 0.9);
    const result = await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Healthcare', revenue_ttm: 10_000_000 },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(true);
    expect(provider.structuredComplete).not.toHaveBeenCalled();
    expect(result.provenance.provider).toBe('deterministic_heuristic');
    expect(result.provenance.method).toBe('pre_revenue_biotech');
    expect(result.provenance.confidence).toBe(1.0);
  });

  it('large-cap Tech (>$10B, non-HC/Fin/Energy) → flag=false, no LLM call', async () => {
    const provider = makeMockProvider(true, 0.9);
    const result = await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Technology', market_cap: 3_000_000_000_000 },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(false);
    expect(provider.structuredComplete).not.toHaveBeenCalled();
    expect(result.provenance.provider).toBe('deterministic_heuristic');
    expect(result.provenance.method).toBe('large_cap_exclusion');
  });

  it('large-cap Healthcare → LLM called (Healthcare exempt from large-cap exclusion)', async () => {
    const provider = makeMockProvider(false, 0.85);
    await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Healthcare', revenue_ttm: 20_000_000_000, market_cap: 400_000_000_000 },
      provider,
      new PromptLoader(),
    );

    expect(provider.structuredComplete).toHaveBeenCalledTimes(1);
  });

  it('small-cap Tech (≤$10B) → LLM called', async () => {
    const provider = makeMockProvider(false, 0.85);
    await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Technology', market_cap: 6_000_000_000 },
      provider,
      new PromptLoader(),
    );

    expect(provider.structuredComplete).toHaveBeenCalledTimes(1);
  });

  it('LLM TRUE high confidence → flag=true, claude provenance', async () => {
    const provider = makeMockProvider(true, 0.88);
    const result = await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Healthcare', revenue_ttm: 500_000_000, market_cap: 2_000_000_000 },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(true);
    expect(result.provenance.provider).toBe('claude');
    expect(result.provenance.method).toBe('llm');
    expect(result.provenance.confidence).toBe(0.88);
  });

  it('LLM FALSE high confidence → flag=false', async () => {
    const provider = makeMockProvider(false, 0.91);
    const result = await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Financials', market_cap: 50_000_000_000 },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(false);
    expect(result.provenance.provider).toBe('claude');
  });

  it('LLM confidence 0.45 → flag=null, null_decision=true', async () => {
    const provider = makeMockProvider(true, 0.45);
    const result = await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Energy', market_cap: 8_000_000_000 },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBeNull();
    expect(result.provenance.null_decision).toBe(true);
    expect(result.provenance.confidence).toBe(0.45);
  });

  it('LLM API error → flag=null, no throw, error=true in provenance', async () => {
    const result = await detectBinaryFlag(
      { ...BASE_INPUT, sector: 'Financials', market_cap: 5_000_000_000 },
      makeErrorProvider(),
      new PromptLoader(),
    );

    expect(result.flag).toBeNull();
    expect(result.provenance.error).toBe(true);
    expect(result.provenance.error_message).toBe('network error');
  });
});
