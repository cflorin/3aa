// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: StockTable — 13-column table with metric color-coding and row navigation
// STORY-049: Added optional sort/dir/onSort props for column sorting
// PRD §Screen 2 columns; RFC-003 §Universe Screen

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import ClassificationBadge from './ClassificationBadge';
import ConfidenceBadge from './ConfidenceBadge';
import MonitoringBadge from './MonitoringBadge';
import type { UniverseStockSummary } from '@/domain/monitoring';

// ── Metric color helpers ────────────────────────────────────────────────────

function growthColor(val: number | null): string {
  if (val === null || val === undefined) return '#374151';
  if (val >= 0.08) return '#15803d';
  if (val >= 0.03) return '#854d0e';
  return '#dc2626';
}

function netDebtColor(val: number | null): string {
  if (val === null || val === undefined) return '#374151';
  if (val <= 1.0) return '#15803d';
  if (val <= 2.5) return '#854d0e';
  return '#dc2626';
}

function fcfConvColor(val: number | null): string {
  if (val === null || val === undefined) return '#374151';
  if (val >= 0.80) return '#15803d';
  if (val >= 0.50) return '#854d0e';
  return '#dc2626';
}

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function fmtMcap(val: number | null): string {
  if (val === null || val === undefined) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}T`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}B`;
  return `$${val.toFixed(0)}M`;
}

function fmtRatio(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return val.toFixed(1) + '×';
}

// ── Column header style ──────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '2px solid #e5e7eb',
  whiteSpace: 'nowrap',
  backgroundColor: '#f9fafb',
};

const TD: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '0.875rem',
  borderBottom: '1px solid #f3f4f6',
  whiteSpace: 'nowrap',
};

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

interface SortableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

const SORTABLE: SortableColumn[] = [
  { key: 'ticker', label: 'Ticker' },
  { key: 'market_cap', label: 'Market Cap', align: 'right' },
  { key: 'revenue_growth_fwd', label: 'Rev Growth Fwd', align: 'right' },
  { key: 'eps_growth_fwd', label: 'EPS Growth Fwd', align: 'right' },
  { key: 'fcf_conversion', label: 'FCF Conv', align: 'right' },
  { key: 'net_debt_to_ebitda', label: 'Net Debt/EBITDA', align: 'right' },
  { key: 'operating_margin', label: 'Op Margin', align: 'right' },
];

const SORTABLE_KEYS = new Set(SORTABLE.map(c => c.key));

function sortIcon(colKey: string, sort: string, dir: SortDir): string {
  if (colKey !== sort) return ' ↕';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface StockTableProps {
  stocks: UniverseStockSummary[];
  sort?: string;
  dir?: SortDir;
  onSort?: (colKey: string, dir: SortDir) => void;
}

export default function StockTable({
  stocks,
  sort = 'market_cap',
  dir = 'desc',
  onSort,
}: StockTableProps) {
  const router = useRouter();

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
      <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
        No stocks in universe.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table
        style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px' }}
        aria-label="Universe stock table"
      >
        <thead>
          <tr>
            <th
              scope="col"
              style={{ ...TH, cursor: onSort ? 'pointer' : 'default' }}
              onClick={() => handleHeaderClick('ticker')}
              aria-sort={sort === 'ticker' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Ticker{onSort ? sortIcon('ticker', sort, dir) : ''}
            </th>
            <th scope="col" style={TH}>Company</th>
            <th scope="col" style={TH}>Sector</th>
            <th scope="col" style={TH}>3AA Code</th>
            <th scope="col" style={TH}>Confidence</th>
            <th scope="col" style={TH}>Zone</th>
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default' }}
              onClick={() => handleHeaderClick('market_cap')}
              aria-sort={sort === 'market_cap' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Market Cap{onSort ? sortIcon('market_cap', sort, dir) : ''}
            </th>
            <th scope="col" style={TH}>Monitoring</th>
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default' }}
              onClick={() => handleHeaderClick('revenue_growth_fwd')}
              aria-sort={sort === 'revenue_growth_fwd' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Rev Growth Fwd{onSort ? sortIcon('revenue_growth_fwd', sort, dir) : ''}
            </th>
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default' }}
              onClick={() => handleHeaderClick('eps_growth_fwd')}
              aria-sort={sort === 'eps_growth_fwd' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              EPS Growth Fwd{onSort ? sortIcon('eps_growth_fwd', sort, dir) : ''}
            </th>
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default' }}
              onClick={() => handleHeaderClick('fcf_conversion')}
              aria-sort={sort === 'fcf_conversion' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              FCF Conv{onSort ? sortIcon('fcf_conversion', sort, dir) : ''}
            </th>
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default' }}
              onClick={() => handleHeaderClick('net_debt_to_ebitda')}
              aria-sort={sort === 'net_debt_to_ebitda' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Net Debt/EBITDA{onSort ? sortIcon('net_debt_to_ebitda', sort, dir) : ''}
            </th>
            <th
              scope="col"
              style={{ ...TH, textAlign: 'right', cursor: onSort ? 'pointer' : 'default' }}
              onClick={() => handleHeaderClick('operating_margin')}
              aria-sort={sort === 'operating_margin' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              Op Margin{onSort ? sortIcon('operating_margin', sort, dir) : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr
              key={s.ticker}
              onClick={() => router.push(`/stocks/${s.ticker}`)}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f0fdf4';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '';
              }}
            >
              <td style={{ ...TD, fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>
                {s.ticker}
              </td>
              <td style={{ ...TD, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.company_name}
              </td>
              <td style={{ ...TD, color: '#6b7280' }}>
                {s.sector ?? '—'}
              </td>
              <td style={TD}>
                <ClassificationBadge code={s.active_code} />
              </td>
              <td style={TD}>
                <ConfidenceBadge confidence={s.confidence_level} />
              </td>
              <td style={{ ...TD, color: '#9ca3af' }}>—</td>
              <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtMcap(s.market_cap)}
              </td>
              <td style={TD}>
                <MonitoringBadge isActive={s.is_active} />
              </td>
              <td style={{ ...TD, textAlign: 'right', color: growthColor(s.revenue_growth_fwd), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.revenue_growth_fwd)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: growthColor(s.eps_growth_fwd), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.eps_growth_fwd)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: fcfConvColor(s.fcf_conversion), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.fcf_conversion)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: netDebtColor(s.net_debt_to_ebitda), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtRatio(s.net_debt_to_ebitda)}
              </td>
              <td style={{ ...TD, textAlign: 'right', color: growthColor(s.operating_margin), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(s.operating_margin)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
