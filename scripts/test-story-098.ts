// Manual test script for STORY-098 — High Amortisation Earnings Regime
// Run with: DATABASE_URL=... FMP_API_KEY=... npx tsx scripts/test-story-098.ts

import { syncForwardEstimates } from '../src/modules/data-ingestion/jobs/forward-estimates-sync.service';
import { persistValuationState } from '../src/modules/valuation/valuation-persistence.service';
import { prisma } from '../src/infrastructure/database/prisma';
import { FMPAdapter } from '../src/modules/data-ingestion/adapters/fmp.adapter';
import { TiingoAdapter } from '../src/modules/data-ingestion/adapters/tiingo.adapter';

const PHARMA = ['ABBV', 'JNJ', 'PFE', 'MRK', 'AZN', 'MSFT'];

async function run() {
  const fmp = new FMPAdapter(process.env.FMP_API_KEY!);
  const tiingo = new TiingoAdapter(process.env.TIINGO_API_KEY ?? '');

  console.log('\n═══ Step 1: Sync forward estimates (populates ebitdaNtm / forwardEvEbitda) ═══');
  for (const ticker of PHARMA) {
    if (!await prisma.stock.findUnique({ where: { ticker }, select: { ticker: true } })) {
      console.log(`  ${ticker}: not in universe — skipping`);
      continue;
    }
    const r = await syncForwardEstimates(fmp, tiingo, { tickerFilter: ticker });
    const s = await prisma.stock.findUnique({
      where: { ticker },
      select: { ebitdaNtm: true, ebitNtm: true, forwardEvEbitda: true },
    });
    const ratio = (s?.ebitdaNtm && s?.ebitNtm && Number(s.ebitNtm) > 0)
      ? (Number(s.ebitdaNtm) / Number(s.ebitNtm)).toFixed(2) + 'x'
      : 'N/A';
    console.log(`  ${ticker.padEnd(5)} sync_errors=${r.errors} | ebitda/ebit=${ratio} | fwdEvEbitda=${s?.forwardEvEbitda ? Number(s.forwardEvEbitda).toFixed(2) + 'x' : 'null'}`);
  }

  console.log('\n═══ Step 2: Recompute valuations ═══');
  for (const ticker of PHARMA) {
    if (!await prisma.stock.findUnique({ where: { ticker }, select: { ticker: true } })) continue;
    const r = await persistValuationState(ticker, { force: true });
    const vs = await prisma.valuationState.findFirst({
      where: { ticker },
      orderBy: { updatedAt: 'desc' },
      select: { valuationRegime: true, primaryMetric: true, currentMultiple: true, valuationZone: true },
    });
    console.log(`  ${ticker.padEnd(5)} status=${r.status} | regime=${(vs?.valuationRegime ?? '—').padEnd(30)} | metric=${(vs?.primaryMetric ?? '—').padEnd(18)} | multiple=${vs?.currentMultiple ? Number(vs.currentMultiple).toFixed(1) + 'x' : 'null'} | zone=${vs?.valuationZone ?? '—'}`);
  }

  console.log('\n═══ Step 3: Acceptance check ═══');
  // Expectations based on actual classification data in DB (verified 2026-04-28):
  // JNJ: structuralCyclicalityScore=1 → Step 3 (cyclical_earnings) fires before Step 4.5
  // MRK: suggestedCode='8' (bucket 8) → not_applicable immediately
  const expected: Record<string, { regime: string | null; metric: string }> = {
    ABBV: { regime: 'high_amortisation_earnings', metric: 'forward_ev_ebitda' },
    JNJ:  { regime: 'cyclical_earnings',          metric: 'forward_pe' },
    MRK:  { regime: null,                          metric: 'no_stable_metric' },   // bucket 8 → regime not stored
    AZN:  { regime: 'mature_pe',                  metric: 'forward_pe' },
    MSFT: { regime: 'mature_pe',                  metric: 'forward_pe' },
  };

  let pass = 0; let fail = 0;
  for (const [ticker, exp] of Object.entries(expected)) {
    const vs = await prisma.valuationState.findFirst({
      where: { ticker },
      orderBy: { updatedAt: 'desc' },
      select: { valuationRegime: true, primaryMetric: true },
    });
    if (!vs) { console.log(`  ${ticker}: SKIP (no valuation state)`); continue; }

    const regimeOk = vs.valuationRegime === exp.regime;
    const metricOk = vs.primaryMetric === exp.metric;
    const ok = regimeOk && metricOk;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? '✓' : '✗'} ${ticker.padEnd(5)} regime=${regimeOk ? 'OK' : `FAIL (got ${vs.valuationRegime}, want ${exp.regime})`} | metric=${metricOk ? 'OK' : `FAIL (got ${vs.primaryMetric}, want ${exp.metric})`}`);
  }
  console.log(`\n  Result: ${pass} passed, ${fail} failed`);

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
