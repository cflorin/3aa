// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: StockTable — 13-column table with metric color-coding and row navigation
// STORY-049: Added optional sort/dir/onSort props for column sorting
// STORY-050: Replaced MonitoringBadge with MonitoringToggle; added inactive row muting
// STORY-051: Badge click opens ClassificationModal; rowCodeOverlay tracks in-session overrides
// EPIC-004/STORY-054/TASK-054-005: Applied dark terminal theme (screen-universe.jsx spec)
// STORY-055: Added Remove button per row + RemoveStockDialog confirmation
// STORY-070: Added optional quarterly trend columns (togglable; hidden by default)
// PRD §Screen 2 columns; RFC-003 §Universe Screen; RFC-008 §Classifier-Facing Derived Fields

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ClassificationBadge from './ClassificationBadge';
import ConfidenceBadge from './ConfidenceBadge';
import MonitoringToggle from './MonitoringToggle';
import ClassificationModal from './ClassificationModal';
import RemoveStockDialog from './RemoveStockDialog';
import type { UniverseStockSummary } from '@/domain/monitoring';
import { T } from '@/lib/theme';

// ── Metric color helpers ────────────────────────────────────────────────────

function growthColor(val: number | null): string {
  if (val === null || val === undefined) return T.textDim;
  if (val >= 0.08) return '#16a34a';
  if (val >= 0.03) return '#eab308';
  return '#ef4444';
}

function netDebtColor(val: number | null): string {
  if (val === null || val === undefined) return T.textDim;
  if (val <= 1.0) return '#16a34a';
  if (val <= 2.5) return '#eab308';
  return '#ef4444';
}

function fcfConvColor(val: number | null): string {
  if (val === null || val === undefined) return T.textDim;
  if (val >= 0.80) return '#16a34a';
  if (val >= 0.50) return '#eab308';
  return '#ef4444';
}

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function fmtRatio(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return val.toFixed(1) + '×';
}

// ── Column header styles ──────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '7px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  color: T.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${T.border}`,
  whiteSpace: 'nowrap',
  backgroundColor: T.tableHead,
};

const TD: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  borderBottom: `1px solid ${T.borderFaint}`,
  whiteSpace: 'nowrap',
  color: T.text,
};

// ── Trend metric helpers (STORY-070) ─────────────────────────────────────────

function eqTrendColor(val: number | null): string {
  if (val === null || val === undefined) return T.textDim;
  if (val > 0.30) return '#16a34a';
  if (val < -0.30) return '#ef4444';
  return T.textMuted;
}

function eqTrendBadge(val: number | null): string {
  if (val === null || val === undefined) return '—';
  const formatted = val.toFixed(2);
  return val > 0.30 ? `▲ ${formatted}` : val < -0.30 ? `▼ ${formatted}` : `· ${formatted}`;
}

function slopeIcon(val: number | null): string {
  if (val === null || val === undefined) return '—';
  const pp = (val * 100).toFixed(2);
  if (val > 0.001) return `↑ ${pp}pp`;
  if (val < -0.001) return `↓ ${pp}pp`;
  return `→ ${pp}pp`;
}

function slopeColor(val: number | null): string {
  if (val === null || val === undefined) return T.textDim;
  if (val > 0.001) return '#16a34a';
  if (val < -0.001) return '#ef4444';
  return T.textMuted;
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

const SORTABLE_KEYS = new Set([
  'ticker', 'revenue_growth_fwd', 'eps_growth_fwd',
  'fcf_conversion', 'net_debt_to_ebitda', 'operating_margin',
  'operating_margin_slope_4q', 'earnings_quality_trend_score', 'quarters_available',
]);

function sortIcon(colKey: string, sort: string, dir: SortDir): string {
  if (colKey !== sort) return ' ↕';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

// ── Component ─────────────────────────────────────────────────────────────────

// Which optional trend columns are visible — controlled by column chooser in parent
export type TrendColumnKey = 'operating_margin_slope_4q' | 'earnings_quality_trend_score' | 'material_dilution_trend_flag' | 'quarters_available';
export const ALL_TREND_COLUMNS: TrendColumnKey[] = [
  'operating_margin_slope_4q',
  'earnings_quality_trend_score',
  'material_dilution_trend_flag',
  'quarters_available',
];

interface StockTableProps {
  stocks: UniverseStockSummary[];
  sort?: string;
  dir?: SortDir;
  onSort?: (colKey: string, dir: SortDir) => void;
  /** Called when user confirms removal dialog — parent handles the DELETE call */
  onRemoveConfirm?: (ticker: string) => void;
  /** Trend columns to display (hidden by default; empty array or omit = no trend columns) */
  visibleTrendColumns?: TrendColumnKey[];
}

export default function StockTable({
  stocks,
  sort = 'market_cap',
  dir = 'desc',
  onSort,
  onRemoveConfirm,
  visibleTrendColumns = [],
}: StockTableProps) {
  const router = useRouter();

  const [rowActiveState, setRowActiveState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(stocks.map(s => [s.ticker, s.is_active])),
  );

  useEffect(() => {
    setRowActiveState(Object.fromEntries(stocks.map(s => [s.ticker, s.is_active])));
  }, [stocks]);

  function handleMonitoringStateChange(ticker: string, newIsActive: boolean) {
    setRowActiveState(prev => ({ ...prev, [ticker]: newIsActive }));
  }

  const [rowCodeOverlay, setRowCodeOverlay] = useState<Record<string, string | null>>({});
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  // Remove stock state — dialog only; API call handled by parent via onRemoveConfirm
  const [removeTargetTicker, setRemoveTargetTicker] = useState<string | null>(null);

  useEffect(() => {
    setRowCodeOverlay({});
  }, [stocks]);

  function handleCodeChange(ticker: string, newCode: string | null) {
    setRowCodeOverlay(prev => ({ ...prev, [ticker]: newCode }));
  }

  function handleHeaderClick(colKey: string) {
    if (!onSort || !SORTABLE_KEYS.has(colKey)) return;
    if (colKey === sort) {
      onSort(colKey, dir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(colKey, 'desc');
    }
  }

  if (stocks.length === 0) {
    return (
      <p style={{ color: T.textDim, textAlign: 'center', padding: '2rem' }}>
        No stocks in universe.
      </p>
    );
  }

  return (
    <>
    <table
      style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px' }}
      aria-label="Universe stock table"
    >
      <thead>
        <tr>
          <th
            scope="col"
            style={{ ...TH, cursor: onSort ? 'pointer' : 'default', color: sort === 'ticker' ? T.accent : T.textMuted }}
            onClick={() => handleHeaderClick('ticker')}
            aria-sort={sort === 'ticker' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            Ticker{onSort ? sortIcon('ticker', sort, dir) : ''}
          </th>
          <th scope="col" style={TH}>Company</th>
          <th scope="col" style={TH}>Sector</th>
          <th scope="col" style={TH}>3AA Code</th>
          <th scope="col" style={TH}>Conf.</th>
          <th scope="col" style={TH}>Monitor</th>
          <th
            scope="col"
            style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'revenue_growth_fwd' ? T.accent : T.textMuted }}
            onClick={() => handleHeaderClick('revenue_growth_fwd')}
            aria-sort={sort === 'revenue_growth_fwd' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            Rev Fwd{onSort ? sortIcon('revenue_growth_fwd', sort, dir) : ''}
          </th>
          <th
            scope="col"
            style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'eps_growth_fwd' ? T.accent : T.textMuted }}
            onClick={() => handleHeaderClick('eps_growth_fwd')}
            aria-sort={sort === 'eps_growth_fwd' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            EPS Fwd{onSort ? sortIcon('eps_growth_fwd', sort, dir) : ''}
          </th>
          <th
            scope="col"
            style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'fcf_conversion' ? T.accent : T.textMuted }}
            onClick={() => handleHeaderClick('fcf_conversion')}
            aria-sort={sort === 'fcf_conversion' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            FCF Conv{onSort ? sortIcon('fcf_conversion', sort, dir) : ''}
          </th>
          <th
            scope="col"
            style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'net_debt_to_ebitda' ? T.accent : T.textMuted }}
            onClick={() => handleHeaderClick('net_debt_to_ebitda')}
            aria-sort={sort === 'net_debt_to_ebitda' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            ND/EBITDA{onSort ? sortIcon('net_debt_to_ebitda', sort, dir) : ''}
          </th>
          <th
            scope="col"
            style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'operating_margin' ? T.accent : T.textMuted }}
            onClick={() => handleHeaderClick('operating_margin')}
            aria-sort={sort === 'operating_margin' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            Op Margin{onSort ? sortIcon('operating_margin', sort, dir) : ''}
          </th>
          <th scope="col" style={TH}>Zone</th>
          {/* Trend metric columns (STORY-070) — hidden by default; shown when visibleTrendColumns includes key */}
          {visibleTrendColumns.includes('operating_margin_slope_4q') && (
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'operating_margin_slope_4q' ? T.accent : T.textMuted }}
              onClick={() => handleHeaderClick('operating_margin_slope_4q')}
              aria-sort={sort === 'operating_margin_slope_4q' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              OpMgn Slope{onSort ? sortIcon('operating_margin_slope_4q', sort, dir) : ''}
            </th>
          )}
          {visibleTrendColumns.includes('earnings_quality_trend_score') && (
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'earnings_quality_trend_score' ? T.accent : T.textMuted }}
              onClick={() => handleHeaderClick('earnings_quality_trend_score')}
              aria-sort={sort === 'earnings_quality_trend_score' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              EQ Trend{onSort ? sortIcon('earnings_quality_trend_score', sort, dir) : ''}
            </th>
          )}
          {visibleTrendColumns.includes('material_dilution_trend_flag') && (
            <th scope="col" style={TH}>Dilution</th>
          )}
          {visibleTrendColumns.includes('quarters_available') && (
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default', color: sort === 'quarters_available' ? T.accent : T.textMuted }}
              onClick={() => handleHeaderClick('quarters_available')}
              aria-sort={sort === 'quarters_available' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Qtrs{onSort ? sortIcon('quarters_available', sort, dir) : ''}
            </th>
          )}
          {onRemoveConfirm && <th scope="col" style={{ ...TH, width: 32 }} />}
        </tr>
      </thead>
      <tbody>
        {stocks.map((s) => {
          const isActive = rowActiveState[s.ticker] ?? s.is_active;
          const activeCode = rowCodeOverlay[s.ticker] !== undefined ? rowCodeOverlay[s.ticker] : s.active_code;
          return (
            <tr
              key={s.ticker}
              onClick={() => router.push(`/stocks/${s.ticker}`)}
              style={{
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.5,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.backgroundColor = T.rowHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
              }}
            >
              <td style={{ ...TD, fontWeight: 700, fontFamily: 'var(--font-dm-mono, monospace)', color: isActive ? T.accent : T.textDim }}>
                {s.ticker}
              </td>
              <td style={{ ...TD, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', color: isActive ? T.text : T.textDim }}>
                {s.company_name}
              </td>
              <td style={{ ...TD, color: T.textMuted, fontSize: 10 }}>
                {s.sector ?? '—'}
              </td>
              <td style={TD}>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedTicker(s.ticker); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  aria-label={`Open classification detail for ${s.ticker}`}
                >
                  <ClassificationBadge code={activeCode} />
                </button>
              </td>
              <td style={TD}>
                <ConfidenceBadge confidence={s.confidence_level} />
              </td>
              <td style={TD}>
                <MonitoringToggle
                  ticker={s.ticker}
                  isActive={isActive}
                  onStateChange={handleMonitoringStateChange}
                />
              </td>
              <td style={{ ...TD, textAlign: 'right', color: growthColor(s.revenue_growth_fwd), fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.revenue_growth_fwd)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: growthColor(s.eps_growth_fwd), fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.eps_growth_fwd)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: fcfConvColor(s.fcf_conversion), fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.fcf_conversion)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: netDebtColor(s.net_debt_to_ebitda), fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                {s.net_debt_to_ebitda !== null && s.net_debt_to_ebitda < 0 ? 'net cash' : fmtRatio(s.net_debt_to_ebitda)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: growthColor(s.operating_margin), fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.operating_margin)}
              </td>
              <td style={{ ...TD, color: T.textDim }}>—</td>
              {/* Trend metric cells (STORY-070) */}
              {visibleTrendColumns.includes('operating_margin_slope_4q') && (
                <td style={{ ...TD, textAlign: 'right', color: slopeColor(s.trend?.operating_margin_slope_4q ?? null), fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                  {slopeIcon(s.trend?.operating_margin_slope_4q ?? null)}
                </td>
              )}
              {visibleTrendColumns.includes('earnings_quality_trend_score') && (
                <td style={{ ...TD, textAlign: 'right', color: eqTrendColor(s.trend?.earnings_quality_trend_score ?? null), fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                  {eqTrendBadge(s.trend?.earnings_quality_trend_score ?? null)}
                </td>
              )}
              {visibleTrendColumns.includes('material_dilution_trend_flag') && (
                <td style={{ ...TD, textAlign: 'center', color: s.trend?.material_dilution_trend_flag ? '#ef4444' : T.textDim }}>
                  {s.trend === undefined ? '—' : (s.trend.material_dilution_trend_flag ? '⚑' : '·')}
                </td>
              )}
              {visibleTrendColumns.includes('quarters_available') && (
                <td style={{ ...TD, textAlign: 'right', color: T.textMuted, fontFamily: 'var(--font-dm-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                  {s.trend?.quarters_available ?? '—'}
                </td>
              )}
              {onRemoveConfirm && (
                <td style={{ ...TD, padding: '4px 6px', textAlign: 'center' }}>
                  <button
                    data-testid={`remove-btn-${s.ticker}`}
                    aria-label={`Remove ${s.ticker} from universe`}
                    onClick={(e) => { e.stopPropagation(); setRemoveTargetTicker(s.ticker); }}
                    style={{
                      background: 'none', border: 'none', padding: '3px 5px',
                      cursor: 'pointer', color: T.textDim, fontSize: 13, lineHeight: 1,
                      borderRadius: 3,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.textDim; }}
                    title="Remove from universe"
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>

    {removeTargetTicker !== null && (
      <RemoveStockDialog
        ticker={removeTargetTicker}
        onCancel={() => setRemoveTargetTicker(null)}
        onConfirm={() => {
          const ticker = removeTargetTicker;
          setRemoveTargetTicker(null);
          onRemoveConfirm!(ticker);
        }}
      />
    )}

    {selectedTicker !== null && (() => {
      const stock = stocks.find(s => s.ticker === selectedTicker);
      if (!stock) return null;
      return (
        <ClassificationModal
          ticker={selectedTicker}
          companyName={stock.company_name}
          sector={stock.sector ?? null}
          onClose={() => setSelectedTicker(null)}
          onOverrideChange={handleCodeChange}
        />
      );
    })()}
    </>
  );
}
