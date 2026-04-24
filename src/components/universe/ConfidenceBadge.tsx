// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: ConfidenceBadge — classification confidence level indicator
// EPIC-004/STORY-054/TASK-054-006: Applied dark terminal theme (components.jsx spec)
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React from 'react';

const CONFIDENCE_META: Record<string, { label: string; color: string }> = {
  high:   { label: 'High', color: '#16a34a' },
  medium: { label: 'Med',  color: '#eab308' },
  low:    { label: 'Low',  color: '#ef4444' },
};

interface ConfidenceBadgeProps {
  confidence: string | null;
}

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (!confidence || !CONFIDENCE_META[confidence]) {
    return <span style={{ color: '#4a5068' }}>—</span>;
  }

  const { label, color } = CONFIDENCE_META[confidence];

  return (
    <span
      data-testid="confidence-badge"
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 500,
        padding: '1px 5px',
        borderRadius: 3,
        background: color + '15',
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
}
