// EPIC-003.1: Classification LLM Enrichment
// STORY-036: cyclicality_flag — Sector Heuristic + LLM
// TASK-036-002: CyclicalityDetector
//
// Two-level detection:
//   Level 1: Materials/Energy → TRUE; Consumer Staples/Healthcare/Utilities → FALSE
//   Level 2: All other sectors (including null) → LLM call
//
// Real Estate is in the LLM bucket — cyclicality is business-model-dependent within RE.
// RFC-001: cyclicality_flag bucket scorer modifier
// RFC-007: LLMProvider interface, confidence gating, provenance shape

import path from 'path';
import type { LLMProvider } from '../ports/llm-provider.interface';
import { PromptLoader } from '../utils/prompt-loader';
import type { ProvenanceEntry } from '@/modules/data-ingestion/types';
import type { FlagDetectionResult, DetectorOutput } from './holding-company.detector';

export interface CyclicalityInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
}

const CYCLICAL_SECTORS = new Set(['Materials', 'Energy']);
const DEFENSIVE_SECTORS = new Set(['Consumer Staples', 'Healthcare', 'Utilities']);

const CYCLICALITY_SCHEMA = {
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
  'src/modules/classification-enrichment/prompts/cyclicality-flag.md',
);

export async function detectCyclicalityFlag(
  stock: CyclicalityInput,
  llmProvider: LLMProvider,
  promptLoader: PromptLoader = new PromptLoader(),
): Promise<DetectorOutput> {
  const synced_at = new Date().toISOString();
  const threshold = parseFloat(process.env.LLM_ENRICHMENT_CONFIDENCE_THRESHOLD ?? '0.60');

  // Level 1: sector rules
  if (stock.sector !== null) {
    if (CYCLICAL_SECTORS.has(stock.sector)) {
      return {
        flag: true,
        provenance: {
          provider: 'deterministic_heuristic',
          method: 'sector_rule',
          confidence: 1.0,
          synced_at,
        },
      };
    }
    if (DEFENSIVE_SECTORS.has(stock.sector)) {
      return {
        flag: false,
        provenance: {
          provider: 'deterministic_heuristic',
          method: 'sector_rule',
          confidence: 1.0,
          synced_at,
        },
      };
    }
  }

  // Level 2: LLM call (ambiguous sector or null)
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
      CYCLICALITY_SCHEMA,
    );

    const { flag_value, confidence } = llmResult.result;
    const baseProvenance: ProvenanceEntry = {
      provider: 'claude',
      model: llmResult.model,
      prompt_file: 'cyclicality-flag.md',
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
