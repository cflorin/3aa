// EPIC-004: Classification Engine & Universe Screen
// STORY-046: User Monitoring Preferences API
// TASK-046-002: Domain functions — getMonitoringStatus, getUniverseStocks
// STORY-048: Extended UniverseStockSummary with table columns (eps_growth_fwd, fcf_conversion, net_debt_to_ebitda)
// RFC-003 §Monitor List API (all-default-monitored, per-user deactivation); ADR-007

import { prisma } from '@/infrastructure/database/prisma';

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
}

export async function getMonitoringStatus(userId: string, ticker: string): Promise<boolean> {
  const row = await prisma.userDeactivatedStock.findUnique({
    where: { userId_ticker: { userId, ticker } },
  });
  return row === null;
}

export async function getUniverseStocks(
  userId: string,
  opts: { page: number; limit: number },
): Promise<{ stocks: UniverseStockSummary[]; total: number }> {
  const { page, limit } = opts;
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.stock.findMany({
      where: { inUniverse: true },
      select: {
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
      },
      orderBy: { ticker: 'asc' },
      skip,
      take: limit,
    }),
    prisma.stock.count({ where: { inUniverse: true } }),
  ]);

  const stocks: UniverseStockSummary[] = rows.map((row) => {
    const systemCode = row.classificationState?.suggestedCode ?? null;
    const overrideCode = row.userClassificationOverrides[0]?.finalCode ?? null;
    return {
      ticker: row.ticker,
      company_name: row.companyName,
      sector: row.sector ?? null,
      market_cap: row.marketCap !== null ? Number(row.marketCap) : null,
      current_price: row.currentPrice !== null ? Number(row.currentPrice) : null,
      revenue_growth_fwd: row.revenueGrowthFwd !== null ? Number(row.revenueGrowthFwd) : null,
      eps_growth_fwd: row.epsGrowthFwd !== null ? Number(row.epsGrowthFwd) : null,
      operating_margin: row.operatingMargin !== null ? Number(row.operatingMargin) : null,
      fcf_conversion: row.fcfConversion !== null ? Number(row.fcfConversion) : null,
      net_debt_to_ebitda: row.netDebtToEbitda !== null ? Number(row.netDebtToEbitda) : null,
      is_active: row.userDeactivatedStocks.length === 0,
      active_code: overrideCode ?? systemCode,
      confidence_level: row.classificationState?.confidenceLevel ?? null,
    };
  });

  return { stocks, total };
}
