// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: ClassificationBadge — 3AA code colored badge
// EPIC-004/STORY-054/TASK-054-006: Applied dark terminal theme (screen-universe.jsx spec)
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React from 'react';
import { T } from '@/lib/theme';

interface ClassificationBadgeProps {
  code: string | null;
}

export default function ClassificationBadge({ code }: ClassificationBadgeProps) {
  if (!code) {
    return <span style={{ color: T.textDim }}>—</span>;
  }

  return (
    <span
      data-testid="classification-badge"
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 12,
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: 3,
        background: T.accent + '15',
        color: T.accent,
        border: `1px solid ${T.accent}30`,
      }}
    >
      {code}
    </span>
  );
}
