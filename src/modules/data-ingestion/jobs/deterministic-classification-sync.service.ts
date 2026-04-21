// EPIC-003: Data Ingestion & Universe Management
// STORY-033: Deterministic Classification Flags
// TASK-033-001: computeDeterministicFlags() pure function
// TASK-033-002: syncDeterministicClassificationFlags() job
//
// Authoritative writer for material_dilution_flag, insurer_flag, pre_operating_leverage_flag.
// All three derived from existing DB fields — no new API calls.
// RFC-001: flag rules and thresholds
// RFC-002: stocks table column mapping, data_provider_provenance per field

import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';

// Case-insensitive exact-match set — includes "Managed Care" for Cigna/UHC (RFC-001 §insurer_flag)
const INSURER_INDUSTRIES = new Set([
  'insurance - life',
  'insurance - property & casualty',
  'insurance - diversified',
  'insurance - specialty',
  'insurance - reinsurance',
  'managed care',
  'health insurance',
]);

export interface DeterministicFlagsInput {
  industry: string | null;
  shareCountGrowth3y: number | null;
  revenueTtm: number | null;
  earningsTtm: number | null;
}

export interface DeterministicFlagsResult {
  materialDilutionFlag: boolean | null;
  insurerFlag: boolean | null;
  preOperatingLeverageFlag: boolean | null;
}

export function computeDeterministicFlags(input: DeterministicFlagsInput): DeterministicFlagsResult {
  const materialDilutionFlag =
    input.shareCountGrowth3y === null ? null : input.shareCountGrowth3y > 0.05;

  const insurerFlag =
    input.industry === null ? null : INSURER_INDUSTRIES.has(input.industry.toLowerCase());

  let preOperatingLeverageFlag: boolean | null;
  if (input.revenueTtm === null) {
    preOperatingLeverageFlag = null;
  } else if (input.revenueTtm < 50_000_000) {
    preOperatingLeverageFlag = true;
  } else if (
    input.revenueTtm < 200_000_000 &&
    input.earningsTtm !== null &&
    input.earningsTtm < 0
  ) {
    preOperatingLeverageFlag = true;
  } else {
    preOperatingLeverageFlag = false;
  }

  return { materialDilutionFlag, insurerFlag, preOperatingLeverageFlag };
}

export interface DeterministicFlagsSyncResult {
  updated: number;
  skipped: number;
}

export async function syncDeterministicClassificationFlags(): Promise<DeterministicFlagsSyncResult> {
  let updated = 0;
  let skipped = 0;

  console.log(JSON.stringify({ event: 'deterministic_flags_sync_start' }));

  const stocks = await prisma.stock.findMany({
    where: { inUniverse: true },
    select: {
      ticker: true,
      industry: true,
      shareCountGrowth3y: true,
      revenueTtm: true,
      earningsTtm: true,
      dataProviderProvenance: true,
    },
  });

  for (const stock of stocks) {
    // Prisma Decimal → number (toNumber() preserves precision; Number() on Decimal object is NaN)
    const input: DeterministicFlagsInput = {
      industry: stock.industry,
      shareCountGrowth3y: stock.shareCountGrowth3y !== null ? stock.shareCountGrowth3y.toNumber() : null,
      revenueTtm: stock.revenueTtm !== null ? stock.revenueTtm.toNumber() : null,
      earningsTtm: stock.earningsTtm !== null ? stock.earningsTtm.toNumber() : null,
    };

    const flags = computeDeterministicFlags(input);

    const data: Prisma.StockUpdateInput = {};
    const provenanceUpdates: Record<string, unknown> = {};
    const synced_at = new Date().toISOString();
    const flagProvenance = { provider: 'deterministic_heuristic', method: 'rule_based', synced_at };

    if (flags.materialDilutionFlag !== null) {
      data.materialDilutionFlag = flags.materialDilutionFlag;
      provenanceUpdates['material_dilution_flag'] = flagProvenance;
    }
    if (flags.insurerFlag !== null) {
      data.insurerFlag = flags.insurerFlag;
      provenanceUpdates['insurer_flag'] = flagProvenance;
    }
    if (flags.preOperatingLeverageFlag !== null) {
      data.preOperatingLeverageFlag = flags.preOperatingLeverageFlag;
      provenanceUpdates['pre_operating_leverage_flag'] = flagProvenance;
    }

    if (Object.keys(data).length === 0) {
      skipped++;
      continue;
    }

    const currentProv = (stock.dataProviderProvenance ?? {}) as Record<string, unknown>;

    await prisma.stock.update({
      where: { ticker: stock.ticker },
      data: {
        ...data,
        dataProviderProvenance: { ...currentProv, ...provenanceUpdates } as Prisma.InputJsonValue,
      },
    });

    updated++;
  }

  console.log(JSON.stringify({ event: 'deterministic_flags_sync_complete', updated, skipped }));
  return { updated, skipped };
}
