// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: PaginationControls — prev/next with page indicator
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React from 'react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 16px',
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  backgroundColor: disabled ? '#f9fafb' : '#ffffff',
  color: disabled ? '#9ca3af' : '#111827',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
});

export default function PaginationControls({ page, totalPages, onPrev, onNext }: PaginationControlsProps) {
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}
      aria-label="Pagination"
    >
      <button
        onClick={onPrev}
        disabled={isFirst}
        style={btnStyle(isFirst)}
        aria-label="Previous page"
      >
        ← Previous
      </button>
      <span style={{ fontSize: '0.875rem', color: '#374151' }} aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={isLast}
        style={btnStyle(isLast)}
        aria-label="Next page"
      >
        Next →
      </button>
    </div>
  );
}
