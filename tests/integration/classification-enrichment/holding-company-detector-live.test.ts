// EPIC-003.1: STORY-035 — live integration test for HoldingCompanyDetector
// Requires ANTHROPIC_API_KEY in .env.local

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ClaudeProvider } from '../../../src/modules/classification-enrichment/providers/claude.provider';
import { PromptLoader } from '../../../src/modules/classification-enrichment/utils/prompt-loader';
import { detectHoldingCompanyFlag } from '../../../src/modules/classification-enrichment/detectors/holding-company.detector';

describe('EPIC-003.1/STORY-035: HoldingCompanyDetector live API', () => {
  let provider: ClaudeProvider;
  let promptLoader: PromptLoader;

  beforeAll(() => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Skipping: ANTHROPIC_API_KEY not set');
      return;
    }
    provider = ClaudeProvider.fromEnv();
    promptLoader = new PromptLoader();
  });

  it('Berkshire Hathaway (holding company) → flag=true', async () => {
    if (!process.env.ANTHROPIC_API_KEY) return;

    const result = await detectHoldingCompanyFlag(
      {
        ticker: 'BRK.B',
        company_name: 'Berkshire Hathaway Inc.',
        sector: 'Financials',
        industry: 'Insurance - Diversified',
        description: 'Berkshire Hathaway Inc. is a holding company owning subsidiaries engaged in a number of diverse business activities including property and casualty insurance and reinsurance, utilities and energy, freight rail transportation, finance, manufacturing, retailing and services.',
        sic_code: null,
      },
      provider,
      promptLoader,
    );

    console.log('BRK.B result:', JSON.stringify(result, null, 2));
    expect(result.flag).toBe(true);
    expect(result.provenance.provider).toBe('claude');
    expect(result.provenance.confidence).toBeGreaterThanOrEqual(0.6);
  }, 30000);

  it('Apple (operating company) → flag=false', async () => {
    if (!process.env.ANTHROPIC_API_KEY) return;

    const result = await detectHoldingCompanyFlag(
      {
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        description: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. The Company also sells various related services including AppleCare, iCloud, Apple Arcade, Apple Music, Apple TV+, and the App Store.',
        sic_code: null,
      },
      provider,
      promptLoader,
    );

    console.log('AAPL result:', JSON.stringify(result, null, 2));
    expect(result.flag).toBe(false);
    expect(result.provenance.provider).toBe('claude');
    expect(result.provenance.confidence).toBeGreaterThanOrEqual(0.6);
  }, 30000);
});
