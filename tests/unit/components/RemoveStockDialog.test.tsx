/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-055: Remove Stock from Universe
// TASK-055-006: Component tests — RemoveStockDialog + StockTable remove flow
// Fixtures: synthetic

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../../src/components/universe/ClassificationModal', () => {
  const React = require('react');
  return function MockModal() { return React.createElement('div', null); };
});

jest.mock('../../../src/components/universe/MonitoringToggle', () => {
  const React = require('react');
  return function MockToggle() { return React.createElement('div', null); };
});

global.fetch = jest.fn();

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RemoveStockDialog from '../../../src/components/universe/RemoveStockDialog';
import StockTable from '../../../src/components/universe/StockTable';
import StockDetailClient from '../../../src/components/stock-detail/StockDetailClient';
import type { UniverseStockSummary } from '../../../src/domain/monitoring';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStock(ticker: string): UniverseStockSummary {
  return {
    ticker,
    company_name: `${ticker} Corp`,
    sector: 'Technology',
    active_code: '4AA',
    suggested_code: '4AA',
    confidence_level: 'medium',
    is_active: true,
    market_cap: 1_000_000,
    revenue_growth_fwd: 0.12,
    eps_growth_fwd: 0.10,
    fcf_conversion: 0.85,
    net_debt_to_ebitda: 0.5,
    operating_margin: 0.30,
  } as UniverseStockSummary;
}

const STOCKS = [makeStock('MSFT'), makeStock('TSLA')];

// ── RemoveStockDialog ─────────────────────────────────────────────────────────

describe('EPIC-004/STORY-055: RemoveStockDialog', () => {

  it('renders with ticker name prominently', () => {
    render(<RemoveStockDialog ticker="TSLA" onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText(/TSLA/)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = jest.fn();
    render(<RemoveStockDialog ticker="TSLA" onConfirm={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('remove-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when Remove button clicked', () => {
    const onConfirm = jest.fn();
    render(<RemoveStockDialog ticker="TSLA" onConfirm={onConfirm} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTestId('remove-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay background clicked', () => {
    const onCancel = jest.fn();
    const { container } = render(<RemoveStockDialog ticker="TSLA" onConfirm={jest.fn()} onCancel={onCancel} />);
    // click the overlay (first div)
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape key pressed', () => {
    const onCancel = jest.fn();
    render(<RemoveStockDialog ticker="TSLA" onConfirm={jest.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows loading state and disables buttons when loading=true', () => {
    render(<RemoveStockDialog ticker="TSLA" onConfirm={jest.fn()} onCancel={jest.fn()} loading />);
    expect(screen.getByTestId('remove-dialog-confirm')).toBeDisabled();
    expect(screen.getByTestId('remove-dialog-cancel')).toBeDisabled();
    expect(screen.getByTestId('remove-dialog-confirm')).toHaveTextContent('Removing…');
  });
});

// ── StockTable remove button ──────────────────────────────────────────────────

describe('EPIC-004/STORY-055: StockTable — remove button', () => {

  it('shows remove button for each row when onRemoveConfirm provided', () => {
    render(<StockTable stocks={STOCKS} onRemoveConfirm={jest.fn()} />);
    expect(screen.getByTestId('remove-btn-MSFT')).toBeInTheDocument();
    expect(screen.getByTestId('remove-btn-TSLA')).toBeInTheDocument();
  });

  it('does NOT show remove buttons when onRemoveConfirm is omitted', () => {
    render(<StockTable stocks={STOCKS} />);
    expect(screen.queryByTestId('remove-btn-MSFT')).not.toBeInTheDocument();
  });

  it('clicking remove button opens dialog with correct ticker', () => {
    render(<StockTable stocks={STOCKS} onRemoveConfirm={jest.fn()} />);
    fireEvent.click(screen.getByTestId('remove-btn-TSLA'));
    // Dialog should be visible
    expect(screen.getByTestId('remove-dialog-confirm')).toBeInTheDocument();
    // Dialog title contains the ticker
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText(/TSLA/).length).toBeGreaterThan(0);
  });

  it('clicking Cancel closes dialog without calling onRemoveConfirm', () => {
    const onRemoveConfirm = jest.fn();
    render(<StockTable stocks={STOCKS} onRemoveConfirm={onRemoveConfirm} />);
    fireEvent.click(screen.getByTestId('remove-btn-TSLA'));
    fireEvent.click(screen.getByTestId('remove-dialog-cancel'));
    expect(onRemoveConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('remove-dialog-confirm')).not.toBeInTheDocument();
  });

  it('clicking Remove in dialog calls onRemoveConfirm with correct ticker', () => {
    const onRemoveConfirm = jest.fn();
    render(<StockTable stocks={STOCKS} onRemoveConfirm={onRemoveConfirm} />);
    fireEvent.click(screen.getByTestId('remove-btn-TSLA'));
    fireEvent.click(screen.getByTestId('remove-dialog-confirm'));
    expect(onRemoveConfirm).toHaveBeenCalledWith('TSLA');
    expect(screen.queryByTestId('remove-dialog-confirm')).not.toBeInTheDocument();
  });

  it('remove button click stops row navigation (stopPropagation)', () => {
    // The row onClick navigates; remove button should not trigger it
    const onRemoveConfirm = jest.fn();
    render(<StockTable stocks={STOCKS} onRemoveConfirm={onRemoveConfirm} />);
    fireEvent.click(screen.getByTestId('remove-btn-MSFT'));
    // router.push should NOT have been called from the row click
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ── StockDetailClient — not-in-universe state ─────────────────────────────────

describe('EPIC-004/STORY-055: StockDetailClient — not-in-universe 404 state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
  });

  it('renders not-in-universe state when API returns 404', async () => {
    render(<StockDetailClient ticker="TSLA" />);
    await waitFor(() => {
      expect(screen.getByTestId('not-in-universe-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/not in your monitored universe/i)).toBeInTheDocument();
  });

  it('"Back to Universe" button navigates to /universe', async () => {
    render(<StockDetailClient ticker="TSLA" />);
    await waitFor(() => screen.getByTestId('not-in-universe-state'));
    fireEvent.click(screen.getByText(/Back to Universe/i));
    expect(mockPush).toHaveBeenCalledWith('/universe');
  });
});
