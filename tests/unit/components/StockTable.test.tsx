/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-003: Unit tests — StockTable component
// STORY-050: Added tests for inactive row muting (opacity)
// PRD §Screen 2; RFC-003 §Universe Screen

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock fetch — MonitoringToggle makes fetch calls on user interaction only
global.fetch = jest.fn().mockResolvedValue({ ok: true });

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StockTable from '../../../src/components/universe/StockTable';
import type { UniverseStockSummary } from '../../../src/domain/monitoring/monitoring';

function makeStock(overrides: Partial<UniverseStockSummary> = {}): UniverseStockSummary {
  return {
    ticker: 'MSFT',
    company_name: 'Microsoft Corporation',
    sector: 'Technology',
    market_cap: 3_000_000,
    current_price: 420.0,
    revenue_growth_fwd: 0.12,
    eps_growth_fwd: 0.15,
    operating_margin: 0.45,
    fcf_conversion: 0.90,
    net_debt_to_ebitda: 0.3,
    is_active: true,
    active_code: '3AA',
    confidence_level: 'high',
    ...overrides,
  };
}

describe('EPIC-004/STORY-048/TASK-048-003: StockTable', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders 3 rows for 3 stocks', () => {
    const stocks = [
      makeStock({ ticker: 'MSFT' }),
      makeStock({ ticker: 'ADBE' }),
      makeStock({ ticker: 'UNH' }),
    ];
    render(<StockTable stocks={stocks} />);
    // 3 data rows + 1 header row
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('shows empty state when stocks array is empty', () => {
    render(<StockTable stocks={[]} />);
    expect(screen.getByText(/no stocks in universe/i)).toBeInTheDocument();
  });

  it('renders all 13 column headers', () => {
    render(<StockTable stocks={[makeStock()]} />);
    expect(screen.getByText('Ticker')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Sector')).toBeInTheDocument();
    expect(screen.getByText('3AA Code')).toBeInTheDocument();
    expect(screen.getByText('Confidence')).toBeInTheDocument();
    expect(screen.getByText('Zone')).toBeInTheDocument();
    expect(screen.getByText('Market Cap')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Rev Growth Fwd')).toBeInTheDocument();
    expect(screen.getByText('EPS Growth Fwd')).toBeInTheDocument();
    expect(screen.getByText('FCF Conv')).toBeInTheDocument();
    expect(screen.getByText('Net Debt/EBITDA')).toBeInTheDocument();
    expect(screen.getByText('Op Margin')).toBeInTheDocument();
  });

  it('Inactive badge shown for is_active=false stock', () => {
    render(<StockTable stocks={[makeStock({ is_active: false })]} />);
    expect(screen.getByTestId('monitoring-inactive-badge')).toBeInTheDocument();
    expect(screen.getByTestId('monitoring-inactive-badge')).toHaveTextContent('Inactive');
  });

  it('no Inactive badge for is_active=true stock', () => {
    render(<StockTable stocks={[makeStock({ is_active: true })]} />);
    expect(screen.queryByTestId('monitoring-inactive-badge')).not.toBeInTheDocument();
  });

  it('null active_code → ClassificationBadge shows "—"', () => {
    render(<StockTable stocks={[makeStock({ active_code: null })]} />);
    expect(screen.queryByTestId('classification-badge')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('row click navigates to /stocks/[ticker]', () => {
    render(<StockTable stocks={[makeStock({ ticker: 'MSFT' })]} />);
    const rows = screen.getAllByRole('row');
    fireEvent.click(rows[1]); // first data row
    expect(mockPush).toHaveBeenCalledWith('/stocks/MSFT');
  });

  it('Zone column shows "—" for all rows', () => {
    render(<StockTable stocks={[makeStock(), makeStock({ ticker: 'ADBE' })]} />);
    // Multiple "—" cells expected (Zone + any null metrics)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  // ── STORY-050: Inactive row muting ─────────────────────────────────────────

  it('inactive row (is_active=false) has reduced opacity', () => {
    render(<StockTable stocks={[makeStock({ is_active: false, ticker: 'MSFT' })]} />);
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1]; // first data row
    // Dark theme uses opacity 0.5 for inactive rows
    expect(dataRow).toHaveStyle('opacity: 0.5');
  });

  it('active row (is_active=true) has full opacity', () => {
    render(<StockTable stocks={[makeStock({ is_active: true, ticker: 'MSFT' })]} />);
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    expect(dataRow).toHaveStyle('opacity: 1');
  });

  // ── STORY-051: Classification badge click ────────────────────────────────────

  it('badge click does not trigger row navigation (stopPropagation)', () => {
    render(<StockTable stocks={[makeStock({ ticker: 'MSFT', active_code: '4AA' })]} />);
    const badgeBtn = screen.getByRole('button', { name: /open classification detail for MSFT/i });
    fireEvent.click(badgeBtn);
    // Row navigation (mockPush) must NOT have been called
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('classification badge button is present even when active_code is null', () => {
    render(<StockTable stocks={[makeStock({ ticker: 'MSFT', active_code: null })]} />);
    const badgeBtn = screen.getByRole('button', { name: /open classification detail for MSFT/i });
    expect(badgeBtn).toBeInTheDocument();
  });
});
