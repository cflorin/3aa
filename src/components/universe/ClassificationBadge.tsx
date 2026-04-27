// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: ClassificationBadge — 3AA code colored badge
// STORY-087: 3AA Code Tooltip — hover tooltip explaining bucket, EQ grade, BS grade
// EPIC-004/STORY-054/TASK-054-006: Applied dark terminal theme (screen-universe.jsx spec)
// PRD §Screen 2; RFC-003 §Universe Screen

'use client';

import React, { useState } from 'react';
import { T } from '@/lib/theme';

interface ClassificationBadgeProps {
  code: string | null;
}

const BUCKET_LABELS: Record<string, string> = {
  '1': 'Decline / harvest',
  '2': 'Defensive cash machine',
  '3': 'Durable stalwart',
  '4': 'Elite compounder',
  '5': 'Operating leverage grower',
  '6': 'High-growth emerging',
  '7': 'Hypergrowth / venture-like',
  '8': 'Lottery / binary',
};

const EQ_LABELS: Record<string, string> = {
  'A': 'Elite earnings quality',
  'B': 'Good earnings quality',
  'C': 'Fragile earnings',
};

const BS_LABELS: Record<string, string> = {
  'A': 'Fortress balance sheet',
  'B': 'Sound balance sheet',
  'C': 'Fragile balance sheet',
};

function buildTooltipLines(code: string): string[] {
  const lines: string[] = [];
  const bucket = code[0];
  const eq = code[1];
  const bs = code[2];

  if (bucket && BUCKET_LABELS[bucket]) {
    lines.push(`B${bucket}: ${BUCKET_LABELS[bucket]}`);
  }
  if (eq && EQ_LABELS[eq]) {
    lines.push(`EQ: ${eq} — ${EQ_LABELS[eq]}`);
  }
  if (bs && BS_LABELS[bs]) {
    lines.push(`BS: ${bs} — ${BS_LABELS[bs]}`);
  }
  return lines;
}

export default function ClassificationBadge({ code }: ClassificationBadgeProps) {
  const [hovered, setHovered] = useState(false);

  if (!code) {
    return <span style={{ color: T.textDim }}>—</span>;
  }

  const tooltipLines = buildTooltipLines(code);

  return (
    <span
      data-testid="classification-badge-wrapper"
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        data-testid="classification-badge"
        style={{
          display: 'inline-block',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 12,
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: 3,
          background: T.accent + '15',
          color: T.accent,
          border: `1px solid ${T.accent}30`,
        }}
      >
        {code}
      </span>

      {hovered && tooltipLines.length > 0 && (
        <div
          data-testid="classification-badge-tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 4,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          {tooltipLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: i === 0 ? T.text : T.textDim,
                lineHeight: '1.6',
                fontFamily: 'var(--font-dm-mono, monospace)',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
