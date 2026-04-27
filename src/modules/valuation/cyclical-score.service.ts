// EPIC-008: Valuation Regime Decoupling
// STORY-091: CyclicalScoreService — computeAndPersist()
// TASK-091-004: Service class that loads data, runs pure functions, persists all 3 fields

import { prisma } from '@/infrastructure/database/prisma';
import {
  computeStructuralCyclicalityScore,
  applyLlmCyclicalityModifier,
  computeCyclePosition,
  computeCyclicalConfidence,
  type QuarterlyHistoryRow,
  type DerivedMetricsRow,
  type LlmScores,
} from '@/domain/valuation/cyclical-score';

export interface CyclicalScoreBatchResult {
  processed: number;
  errors: number;
  errorDetails: string[];
}

export class CyclicalScoreService {
  /**
   * Computes and persists structural_cyclicality_score, cycle_position, and cyclical_confidence
   * for all in-universe stocks (or an optional subset by tickers).
   *
   * Runs before runValuationBatch() in the cron pipeline (STORY-094).
   */
  async computeAndPersist(tickers?: string[]): Promise<CyclicalScoreBatchResult> {
    let processed = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    const stocks = await prisma.stock.findMany({
      where: {
        inUniverse: true,
        ...(tickers && tickers.length > 0 ? { ticker: { in: tickers } } : {}),
      },
      select: {
        ticker: true,
        pricingPowerScore: true,
        marginDurabilityScore: true,
        quarterlyHistory: {
          orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
          take: 16,
          select: {
            revenue: true,
            operatingMargin: true,
            grossMargin: true,
          },
        },
        derivedMetrics: {
          select: {
            operatingMarginTtm: true,
            revenueTtm: true,
            quartersAvailable: true,
          },
        },
      },
    });

    console.log(JSON.stringify({ event: 'cyclical_score_sync_start', total: stocks.length }));

    for (const stock of stocks) {
      try {
        const history: QuarterlyHistoryRow[] = stock.quarterlyHistory.map((q) => ({
          revenue: q.revenue !== null ? q.revenue.toNumber() : null,
          operatingMargin: q.operatingMargin !== null ? q.operatingMargin.toNumber() : null,
          grossMargin: q.grossMargin !== null ? q.grossMargin.toNumber() : null,
        }));

        const derivedMetrics: DerivedMetricsRow | null = stock.derivedMetrics
          ? {
              operatingMarginTtm:
                stock.derivedMetrics.operatingMarginTtm !== null
                  ? stock.derivedMetrics.operatingMarginTtm.toNumber()
                  : null,
              revenueTtm:
                stock.derivedMetrics.revenueTtm !== null
                  ? stock.derivedMetrics.revenueTtm.toNumber()
                  : null,
              quartersAvailable: stock.derivedMetrics.quartersAvailable,
            }
          : null;

        const llmScores: LlmScores = {
          marginDurabilityScore:
            stock.marginDurabilityScore !== null
              ? stock.marginDurabilityScore.toNumber()
              : null,
          pricingPowerScore:
            stock.pricingPowerScore !== null ? stock.pricingPowerScore.toNumber() : null,
        };

        const baseScore = computeStructuralCyclicalityScore(history);
        const scoreWithLlm = applyLlmCyclicalityModifier(baseScore, llmScores);
        const cyclePosition = computeCyclePosition(history, derivedMetrics);
        const quartersAvailable = derivedMetrics?.quartersAvailable ?? history.length;
        const cyclicalConfidence = computeCyclicalConfidence(
          quartersAvailable,
          scoreWithLlm,
          baseScore,
        );

        await prisma.stock.update({
          where: { ticker: stock.ticker },
          data: {
            structuralCyclicalityScore: scoreWithLlm,
            cyclePosition,
            cyclicalConfidence,
          },
        });

        processed++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        errorDetails.push(`${stock.ticker}: ${msg}`);
        console.error(
          JSON.stringify({ event: 'cyclical_score_error', ticker: stock.ticker, error: msg }),
        );
      }
    }

    console.log(
      JSON.stringify({ event: 'cyclical_score_sync_complete', processed, errors }),
    );

    return { processed, errors, errorDetails };
  }
}

export const cyclicalScoreService = new CyclicalScoreService();
