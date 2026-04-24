// EPIC-004: Classification Engine & Universe Screen
// STORY-051: Classification Override Modal
// TASK-051-002: ClassificationModal — full classification detail, history, and override UI
// PRD §Screen 2 — Classification Detail, §Override UI
// RFC-003 §Classification Override Modal; RFC-001 §ClassificationResult; ADR-007 (display_only override scope)

'use client';

import React, { useEffect, useRef, useState } from 'react';
import ConfidenceBadge from './ConfidenceBadge';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassificationData {
  ticker: string;
  system_suggested_code: string | null;
  system_confidence: string | null;
  user_override_code: string | null;
  user_override_reason: string | null;
  active_code: string | null;
  reason_codes: string[];
  scores: {
    bucket: Record<string, number>;
    eq: Record<string, number>;
    bs: Record<string, number>;
  } | null;
  override_scope: 'display_only';
  classified_at: string | null;
}

interface HistoryRow {
  classified_at: string;
  previous_code: string | null;
  suggested_code: string | null;
}

interface ClassificationModalProps {
  ticker: string;
  companyName: string;
  sector: string | null;
  onClose: () => void;
  onOverrideChange: (ticker: string, newCode: string | null) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CODE_REGEX = /^[1-8]([ABC][ABC])?$/;
const REASON_MIN_LENGTH = 10;

const BUCKET_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#14532d', text: '#ffffff' },
  2: { bg: '#166534', text: '#ffffff' },
  3: { bg: '#15803d', text: '#ffffff' },
  4: { bg: '#16a34a', text: '#ffffff' },
  5: { bg: '#ca8a04', text: '#ffffff' },
  6: { bg: '#d97706', text: '#ffffff' },
  7: { bg: '#dc2626', text: '#ffffff' },
  8: { bg: '#991b1b', text: '#ffffff' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function winningBucket(scores: Record<string, number>): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = parseInt(k, 10); }
  }
  return bestScore > 0 ? best : null;
}

function winningGrade(scores: Record<string, number>): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = k; }
  }
  return bestScore > 0 ? best : null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClassificationModal({
  ticker,
  companyName,
  sector,
  onClose,
  onOverrideChange,
}: ClassificationModalProps) {
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<ClassificationData | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [codeInput, setCodeInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Store trigger element for focus return on close
  const triggerRef = useRef<Element | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // ── Focus management ───────────────────────────────────────────────────────

  useEffect(() => {
    triggerRef.current = document.activeElement;
    // Focus first focusable element in modal
    const focusable = modalRef.current?.querySelector<HTMLElement>(
      'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      (triggerRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  // ── ESC handler ────────────────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadState('loading');
      try {
        const [classRes, histRes] = await Promise.all([
          fetch(`/api/stocks/${ticker}/classification`),
          fetch(`/api/stocks/${ticker}/classification/history`),
        ]);
        if (!classRes.ok) throw new Error('classification fetch failed');
        if (!histRes.ok) throw new Error('history fetch failed');
        const [classData, histData] = await Promise.all([classRes.json(), histRes.json()]);
        if (!cancelled) {
          setData(classData);
          setHistory(histData.history ?? []);
          setLoadState('ready');
          // Pre-fill form with existing override if present
          if (classData.user_override_code) {
            setCodeInput(classData.user_override_code);
            setReasonInput(classData.user_override_reason ?? '');
          }
        }
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ticker]);

  // ── Override save ──────────────────────────────────────────────────────────

  async function handleSave() {
    // Client-side validation
    let valid = true;
    if (!CODE_REGEX.test(codeInput)) {
      setCodeError('Invalid code — use format 1–8 or 1AA–8CC (e.g. 4AA)');
      valid = false;
    } else {
      setCodeError(null);
    }
    if (reasonInput.length < REASON_MIN_LENGTH) {
      setReasonError(`Reason must be at least ${REASON_MIN_LENGTH} characters`);
      valid = false;
    } else {
      setReasonError(null);
    }
    if (!valid) return;

    setSaving(true);
    setSaveError(null);

    // Optimistic update
    const prevCode = data?.active_code ?? null;
    onOverrideChange(ticker, codeInput);

    try {
      const res = await fetch('/api/classification-override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticker, final_code: codeInput, override_reason: reasonInput }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      onOverrideChange(ticker, result.active_code);
      // Refresh local data to show override section
      setData(prev => prev ? {
        ...prev,
        user_override_code: codeInput,
        user_override_reason: reasonInput,
        active_code: result.active_code,
      } : prev);
    } catch {
      onOverrideChange(ticker, prevCode);
      setSaveError('Failed to save override. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Override clear ─────────────────────────────────────────────────────────

  async function handleClear() {
    setSaving(true);
    setSaveError(null);

    const prevCode = data?.active_code ?? null;
    const systemCode = data?.system_suggested_code ?? null;

    // Optimistic update
    onOverrideChange(ticker, systemCode);

    try {
      const res = await fetch(`/api/classification-override/${ticker}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setData(prev => prev ? {
        ...prev,
        user_override_code: null,
        user_override_reason: null,
        active_code: systemCode,
      } : prev);
      setCodeInput('');
      setReasonInput('');
    } catch {
      onOverrideChange(ticker, prevCode);
      setSaveError('Failed to clear override. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Form validation helpers ────────────────────────────────────────────────

  const codeValid = CODE_REGEX.test(codeInput);
  const reasonValid = reasonInput.length >= REASON_MIN_LENGTH;
  const saveEnabled = codeValid && reasonValid && !saving;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '4rem',
        overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Classification detail for ${ticker}`}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          width: '100%',
          maxWidth: '680px',
          margin: '0 1rem 4rem',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Section 1: Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>{ticker}</div>
            <div style={{ fontSize: '0.875rem', color: '#374151', marginTop: '2px' }}>{companyName}</div>
            {sector && <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>{sector}</div>}
          </div>
          <button
            onClick={onClose}
            data-testid="modal-close-btn"
            style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6b7280', padding: '0 0 0 16px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {loadState === 'loading' && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#6b7280' }}>Loading classification…</div>
        )}

        {loadState === 'error' && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#dc2626' }}>Failed to load classification. Please try again.</div>
        )}

        {loadState === 'ready' && data && (
          <div style={{ padding: '24px' }}>

            {/* ── Section 2: Active code ── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                {data.user_override_code ? 'Your Override Code' : 'Active Code (System)'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'monospace', color: '#111827' }}>
                {data.active_code ?? '—'}
              </div>
            </div>

            {/* ── Section 3: System suggestion ── */}
            <div style={{ marginBottom: '20px', padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>System Suggestion</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                  {data.system_suggested_code ?? 'System classification pending'}
                </div>
              </div>
              <ConfidenceBadge confidence={data.system_confidence} />
              {data.classified_at && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 'auto' }}>
                  as of {fmtDate(data.classified_at)}
                </div>
              )}
            </div>

            {/* ── Section 4: Bucket scores ── */}
            {data.scores ? (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Bucket Scores</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} data-testid="bucket-scores">
                  {([1,2,3,4,5,6,7,8] as const).map((b) => {
                    const score = data.scores!.bucket[String(b)] ?? 0;
                    const winner = winningBucket(data.scores!.bucket);
                    const isWinner = winner === b;
                    const colors = BUCKET_COLORS[b];
                    return (
                      <div
                        key={b}
                        data-testid={`bucket-score-${b}`}
                        style={{
                          flex: '1 1 60px',
                          textAlign: 'center',
                          padding: '8px 4px',
                          borderRadius: '4px',
                          backgroundColor: isWinner ? colors.bg : '#f3f4f6',
                          color: isWinner ? colors.text : '#374151',
                          fontWeight: isWinner ? 800 : 400,
                          fontSize: '0.75rem',
                          border: isWinner ? '2px solid transparent' : '2px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>B{b}</div>
                        <div>{score.toFixed(0)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '20px', color: '#6b7280', fontSize: '0.875rem' }}>Scores not available</div>
            )}

            {/* ── Section 5: EQ / BS scores ── */}
            {data.scores && (
              <div style={{ marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {(['eq', 'bs'] as const).map((key) => {
                  const scores = data.scores![key];
                  const winner = winningGrade(scores);
                  const label = key === 'eq' ? 'Earnings Quality' : 'Balance Sheet Quality';
                  return (
                    <div key={key} style={{ flex: '1 1 180px', backgroundColor: '#f9fafb', padding: '12px 16px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['A','B','C'] as const).map((grade) => {
                          const isWinner = winner === grade;
                          return (
                            <div key={grade} data-testid={`${key}-grade-${grade}`} style={{ flex: 1, textAlign: 'center', padding: '6px', borderRadius: '4px', backgroundColor: isWinner ? '#e0f2fe' : '#f3f4f6', fontWeight: isWinner ? 700 : 400, fontSize: '0.8rem', color: isWinner ? '#0369a1' : '#6b7280' }}>
                              <div>{grade}</div>
                              <div style={{ fontSize: '0.65rem' }}>{(scores[grade] ?? 0).toFixed(0)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Section 6: Reason codes ── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Reason Codes</div>
              {data.reason_codes.length === 0 ? (
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No reason codes available</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {data.reason_codes.map((code) => (
                    <span key={code} style={{ padding: '2px 8px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 }}>
                      {code}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section 7: Classification history ── */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Classification History</div>
              {history.length === 0 ? (
                <span data-testid="history-empty-state" style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No classification history yet.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {history.map((row, i) => (
                    <div key={i} data-testid="history-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: '4px', fontSize: '0.8rem' }}>
                      <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(row.classified_at)}</span>
                      <span style={{ fontFamily: 'monospace', color: '#374151' }}>
                        {row.previous_code ?? '—'} → {row.suggested_code ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section 8: Override section ── */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
              {/* Display-only disclaimer — always visible per ADR-007 */}
              <div data-testid="override-disclaimer" style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '16px', padding: '8px 12px', backgroundColor: '#fef9c3', borderRadius: '4px', borderLeft: '3px solid #ca8a04' }}>
                Your override affects display only — alerts use the system classification.
              </div>

              {data.user_override_code ? (
                /* Has existing override */
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Your Override</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: '#111827' }}>{data.user_override_code}</span>
                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>{data.user_override_reason}</span>
                  </div>
                  <button
                    data-testid="clear-override-btn"
                    onClick={handleClear}
                    disabled={saving}
                    style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontSize: '0.8rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? '…' : 'Clear override'}
                  </button>
                </div>
              ) : (
                /* No override — show set form */
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Set My Classification</div>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                      Code <span style={{ color: '#6b7280' }}>(e.g. 4AA)</span>
                    </label>
                    <input
                      data-testid="override-code-input"
                      type="text"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      placeholder="4AA"
                      maxLength={3}
                      style={{ width: '120px', padding: '6px 10px', borderRadius: '4px', border: codeError ? '1px solid #dc2626' : '1px solid #d1d5db', fontSize: '0.875rem', fontFamily: 'monospace' }}
                    />
                    {codeError && <div data-testid="code-error" style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px' }}>{codeError}</div>}
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                      Reason <span style={{ color: '#6b7280' }}>({REASON_MIN_LENGTH}+ characters)</span>
                    </label>
                    <textarea
                      data-testid="override-reason-input"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                      rows={2}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: reasonError ? '1px solid #dc2626' : '1px solid #d1d5db', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    {reasonError && <div data-testid="reason-error" style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px' }}>{reasonError}</div>}
                  </div>
                  <button
                    data-testid="save-override-btn"
                    onClick={handleSave}
                    disabled={!saveEnabled}
                    style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #15803d', backgroundColor: saveEnabled ? '#dcfce7' : '#f3f4f6', color: saveEnabled ? '#15803d' : '#9ca3af', fontSize: '0.8rem', cursor: saveEnabled ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                  >
                    {saving ? '…' : 'Save'}
                  </button>
                </div>
              )}

              {saveError && (
                <div data-testid="save-error" style={{ marginTop: '10px', fontSize: '0.75rem', color: '#dc2626' }}>
                  {saveError}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
