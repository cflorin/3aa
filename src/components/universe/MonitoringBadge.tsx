// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-002: MonitoringBadge — Inactive indicator for deactivated stocks
// PRD §Screen 2; RFC-003 §Universe Screen; STORY-046 (all-default-monitored model)

'use client';

import React from 'react';

interface MonitoringBadgeProps {
  isActive: boolean;
}

export default function MonitoringBadge({ isActive }: MonitoringBadgeProps) {
  if (isActive) return null;

  return (
    <span
      data-testid="monitoring-inactive-badge"
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: '#f3f4f6',
        color: '#6b7280',
        fontSize: '0.75rem',
        fontWeight: 600,
        border: '1px solid #d1d5db',
      }}
    >
      Inactive
    </span>
  );
}
