/**
 * @jest-environment jsdom
 */
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-086: Recompute Valuations — Admin API & Universe Screen Button
// TASK-086-004: FilterBar integration tests — onRecomputeValuation prop
// Fixtures: synthetic

// Mock both recompute buttons so FilterBar tests don't trigger fetch calls
jest.mock('../../../src/components/universe/RecomputeClassificationButton', () => {
  const React = require('react');
  return function MockRecomputeClassificationButton({ onSuccess }: { onSuccess?: () => void }) {
    return React.createElement('button', {
      'data-testid': 'recompute-classification-btn',
      onClick: () => onSuccess?.({ processed: 1, recomputed: 1, skipped: 0, errors: 0, duration_ms: 10 }),
    }, 'Recompute Classification');
  };
});

jest.mock('../../../src/components/universe/RecomputeValuationButton', () => {
  const React = require('react');
  return function MockRecomputeValuationButton({ onSuccess }: { onSuccess?: () => void }) {
    return React.createElement('button', {
      'data-testid': 'recompute-valuation-btn',
      onClick: () => onSuccess?.({ total: 5, updated: 5, skipped: 0, errors: 0, duration_ms: 20 }),
    }, 'Recompute Valuations');
  };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar, { EMPTY_FILTERS } from '../../../src/components/universe/FilterBar';

describe('EPIC-005/STORY-086/TASK-086-004: FilterBar — Recompute Valuations', () => {
  it('does not render recompute valuation button when onRecomputeValuation prop absent', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('recompute-valuation-btn')).toBeNull();
  });

  it('renders recompute valuation button when onRecomputeValuation prop provided', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
        onRecomputeValuation={jest.fn()}
      />,
    );
    expect(screen.getByTestId('recompute-valuation-btn')).toBeInTheDocument();
  });

  it('fires onRecomputeValuation with summary when button succeeds', () => {
    const onRecompute = jest.fn();
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
        onRecomputeValuation={onRecompute}
      />,
    );
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    expect(onRecompute).toHaveBeenCalledWith(
      expect.objectContaining({ updated: 5 }),
    );
  });

  it('both recompute buttons coexist when both props provided', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
        onRecomputeClassification={jest.fn()}
        onRecomputeValuation={jest.fn()}
      />,
    );
    expect(screen.getByTestId('recompute-classification-btn')).toBeInTheDocument();
    expect(screen.getByTestId('recompute-valuation-btn')).toBeInTheDocument();
  });

  it('add-stock, classification and valuation buttons all coexist', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
        onAddStock={jest.fn()}
        onRecomputeClassification={jest.fn()}
        onRecomputeValuation={jest.fn()}
      />,
    );
    expect(screen.getByTestId('add-stock-btn')).toBeInTheDocument();
    expect(screen.getByTestId('recompute-classification-btn')).toBeInTheDocument();
    expect(screen.getByTestId('recompute-valuation-btn')).toBeInTheDocument();
  });
});
