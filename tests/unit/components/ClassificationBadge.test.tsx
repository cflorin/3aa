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

  it('"1AA" (bucket 1) → dark green badge', () => {
    render(<ClassificationBadge code="1AA" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.style.backgroundColor).toBe('rgb(20, 83, 45)'); // #14532d
  });

  it('"4AA" (bucket 4) → medium green badge', () => {
    render(<ClassificationBadge code="4AA" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.backgroundColor).toBe('rgb(22, 163, 74)'); // #16a34a
  });

  it('"7BC" (bucket 7) → red badge', () => {
    render(<ClassificationBadge code="7BC" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.backgroundColor).toBe('rgb(220, 38, 38)'); // #dc2626
  });

  it('"8" (bucket 8, bucket-only code) → darkest red', () => {
    render(<ClassificationBadge code="8" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.backgroundColor).toBe('rgb(153, 27, 27)'); // #991b1b
  });

  it('"5BA" (bucket 5) → amber badge', () => {
    render(<ClassificationBadge code="5BA" />);
    const badge = screen.getByTestId('classification-badge');
    expect(badge.style.backgroundColor).toBe('rgb(202, 138, 4)'); // #ca8a04
  });
});
