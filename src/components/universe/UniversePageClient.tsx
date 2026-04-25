// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: UniversePageClient — client component with fetch, pagination, state management
// STORY-049: Added FilterBar, column sort, URL state round-trip
// EPIC-004/STORY-054/TASK-054-004: Applied dark terminal theme (screen-universe.jsx spec)
// STORY-055: Added handleRemoveConfirm — optimistic stock removal + error revert
// STORY-070: Added trend column chooser and trend filter state
// EPIC-005/STORY-080: Added valuationZone filter wiring
// PRD §Screen 2; RFC-003 §Universe Screen; RFC-003 §Filtering and Sort; RFC-008

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import StockTable, { type TrendColumnKey } from './StockTable';
import PaginationControls from './PaginationControls';
import FilterBar, { EMPTY_FILTERS, type FilterState } from './FilterBar';
import AddStockModal from './AddStockModal';
import type { UniverseStockSummary } from '@/domain/monitoring';
import { T } from '@/lib/theme';

const LIMIT = 50;

interface UniverseResponse {
  stocks: UniverseStockSummary[];
  total: number;
  page: number;
  limit: number;
}

function filtersToParams(
  f: FilterState,
  sort: string,
  dir: 'asc' | 'desc',
  page: number,
  visibleTrendColumns: TrendColumnKey[],
): string {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.sector.length > 0) p.set('sector', f.sector.join(','));
  if (f.code) p.set('code', f.code);
  if (f.confidence.length > 0) p.set('confidence', f.confidence.join(','));
  if (f.monitoring) p.set('monitoring', f.monitoring);
  if (f.valuationZone.length > 0) p.set('valuationZone', f.valuationZone.join(','));
  p.set('sort', sort);
  p.set('dir', dir);
  p.set('page', String(page));
  p.set('limit', String(LIMIT));
  // Trend params (STORY-070) — only include when trend columns visible
  if (visibleTrendColumns.length > 0) {
    p.set('include', 'trend');
    if (f.eqTrendPreset === 'positive') { p.set('eq_trend_min', '0.3'); }
    else if (f.eqTrendPreset === 'negative') { p.set('eq_trend_max', '-0.3'); }
    if (f.dilutionFlagOnly) p.set('dilution_flag', 'true');
    if (f.minQuarters) p.set('min_quarters', f.minQuarters);
  }
  return p.toString();
}

function readFiltersFromParams(params: URLSearchParams): FilterState {
  return {
    search: params.get('search') ?? '',
    sector: params.get('sector') ? params.get('sector')!.split(',') : [],
    code: params.get('code') ?? '',
    confidence: params.get('confidence') ? params.get('confidence')!.split(',') : [],
    monitoring: (params.get('monitoring') as FilterState['monitoring']) ?? '',
    eqTrendPreset: (params.get('eq_trend_min') === '0.3' ? 'positive' : params.get('eq_trend_max') === '-0.3' ? 'negative' : '') as FilterState['eqTrendPreset'],
    dilutionFlagOnly: params.get('dilution_flag') === 'true',
    minQuarters: (params.get('min_quarters') as FilterState['minQuarters']) ?? '',
    valuationZone: params.get('valuationZone') ? params.get('valuationZone')!.split(',') : [],
  };
}

export default function UniversePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>(() => readFiltersFromParams(searchParams));
  const [sort, setSort] = useState<string>(() => searchParams.get('sort') ?? 'market_cap');
  const [dir, setDir] = useState<'asc' | 'desc'>(() => (searchParams.get('dir') as 'asc' | 'desc') ?? 'desc');
  const [page, setPage] = useState<number>(() => parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [data, setData] = useState<UniverseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectors, setSectors] = useState<string[]>([]);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Trend column chooser state (STORY-070) — hidden by default
  const [visibleTrendColumns, setVisibleTrendColumns] = useState<TrendColumnKey[]>([]);
  const [showTrendFilters, setShowTrendFilters] = useState(false);

  // Debounce search to avoid API call on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters.search]);

  // Load sectors once on mount
  useEffect(() => {
    fetch('/api/universe/sectors')
      .then(r => r.ok ? r.json() : { sectors: [] })
      .then((d: { sectors: string[] }) => setSectors(d.sectors))
      .catch(() => {});
  }, []);

  // Sync filters from URL on back/forward navigation
  useEffect(() => {
    setFilters(readFiltersFromParams(searchParams));
    setSort(searchParams.get('sort') ?? 'market_cap');
    setDir((searchParams.get('dir') as 'asc' | 'desc') ?? 'desc');
    setPage(parseInt(searchParams.get('page') ?? '1', 10) || 1);
  }, [searchParams]);

  // Fetch universe data
  const effectiveFilters = { ...filters, search: debouncedSearch };
  useEffect(() => {
    const qs = filtersToParams(effectiveFilters, sort, dir, page, visibleTrendColumns);
    // Update URL without navigation (replace current entry)
    router.replace(`${pathname}?${qs}`, { scroll: false });

    setLoading(true);
    setError(null);
    fetch(`/api/universe?${qs}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load universe (${res.status})`);
        return res.json() as Promise<UniverseResponse>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filters.sector, filters.code, filters.confidence, filters.monitoring,
      filters.eqTrendPreset, filters.dilutionFlagOnly, filters.minQuarters,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(filters.valuationZone),
      sort, dir, page, visibleTrendColumns]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  const handleFiltersChange = useCallback((next: FilterState) => {
    setFilters(next);
    setPage(1); // reset pagination on filter change
  }, []);

  const handleClear = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSort('market_cap');
    setDir('desc');
    setPage(1);
  }, []);

  const handleSort = useCallback((colKey: string, newDir: 'asc' | 'desc') => {
    setSort(colKey);
    setDir(newDir);
    setPage(1);
  }, []);

  const handleStockAdded = useCallback((stock: UniverseStockSummary) => {
    setData(prev => prev ? {
      ...prev,
      stocks: [stock, ...prev.stocks],
      total: prev.total + 1,
    } : prev);
  }, []);

  const handleToggleTrendColumn = useCallback((col: string) => {
    setVisibleTrendColumns(prev => {
      const key = col as TrendColumnKey;
      const next = prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key];
      // When any trend column becomes visible, show trend filters; hide when all hidden
      setShowTrendFilters(next.length > 0);
      return next;
    });
    setPage(1);
  }, []);

  const handleRemoveConfirm = useCallback(async (ticker: string) => {
    if (!data) return;
    setRemoveError(null);

    // Optimistic: remove from local list immediately
    const snapshot = data.stocks;
    setData(prev => prev ? {
      ...prev,
      stocks: prev.stocks.filter(s => s.ticker !== ticker),
      total: prev.total - 1,
    } : prev);

    try {
      const res = await fetch(`/api/universe/stocks/${ticker}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to remove ${ticker} (${res.status})`);
    } catch (err) {
      // Revert optimistic update
      setData(prev => prev ? { ...prev, stocks: snapshot, total: snapshot.length } : prev);
      setRemoveError(err instanceof Error ? err.message : `Failed to remove ${ticker}. Please try again.`);
    }
  }, [data]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FilterBar
        filters={filters}
        sectors={sectors}
        total={data?.total ?? 0}
        onChange={handleFiltersChange}
        onClear={handleClear}
        onAddStock={() => setShowAddModal(true)}
        showTrendFilters={showTrendFilters}
        visibleTrendColumns={visibleTrendColumns}
        onToggleTrendColumn={handleToggleTrendColumn}
      />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {loading && (
          <div aria-busy="true" aria-label="Loading stocks" style={{ padding: '16px 14px' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: '36px',
                  backgroundColor: T.cardBg,
                  borderRadius: 3,
                  marginBottom: 6,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <p role="alert" style={{ color: '#ef4444', padding: '14px' }}>
            {error}
          </p>
        )}

        {removeError && (
          <div
            role="alert"
            data-testid="remove-error-banner"
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 14px', background: '#ef444415', borderBottom: `1px solid #ef444430`,
              color: '#ef4444', fontSize: 12,
            }}
          >
            <span>{removeError}</span>
            <button
              onClick={() => setRemoveError(null)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {!loading && !error && data && (
          data.stocks.length === 0 ? (
            <p
              data-testid="no-results-message"
              style={{ color: T.textDim, textAlign: 'center', padding: '2rem' }}
            >
              No stocks match your current filters.
            </p>
          ) : (
            <StockTable
              stocks={data.stocks}
              sort={sort}
              dir={dir}
              onSort={handleSort}
              onRemoveConfirm={handleRemoveConfirm}
              visibleTrendColumns={visibleTrendColumns}
            />
          )
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        totalStocks={data?.total ?? 0}
        onPrev={() => setPage(p => Math.max(1, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages, p + 1))}
      />

      {showAddModal && (
        <AddStockModal
          onClose={() => setShowAddModal(false)}
          onAdded={(stock) => {
            handleStockAdded(stock);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}
