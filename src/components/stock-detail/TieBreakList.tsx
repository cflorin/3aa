// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: TieBreakList — tie-break rule analysis section
// EPIC-004/STORY-054/TASK-054-007: Applied dark terminal theme
// PRD §Stock Detail; RFC-001 §ClassificationResult; STORY-043 (TieBreakRecord)

import React from 'react';
import type { TieBreakRecord } from '@/domain/classification/types';
import { T } from '@/lib/theme';

interface TieBreakListProps {
  tieBreaksFired: TieBreakRecord[];
}

export default function TieBreakList({ tieBreaksFired }: TieBreakListProps) {
  if (tieBreaksFired.length === 0) {
    return (
      <p
        data-testid="tie-break-empty"
        style={{ fontSize: 12, color: T.textDim }}
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
            background: T.sidebarBg,
            border: `1px solid ${T.border}`,
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 3,
              background: T.accent + '15',
              color: T.accent,
              border: `1px solid ${T.accent}30`,
              fontFamily: 'var(--font-dm-mono, monospace)',
            }}>
              {tb.rule}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{tb.description}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textMuted }}>
              Winner: <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: T.accent, fontWeight: 700 }}>
                Bucket {tb.winner}
              </span>
            </span>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>
            Condition: <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: T.text }}>{tb.condition}</span>
          </div>
          {tb.values && Object.keys(tb.values).length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              {Object.entries(tb.values).map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  <span style={{ color: T.textDim }}>{k.replace(/_/g, ' ')}: </span>
                  <span style={{ color: T.text, fontWeight: 600 }}>
                    {typeof v === 'boolean' ? String(v) : v ?? 'null'}
                  </span>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>{tb.outcome}</div>
          {tb.marginAtTrigger != null && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#eab308' }}>
              Score margin at trigger: {tb.marginAtTrigger}pt
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
