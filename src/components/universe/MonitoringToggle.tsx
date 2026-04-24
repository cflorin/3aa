// EPIC-004: Classification Engine & Universe Screen
// STORY-050: Monitoring Deactivate/Reactivate UI
// TASK-050-001: MonitoringToggle — per-row toggle with confirmation, optimistic update, error revert
// EPIC-004/STORY-054/TASK-054-006: Applied dark terminal theme (screen-universe.jsx spec)
// PRD §Screen 2 — Monitor List Management; RFC-003 §Monitor List Management UI; ADR-007

'use client';

import React, { useEffect, useState } from 'react';
import { T } from '@/lib/theme';

interface MonitoringToggleProps {
  ticker: string;
  isActive: boolean;
  onStateChange: (ticker: string, newIsActive: boolean) => void;
}

export default function MonitoringToggle({ ticker, isActive, onStateChange }: MonitoringToggleProps) {
  const [localIsActive, setLocalIsActive] = useState(isActive);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalIsActive(isActive);
  }, [isActive]);

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  function handleDeactivateClick(e: React.MouseEvent) {
    e.stopPropagation();
    setShowConfirm(true);
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setShowConfirm(false);
  }

  async function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    setShowConfirm(false);
    setLoading(true);
    setLocalIsActive(false);
    onStateChange(ticker, false);
    try {
      const res = await fetch(`/api/stocks/${ticker}/monitoring`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
    } catch {
      setLocalIsActive(true);
      onStateChange(ticker, true);
      setError('Failed to deactivate. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivate(e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    setLoading(true);
    setLocalIsActive(true);
    onStateChange(ticker, true);
    try {
      const res = await fetch(`/api/stocks/${ticker}/monitoring`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
    } catch {
      setLocalIsActive(false);
      onStateChange(ticker, false);
      setError('Failed to reactivate. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div onClick={stop} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      {showConfirm ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: T.textMuted, whiteSpace: 'nowrap' }}>Stop alerts?</span>
          <button
            data-testid="confirm-deactivate-btn"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 3,
              border: '1px solid #ef444444', background: '#ef444412',
              color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Yes
          </button>
          <button
            data-testid="cancel-deactivate-btn"
            onClick={handleCancel}
            disabled={loading}
            style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.textDim, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            No
          </button>
        </div>
      ) : localIsActive ? (
        <button
          data-testid="deactivate-btn"
          onClick={handleDeactivateClick}
          disabled={loading}
          style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 3,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.textDim, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {loading ? '…' : 'Active ↓'}
        </button>
      ) : (
        <button
          data-testid="reactivate-btn"
          onClick={handleReactivate}
          disabled={loading}
          style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 3,
            border: '1px solid #16a34a44', background: 'transparent',
            color: '#16a34a', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {loading ? '…' : 'Reactivate'}
        </button>
      )}

      {!localIsActive && !showConfirm && (
        <span
          data-testid="monitoring-inactive-badge"
          style={{ fontSize: 9, color: T.textDim }}
        >
          Inactive
        </span>
      )}

      {error && (
        <span
          data-testid="toggle-error"
          style={{ fontSize: 9, color: '#ef4444' }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
