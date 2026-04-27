// Ad-hoc validation script: re-sync forward estimates for 15 stocks and compare before/after
// Run with: node_modules/.bin/ts-node --project tsconfig.seed.json scripts/test-fwd-estimates-fix.ts
import { syncForwardEstimates } from '../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
import { TiingoAdapter } from '../src/modules/data-ingestion/adapters/tiingo.adapter';
import { FMPAdapter } from '../src/modules/data-ingestion/adapters/fmp.adapter';
import { prisma } from '../src/infrastructure/database/prisma';

const TICKERS = ['AAPL','AMGN','CAT','COST','CVX','DE','GE','IBM','LOW','MSFT','NKE','NVDA','V','WMT','XOM'];

const PRE_FIX: Record<string, number> = {
  AAPL: 11.94, AMGN: 2.90, CAT: 9.64, COST: 8.59, CVX: 22.26,
  DE: -7.64, GE: 5.76, IBM: 5.80, LOW: 8.11, MSFT: 15.48,
  NKE: 0.84, NVDA: 70.19, V: 11.73, WMT: 4.97, XOM: 17.15,
};

async function main() {
  const tiingo = new TiingoAdapter();
  const fmp = new FMPAdapter();

  console.log('Re-syncing forward estimates for', TICKERS.length, 'stocks...\n');

  for (const ticker of TICKERS) {
    process.stdout.write(`  Syncing ${ticker}... `);
    try {
      await syncForwardEstimates(fmp, tiingo, { tickerFilter: ticker });
      process.stdout.write('done\n');
    } catch (e: unknown) {
      process.stdout.write(`ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  console.log('\n--- Results ---');
  console.log('Ticker  Before    After     Delta     Flag');
  console.log('------  --------  --------  --------  ----');

  const rows = await prisma.stock.findMany({
    where: { ticker: { in: TICKERS } },
    select: { ticker: true, revenueGrowthFwd: true },
    orderBy: { ticker: 'asc' },
  });

  for (const row of rows) {
    const before = PRE_FIX[row.ticker] ?? null;
    const after = row.revenueGrowthFwd != null ? Number(row.revenueGrowthFwd) : null;
    const delta = before != null && after != null ? after - before : null;
    const flag = delta != null && Math.abs(delta) > 2 ? ' *** LARGE CHANGE' : '';
    console.log(
      row.ticker.padEnd(8),
      (before != null ? before.toFixed(2) + '%' : 'N/A').padEnd(10),
      (after != null ? after.toFixed(2) + '%' : 'N/A').padEnd(10),
      (delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(2) + 'pp' : 'N/A').padEnd(10),
      flag,
    );
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
