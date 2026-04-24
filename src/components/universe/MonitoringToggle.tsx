// EPIC-004: Classification Engine & Universe Screen
// STORY-050: Monitoring Deactivate/Reactivate UI
// TASK-050-001: MonitoringToggle — per-row toggle with confirmation, optimistic update, error revert
// PRD §Screen 2 — Monitor List Management; RFC-003 §Monitor List Management UI; ADR-007

'use client';

import React, { useEffect, useState } from 'react';

interface MonitoringToggleProps {
  ticker: string;
  isActive: boolean;
  onStateChange: (ticker: string, newIsActive: boolean) => void;
}

const BTN_BASE: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid',
  fontSize: '0.75rem',
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const DEACTIVATE_BTN: React.CSSProperties = {
  ...BTN_BASE,
  borderColor: '#d1d5db',
  backgroundColor: '#f9fafb',
  color: '#374151',
};

const REACTIVATE_BTN: React.CSSProperties = {
  ...BTN_BASE,
  borderColor: '#15803d',
  backgroundColor: '#dcfce7',
  color: '#15803d',
};

const CONFIRM_BTN: React.CSSProperties = {
  ...BTN_BASE,
  borderColor: '#dc2626',
  backgroundColor: '#fef2f2',
  color: '#dc2626',
};

const CANCEL_BTN: React.CSSProperties = {
  ...BTN_BASE,
  borderColor: '#d1d5db',
  backgroundColor: '#fff',
  color: '#6b7280',
};

export default function MonitoringToggle({ ticker, isActive, onStateChange }: MonitoringToggleProps) {
  const [localIsActive, setLocalIsActive] = useState(isActive);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with parent when new page/filter data arrives
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
    // Optimistic update
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
      // Revert on failure
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
    // Optimistic update
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
      // Revert on failure
      setLocalIsActive(false);
      onStateChange(ticker, false);
      setError('Failed to reactivate. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div onClick={stop} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
      {!localIsActive && (
        <span
          data-testid="monitoring-inactive-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: '9999px',
            backgroundColor: '#f3f4f6',
            color: '#6b7280',
            fontSize: '0.7rem',
            fontWeight: 600,
          }}
        >
          Inactive
        </span>
      )}

      {showConfirm ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: '#374151' }}>Stop monitoring?</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              data-testid="confirm-deactivate-btn"
              onClick={handleConfirm}
              disabled={loading}
              style={CONFIRM_BTN}
            >
              Confirm
            </button>
            <button
              data-testid="cancel-deactivate-btn"
              onClick={handleCancel}
              disabled={loading}
              style={CANCEL_BTN}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : localIsActive ? (
        <button
          data-testid="deactivate-btn"
          onClick={handleDeactivateClick}
          disabled={loading}
          style={DEACTIVATE_BTN}
        >
          {loading ? '…' : 'Deactivate'}
        </button>
      ) : (
        <button
          data-testid="reactivate-btn"
          onClick={handleReactivate}
          disabled={loading}
          style={REACTIVATE_BTN}
        >
          {loading ? '…' : 'Reactivate'}
        </button>
      )}

      {error && (
        <span
          data-testid="toggle-error"
          style={{ fontSize: '0.7rem', color: '#dc2626' }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
