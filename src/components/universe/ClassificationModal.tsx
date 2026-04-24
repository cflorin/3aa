// EPIC-004: Classification Engine & Universe Screen
// STORY-051: Classification Override Modal
// TASK-051-002: ClassificationModal — full classification detail, history, and override UI
// EPIC-004/STORY-054/TASK-054-007: Applied dark terminal theme (screen-universe.jsx ClassificationModal spec)
// PRD §Screen 2 — Classification Detail, §Override UI
// RFC-003 §Classification Override Modal; RFC-001 §ClassificationResult; ADR-007 (display_only override scope)

'use client';

import React, { useEffect, useRef, useState } from 'react';
import ConfidenceBadge from './ConfidenceBadge';
import { T } from '@/lib/theme';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function winningBucket(scores: Record<string, number>): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = k; }
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

  const [bucketSel, setBucketSel] = useState('4');
  const [eqSel, setEqSel] = useState('A');
  const [bsSel, setBsSel] = useState('A');
  const [reasonInput, setReasonInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const composedCode = `${bucketSel}${eqSel}${bsSel}`;

  const triggerRef = useRef<Element | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const focusable = modalRef.current?.querySelector<HTMLElement>(
      'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    return () => { (triggerRef.current as HTMLElement | null)?.focus(); };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
          if (classData.user_override_code) {
            const oc = classData.user_override_code;
            setBucketSel(oc[0] ?? '4');
            setEqSel(oc[1] ?? 'A');
            setBsSel(oc[2] ?? 'A');
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

  async function handleSave() {
    if (reasonInput.length < REASON_MIN_LENGTH) {
      setReasonError(`Reason must be at least ${REASON_MIN_LENGTH} characters`);
      return;
    }
    setReasonError(null);

    setSaving(true);
    setSaveError(null);
    const prevCode = data?.active_code ?? null;
    onOverrideChange(ticker, composedCode);

    try {
      const res = await fetch('/api/classification-override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticker, final_code: composedCode, override_reason: reasonInput }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      onOverrideChange(ticker, result.active_code);
      setData(prev => prev ? {
        ...prev,
        user_override_code: composedCode,
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

  async function handleClear() {
    setSaving(true);
    setSaveError(null);
    const prevCode = data?.active_code ?? null;
    const systemCode = data?.system_suggested_code ?? null;
    onOverrideChange(ticker, systemCode);
    try {
      const res = await fetch(`/api/classification-override/${ticker}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setData(prev => prev ? {
        ...prev, user_override_code: null, user_override_reason: null, active_code: systemCode,
      } : prev);
      setBucketSel('4');
      setEqSel('A');
      setBsSel('A');
      setReasonInput('');
    } catch {
      onOverrideChange(ticker, prevCode);
      setSaveError('Failed to clear override. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const reasonValid = reasonInput.length >= REASON_MIN_LENGTH;
  const saveEnabled = reasonValid && !saving;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 1000, display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '4rem', overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Classification detail for ${ticker}`}
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          width: '100%',
          maxWidth: 600,
          margin: '0 1rem 4rem',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '16px 20px 14px', borderBottom: `1px solid ${T.border}`,
          background: T.sidebarBg,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-dm-mono, monospace)', color: T.text }}>{ticker}</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{companyName}</div>
            {sector && <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{sector}</div>}
          </div>
          <button
            onClick={onClose}
            data-testid="modal-close-btn"
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: T.textDim, padding: '0 0 0 16px', lineHeight: 1, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        {loadState === 'loading' && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: T.textDim }}>Loading classification…</div>
        )}

        {loadState === 'error' && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#ef4444' }}>Failed to load classification. Please try again.</div>
        )}

        {loadState === 'ready' && data && (
          <div style={{ padding: 20 }}>

            {/* Active code + system suggestion */}
            <div style={{ background: T.sidebarBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>System Suggested</div>
                  <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 24, fontWeight: 800, color: T.accent }}>
                    {data.system_suggested_code ?? '—'}
                  </div>
                  <div style={{ marginTop: 4 }}><ConfidenceBadge confidence={data.system_confidence} /></div>
                  {data.classified_at && (
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>{fmtDate(data.classified_at)}</div>
                  )}
                </div>
                {data.user_override_code && (
                  <div>
                    <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>Your Override (active)</div>
                    <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 24, fontWeight: 800, color: '#f97316' }}>
                      {data.user_override_code}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Score breakdown — 3-column bar chart grid per spec */}
            {data.scores && (
              <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { label: 'Bucket Scores', entries: (['1','2','3','4','5','6','7','8']).map(b => ({ key: b, score: data.scores!.bucket[b] ?? 0 })), topKey: winningBucket(data.scores.bucket) },
                  { label: 'Earnings Quality', entries: (['A','B','C']).map(g => ({ key: g, score: data.scores!.eq[g] ?? 0 })), topKey: winningGrade(data.scores.eq) },
                  { label: 'Balance Sheet', entries: (['A','B','C']).map(g => ({ key: g, score: data.scores!.bs[g] ?? 0 })), topKey: winningGrade(data.scores.bs) },
                ]).map(({ label, entries, topKey }) => (
                  <div key={label} style={{ background: T.sidebarBg, border: `1px solid ${T.borderFaint}`, borderRadius: 4, padding: '10px' }}>
                    <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
                    {entries.map(({ key, score }) => {
                      const isTop = key === topKey;
                      return (
                        <div key={key} data-testid={label === 'Bucket Scores' ? `bucket-score-${key}` : undefined} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-dm-mono, monospace)', width: 14, color: isTop ? T.accent : T.textDim, fontWeight: isTop ? 700 : 400 }}>{key}</span>
                          <div style={{ flex: 1, height: 7, background: T.borderFaint, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 2, width: `${score}%`, background: isTop ? T.accent + 'bb' : T.textDim + '44' }} />
                          </div>
                          <span style={{ fontSize: 9, color: isTop ? T.text : T.textDim, width: 22, textAlign: 'right' }}>{score}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Reason codes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Reason Codes</div>
              {data.reason_codes.length === 0 ? (
                <span style={{ fontSize: 11, color: T.textDim }}>No reason codes available</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {data.reason_codes.map((code) => (
                    <span key={code} style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 3,
                      background: T.accent + '15', color: T.accent, border: `1px solid ${T.accent}30`,
                    }}>
                      {code.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Classification history */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Classification History</div>
              {history.length === 0 ? (
                <span data-testid="history-empty-state" style={{ fontSize: 11, color: T.textDim }}>No classification history yet.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {history.map((row, i) => (
                    <div key={i} data-testid="history-row" style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 0', borderBottom: `1px solid ${T.borderFaint}`, fontSize: 11,
                    }}>
                      <span style={{ color: T.textDim, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, width: 82 }}>{fmtDate(row.classified_at)}</span>
                      <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: T.textMuted }}>{row.previous_code ?? 'null'}</span>
                      <span style={{ color: T.textDim }}>→</span>
                      <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: T.text, fontWeight: 600 }}>{row.suggested_code ?? 'null'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Override section */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 10 }}>
                {data.user_override_code ? 'Edit Your Override' : 'Set My Classification'}
              </div>

              <div
                data-testid="override-disclaimer"
                style={{
                  marginBottom: 12, padding: '8px 10px',
                  background: '#3b82f618', border: '1px solid #3b82f630',
                  borderRadius: 4, fontSize: 10, color: '#93c5fd',
                  display: 'flex', gap: 6,
                }}
              >
                <span>ℹ</span>
                <span>Your override affects display only — alerts use the system classification.</span>
              </div>

              {data.user_override_code ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontWeight: 700, fontSize: 16, color: '#f97316' }}>{data.user_override_code}</span>
                    <span style={{ fontSize: 12, color: T.textMuted }}>{data.user_override_reason}</span>
                  </div>
                  <button
                    data-testid="clear-override-btn"
                    onClick={handleClear}
                    disabled={saving}
                    style={{
                      padding: '6px 12px', borderRadius: 4,
                      border: '1px solid #ef444444', background: '#ef444412',
                      color: '#ef4444', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1, fontFamily: 'inherit',
                    }}
                  >
                    {saving ? '…' : 'Clear override'}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
                    {([
                      { label: 'Bucket', opts: ['1','2','3','4','5','6','7','8'], val: bucketSel, set: setBucketSel, testId: 'override-bucket-select' },
                      { label: 'Earnings Quality', opts: ['A','B','C'], val: eqSel, set: setEqSel, testId: 'override-eq-select' },
                      { label: 'Balance Sheet', opts: ['A','B','C'], val: bsSel, set: setBsSel, testId: 'override-bs-select' },
                    ] as { label: string; opts: string[]; val: string; set: (v: string) => void; testId: string }[]).map(({ label, opts, val, set, testId }) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>{label}</div>
                        <select
                          data-testid={testId}
                          value={val}
                          onChange={e => set(e.target.value)}
                          style={{ background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, fontSize: 12, padding: '5px 8px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', width: 58 }}
                        >
                          {opts.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                    <div style={{ paddingBottom: 2 }}>
                      <span data-testid="override-code-preview" style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 22, fontWeight: 800, color: T.accent }}>{composedCode}</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 10, color: T.textDim, marginBottom: 4 }}>
                      Override Reason <span style={{ color: '#ef4444' }}>*</span>
                      <span style={{ color: T.textDim, marginLeft: 6 }}>min {REASON_MIN_LENGTH} characters</span>
                    </label>
                    <textarea
                      data-testid="override-reason-input"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                      placeholder="Explain your classification judgment…"
                      rows={3}
                      style={{
                        width: '100%', padding: '7px 10px', borderRadius: 4,
                        border: `1px solid ${reasonError ? '#ef4444' : T.border}`,
                        background: T.inputBg, color: T.text,
                        fontSize: 12, resize: 'vertical', fontFamily: 'inherit',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    {reasonError && <div data-testid="reason-error" style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>{reasonError}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={onClose}
                      style={{
                        padding: '7px 14px', fontSize: 12, borderRadius: 4,
                        border: `1px solid ${T.border}`, background: 'transparent',
                        color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      data-testid="save-override-btn"
                      onClick={handleSave}
                      disabled={!saveEnabled}
                      style={{
                        padding: '7px 18px', fontSize: 12, borderRadius: 4, fontWeight: 600,
                        border: 'none',
                        background: saveEnabled ? T.accent : T.borderFaint,
                        color: saveEnabled ? '#0b0d11' : T.textDim,
                        cursor: saveEnabled ? 'pointer' : 'not-allowed',
                        transition: 'all 0.1s', fontFamily: 'inherit',
                      }}
                    >
                      {saving ? '…' : 'Save Override'}
                    </button>
                  </div>
                </div>
              )}

              {saveError && (
                <div data-testid="save-error" style={{ marginTop: 10, fontSize: 11, color: '#ef4444' }}>
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
