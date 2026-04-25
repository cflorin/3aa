// EPIC-004: Classification Engine & Universe Screen
// STORY-049: Universe Screen — Filters and Sort
// TASK-049-004: FilterBar component — search, sector, code, confidence, monitoring filters
// EPIC-004/STORY-054/TASK-054-004: Applied dark terminal theme (screen-universe.jsx spec)
// STORY-070: Added trend metric filters and column chooser toggle

'use client';

import React from 'react';
import { T } from '@/lib/theme';

export interface FilterState {
  search: string;
  sector: string[];
  code: string;
  confidence: string[];
  monitoring: '' | 'active' | 'inactive';
  // Trend filters (STORY-070) — only active when trend columns visible
  eqTrendPreset: '' | 'positive' | 'negative';
  dilutionFlagOnly: boolean;
  minQuarters: '' | '4' | '8';
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  sector: [],
  code: '',
  confidence: [],
  monitoring: '',
  eqTrendPreset: '',
  dilutionFlagOnly: false,
  minQuarters: '',
};

interface FilterBarProps {
  filters: FilterState;
  sectors: string[];
  total: number;
  onChange: (f: FilterState) => void;
  onClear: () => void;
  onAddStock?: () => void;
  /** When true, show the trend filter section (STORY-070) */
  showTrendFilters?: boolean;
  /** Column chooser: which trend columns are currently visible */
  visibleTrendColumns?: string[];
  onToggleTrendColumn?: (col: string) => void;
}

function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.search) n++;
  if (f.sector.length > 0) n++;
  if (f.code) n++;
  if (f.confidence.length > 0) n++;
  if (f.monitoring) n++;
  if (f.eqTrendPreset) n++;
  if (f.dilutionFlagOnly) n++;
  if (f.minQuarters) n++;
  return n;
}

const ctrlStyle: React.CSSProperties = {
  background: T.inputBg,
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  color: T.text,
  fontSize: 12,
  padding: '4px 8px',
  outline: 'none',
  fontFamily: 'inherit',
  height: 28,
};

export default function FilterBar({ filters, sectors, total, onChange, onClear, onAddStock, showTrendFilters, visibleTrendColumns = [], onToggleTrendColumn }: FilterBarProps) {
  const count = activeFilterCount(filters);

  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  const sectorValue = filters.sector.length === 1 ? filters.sector[0] : 'All';
  const confidenceValue = filters.confidence.length === 1 ? filters.confidence[0] : 'All';
  const monitoringValue = filters.monitoring === '' ? 'All' : filters.monitoring;

  return (
    <div
      data-testid="filter-bar"
      style={{
        padding: '8px 14px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        background: T.headerBg,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Universe</span>
      <span style={{ fontSize: 11, color: T.textDim }}>{total} stocks</span>
      {count > 0 && (
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 8,
          background: T.accent + '22', color: T.accent, fontWeight: 700,
        }}>
          {count} filter{count > 1 ? 's' : ''}
        </span>
      )}
      <div style={{ flex: 1 }} />

      <input
        id="filter-search"
        data-testid="filter-search"
        type="text"
        placeholder="Search ticker or name…"
        value={filters.search}
        onChange={e => set('search', e.target.value)}
        style={{ ...ctrlStyle, width: 180 }}
      />

      {sectors.length > 0 && (
        <select
          id="filter-sector"
          data-testid="filter-sector"
          value={sectorValue}
          onChange={e => {
            const v = e.target.value;
            set('sector', v === 'All' ? [] : [v]);
          }}
          style={ctrlStyle}
        >
          <option value="All">All sectors</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      <input
        id="filter-code"
        data-testid="filter-code"
        type="text"
        placeholder="Code prefix (e.g. 4A)"
        value={filters.code}
        onChange={e => set('code', e.target.value)}
        style={{ ...ctrlStyle, width: 130 }}
      />

      <select
        data-testid="filter-confidence"
        value={confidenceValue}
        onChange={e => {
          const v = e.target.value;
          set('confidence', v === 'All' ? [] : [v]);
        }}
        style={ctrlStyle}
      >
        <option value="All">All confidence</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="no_classification">No classification</option>
      </select>

      <select
        data-testid="filter-monitoring"
        value={monitoringValue}
        onChange={e => {
          const v = e.target.value;
          set('monitoring', v === 'All' ? '' : (v as 'active' | 'inactive'));
        }}
        style={ctrlStyle}
      >
        <option value="All">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>

      {count > 0 && (
        <button
          data-testid="filter-clear"
          onClick={onClear}
          style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 4,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.textDim, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Clear
        </button>
      )}

      {onAddStock && (
        <button
          data-testid="add-stock-btn"
          onClick={onAddStock}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 4,
            border: `1px solid ${T.accent}`, background: `${T.accent}15`,
            color: T.accent, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          + Add Stock
        </button>
      )}

      {/* Trend filters (STORY-070) — only shown when showTrendFilters=true */}
      {showTrendFilters && (
        <>
          <div style={{ width: '100%', height: 0 }} /> {/* line break */}
          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Trend:</span>

          <select
            data-testid="filter-eq-trend"
            value={filters.eqTrendPreset}
            onChange={e => set('eqTrendPreset', e.target.value as FilterState['eqTrendPreset'])}
            style={ctrlStyle}
          >
            <option value="">EQ trend: all</option>
            <option value="positive">EQ positive (&gt;0.3)</option>
            <option value="negative">EQ negative (&lt;-0.3)</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.text, cursor: 'pointer' }}>
            <input
              data-testid="filter-dilution-flag"
              type="checkbox"
              checked={filters.dilutionFlagOnly}
              onChange={e => set('dilutionFlagOnly', e.target.checked)}
              style={{ accentColor: T.accent }}
            />
            Dilution flagged
          </label>

          <select
            data-testid="filter-min-quarters"
            value={filters.minQuarters}
            onChange={e => set('minQuarters', e.target.value as FilterState['minQuarters'])}
            style={ctrlStyle}
          >
            <option value="">All quarters</option>
            <option value="4">≥ 4 quarters</option>
            <option value="8">≥ 8 quarters</option>
          </select>

          {/* Column chooser for trend columns */}
          {onToggleTrendColumn && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: T.textMuted }}>Cols:</span>
              {(['operating_margin_slope_4q', 'earnings_quality_trend_score', 'material_dilution_trend_flag', 'quarters_available'] as const).map(col => (
                <button
                  key={col}
                  data-testid={`col-toggle-${col}`}
                  onClick={() => onToggleTrendColumn(col)}
                  style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 3,
                    border: `1px solid ${visibleTrendColumns.includes(col) ? T.accent : T.border}`,
                    background: visibleTrendColumns.includes(col) ? `${T.accent}20` : 'transparent',
                    color: visibleTrendColumns.includes(col) ? T.accent : T.textDim,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {col === 'operating_margin_slope_4q' ? 'OpSlope'
                    : col === 'earnings_quality_trend_score' ? 'EQTrend'
                    : col === 'material_dilution_trend_flag' ? 'Dilution'
                    : 'Qtrs'}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
