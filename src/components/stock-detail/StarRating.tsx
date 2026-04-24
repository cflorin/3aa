// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: StarRating — 0–5 star display for E1–E6 enrichment scores
// PRD §Stock Detail; STORY-039/040 (E1–E6 LLM enrichment scores 1.0–5.0)

import React from 'react';
import { T } from '@/lib/theme';

interface StarRatingProps {
  value: number | null;
  max?: number;
  'data-testid'?: string;
}

export default function StarRating({ value, max = 5, 'data-testid': testId }: StarRatingProps) {
  if (value === null || value === undefined) {
    return <span style={{ fontSize: 11, color: T.textDim }}>—</span>;
  }

  const pct = (value / max) * 100;
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#eab308' : pct >= 40 ? '#f97316' : '#ef4444';

  const full = Math.floor(value);
  const half = value - full >= 0.5;

  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <div style={{ display: 'flex', gap: 1 }}>
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 1,
              background: i < full ? color : (i === full && half ? color + '70' : T.borderFaint),
            }}
          />
        ))}
      </div>
      <span style={{
        fontSize: 10,
        fontFamily: 'var(--font-dm-mono, monospace)',
        color,
        fontWeight: 600,
      }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}
