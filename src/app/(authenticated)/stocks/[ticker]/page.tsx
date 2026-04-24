// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-003: /stocks/[ticker] — Next.js server component + auth guard
// PRD §Stock Detail; RFC-003 §Stock Detail Screen; ADR-006 (session auth)

import StockDetailClient from '@/components/stock-detail/StockDetailClient';

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { ticker } = await params;
  return { title: `${ticker} | 3AA` };
}

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  return <StockDetailClient ticker={ticker} />;
}
