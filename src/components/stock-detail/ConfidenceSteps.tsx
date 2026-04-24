// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: ConfidenceSteps — ordered confidence derivation chain (ADR-014)
// EPIC-004/STORY-054/TASK-054-007: Applied dark terminal theme
// PRD §Stock Detail; RFC-001 §ClassificationResult; ADR-014 §Confidence Computation

import React from 'react';
import type { ConfidenceStep } from '@/domain/classification/types';
import { T } from '@/lib/theme';

interface ConfidenceStepsProps {
  steps: ConfidenceStep[];
}

const BAND_COLORS: Record<string, { color: string }> = {
  high:   { color: '#16a34a' },
  medium: { color: '#eab308' },
  low:    { color: '#ef4444' },
};

export default function ConfidenceSteps({ steps }: ConfidenceStepsProps) {
  if (steps.length === 0) {
    return <p style={{ fontSize: 12, color: T.textDim }}>No confidence derivation steps available.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((step, i) => {
        const bad = (step.tieBreaks ?? 0) > 0 || (step.missing ?? 0) >= 3;
        const { color } = BAND_COLORS[step.band] ?? BAND_COLORS.low;
        return (
          <div
            key={i}
            data-testid={`confidence-step-${i}`}
            style={{
              display: 'flex',
              gap: 10,
              padding: '7px 0',
              borderBottom: `1px solid ${T.borderFaint}`,
              alignItems: 'flex-start',
            }}
          >
            <div style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              flexShrink: 0,
              background: bad ? '#ef444412' : '#16a34a12',
              border: `1px solid ${bad ? '#ef444430' : '#16a34a30'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: bad ? '#ef4444' : '#16a34a',
            }}>
              {step.step}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{step.label}</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{step.note}</div>
            </div>
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 3,
              background: color + '15',
              color,
              border: `1px solid ${color}33`,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              alignSelf: 'center',
            }}>
              {step.band}
            </span>
          </div>
        );
      })}
    </div>
  );
}
