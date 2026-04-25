// EPIC-004: Classification Engine & Universe Screen
// STORY-046: User Monitoring Preferences API
// TASK-046-004: GET /api/universe — all in-universe stocks with per-user monitoring status
// STORY-049: Extended with filter/sort query params
// STORY-070: Extended with ?include=trend; trend filter/sort params
// RFC-003 §Monitor List API; RFC-003 §Filtering and Sort; ADR-007; ADR-006 (session auth)
// RFC-008 §Classifier-Facing Derived Fields

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { getUniverseStocks } from '@/domain/monitoring';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const ALLOWED_SORT_FIELDS = new Set([
  'market_cap',
  'ticker',
  'revenue_growth_fwd',
  'eps_growth_fwd',
  'operating_margin',
  'fcf_conversion',
  'net_debt_to_ebitda',
  // Trend metric sort fields (STORY-070)
  'operating_margin_slope_4q',
  'earnings_quality_trend_score',
  'quarters_available',
]);

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const rawLimit = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);

  // Filter params
  const search = searchParams.get('search')?.trim() || undefined;
  const sectorRaw = searchParams.get('sector');
  const sector = sectorRaw ? sectorRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const code = searchParams.get('code')?.trim() || undefined;
  const confidenceRaw = searchParams.get('confidence');
  const confidence = confidenceRaw ? confidenceRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const monitoringRaw = searchParams.get('monitoring');
  const monitoring =
    monitoringRaw === 'active' || monitoringRaw === 'inactive' ? monitoringRaw : undefined;

  // Sort params
  const sortRaw = searchParams.get('sort') ?? 'market_cap';
  const sort = ALLOWED_SORT_FIELDS.has(sortRaw) ? sortRaw : 'market_cap';
  const dirRaw = searchParams.get('dir') ?? 'desc';
  const dir: 'asc' | 'desc' = dirRaw === 'asc' ? 'asc' : 'desc';

  // Trend params (STORY-070) — only active when include=trend
  const includeTrend = searchParams.get('include') === 'trend';
  const eqTrendMinRaw = searchParams.get('eq_trend_min');
  const eqTrendMaxRaw = searchParams.get('eq_trend_max');
  const eqTrendMin = eqTrendMinRaw !== null ? parseFloat(eqTrendMinRaw) : undefined;
  const eqTrendMax = eqTrendMaxRaw !== null ? parseFloat(eqTrendMaxRaw) : undefined;
  const dilutionFlagOnly = searchParams.get('dilution_flag') === 'true';
  const minQRaw = searchParams.get('min_quarters');
  const minQuartersAvailable = minQRaw !== null ? parseInt(minQRaw, 10) : undefined;

  const { stocks, total } = await getUniverseStocks(user.userId, {
    page,
    limit,
    search,
    sector,
    code,
    confidence,
    monitoring,
    sort,
    dir,
    includeTrend,
    eqTrendMin: !isNaN(eqTrendMin!) ? eqTrendMin : undefined,
    eqTrendMax: !isNaN(eqTrendMax!) ? eqTrendMax : undefined,
    dilutionFlagOnly: dilutionFlagOnly || undefined,
    minQuartersAvailable: minQuartersAvailable !== undefined && !isNaN(minQuartersAvailable) ? minQuartersAvailable : undefined,
  });

  return NextResponse.json({ stocks, total, page, limit });
}
