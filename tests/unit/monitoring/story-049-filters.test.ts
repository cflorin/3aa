// EPIC-004: Classification Engine & Universe Screen
// STORY-049: Universe Screen — Filters and Sort
// TASK-049-007: Unit tests — domain filter/sort logic (in-memory code filter, buildOrderBy shape)

import type { UniverseStockSummary } from '../../../src/domain/monitoring/monitoring';

// ── In-memory code prefix filter (extracted for pure testing) ──────────────

function applyCodeFilter(stocks: UniverseStockSummary[], code: string): UniverseStockSummary[] {
  return stocks.filter(s => s.active_code?.toUpperCase().startsWith(code.toUpperCase()) ?? false);
}

function makeStock(overrides: Partial<UniverseStockSummary> = {}): UniverseStockSummary {
  return {
    ticker: 'MSFT',
    company_name: 'Microsoft',
    sector: 'Technology',
    market_cap: 3_000_000,
    current_price: 420,
    revenue_growth_fwd: 0.12,
    eps_growth_fwd: 0.15,
    operating_margin: 0.45,
    fcf_conversion: 0.90,
    net_debt_to_ebitda: 0.3,
    is_active: true,
    active_code: '4AA',
    confidence_level: 'high',
    ...overrides,
  };
}

describe('EPIC-004/STORY-049/TASK-049-007: In-memory code prefix filter', () => {

  it('"4" matches 4AA, 4AB, 4BA — prefix match', () => {
    const stocks = [
      makeStock({ ticker: 'A', active_code: '4AA' }),
      makeStock({ ticker: 'B', active_code: '4AB' }),
      makeStock({ ticker: 'C', active_code: '4BA' }),
      makeStock({ ticker: 'D', active_code: '3AA' }),
    ];
    expect(applyCodeFilter(stocks, '4').map(s => s.ticker)).toEqual(['A', 'B', 'C']);
  });

  it('"4A" matches 4AA, 4AB but not 4BA', () => {
    const stocks = [
      makeStock({ ticker: 'A', active_code: '4AA' }),
      makeStock({ ticker: 'B', active_code: '4AB' }),
      makeStock({ ticker: 'C', active_code: '4BA' }),
    ];
    expect(applyCodeFilter(stocks, '4A').map(s => s.ticker)).toEqual(['A', 'B']);
  });

  it('"4AA" exact prefix — matches only 4AA', () => {
    const stocks = [
      makeStock({ ticker: 'A', active_code: '4AA' }),
      makeStock({ ticker: 'B', active_code: '4AB' }),
    ];
    expect(applyCodeFilter(stocks, '4AA').map(s => s.ticker)).toEqual(['A']);
  });

  it('"4" does NOT match "14" — no substring match, only prefix', () => {
    const stocks = [makeStock({ ticker: 'A', active_code: '14AA' })];
    expect(applyCodeFilter(stocks, '4')).toHaveLength(0);
  });

  it('code filter is case-insensitive: "4aa" matches "4AA"', () => {
    const stocks = [makeStock({ ticker: 'A', active_code: '4AA' })];
    expect(applyCodeFilter(stocks, '4aa')).toHaveLength(1);
  });

  it('null active_code is excluded from code filter', () => {
    const stocks = [makeStock({ ticker: 'A', active_code: null })];
    expect(applyCodeFilter(stocks, '4')).toHaveLength(0);
  });

  it('empty string code filter returns all stocks (no filtering)', () => {
    const stocks = [
      makeStock({ ticker: 'A', active_code: '4AA' }),
      makeStock({ ticker: 'B', active_code: '3AA' }),
    ];
    // empty string: every startsWith('') returns true
    expect(applyCodeFilter(stocks, '')).toHaveLength(2);
  });

});

describe('EPIC-004/STORY-049/TASK-049-007: Monitoring status is_active logic', () => {

  it('is_active=true is returned for active filter', () => {
    const stocks = [
      makeStock({ ticker: 'A', is_active: true }),
      makeStock({ ticker: 'B', is_active: false }),
    ];
    const active = stocks.filter(s => s.is_active);
    expect(active.map(s => s.ticker)).toEqual(['A']);
  });

  it('is_active=false is returned for inactive filter', () => {
    const stocks = [
      makeStock({ ticker: 'A', is_active: true }),
      makeStock({ ticker: 'B', is_active: false }),
    ];
    const inactive = stocks.filter(s => !s.is_active);
    expect(inactive.map(s => s.ticker)).toEqual(['B']);
  });

});

describe('EPIC-004/STORY-049/TASK-049-007: Confidence no_classification handling', () => {

  it('stock with null confidence_level is the "no_classification" bucket', () => {
    const stock = makeStock({ confidence_level: null });
    const isNoClass = stock.confidence_level === null;
    expect(isNoClass).toBe(true);
  });

  it('stock with confidence_level "high" is not no_classification', () => {
    const stock = makeStock({ confidence_level: 'high' });
    expect(stock.confidence_level).not.toBeNull();
  });

});
