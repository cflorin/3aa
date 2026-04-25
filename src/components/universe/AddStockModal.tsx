// EPIC-004: Classification Engine & Universe Screen
// STORY-056: Add Stock to Universe
// TASK-056-004: AddStockModal — ticker input + SSE progress display
// Dark terminal theme consistent with RemoveStockDialog; RFC-003 §Monitor List Management

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { T } from '@/lib/theme';
import type { UniverseStockSummary } from '@/domain/monitoring';

interface Props {
  onClose: () => void;
  onAdded: (stock: UniverseStockSummary) => void;
}

interface StageEvent {
  stage: string;
  label?: string;
  step?: number;
  total?: number;
  result?: UniverseStockSummary;
  failedStage?: string;
  message?: string;
}

const TICKER_RE = /^[A-Z0-9.]{1,10}$/i;
const TOTAL_STAGES = 11;

export default function AddStockModal({ onClose, onAdded }: Props) {
  const [ticker, setTicker] = useState('');
  const [validationError, setValidationError] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [currentLabel, setCurrentLabel] = useState('');
  const [errorStage, setErrorStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'submitting') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, status]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && status !== 'submitting') onClose();
  };

  const parseSSELines = (text: string, onEvent: (evt: StageEvent) => void) => {
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)) as StageEvent);
        } catch {
          // malformed SSE line — ignore
        }
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const raw = ticker.trim().toUpperCase();
    if (!raw) {
      setValidationError('Ticker is required.');
      return;
    }
    if (!TICKER_RE.test(raw)) {
      setValidationError('Ticker must be 1–10 alphanumeric characters.');
      return;
    }

    setValidationError('');
    setStatus('submitting');
    setCurrentStep(0);
    setCurrentLabel('Starting…');
    setErrorStage('');
    setErrorMessage('');

    try {
      const res = await fetch('/api/universe/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: raw }),
      });

      // Pre-stream errors (400/401/409) return JSON
      if (!res.ok || res.headers.get('content-type')?.includes('application/json')) {
        const body = await res.json().catch(() => ({}));
        const err = (body as { error?: string }).error ?? 'unknown_error';
        if (err === 'already_in_universe') {
          setErrorMessage('This stock is already in your universe.');
        } else if (err === 'invalid_ticker') {
          setValidationError('Invalid ticker symbol.');
          setStatus('idle');
          return;
        } else {
          setErrorMessage(`Error: ${err}`);
        }
        setStatus('error');
        return;
      }

      // Consume SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        parseSSELines(text, (evt) => {
          if (evt.stage === 'done') {
            completed = true;
            if (evt.result) onAdded(evt.result);
            onClose();
          } else if (evt.stage === 'error') {
            completed = true;
            if (evt.failedStage === 'validate') {
              // Validation failure — show inline on the form so user can correct the ticker
              setValidationError(evt.message ?? 'Ticker not found.');
              setStatus('idle');
            } else {
              setErrorStage(evt.failedStage ?? 'unknown');
              setErrorMessage(evt.message ?? 'Pipeline failed. Please try again.');
              setStatus('error');
            }
          } else if (evt.step !== undefined && evt.label) {
            setCurrentStep(evt.step);
            setCurrentLabel(evt.label);
          }
        });
      }

      // Stream closed without a done/error event — surface a generic error
      if (!completed) {
        setErrorMessage('Connection lost. Please try again.');
        setStatus('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error. Please try again.');
      setStatus('error');
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setErrorStage('');
    setErrorMessage('');
    setCurrentStep(0);
    setCurrentLabel('');
  };

  const progressPct = currentStep > 0 ? Math.round((currentStep / TOTAL_STAGES) * 100) : 0;

  return (
    <div
      role="presentation"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Stock to Universe"
        data-testid="add-stock-modal"
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: '24px 28px',
          width: 400,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Add Stock to Universe
        </div>

        {status === 'idle' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="ticker-input" style={{ fontSize: 11, color: T.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Ticker Symbol
              </label>
              <input
                id="ticker-input"
                ref={inputRef}
                data-testid="ticker-input"
                type="text"
                value={ticker}
                onChange={e => { setTicker(e.target.value.toUpperCase()); setValidationError(''); }}
                placeholder="e.g. NVDA"
                maxLength={10}
                autoComplete="off"
                style={{
                  background: T.inputBg ?? T.cardBg,
                  border: `1px solid ${validationError ? '#ef4444' : T.border}`,
                  borderRadius: 4,
                  color: T.text,
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  fontSize: 14,
                  padding: '8px 10px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              {validationError && (
                <span style={{ fontSize: 11, color: '#ef4444' }}>{validationError}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="add-cancel-btn"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  color: T.textDim,
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '6px 14px',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="add-submit-btn"
                style={{
                  background: `${T.accent}15`,
                  border: `1px solid ${T.accent}`,
                  borderRadius: 4,
                  color: T.accent,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 14px',
                }}
              >
                Add Stock
              </button>
            </div>
          </form>
        )}

        {status === 'submitting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: T.textMuted, fontFamily: 'var(--font-dm-mono, monospace)' }}>
              Adding <span style={{ color: T.accent }}>{ticker}</span>…
            </div>
            <div style={{ fontSize: 12, color: T.text }}>{currentLabel}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                data-testid="add-progress-bar"
                style={{
                  height: 4,
                  background: T.border,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    background: T.accent,
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'right' }}>
                {currentStep > 0 ? `Step ${currentStep} of ${TOTAL_STAGES}` : ''}
              </div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              data-testid="add-error-message"
              style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.5 }}
            >
              {errorMessage}
              {errorStage && (
                <span style={{ display: 'block', fontSize: 11, color: T.textMuted, marginTop: 4 }}>
                  Failed at stage: <span style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>{errorStage}</span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="add-cancel-btn"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  color: T.textDim,
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '6px 14px',
                }}
              >
                Close
              </button>
              {errorStage && (
                <button
                  type="button"
                  data-testid="add-retry-btn"
                  onClick={handleRetry}
                  style={{
                    background: `${T.accent}15`,
                    border: `1px solid ${T.accent}`,
                    borderRadius: 4,
                    color: T.accent,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '6px 14px',
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
