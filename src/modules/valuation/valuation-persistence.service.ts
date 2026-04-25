// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-076: Valuation State Persistence & History
// TASK-076-001–004: loadValuationInput, persistValuationState, getPersonalizedValuation, read models

import { prisma } from '@/infrastructure/database/prisma';
import {
  computeValuation,
  shouldRecompute,
  type ValuationInput,
  type ValuationResult,
  type AnchoredThresholdRow,
  type TsrHurdleRow,
  type PriorValuationState,
} from '@/domain/valuation';
import type { ValuationState, Prisma } from '@prisma/client';

// ── Public result types ────────────────────────────────────────────────────────

export type PersistStatus = 'updated' | 'skipped' | 'error';

export interface PersistResult {
  ticker: string;
  status: PersistStatus;
  zone?: string;
  reason?: string;
}

export interface PersonalizedValuationResult {
  systemState: ValuationState | null;
  userResult: ValuationResult | null;
  hasUserOverride: boolean;
  userClassificationOverrideCode: string | null;
}

// ── TASK-076-001: loadValuationInput ──────────────────────────────────────────

export async function loadValuationInput(
  ticker: string,
  activeCode: string,
): Promise<ValuationInput | null> {
  const [stock, anchors, hurdles] = await Promise.all([
    prisma.stock.findUnique({
      where: { ticker },
      select: {
        ticker: true,
        forwardPe: true,
        forwardEvEbit: true,
        evSales: true,
        trailingPe: true,
        trailingEvEbit: true,
        grossMargin: true,
        shareCountGrowth3y: true,
        epsGrowthFwd: true,
        materialDilutionFlag: true,
        holdingCompanyFlag: true,
        insurerFlag: true,
        cyclicalityFlag: true,
        preOperatingLeverageFlag: true,
        forwardOperatingEarningsExExcessCash: true,
      },
    }),
    prisma.anchoredThreshold.findMany(),
    prisma.tsrHurdle.findMany(),
  ]);

  if (!stock) return null;

  const anchoredRows: AnchoredThresholdRow[] = anchors.map(a => ({
    code: a.code,
    bucket: a.bucket,
    earningsQuality: a.earningsQuality,
    balanceSheetQuality: a.balanceSheetQuality,
    primaryMetric: a.primaryMetric,
    maxThreshold: Number(a.maxThreshold),
    comfortableThreshold: Number(a.comfortableThreshold),
    veryGoodThreshold: Number(a.veryGoodThreshold),
    stealThreshold: Number(a.stealThreshold),
  }));

  const tsrHurdleRows: TsrHurdleRow[] = hurdles.map(h => ({
    bucket: h.bucket,
    baseHurdleLabel: h.baseHurdleLabel,
    baseHurdleDefault: h.baseHurdleDefault !== null ? Number(h.baseHurdleDefault) : null,
    earningsQualityAAdjustment: Number(h.earningsQualityAAdjustment),
    earningsQualityBAdjustment: Number(h.earningsQualityBAdjustment),
    earningsQualityCAdjustment: Number(h.earningsQualityCAdjustment),
    balanceSheetAAdjustment: Number(h.balanceSheetAAdjustment),
    balanceSheetBAdjustment: Number(h.balanceSheetBAdjustment),
    balanceSheetCAdjustment: Number(h.balanceSheetCAdjustment),
  }));

  return {
    activeCode,
    forwardPe: stock.forwardPe !== null ? Number(stock.forwardPe) : null,
    forwardEvEbit: stock.forwardEvEbit !== null ? Number(stock.forwardEvEbit) : null,
    evSales: stock.evSales !== null ? Number(stock.evSales) : null,
    trailingPe: stock.trailingPe !== null ? Number(stock.trailingPe) : null,
    trailingEvEbit: stock.trailingEvEbit !== null ? Number(stock.trailingEvEbit) : null,
    // grossMargin stored as fraction (0.45 = 45%) — same convention as operatingMargin
    grossMargin: stock.grossMargin !== null ? Number(stock.grossMargin) : null,
    // shareCountGrowth3y stored as percentage (5.0 = 5%) — divide by 100 for domain
    shareCountGrowth3y: stock.shareCountGrowth3y !== null ? Number(stock.shareCountGrowth3y) / 100 : null,
    materialDilutionFlag: stock.materialDilutionFlag ?? false,
    holdingCompanyFlag: stock.holdingCompanyFlag ?? false,
    insurerFlag: stock.insurerFlag ?? false,
    cyclicalityFlag: stock.cyclicalityFlag ?? false,
    preOperatingLeverageFlag: stock.preOperatingLeverageFlag ?? false,
    forwardOperatingEarningsExExcessCash:
      stock.forwardOperatingEarningsExExcessCash !== null
        ? Number(stock.forwardOperatingEarningsExExcessCash)
        : null,
    anchoredThresholds: anchoredRows,
    tsrHurdles: tsrHurdleRows,
  };
}

// ── TASK-076-002: persistValuationState ───────────────────────────────────────

export async function persistValuationState(
  ticker: string,
  opts?: { force?: boolean },
): Promise<PersistResult> {
  const start = Date.now();

  try {
    // Resolve active code from system classification (suggested_code only)
    const classification = await prisma.classificationState.findUnique({
      where: { ticker },
      select: { suggestedCode: true },
    });

    if (!classification?.suggestedCode) {
      return { ticker, status: 'error', reason: 'classification_required' };
    }

    const activeCode = classification.suggestedCode;
    const input = await loadValuationInput(ticker, activeCode);
    if (!input) {
      return { ticker, status: 'error', reason: 'stock_not_found' };
    }

    // shouldRecompute guard — skip if prior state exists and nothing changed
    const priorState = await prisma.valuationState.findUnique({ where: { ticker } });

    if (!opts?.force && priorState) {
      const priorForRecompute: PriorValuationState = {
        activeCode: priorState.activeCode,
        primaryMetric: priorState.primaryMetric,
        currentMultiple: priorState.currentMultiple !== null ? Number(priorState.currentMultiple) : null,
        adjustedTsrHurdle: priorState.adjustedTsrHurdle !== null ? Number(priorState.adjustedTsrHurdle) : null,
      };

      if (!shouldRecompute(input, priorForRecompute)) {
        return { ticker, status: 'skipped', zone: priorState.valuationZone };
      }
    }

    // Compute
    const result = computeValuation(input);

    // Status statuses that cannot be persisted as meaningful state
    if (result.valuationStateStatus === 'classification_required') {
      return { ticker, status: 'error', reason: 'classification_required' };
    }

    // Determine change reason for history
    const changeReason = !priorState
      ? 'first_compute'
      : priorState.activeCode !== result.activeCode
      ? 'code_changed'
      : priorState.primaryMetric !== result.primaryMetric
      ? 'metric_changed'
      : 'recompute';

    const shouldWriteHistory =
      !priorState ||
      priorState.valuationZone !== result.valuationZone ||
      (priorState.adjustedTsrHurdle !== null &&
        result.adjustedTsrHurdle !== null &&
        Number(priorState.adjustedTsrHurdle) !== result.adjustedTsrHurdle);

    const data: Prisma.ValuationStateUncheckedCreateInput = {
      ticker,
      activeCode: result.activeCode,
      primaryMetric: result.primaryMetric,
      metricReason: result.metricReason,
      currentMultiple: result.currentMultiple,
      currentMultipleBasis: result.currentMultipleBasis,
      maxThreshold: result.maxThreshold,
      comfortableThreshold: result.comfortableThreshold,
      veryGoodThreshold: result.veryGoodThreshold,
      stealThreshold: result.stealThreshold,
      thresholdSource: result.thresholdSource,
      derivedFromCode: result.derivedFromCode,
      thresholdAdjustments: result.thresholdAdjustments as Prisma.InputJsonValue,
      baseTsrHurdleLabel: result.baseTsrHurdleLabel,
      baseTsrHurdleDefault: result.baseTsrHurdleDefault,
      adjustedTsrHurdle: result.adjustedTsrHurdle ?? 0,
      hurdleSource: result.hurdleSource,
      tsrReasonCodes: result.tsrReasonCodes as Prisma.InputJsonValue,
      valuationZone: result.valuationZone,
      valuationStateStatus: result.valuationStateStatus,
      valuationLastUpdatedAt: new Date(),
      version: priorState ? priorState.version + 1 : 1,
    };

    // Atomic upsert + history in transaction
    await prisma.$transaction(async tx => {
      await tx.valuationState.upsert({
        where: { ticker },
        create: data,
        update: {
          ...data,
          createdAt: undefined, // don't overwrite createdAt on update
        },
      });

      if (shouldWriteHistory) {
        await tx.valuationHistory.create({
          data: {
            ticker,
            oldActiveCode: priorState?.activeCode ?? null,
            oldPrimaryMetric: priorState?.primaryMetric ?? null,
            oldCurrentMultiple: priorState?.currentMultiple ?? null,
            oldValuationZone: priorState?.valuationZone ?? null,
            oldAdjustedTsrHurdle: priorState?.adjustedTsrHurdle ?? null,
            newActiveCode: result.activeCode,
            newPrimaryMetric: result.primaryMetric,
            newCurrentMultiple: result.currentMultiple,
            newValuationZone: result.valuationZone,
            newAdjustedTsrHurdle: result.adjustedTsrHurdle,
            changeReason,
            contextSnapshot: {
              active_code: result.activeCode,
              primary_metric: result.primaryMetric,
              current_multiple: result.currentMultiple,
              valuation_zone: result.valuationZone,
              gross_margin_adjustment_applied: result.grossMarginAdjustmentApplied,
              dilution_adjustment_applied: result.dilutionAdjustmentApplied,
              timestamp: new Date().toISOString(),
            } satisfies Prisma.InputJsonValue,
          },
        });
      }
    });

    const duration = Date.now() - start;
    console.log(JSON.stringify({
      event: 'valuation_persist_complete',
      ticker,
      zone: result.valuationZone,
      status: result.valuationStateStatus,
      threshold_source: result.thresholdSource,
      duration_ms: duration,
    }));

    return { ticker, status: 'updated', zone: result.valuationZone };

  } catch (err) {
    console.error(JSON.stringify({
      event: 'valuation_persist_error',
      ticker,
      error: err instanceof Error ? err.message : String(err),
    }));
    return { ticker, status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
}

// ── TASK-076-003: getPersonalizedValuation ────────────────────────────────────

export async function getPersonalizedValuation(
  ticker: string,
  userId: string,
): Promise<PersonalizedValuationResult> {
  const [systemState, classOverride, valuationOverride, anchors, hurdles, stock] =
    await Promise.all([
      prisma.valuationState.findUnique({ where: { ticker } }),
      prisma.userClassificationOverride.findUnique({ where: { userId_ticker: { userId, ticker } } }),
      prisma.userValuationOverride.findUnique({ where: { userId_ticker: { userId, ticker } } }),
      prisma.anchoredThreshold.findMany(),
      prisma.tsrHurdle.findMany(),
      prisma.stock.findUnique({
        where: { ticker },
        select: {
          forwardPe: true, forwardEvEbit: true, evSales: true,
          trailingPe: true, trailingEvEbit: true,
          grossMargin: true, shareCountGrowth3y: true, epsGrowthFwd: true,
          materialDilutionFlag: true, holdingCompanyFlag: true, insurerFlag: true,
          cyclicalityFlag: true, preOperatingLeverageFlag: true,
          forwardOperatingEarningsExExcessCash: true,
        },
      }),
    ]);

  const hasUserOverride = !!(classOverride || valuationOverride);

  if (!hasUserOverride || !stock) {
    // No override — return system state directly (no recompute)
    return {
      systemState,
      userResult: systemState ? stateToResult(systemState) : null,
      hasUserOverride: false,
      userClassificationOverrideCode: null,
    };
  }

  // Resolve active code: user's final_code if override present, else system suggested_code
  let activeCode: string | null = classOverride?.finalCode ?? null;
  if (!activeCode) {
    const classification = await prisma.classificationState.findUnique({
      where: { ticker },
      select: { suggestedCode: true },
    });
    activeCode = classification?.suggestedCode ?? null;
  }

  if (!activeCode) {
    return { systemState, userResult: null, hasUserOverride, userClassificationOverrideCode: classOverride?.finalCode ?? null };
  }

  const anchoredRows: AnchoredThresholdRow[] = anchors.map(a => ({
    code: a.code, bucket: a.bucket,
    earningsQuality: a.earningsQuality, balanceSheetQuality: a.balanceSheetQuality,
    primaryMetric: a.primaryMetric,
    maxThreshold: Number(a.maxThreshold), comfortableThreshold: Number(a.comfortableThreshold),
    veryGoodThreshold: Number(a.veryGoodThreshold), stealThreshold: Number(a.stealThreshold),
  }));

  const tsrHurdleRows: TsrHurdleRow[] = hurdles.map(h => ({
    bucket: h.bucket, baseHurdleLabel: h.baseHurdleLabel,
    baseHurdleDefault: h.baseHurdleDefault !== null ? Number(h.baseHurdleDefault) : null,
    earningsQualityAAdjustment: Number(h.earningsQualityAAdjustment),
    earningsQualityBAdjustment: Number(h.earningsQualityBAdjustment),
    earningsQualityCAdjustment: Number(h.earningsQualityCAdjustment),
    balanceSheetAAdjustment: Number(h.balanceSheetAAdjustment),
    balanceSheetBAdjustment: Number(h.balanceSheetBAdjustment),
    balanceSheetCAdjustment: Number(h.balanceSheetCAdjustment),
  }));

  // Build input, merging valuation override fields
  const input: ValuationInput = {
    activeCode,
    forwardPe: stock.forwardPe !== null ? Number(stock.forwardPe) : null,
    forwardEvEbit: stock.forwardEvEbit !== null ? Number(stock.forwardEvEbit) : null,
    evSales: stock.evSales !== null ? Number(stock.evSales) : null,
    trailingPe: stock.trailingPe !== null ? Number(stock.trailingPe) : null,
    trailingEvEbit: stock.trailingEvEbit !== null ? Number(stock.trailingEvEbit) : null,
    grossMargin: stock.grossMargin !== null ? Number(stock.grossMargin) : null,
    shareCountGrowth3y: stock.shareCountGrowth3y !== null ? Number(stock.shareCountGrowth3y) / 100 : null,
    materialDilutionFlag: stock.materialDilutionFlag ?? false,
    holdingCompanyFlag: stock.holdingCompanyFlag ?? false,
    insurerFlag: stock.insurerFlag ?? false,
    cyclicalityFlag: stock.cyclicalityFlag ?? false,
    preOperatingLeverageFlag: stock.preOperatingLeverageFlag ?? false,
    forwardOperatingEarningsExExcessCash:
      stock.forwardOperatingEarningsExExcessCash !== null
        ? Number(stock.forwardOperatingEarningsExExcessCash)
        : null,
    anchoredThresholds: anchoredRows,
    tsrHurdles: tsrHurdleRows,
  };

  // Apply user valuation override fields
  if (valuationOverride) {
    if (valuationOverride.primaryMetricOverride) {
      input.primaryMetricOverride = valuationOverride.primaryMetricOverride as import('@/domain/valuation').PrimaryMetric;
    }
    if (valuationOverride.forwardOperatingEarningsExExcessCash !== null &&
        valuationOverride.forwardOperatingEarningsExExcessCash !== undefined) {
      input.forwardOperatingEarningsExExcessCash = Number(valuationOverride.forwardOperatingEarningsExExcessCash);
    }
  }

  // In-memory recompute — NOT persisted to valuation_state
  const userResult = computeValuation(input);

  // If user has threshold overrides, apply them on top of computed result
  if (
    valuationOverride?.maxThreshold !== null &&
    valuationOverride?.maxThreshold !== undefined
  ) {
    userResult.maxThreshold = Number(valuationOverride.maxThreshold);
    userResult.comfortableThreshold = Number(valuationOverride.comfortableThreshold!);
    userResult.veryGoodThreshold = Number(valuationOverride.veryGoodThreshold!);
    userResult.stealThreshold = Number(valuationOverride.stealThreshold!);
    userResult.thresholdSource = 'manual_override';
    // Recompute zone with overridden thresholds
    const { assignZone } = await import('@/domain/valuation');
    userResult.valuationZone = assignZone(
      userResult.currentMultiple,
      userResult.maxThreshold,
      userResult.comfortableThreshold,
      userResult.veryGoodThreshold,
      userResult.stealThreshold,
    );
  }

  return {
    systemState,
    userResult,
    hasUserOverride,
    userClassificationOverrideCode: classOverride?.finalCode ?? null,
  };
}

// ── TASK-076-004: Read models ─────────────────────────────────────────────────

export async function getValuationState(ticker: string): Promise<ValuationState | null> {
  return prisma.valuationState.findUnique({ where: { ticker } });
}

export async function getValuationHistory(ticker: string, limit = 20) {
  return prisma.valuationHistory.findMany({
    where: { ticker },
    orderBy: { changedAt: 'desc' },
    take: limit,
  });
}

// ── Helper: ValuationState row → ValuationResult (for no-override path) ───────

function stateToResult(s: ValuationState): ValuationResult {
  return {
    activeCode: s.activeCode,
    primaryMetric: s.primaryMetric as import('@/domain/valuation').PrimaryMetric,
    metricReason: s.metricReason ?? '',
    currentMultiple: s.currentMultiple !== null ? Number(s.currentMultiple) : null,
    currentMultipleBasis: s.currentMultipleBasis ?? 'spot',
    metricSource: s.primaryMetric,
    maxThreshold: s.maxThreshold !== null ? Number(s.maxThreshold) : null,
    comfortableThreshold: s.comfortableThreshold !== null ? Number(s.comfortableThreshold) : null,
    veryGoodThreshold: s.veryGoodThreshold !== null ? Number(s.veryGoodThreshold) : null,
    stealThreshold: s.stealThreshold !== null ? Number(s.stealThreshold) : null,
    thresholdSource: s.thresholdSource as import('@/domain/valuation').ThresholdSource,
    derivedFromCode: s.derivedFromCode,
    thresholdAdjustments: (s.thresholdAdjustments as import('@/domain/valuation').ThresholdAdjustment[]) ?? [],
    baseTsrHurdleLabel: s.baseTsrHurdleLabel,
    baseTsrHurdleDefault: s.baseTsrHurdleDefault !== null ? Number(s.baseTsrHurdleDefault) : null,
    adjustedTsrHurdle: s.adjustedTsrHurdle !== null ? Number(s.adjustedTsrHurdle) : null,
    hurdleSource: s.hurdleSource as 'default' | 'manual_override',
    tsrReasonCodes: (s.tsrReasonCodes as string[]) ?? [],
    valuationZone: s.valuationZone as import('@/domain/valuation').ValuationZone,
    valuationStateStatus: s.valuationStateStatus as import('@/domain/valuation').ValuationStateStatus,
    grossMarginAdjustmentApplied: false,
    dilutionAdjustmentApplied: false,
    cyclicalityContextFlag: false,
  };
}
