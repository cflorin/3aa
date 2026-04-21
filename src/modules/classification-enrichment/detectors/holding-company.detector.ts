// EPIC-003.1: Classification LLM Enrichment
// STORY-035: holding_company_flag — SIC Heuristic + LLM
// TASK-035-003: HoldingCompanyDetector
//
// Two-level detection:
//   Level 1: SIC 6710–6726 → TRUE deterministically (no LLM call)
//   Level 2: All other stocks → LLM call with business description
//
// BC-035-001: FMP stable profile does not return SIC code — sicCode is always null
//   in production. SIC path is exercised via synthetic test fixtures only.
// RFC-001: holding_company_flag tie-break resolver
// RFC-007: LLMProvider interface, confidence gating, provenance shape

import path from 'path';
import type { LLMProvider } from '../ports/llm-provider.interface';
import { PromptLoader } from '../utils/prompt-loader';
import type { ProvenanceEntry } from '@/modules/data-ingestion/types';

export interface HoldingCompanyInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  sic_code: string | null;
}

export interface FlagDetectionResult {
  flag_value: boolean;
  confidence: number;
  reason: string;
}

export interface DetectorOutput {
  flag: boolean | null;   // null = not written (low confidence or error)
  provenance: ProvenanceEntry;
}

const SIC_MIN = 6710;
const SIC_MAX = 6726;

const HOLDING_COMPANY_SCHEMA = {
  type: 'object',
  properties: {
    flag_value: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
  },
  required: ['flag_value', 'confidence', 'reason'],
};

const PROMPT_PATH = path.join(
  process.cwd(),
  'src/modules/classification-enrichment/prompts/holding-company-flag.md',
);

export async function detectHoldingCompanyFlag(
  stock: HoldingCompanyInput,
  llmProvider: LLMProvider,
  promptLoader: PromptLoader = new PromptLoader(),
): Promise<DetectorOutput> {
  const synced_at = new Date().toISOString();
  const threshold = parseFloat(process.env.LLM_ENRICHMENT_CONFIDENCE_THRESHOLD ?? '0.60');

  // Level 1: SIC heuristic
  if (stock.sic_code !== null) {
    const sic = parseInt(stock.sic_code, 10);
    if (!isNaN(sic) && sic >= SIC_MIN && sic <= SIC_MAX) {
      return {
        flag: true,
        provenance: {
          provider: 'deterministic_heuristic',
          method: 'sic_code',
          confidence: 1.0,
          synced_at,
        },
      };
    }
  }

  // Level 2: LLM call
  try {
    const { content: rawPrompt } = promptLoader.load(PROMPT_PATH);

    const llmResult = await llmProvider.structuredComplete<FlagDetectionResult>(
      rawPrompt,
      {
        company_name: stock.company_name ?? '',
        sector: stock.sector ?? '',
        industry: stock.industry ?? '',
        description: stock.description ?? '',
      },
      HOLDING_COMPANY_SCHEMA,
    );

    const { flag_value, confidence } = llmResult.result;
    const baseProvenance = {
      provider: 'claude' as const,
      model: llmResult.model,
      prompt_file: 'holding-company-flag.md',
      prompt_version: llmResult.promptVersion,
      method: 'llm',
      synced_at,
      confidence,
    };

    if (confidence >= threshold) {
      return { flag: flag_value, provenance: baseProvenance };
    }

    return {
      flag: null,
      provenance: { ...baseProvenance, null_decision: true },
    };
  } catch (err) {
    return {
      flag: null,
      provenance: {
        provider: 'claude',
        error: true,
        error_message: err instanceof Error ? err.message : String(err),
        synced_at,
      },
    };
  }
}
