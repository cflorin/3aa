// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-079: Stock Detail Page: Valuation Tab
// TASK-079-002: GET /api/stocks/[ticker]/valuation/history — last 10 zone transitions

import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';
import { getValuationHistory } from '@/modules/valuation/valuation-persistence.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await validateSession(sessionId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ticker } = await params;
  const history = await getValuationHistory(ticker, 10);
  return NextResponse.json({ history });
}
