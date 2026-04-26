// EPIC-003: Data Ingestion & Universe Management
// STORY-060: Quarterly History Sync Service
// STORY-085: Refactored to use QuarterlyAdapter (provider-agnostic); FMP replaces Tiingo
// RFC-008 §Ingestion Sync Architecture; ADR-016 §Primary Trigger
// ADR-015 §Schema; RFC-004 Amendment 2026-04-25

import { Prisma } from '@prisma/client';
import { prisma } from '@/infrastructure/database/prisma';
import type { NormalizedQuarterlyReport } from '../types';

export interface QuarterlyHistorySyncResult {
  stocks_processed: number;
  stocks_updated: number;
  quarters_upserted: number;
  stocks_skipped: number;
  errors: number;
  duration_ms: number;
}

export interface QuarterlyHistorySyncOpts {
  tickerFilter?: string;
  forceFullScan?: boolean;
}

/**
 * Provider-agnostic interface for adapters that supply quarterly financial statements.
 * Both TiingoAdapter and FMPAdapter implement this via duck typing.
 */
export interface QuarterlyAdapter {
  readonly providerName: 'tiingo' | 'fmp';
  fetchQuarterlyStatements(ticker: string): Promise<NormalizedQuarterlyReport[] | null>;
}

// NULL-safe margin derivation: returns null when denominator is null or zero
function safeRatio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

// Compute per-quarter derived margins from the normalized report
function computeMargins(report: NormalizedQuarterlyReport) {
  return {
    grossMargin:         safeRatio(report.grossProfit, report.revenue),
    operatingMargin:     safeRatio(report.operatingIncome, report.revenue),
    netMargin:           safeRatio(report.netIncome, report.revenue),
    cfoToNetIncomeRatio: safeRatio(report.cashFromOperations, report.netIncome),
    fcfMargin:           safeRatio(report.freeCashFlow, report.revenue),
    sbcAsPctRevenue:     safeRatio(report.shareBasedCompensation, report.revenue),
    dilutionYoy: null as number | null,
  };
}

// Map a NormalizedQuarterlyReport to stock_quarterly_history upsert payload
function toUpsertPayload(
  ticker: string,
  report: NormalizedQuarterlyReport,
  providerName: 'tiingo' | 'fmp',
) {
  return {
    ticker,
    fiscalYear:    report.fiscalYear,
    fiscalQuarter: report.fiscalQuarter,
    sourceProvider: providerName,
    sourceStatementType: 'quarterly_statements',
    reportedDate:  report.date ? new Date(report.date) : null,
    syncedAt:      new Date(),

    revenue:                     report.revenue,
    grossProfit:                 report.grossProfit,
    operatingIncome:             report.operatingIncome,
    netIncome:                   report.netIncome,
    capex:                       report.capex,
    cashFromOperations:          report.cashFromOperations,
    freeCashFlow:                report.freeCashFlow,
    shareBasedCompensation:      report.shareBasedCompensation,
    depreciationAndAmortization: report.depreciationAndAmortization,
    dilutedSharesOutstanding:    report.dilutedSharesOutstanding,

    ...computeMargins(report),
  };
}

export async function syncQuarterlyHistory(
  adapter: QuarterlyAdapter,
  opts?: QuarterlyHistorySyncOpts,
): Promise<QuarterlyHistorySyncResult> {
  const startMs = Date.now();
  const forceFullScan = opts?.forceFullScan ?? false;

  let stocks_processed = 0;
  let stocks_updated = 0;
  let quarters_upserted = 0;
  let stocks_skipped = 0;
  let errors = 0;

  const stockWhere: Prisma.StockWhereInput = { inUniverse: true };
  if (opts?.tickerFilter) {
    stockWhere.ticker = opts.tickerFilter;
  }

  const stocks = await prisma.stock.findMany({
    where: stockWhere,
    select: { ticker: true },
  });

  for (const { ticker } of stocks) {
    stocks_processed++;

    try {
      const quarters: NormalizedQuarterlyReport[] | null = await adapter.fetchQuarterlyStatements(ticker);

      if (!quarters || quarters.length === 0) {
        console.log(JSON.stringify({ event: 'quarterly_history_sync_skipped', ticker, reason: 'null_response' }));
        stocks_skipped++;
        continue;
      }

      // Change detection: compare most recent reported date against stored row for this provider
      if (!forceFullScan) {
        const mostRecent = quarters[0]; // newest-first
        const reportedDate = mostRecent.date ? new Date(mostRecent.date) : null;

        const storedRow = await prisma.stockQuarterlyHistory.findFirst({
          where: { ticker, sourceProvider: adapter.providerName },
          orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
          select: { reportedDate: true },
        });

        if (
          storedRow?.reportedDate &&
          reportedDate &&
          storedRow.reportedDate.getTime() === reportedDate.getTime()
        ) {
          console.log(JSON.stringify({ event: 'quarterly_history_sync_skipped', ticker, reason: 'no_new_quarter', reported_date: reportedDate.toISOString() }));
          stocks_skipped++;
          continue;
        }
      }

      // Upsert all returned quarters
      let upsertedCount = 0;
      for (const report of quarters) {
        const payload = toUpsertPayload(ticker, report, adapter.providerName);

        await prisma.stockQuarterlyHistory.upsert({
          where: {
            uq_sqh_ticker_period_provider: {
              ticker: payload.ticker,
              fiscalYear: payload.fiscalYear,
              fiscalQuarter: payload.fiscalQuarter,
              sourceProvider: payload.sourceProvider,
            },
          },
          update: payload,
          create: payload,
        });
        upsertedCount++;
      }

      console.log(JSON.stringify({ event: 'quarterly_history_sync_updated', ticker, quarters_upserted: upsertedCount }));
      stocks_updated++;
      quarters_upserted += upsertedCount;

    } catch (err) {
      console.error(JSON.stringify({ event: 'quarterly_history_sync_error', ticker, error: String(err) }));
      errors++;
    }
  }

  return {
    stocks_processed,
    stocks_updated,
    quarters_upserted,
    stocks_skipped,
    errors,
    duration_ms: Date.now() - startMs,
  };
}
