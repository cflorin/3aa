// EPIC-004: Classification Engine & Universe Screen
// STORY-046: User Monitoring Preferences API
// TASK-046-002: Domain functions — getMonitoringStatus, getUniverseStocks
// STORY-048: Extended UniverseStockSummary with table columns (eps_growth_fwd, fcf_conversion, net_debt_to_ebitda)
// STORY-049: Extended getUniverseStocks with filter/sort params; added getSectors
// STORY-070: Extended UniverseStockSummary with optional trend metrics; getUniverseStocks includeTrend option
// RFC-003 §Monitor List API (all-default-monitored, per-user deactivation); ADR-007
// RFC-008 §Classifier-Facing Derived Fields; RFC-002 Amendment 2026-04-25

import { Prisma } from '@prisma/client';
import { prisma } from '@/infrastructure/database/prisma';

// Optional quarterly trend metrics (STORY-070) — present when ?include=trend
export interface UniverseTrendMetrics {
  operating_margin_slope_4q: number | null; // pp/quarter
  earnings_quality_trend_score: number | null; // −1.0 to +1.0
  material_dilution_trend_flag: boolean | null;
  quarters_available: number | null;
}

export interface UniverseStockSummary {
  ticker: string;
  company_name: string;
  sector: string | null;
  market_cap: number | null;
  current_price: number | null;
  revenue_growth_fwd: number | null;
  eps_growth_fwd: number | null;
  operating_margin: number | null;
  fcf_conversion: number | null;
  net_debt_to_ebitda: number | null;
  is_active: boolean;
  active_code: string | null;
  confidence_level: string | null;
  trend?: UniverseTrendMetrics; // only present when includeTrend=true
}

export interface UniverseQueryOpts {
  page: number;
  limit: number;
  search?: string;
  sector?: string[];
  code?: string;
  confidence?: string[];
  monitoring?: 'active' | 'inactive';
  sort?: string;
  dir?: 'asc' | 'desc';
  includeTrend?: boolean;
  // Trend metric filters (STORY-070) — only applied when includeTrend=true
  eqTrendMin?: number;
  eqTrendMax?: number;
  dilutionFlagOnly?: boolean;
  minQuartersAvailable?: number;
}

// Maps API sort param names to Prisma field names
const SORT_FIELD_MAP: Record<string, keyof typeof NUMERIC_SORT_FIELDS> = {
  market_cap: 'marketCap',
  revenue_growth_fwd: 'revenueGrowthFwd',
  eps_growth_fwd: 'epsGrowthFwd',
  operating_margin: 'operatingMargin',
  fcf_conversion: 'fcfConversion',
  net_debt_to_ebitda: 'netDebtToEbitda',
} as const;

// Sentinel to distinguish numeric (null-last) fields from ticker (no nulls)
const NUMERIC_SORT_FIELDS = {
  marketCap: true,
  revenueGrowthFwd: true,
  epsGrowthFwd: true,
  operatingMargin: true,
  fcfConversion: true,
  netDebtToEbitda: true,
} as const;

// Trend metric sort fields — sorted via derivedMetrics relation (STORY-070)
const TREND_SORT_FIELDS = new Set([
  'operating_margin_slope_4q',
  'earnings_quality_trend_score',
  'quarters_available',
]);

function buildOrderBy(sort: string, dir: 'asc' | 'desc'): Prisma.StockOrderByWithRelationInput[] {
  if (sort === 'ticker') {
    return [{ ticker: dir }];
  }
  const prismaField = SORT_FIELD_MAP[sort];
  if (!prismaField) {
    return [{ marketCap: { sort: 'desc', nulls: 'last' } }, { ticker: 'asc' }];
  }
  return [{ [prismaField]: { sort: dir, nulls: 'last' } } as Prisma.StockOrderByWithRelationInput, { ticker: 'asc' }];
}

function makeStockSelect(userId: string, includeTrend = false) {
  return {
    ticker: true,
    companyName: true,
    sector: true,
    marketCap: true,
    currentPrice: true,
    revenueGrowthFwd: true,
    epsGrowthFwd: true,
    operatingMargin: true,
    fcfConversion: true,
    netDebtToEbitda: true,
    classificationState: { select: { suggestedCode: true, confidenceLevel: true } },
    userClassificationOverrides: { where: { userId }, select: { finalCode: true } },
    userDeactivatedStocks: { where: { userId }, select: { userId: true } },
    // LEFT JOIN stock_derived_metrics when trend columns requested (STORY-070)
    ...(includeTrend ? {
      derivedMetrics: {
        select: {
          operatingMarginSlope4q: true,
          earningsQualityTrendScore: true,
          materialDilutionTrendFlag: true,
          quartersAvailable: true,
        },
      },
    } : {}),
  } as const;
}

type StockSelectRow = {
  ticker: string;
  companyName: string;
  sector: string | null;
  marketCap: { toString(): string } | null;
  currentPrice: { toString(): string } | null;
  revenueGrowthFwd: { toString(): string } | null;
  epsGrowthFwd: { toString(): string } | null;
  operatingMargin: { toString(): string } | null;
  fcfConversion: { toString(): string } | null;
  netDebtToEbitda: { toString(): string } | null;
  classificationState: { suggestedCode: string | null; confidenceLevel: string } | null;
  userClassificationOverrides: { finalCode: string }[];
  userDeactivatedStocks: { userId: string }[];
  // Optional trend metrics (STORY-070)
  derivedMetrics?: {
    operatingMarginSlope4q: { toString(): string } | null;
    earningsQualityTrendScore: { toString(): string } | null;
    materialDilutionTrendFlag: boolean | null;
    quartersAvailable: number | null;
  } | null;
};

function mapRow(row: StockSelectRow): UniverseStockSummary {
  const systemCode = row.classificationState?.suggestedCode ?? null;
  const overrideCode = row.userClassificationOverrides[0]?.finalCode ?? null;
  const base: UniverseStockSummary = {
    ticker: row.ticker,
    company_name: row.companyName,
    sector: row.sector ?? null,
    market_cap: row.marketCap !== null ? Number(row.marketCap) : null,
    current_price: row.currentPrice !== null ? Number(row.currentPrice) : null,
    // Growth fields stored as percentages in DB (7.24 = 7.24%); divide by 100 for decimal fraction
    // so fmtPct(val * 100) renders correctly, consistent with the detail API contract.
    revenue_growth_fwd: row.revenueGrowthFwd !== null ? Number(row.revenueGrowthFwd) / 100 : null,
    eps_growth_fwd: row.epsGrowthFwd !== null ? Number(row.epsGrowthFwd) / 100 : null,
    operating_margin: row.operatingMargin !== null ? Number(row.operatingMargin) : null,
    fcf_conversion: row.fcfConversion !== null ? Number(row.fcfConversion) : null,
    net_debt_to_ebitda: row.netDebtToEbitda !== null ? Number(row.netDebtToEbitda) : null,
    is_active: row.userDeactivatedStocks.length === 0,
    active_code: overrideCode ?? systemCode,
    confidence_level: row.classificationState?.confidenceLevel ?? null,
  };
  if (row.derivedMetrics !== undefined) {
    const dm = row.derivedMetrics;
    base.trend = {
      operating_margin_slope_4q: dm?.operatingMarginSlope4q != null ? Number(dm.operatingMarginSlope4q) : null,
      earnings_quality_trend_score: dm?.earningsQualityTrendScore != null ? Number(dm.earningsQualityTrendScore) : null,
      material_dilution_trend_flag: dm?.materialDilutionTrendFlag ?? null,
      quarters_available: dm?.quartersAvailable ?? null,
    };
  }
  return base;
}

export async function getUniverseStock(
  userId: string,
  ticker: string,
): Promise<UniverseStockSummary | null> {
  const row = await prisma.stock.findFirst({
    where: { ticker: ticker.toUpperCase(), inUniverse: true },
    select: makeStockSelect(userId),
  });
  return row ? mapRow(row) : null;
}

export async function getMonitoringStatus(userId: string, ticker: string): Promise<boolean> {
  const row = await prisma.userDeactivatedStock.findUnique({
    where: { userId_ticker: { userId, ticker } },
  });
  return row === null;
}

export async function getSectors(): Promise<string[]> {
  const rows = await prisma.stock.findMany({
    where: { inUniverse: true, sector: { not: null } },
    select: { sector: true },
    distinct: ['sector'],
    orderBy: { sector: 'asc' },
  });
  return rows.map(r => r.sector as string);
}

export async function getUniverseStocks(
  userId: string,
  opts: UniverseQueryOpts,
): Promise<{ stocks: UniverseStockSummary[]; total: number }> {
  const {
    page,
    limit,
    search,
    sector,
    code,
    confidence,
    monitoring,
    sort = 'market_cap',
    dir = 'desc',
    includeTrend = false,
    eqTrendMin,
    eqTrendMax,
    dilutionFlagOnly,
    minQuartersAvailable,
  } = opts;

  // Build AND conditions for DB-level filtering
  const andConditions: Prisma.StockWhereInput[] = [{ inUniverse: true }];

  if (search) {
    andConditions.push({
      OR: [
        { ticker: { startsWith: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (sector && sector.length > 0) {
    andConditions.push({ sector: { in: sector } });
  }

  if (confidence && confidence.length > 0) {
    const hasNoClass = confidence.includes('no_classification');
    const realLevels = confidence.filter(c => c !== 'no_classification');
    const confidenceOrs: Prisma.StockWhereInput[] = [];
    if (hasNoClass) {
      // null confidence_level means no classificationState record exists (field is non-nullable)
      confidenceOrs.push({ classificationState: { is: null } });
    }
    if (realLevels.length > 0) {
      confidenceOrs.push({ classificationState: { is: { confidenceLevel: { in: realLevels } } } });
    }
    if (confidenceOrs.length > 0) {
      andConditions.push({ OR: confidenceOrs });
    }
  }

  if (monitoring === 'inactive') {
    andConditions.push({ userDeactivatedStocks: { some: { userId } } });
  } else if (monitoring === 'active') {
    andConditions.push({ NOT: { userDeactivatedStocks: { some: { userId } } } });
  }

  // Trend metric DB-level filters (STORY-070) — applied via derivedMetrics relation
  if (includeTrend) {
    const trendConditions: Prisma.StockDerivedMetricsWhereInput = {};
    if (eqTrendMin !== undefined) {
      trendConditions.earningsQualityTrendScore = {
        ...trendConditions.earningsQualityTrendScore as object,
        gte: eqTrendMin,
      };
    }
    if (eqTrendMax !== undefined) {
      trendConditions.earningsQualityTrendScore = {
        ...trendConditions.earningsQualityTrendScore as object,
        lte: eqTrendMax,
      };
    }
    if (dilutionFlagOnly === true) {
      trendConditions.materialDilutionTrendFlag = true;
    }
    if (minQuartersAvailable !== undefined) {
      trendConditions.quartersAvailable = { gte: minQuartersAvailable };
    }
    if (Object.keys(trendConditions).length > 0) {
      andConditions.push({ derivedMetrics: { is: trendConditions } });
    }
  }

  const where: Prisma.StockWhereInput =
    andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

  // Build orderBy — trend sort fields use derivedMetrics relation with nulls: 'last'
  let orderBy: Prisma.StockOrderByWithRelationInput[];
  if (TREND_SORT_FIELDS.has(sort)) {
    const prismaFieldMap: Record<string, string> = {
      operating_margin_slope_4q: 'operatingMarginSlope4q',
      earnings_quality_trend_score: 'earningsQualityTrendScore',
      quarters_available: 'quartersAvailable',
    };
    const field = prismaFieldMap[sort];
    orderBy = [
      { derivedMetrics: { [field]: { sort: dir, nulls: 'last' } } } as Prisma.StockOrderByWithRelationInput,
      { ticker: 'asc' },
    ];
  } else {
    orderBy = buildOrderBy(sort, dir);
  }

  // Fetch all DB-filtered rows — code filter is computed and applied in-memory
  const rows = await prisma.stock.findMany({
    where,
    select: makeStockSelect(userId, includeTrend),
    orderBy,
  });

  const allStocks = rows.map(mapRow);

  // In-memory code prefix filter (active_code is computed — cannot be a Prisma WHERE)
  const filtered =
    code
      ? allStocks.filter(s => s.active_code?.toUpperCase().startsWith(code.toUpperCase()) ?? false)
      : allStocks;

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const stocks = filtered.slice(skip, skip + limit);

  return { stocks, total };
}
