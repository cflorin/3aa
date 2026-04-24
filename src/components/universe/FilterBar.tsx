// EPIC-004: Classification Engine & Universe Screen
// STORY-049: Universe Screen — Filters and Sort
// TASK-049-004: FilterBar component — search, sector, code, confidence, monitoring filters
// EPIC-004/STORY-054/TASK-054-004: Applied dark terminal theme (screen-universe.jsx spec)

'use client';

import React from 'react';
import { T } from '@/lib/theme';

export interface FilterState {
  search: string;
  sector: string[];
  code: string;
  confidence: string[];
  monitoring: '' | 'active' | 'inactive';
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  sector: [],
  code: '',
  confidence: [],
  monitoring: '',
};

interface FilterBarProps {
  filters: FilterState;
  sectors: string[];
  total: number;
  onChange: (f: FilterState) => void;
  onClear: () => void;
  onAddStock?: () => void;
}

function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.search) n++;
  if (f.sector.length > 0) n++;
  if (f.code) n++;
  if (f.confidence.length > 0) n++;
  if (f.monitoring) n++;
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

export default function FilterBar({ filters, sectors, total, onChange, onClear, onAddStock }: FilterBarProps) {
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
    </div>
  );
}
