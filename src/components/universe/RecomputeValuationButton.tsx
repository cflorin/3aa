// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-086: Recompute Valuations — Admin API & Universe Screen Button
// TASK-086-002: RecomputeValuationButton — loading/success/error states

'use client';

import React, { useState } from 'react';
import { T } from '@/lib/theme';
import type { ValuationBatchSummary } from '@/modules/valuation/valuation-batch.service';

type Status = 'idle' | 'loading' | 'success' | 'error';

interface Props {
  onSuccess?: (summary: ValuationBatchSummary) => void;
}

export default function RecomputeValuationButton({ onSuccess }: Props) {
  const [status, setStatus]   = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary]  = useState<ValuationBatchSummary | null>(null);

  async function handleClick() {
    setStatus('loading');
    setErrorMsg(null);
    setSummary(null);

    try {
      const res = await fetch('/api/admin/sync/valuation', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: ValuationBatchSummary = await res.json();
      setSummary(data);
      setStatus('success');
      onSuccess?.(data);

      // Auto-dismiss success state after 5 s
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  const isLoading = status === 'loading';

  const label =
    status === 'loading' ? 'Recomputing…' :
    status === 'success' ? '✓ Done' :
    'Recompute Valuations';

  const borderColor =
    status === 'error'   ? '#ef4444' :
    status === 'success' ? '#22c55e' :
    T.textDim;

  const textColor =
    status === 'error'   ? '#ef4444' :
    status === 'success' ? '#22c55e' :
    T.textDim;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        data-testid="recompute-valuation-btn"
        onClick={handleClick}
        disabled={isLoading}
        style={{
          fontSize: 11, padding: '4px 10px', borderRadius: 4,
          border: `1px solid ${borderColor}`,
          background: `${borderColor}15`,
          color: textColor,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', fontWeight: 600,
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {label}
      </button>

      {status === 'success' && summary && (
        <span
          data-testid="recompute-valuation-status"
          style={{ fontSize: 10, color: '#22c55e' }}
        >
          {summary.updated} updated, {summary.skipped} skipped
          {summary.errors > 0 ? `, ${summary.errors} error(s)` : ''}
        </span>
      )}

      {status === 'error' && errorMsg && (
        <span
          data-testid="recompute-valuation-error"
          role="alert"
          style={{ fontSize: 10, color: '#ef4444' }}
        >
          {errorMsg}
        </span>
      )}
    </div>
  );
}
