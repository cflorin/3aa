// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: ConfidenceBadge — classification confidence level indicator
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React from 'react';

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: '#dcfce7', text: '#15803d', label: 'High' },
  medium: { bg: '#fef9c3', text: '#854d0e', label: 'Medium' },
  low:    { bg: '#ffedd5', text: '#9a3412', label: 'Low' },
};

interface ConfidenceBadgeProps {
  confidence: string | null;
}

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (!confidence || !CONFIDENCE_STYLES[confidence]) {
    return <span style={{ color: '#6b7280' }}>—</span>;
  }

  const { bg, text, label } = CONFIDENCE_STYLES[confidence];

  return (
    <span
      data-testid="confidence-badge"
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: bg,
        color: text,
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}
