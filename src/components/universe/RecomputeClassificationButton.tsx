// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-084: Recompute Classification — Admin API & Universe Screen Button
// TASK-084-002: RecomputeClassificationButton — loading/success/error states

'use client';

import React, { useState } from 'react';
import { T } from '@/lib/theme';
import type { BatchSummary } from '@/modules/classification-batch/classification-batch.service';

type Status = 'idle' | 'loading' | 'success' | 'error';

interface Props {
  onSuccess?: (summary: BatchSummary) => void;
}

export default function RecomputeClassificationButton({ onSuccess }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  async function handleClick() {
    setStatus('loading');
    setErrorMsg(null);
    setSummary(null);

    try {
      const res = await fetch('/api/admin/sync/classification', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: BatchSummary = await res.json();
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
    status === 'success' ? `✓ Done` :
    'Recompute Classification';

  const borderColor =
    status === 'error' ? '#ef4444' :
    status === 'success' ? '#22c55e' :
    T.textDim;

  const textColor =
    status === 'error' ? '#ef4444' :
    status === 'success' ? '#22c55e' :
    T.textDim;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        data-testid="recompute-classification-btn"
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
          data-testid="recompute-success-msg"
          style={{ fontSize: 10, color: '#22c55e' }}
        >
          {summary.recomputed} reclassified, {summary.skipped} skipped
          {summary.errors > 0 ? `, ${summary.errors} errors` : ''}
        </span>
      )}

      {status === 'error' && errorMsg && (
        <span
          data-testid="recompute-error-msg"
          role="alert"
          style={{ fontSize: 10, color: '#ef4444' }}
        >
          {errorMsg}
        </span>
      )}
    </div>
  );
}
