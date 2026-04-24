// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: PaginationControls — prev/next with page indicator
// EPIC-004/STORY-054/TASK-054-005: Applied dark terminal theme (screen-universe.jsx spec)
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React from 'react';
import { T } from '@/lib/theme';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalStocks: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function PaginationControls({ page, totalPages, totalStocks, onPrev, onNext }: PaginationControlsProps) {
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    fontSize: 11,
    borderRadius: 3,
    border: `1px solid ${T.border}`,
    background: 'transparent',
    color: disabled ? T.textDim : T.text,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
  });

  return (
    <div
      style={{
        padding: '6px 14px',
        borderTop: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: T.headerBg,
        flexShrink: 0,
      }}
      aria-label="Pagination"
    >
      <span style={{ fontSize: 11, color: T.textDim }}>
        Page {page} of {totalPages} · {totalStocks} stocks
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={onPrev}
          disabled={isFirst}
          style={btnStyle(isFirst)}
          aria-label="Previous page"
        >
          ← Prev
        </button>
        <button
          onClick={onNext}
          disabled={isLast}
          style={btnStyle(isLast)}
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
