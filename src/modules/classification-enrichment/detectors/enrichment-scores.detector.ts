// EPIC-003.1: Classification LLM Enrichment
// STORY-040: E1–E6 Qualitative Enrichment Scores + Combined Enrichment Prompt
// TASK-040-002: EnrichmentScoresDetector — single combined LLM call returning 3 flags + 6 scores
//
// Architecture: one call per stock from combined-enrichment.md prompt.
// Flags use per-flag confidence gating; scores use a single shared scores_confidence gate.
// Half-integer rounding applied to scores before return (Math.round(v * 2) / 2).
// LLM errors are caught internally — function never throws.
// RFC-007: LLMProvider interface, confidence gating, provenance shape

import path from 'path';
import type { LLMProvider } from '../ports/llm-provider.interface';
import { PromptLoader } from '../utils/prompt-loader';
import type { ProvenanceEntry, ClassificationEnrichmentScores } from '@/modules/data-ingestion/types';

export interface EnrichmentScoresInput {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  revenue_ttm: number | null;
  market_cap: number | null;
  deterministic_flags: {
    holding_company_flag: boolean | null;
    cyclicality_flag: boolean | null;
    binary_risk: boolean | null;
  };
}

export type CombinedEnrichmentOutput = {
  flags: Partial<Record<'holding_company_flag' | 'cyclicality_flag' | 'binary_flag', boolean | null>>;
  scores: Partial<ClassificationEnrichmentScores>;
  provenance: Record<string, ProvenanceEntry>;
};

interface FlagAssessment {
  flag: boolean;
  confidence: number;
  reason: string;
}

interface CombinedLLMResult {
  holding_company: FlagAssessment;
  cyclicality: FlagAssessment;
  binary_risk: FlagAssessment;
  moat_strength_score: number;
  pricing_power_score: number;
  revenue_recurrence_score: number;
  margin_durability_score: number;
  capital_intensity_score: number;
  qualitative_cyclicality_score: number;
  scores_confidence: number;
  reasoning_summary: string;
}

const COMBINED_ENRICHMENT_SCHEMA = {
  type: 'object',
  properties: {
    holding_company: {
      type: 'object',
      properties: {
        flag: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' },
      },
      required: ['flag', 'confidence', 'reason'],
    },
    cyclicality: {
      type: 'object',
      properties: {
        flag: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' },
      },
      required: ['flag', 'confidence', 'reason'],
    },
    binary_risk: {
      type: 'object',
      properties: {
        flag: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' },
      },
      required: ['flag', 'confidence', 'reason'],
    },
    moat_strength_score:           { type: 'number', minimum: 1, maximum: 5 },
    pricing_power_score:           { type: 'number', minimum: 1, maximum: 5 },
    revenue_recurrence_score:      { type: 'number', minimum: 1, maximum: 5 },
    margin_durability_score:       { type: 'number', minimum: 1, maximum: 5 },
    capital_intensity_score:       { type: 'number', minimum: 1, maximum: 5 },
    qualitative_cyclicality_score: { type: 'number', minimum: 1, maximum: 5 },
    scores_confidence:  { type: 'number', minimum: 0, maximum: 1 },
    reasoning_summary:  { type: 'string' },
  },
  required: [
    'holding_company', 'cyclicality', 'binary_risk',
    'moat_strength_score', 'pricing_power_score', 'revenue_recurrence_score',
    'margin_durability_score', 'capital_intensity_score', 'qualitative_cyclicality_score',
    'scores_confidence', 'reasoning_summary',
  ],
};

const COMBINED_PROMPT_PATH = path.join(
  process.cwd(),
  'src/modules/classification-enrichment/prompts/combined-enrichment.md',
);

const SCORE_KEYS: (keyof ClassificationEnrichmentScores)[] = [
  'moat_strength_score',
  'pricing_power_score',
  'revenue_recurrence_score',
  'margin_durability_score',
  'capital_intensity_score',
  'qualitative_cyclicality_score',
];

function buildDeterministicFlagsContext(flags: EnrichmentScoresInput['deterministic_flags']): string {
  const notes: string[] = [];
  if (flags.holding_company_flag === true) {
    notes.push('holding_company = TRUE (SIC code indicates holding company structure)');
  }
  if (flags.cyclicality_flag === true) {
    notes.push('cyclicality = TRUE (Materials or Energy sector rule)');
  } else if (flags.cyclicality_flag === false) {
    notes.push('cyclicality = FALSE (Consumer Staples, Healthcare, or Utilities sector rule)');
  }
  if (flags.binary_risk === true) {
    notes.push('binary_risk = TRUE (pre-revenue Healthcare company)');
  } else if (flags.binary_risk === false) {
    notes.push('binary_risk = FALSE (large-cap exclusion — not a binary-risk candidate)');
  }

  if (notes.length === 0) {
    return 'No flags have been pre-determined; assess all three based on the company information above.';
  }

  return (
    'The following flags have been pre-determined by heuristic rules (your assessments should be consistent with these):\n' +
    notes.map((n) => `- ${n}`).join('\n')
  );
}

function roundHalfInteger(v: number): number {
  return Math.round(v * 2) / 2;
}

export async function detectCombinedEnrichment(
  stock: EnrichmentScoresInput,
  llmProvider: LLMProvider,
  promptLoader: PromptLoader,
): Promise<CombinedEnrichmentOutput> {
  const synced_at = new Date().toISOString();
  const threshold = parseFloat(process.env.LLM_ENRICHMENT_CONFIDENCE_THRESHOLD ?? '0.60');

  try {
    const { content: rawPrompt, version: promptVersion } = promptLoader.load(COMBINED_PROMPT_PATH);

    const llmResult = await llmProvider.structuredComplete<CombinedLLMResult>(
      rawPrompt,
      {
        company_name: stock.company_name ?? '',
        sector: stock.sector ?? '',
        industry: stock.industry ?? '',
        description: stock.description ?? '',
        revenue_ttm_billions: stock.revenue_ttm !== null ? (stock.revenue_ttm / 1e9).toFixed(2) : 'N/A',
        market_cap_billions: stock.market_cap !== null ? (stock.market_cap / 1e9).toFixed(2) : 'N/A',
        deterministic_flags: buildDeterministicFlagsContext(stock.deterministic_flags),
      },
      COMBINED_ENRICHMENT_SCHEMA,
    );

    const { result, model } = llmResult;
    const baseProvenance: ProvenanceEntry = {
      provider: 'claude',
      model,
      prompt_file: 'combined-enrichment.md',
      prompt_version: promptVersion,
      method: 'llm',
      synced_at,
    };

    const flags: CombinedEnrichmentOutput['flags'] = {};
    const provenance: Record<string, ProvenanceEntry> = {};

    // Per-flag confidence gating: each flag has its own confidence threshold check
    const flagMapping: Array<{
      llmKey: 'holding_company' | 'cyclicality' | 'binary_risk';
      provKey: 'holding_company_flag' | 'cyclicality_flag' | 'binary_flag';
    }> = [
      { llmKey: 'holding_company', provKey: 'holding_company_flag' },
      { llmKey: 'cyclicality',     provKey: 'cyclicality_flag' },
      { llmKey: 'binary_risk',     provKey: 'binary_flag' },
    ];

    for (const { llmKey, provKey } of flagMapping) {
      const { flag, confidence } = result[llmKey];
      if (confidence >= threshold) {
        flags[provKey] = flag;
        provenance[provKey] = { ...baseProvenance, confidence };
      } else {
        flags[provKey] = null;
        provenance[provKey] = { ...baseProvenance, confidence, null_decision: true };
      }
    }

    // Single scores_confidence gates all 6 scores together
    const scoresConfidence = result.scores_confidence;
    const scores: Partial<ClassificationEnrichmentScores> = {};
    const baseScoreProvenance: ProvenanceEntry = { ...baseProvenance, confidence: scoresConfidence };

    if (scoresConfidence >= threshold) {
      for (const key of SCORE_KEYS) {
        scores[key] = roundHalfInteger(result[key] as number);
        provenance[key] = baseScoreProvenance;
      }
    } else {
      // Scores below confidence threshold — not written; null_decision recorded so recomputation triggers fire
      for (const key of SCORE_KEYS) {
        provenance[key] = { ...baseScoreProvenance, null_decision: true };
      }
    }

    return { flags, scores, provenance };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errProvenance: ProvenanceEntry = {
      provider: 'claude',
      error: true,
      error_message: errMsg,
      synced_at,
    };
    const provenance: Record<string, ProvenanceEntry> = {};
    for (const provKey of ['holding_company_flag', 'cyclicality_flag', 'binary_flag', ...SCORE_KEYS]) {
      provenance[provKey] = errProvenance;
    }
    return { flags: {}, scores: {}, provenance };
  }
}
