/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-003: Unit tests — ConfidenceBadge
// PRD §Screen 2; RFC-003 §Universe Screen

import React from 'react';
import { render, screen } from '@testing-library/react';
import ConfidenceBadge from '../../../src/components/universe/ConfidenceBadge';

describe('EPIC-004/STORY-048/TASK-048-003: ConfidenceBadge', () => {

  it('null → renders "—" without badge', () => {
    render(<ConfidenceBadge confidence={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument();
  });

  it('"high" → renders green badge with text "High"', () => {
    render(<ConfidenceBadge confidence="high" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('High');
    expect(badge.style.color).toBe('rgb(21, 128, 61)'); // #15803d green
  });

  it('"medium" → renders yellow badge with text "Medium"', () => {
    render(<ConfidenceBadge confidence="medium" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Medium');
    expect(badge.style.color).toBe('rgb(133, 77, 14)'); // #854d0e yellow
  });

  it('"low" → renders orange badge with text "Low"', () => {
    render(<ConfidenceBadge confidence="low" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Low');
    expect(badge.style.color).toBe('rgb(154, 52, 18)'); // #9a3412 orange
  });

  it('unknown string → renders "—"', () => {
    render(<ConfidenceBadge confidence="unknown" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
