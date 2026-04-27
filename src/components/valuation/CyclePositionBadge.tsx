// EPIC-008: Valuation Regime Decoupling
// STORY-095: Stock Detail Regime & Cyclicality Display
// TASK-095-004: CyclePositionBadge component — 4 cycle positions with color scheme

import React from 'react';

const CYCLE_COLORS: Record<string, string> = {
  normal: '#4ade80',
  elevated: '#facc15',
  peak: '#f87171',
  depressed: '#60a5fa',
};

const CYCLE_LABELS: Record<string, string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  peak: 'Peak',
  depressed: 'Depressed',
};

interface CyclePositionBadgeProps {
  position: string | null | undefined;
}

export default function CyclePositionBadge({ position }: CyclePositionBadgeProps) {
  if (!position) return <span style={{ fontSize: 11, color: '#71717a' }}>—</span>;
  const color = CYCLE_COLORS[position] ?? '#71717a';
  const label = CYCLE_LABELS[position] ?? position;
  return (
    <span
      data-testid="cycle-position-badge"
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
      }}
    >
      {label}
    </span>
  );
}
