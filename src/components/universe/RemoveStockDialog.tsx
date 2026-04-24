// EPIC-004: Classification Engine & Universe Screen
// STORY-055: Remove Stock from Universe
// TASK-055-002: RemoveStockDialog — confirmation modal (dark terminal theme)
// PRD §Universe Management; RFC-003 §Monitor List Management

'use client';

import React, { useEffect, useRef } from 'react';
import { T } from '@/lib/theme';

interface RemoveStockDialogProps {
  ticker: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function RemoveStockDialog({
  ticker,
  onConfirm,
  onCancel,
  loading = false,
}: RemoveStockDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button on open (safe default for destructive dialogs)
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-dialog-title"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: '24px',
          width: 360,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div>
          <p
            id="remove-dialog-title"
            style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}
          >
            Remove{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: T.accent }}>
              {ticker}
            </span>{' '}
            from universe?
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
            The stock record is kept but it will no longer appear in your list.
            You can re-add it at any time.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            data-testid="remove-dialog-cancel"
            onClick={onCancel}
            disabled={loading}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 4,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.textDim, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="remove-dialog-confirm"
            onClick={onConfirm}
            disabled={loading}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 4,
              border: '1px solid #ef444466', background: '#ef444415',
              color: '#ef4444', cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
