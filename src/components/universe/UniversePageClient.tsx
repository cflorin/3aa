// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: UniversePageClient — client component with fetch, pagination, state management
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React, { useEffect, useState } from 'react';
import StockTable from './StockTable';
import PaginationControls from './PaginationControls';
import type { UniverseStockSummary } from '@/domain/monitoring';

const LIMIT = 50;

interface UniverseResponse {
  stocks: UniverseStockSummary[];
  total: number;
  page: number;
  limit: number;
}

export default function UniversePageClient() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UniverseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/universe?page=${page}&limit=${LIMIT}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load universe (${res.status})`);
        return res.json() as Promise<UniverseResponse>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif', maxWidth: '100%' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 1rem' }}>
        Universe
      </h1>

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
          <StockTable stocks={data.stocks} />
          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </>
      )}
    </main>
  );
}
