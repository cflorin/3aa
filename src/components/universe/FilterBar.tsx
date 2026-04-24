// EPIC-004: Classification Engine & Universe Screen
// STORY-049: Universe Screen — Filters and Sort
// TASK-049-004: FilterBar component — search, sector, code, confidence, monitoring filters
// PRD §Screen 2 — Filters; RFC-003 §Filtering and Sort

'use client';

import React from 'react';

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

const CONFIDENCE_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'no_classification', label: 'No classification' },
];

interface FilterBarProps {
  filters: FilterState;
  sectors: string[];
  onChange: (f: FilterState) => void;
  onClear: () => void;
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

const INPUT_STYLE: React.CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '0.875rem',
  color: '#111827',
  backgroundColor: '#fff',
  outline: 'none',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '4px',
  display: 'block',
};

export default function FilterBar({ filters, sectors, onChange, onClear }: FilterBarProps) {
  const count = activeFilterCount(filters);

  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  function toggleMulti(
    key: 'sector' | 'confidence',
    value: string,
  ) {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    set(key, next);
  }

  return (
    <div
      data-testid="filter-bar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'flex-end',
        padding: '12px 0 16px',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '12px',
      }}
    >
      {/* Search */}
      <div>
        <label htmlFor="filter-search" style={LABEL_STYLE}>Search</label>
        <input
          id="filter-search"
          data-testid="filter-search"
          type="text"
          placeholder="Ticker or company…"
          value={filters.search}
          onChange={e => set('search', e.target.value)}
          style={{ ...INPUT_STYLE, width: '180px' }}
        />
      </div>

      {/* Sector multi-select */}
      {sectors.length > 0 && (
        <div>
          <label htmlFor="filter-sector" style={LABEL_STYLE}>Sector</label>
          <select
            id="filter-sector"
            data-testid="filter-sector"
            multiple
            value={filters.sector}
            onChange={e => {
              const selected = Array.from(e.target.selectedOptions).map(o => o.value);
              set('sector', selected);
            }}
            style={{ ...INPUT_STYLE, height: '80px', width: '160px' }}
          >
            {sectors.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* 3AA Code prefix */}
      <div>
        <label htmlFor="filter-code" style={LABEL_STYLE}>3AA Code</label>
        <input
          id="filter-code"
          data-testid="filter-code"
          type="text"
          placeholder="e.g. 4, 4A, 4AA"
          value={filters.code}
          onChange={e => set('code', e.target.value)}
          style={{ ...INPUT_STYLE, width: '120px' }}
        />
      </div>

      {/* Confidence checkboxes */}
      <div>
        <span style={LABEL_STYLE}>Confidence</span>
        <div data-testid="filter-confidence" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {CONFIDENCE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={filters.confidence.includes(opt.value)}
                onChange={() => toggleMulti('confidence', opt.value)}
                data-testid={`confidence-check-${opt.value}`}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Monitoring toggle */}
      <div>
        <span style={LABEL_STYLE}>Monitoring</span>
        <div data-testid="filter-monitoring" style={{ display: 'flex', gap: '6px' }}>
          {(['', 'active', 'inactive'] as const).map(val => (
            <button
              key={val}
              data-testid={`monitoring-btn-${val || 'all'}`}
              onClick={() => set('monitoring', val)}
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                border: '1px solid',
                borderColor: filters.monitoring === val ? '#15803d' : '#d1d5db',
                backgroundColor: filters.monitoring === val ? '#dcfce7' : '#fff',
                color: filters.monitoring === val ? '#15803d' : '#374151',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: filters.monitoring === val ? 600 : 400,
              }}
            >
              {val === '' ? 'All' : val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Clear button */}
      <div style={{ marginLeft: 'auto' }}>
        <button
          data-testid="filter-clear"
          onClick={onClear}
          disabled={count === 0}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: count > 0 ? '#fff' : '#f9fafb',
            color: count > 0 ? '#374151' : '#9ca3af',
            fontSize: '0.875rem',
            cursor: count > 0 ? 'pointer' : 'default',
          }}
        >
          {count > 0 ? `Filters (${count}) · Clear` : 'Filters'}
        </button>
      </div>
    </div>
  );
}
