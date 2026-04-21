// EPIC-003.1: Classification LLM Enrichment
// STORY-035: holding_company_flag — SIC Heuristic + LLM
// TASK-035-004: Unit tests — 7 tests covering all detection paths
//
// All fixtures: synthetic (no live API calls, no live disk reads)

jest.mock('fs');

import fs from 'fs';
import type {
  HoldingCompanyInput,
  FlagDetectionResult,
} from '../../../src/modules/classification-enrichment/detectors/holding-company.detector';
import type { LLMResponse } from '../../../src/modules/classification-enrichment/ports/llm-provider.interface';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_INPUT: HoldingCompanyInput = {
  ticker: 'TEST',
  company_name: 'Test Corp',
  sector: 'Financials',
  industry: 'Diversified Financial Services',
  description: 'A company that operates various businesses.',
  sic_code: null,
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

const makeErrorProvider = (message: string) => ({
  providerName: 'claude' as const,
  structuredComplete: jest.fn().mockRejectedValue(new Error(message)),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EPIC-003.1/STORY-035: HoldingCompanyDetector', () => {
  let detectHoldingCompanyFlag: typeof import('../../../src/modules/classification-enrichment/detectors/holding-company.detector').detectHoldingCompanyFlag;
  let PromptLoader: typeof import('../../../src/modules/classification-enrichment/utils/prompt-loader').PromptLoader;

  beforeAll(() => {
    ({ detectHoldingCompanyFlag } = jest.requireActual(
      '../../../src/modules/classification-enrichment/detectors/holding-company.detector',
    ));
    ({ PromptLoader } = jest.requireActual(
      '../../../src/modules/classification-enrichment/utils/prompt-loader',
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue('Classify {{company_name}} {{sector}} {{industry}} {{description}}');
  });

  it('SIC 6719 → flag=true, no LLM call, deterministic provenance', async () => {
    const provider = makeMockProvider(false, 0.9);
    const result = await detectHoldingCompanyFlag(
      { ...BASE_INPUT, sic_code: '6719' },
      provider,
      new PromptLoader(),
    );

    expect(result.flag).toBe(true);
    expect(provider.structuredComplete).not.toHaveBeenCalled();
    expect(result.provenance.provider).toBe('deterministic_heuristic');
    expect(result.provenance.method).toBe('sic_code');
    expect(result.provenance.confidence).toBe(1.0);
  });

  it('SIC outside range (5000) → LLM called', async () => {
    const provider = makeMockProvider(false, 0.9);
    await detectHoldingCompanyFlag(
      { ...BASE_INPUT, sic_code: '5000' },
      provider,
      new PromptLoader(),
    );
    expect(provider.structuredComplete).toHaveBeenCalledTimes(1);
  });

  it('sic_code null → LLM called', async () => {
    const provider = makeMockProvider(false, 0.9);
    await detectHoldingCompanyFlag(BASE_INPUT, provider, new PromptLoader());
    expect(provider.structuredComplete).toHaveBeenCalledTimes(1);
  });

  it('LLM confidence 0.9 TRUE → flag=true, llm provenance', async () => {
    const provider = makeMockProvider(true, 0.9);
    const result = await detectHoldingCompanyFlag(BASE_INPUT, provider, new PromptLoader());

    expect(result.flag).toBe(true);
    expect(result.provenance.provider).toBe('claude');
    expect(result.provenance.method).toBe('llm');
    expect(result.provenance.confidence).toBe(0.9);
    expect(result.provenance.model).toBe('claude-test');
    expect(result.provenance.prompt_version).toBe('abc12345');
    expect(result.provenance.null_decision).toBeUndefined();
  });

  it('LLM confidence 0.9 FALSE → flag=false, llm provenance', async () => {
    const provider = makeMockProvider(false, 0.9);
    const result = await detectHoldingCompanyFlag(BASE_INPUT, provider, new PromptLoader());

    expect(result.flag).toBe(false);
    expect(result.provenance.provider).toBe('claude');
    expect(result.provenance.confidence).toBe(0.9);
  });

  it('LLM confidence 0.4 → flag=null, null_decision=true in provenance', async () => {
    const provider = makeMockProvider(true, 0.4);
    const result = await detectHoldingCompanyFlag(BASE_INPUT, provider, new PromptLoader());

    expect(result.flag).toBeNull();
    expect(result.provenance.null_decision).toBe(true);
    expect(result.provenance.confidence).toBe(0.4);
  });

  it('LLM API error → flag=null, no throw, error=true in provenance', async () => {
    const provider = makeErrorProvider('network error');
    const result = await detectHoldingCompanyFlag(BASE_INPUT, provider, new PromptLoader());

    expect(result.flag).toBeNull();
    expect(result.provenance.error).toBe(true);
    expect(result.provenance.error_message).toBe('network error');
  });
});
