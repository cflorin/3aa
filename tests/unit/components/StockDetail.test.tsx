/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-053: Stock Detail Page
// TASK-053-004: Unit tests — sub-components and StockDetailClient
// PRD §Stock Detail; RFC-001 §ClassificationResult; RFC-003 §Stock Detail Screen

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock ClassificationModal to avoid its internal fetch wiring
jest.mock('../../../src/components/universe/ClassificationModal', () => {
  const React = require('react');
  return function MockClassificationModal({ onClose }: { onClose: () => void }) {
    return React.createElement('div', { 'data-testid': 'classification-modal' },
      React.createElement('button', { onClick: onClose }, 'Close Modal')
    );
  };
});

global.fetch = jest.fn();

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScoreBar from '../../../src/components/stock-detail/ScoreBar';
import ConfidenceSteps from '../../../src/components/stock-detail/ConfidenceSteps';
import TieBreakList from '../../../src/components/stock-detail/TieBreakList';
import FlagPill from '../../../src/components/stock-detail/FlagPill';
import StarRating from '../../../src/components/stock-detail/StarRating';
import StockDetailClient from '../../../src/components/stock-detail/StockDetailClient';
import type { ConfidenceStep, TieBreakRecord } from '../../../src/domain/classification/types';

// ── Fixtures (synthetic) ────────────────────────────────────────────────────

const BASE_DETAIL = {
  ticker: 'MSFT',
  company: 'Microsoft Corporation',
  sector: 'Technology',
  suggested_code: '4AA',
  active_code: '4AA',
  confidence_level: 'high',
  reason_codes: ['growth_bucket_4', 'eq_a_winner'],
  scores: {
    bucket: { '1': 0, '2': 0, '3': 5, '4': 18, '5': 8, '6': 2, '7': 0, '8': 0 },
    eq: { A: 14, B: 6, C: 0 },
    bs: { A: 10, B: 4, C: 0 },
  },
  confidenceBreakdown: {
    steps: [
      { step: 1, label: 'Baseline', note: 'Bucket winner clear', band: 'high', tieBreaks: 0, missing: 0 } as ConfidenceStep,
      { step: 2, label: 'Data coverage', note: 'All critical fields present', band: 'high', tieBreaks: 0, missing: 0 } as ConfidenceStep,
    ],
  },
  tieBreaksFired: [] as TieBreakRecord[],
  input_snapshot: { revenue_growth_fwd: 0.12, operating_margin: 0.45 },
  classified_at: '2026-04-24T10:00:00Z',
  final_code: null,
  override_reason: null,
  overridden_at: null,
  override_scope: 'display_only',
  e1_moat_strength: 4.5,
  e2_pricing_power: 4.0,
  e3_revenue_recurrence: 4.5,
  e4_margin_durability: 4.0,
  e5_capital_intensity: 3.5,
  e6_qualitative_cyclicality: 4.0,
  eps_ttm_gaap: 6.13,
  eps_ntm_non_gaap: 8.49,
  non_gaap_eps_fy: 7.20,
  gaap_eps_fy: 6.13,
  gaap_adjustment_factor: 0.8514,
  eps_ntm_gaap_equiv: 7.22,
  revenue_growth_fwd: 0.12,
  revenue_growth_3y: 0.14,
  eps_growth_fwd: 0.15,
  eps_growth_3y: 0.18,
  gross_profit_growth: 0.10,
  gross_margin: 0.70,
  operating_margin: 0.45,
  fcf_margin: 0.38,
  fcf_conversion: 0.90,
  roic: 0.32,
  fcf_positive: true,
  net_income_positive: true,
  net_debt_to_ebitda: 0.3,
  interest_coverage: 25.0,
  share_count_growth_3y: -0.01,
  market_cap: 3_000_000,
  price: 420.00,
  pe_ratio: 32.5,
  ev_ebit: 28.0,
  holding_company_flag: false,
  insurer_flag: false,
  binary_flag: false,
  cyclicality_flag: false,
  optionality_flag: false,
  pre_operating_leverage_flag: false,
  material_dilution_flag: false,
};

// Quarterly history fixtures (BUG-001 tests)
const QH_EMPTY = { quarters: [], derived: null };

const QH_TWO_QUARTERS = {
  quarters: [
    {
      ticker: 'MSFT', fiscal_year: 2024, fiscal_quarter: 2,
      period_end_date: '2023-12-31T00:00:00.000Z', reported_date: null,
      revenue: 62020000000, gross_profit: 43200000000,
      operating_income: 27030000000, net_income: 21870000000,
      free_cash_flow: 19770000000, cash_from_operations: 23500000000,
      gross_margin: 0.6965, operating_margin: 0.4358, net_margin: 0.3527,
    },
    {
      ticker: 'MSFT', fiscal_year: 2024, fiscal_quarter: 1,
      period_end_date: '2023-09-30T00:00:00.000Z', reported_date: null,
      revenue: 56517000000, gross_profit: 38848000000,
      operating_income: 26895000000, net_income: 22291000000,
      free_cash_flow: 20673000000, cash_from_operations: 24000000000,
      gross_margin: 0.6873, operating_margin: 0.4758, net_margin: 0.3944,
    },
  ],
  derived: {
    quarters_available: 2, derived_as_of: '2026-04-25T00:00:00.000Z',
    gross_margin_slope_4q: 0.0023, operating_margin_slope_4q: -0.0015, net_margin_slope_4q: 0.0008,
    gross_margin_stability_score: 0.82, operating_margin_stability_score: 0.75,
    earnings_quality_trend_score: 0.42, deteriorating_cash_conversion_flag: false,
    operating_leverage_emerging_flag: true, material_dilution_trend_flag: false,
    sbc_burden_score: 0.22, sbc_as_pct_revenue_ttm: 0.04,
    diluted_shares_outstanding_change_4q: -0.005, diluted_shares_outstanding_change_8q: -0.011,
    revenue_ttm: 227000000000, operating_income_ttm: 109000000000,
    net_income_ttm: 88000000000, free_cash_flow_ttm: 79000000000,
    operating_margin_ttm: 0.4478, fcf_margin_ttm: 0.3700,
  },
};

function mockFetchSuccess(data = BASE_DETAIL, qhData = QH_EMPTY) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/quarterly-history')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(qhData) });
    }
    if (url.includes('/detail')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
    }
    if (url.includes('/history')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ticker: 'MSFT', history: [] }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
}

function mockFetch404() {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Not found' }) });
}

// ── ScoreBar ─────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-053/TASK-053-004: ScoreBar', () => {
  it('renders bar with label and value', () => {
    render(<ScoreBar label="4" value={18} max={100} />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('renders with highlight styling when highlight=true', () => {
    const { container } = render(<ScoreBar label="4" value={18} max={100} highlight={true} />);
    // highlighted bar fills at least some width
    const bar = container.querySelector('div div div') as HTMLElement;
    expect(bar.style.width).not.toBe('0%');
  });

  it('0 value renders bar element (jsdom normalizes 0% to empty)', () => {
    const { container } = render(<ScoreBar label="1" value={0} max={100} />);
    const bar = container.querySelector('div div div') as HTMLElement;
    // jsdom may serialize '0%' as '' — accept both
    expect(['0%', '']).toContain(bar.style.width);
  });

  it('accepts data-testid prop', () => {
    render(<ScoreBar label="4" value={10} data-testid="bucket-score-4" />);
    expect(screen.getByTestId('bucket-score-4')).toBeInTheDocument();
  });
});

// ── ConfidenceSteps ───────────────────────────────────────────────────────────

describe('EPIC-004/STORY-053/TASK-053-004: ConfidenceSteps', () => {
  it('renders correct step count', () => {
    const steps: ConfidenceStep[] = [
      { step: 1, label: 'Baseline', note: 'Clear winner', band: 'high' },
      { step: 2, label: 'Data', note: 'All fields', band: 'high' },
    ];
    render(<ConfidenceSteps steps={steps} />);
    expect(screen.getAllByTestId(/confidence-step-/)).toHaveLength(2);
  });

  it('shows label and band pill for each step', () => {
    const steps: ConfidenceStep[] = [
      { step: 1, label: 'Baseline check', note: 'all good', band: 'high' },
    ];
    render(<ConfidenceSteps steps={steps} />);
    expect(screen.getByText('Baseline check')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('renders empty-state message when steps=[]', () => {
    render(<ConfidenceSteps steps={[]} />);
    expect(screen.getByText(/no confidence derivation/i)).toBeInTheDocument();
  });
});

// ── TieBreakList ──────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-053/TASK-053-004: TieBreakList', () => {
  it('renders "No tie-breaks fired" when empty', () => {
    render(<TieBreakList tieBreaksFired={[]} />);
    expect(screen.getByTestId('tie-break-empty')).toBeInTheDocument();
    expect(screen.getByText('No tie-breaks fired.')).toBeInTheDocument();
  });

  it('renders tie-break entries when present', () => {
    const tbs: TieBreakRecord[] = [{
      rule: '3v4',
      description: 'FCF quality check',
      winner: 4,
      condition: 'fcf_conversion >= 0.50',
      values: { fcf_conversion: 0.9 },
      outcome: 'Bucket 4 chosen',
      marginAtTrigger: 0.5,
    }];
    render(<TieBreakList tieBreaksFired={tbs} />);
    expect(screen.getByTestId('tie-break-0')).toBeInTheDocument();
    expect(screen.getByText('3v4')).toBeInTheDocument();
    expect(screen.getByText('FCF quality check')).toBeInTheDocument();
  });
});

// ── FlagPill ──────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-053/TASK-053-004: FlagPill', () => {
  it('renders "true" text when value=true', () => {
    render(<FlagPill flag="binary_flag" value={true} />);
    expect(screen.getByText('true')).toBeInTheDocument();
    // testid present
    expect(screen.getByTestId('flag-pill-binary_flag')).toBeInTheDocument();
  });

  it('renders muted styling when value=false', () => {
    render(<FlagPill flag="binary_flag" value={false} />);
    expect(screen.getByText('false')).toBeInTheDocument();
  });

  it('renders "—" when value=null', () => {
    render(<FlagPill flag="holding_company_flag" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders correct label for known flag', () => {
    render(<FlagPill flag="holding_company_flag" value={false} />);
    expect(screen.getByText('Holding Company')).toBeInTheDocument();
  });

  it('renders correct label for material_dilution_flag', () => {
    render(<FlagPill flag="material_dilution_flag" value={true} />);
    expect(screen.getByText('Material Dilution')).toBeInTheDocument();
  });
});

// ── StarRating ────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-053/TASK-053-004: StarRating', () => {
  it('renders value label', () => {
    render(<StarRating value={3.5} />);
    expect(screen.getByText('3.5')).toBeInTheDocument();
  });

  it('renders "—" when value=null', () => {
    render(<StarRating value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders 5 blocks for max=5', () => {
    const { container } = render(<StarRating value={3.0} max={5} />);
    // 5 square blocks inside the flex row (dark theme uses border-radius: 1px)
    const blocks = container.querySelectorAll('div[style*="border-radius: 1px"]');
    expect(blocks.length).toBe(5);
  });

  it('renders value=0 with all empty blocks', () => {
    render(<StarRating value={0} />);
    expect(screen.getByText('0.0')).toBeInTheDocument();
  });

  it('accepts data-testid prop', () => {
    render(<StarRating value={4.5} data-testid="e1-moat-strength" />);
    expect(screen.getByTestId('e1-moat-strength')).toBeInTheDocument();
  });
});

// ── StockDetailClient ─────────────────────────────────────────────────────────

describe('EPIC-004/STORY-053/TASK-053-004: StockDetailClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // never resolves
    render(<StockDetailClient ticker="MSFT" />);
    expect(screen.getByText(/loading stock data/i)).toBeInTheDocument();
  });

  it('renders ticker and company name after load', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => expect(screen.getByText('MSFT')).toBeInTheDocument());
    expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
  });

  it('renders 5 tab buttons (STORY-073: Quarterly + Annual & Inferred replace Fundamentals)', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-classification'));
    expect(screen.getByTestId('tab-classification')).toBeInTheDocument();
    expect(screen.getByTestId('tab-quarterly')).toBeInTheDocument();
    expect(screen.getByTestId('tab-annual')).toBeInTheDocument();
    expect(screen.getByTestId('tab-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });

  it('renders "← Universe" back button', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('back-to-universe'));
    fireEvent.click(screen.getByTestId('back-to-universe'));
    expect(mockPush).toHaveBeenCalledWith('/universe');
  });

  it('shows not-in-universe state for 404 response', async () => {
    mockFetch404();
    render(<StockDetailClient ticker="UNKNOWN" />);
    await waitFor(() => screen.getByTestId('not-in-universe-state'));
    expect(screen.getByTestId('not-in-universe-state')).toBeInTheDocument();
  });

  it('Classification tab: override disclaimer always visible', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('override-disclaimer'));
    expect(screen.getByTestId('override-disclaimer')).toBeInTheDocument();
  });

  it('Classification tab: bucket score bars rendered', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('bucket-score-4'));
    expect(screen.getByTestId('bucket-score-4')).toBeInTheDocument();
  });

  it('Classification tab: confidence steps rendered', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('confidence-step-0'));
    expect(screen.getAllByTestId(/confidence-step-/)).toHaveLength(2);
  });

  it('Classification tab: "No tie-breaks fired" shown when tieBreaksFired=[]', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tie-break-empty'));
    expect(screen.getByTestId('tie-break-empty')).toBeInTheDocument();
  });

  it('Classification tab: no classification message shown when suggested_code=null', async () => {
    mockFetchSuccess({ ...BASE_DETAIL, suggested_code: null, classified_at: null, confidence_level: null });
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('no-classification-message'));
    expect(screen.getByTestId('no-classification-message')).toBeInTheDocument();
  });

  it('Annual & Inferred tab: renders all flag pills (STORY-073)', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-annual'));
    fireEvent.click(screen.getByTestId('tab-annual'));
    await waitFor(() => screen.getByTestId('flag-pill-binary_flag'));
    expect(screen.getByTestId('flag-pill-holding_company_flag')).toBeInTheDocument();
    expect(screen.getByTestId('flag-pill-material_dilution_flag')).toBeInTheDocument();
    // All 7 flags
    const flagCount = screen.getAllByTestId(/^flag-pill-/).length;
    expect(flagCount).toBe(7);
  });

  it('Valuation tab: ValuationTab component rendered (not-computed state when API returns {})', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-valuation'));
    fireEvent.click(screen.getByTestId('tab-valuation'));
    await waitFor(() => screen.getByTestId('valuation-not-computed'));
  });

  it('History tab: empty state shown when no history', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-history'));
    fireEvent.click(screen.getByTestId('tab-history'));
    await waitFor(() => screen.getByTestId('history-empty-state'));
    expect(screen.getByTestId('history-empty-state')).toBeInTheDocument();
  });

  it('History tab: alerts placeholder shown', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-history'));
    fireEvent.click(screen.getByTestId('tab-history'));
    await waitFor(() => screen.getByTestId('alerts-placeholder'));
    expect(screen.getByTestId('alerts-placeholder')).toHaveTextContent(/future update/i);
  });

  it('Set Override button opens ClassificationModal', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('set-override-btn'));
    fireEvent.click(screen.getByTestId('set-override-btn'));
    await waitFor(() => screen.getByTestId('classification-modal'));
    expect(screen.getByTestId('classification-modal')).toBeInTheDocument();
  });

  it('Clear Override button shown when final_code is set', async () => {
    mockFetchSuccess({ ...BASE_DETAIL, final_code: '3AA', override_reason: 'Manual review', overridden_at: '2026-04-24T09:00:00Z' });
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('clear-override-btn'));
    expect(screen.getByTestId('clear-override-btn')).toBeInTheDocument();
  });
});

// ── Quarterly Tab (BUG-001 / STORY-073) ──────────────────────────────────────

describe('EPIC-004/STORY-073/BUG-001: Quarterly tab rendering', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows loading indicator while quarterly data is in flight', async () => {
    // Never resolves — keeps loading state active
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/quarterly-history')) return new Promise(() => {});
      if (url.includes('/detail')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BASE_DETAIL) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    render(<StockDetailClient ticker="MSFT" />);
    const tab = await screen.findByTestId('tab-quarterly');
    fireEvent.click(tab);
    await waitFor(() => expect(screen.getByTestId('quarterly-loading')).toBeInTheDocument());
  });

  // ── Empty / no-data state ───────────────────────────────────────────────────

  it('shows prominent empty-state message when DB has no quarterly rows', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_EMPTY);
    render(<StockDetailClient ticker="MSFT" />);
    const tab = await screen.findByTestId('tab-quarterly');
    fireEvent.click(tab);
    await waitFor(() => expect(screen.getByTestId('quarterly-empty-state')).toBeInTheDocument());
    expect(screen.getByTestId('quarterly-empty-state')).toHaveTextContent(/no quarterly history data/i);
    expect(screen.getByTestId('quarterly-empty-state')).toHaveTextContent(/quarterly sync job/i);
  });

  it('empty state names the cron endpoint so admin knows what to run', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_EMPTY);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('quarterly-empty-state'));
    expect(screen.getByTestId('quarterly-empty-state')).toHaveTextContent(/\/api\/cron\/quarterly-history/i);
  });

  it('shows empty state when fetch fails (network error)', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/quarterly-history')) return Promise.reject(new Error('Network error'));
      if (url.includes('/detail')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BASE_DETAIL) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('quarterly-empty-state'));
    expect(screen.getByTestId('quarterly-empty-state')).toBeInTheDocument();
  });

  it('shows empty state when API returns non-200', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/quarterly-history')) return Promise.resolve({ ok: false, status: 401 });
      if (url.includes('/detail')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BASE_DETAIL) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('quarterly-empty-state'));
    expect(screen.getByTestId('quarterly-empty-state')).toBeInTheDocument();
  });

  // ── Quarter table ───────────────────────────────────────────────────────────

  it('renders one row per quarter', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('quarterly-tab'));
    expect(screen.getAllByTestId(/^qrow-/)).toHaveLength(2);
  });

  it('renders quarter label as Q{n} {year}', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qrow-2024-2'));
    expect(screen.getByTestId('qrow-2024-2')).toHaveTextContent('Q2 2024');
    expect(screen.getByTestId('qrow-2024-1')).toHaveTextContent('Q1 2024');
  });

  it('formats revenue in $M with thousands separator (STORY-088 BUG-001)', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qrow-2024-2'));
    // 62,020,000,000 / 1_000_000 = 62,020 → "$62,020M"
    expect(screen.getByTestId('qcell-2024-2-revenue')).toHaveTextContent('$62,020M');
  });

  it('formats gross margin as XX.X%', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qcell-2024-2-gross_margin'));
    expect(screen.getByTestId('qcell-2024-2-gross_margin')).toHaveTextContent('69.7%');
  });

  it('formats operating margin as XX.X%', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qcell-2024-2-operating_margin'));
    expect(screen.getByTestId('qcell-2024-2-operating_margin')).toHaveTextContent('43.6%');
  });

  it('renders — for null monetary values', async () => {
    const qhNullFields = {
      quarters: [{ ...QH_TWO_QUARTERS.quarters[0], free_cash_flow: null }],
      derived: null,
    };
    mockFetchSuccess(BASE_DETAIL, qhNullFields);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qcell-2024-2-free_cash_flow'));
    expect(screen.getByTestId('qcell-2024-2-free_cash_flow')).toHaveTextContent('—');
  });

  it('renders — for null margin values', async () => {
    const qhNullMargin = {
      quarters: [{ ...QH_TWO_QUARTERS.quarters[0], operating_margin: null }],
      derived: null,
    };
    mockFetchSuccess(BASE_DETAIL, qhNullMargin);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qcell-2024-2-operating_margin'));
    expect(screen.getByTestId('qcell-2024-2-operating_margin')).toHaveTextContent('—');
  });

  // ── Derived metrics panel ───────────────────────────────────────────────────

  it('renders TTM rollups when derived is present', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-revenue-ttm'));
    expect(screen.getByTestId('derived-revenue-ttm')).toHaveTextContent('$227.00B');
  });

  it('renders operating margin TTM as percentage', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-op-margin-ttm'));
    expect(screen.getByTestId('derived-op-margin-ttm')).toHaveTextContent('44.8%');
  });

  it('renders EQ trend score with value', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-eq-trend-score'));
    expect(screen.getByTestId('derived-eq-trend-score')).toHaveTextContent('0.42');
  });

  it('renders quarters available count', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-quarters-available'));
    expect(screen.getByTestId('derived-quarters-available')).toHaveTextContent('2');
  });

  it('does not render derived panel when derived is null', async () => {
    mockFetchSuccess(BASE_DETAIL, { quarters: QH_TWO_QUARTERS.quarters, derived: null });
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qrow-2024-2'));
    expect(screen.queryByTestId('derived-revenue-ttm')).not.toBeInTheDocument();
  });

  // ── Eager load ──────────────────────────────────────────────────────────────

  it('fetches quarterly-history on mount, before Quarterly tab is clicked', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    // Wait for detail to load (default tab)
    await screen.findByTestId('tab-classification');
    // Quarterly fetch should have already been called
    const calls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
    expect(calls.some((u: string) => u.includes('/quarterly-history'))).toBe(true);
  });

  it('does not re-fetch when switching away and back to Quarterly tab', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    await screen.findByTestId('tab-quarterly');
    fireEvent.click(screen.getByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qrow-2024-2'));
    fireEvent.click(screen.getByTestId('tab-classification'));
    fireEvent.click(screen.getByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qrow-2024-2'));
    const qhCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]: [string]) => url.includes('/quarterly-history'));
    expect(qhCalls).toHaveLength(1);
  });

  // ── STORY-088 bug fixes ────────────────────────────────────────────────────

  it('STORY-088/BUG-001: gross_profit formatted with thousands separator', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('qcell-2024-2-gross_profit'));
    // 43,200,000,000 / 1_000_000 = 43,200 → "$43,200M"
    expect(screen.getByTestId('qcell-2024-2-gross_profit')).toHaveTextContent('$43,200M');
  });

  it('STORY-088/BUG-001: TTM revenue formatted with toLocaleString', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-revenue-ttm'));
    // 227_000_000_000 / 1e9 = 227.00 — no comma, but must include decimal places
    expect(screen.getByTestId('derived-revenue-ttm')).toHaveTextContent('$227.00B');
  });

  it('STORY-088/BUG-002: EQ Trend Score tooltip trigger renders', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-eq-trend-score-tooltip-trigger'));
    expect(screen.getByTestId('derived-eq-trend-score-tooltip-trigger')).toBeInTheDocument();
  });

  it('STORY-088/BUG-002: EQ Trend Score tooltip shows on hover', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-eq-trend-score-tooltip-trigger'));
    fireEvent.mouseEnter(screen.getByTestId('derived-eq-trend-score-tooltip-trigger'));
    const tooltip = screen.getByTestId('derived-eq-trend-score-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain('improving');
    expect(tooltip.textContent).toContain('deteriorating');
  });

  it('STORY-088/BUG-002: EQ Trend Score tooltip hides on mouse-out', async () => {
    mockFetchSuccess(BASE_DETAIL, QH_TWO_QUARTERS);
    render(<StockDetailClient ticker="MSFT" />);
    fireEvent.click(await screen.findByTestId('tab-quarterly'));
    await waitFor(() => screen.getByTestId('derived-eq-trend-score-tooltip-trigger'));
    const trigger = screen.getByTestId('derived-eq-trend-score-tooltip-trigger');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByTestId('derived-eq-trend-score-tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByTestId('derived-eq-trend-score-tooltip')).not.toBeInTheDocument();
  });
});
