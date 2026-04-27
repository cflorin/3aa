// EPIC-003: Data Ingestion & Universe Management
// STORY-033: Deterministic Classification Flags
// TASK-033-001: computeDeterministicFlags() pure function
// TASK-033-002: syncDeterministicClassificationFlags() job
// EPIC-008/STORY-090/TASK-090-003: bank_flag added to computeDeterministicFlags and sync job
//
// Authoritative writer for material_dilution_flag, insurer_flag, pre_operating_leverage_flag, bank_flag.
// [BUG-CE-003] pre_operating_leverage_flag rule was too restrictive (only fired for revenue < $200M).
// Fixed to also flag profitable large-cap companies with operating_margin < 15%. See docs/bugs/CLASSIFICATION-ENGINE-BUG-REGISTRY.md.
// All four flags derived from existing DB fields — no new API calls.
// RFC-001: flag rules and thresholds
// RFC-002: stocks table column mapping, data_provider_provenance per field

import { prisma } from '@/infrastructure/database/prisma';
import type { Prisma } from '@prisma/client';
import { deriveBankFlag } from '@/domain/classification/flags/bank-flag';

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

// Industries with structurally thin margins that are NOT operating leverage stories
// (used to gate the large-cap operating margin rule for pre_operating_leverage_flag)
const STRUCTURAL_THIN_MARGIN_INDUSTRIES = new Set([
  'medical - healthcare plans',
  'managed care',
  'health insurance',
  'insurance - life',
  'insurance - property & casualty',
  'insurance - diversified',
  'insurance - specialty',
  'insurance - reinsurance',
  'grocery stores',
  'food distribution',
]);

export interface DeterministicFlagsInput {
  sector?: string | null;   // EPIC-008/STORY-090: added for bank_flag derivation
  industry: string | null;
  shareCountGrowth3y: number | null;
  revenueTtm: number | null;
  earningsTtm: number | null;
  operatingMargin?: number | null;
}

export interface DeterministicFlagsResult {
  materialDilutionFlag: boolean | null;
  insurerFlag: boolean | null;
  preOperatingLeverageFlag: boolean | null;
  bankFlag: boolean;   // EPIC-008/STORY-090: always deterministic (never null)
}

export function computeDeterministicFlags(input: DeterministicFlagsInput): DeterministicFlagsResult {
  const materialDilutionFlag =
    input.shareCountGrowth3y === null ? null : input.shareCountGrowth3y > 0.05;

  const insurerFlag =
    input.industry === null ? null : INSURER_INDUSTRIES.has(input.industry.toLowerCase());

  let preOperatingLeverageFlag: boolean | null;
  const industryLower = (input.industry ?? '').toLowerCase();
  if (input.revenueTtm === null) {
    preOperatingLeverageFlag = null;
  } else if (input.revenueTtm < 50_000_000) {
    // Early-stage: very small revenue → pre-operating leverage by definition
    preOperatingLeverageFlag = true;
  } else if (
    input.revenueTtm < 200_000_000 &&
    input.earningsTtm !== null &&
    input.earningsTtm < 0
  ) {
    // Small loss-making company on the path to profitability
    preOperatingLeverageFlag = true;
  } else if (
    // [BUG-CE-003] Large profitable company with operating margin < 15%:
    // thesis depends on margin expansion. Exclude industries where thin margins are structural
    // (insurance, managed care, grocery) rather than a temporary operating leverage opportunity.
    (input.operatingMargin ?? null) !== null &&
    input.operatingMargin! > 0 &&
    input.operatingMargin! < 0.15 &&
    input.revenueTtm > 1_000_000_000 &&
    input.earningsTtm !== null &&
    input.earningsTtm > 0 &&
    !STRUCTURAL_THIN_MARGIN_INDUSTRIES.has(industryLower)
  ) {
    preOperatingLeverageFlag = true;
  } else {
    preOperatingLeverageFlag = false;
  }

  // EPIC-008/STORY-090: bank_flag — always deterministic, never null
  const bankFlag = deriveBankFlag({ sector: input.sector, industry: input.industry });

  return { materialDilutionFlag, insurerFlag, preOperatingLeverageFlag, bankFlag };
}

export interface DeterministicFlagsSyncResult {
  updated: number;
  skipped: number;
}

export async function syncDeterministicClassificationFlags(
  opts: { tickerFilter?: string } = {},
): Promise<DeterministicFlagsSyncResult> {
  let updated = 0;
  let skipped = 0;

  console.log(JSON.stringify({ event: 'deterministic_flags_sync_start' }));

  const stocks = await prisma.stock.findMany({
    where: { inUniverse: true, ...(opts.tickerFilter ? { ticker: opts.tickerFilter } : {}) },
    select: {
      ticker: true,
      sector: true,     // EPIC-008/STORY-090: needed for bank_flag derivation
      industry: true,
      shareCountGrowth3y: true,
      revenueTtm: true,
      earningsTtm: true,
      operatingMargin: true,
      dataProviderProvenance: true,
    },
  });

  for (const stock of stocks) {
    // Prisma Decimal → number (toNumber() preserves precision; Number() on Decimal object is NaN)
    const input: DeterministicFlagsInput = {
      sector: stock.sector,
      industry: stock.industry,
      shareCountGrowth3y: stock.shareCountGrowth3y !== null ? stock.shareCountGrowth3y.toNumber() : null,
      revenueTtm: stock.revenueTtm !== null ? stock.revenueTtm.toNumber() : null,
      earningsTtm: stock.earningsTtm !== null ? stock.earningsTtm.toNumber() : null,
      operatingMargin: stock.operatingMargin !== null ? stock.operatingMargin.toNumber() : null,
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
    // EPIC-008/STORY-090: bank_flag always deterministic — always written
    data.bankFlag = flags.bankFlag;
    provenanceUpdates['bank_flag'] = flagProvenance;

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
