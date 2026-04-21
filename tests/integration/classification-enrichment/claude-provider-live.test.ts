// EPIC-003.1: Classification LLM Enrichment
// STORY-034: Live API smoke test for ClaudeProvider
// NOT part of the regular unit test suite — requires ANTHROPIC_API_KEY in .env.local

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ClaudeProvider } from '../../../src/modules/classification-enrichment/providers/claude.provider';

const SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['answer', 'confidence'],
};

describe('EPIC-003.1/STORY-034: ClaudeProvider live API smoke test', () => {
  it('returns a structured result from real Anthropic API', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Skipping: ANTHROPIC_API_KEY not set');
      return;
    }

    const provider = ClaudeProvider.fromEnv();
    expect(provider.providerName).toBe('claude');

    const result = await provider.structuredComplete<{ answer: string; confidence: number }>(
      'Answer in one word: what is 2 + 2?',
      {},
      SCHEMA,
    );

    console.log('Live result:', JSON.stringify(result, null, 2));

    expect(result.result.answer).toBeDefined();
    expect(typeof result.result.confidence).toBe('number');
    expect(result.result.confidence).toBeGreaterThan(0);
    expect(result.promptVersion).toHaveLength(8);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.model).toContain('claude');
  }, 30000);
});
