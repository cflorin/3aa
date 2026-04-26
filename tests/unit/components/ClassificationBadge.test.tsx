/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-003: Unit tests — ClassificationBadge
// STORY-087: 3AA Code Tooltip — tooltip content and visibility tests added
// PRD §Screen 2; RFC-003 §Universe Screen

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('EPIC-004/STORY-087: ClassificationBadge — 3AA code tooltip', () => {

  it('tooltip is hidden by default', () => {
    render(<ClassificationBadge code="4AA" />);
    expect(screen.queryByTestId('classification-badge-tooltip')).not.toBeInTheDocument();
  });

  it('null code — no tooltip rendered on hover', () => {
    const { container } = render(<ClassificationBadge code={null} />);
    const wrapper = container.firstChild as HTMLElement;
    if (wrapper) fireEvent.mouseEnter(wrapper);
    expect(screen.queryByTestId('classification-badge-tooltip')).not.toBeInTheDocument();
  });

  it('"4AA" — tooltip shows correct bucket, EQ, and BS labels on hover', () => {
    render(<ClassificationBadge code="4AA" />);
    fireEvent.mouseEnter(screen.getByTestId('classification-badge-wrapper'));
    const tooltip = screen.getByTestId('classification-badge-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain('B4: Elite compounder');
    expect(tooltip.textContent).toContain('EQ: A');
    expect(tooltip.textContent).toContain('Elite earnings quality');
    expect(tooltip.textContent).toContain('BS: A');
    expect(tooltip.textContent).toContain('Fortress balance sheet');
  });

  it('"2CB" — tooltip shows correct labels for bucket 2, EQ C, BS B', () => {
    render(<ClassificationBadge code="2CB" />);
    fireEvent.mouseEnter(screen.getByTestId('classification-badge-wrapper'));
    const tooltip = screen.getByTestId('classification-badge-tooltip');
    expect(tooltip.textContent).toContain('B2: Defensive cash machine');
    expect(tooltip.textContent).toContain('EQ: C');
    expect(tooltip.textContent).toContain('Fragile earnings');
    expect(tooltip.textContent).toContain('BS: B');
    expect(tooltip.textContent).toContain('Sound balance sheet');
  });

  it('"8CC" — tooltip shows bucket 8 label', () => {
    render(<ClassificationBadge code="8CC" />);
    fireEvent.mouseEnter(screen.getByTestId('classification-badge-wrapper'));
    const tooltip = screen.getByTestId('classification-badge-tooltip');
    expect(tooltip.textContent).toContain('B8: Lottery / binary');
  });

  it('tooltip disappears on mouse-out', () => {
    render(<ClassificationBadge code="4AA" />);
    const wrapper = screen.getByTestId('classification-badge-wrapper');
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByTestId('classification-badge-tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByTestId('classification-badge-tooltip')).not.toBeInTheDocument();
  });

  it('partial code "3" — tooltip shows bucket label only, no EQ/BS crash', () => {
    render(<ClassificationBadge code="3" />);
    fireEvent.mouseEnter(screen.getByTestId('classification-badge-wrapper'));
    const tooltip = screen.getByTestId('classification-badge-tooltip');
    expect(tooltip.textContent).toContain('B3: Durable stalwart');
    // Should not crash — just no EQ/BS lines
  });

  it('all 8 bucket labels are correct', () => {
    const buckets: [string, string][] = [
      ['1AA', 'Decline / harvest'],
      ['2AA', 'Defensive cash machine'],
      ['3AA', 'Durable stalwart'],
      ['4AA', 'Elite compounder'],
      ['5AA', 'Operating leverage grower'],
      ['6AA', 'High-growth emerging'],
      ['7AA', 'Hypergrowth / venture-like'],
      ['8AA', 'Lottery / binary'],
    ];
    for (const [code, label] of buckets) {
      const { unmount } = render(<ClassificationBadge code={code} />);
      fireEvent.mouseEnter(screen.getByTestId('classification-badge-wrapper'));
      expect(screen.getByTestId('classification-badge-tooltip').textContent).toContain(label);
      unmount();
    }
  });
});
