// EPIC-003.1: Classification LLM Enrichment
// STORY-036: cyclicality_flag — Sector Heuristic + LLM
// TASK-036-003: Unit tests — 7 tests covering all detection paths

jest.mock('fs');

import fs from 'fs';
import type { CyclicalityInput } from '../../../src/modules/classification-enrichment/detectors/cyclicality.detector';
import type { FlagDetectionResult } from '../../../src/modules/classification-enrichment/detectors/holding-company.detector';
import type { LLMResponse } from '../../../src/modules/classification-enrichment/ports/llm-provider.interface';

const BASE_INPUT: CyclicalityInput = {
  ticker: 'TEST',
  company_name: 'Test Corp',
  sector: 'Technology',
  industry: 'Software',
  description: 'A software company.',
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

describe('EPIC-003.1/STORY-036: CyclicalityDetector', () => {
  let detectCyclicalityFlag: typeof import('../../../src/modules/classification-enrichment/detectors/cyclicality.detector').detectCyclicalityFlag;
  let PromptLoader: typeof import('../../../src/modules/classification-enrichment/utils/prompt-loader').PromptLoader;

  beforeAll(() => {
    ({ detectCyclicalityFlag } = jest.requireActual(
      '../../../src/modules/classification-enrichment/detectors/cyclicality.detector',
    ));
    ({ PromptLoader } = jest.requireActual(
      '../../../src/modules/classification-enrichment/utils/prompt-loader',
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue('Classify {{company_name}} {{sector}} {{industry}} {{description}}');
  });

  it('Materials → flag=true, no LLM call, deterministic provenance', async () => {
    const provider = makeMockProvider(false, 0.9);
    const result = await detectCyclicalityFlag(
      { ...BASE_INPUT, sector: 'Materials' },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(true);
    expect(provider.structuredComplete).not.toHaveBeenCalled();
    expect(result.provenance.provider).toBe('deterministic_heuristic');
    expect(result.provenance.method).toBe('sector_rule');
    expect(result.provenance.confidence).toBe(1.0);
  });

  it('Energy → flag=true, no LLM call', async () => {
    const provider = makeMockProvider(false, 0.9);
    const result = await detectCyclicalityFlag(
      { ...BASE_INPUT, sector: 'Energy' },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(true);
    expect(provider.structuredComplete).not.toHaveBeenCalled();
  });

  it('Consumer Staples → flag=false, no LLM call', async () => {
    const provider = makeMockProvider(true, 0.9);
    const result = await detectCyclicalityFlag(
      { ...BASE_INPUT, sector: 'Consumer Staples' },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(false);
    expect(provider.structuredComplete).not.toHaveBeenCalled();
    expect(result.provenance.provider).toBe('deterministic_heuristic');
  });

  it('Technology sector → LLM called', async () => {
    const provider = makeMockProvider(true, 0.85);
    const result = await detectCyclicalityFlag(BASE_INPUT, provider, new PromptLoader());

    expect(provider.structuredComplete).toHaveBeenCalledTimes(1);
    expect(result.flag).toBe(true);
    expect(result.provenance.provider).toBe('claude');
    expect(result.provenance.method).toBe('llm');
  });

  it('Real Estate sector → LLM called (not hardcoded FALSE)', async () => {
    const provider = makeMockProvider(true, 0.75);
    await detectCyclicalityFlag(
      { ...BASE_INPUT, sector: 'Real Estate' },
      provider,
      new PromptLoader(),
    );

    expect(provider.structuredComplete).toHaveBeenCalledTimes(1);
  });

  it('LLM confidence 0.35 → flag=null, null_decision=true', async () => {
    const provider = makeMockProvider(true, 0.35);
    const result = await detectCyclicalityFlag(BASE_INPUT, provider, new PromptLoader());

    expect(result.flag).toBeNull();
    expect(result.provenance.null_decision).toBe(true);
    expect(result.provenance.confidence).toBe(0.35);
  });

  it('LLM API error → flag=null, no throw, error=true in provenance', async () => {
    const result = await detectCyclicalityFlag(BASE_INPUT, makeErrorProvider(), new PromptLoader());

    expect(result.flag).toBeNull();
    expect(result.provenance.error).toBe(true);
    expect(result.provenance.error_message).toBe('network error');
  });
});
