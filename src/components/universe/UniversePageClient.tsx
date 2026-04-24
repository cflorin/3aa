// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: UniversePageClient — client component with fetch, pagination, state management
// STORY-049: Added FilterBar, column sort, URL state round-trip
// PRD §Screen 2; RFC-003 §Universe Screen; RFC-003 §Filtering and Sort

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import StockTable from './StockTable';
import PaginationControls from './PaginationControls';
import FilterBar, { EMPTY_FILTERS, type FilterState } from './FilterBar';
import type { UniverseStockSummary } from '@/domain/monitoring';

const LIMIT = 50;

interface UniverseResponse {
  stocks: UniverseStockSummary[];
  total: number;
  page: number;
  limit: number;
}

function filtersToParams(f: FilterState, sort: string, dir: 'asc' | 'desc', page: number): string {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.sector.length > 0) p.set('sector', f.sector.join(','));
  if (f.code) p.set('code', f.code);
  if (f.confidence.length > 0) p.set('confidence', f.confidence.join(','));
  if (f.monitoring) p.set('monitoring', f.monitoring);
  p.set('sort', sort);
  p.set('dir', dir);
  p.set('page', String(page));
  p.set('limit', String(LIMIT));
  return p.toString();
}

function readFiltersFromParams(params: URLSearchParams): FilterState {
  return {
    search: params.get('search') ?? '',
    sector: params.get('sector') ? params.get('sector')!.split(',') : [],
    code: params.get('code') ?? '',
    confidence: params.get('confidence') ? params.get('confidence')!.split(',') : [],
    monitoring: (params.get('monitoring') as FilterState['monitoring']) ?? '',
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
    const qs = filtersToParams(effectiveFilters, sort, dir, page);
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
  }, [debouncedSearch, filters.sector, filters.code, filters.confidence, filters.monitoring, sort, dir, page]);

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

  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif', maxWidth: '100%' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 1rem' }}>
        Universe
      </h1>

      <FilterBar
        filters={filters}
        sectors={sectors}
        onChange={handleFiltersChange}
        onClear={handleClear}
      />

      {loading && (
        <div aria-busy="true" aria-label="Loading stocks" style={{ padding: '2rem', color: '#6b7280' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: '40px',
                backgroundColor: '#f3f4f6',
                borderRadius: '4px',
                marginBottom: '8px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <p role="alert" style={{ color: '#dc2626', padding: '1rem' }}>
          {error}
        </p>
      )}

      {!loading && !error && data && (
        <>
          {data.stocks.length === 0 ? (
            <p
              data-testid="no-results-message"
              style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}
            >
              No stocks match your current filters.
            </p>
          ) : (
            <StockTable stocks={data.stocks} sort={sort} dir={dir} onSort={handleSort} />
          )}
          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        </>
      )}
    </main>
  );
}
