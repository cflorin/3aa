// EPIC-003: Data Ingestion & Universe Management
// Ad-hoc script: populate AAPL for validation (run with ts-node)
import { syncFundamentals } from '../src/modules/data-ingestion/jobs/fundamentals-sync.service';
import { syncForwardEstimates } from '../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
import { syncPrices } from '../src/modules/data-ingestion/jobs/price-sync.service';
import { syncMarketCapAndMultiples } from '../src/modules/data-ingestion/jobs/market-cap-sync.service';
import { TiingoAdapter } from '../src/modules/data-ingestion/adapters/tiingo.adapter';
import { FMPAdapter } from '../src/modules/data-ingestion/adapters/fmp.adapter';

async function main() {
  const tiingo = new TiingoAdapter();
  const fmp = new FMPAdapter();

  console.log('--- Running fundamentals sync ---');
  const fundResult = await syncFundamentals(tiingo, fmp);
  console.log(JSON.stringify(fundResult, null, 2));

  console.log('--- Running price sync ---');
  const priceResult = await syncPrices(tiingo, fmp);
  console.log(JSON.stringify(priceResult, null, 2));

  console.log('--- Running market cap + multiples sync ---');
  const mcapResult = await syncMarketCapAndMultiples(fmp);
  console.log(JSON.stringify(mcapResult, null, 2));

  console.log('--- Running forward estimates sync ---');
  const estResult = await syncForwardEstimates(fmp, tiingo);
  console.log(JSON.stringify(estResult, null, 2));
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
