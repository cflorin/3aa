// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-002: ConfidenceSteps — ordered confidence derivation chain (ADR-014)
// PRD §Stock Detail; RFC-001 §ClassificationResult; ADR-014 §Confidence Computation

import React from 'react';
import type { ConfidenceStep } from '@/domain/classification/types';

interface ConfidenceStepsProps {
  steps: ConfidenceStep[];
}

const BAND_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: '#dcfce7', text: '#15803d' },
  medium: { bg: '#fef9c3', text: '#854d0e' },
  low: { bg: '#fee2e2', text: '#dc2626' },
};

export default function ConfidenceSteps({ steps }: ConfidenceStepsProps) {
  if (steps.length === 0) {
    return <p style={{ fontSize: 12, color: '#6b7280' }}>No confidence derivation steps available.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((step, i) => {
        const bad = (step.tieBreaks ?? 0) > 0 || (step.missing ?? 0) >= 3;
        const colors = BAND_COLORS[step.band] ?? BAND_COLORS.low;
        return (
          <div
            key={i}
            data-testid={`confidence-step-${i}`}
            style={{
              display: 'flex',
              gap: 10,
              padding: '7px 0',
              borderBottom: '1px solid #f3f4f6',
              alignItems: 'flex-start',
            }}
          >
            <div style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              flexShrink: 0,
              background: bad ? '#fee2e220' : '#dcfce720',
              border: `1px solid ${bad ? '#dc262640' : '#15803d40'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: bad ? '#dc2626' : '#15803d',
            }}>
              {step.step}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{step.label}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{step.note}</div>
            </div>
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 4,
              background: colors.bg,
              color: colors.text,
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
