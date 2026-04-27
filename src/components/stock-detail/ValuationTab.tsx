// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-079: Stock Detail Page: Valuation Tab
// TASK-079-001: ValuationTab — zone badge, gauge, TSR hurdle, override panel
// EPIC-008/STORY-095/TASK-095-003: Added Valuation Regime section (RegimeBadge, CyclePositionBadge)

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/theme';
import RegimeBadge from '@/components/valuation/RegimeBadge';
import CyclePositionBadge from '@/components/valuation/CyclePositionBadge';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValuationResult {
  activeCode: string;
  primaryMetric: string;
  metricReason: string;
  currentMultiple: number | null;
  currentMultipleBasis: string;
  metricSource: string;
  maxThreshold: number | null;
  comfortableThreshold: number | null;
  veryGoodThreshold: number | null;
  stealThreshold: number | null;
  thresholdSource: string;
  derivedFromCode: string | null;
  thresholdAdjustments: string[];
  baseTsrHurdleLabel: string;
  baseTsrHurdleDefault: number | null;
  adjustedTsrHurdle: number | null;
  hurdleSource: string;
  tsrReasonCodes: string[];
  valuationZone: string;
  valuationStateStatus: string;
  grossMarginAdjustmentApplied: boolean;
  dilutionAdjustmentApplied: boolean;
  cyclicalityContextFlag: boolean;
  // EPIC-008/STORY-095: Regime-driven output fields
  valuationRegime?: string | null;
  growthTier?: string | null;
  thresholdFamily?: string | null;
  structuralCyclicalityScoreSnapshot?: number | null;
  cyclePositionSnapshot?: string | null;
  cyclicalOverlayApplied?: boolean | null;
  cyclicalOverlayValue?: number | null;
}

interface SystemState {
  ticker: string;
  activeCode: string;
  valuationZone: string;
  valuationStateStatus: string;
  maxThreshold: string | null;
  comfortableThreshold: string | null;
  veryGoodThreshold: string | null;
  stealThreshold: string | null;
}

interface UserOverride {
  maxThreshold: string | null;
  comfortableThreshold: string | null;
  veryGoodThreshold: string | null;
  stealThreshold: string | null;
  primaryMetricOverride: string | null;
  forwardOperatingEarningsExExcessCash: string | null;
  notes: string | null;
}

interface ValuationApiResponse {
  ticker: string;
  systemState: SystemState | null;
  userResult: ValuationResult | null;
  hasUserOverride: boolean;
  userOverride: UserOverride | null;
}

interface HistoryRow {
  id: string;
  valuationZone: string;
  previousZone: string | null;
  computedAt: string;
}

// ── Zone badge ────────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  steal_zone: '#34d399',        // emerald-400
  very_good_zone: '#4ade80',    // green-400
  comfortable_zone: '#facc15',  // yellow-400
  max_zone: '#fb923c',          // orange-400
  above_max: '#f87171',         // red-400
  not_applicable: '#71717a',    // zinc-500
};

const ZONE_LABELS: Record<string, string> = {
  steal_zone: 'Steal Zone',
  very_good_zone: 'Very Good',
  comfortable_zone: 'Comfortable',
  max_zone: 'At Max',
  above_max: 'Above Max',
  not_applicable: 'N/A',
};

// EPIC-008/STORY-089/TASK-089-005: canonical 5-state vocabulary
const STATUS_LABELS: Record<string, string> = {
  computed: 'Computed',
  manual_required: 'Manual Input Required',
  not_applicable: 'Not Applicable',
  classification_required: 'Classification Required',
  stale: 'Stale',
  // Backward-compat: keep old labels so existing DB values render gracefully
  ready: 'Computed',
  missing_data: 'Manual Input Required',
};

function ZoneBadge({ zone }: { zone: string }) {
  const color = ZONE_COLORS[zone] ?? '#71717a';
  const label = ZONE_LABELS[zone] ?? zone;
  return (
    <span
      data-testid="zone-badge"
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 700,
        color,
        background: color + '20',
        border: `1px solid ${color}50`,
        fontFamily: 'var(--font-dm-mono, monospace)',
      }}
    >
      {label}
    </span>
  );
}

// ── Threshold gauge ───────────────────────────────────────────────────────────

function ThresholdGauge({ result }: { result: ValuationResult }) {
  const { currentMultiple, stealThreshold, veryGoodThreshold, comfortableThreshold, maxThreshold } = result;

  if (stealThreshold == null || veryGoodThreshold == null || comfortableThreshold == null || maxThreshold == null) {
    return <div data-testid="gauge-unavailable" style={{ fontSize: 12, color: T.textDim, padding: '16px 0' }}>Gauge unavailable — thresholds not set</div>;
  }

  // Scale: steal → max × 1.2 (20% right margin)
  const rangeMin = Math.min(stealThreshold * 0.85, (currentMultiple ?? stealThreshold) * 0.9);
  const rangeMax = maxThreshold * 1.2;
  const toPos = (v: number) => `${((v - rangeMin) / (rangeMax - rangeMin)) * 100}%`;

  const thresholds = [
    { val: stealThreshold, label: `${stealThreshold.toFixed(1)}× steal`, zone: 'steal_zone' },
    { val: veryGoodThreshold, label: `${veryGoodThreshold.toFixed(1)}× vg`, zone: 'very_good_zone' },
    { val: comfortableThreshold, label: `${comfortableThreshold.toFixed(1)}× comfortable`, zone: 'comfortable_zone' },
    { val: maxThreshold, label: `${maxThreshold.toFixed(1)}× max`, zone: 'max_zone' },
  ];

  return (
    <div data-testid="threshold-gauge" style={{ marginTop: 16, marginBottom: 8 }}>
      <div style={{ position: 'relative', height: 32, background: T.sidebarBg, borderRadius: 4, border: `1px solid ${T.border}` }}>
        {/* Zone band highlighting */}
        {thresholds.map((t, i) => {
          const nextVal = thresholds[i + 1]?.val ?? rangeMax;
          const left = toPos(t.val);
          const width = `${((nextVal - t.val) / (rangeMax - rangeMin)) * 100}%`;
          const isActive = result.valuationZone === t.zone;
          return (
            <div
              key={t.zone}
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left, width,
                background: isActive ? ZONE_COLORS[t.zone] + '30' : 'transparent',
              }}
            />
          );
        })}

        {/* Threshold lines */}
        {thresholds.map(t => (
          <div
            key={t.val}
            style={{
              position: 'absolute', top: 0, bottom: 0, left: toPos(t.val),
              width: 1, background: T.border,
            }}
          />
        ))}

        {/* Current multiple line */}
        {currentMultiple != null && (
          <div
            data-testid="current-multiple-line"
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: toPos(Math.max(rangeMin, Math.min(currentMultiple, rangeMax))),
              width: 2, background: '#60a5fa',
            }}
          />
        )}
      </div>

      {/* Threshold labels */}
      <div style={{ position: 'relative', height: 20 }}>
        {thresholds.map(t => (
          <span
            key={t.val}
            style={{
              position: 'absolute',
              left: toPos(t.val),
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: T.textDim,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {currentMultiple != null && (
        <div style={{ fontSize: 10, color: '#60a5fa', marginTop: 4 }}>
          Current: {currentMultiple.toFixed(1)}×
          {result.currentMultipleBasis === 'trailing_fallback' && (
            <span style={{ color: T.textDim }}> (trailing fallback)</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ValuationTabProps {
  ticker: string;
  holdingCompanyFlag: boolean;
  insurerFlag: boolean;
  // STORY-097: Forward EV/EBITDA; null when FMP did not provide D&A estimate
  forwardEvEbitda?: number | null;
}

export default function ValuationTab({ ticker, holdingCompanyFlag, insurerFlag, forwardEvEbitda }: ValuationTabProps) {
  const [data, setData] = useState<ValuationApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // History
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  // Override form state
  const [showOverride, setShowOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    maxThreshold: '', comfortableThreshold: '', veryGoodThreshold: '', stealThreshold: '',
    primaryMetricOverride: '',
    forwardOperatingEarningsExExcessCash: '',
    notes: '',
  });
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [clearingOverride, setClearingOverride] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/${ticker}/valuation`);
      if (!res.ok) {
        if (res.status === 404) {
          setData({ ticker, systemState: null, userResult: null, hasUserOverride: false, userOverride: null });
        } else {
          setError('Failed to load valuation data.');
        }
        return;
      }
      const body: ValuationApiResponse = await res.json();
      setData(body);

      // Pre-fill override form if override exists
      if (body.userOverride) {
        const ov = body.userOverride;
        setOverrideForm({
          maxThreshold: ov.maxThreshold ?? '',
          comfortableThreshold: ov.comfortableThreshold ?? '',
          veryGoodThreshold: ov.veryGoodThreshold ?? '',
          stealThreshold: ov.stealThreshold ?? '',
          primaryMetricOverride: ov.primaryMetricOverride ?? '',
          forwardOperatingEarningsExExcessCash: ov.forwardOperatingEarningsExExcessCash ?? '',
          notes: ov.notes ?? '',
        });
      }
    } catch {
      setError('Failed to load valuation data.');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/${ticker}/valuation/history`);
      if (!res.ok) return;
      const body: { history: HistoryRow[] } = await res.json();
      setHistory(body.history ?? []);
    } catch {
      setHistory([]);
    }
  }, [ticker]);

  useEffect(() => { fetchData(); fetchHistory(); }, [fetchData, fetchHistory]);

  async function handleSaveOverride() {
    setSavingOverride(true);
    setOverrideError(null);
    const body: Record<string, unknown> = {};

    const hasThresholds = overrideForm.maxThreshold || overrideForm.comfortableThreshold ||
      overrideForm.veryGoodThreshold || overrideForm.stealThreshold;
    if (hasThresholds) {
      body.maxThreshold = parseFloat(overrideForm.maxThreshold);
      body.comfortableThreshold = parseFloat(overrideForm.comfortableThreshold);
      body.veryGoodThreshold = parseFloat(overrideForm.veryGoodThreshold);
      body.stealThreshold = parseFloat(overrideForm.stealThreshold);
    }
    if (overrideForm.primaryMetricOverride) body.primaryMetricOverride = overrideForm.primaryMetricOverride;
    if (overrideForm.forwardOperatingEarningsExExcessCash) {
      body.forwardOperatingEarningsExExcessCash = parseFloat(overrideForm.forwardOperatingEarningsExExcessCash);
    }
    if (overrideForm.notes) body.notes = overrideForm.notes;

    const res = await fetch(`/api/stocks/${ticker}/valuation/override`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      setOverrideError(err.error ?? 'Save failed');
    } else {
      await fetchData();
      setShowOverride(false);
    }
    setSavingOverride(false);
  }

  async function handleClearOverride() {
    setClearingOverride(true);
    const res = await fetch(`/api/stocks/${ticker}/valuation/override`, { method: 'DELETE' });
    if (res.ok) {
      await fetchData();
      setOverrideForm({ maxThreshold: '', comfortableThreshold: '', veryGoodThreshold: '', stealThreshold: '', primaryMetricOverride: '', forwardOperatingEarningsExExcessCash: '', notes: '' });
      setShowOverride(false);
    }
    setClearingOverride(false);
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: T.textDim, fontSize: 12 }} data-testid="valuation-loading">Loading valuation…</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', color: '#ef4444', fontSize: 12 }} data-testid="valuation-error">{error}</div>;
  }

  if (!data?.systemState) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: T.textDim }} data-testid="valuation-not-computed">
        Valuation not yet computed for this stock. Run the valuation batch to populate this data.
      </div>
    );
  }

  const result = data.userResult;
  if (!result) return null;

  const thresholdSourceLabel =
    result.thresholdSource === 'anchored' ? 'Anchored' :
    result.thresholdSource === 'derived' ? `Derived from ${result.derivedFromCode ?? '?'}` :
    result.thresholdSource === 'manual_override' ? 'Manual Override' : result.thresholdSource;

  const metricLabels: Record<string, string> = {
    forward_pe: 'Forward P/E',
    forward_ev_ebit: 'EV/EBIT (Fwd)',
    forward_ev_ebitda: 'Fwd EV/EBITDA',
    ev_sales: 'EV/Sales',
    forward_operating_earnings_ex_excess_cash: 'Fwd Op. Earnings (ex-cash)',
    no_stable_metric: 'No Stable Metric',
  };

  const thresholdPartialFill = [overrideForm.maxThreshold, overrideForm.comfortableThreshold, overrideForm.veryGoodThreshold, overrideForm.stealThreshold];
  const filledCount = thresholdPartialFill.filter(Boolean).length;
  const saveDisabled = filledCount > 0 && filledCount < 4;

  return (
    <div data-testid="valuation-tab" style={{ maxWidth: 720, padding: '16px' }}>
      {/* ── Status + Zone ─────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 0', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>STATUS</div>
          <span
            data-testid="valuation-status"
            style={{ fontSize: 11, color: T.textMuted }}
          >
            {STATUS_LABELS[result.valuationStateStatus] ?? result.valuationStateStatus}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>ZONE</div>
          <ZoneBadge zone={result.valuationZone} />
        </div>
        {data.hasUserOverride && data.systemState && (
          <div title={`System zone: ${ZONE_LABELS[data.systemState.valuationZone] ?? data.systemState.valuationZone}`}>
            <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>SYSTEM VIEW</div>
            <span style={{ fontSize: 11, color: T.textDim }}>
              {ZONE_LABELS[data.systemState.valuationZone] ?? data.systemState.valuationZone} ↗
            </span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button
          data-testid="edit-overrides-btn"
          onClick={() => setShowOverride(s => !s)}
          style={{
            padding: '6px 12px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${T.accent}44`, background: T.accent + '12',
            color: T.accent, fontFamily: 'inherit',
          }}
        >
          {showOverride ? 'Close Overrides' : 'Edit Overrides'}
        </button>
      </div>

      {/* ── Status message for non-computed states ─────────────────────────── */}
      {result.valuationStateStatus !== 'computed' && result.valuationStateStatus !== 'ready' && (
        <div data-testid="status-message" style={{ padding: '12px 0', fontSize: 12, color: '#eab308' }}>
          {(result.valuationStateStatus === 'manual_required' || result.valuationStateStatus === 'missing_data') &&
            'Primary metric unavailable; manual threshold input required.'}
          {result.valuationStateStatus === 'not_applicable' && 'Bucket 8 stocks do not receive a valuation zone.'}
          {result.valuationStateStatus === 'classification_required' && 'Stock classification required before valuation.'}
          {result.valuationStateStatus === 'stale' && 'Valuation data is stale; recompute recommended.'}
        </div>
      )}

      {/* ── Metric + Multiple ─────────────────────────────────────────────── */}
      {result.primaryMetric !== 'no_stable_metric' && (
        <div style={{ marginTop: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
          <div style={{ fontSize: 9, color: T.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Primary Metric</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: T.textMuted }}>{metricLabels[result.primaryMetric] ?? result.primaryMetric}</div>
              {result.currentMultiple != null && (
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  {result.currentMultiple.toFixed(1)}×
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: T.textDim }}>
              <div>Basis: {result.currentMultipleBasis}</div>
              <div>Source: {result.metricSource}</div>
              <div>Reason: {result.metricReason}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplementary Metrics (STORY-097) ───────────────────────────── */}
      {forwardEvEbitda != null && (
        <div data-testid="supplementary-metrics" style={{ marginTop: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
          <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Supplementary Metrics</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: T.textDim }}>Fwd EV/EBITDA</div>
              <div
                data-testid="forward-ev-ebitda"
                style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-mono, monospace)', color: T.text }}
              >
                {forwardEvEbitda.toFixed(1)}×
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Valuation Regime (EPIC-008) ───────────────────────────────────── */}
      {result.valuationRegime && (
        <div style={{ marginTop: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
          <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Valuation Regime</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>REGIME</div>
              <RegimeBadge regime={result.valuationRegime} />
            </div>
            {result.growthTier && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>GROWTH TIER</div>
                <span data-testid="growth-tier-label" style={{ fontSize: 11, color: T.textMuted, fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  {result.growthTier}
                </span>
              </div>
            )}
            {result.cyclePositionSnapshot && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>CYCLE POSITION</div>
                <CyclePositionBadge position={result.cyclePositionSnapshot} />
              </div>
            )}
            {result.structuralCyclicalityScoreSnapshot != null && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>CYCLICALITY SCORE</div>
                <span data-testid="cyclicality-score-label" style={{ fontSize: 11, color: T.textMuted, fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  {result.structuralCyclicalityScoreSnapshot}
                </span>
              </div>
            )}
            {result.cyclicalOverlayApplied && result.cyclicalOverlayValue != null && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>CYCLICAL OVERLAY</div>
                <span data-testid="cyclical-overlay-label" style={{ fontSize: 11, color: '#fb923c', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  {result.cyclicalOverlayValue > 0 ? '+' : ''}{result.cyclicalOverlayValue.toFixed(1)}
                </span>
              </div>
            )}
            {result.thresholdFamily && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>THRESHOLD FAMILY</div>
                <span data-testid="threshold-family-label" style={{ fontSize: 10, color: T.textDim, fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  {result.thresholdFamily}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Threshold Gauge ───────────────────────────────────────────────── */}
      {result.primaryMetric !== 'no_stable_metric' && (
        <div style={{ marginTop: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Threshold Gauge</div>
            <div style={{ fontSize: 10, color: T.textDim }}>Source: {thresholdSourceLabel}</div>
          </div>
          <ThresholdGauge result={result} />
          {result.thresholdAdjustments.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {result.thresholdAdjustments.map(adj => (
                <span key={adj} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: '#6366f118', color: '#818cf8', border: '1px solid #6366f130' }}>{adj}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TSR Hurdle ────────────────────────────────────────────────────── */}
      {result.baseTsrHurdleLabel && (
        <div style={{ marginTop: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
          <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>TSR Hurdle</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: T.textDim }}>Base</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-mono, monospace)', color: T.text }}>
                {result.baseTsrHurdleLabel}
              </div>
            </div>
            {result.adjustedTsrHurdle != null && (
              <div>
                <div style={{ fontSize: 10, color: T.textDim }}>Adjusted</div>
                <div data-testid="adjusted-hurdle" style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-mono, monospace)', color: T.accent }}>
                  {result.adjustedTsrHurdle.toFixed(1)}%
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {result.tsrReasonCodes.map(code => (
                <span key={code} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: T.tableHead, color: T.textDim, border: `1px solid ${T.border}` }}>
                  {code.replace(/_/g, '-')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Secondary Adjustments ─────────────────────────────────────────── */}
      {(result.grossMarginAdjustmentApplied || result.dilutionAdjustmentApplied || result.cyclicalityContextFlag) && (
        <div style={{ marginTop: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
          <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Secondary Adjustments</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {result.grossMarginAdjustmentApplied && (
              <span data-testid="gross-margin-adj-badge" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: '#eab30820', color: '#eab308', border: '1px solid #eab30840' }}>
                Gross Margin Adjustment
              </span>
            )}
            {result.dilutionAdjustmentApplied && (
              <span data-testid="dilution-adj-badge" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>
                Dilution Adjustment
              </span>
            )}
            {result.cyclicalityContextFlag && (
              <span data-testid="cyclicality-badge" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: '#f9731620', color: '#f97316', border: '1px solid #f9731640' }}>
                Cyclicality Context
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Override Panel ────────────────────────────────────────────────── */}
      {showOverride && (
        <div data-testid="override-panel" style={{ marginTop: 16, padding: 16, background: T.sidebarBg, border: `1px solid ${T.border}`, borderRadius: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 12 }}>Valuation Overrides</div>

          {/* Threshold fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {(['maxThreshold', 'comfortableThreshold', 'veryGoodThreshold', 'stealThreshold'] as const).map(f => (
              <div key={f}>
                <label style={{ fontSize: 10, color: T.textDim, display: 'block', marginBottom: 3 }}>
                  {f.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </label>
                <input
                  data-testid={`override-${f}`}
                  type="number"
                  step="0.1"
                  value={overrideForm[f]}
                  onChange={e => setOverrideForm(prev => ({ ...prev, [f]: e.target.value }))}
                  placeholder="e.g. 22.0"
                  style={{
                    width: '100%', padding: '5px 8px', fontSize: 12,
                    background: T.tableHead, border: `1px solid ${T.border}`,
                    borderRadius: 3, color: T.text, fontFamily: 'var(--font-dm-mono, monospace)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Metric override */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: T.textDim, display: 'block', marginBottom: 3 }}>Primary Metric Override</label>
            <select
              data-testid="override-primaryMetric"
              value={overrideForm.primaryMetricOverride}
              onChange={e => setOverrideForm(prev => ({ ...prev, primaryMetricOverride: e.target.value }))}
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, background: T.tableHead, border: `1px solid ${T.border}`, borderRadius: 3, color: T.text, fontFamily: 'inherit' }}
            >
              <option value="">System default</option>
              <option value="forward_pe">Forward P/E</option>
              <option value="forward_ev_ebitda">Fwd EV/EBITDA</option>
              <option value="forward_ev_ebit">EV/EBIT (Fwd)</option>
              <option value="ev_sales">EV/Sales</option>
              <option value="forward_operating_earnings_ex_excess_cash">Fwd Op. Earnings (ex-cash)</option>
            </select>
          </div>

          {/* Holding company earnings input */}
          {(holdingCompanyFlag || insurerFlag) && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: T.textDim, display: 'block', marginBottom: 3 }}>
                Fwd Operating Earnings (ex. Excess Cash)
              </label>
              <input
                data-testid="override-forwardOperatingEarnings"
                type="number"
                step="0.01"
                value={overrideForm.forwardOperatingEarningsExExcessCash}
                onChange={e => setOverrideForm(prev => ({ ...prev, forwardOperatingEarningsExExcessCash: e.target.value }))}
                placeholder="Manual earnings input"
                style={{ width: '100%', padding: '5px 8px', fontSize: 12, background: T.tableHead, border: `1px solid ${T.border}`, borderRadius: 3, color: T.text, fontFamily: 'var(--font-dm-mono, monospace)', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: T.textDim, display: 'block', marginBottom: 3 }}>Notes</label>
            <textarea
              data-testid="override-notes"
              value={overrideForm.notes}
              onChange={e => setOverrideForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Optional reasoning…"
              style={{ width: '100%', padding: '5px 8px', fontSize: 12, background: T.tableHead, border: `1px solid ${T.border}`, borderRadius: 3, color: T.text, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {overrideError && (
            <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }} data-testid="override-error">{overrideError}</div>
          )}
          {saveDisabled && (
            <div style={{ color: '#eab308', fontSize: 11, marginBottom: 8 }}>
              All 4 threshold fields required (or leave all empty).
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-testid="save-override-btn"
              onClick={handleSaveOverride}
              disabled={savingOverride || saveDisabled}
              style={{
                padding: '7px 14px', fontSize: 12, borderRadius: 4, cursor: saveDisabled ? 'not-allowed' : 'pointer',
                border: `1px solid ${T.accent}44`, background: T.accent + '12',
                color: saveDisabled ? T.textDim : T.accent, fontFamily: 'inherit',
              }}
            >
              {savingOverride ? 'Saving…' : 'Save'}
            </button>
            {data.hasUserOverride && (
              <button
                data-testid="clear-override-btn"
                onClick={handleClearOverride}
                disabled={clearingOverride}
                style={{
                  padding: '7px 12px', fontSize: 12, borderRadius: 4,
                  border: '1px solid #ef444444', background: '#ef444412',
                  color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {clearingOverride ? 'Clearing…' : 'Clear Overrides'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Valuation History ─────────────────────────────────────────────── */}
      {history !== null && history.length > 0 && (
        <div style={{ marginTop: 24, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Zone History</div>
          <div>
            {history.slice(0, 10).map((h, i) => (
              <div
                key={h.id}
                data-testid={`valuation-history-row-${i}`}
                style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: `1px solid ${T.borderFaint}`, alignItems: 'center' }}
              >
                <div style={{ width: 80, flexShrink: 0, fontSize: 10, color: T.textMuted, fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  {new Date(h.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <span style={{ fontSize: 10, color: T.textDim }}>{h.previousZone ? ZONE_LABELS[h.previousZone] ?? h.previousZone : '—'}</span>
                <span style={{ color: T.textDim, fontSize: 10 }}>→</span>
                <ZoneBadge zone={h.valuationZone} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
