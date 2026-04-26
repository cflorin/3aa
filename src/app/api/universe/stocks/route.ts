// EPIC-004: Classification Engine & Universe Screen
// STORY-056: Add Stock to Universe
// TASK-056-002: POST /api/universe/stocks — run full 8-stage pipeline with SSE progress streaming
//
// Architecture: synchronous pipeline with SSE progress events. Each stage emits a
// data event before executing. On completion emits {stage:"done", result: UniverseStockSummary}.
// On failure emits {stage:"error", failedStage, message} and closes stream.
//
// Re-add path: if stock row exists with inUniverse=false, set inUniverse=true; skip create.
// RFC-003 §Monitor List Management; PRD §Universe Management; RFC-001 §Data Ingestion Pipeline

import { NextRequest } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { prisma } from '@/infrastructure/database/prisma';
import { getUniverseStock } from '@/domain/monitoring';
import { syncFundamentals } from '@/modules/data-ingestion/jobs/fundamentals-sync.service';
import { syncForwardEstimates } from '@/modules/data-ingestion/jobs/forward-estimates-sync.service';
import { syncMarketCapAndMultiples } from '@/modules/data-ingestion/jobs/market-cap-sync.service';
import { syncShareCount } from '@/modules/data-ingestion/jobs/share-count-sync.service';
import { syncQuarterlyHistory } from '@/modules/data-ingestion/jobs/quarterly-history-sync.service';
import { computeDerivedMetricsBatch } from '@/modules/data-ingestion/jobs/derived-metrics-computation.service';
import { computeTrendMetricsBatch } from '@/modules/data-ingestion/jobs/trend-metrics-computation.service';
import { syncDeterministicClassificationFlags } from '@/modules/data-ingestion/jobs/deterministic-classification-sync.service';
import { syncClassificationEnrichment } from '@/modules/classification-enrichment/jobs/classification-enrichment-sync.service';
import { runClassificationBatch } from '@/modules/classification-batch/classification-batch.service';
import { runValuationBatch } from '@/modules/valuation/valuation-batch.service';
import { TiingoAdapter } from '@/modules/data-ingestion/adapters/tiingo.adapter';
import { FMPAdapter } from '@/modules/data-ingestion/adapters/fmp.adapter';
import { ClaudeProvider } from '@/modules/classification-enrichment/providers/claude.provider';

const TICKER_RE = /^[A-Z0-9.]{1,10}$/i;
const TOTAL_STAGES = 11;

function sseData(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest) {
  // Auth check before starting stream
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await validateSession(sessionId);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse + validate body before starting stream
  let ticker: string;
  try {
    const body = await req.json();
    ticker = (body?.ticker ?? '').trim().toUpperCase();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_ticker' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!ticker || !TICKER_RE.test(ticker)) {
    return new Response(JSON.stringify({ error: 'invalid_ticker' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check for existing in-universe stock before starting stream
  const existing = await prisma.stock.findUnique({
    where: { ticker },
    select: { ticker: true, inUniverse: true },
  });

  if (existing?.inUniverse === true) {
    return new Response(JSON.stringify({ error: 'already_in_universe', ticker }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Instantiate adapters once (reused across pipeline stages)
  const tiingo = new TiingoAdapter();
  const fmp = new FMPAdapter();
  const llm = ClaudeProvider.fromEnv();

  const stream = new ReadableStream({
    async start(controller) {
      let currentStage = 'validate';

      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(sseData(obj));
      };

      try {
        // Stage 1: validate — look up ticker with FMP to confirm it exists
        emit({ stage: 'validate', label: 'Validating ticker…', step: 1, total: TOTAL_STAGES });
        const metadata = await fmp.fetchMetadata(ticker);
        if (!metadata) {
          emit({ stage: 'error', failedStage: 'validate', message: `Ticker ${ticker} not found. Check the symbol and try again.` });
          return;
        }

        // Stage 2: create_record (or re-activate)
        currentStage = 'create_record';
        emit({ stage: 'create_record', label: 'Creating stock record…', step: 2, total: TOTAL_STAGES });

        if (existing) {
          // Re-add: stock exists with inUniverse=false — update name/country from fresh metadata
          await prisma.stock.update({
            where: { ticker },
            data: {
              inUniverse: true,
              universeStatusChangedAt: new Date(),
              companyName: metadata.company_name,
              ...(metadata.sector      ? { sector: metadata.sector }           : {}),
              ...(metadata.industry    ? { industry: metadata.industry }       : {}),
              ...(metadata.description ? { description: metadata.description } : {}),
            },
          });
        } else {
          await prisma.stock.create({
            data: {
              ticker,
              companyName: metadata.company_name,
              country: 'US',
              inUniverse: true,
              universeStatusChangedAt: new Date(),
              ...(metadata.sector      ? { sector: metadata.sector }           : {}),
              ...(metadata.industry    ? { industry: metadata.industry }       : {}),
              ...(metadata.description ? { description: metadata.description } : {}),
            },
          });
        }

        // Stage 3: fundamentals
        currentStage = 'fundamentals';
        emit({ stage: 'fundamentals', label: 'Fetching fundamentals…', step: 3, total: TOTAL_STAGES });
        await syncFundamentals(tiingo, fmp, { tickerFilter: ticker });

        // Stage 4: metrics (market cap, EV, trailing multiples) — must precede estimates
        // forward ratio computation (stage 5) requires currentPrice and marketCap from DB
        currentStage = 'metrics';
        emit({ stage: 'metrics', label: 'Computing metrics…', step: 4, total: TOTAL_STAGES });
        await syncMarketCapAndMultiples(fmp, { tickerFilter: ticker });

        // Stage 5: estimates — runs after metrics so currentPrice/marketCap are available
        currentStage = 'estimates';
        emit({ stage: 'estimates', label: 'Fetching forward estimates…', step: 5, total: TOTAL_STAGES });
        await syncForwardEstimates(fmp, tiingo, { tickerFilter: ticker });

        // Stage 6: share count growth
        currentStage = 'share_count';
        emit({ stage: 'share_count', label: 'Fetching share count history…', step: 6, total: TOTAL_STAGES });
        await syncShareCount(fmp, { tickerFilter: ticker });

        // Stage 7: quarterly history + derived metrics (all quarterly data loaded on add)
        currentStage = 'quarterly_history';
        emit({ stage: 'quarterly_history', label: 'Fetching quarterly history…', step: 7, total: TOTAL_STAGES });
        await syncQuarterlyHistory(fmp, { tickerFilter: ticker, forceFullScan: true });
        await computeDerivedMetricsBatch([ticker]);
        await computeTrendMetricsBatch([ticker]);

        // Stage 8: flags
        currentStage = 'flags';
        emit({ stage: 'flags', label: 'Computing classification flags…', step: 8, total: TOTAL_STAGES });
        await syncDeterministicClassificationFlags({ tickerFilter: ticker });

        // Stage 9: enrichment (LLM — longest stage)
        currentStage = 'enrichment';
        emit({ stage: 'enrichment', label: 'Running LLM enrichment…', step: 9, total: TOTAL_STAGES });
        await syncClassificationEnrichment(llm, { mode: 'full', tickerFilter: ticker });

        // Stage 10: classification
        currentStage = 'classification';
        emit({ stage: 'classification', label: 'Classifying…', step: 10, total: TOTAL_STAGES });
        await runClassificationBatch({ tickerFilter: ticker });

        // Stage 11: valuation
        emit({ stage: 'valuation', label: 'Computing valuation…', step: 11, total: TOTAL_STAGES });
        await runValuationBatch({ tickerFilter: ticker });

        // Done — fetch final stock state to return to client
        const result = await getUniverseStock(user.userId, ticker);
        emit({ stage: 'done', result });

      } catch (err) {
        emit({
          stage: 'error',
          failedStage: currentStage,
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
