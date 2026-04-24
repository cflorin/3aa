// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: ScoreBar — horizontal score bar for bucket/EQ/BS scores
// EPIC-004/STORY-054/TASK-054-007: Applied dark terminal theme (screen-stock-detail.jsx spec)
// PRD §Stock Detail; RFC-003 §Stock Detail Screen

import React from 'react';
import { T } from '@/lib/theme';

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
        fontSize: 10,
        fontFamily: 'var(--font-dm-mono, monospace)',
        color: highlight ? T.accent : T.textDim,
        width: 18,
        textAlign: 'right',
        fontWeight: highlight ? 700 : 400,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 8,
        background: T.borderFaint,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: highlight ? T.accent : T.textDim + '55',
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontSize: 10,
        fontFamily: 'var(--font-dm-mono, monospace)',
        color: highlight ? T.text : T.textDim,
        width: 26,
        textAlign: 'right',
        fontWeight: highlight ? 700 : 400,
      }}>
        {value}
      </span>
    </div>
  );
}
