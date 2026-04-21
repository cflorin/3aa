// EPIC-003.1: Classification LLM Enrichment
// STORY-040: E1–E6 Qualitative Enrichment Scores + Combined Enrichment Prompt
// TASK-040-004: Unit tests for detectCombinedEnrichment

jest.mock('fs');

import fs from 'fs';
import type { EnrichmentScoresInput } from '../../../src/modules/classification-enrichment/detectors/enrichment-scores.detector';
import type { LLMResponse } from '../../../src/modules/classification-enrichment/ports/llm-provider.interface';

const MOCK_PROMPT = 'combined enrichment prompt {{company_name}} {{sector}} {{industry}} {{description}} {{revenue_ttm_billions}} {{market_cap_billions}} {{deterministic_flags}}';

const makeFullLLMResponse = (overrides: {
  holdingFlag?: boolean; holdingConf?: number;
  cyclicalityFlag?: boolean; cyclicalityConf?: number;
  binaryFlag?: boolean; binaryConf?: number;
  moat?: number; pricingPower?: number; recurrence?: number;
  marginDurability?: number; capIntensity?: number; qualCyclicality?: number;
  scoresConf?: number;
} = {}) => ({
  result: {
    holding_company: { flag: overrides.holdingFlag ?? false, confidence: overrides.holdingConf ?? 0.88, reason: 'test' },
    cyclicality: { flag: overrides.cyclicalityFlag ?? false, confidence: overrides.cyclicalityConf ?? 0.88, reason: 'test' },
    binary_risk: { flag: overrides.binaryFlag ?? false, confidence: overrides.binaryConf ?? 0.88, reason: 'test' },
    moat_strength_score:           overrides.moat ?? 3.0,
    pricing_power_score:           overrides.pricingPower ?? 3.0,
    revenue_recurrence_score:      overrides.recurrence ?? 3.0,
    margin_durability_score:       overrides.marginDurability ?? 3.0,
    capital_intensity_score:       overrides.capIntensity ?? 3.0,
    qualitative_cyclicality_score: overrides.qualCyclicality ?? 3.0,
    scores_confidence: overrides.scoresConf ?? 0.85,
    reasoning_summary: 'mid-tier tech business',
  },
  model: 'claude-test',
  promptVersion: 'abc12345',
  inputTokens: 100,
  outputTokens: 50,
} as LLMResponse<unknown>);

const makeMockProvider = (overrides = {}) => ({
  providerName: 'claude' as const,
  structuredComplete: jest.fn().mockResolvedValue(makeFullLLMResponse(overrides)),
});

const makeErrorProvider = () => ({
  providerName: 'claude' as const,
  structuredComplete: jest.fn().mockRejectedValue(new Error('api timeout')),
});

const BASE_INPUT: EnrichmentScoresInput = {
  ticker: 'TEST',
  company_name: 'Test Corp',
  sector: 'Technology',
  industry: 'Software',
  description: 'A software company providing enterprise solutions.',
  revenue_ttm: 5_000_000_000,
  market_cap: 50_000_000_000,
  deterministic_flags: {
    holding_company_flag: null,
    cyclicality_flag: null,
    binary_risk: null,
  },
};

describe('EPIC-003.1/STORY-040: detectCombinedEnrichment', () => {
  let detectCombinedEnrichment: typeof import('../../../src/modules/classification-enrichment/detectors/enrichment-scores.detector').detectCombinedEnrichment;
  let PromptLoader: typeof import('../../../src/modules/classification-enrichment/utils/prompt-loader').PromptLoader;

  beforeAll(() => {
    ({ detectCombinedEnrichment } = jest.requireActual(
      '../../../src/modules/classification-enrichment/detectors/enrichment-scores.detector',
    ));
    ({ PromptLoader } = jest.requireActual(
      '../../../src/modules/classification-enrichment/utils/prompt-loader',
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue(MOCK_PROMPT);
  });

  it('all outputs above threshold → all 3 flags written, all 6 scores written', async () => {
    const result = await detectCombinedEnrichment(BASE_INPUT, makeMockProvider(), new PromptLoader());

    // All three flags returned
    expect(result.flags['holding_company_flag']).toBe(false);
    expect(result.flags['cyclicality_flag']).toBe(false);
    expect(result.flags['binary_flag']).toBe(false);

    // All six scores returned
    expect(Object.keys(result.scores)).toHaveLength(6);
    expect(result.scores.moat_strength_score).toBe(3.0);
    expect(result.scores.pricing_power_score).toBe(3.0);

    // Provenance for flags and scores
    expect(result.provenance['holding_company_flag']?.provider).toBe('claude');
    expect(result.provenance['moat_strength_score']?.provider).toBe('claude');
    expect(result.provenance['holding_company_flag']?.null_decision).toBeUndefined();
  });

  it('scores_confidence below threshold → all 6 scores empty, flags still written', async () => {
    const provider = makeMockProvider({ scoresConf: 0.45 }); // below default 0.60
    const result = await detectCombinedEnrichment(BASE_INPUT, provider, new PromptLoader());

    // Scores NOT written (empty partial)
    expect(Object.keys(result.scores)).toHaveLength(0);

    // Score provenance records null_decision
    expect(result.provenance['moat_strength_score']?.null_decision).toBe(true);
    expect(result.provenance['pricing_power_score']?.null_decision).toBe(true);

    // Flags still written (each has its own confidence, which is 0.88 ≥ 0.60)
    expect(result.flags['holding_company_flag']).toBe(false);
    expect(result.flags['cyclicality_flag']).toBe(false);
  });

  it('one flag below confidence threshold → that flag null, others written', async () => {
    // holding_company confidence = 0.40 (below threshold), others = 0.90
    const provider = makeMockProvider({ holdingConf: 0.40, cyclicalityConf: 0.90, binaryConf: 0.90 });
    const result = await detectCombinedEnrichment(BASE_INPUT, provider, new PromptLoader());

    expect(result.flags['holding_company_flag']).toBeNull();
    expect(result.provenance['holding_company_flag']?.null_decision).toBe(true);
    expect(result.provenance['holding_company_flag']?.confidence).toBe(0.40);

    // Other flags written
    expect(result.flags['cyclicality_flag']).toBe(false);
    expect(result.flags['binary_flag']).toBe(false);
    expect(result.provenance['cyclicality_flag']?.null_decision).toBeUndefined();
  });

  it('half-integer rounding: raw 3.7 → 3.5, raw 3.8 → 4.0', async () => {
    const provider = makeMockProvider({ moat: 3.7, pricingPower: 3.8 });
    const result = await detectCombinedEnrichment(BASE_INPUT, provider, new PromptLoader());

    expect(result.scores.moat_strength_score).toBe(3.5);   // Math.round(7.4)/2 = 7/2 = 3.5
    expect(result.scores.pricing_power_score).toBe(4.0);   // Math.round(7.6)/2 = 8/2 = 4.0
  });

  it('LLM API error → empty flags and scores, error in provenance for all fields', async () => {
    const result = await detectCombinedEnrichment(BASE_INPUT, makeErrorProvider(), new PromptLoader());

    expect(Object.keys(result.flags)).toHaveLength(0);
    expect(Object.keys(result.scores)).toHaveLength(0);

    expect(result.provenance['holding_company_flag']?.error).toBe(true);
    expect(result.provenance['holding_company_flag']?.error_message).toBe('api timeout');
    expect(result.provenance['moat_strength_score']?.error).toBe(true);
    expect(result.provenance['qualitative_cyclicality_score']?.error).toBe(true);
  });
});
