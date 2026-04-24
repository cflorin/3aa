// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: ClassificationBadge — 3AA code colored by bucket number
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React from 'react';

const BUCKET_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#14532d', text: '#ffffff' },
  2: { bg: '#166534', text: '#ffffff' },
  3: { bg: '#15803d', text: '#ffffff' },
  4: { bg: '#16a34a', text: '#ffffff' },
  5: { bg: '#ca8a04', text: '#ffffff' },
  6: { bg: '#d97706', text: '#ffffff' },
  7: { bg: '#dc2626', text: '#ffffff' },
  8: { bg: '#991b1b', text: '#ffffff' },
};

function bucketFromCode(code: string): number | null {
  const match = code.match(/^([1-8])/);
  return match ? parseInt(match[1], 10) : null;
}

interface ClassificationBadgeProps {
  code: string | null;
}

export default function ClassificationBadge({ code }: ClassificationBadgeProps) {
  if (!code) {
    return <span style={{ color: '#6b7280' }}>—</span>;
  }

  const bucket = bucketFromCode(code);
  const colors = bucket ? BUCKET_COLORS[bucket] : { bg: '#6b7280', text: '#ffffff' };

  return (
    <span
      data-testid="classification-badge"
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: colors.bg,
        color: colors.text,
        fontSize: '0.75rem',
        fontWeight: 600,
        fontFamily: 'monospace',
        letterSpacing: '0.05em',
      }}
    >
      {code}
    </span>
  );
}
