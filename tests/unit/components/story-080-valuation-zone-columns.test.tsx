/**
 * @jest-environment jsdom
 */
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-080: Universe Screen Valuation Zone Columns
// TASK-080-003: Unit tests — valuation zone columns in StockTable and zone filter in FilterBar

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true });

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StockTable from '../../../src/components/universe/StockTable';
import FilterBar, { EMPTY_FILTERS } from '../../../src/components/universe/FilterBar';
import type { UniverseStockSummary } from '../../../src/domain/monitoring/monitoring';

function makeStock(overrides: Partial<UniverseStockSummary> = {}): UniverseStockSummary {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    sector: 'Technology',
    market_cap: 3_000_000,
    current_price: 190.0,
    revenue_growth_fwd: 0.08,
    eps_growth_fwd: 0.12,
    operating_margin: 0.30,
    fcf_conversion: 0.85,
    net_debt_to_ebitda: 0.2,
    is_active: true,
    active_code: '4AA',
    confidence_level: 'high',
    valuationZone: null,
    currentMultiple: null,
    currentMultipleBasis: null,
    adjustedTsrHurdle: null,
    valuationStateStatus: null,
    ...overrides,
  };
}

describe('EPIC-005/STORY-080: StockTable valuation zone columns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders Zone badge for steal_zone', () => {
    render(<StockTable stocks={[makeStock({ valuationZone: 'steal_zone' })]} />);
    expect(screen.getByText('Steal')).toBeInTheDocument();
  });

  it('renders Zone badge for comfortable_zone', () => {
    render(<StockTable stocks={[makeStock({ valuationZone: 'comfortable_zone' })]} />);
    expect(screen.getByText('Comfortable')).toBeInTheDocument();
  });

  it('renders Zone badge for above_max', () => {
    render(<StockTable stocks={[makeStock({ valuationZone: 'above_max' })]} />);
    expect(screen.getByText('Above Max')).toBeInTheDocument();
  });

  it('renders Zone "—" for null valuationZone', () => {
    render(<StockTable stocks={[makeStock({ valuationZone: null })]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders Multiple cell with value and basis label', () => {
    render(<StockTable stocks={[makeStock({ currentMultiple: 19.5, currentMultipleBasis: 'forward_pe' })]} />);
    expect(screen.getByText(/19\.5×/)).toBeInTheDocument();
    expect(screen.getByText(/fwd P\/E/)).toBeInTheDocument();
  });

  it('renders Multiple cell with "—" when null', () => {
    render(<StockTable stocks={[makeStock({ currentMultiple: null })]} />);
    // Check at least one "—" exists (Multiple + TSR Hurdle + Zone are all null)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('renders TSR Hurdle with percentage format', () => {
    render(<StockTable stocks={[makeStock({ adjustedTsrHurdle: 11.0 })]} />);
    expect(screen.getByText('11.0%')).toBeInTheDocument();
  });

  it('renders TSR Hurdle "—" when null', () => {
    render(<StockTable stocks={[makeStock({ adjustedTsrHurdle: null })]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('Zone column header is present', () => {
    render(<StockTable stocks={[makeStock()]} />);
    expect(screen.getByText('Zone')).toBeInTheDocument();
  });

  it('Zone header triggers sort callback when onSort provided', () => {
    const onSort = jest.fn();
    render(<StockTable stocks={[makeStock()]} onSort={onSort} sort="market_cap" dir="desc" />);
    const zoneHeader = screen.getByText(/Zone/);
    fireEvent.click(zoneHeader);
    expect(onSort).toHaveBeenCalledWith('valuationZone', 'desc');
  });

  it('Multiple and TSR Hurdle column headers present', () => {
    render(<StockTable stocks={[makeStock()]} />);
    expect(screen.getByText('Multiple')).toBeInTheDocument();
    expect(screen.getByText('TSR Hurdle')).toBeInTheDocument();
  });
});

describe('EPIC-005/STORY-080: FilterBar valuation zone filter', () => {
  it('renders zone filter dropdown', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={10}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    expect(screen.getByTestId('filter-valuation-zone')).toBeInTheDocument();
  });

  it('zone filter default shows "All zones"', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={10}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    const select = screen.getByTestId('filter-valuation-zone') as HTMLSelectElement;
    expect(select.value).toBe('All');
  });

  it('selecting a zone calls onChange with valuationZone array', () => {
    const onChange = jest.fn();
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={10}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );
    const select = screen.getByTestId('filter-valuation-zone');
    fireEvent.change(select, { target: { value: 'steal_zone' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ valuationZone: ['steal_zone'] }));
  });

  it('selecting "All" clears valuationZone array', () => {
    const onChange = jest.fn();
    render(
      <FilterBar
        filters={{ ...EMPTY_FILTERS, valuationZone: ['steal_zone'] }}
        sectors={[]}
        total={10}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );
    const select = screen.getByTestId('filter-valuation-zone');
    fireEvent.change(select, { target: { value: 'All' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ valuationZone: [] }));
  });

  it('active zone filter increments filter count badge', () => {
    render(
      <FilterBar
        filters={{ ...EMPTY_FILTERS, valuationZone: ['comfortable_zone'] }}
        sectors={[]}
        total={10}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    expect(screen.getByText(/1 filter/)).toBeInTheDocument();
  });

  it('not_computed option is available in zone filter', () => {
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sectors={[]}
        total={10}
        onChange={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    const select = screen.getByTestId('filter-valuation-zone');
    expect(select).toContainHTML('not_computed');
  });
});
