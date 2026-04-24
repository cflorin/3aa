// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: FlagPill — classification flag display pill
// EPIC-004/STORY-054/TASK-054-007: Applied dark terminal theme (screen-stock-detail.jsx spec)
// PRD §Stock Detail; STORY-033/037 (7 classification flags)

import React from 'react';
import { T } from '@/lib/theme';

const FLAG_LABELS: Record<string, string> = {
  holding_company_flag: 'Holding Company',
  insurer_flag: 'Insurer',
  binary_flag: 'Binary / Lottery',
  cyclicality_flag: 'Cyclicality',
  optionality_flag: 'Optionality Dominant',
  pre_operating_leverage_flag: 'Pre-Operating Leverage',
  material_dilution_flag: 'Material Dilution',
};

interface FlagPillProps {
  flag: string;
  value: boolean | null;
}

export default function FlagPill({ flag, value }: FlagPillProps) {
  const label = FLAG_LABELS[flag] ?? flag.replace(/_flag$/, '').replace(/_/g, ' ');
  const isTrue = value === true;

  return (
    <div
      data-testid={`flag-pill-${flag}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '7px 12px',
        borderBottom: `1px solid ${T.borderFaint}`,
      }}
    >
      <span style={{ fontSize: 11, color: T.textDim }}>{label}</span>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: isTrue ? '#f97316' : value === null ? T.textDim : T.textMuted,
        fontFamily: 'var(--font-dm-mono, monospace)',
        background: isTrue ? '#f9731612' : T.sidebarBg,
        padding: '2px 7px',
        borderRadius: 3,
        border: `1px solid ${isTrue ? '#f9731630' : T.border}`,
      }}>
        {value === null ? '—' : value ? 'true' : 'false'}
      </span>
    </div>
  );
}
