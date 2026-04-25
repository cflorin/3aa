// EPIC-003: Data Ingestion & Universe Management
// STORY-060: Quarterly History Sync Service
// RFC-008 §Ingestion Sync Architecture; ADR-016 §Primary Trigger
// ADR-015 §Schema; RFC-004 Amendment 2026-04-25

import { Prisma } from '@prisma/client';
import { prisma } from '@/infrastructure/database/prisma';
import type { TiingoAdapter, QuarterlyReport } from '../adapters/tiingo.adapter';

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

// NULL-safe margin derivation: returns null when denominator is null or zero
function safeRatio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

// Extract a DataCode value from a statement section; returns null if absent (ADR-015: NULL ≠ zero)
function getDataCode(entries: { dataCode: string; value: number }[], code: string): number | null {
  const entry = entries.find(e => e.dataCode === code);
  return entry != null ? entry.value : null;
}

// Compute per-quarter derived margins inline; all nullable (STORY-060 §Scope In)
function computeMargins(report: QuarterlyReport) {
  const income = report.statementData.incomeStatement;
  const cashFlow = report.statementData.cashFlow ?? [];

  const revenue    = getDataCode(income, 'revenue');
  const grossProfit = getDataCode(income, 'grossProfit');
  const ebit       = getDataCode(income, 'ebit');
  const netInc     = getDataCode(income, 'netinc');
  const cfo        = getDataCode(cashFlow, 'operatingCashFlow');
  const fcf        = getDataCode(cashFlow, 'freeCashFlow');
  const sbc        = getDataCode(cashFlow, 'stockBasedCompensation');

  return {
    grossMargin:         safeRatio(grossProfit, revenue),
    operatingMargin:     safeRatio(ebit, revenue),
    netMargin:           safeRatio(netInc, revenue),
    cfoToNetIncomeRatio: safeRatio(cfo, netInc),
    fcfMargin:           safeRatio(fcf, revenue),
    sbcAsPctRevenue:     safeRatio(sbc, revenue),
    // dilutionYoy computed across quarters — requires comparison; not available inline
    dilutionYoy: null as number | null,
  };
}

// Map a QuarterlyReport to stock_quarterly_history upsert payload
function toUpsertPayload(ticker: string, report: QuarterlyReport) {
  const income   = report.statementData.incomeStatement;
  const balance  = report.statementData.balanceSheet;
  const cashFlow = report.statementData.cashFlow ?? [];
  const overview = report.statementData.overview ?? [];

  const margins = computeMargins(report);

  // Diluted shares: try cashFlow first, then overview, then balance sheet
  const dilutedShares =
    getDataCode(cashFlow, 'basicSharesOutstanding') ??
    getDataCode(overview, 'sharesBasic') ??
    getDataCode(balance, 'sharesBasic') ??
    null;

  return {
    ticker,
    fiscalYear:   report.year,
    fiscalQuarter: report.quarter,
    sourceProvider: 'tiingo' as const,
    sourceStatementType: 'quarterly_statements',
    reportedDate:  report.date ? new Date(report.date) : null,
    syncedAt:      new Date(),

    // Raw financial fields (all nullable — NULL = DataCode absent)
    revenue:                     getDataCode(income, 'revenue'),
    grossProfit:                 getDataCode(income, 'grossProfit'),
    operatingIncome:             getDataCode(income, 'ebit'),
    netIncome:                   getDataCode(income, 'netinc'),
    capex:                       getDataCode(cashFlow, 'capitalExpenditure'),
    cashFromOperations:          getDataCode(cashFlow, 'operatingCashFlow'),
    freeCashFlow:                getDataCode(cashFlow, 'freeCashFlow'),
    shareBasedCompensation:      getDataCode(cashFlow, 'stockBasedCompensation'),
    depreciationAndAmortization: getDataCode(income, 'depamor'),
    dilutedSharesOutstanding:    dilutedShares,

    // Per-quarter derived margins
    ...margins,
  };
}

export async function syncQuarterlyHistory(
  tiingo: TiingoAdapter,
  opts?: QuarterlyHistorySyncOpts,
): Promise<QuarterlyHistorySyncResult> {
  const startMs = Date.now();
  const forceFullScan = opts?.forceFullScan ?? false;

  let stocks_processed = 0;
  let stocks_updated = 0;
  let quarters_upserted = 0;
  let stocks_skipped = 0;
  let errors = 0;

  // Fetch in-universe tickers (optionally filtered)
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
      const quarters: QuarterlyReport[] | null = await tiingo.fetchQuarterlyStatements(ticker);

      if (!quarters || quarters.length === 0) {
        console.log(JSON.stringify({ event: 'quarterly_history_sync_skipped', ticker, reason: 'null_response' }));
        stocks_skipped++;
        continue;
      }

      // Change detection: compare most recent Tiingo reported_date against stored row (ADR-016)
      if (!forceFullScan) {
        const mostRecentTiingo = quarters[0]; // newest-first
        const tiingoReportedDate = mostRecentTiingo.date ? new Date(mostRecentTiingo.date) : null;

        const storedRow = await prisma.stockQuarterlyHistory.findFirst({
          where: { ticker, sourceProvider: 'tiingo' },
          orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
          select: { reportedDate: true },
        });

        if (
          storedRow?.reportedDate &&
          tiingoReportedDate &&
          storedRow.reportedDate.getTime() === tiingoReportedDate.getTime()
        ) {
          console.log(JSON.stringify({ event: 'quarterly_history_sync_skipped', ticker, reason: 'no_new_quarter', reported_date: tiingoReportedDate.toISOString() }));
          stocks_skipped++;
          continue;
        }
      }

      // Upsert all returned quarters
      let upsertedCount = 0;
      for (const report of quarters) {
        if (report.quarter === 0) continue; // safety: skip annual rows

        const payload = toUpsertPayload(ticker, report);

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
