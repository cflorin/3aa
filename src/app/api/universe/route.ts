// EPIC-004: Classification Engine & Universe Screen
// STORY-046: User Monitoring Preferences API
// TASK-046-004: GET /api/universe — all in-universe stocks with per-user monitoring status
// STORY-049: Extended with filter/sort query params
// RFC-003 §Monitor List API; RFC-003 §Filtering and Sort; ADR-007; ADR-006 (session auth)

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
  });

  return NextResponse.json({ stocks, total, page, limit });
}
