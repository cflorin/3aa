// EPIC-003.1: Classification LLM Enrichment
// STORY-038: classificationEnrichmentSync Job — pre-filter orchestrator, shouldEnrich, sync service
// STORY-040: Extended with detectCombinedEnrichment (real prompt + E1–E6 scores); description from DB
//
// Architecture: one combined LLM call per stock — avoids redundant context, keeps flags consistent.
// Pre-filters run first; deterministic results applied before LLM call.
// Combined call always made (E1–E6 scores always require LLM regardless of flag pre-determination).
// BC-035-001: FMP does not return SIC codes; holding_company_flag pre-filter always returns null
//   in production — effectively all stocks call LLM until FMP exposes SIC.
// RFC-007: LLMProvider interface, confidence gating, provenance shape

import { prisma } from '@/infrastructure/database/prisma';
import type { LLMProvider } from '../ports/llm-provider.interface';
import { PromptLoader } from '../utils/prompt-loader';
import type { ProvenanceEntry, ClassificationEnrichmentScores } from '@/modules/data-ingestion/types';
import type { Prisma } from '@prisma/client';
import { detectCombinedEnrichment } from '../detectors/enrichment-scores.detector';

const SIC_HOLDING_MIN = 6710;
const SIC_HOLDING_MAX = 6726;
const PRE_REVENUE_THRESHOLD = 50_000_000;
const LARGE_CAP_THRESHOLD = 10_000_000_000;
const LLM_GATE_SECTORS = new Set(['Healthcare', 'Financials', 'Energy']);
const CYCLICAL_SECTORS = new Set(['Materials', 'Energy']);
const DEFENSIVE_SECTORS = new Set(['Consumer Staples', 'Healthcare', 'Utilities']);

export interface ClassificationEnrichmentInput {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  sicCode: string | null;
  revenueTtm: number | null;
  marketCap: number | null;
  dataLastSyncedAt: Date | null;
  dataProviderProvenance: Record<string, unknown>;
}

export interface PreFilterResult {
  holding_company_flag: boolean | null;
  cyclicality_flag: boolean | null;
  binary_flag: boolean | null;
  needs_llm: boolean;
}

export interface ClassificationEnrichmentSyncResult {
  stocks_processed: number;
  stocks_updated: number;
  stocks_skipped: number;
  llm_calls_made: number;
  errors: number;
  duration_ms: number;
}

const SCORE_DB_MAP: Record<keyof ClassificationEnrichmentScores, keyof Prisma.StockUpdateInput> = {
  moat_strength_score:           'moatStrengthScore',
  pricing_power_score:           'pricingPowerScore',
  revenue_recurrence_score:      'revenueRecurrenceScore',
  margin_durability_score:       'marginDurabilityScore',
  capital_intensity_score:       'capitalIntensityScore',
  qualitative_cyclicality_score: 'qualitativeCyclicalityScore',
};

const FLAG_DB_MAP: Record<string, string> = {
  holding_company_flag: 'holdingCompanyFlag',
  cyclicality_flag: 'cyclicalityFlag',
  binary_flag: 'binaryFlag',
};

export function runDeterministicPreFilters(stock: ClassificationEnrichmentInput): PreFilterResult {
  // holding_company_flag: SIC 6710–6726 → true; null otherwise (BC-035-001: always null in prod)
  let holdingCompanyFlag: boolean | null = null;
  if (stock.sicCode !== null) {
    const sic = parseInt(stock.sicCode, 10);
    if (!isNaN(sic) && sic >= SIC_HOLDING_MIN && sic <= SIC_HOLDING_MAX) {
      holdingCompanyFlag = true;
    }
  }

  // cyclicality_flag: CYCLICAL_SECTORS → true; DEFENSIVE_SECTORS → false; else null
  let cyclicalityFlag: boolean | null = null;
  if (stock.sector !== null) {
    if (CYCLICAL_SECTORS.has(stock.sector)) {
      cyclicalityFlag = true;
    } else if (DEFENSIVE_SECTORS.has(stock.sector)) {
      cyclicalityFlag = false;
    }
  }

  // binary_flag: Level 1 pre-revenue biotech → true; Level 2 large-cap exclusion → false; else null
  let binaryFlag: boolean | null = null;
  if (stock.sector === 'Healthcare' && stock.revenueTtm !== null && stock.revenueTtm < PRE_REVENUE_THRESHOLD) {
    binaryFlag = true;
  } else if (
    stock.marketCap !== null &&
    stock.marketCap > LARGE_CAP_THRESHOLD &&
    stock.sector !== null &&
    !LLM_GATE_SECTORS.has(stock.sector)
  ) {
    binaryFlag = false;
  }

  const needs_llm = holdingCompanyFlag === null || cyclicalityFlag === null || binaryFlag === null;

  return {
    holding_company_flag: holdingCompanyFlag,
    cyclicality_flag: cyclicalityFlag,
    binary_flag: binaryFlag,
    needs_llm,
  };
}

export function shouldEnrich(
  stock: { dataLastSyncedAt: Date | null; dataProviderProvenance: Record<string, unknown> },
  currentPromptVersions: Record<string, string>,
  currentModel: string,
  mode: 'incremental' | 'full',
): boolean {
  if (mode === 'full') return true;

  const prov = stock.dataProviderProvenance;

  // Trigger 1: new stock — no holding_company_flag provenance recorded yet
  if (!prov['holding_company_flag']) return true;

  // Trigger 2: underlying data changed within last 30 days
  if (stock.dataLastSyncedAt !== null) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (stock.dataLastSyncedAt > thirtyDaysAgo) return true;
  }

  // Triggers 3–5: check each tracked field's stored provenance
  const trackedFields = Object.keys(currentPromptVersions);
  for (const field of trackedFields) {
    const fieldProv = prov[field] as Record<string, unknown> | undefined;
    if (!fieldProv) continue;

    // Trigger 3: prompt version drift
    if (fieldProv['prompt_version'] !== undefined && fieldProv['prompt_version'] !== currentPromptVersions[field]) {
      return true;
    }

    // Trigger 4: model version drift
    if (fieldProv['model'] !== undefined && fieldProv['model'] !== currentModel) {
      return true;
    }

    // Trigger 5: error state — re-attempt enrichment for failed stocks
    if (fieldProv['error'] === true) return true;
  }

  return false;
}

function buildDeterministicProvenance(
  flag: 'holding_company_flag' | 'cyclicality_flag' | 'binary_flag',
  value: boolean,
  synced_at: string,
): ProvenanceEntry {
  if (flag === 'holding_company_flag') {
    return { provider: 'deterministic_heuristic', method: 'sic_code', confidence: 1.0, synced_at };
  }
  if (flag === 'cyclicality_flag') {
    return {
      provider: 'deterministic_heuristic',
      method: value ? 'cyclical_sector' : 'defensive_sector',
      confidence: 1.0,
      synced_at,
    };
  }
  // binary_flag
  return {
    provider: 'deterministic_heuristic',
    method: value ? 'pre_revenue_biotech' : 'large_cap_exclusion',
    confidence: 1.0,
    synced_at,
  };
}

export async function syncClassificationEnrichment(
  llmProvider: LLMProvider,
  options: { mode: 'incremental' | 'full'; now?: Date; tickerFilter?: string },
): Promise<ClassificationEnrichmentSyncResult> {
  const now = options.now ?? new Date();
  const startedAt = now.getTime();

  const promptLoader = new PromptLoader();
  const currentModel = process.env.LLM_MODEL ?? 'claude-opus-4-5';

  // Load combined prompt once to get the current version hash for recomputation triggers
  // Import path matches the detector's COMBINED_PROMPT_PATH
  const path = await import('path');
  const combinedPromptPath = path.join(
    process.cwd(),
    'src/modules/classification-enrichment/prompts/combined-enrichment.md',
  );
  const { version: combinedPromptVersion } = promptLoader.load(combinedPromptPath);

  const currentPromptVersions: Record<string, string> = {
    holding_company_flag:         combinedPromptVersion,
    cyclicality_flag:             combinedPromptVersion,
    binary_flag:                  combinedPromptVersion,
    moat_strength_score:          combinedPromptVersion,
    pricing_power_score:          combinedPromptVersion,
    revenue_recurrence_score:     combinedPromptVersion,
    margin_durability_score:      combinedPromptVersion,
    capital_intensity_score:      combinedPromptVersion,
    qualitative_cyclicality_score: combinedPromptVersion,
  };

  const dbStocks = await prisma.stock.findMany({
    where: { inUniverse: true, ...(options.tickerFilter ? { ticker: options.tickerFilter } : {}) },
    select: {
      ticker: true,
      companyName: true,
      sector: true,
      industry: true,
      description: true,
      revenueTtm: true,
      marketCap: true,
      dataLastSyncedAt: true,
      dataProviderProvenance: true,
    },
  });

  let stocksProcessed = 0;
  let stocksUpdated = 0;
  let stocksSkipped = 0;
  let llmCallsMade = 0;
  let errors = 0;

  for (const dbStock of dbStocks) {
    try {
      const stock: ClassificationEnrichmentInput = {
        ticker: dbStock.ticker,
        companyName: dbStock.companyName,
        sector: dbStock.sector,
        industry: dbStock.industry,
        description: dbStock.description,
        sicCode: null, // BC-035-001: FMP stable profile does not return SIC code
        revenueTtm: dbStock.revenueTtm !== null ? dbStock.revenueTtm.toNumber() : null,
        marketCap: dbStock.marketCap !== null ? dbStock.marketCap.toNumber() : null,
        dataLastSyncedAt: dbStock.dataLastSyncedAt,
        dataProviderProvenance: (dbStock.dataProviderProvenance ?? {}) as Record<string, unknown>,
      };

      if (!shouldEnrich(stock, currentPromptVersions, currentModel, options.mode)) {
        stocksSkipped++;
        continue;
      }

      stocksProcessed++;

      const preFilters = runDeterministicPreFilters(stock);
      const currentProv = stock.dataProviderProvenance;
      const provenanceUpdates: Record<string, ProvenanceEntry> = {};
      const fieldUpdates: Prisma.StockUpdateInput = {};
      const synced_at = now.toISOString();

      // Apply deterministic pre-filter results
      if (preFilters.holding_company_flag !== null) {
        fieldUpdates.holdingCompanyFlag = preFilters.holding_company_flag;
        provenanceUpdates['holding_company_flag'] = buildDeterministicProvenance('holding_company_flag', preFilters.holding_company_flag, synced_at);
      }
      if (preFilters.cyclicality_flag !== null) {
        fieldUpdates.cyclicalityFlag = preFilters.cyclicality_flag;
        provenanceUpdates['cyclicality_flag'] = buildDeterministicProvenance('cyclicality_flag', preFilters.cyclicality_flag, synced_at);
      }
      if (preFilters.binary_flag !== null) {
        fieldUpdates.binaryFlag = preFilters.binary_flag;
        provenanceUpdates['binary_flag'] = buildDeterministicProvenance('binary_flag', preFilters.binary_flag, synced_at);
      }

      // Always make combined LLM call — E1–E6 scores always require LLM (STORY-040)
      const enrichmentResult = await detectCombinedEnrichment(
        {
          ticker: stock.ticker,
          company_name: stock.companyName,
          sector: stock.sector,
          industry: stock.industry,
          description: stock.description,
          revenue_ttm: stock.revenueTtm,
          market_cap: stock.marketCap,
          deterministic_flags: {
            holding_company_flag: preFilters.holding_company_flag,
            cyclicality_flag: preFilters.cyclicality_flag,
            binary_risk: preFilters.binary_flag,
          },
        },
        llmProvider,
        promptLoader,
      );

      llmCallsMade++;

      // Apply LLM flag results — skip flags that were pre-determined by heuristics
      const preFilterMap: Record<string, boolean | null> = {
        holding_company_flag: preFilters.holding_company_flag,
        cyclicality_flag: preFilters.cyclicality_flag,
        binary_flag: preFilters.binary_flag,
      };

      for (const [flagKey, flagValue] of Object.entries(enrichmentResult.flags)) {
        if (preFilterMap[flagKey] !== null) continue; // pre-determined; preserve heuristic result
        if (flagValue !== null && flagValue !== undefined) {
          (fieldUpdates as Record<string, unknown>)[FLAG_DB_MAP[flagKey]] = flagValue;
        }
      }

      // Apply LLM score results
      for (const [scoreKey, scoreValue] of Object.entries(enrichmentResult.scores)) {
        if (scoreValue !== null && scoreValue !== undefined) {
          const dbKey = SCORE_DB_MAP[scoreKey as keyof ClassificationEnrichmentScores];
          if (dbKey) (fieldUpdates as Record<string, unknown>)[dbKey as string] = scoreValue;
        }
      }

      // Merge provenance — skip pre-determined flag provenance (keep heuristic provenance)
      for (const [key, prov] of Object.entries(enrichmentResult.provenance)) {
        if (preFilterMap[key] !== null && preFilterMap[key] !== undefined) continue;
        provenanceUpdates[key] = prov;
      }

      // Track LLM errors (detector caught them internally; reflected in provenance)
      if (Object.values(enrichmentResult.provenance).some((p) => p.error === true)) {
        errors++;
      }

      // Single DB update per stock — merge provenance with existing keys preserved
      await prisma.stock.update({
        where: { ticker: stock.ticker },
        data: {
          ...fieldUpdates,
          dataProviderProvenance: { ...currentProv, ...provenanceUpdates } as Prisma.InputJsonValue,
        },
      });
      stocksUpdated++;
    } catch (err) {
      errors++;
      console.error(JSON.stringify({
        event: 'classification_enrichment_error',
        ticker: dbStock.ticker,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return {
    stocks_processed: stocksProcessed,
    stocks_updated: stocksUpdated,
    stocks_skipped: stocksSkipped,
    llm_calls_made: llmCallsMade,
    errors,
    duration_ms: Date.now() - startedAt,
  };
}
