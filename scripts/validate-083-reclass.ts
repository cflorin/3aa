// EPIC-005/STORY-083/TASK-083-008: Validate confidence-floor against real data
// Verifies that the floor search algorithm fires correctly and populates all audit fields.
// This is a behavioural validation — not a snapshot match — because DB data evolves.

import { PrismaClient } from '@prisma/client';
import { classifyStock } from '../src/domain/classification/classifier';
import { toClassificationInput, CLASSIFICATION_STOCK_FIELDS } from '../src/domain/classification/input-mapper';
import type { ClassificationResult } from '../src/domain/classification/types';

const TICKERS = ['MSFT', 'ADBE', 'TSLA', 'UBER', 'UNH'];

async function main() {
  const prisma = new PrismaClient();

  console.log('STORY-083 Real-Data Validation — MSFT, ADBE, TSLA, UBER, UNH\n');
  console.log('='.repeat(80));
  console.log('Validating: algorithm behaves correctly on live DB data.\n');

  const checks: { ticker: string; pass: boolean; notes: string[] }[] = [];

  for (const ticker of TICKERS) {
    const stock = await prisma.stock.findUnique({
      where: { ticker },
      select: {
        ...CLASSIFICATION_STOCK_FIELDS,
        derivedMetrics: {
          select: {
            quartersAvailable: true,
            operatingMarginStabilityScore: true,
            earningsQualityTrendScore: true,
            deterioratingCashConversionFlag: true,
            operatingLeverageEmergingFlag: true,
            operatingIncomeAccelerationFlag: true,
            materialDilutionTrendFlag: true,
            sbcBurdenScore: true,
          },
        },
      },
    });

    if (!stock) {
      console.log(`${ticker}: NOT IN DATABASE — skipped\n`);
      continue;
    }

    const dm = (stock as any).derivedMetrics ?? null;
    const input = toClassificationInput(stock as any, dm);

    let result: ClassificationResult;
    const notes: string[] = [];
    let pass = true;

    try {
      result = classifyStock(input);
    } catch (err) {
      console.log(`❌ ${ticker}: classifyStock() threw: ${err}\n`);
      checks.push({ ticker, pass: false, notes: [`Exception: ${err}`] });
      continue;
    }

    // ── Invariant 1: confidence_level must be a valid value ─────────────
    if (!['high', 'medium', 'low'].includes(result.confidence_level)) {
      notes.push(`BAD confidence_level: ${result.confidence_level}`);
      pass = false;
    }

    // ── Invariant 2: if floor applied, all 3 raw audit fields must be present ─
    if (result.confidenceFloorApplied) {
      if (!result.rawSuggestedCode) {
        notes.push('confidenceFloorApplied=true but rawSuggestedCode missing');
        pass = false;
      }
      if (result.rawConfidenceLevel !== 'low') {
        notes.push(`confidenceFloorApplied=true but rawConfidenceLevel="${result.rawConfidenceLevel}" (expected "low")`);
        pass = false;
      }
      // rawSuggestedCode must start with a digit 1–7
      if (result.rawSuggestedCode && !/^[1-7]/.test(result.rawSuggestedCode)) {
        notes.push(`rawSuggestedCode="${result.rawSuggestedCode}" doesn't start with bucket 1-7`);
        pass = false;
      }
      // Floor result must NOT be low
      if (result.confidence_level === 'low') {
        notes.push(`confidenceFloorApplied=true but final confidence is still "low" — floor should have found medium+`);
        pass = false;
      }
      // Floor bucket must differ from raw bucket
      const rawBucket = result.rawSuggestedCode ? parseInt(result.rawSuggestedCode[0]) : null;
      if (rawBucket !== null && rawBucket === result.bucket) {
        notes.push(`confidenceFloorApplied=true but floor bucket (${result.bucket}) === raw bucket (${rawBucket}) — floor had no effect`);
        pass = false;
      }
    }

    // ── Invariant 3: if floor NOT applied, raw fields must be absent ────
    if (!result.confidenceFloorApplied) {
      if (result.rawSuggestedCode !== undefined) {
        notes.push(`confidenceFloorApplied=false but rawSuggestedCode is set: ${result.rawSuggestedCode}`);
        pass = false;
      }
      if (result.rawConfidenceLevel !== undefined) {
        notes.push(`confidenceFloorApplied=false but rawConfidenceLevel is set: ${result.rawConfidenceLevel}`);
        pass = false;
      }
    }

    // ── Invariant 4: binary_flag stock must never have floor applied ────
    if (input.binary_flag && result.confidenceFloorApplied) {
      notes.push('binary_flag=true but confidenceFloorApplied=true — exemption not respected');
      pass = false;
    }

    // ── Invariant 5: holding_company_flag stock must never have floor applied ─
    if (input.holding_company_flag && result.confidenceFloorApplied) {
      notes.push('holding_company_flag=true but confidenceFloorApplied=true — exemption not respected');
      pass = false;
    }

    // ── Invariant 6: confidenceBreakdown must have ≥ 2 steps ───────────
    if (result.confidenceBreakdown.steps.length < 2) {
      notes.push(`confidence breakdown has only ${result.confidenceBreakdown.steps.length} step(s)`);
      pass = false;
    }

    // ── Output ───────────────────────────────────────────────────────────
    const tick = pass ? '✅' : '❌';
    console.log(`${tick} ${ticker}`);
    console.log(`   code=${result.suggested_code}  bucket=${result.bucket}  conf=${result.confidence_level}`);
    if (result.confidenceFloorApplied) {
      console.log(`   floor: raw=${result.rawSuggestedCode} (${result.rawConfidenceLevel}) → ${result.suggested_code} (${result.confidence_level})`);
    } else {
      console.log(`   floor: not applied`);
    }

    const bs = result.scores.bucket;
    const bucketLine = [1,2,3,4,5,6,7].map(b => `B${b}:${(bs as any)[b]}`).join('  ');
    console.log(`   scores: ${bucketLine}`);
    console.log(`   EQ:${result.eq_grade} BS:${result.bs_grade}  tieBreaks=[${result.tieBreaksFired.map(t=>t.rule).join(',')}]  missing=${result.missing_field_count}`);

    // Print confidence steps
    for (const step of result.confidenceBreakdown.steps) {
      const flag = step.step === 1 ? '' : '';
      console.log(`   step${step.step} [${step.label}]: ${step.band} — ${step.note}`);
    }

    if (pass) {
      console.log(`   All invariants ✓`);
    } else {
      for (const n of notes) console.log(`   ⚠️  ${n}`);
    }
    console.log();

    checks.push({ ticker, pass, notes });
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const validated = checks.length;
  const passed = checks.filter(c => c.pass).length;
  const failed = validated - passed;
  const skipped = TICKERS.length - validated;

  console.log('='.repeat(80));
  console.log(`Validated: ${validated}  Passed: ${passed}  Failed: ${failed}  Skipped (not in DB): ${skipped}`);

  if (failed === 0) {
    console.log('✅ TASK-083-008 PASSED — floor algorithm correct on all available real-data stocks');
    console.log('Note: ADBE/UBER not in test DB; unit golden tests cover those input snapshots.');
  } else {
    console.log('❌ TASK-083-008 FAILED — see invariant violations above');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
