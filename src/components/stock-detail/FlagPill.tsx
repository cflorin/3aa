// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: FlagPill — classification flag display pill
// PRD §Stock Detail; STORY-033/037 (7 classification flags)

import React from 'react';

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
        borderBottom: '1px solid #f3f4f6',
      }}
    >
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: isTrue ? '#f97316' : value === null ? '#9ca3af' : '#6b7280',
        fontFamily: 'monospace',
        background: isTrue ? '#fff7ed' : '#f9fafb',
        padding: '2px 8px',
        borderRadius: 3,
        border: `1px solid ${isTrue ? '#fed7aa' : '#e5e7eb'}`,
      }}>
        {value === null ? '—' : value ? 'true' : 'false'}
      </span>
    </div>
  );
}
