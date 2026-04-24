// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: TieBreakList — tie-break rule analysis section
// PRD §Stock Detail; RFC-001 §ClassificationResult; STORY-043 (TieBreakRecord)

import React from 'react';
import type { TieBreakRecord } from '@/domain/classification/types';

interface TieBreakListProps {
  tieBreaksFired: TieBreakRecord[];
}

export default function TieBreakList({ tieBreaksFired }: TieBreakListProps) {
  if (tieBreaksFired.length === 0) {
    return (
      <p
        data-testid="tie-break-empty"
        style={{ fontSize: 12, color: '#6b7280' }}
      >
        No tie-breaks fired.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tieBreaksFired.map((tb, i) => (
        <div
          key={i}
          data-testid={`tie-break-${i}`}
          style={{
            padding: '10px 12px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 3,
              background: '#f0fdf420',
              color: '#15803d',
              border: '1px solid #15803d40',
              fontFamily: 'monospace',
            }}>
              {tb.rule}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{tb.description}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>
              Winner: <span style={{ fontFamily: 'monospace', color: '#15803d', fontWeight: 700 }}>
                Bucket {tb.winner}
              </span>
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            Condition: <span style={{ fontFamily: 'monospace', color: '#374151' }}>{tb.condition}</span>
          </div>
          {tb.values && Object.keys(tb.values).length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              {Object.entries(tb.values).map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  <span style={{ color: '#9ca3af' }}>{k.replace(/_/g, ' ')}: </span>
                  <span style={{ color: '#111827', fontWeight: 600 }}>
                    {typeof v === 'boolean' ? String(v) : v ?? 'null'}
                  </span>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{tb.outcome}</div>
          {tb.marginAtTrigger != null && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#854d0e' }}>
              Score margin at trigger: {tb.marginAtTrigger}pt
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
