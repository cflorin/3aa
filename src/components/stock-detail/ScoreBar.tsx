// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: ScoreBar — horizontal score bar for bucket/EQ/BS scores
// PRD §Stock Detail; RFC-003 §Stock Detail Screen; prototype screen-stock-detail.jsx

import React from 'react';

interface ScoreBarProps {
  label: string;
  value: number;
  max?: number;
  highlight?: boolean;
  'data-testid'?: string;
}

export default function ScoreBar({ label, value, max = 100, highlight = false, 'data-testid': testId }: ScoreBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}
      data-testid={testId}
    >
      <span style={{
        fontSize: 11,
        fontFamily: 'monospace',
        color: highlight ? '#15803d' : '#6b7280',
        width: 20,
        textAlign: 'right',
        fontWeight: highlight ? 700 : 400,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 8,
        background: '#e5e7eb',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: highlight ? '#15803d' : '#9ca3af',
          borderRadius: 2,
        }} />
      </div>
      <span style={{
        fontSize: 11,
        fontFamily: 'monospace',
        color: highlight ? '#111827' : '#6b7280',
        width: 28,
        textAlign: 'right',
        fontWeight: highlight ? 700 : 400,
      }}>
        {value}
      </span>
    </div>
  );
}
