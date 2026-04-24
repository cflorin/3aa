/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-003: Unit tests — ClassificationBadge
// PRD §Screen 2; RFC-003 §Universe Screen

import React from 'react';
import { render, screen } from '@testing-library/react';
import ClassificationBadge from '../../../src/components/universe/ClassificationBadge';

describe('EPIC-004/STORY-048/TASK-048-003: ClassificationBadge', () => {

  it('null code → renders "—" without badge element', () => {
    render(<ClassificationBadge code={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByTestId('classification-badge')).not.toBeInTheDocument();
  });

  it('"4AA" → renders badge with text "4AA"', () => {
    render(<ClassificationBadge code="4AA" />);
    expect(screen.getByTestId('classification-badge')).toHaveTextContent('4AA');
  });

  // Dark theme: all codes use accent color styling (T.accent = #2dd4bf)
  it('"1AA" → renders badge with accent color', () => {
    render(<ClassificationBadge code="1AA" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.style.color).toBe('rgb(45, 212, 191)'); // #2dd4bf accent
  });

  it('"4AA" → renders badge with accent color', () => {
    render(<ClassificationBadge code="4AA" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.color).toBe('rgb(45, 212, 191)'); // #2dd4bf accent
  });

  it('"7BC" → renders badge with accent color', () => {
    render(<ClassificationBadge code="7BC" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.color).toBe('rgb(45, 212, 191)'); // #2dd4bf accent
  });

  it('"8" (bucket-only code) → renders badge with accent color', () => {
    render(<ClassificationBadge code="8" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.color).toBe('rgb(45, 212, 191)'); // #2dd4bf accent
  });

  it('"5BA" → renders badge with accent color', () => {
    render(<ClassificationBadge code="5BA" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.color).toBe('rgb(45, 212, 191)'); // #2dd4bf accent
  });
});
