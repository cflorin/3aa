// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-004: TsrHurdleCalculator — bucket + EQ/BS → adjusted TSR hurdle
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 4

import type { TsrHurdleRow } from './types';
import { parseBucket } from './metric-selector';

export interface TsrHurdleResult {
  baseTsrHurdleLabel: string | null;
  baseTsrHurdleDefault: number | null;
  adjustedTsrHurdle: number | null;
  hurdleSource: 'default' | 'manual_override';
  tsrReasonCodes: string[];
}

export function calculateTsrHurdle(
  activeCode: string,
  tsrHurdles: TsrHurdleRow[],
): TsrHurdleResult {
  const bucket = parseBucket(activeCode);

  // B8 has no hurdle
  if (bucket === 8) {
    const b8 = tsrHurdles.find(h => h.bucket === 8);
    return {
      baseTsrHurdleLabel: b8?.baseHurdleLabel ?? 'No normal hurdle',
      baseTsrHurdleDefault: null,
      adjustedTsrHurdle: null,
      hurdleSource: 'default',
      tsrReasonCodes: ['bucket_8_no_hurdle'],
    };
  }

  const hurdle = tsrHurdles.find(h => h.bucket === bucket);
  if (!hurdle || hurdle.baseHurdleDefault === null) {
    return {
      baseTsrHurdleLabel: null,
      baseTsrHurdleDefault: null,
      adjustedTsrHurdle: null,
      hurdleSource: 'default',
      tsrReasonCodes: ['missing_hurdle_data'],
    };
  }

  const eq = activeCode.charAt(1);  // A, B, or C
  const bs = activeCode.charAt(2);  // A, B, or C

  const eqAdj = eq === 'A' ? hurdle.earningsQualityAAdjustment
               : eq === 'C' ? hurdle.earningsQualityCAdjustment
               : hurdle.earningsQualityBAdjustment;

  const bsAdj = bs === 'A' ? hurdle.balanceSheetAAdjustment
               : bs === 'C' ? hurdle.balanceSheetCAdjustment
               : hurdle.balanceSheetBAdjustment;

  const adjusted = Math.round((hurdle.baseHurdleDefault + eqAdj + bsAdj) * 100) / 100;

  const reasonCodes: string[] = [`bucket_${bucket}_base`];
  if (eqAdj !== 0) reasonCodes.push(`eq_${eq}_${eqAdj > 0 ? '+' : ''}${eqAdj}`);
  if (bsAdj !== 0) reasonCodes.push(`bs_${bs}_${bsAdj > 0 ? '+' : ''}${bsAdj}`);

  return {
    baseTsrHurdleLabel: hurdle.baseHurdleLabel,
    baseTsrHurdleDefault: hurdle.baseHurdleDefault,
    adjustedTsrHurdle: adjusted,
    hurdleSource: 'default',
    tsrReasonCodes: reasonCodes,
  };
}
