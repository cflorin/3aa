// EPIC-008: Valuation Regime Decoupling
// STORY-095: Stock Detail Regime & Cyclicality Display
// TASK-095-002: RegimeBadge component — 9 regime values with color scheme

import React from 'react';

const REGIME_COLORS: Record<string, string> = {
  not_applicable: '#71717a',
  financial_special_case: '#38bdf8',
  manual_required: '#eab308',
  sales_growth_standard: '#2dd4bf',
  sales_growth_hyper: '#818cf8',
  profitable_growth_pe: '#4ade80',
  cyclical_earnings: '#fb923c',
  profitable_growth_ev_ebit: '#c084fc',
  mature_pe: '#94a3b8',
};

const REGIME_LABELS: Record<string, string> = {
  not_applicable: 'N/A',
  financial_special_case: 'Financial Special',
  manual_required: 'Manual Required',
  sales_growth_standard: 'Growth (Std)',
  sales_growth_hyper: 'Growth (Hyper)',
  profitable_growth_pe: 'Profitable P/E',
  cyclical_earnings: 'Cyclical',
  profitable_growth_ev_ebit: 'Profitable EV/EBIT',
  mature_pe: 'Mature P/E',
};

interface RegimeBadgeProps {
  regime: string | null | undefined;
}

export default function RegimeBadge({ regime }: RegimeBadgeProps) {
  if (!regime) return <span style={{ fontSize: 11, color: '#71717a' }}>—</span>;
  const color = REGIME_COLORS[regime] ?? '#71717a';
  const label = REGIME_LABELS[regime] ?? regime;
  return (
    <span
      data-testid="regime-badge"
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: color + '1a',
        border: `1px solid ${color}40`,
        fontFamily: 'var(--font-dm-mono, monospace)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
