// EPIC-003.1: Classification LLM Enrichment
// STORY-037: binary_flag — Heuristic + Targeted LLM
// TASK-037-002: BinaryFlagDetector
//
// Three-level detection:
//   Level 1: Healthcare AND revenue_ttm < $50M → TRUE (pre-revenue biotech)
//   Level 2: market_cap > $10B AND sector ∉ {Healthcare, Financials, Energy} → FALSE (large-cap exclusion)
//   Level 3: all other stocks → LLM call (targeted cohort)
//
// Large-cap exclusion removes ~600–700 of ~1,000 universe stocks from weekly LLM run.
// RFC-001: binary_flag highest-priority Bucket 8 override
// RFC-007: LLMProvider interface, confidence gating, provenance shape

import path from 'path';
import type { LLMProvider } from '../ports/llm-provider.interface';
import { PromptLoader } from '../utils/prompt-loader';
import type { ProvenanceEntry } from '@/modules/data-ingestion/types';
import type { FlagDetectionResult, DetectorOutput } from './holding-company.detector';

export interface BinaryFlagInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  revenue_ttm: number | null;
  market_cap: number | null;
}

const PRE_REVENUE_THRESHOLD = 50_000_000;
const LARGE_CAP_THRESHOLD = 10_000_000_000;
// Sectors exempt from the large-cap exclusion — binary risk exists even at large cap
const LLM_GATE_SECTORS = new Set(['Healthcare', 'Financials', 'Energy']);

const BINARY_FLAG_SCHEMA = {
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
  'src/modules/classification-enrichment/prompts/binary-flag.md',
);

export async function detectBinaryFlag(
  stock: BinaryFlagInput,
  llmProvider: LLMProvider,
  promptLoader: PromptLoader = new PromptLoader(),
): Promise<DetectorOutput> {
  const synced_at = new Date().toISOString();
  const threshold = parseFloat(process.env.LLM_ENRICHMENT_CONFIDENCE_THRESHOLD ?? '0.60');

  // Level 1: pre-revenue biotech/pharma
  if (
    stock.sector === 'Healthcare' &&
    stock.revenue_ttm !== null &&
    stock.revenue_ttm < PRE_REVENUE_THRESHOLD
  ) {
    return {
      flag: true,
      provenance: {
        provider: 'deterministic_heuristic',
        method: 'pre_revenue_biotech',
        confidence: 1.0,
        synced_at,
      },
    };
  }

  // Level 2: large-cap exclusion (null market_cap or null sector → cannot apply → falls to LLM)
  if (
    stock.market_cap !== null &&
    stock.market_cap > LARGE_CAP_THRESHOLD &&
    stock.sector !== null &&
    !LLM_GATE_SECTORS.has(stock.sector)
  ) {
    return {
      flag: false,
      provenance: {
        provider: 'deterministic_heuristic',
        method: 'large_cap_exclusion',
        confidence: 1.0,
        synced_at,
      },
    };
  }

  // Level 3: LLM call
  try {
    const { content: rawPrompt } = promptLoader.load(PROMPT_PATH);

    const llmResult = await llmProvider.structuredComplete<FlagDetectionResult>(
      rawPrompt,
      {
        company_name: stock.company_name ?? '',
        sector: stock.sector ?? '',
        industry: stock.industry ?? '',
        description: stock.description ?? '',
        revenue_ttm_billions: stock.revenue_ttm !== null
          ? (stock.revenue_ttm / 1e9).toFixed(2)
          : 'N/A',
        market_cap_billions: stock.market_cap !== null
          ? (stock.market_cap / 1e9).toFixed(2)
          : 'N/A',
      },
      BINARY_FLAG_SCHEMA,
    );

    const { flag_value, confidence } = llmResult.result;
    const baseProvenance: ProvenanceEntry = {
      provider: 'claude',
      model: llmResult.model,
      prompt_file: 'binary-flag.md',
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
