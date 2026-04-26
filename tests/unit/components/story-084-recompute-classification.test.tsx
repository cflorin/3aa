/**
 * @jest-environment jsdom
 */
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-084: Recompute Classification — Admin API & Universe Screen Button
// TASK-084-004: FilterBar integration tests — onRecomputeClassification prop
// Fixtures: synthetic

// Mock RecomputeClassificationButton so FilterBar tests don't trigger fetch calls
jest.mock('../../../src/components/universe/RecomputeClassificationButton', () => {
  const React = require('react');
  return function MockRecomputeButton({ onSuccess }: { onSuccess?: () => void }) {
    return React.createElement('button', {
      'data-testid': 'recompute-classification-btn',
      onClick: () => onSuccess?.({ processed: 1, recomputed: 1, skipped: 0, errors: 0, duration_ms: 10 }),
    }, 'Recompute Classification');
  };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar, { EMPTY_FILTERS } from '../../../src/components/universe/FilterBar';

describe('EPIC-005/STORY-084/TASK-084-004: FilterBar — Recompute Classification', () => {
  it('does not render recompute button when onRecomputeClassification prop absent', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('recompute-classification-btn')).toBeNull();
  });

  it('renders recompute button when onRecomputeClassification prop provided', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
        onRecomputeClassification={jest.fn()}
      />,
    );
    expect(screen.getByTestId('recompute-classification-btn')).toBeInTheDocument();
  });

  it('fires onRecomputeClassification with summary when button succeeds', () => {
    const onRecompute = jest.fn();
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
        onRecomputeClassification={onRecompute}
      />,
    );
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));
    expect(onRecompute).toHaveBeenCalledWith(
      expect.objectContaining({ recomputed: 1 }),
    );
  });

  it('add-stock button still renders alongside recompute button', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={5}
        onChange={jest.fn()}
        onClear={jest.fn()}
        onAddStock={jest.fn()}
        onRecomputeClassification={jest.fn()}
      />,
    );
    expect(screen.getByTestId('add-stock-btn')).toBeInTheDocument();
    expect(screen.getByTestId('recompute-classification-btn')).toBeInTheDocument();
  });
});
