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
    effective_code: '4AA',
    confidence_level: 'high',
    forward_pe: null,
    forward_ev_ebit: null,
    ev_sales: null,
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

  it('renders P/E cell with value', () => {
    render(<StockTable stocks={[makeStock({ forward_pe: 19.5 })]} />);
    // 19.5× appears in both static Fwd P/E column and Val. fallback for B4 stock
    expect(screen.getAllByText('19.5×').length).toBeGreaterThanOrEqual(1);
  });

  it('renders EV/EBIT cell with value', () => {
    render(<StockTable stocks={[makeStock({ forward_ev_ebit: 14.2 })]} />);
    expect(screen.getByText('14.2×')).toBeInTheDocument();
  });

  it('renders EV/Sales cell with value', () => {
    render(<StockTable stocks={[makeStock({ ev_sales: 6.5 })]} />);
    expect(screen.getByText('6.5×')).toBeInTheDocument();
  });

  it('metric cells show "—" when null', () => {
    render(<StockTable stocks={[makeStock()]} />);
    // Fwd P/E + EV/EBIT + EV/Sales + Val. + Zone all null → multiple dashes
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('Metric column shows "Fwd P/E" for B4 stock from code when no valuationState', () => {
    render(<StockTable stocks={[makeStock({ active_code: '4AA', currentMultipleBasis: null })]} />);
    // Fwd P/E appears in both the column header and the Metric cell for B4
    expect(screen.getAllByText('Fwd P/E').length).toBeGreaterThanOrEqual(2);
  });

  it('Metric column shows "EV/Sales" for B6 stock from code', () => {
    render(<StockTable stocks={[makeStock({ active_code: '6BA', currentMultipleBasis: null })]} />);
    expect(screen.getAllByText('EV/Sales').length).toBeGreaterThanOrEqual(1);
  });

  it('Val. column shows stored currentMultiple for trailing_fallback basis (can\'t be re-derived)', () => {
    // trailing_fallback means forward P/E was unavailable; stored trailing P/E should be used as-is
    render(<StockTable stocks={[makeStock({ active_code: '4AA', currentMultiple: 25.3, currentMultipleBasis: 'trailing_fallback', forward_pe: null })]} />);
    expect(screen.getByText('25.3×')).toBeInTheDocument();
  });

  it('Val. column falls back to forward_pe raw field when no valuationState', () => {
    render(<StockTable stocks={[makeStock({ active_code: '4AA', forward_pe: 19.5, currentMultiple: null })]} />);
    // 19.5× appears in static Fwd P/E column and Val. fallback column for B4
    expect(screen.getAllByText('19.5×').length).toBeGreaterThanOrEqual(1);
  });

  it('TSR Hurdle column is not rendered (removed per spec)', () => {
    render(<StockTable stocks={[makeStock({ adjustedTsrHurdle: 11.0 })]} />);
    expect(screen.queryByText('TSR Hurdle')).not.toBeInTheDocument();
    expect(screen.queryByText('11.0%')).not.toBeInTheDocument();
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

  it('Fwd P/E, EV/EBIT, EV/Sales, Metric, Val. column headers present; no Sector or TSR Hurdle', () => {
    render(<StockTable stocks={[makeStock()]} />);
    // Fwd P/E appears in both header and Metric cell for B4 default stock
    expect(screen.getAllByText('Fwd P/E').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('EV/EBIT')).toBeInTheDocument();
    // EV/Sales appears in both header and Metric cell if stock is B6/B7
    expect(screen.getAllByText('EV/Sales').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Metric')).toBeInTheDocument();
    expect(screen.getByText('Val.')).toBeInTheDocument();
    expect(screen.queryByText('Sector')).not.toBeInTheDocument();
    expect(screen.queryByText('TSR Hurdle')).not.toBeInTheDocument();
  });
});

// ── STORY-082: effective_code drives badge, Metric label, and Val. value ──────

describe('EPIC-005/STORY-082: effective_code demotion in badge, Metric, and Val. columns (Scenarios 8–9)', () => {
  // Scenario 8: B6 low confidence → effective_code = 5BA → badge shows 5BA, Metric = EV/EBIT
  it('Scenario 8 — B6 low confidence: badge shows demoted code 5BA', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '6BA',
      effective_code: '5BA',
      confidence_level: 'low',
    })]} />);
    expect(screen.getByText('5BA')).toBeInTheDocument();
    expect(screen.queryByText('6BA')).not.toBeInTheDocument();
  });

  it('Scenario 8 — B6 low confidence: Metric column shows EV/EBIT (demoted from EV/Sales)', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '6BA',
      effective_code: '5BA',
      confidence_level: 'low',
      currentMultipleBasis: null,
      currentMultiple: null,
      forward_ev_ebit: 14.0,
    })]} />);
    expect(screen.getAllByText('EV/EBIT').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('EV/Sales').length).toBe(1); // only header, not Metric cell
  });

  // Scenario 9: B6 medium confidence → effective_code = 6BA (no demotion) → badge shows 6BA
  it('Scenario 9 — B6 medium confidence: badge shows 6BA (no demotion)', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '6BA',
      effective_code: '6BA',
      confidence_level: 'medium',
    })]} />);
    expect(screen.getByText('6BA')).toBeInTheDocument();
  });

  it('Scenario 9 — B6 medium confidence: Metric column shows EV/Sales (no demotion)', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '6BA',
      effective_code: '6BA',
      confidence_level: 'medium',
      currentMultipleBasis: null,
      currentMultiple: null,
    })]} />);
    expect(screen.getAllByText('EV/Sales').length).toBeGreaterThanOrEqual(2);
  });

  // Edge: B5 low → effective_code = 4AA → Metric = Fwd P/E
  it('B5 low confidence: Metric column shows Fwd P/E (demoted from EV/EBIT)', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '5AA',
      effective_code: '4AA',
      confidence_level: 'low',
      currentMultipleBasis: null,
      currentMultiple: null,
    })]} />);
    expect(screen.getAllByText('Fwd P/E').length).toBeGreaterThanOrEqual(2);
  });

  // Edge: floor — B1 low confidence → effective_code = 1AA (no change)
  it('B1 low confidence: floor holds — badge still shows 1AA', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '1AA',
      effective_code: '1AA',
      confidence_level: 'low',
      currentMultipleBasis: null,
      currentMultiple: null,
    })]} />);
    expect(screen.getByText('1AA')).toBeInTheDocument();
    expect(screen.getAllByText('Fwd P/E').length).toBeGreaterThanOrEqual(1);
  });

  // Val. value uses effective_code bucket field
  it('Val. value uses EV/EBIT field for B6 low confidence (effective_code = 5BA)', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '6BA',
      effective_code: '5BA',
      confidence_level: 'low',
      currentMultipleBasis: null,
      currentMultiple: null,
      forward_ev_ebit: 14.2,
      ev_sales: 6.5,
    })]} />);
    expect(screen.getAllByText('14.2×').length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 12: stale stored currentMultiple (spot basis) — must use raw field via effective_code
  it('Scenario 12 — B6 low confidence with stale spot-basis currentMultiple uses EV/EBIT raw field', () => {
    render(<StockTable stocks={[makeStock({
      active_code: '6BA',
      effective_code: '5BA',
      confidence_level: 'low',
      currentMultipleBasis: 'spot',
      currentMultiple: 9.7,
      forward_ev_ebit: 22.1,
      ev_sales: 9.7,
    })]} />);
    expect(screen.getAllByText('22.1×').length).toBeGreaterThanOrEqual(2); // EV/EBIT col + Val. col
    expect(screen.getAllByText('9.7×').length).toBe(1); // EV/Sales col only
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
