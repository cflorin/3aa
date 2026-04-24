// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-003: StockDetailClient — 4-tab stock detail page (Classification/Fundamentals/Valuation/History)
// PRD §Stock Detail; RFC-001 §ClassificationResult; RFC-003 §Stock Detail Screen
// ADR-007 (display_only override scope); ADR-013 (scoring weights); ADR-014 (confidence thresholds)

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ClassificationBadge from '@/components/universe/ClassificationBadge';
import ConfidenceBadge from '@/components/universe/ConfidenceBadge';
import ClassificationModal from '@/components/universe/ClassificationModal';
import ScoreBar from './ScoreBar';
import ConfidenceSteps from './ConfidenceSteps';
import TieBreakList from './TieBreakList';
import FlagPill from './FlagPill';
import StarRating from './StarRating';
import type { ConfidenceStep, TieBreakRecord } from '@/domain/classification/types';

// ── Response shape from GET /api/stocks/[ticker]/detail ──────────────────────

interface DetailResponse {
  ticker: string;
  company: string;
  sector: string | null;
  // Classification state
  suggested_code: string | null;
  active_code: string | null;
  confidence_level: 'high' | 'medium' | 'low' | null;
  reason_codes: string[];
  scores: {
    bucket: Record<string, number>;
    eq: Record<string, number>;
    bs: Record<string, number>;
  } | null;
  confidenceBreakdown: { steps: ConfidenceStep[] } | null;
  tieBreaksFired: TieBreakRecord[];
  input_snapshot: Record<string, unknown> | null;
  classified_at: string | null;
  // Override
  final_code: string | null;
  override_reason: string | null;
  overridden_at: string | null;
  override_scope: 'display_only';
  // E1–E6
  e1_moat_strength: number | null;
  e2_pricing_power: number | null;
  e3_revenue_recurrence: number | null;
  e4_margin_durability: number | null;
  e5_capital_intensity: number | null;
  e6_qualitative_cyclicality: number | null;
  // Fundamentals
  revenue_growth_fwd: number | null;
  revenue_growth_3y: number | null;
  eps_growth_fwd: number | null;
  eps_growth_3y: number | null;
  gross_profit_growth: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  fcf_margin: number | null;
  fcf_conversion: number | null;
  roic: number | null;
  fcf_positive: boolean | null;
  net_income_positive: boolean | null;
  net_debt_to_ebitda: number | null;
  interest_coverage: number | null;
  share_count_growth_3y: number | null;
  // Market context
  market_cap: number | null;
  price: number | null;
  pe_ratio: number | null;
  ev_ebit: number | null;
  // Flags
  holding_company_flag: boolean | null;
  insurer_flag: boolean | null;
  binary_flag: boolean | null;
  cyclicality_flag: boolean | null;
  optionality_flag: boolean | null;
  pre_operating_leverage_flag: boolean | null;
  material_dilution_flag: boolean | null;
}

interface HistoryRow {
  classified_at: string;
  previous_code: string | null;
  suggested_code: string | null;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function fmtRatio(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(1)}×`;
}

function fmtMcap(val: number | null): string {
  if (val === null || val === undefined) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}T`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}B`;
  return `$${val.toFixed(0)}M`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function growthColor(val: number | null): string {
  if (val === null) return '#374151';
  if (val >= 0.08) return '#15803d';
  if (val >= 0.03) return '#854d0e';
  return '#dc2626';
}

function netDebtColor(val: number | null): string {
  if (val === null) return '#374151';
  if (val <= 1.0) return '#15803d';
  if (val <= 2.5) return '#854d0e';
  return '#dc2626';
}

function fcfConvColor(val: number | null): string {
  if (val === null) return '#374151';
  if (val >= 0.80) return '#15803d';
  if (val >= 0.50) return '#854d0e';
  return '#dc2626';
}

// ── Shared style constants ────────────────────────────────────────────────────

const SECTION_HEADER: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6b7280',
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
  borderTop: '1px solid #e5e7eb',
};

// ── MetricRow ─────────────────────────────────────────────────────────────────

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: color ?? '#111827' }}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface StockDetailClientProps {
  ticker: string;
}

type Tab = 'classification' | 'fundamentals' | 'valuation' | 'history';

export default function StockDetailClient({ ticker }: StockDetailClientProps) {
  const router = useRouter();

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('classification');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [clearingOverride, setClearingOverride] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  // Classification-tab local code overlay (for optimistic override updates without full refetch)
  const [activeCodeOverlay, setActiveCodeOverlay] = useState<string | null | undefined>(undefined);

  // History tab lazy data
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/${ticker}/detail`);
      if (res.status === 404) {
        setError('Stock not found or not in universe.');
        setDetail(null);
        return;
      }
      if (!res.ok) {
        setError('Failed to load stock data.');
        setDetail(null);
        return;
      }
      const data: DetailResponse = await res.json();
      setDetail(data);
      setActiveCodeOverlay(undefined); // clear any overlay on fresh load
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  useEffect(() => {
    if (activeTab !== 'history' || history !== null) return;
    setHistoryLoading(true);
    fetch(`/api/stocks/${ticker}/classification/history`)
      .then(r => r.json())
      .then((data: { history: HistoryRow[] }) => setHistory(data.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [activeTab, ticker, history]);

  function handleOverrideChange(_t: string, newCode: string | null) {
    setActiveCodeOverlay(newCode);
  }

  async function handleClearOverride() {
    setClearingOverride(true);
    setClearError(null);
    const prev = detail?.final_code ?? null;
    // optimistic
    setDetail(d => d ? { ...d, final_code: null, override_reason: null, overridden_at: null, active_code: d.suggested_code } : d);
    setActiveCodeOverlay(undefined);
    const res = await fetch(`/api/classification-override/${ticker}`, { method: 'DELETE' });
    if (!res.ok) {
      // revert
      setDetail(d => d ? { ...d, final_code: prev } : d);
      setClearError('Failed to clear override. Please try again.');
    }
    setClearingOverride(false);
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading stock data…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}
        data-testid="error-state"
      >
        {error ?? 'Unable to load stock data.'}
      </div>
    );
  }

  const activeCode = activeCodeOverlay !== undefined ? activeCodeOverlay : detail.active_code;
  const scores = detail.scores;
  const steps = detail.confidenceBreakdown?.steps ?? [];

  // Winning bucket/EQ/BS for score bar highlighting
  const winnerBucket = scores
    ? (Object.entries(scores.bucket).reduce<[string, number]>(
        (a, b) => b[1] > a[1] ? b : a, ['0', -Infinity]
      ))[0]
    : null;
  const winnerEq = scores
    ? (Object.entries(scores.eq).reduce<[string, number]>(
        (a, b) => b[1] > a[1] ? b : a, ['?', -Infinity]
      ))[0]
    : null;
  const winnerBs = scores
    ? (Object.entries(scores.bs).reduce<[string, number]>(
        (a, b) => b[1] > a[1] ? b : a, ['?', -Infinity]
      ))[0]
    : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'classification', label: 'Classification' },
    { id: 'fundamentals', label: 'Fundamentals' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'history', label: 'History' },
  ];

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => router.push('/universe')}
          data-testid="back-to-universe"
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#15803d',
            fontSize: 13,
            padding: 0,
            fontWeight: 600,
          }}
        >
          ← Universe
        </button>
        <div style={{ width: 1, height: 16, background: '#e5e7eb' }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#111827' }}>{detail.ticker}</span>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{detail.company}</span>
          {detail.sector && <span style={{ fontSize: 11, color: '#9ca3af' }}>{detail.sector}</span>}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {detail.price !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>
                ${detail.price.toFixed(2)}
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Active Code</div>
            <ClassificationBadge code={activeCode} />
          </div>
          {detail.confidence_level && (
            <ConfidenceBadge confidence={detail.confidence_level} />
          )}
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        paddingLeft: 16,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: activeTab === tab.id ? '#15803d' : '#6b7280',
              borderBottom: `2px solid ${activeTab === tab.id ? '#15803d' : 'transparent'}`,
              fontWeight: activeTab === tab.id ? 600 : 400,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1 }}>

        {/* ── CLASSIFICATION TAB ─────────────────────────────────────────── */}
        {activeTab === 'classification' && (
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>

            {/* Left: Scores column */}
            <div style={{ flex: '0 0 300px', minWidth: 260, borderRight: '1px solid #e5e7eb' }}>
              {/* Active code block */}
              <div style={{ padding: '16px 14px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={SECTION_HEADER}>Active Code</div>
                <div style={{ padding: '12px 0', display: 'flex', gap: 24, alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>System Suggested</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: '#15803d' }}>
                      {detail.suggested_code ?? '—'}
                    </div>
                    {detail.confidence_level && (
                      <div style={{ marginTop: 4 }}>
                        <ConfidenceBadge confidence={detail.confidence_level} />
                      </div>
                    )}
                  </div>
                  {detail.final_code && (
                    <div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Your Override</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: '#f97316' }}>
                        {detail.final_code}
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>display only</div>
                    </div>
                  )}
                </div>
                {detail.classified_at && (
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    Classified {fmtDate(detail.classified_at)}
                  </div>
                )}
                {!detail.suggested_code && !detail.classified_at && (
                  <div style={{ fontSize: 12, color: '#6b7280' }} data-testid="no-classification-message">
                    No classification computed yet.
                  </div>
                )}
              </div>

              {/* Bucket scores */}
              {scores && (
                <div style={{ padding: '14px' }}>
                  <div style={SECTION_HEADER}>Bucket Scores</div>
                  <div style={{ paddingTop: 10 }}>
                    {Object.entries(scores.bucket).map(([bucket, score]) => (
                      <ScoreBar
                        key={bucket}
                        label={bucket}
                        value={score}
                        highlight={bucket === winnerBucket}
                        data-testid={`bucket-score-${bucket}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* EQ scores */}
              {scores && scores.eq && Object.keys(scores.eq).length > 0 && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={SECTION_HEADER}>Earnings Quality Scores</div>
                  <div style={{ paddingTop: 10 }}>
                    {Object.entries(scores.eq).map(([grade, score]) => (
                      <ScoreBar
                        key={grade}
                        label={grade}
                        value={score}
                        highlight={grade === winnerEq}
                        data-testid={`eq-score-${grade}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* BS scores */}
              {scores && scores.bs && Object.keys(scores.bs).length > 0 && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={SECTION_HEADER}>Balance Sheet Quality Scores</div>
                  <div style={{ paddingTop: 10 }}>
                    {Object.entries(scores.bs).map(([grade, score]) => (
                      <ScoreBar
                        key={grade}
                        label={grade}
                        value={score}
                        highlight={grade === winnerBs}
                        data-testid={`bs-score-${grade}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Confidence + Tie-breaks + Input Snapshot + Enrichment + Reason codes + Override */}
            <div style={{ flex: 1, minWidth: 0 }}>

              {/* Confidence derivation */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={SECTION_HEADER}>Confidence Derivation (ADR-014)</div>
                <div style={{ paddingTop: 10 }}>
                  <ConfidenceSteps steps={steps} />
                </div>
              </div>

              {/* Tie-break analysis */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={SECTION_HEADER}>Tie-Break Analysis</div>
                <div style={{ paddingTop: 10 }}>
                  <TieBreakList tieBreaksFired={detail.tieBreaksFired ?? []} />
                </div>
              </div>

              {/* Input snapshot */}
              {detail.input_snapshot && (
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={SECTION_HEADER}>Input Snapshot</div>
                  <div style={{
                    marginTop: 10,
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 4,
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 2,
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}>
                    {Object.entries(detail.input_snapshot).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 6, padding: '2px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                        <span style={{
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: v === null ? '#9ca3af' : v === true ? '#15803d' : v === false ? '#dc2626' : '#111827',
                          fontWeight: v !== null ? 600 : 400,
                          flexShrink: 0,
                        }}>
                          {v === null ? 'null' : v === true ? 'true' : v === false ? 'false' : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* E1–E6 enrichment */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={SECTION_HEADER}>LLM Enrichment Scores (E1–E6)</div>
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {([
                    { label: 'E1 Moat Strength', val: detail.e1_moat_strength, testId: 'e1-moat-strength' },
                    { label: 'E2 Pricing Power', val: detail.e2_pricing_power, testId: 'e2-pricing-power' },
                    { label: 'E3 Revenue Recurrence', val: detail.e3_revenue_recurrence, testId: 'e3-revenue-recurrence' },
                    { label: 'E4 Margin Durability', val: detail.e4_margin_durability, testId: 'e4-margin-durability' },
                    { label: 'E5 Capital Intensity', val: detail.e5_capital_intensity, testId: 'e5-capital-intensity' },
                    { label: 'E6 Qualitative Cyclicality', val: detail.e6_qualitative_cyclicality, testId: 'e6-qualitative-cyclicality' },
                  ] as { label: string; val: number | null; testId: string }[]).map(({ label, val, testId }) => (
                    <div key={label} style={{ padding: '8px 10px', background: '#f9fafb', borderRadius: 4, border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 5 }}>{label}</div>
                      <StarRating value={val} data-testid={testId} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Reason codes */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={SECTION_HEADER}>Reason Codes</div>
                <div style={{ marginTop: 10 }}>
                  {(detail.reason_codes ?? []).length === 0 ? (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>No reason codes available.</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {detail.reason_codes.map(r => (
                        <span key={r} style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: '#f0fdf4',
                          color: '#15803d',
                          border: '1px solid #bbf7d0',
                          fontWeight: 500,
                        }}>
                          {r.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Override section */}
              <div style={{ padding: '14px 16px' }}>
                <div style={SECTION_HEADER}>Classification Override</div>
                <div style={{ marginTop: 10 }}>
                  {/* Disclaimer — always visible */}
                  <div
                    data-testid="override-disclaimer"
                    style={{
                      padding: '10px 12px',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: 4,
                      marginBottom: 12,
                      fontSize: 12,
                      color: '#1d4ed8',
                      display: 'flex',
                      gap: 6,
                    }}
                  >
                    <span>ℹ</span>
                    <span>Your override affects display only — alerts always use the system classification.</span>
                  </div>

                  {detail.final_code && (
                    <div style={{
                      padding: '10px 12px',
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      borderRadius: 4,
                      marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Current Override</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#f97316' }}>
                        {detail.final_code}
                      </div>
                      {detail.override_reason && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{detail.override_reason}</div>
                      )}
                      {detail.overridden_at && (
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Set {fmtDate(detail.overridden_at)}</div>
                      )}
                    </div>
                  )}

                  {clearError && (
                    <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{clearError}</div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      data-testid="set-override-btn"
                      onClick={() => setShowOverrideModal(true)}
                      style={{
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid #86efac',
                        background: '#f0fdf4',
                        color: '#15803d',
                        cursor: 'pointer',
                      }}
                    >
                      {detail.final_code ? 'Edit Override' : 'Set Override'}
                    </button>
                    {detail.final_code && (
                      <button
                        data-testid="clear-override-btn"
                        onClick={handleClearOverride}
                        disabled={clearingOverride}
                        style={{
                          padding: '8px 12px',
                          fontSize: 12,
                          borderRadius: 4,
                          border: '1px solid #fca5a5',
                          background: '#fef2f2',
                          color: '#dc2626',
                          cursor: clearingOverride ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {clearingOverride ? 'Clearing…' : 'Clear Override'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FUNDAMENTALS TAB ───────────────────────────────────────────── */}
        {activeTab === 'fundamentals' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>

            {/* Growth & Margins column */}
            <div style={{ borderRight: '1px solid #e5e7eb' }}>
              <div style={SECTION_HEADER}>Growth</div>
              <MetricRow label="Rev Growth (Fwd)" value={fmtPct(detail.revenue_growth_fwd)} color={growthColor(detail.revenue_growth_fwd)} />
              <MetricRow label="Rev Growth 3Y CAGR" value={fmtPct(detail.revenue_growth_3y)} color={growthColor(detail.revenue_growth_3y)} />
              <MetricRow label="EPS Growth (Fwd)" value={fmtPct(detail.eps_growth_fwd)} color={growthColor(detail.eps_growth_fwd)} />
              <MetricRow label="EPS Growth 3Y CAGR" value={fmtPct(detail.eps_growth_3y)} color={growthColor(detail.eps_growth_3y)} />
              <MetricRow label="Gross Profit Growth" value={fmtPct(detail.gross_profit_growth)} color={growthColor(detail.gross_profit_growth)} />

              <div style={SECTION_HEADER}>Margins</div>
              <MetricRow label="Gross Margin" value={fmtPct(detail.gross_margin)} color={growthColor(detail.gross_margin)} />
              <MetricRow label="Operating Margin" value={fmtPct(detail.operating_margin)} color={growthColor(detail.operating_margin)} />
              <MetricRow label="FCF Margin" value={fmtPct(detail.fcf_margin)} color={growthColor(detail.fcf_margin)} />
            </div>

            {/* Quality & Balance Sheet column */}
            <div style={{ borderRight: '1px solid #e5e7eb' }}>
              <div style={SECTION_HEADER}>Returns & Quality</div>
              <MetricRow label="FCF Conversion" value={fmtPct(detail.fcf_conversion)} color={fcfConvColor(detail.fcf_conversion)} />
              <MetricRow label="ROIC" value={fmtPct(detail.roic)} color={growthColor(detail.roic)} />
              <MetricRow label="Net Income Positive" value={detail.net_income_positive === null ? '—' : detail.net_income_positive ? 'Yes' : 'No'} />
              <MetricRow label="FCF Positive" value={detail.fcf_positive === null ? '—' : detail.fcf_positive ? 'Yes' : 'No'} />

              <div style={SECTION_HEADER}>Balance Sheet</div>
              <MetricRow label="Net Debt / EBITDA" value={fmtRatio(detail.net_debt_to_ebitda)} color={netDebtColor(detail.net_debt_to_ebitda)} />
              <MetricRow label="Interest Coverage" value={detail.interest_coverage !== null ? `${detail.interest_coverage.toFixed(1)}×` : '—'} />
              <MetricRow label="Share Count Growth 3Y" value={fmtPct(detail.share_count_growth_3y)} />

              <div style={SECTION_HEADER}>Market Context</div>
              <MetricRow label="Market Cap" value={fmtMcap(detail.market_cap)} />
              <MetricRow label="Price" value={detail.price !== null ? `$${detail.price.toFixed(2)}` : '—'} />
              <MetricRow label="P/E Ratio" value={detail.pe_ratio !== null ? `${detail.pe_ratio.toFixed(1)}×` : '—'} />
              <MetricRow label="EV/EBIT" value={detail.ev_ebit !== null ? `${detail.ev_ebit.toFixed(1)}×` : '—'} />
            </div>

            {/* Flags column */}
            <div>
              <div style={SECTION_HEADER}>Classification Flags</div>
              {([
                'holding_company_flag',
                'insurer_flag',
                'binary_flag',
                'cyclicality_flag',
                'optionality_flag',
                'pre_operating_leverage_flag',
                'material_dilution_flag',
              ] as const).map(flag => (
                <FlagPill
                  key={flag}
                  flag={flag}
                  value={(detail as unknown as Record<string, boolean | null>)[flag]}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── VALUATION TAB ──────────────────────────────────────────────── */}
        {activeTab === 'valuation' && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}
            data-testid="valuation-placeholder"
          >
            Valuation thresholds and TSR hurdles are available in a future update.
          </div>
        )}

        {/* ── HISTORY TAB ────────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div style={{ padding: '16px', maxWidth: 700 }}>
            <div style={SECTION_HEADER}>Classification History</div>
            <div style={{ paddingTop: 10 }}>
              {historyLoading && (
                <div style={{ color: '#9ca3af', fontSize: 12 }}>Loading history…</div>
              )}
              {!historyLoading && history !== null && history.length === 0 && (
                <div
                  data-testid="history-empty-state"
                  style={{ fontSize: 12, color: '#6b7280', padding: '24px 0' }}
                >
                  No classification history recorded yet.
                </div>
              )}
              {!historyLoading && history !== null && history.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {history.map((h, i) => (
                    <div
                      key={i}
                      data-testid={`history-row-${i}`}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid #f3f4f6',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: i === 0 ? '#15803d' : '#9ca3af',
                      }} />
                      <div style={{ width: 90, flexShrink: 0, fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                        {fmtDate(h.classified_at)}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: h.previous_code ? '#6b7280' : '#9ca3af' }}>
                          {h.previous_code ?? 'null'}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>→</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: i === 0 ? '#15803d' : '#111827' }}>
                          {h.suggested_code ?? 'null'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Related alerts placeholder */}
            <div style={{ marginTop: 28 }}>
              <div style={SECTION_HEADER}>Related Alerts</div>
              <div
                data-testid="alerts-placeholder"
                style={{ paddingTop: 10, fontSize: 12, color: '#9ca3af' }}
              >
                Alert history available in a future update.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Override modal (reuses STORY-051 ClassificationModal) */}
    {showOverrideModal && (
      <ClassificationModal
        ticker={detail.ticker}
        companyName={detail.company}
        sector={detail.sector}
        onClose={() => setShowOverrideModal(false)}
        onOverrideChange={handleOverrideChange}
      />
    )}
    </>
  );
}
