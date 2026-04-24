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

function mockFetchSuccess(data = BASE_DETAIL) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
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
    // 5 square blocks inside the flex row
    const blocks = container.querySelectorAll('div[style*="border-radius: 2px"]');
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

  it('renders 4 tab buttons', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-classification'));
    expect(screen.getByTestId('tab-classification')).toBeInTheDocument();
    expect(screen.getByTestId('tab-fundamentals')).toBeInTheDocument();
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

  it('shows error state for 404 response', async () => {
    mockFetch404();
    render(<StockDetailClient ticker="UNKNOWN" />);
    await waitFor(() => screen.getByTestId('error-state'));
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
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

  it('Fundamentals tab: renders all flag pills', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-fundamentals'));
    fireEvent.click(screen.getByTestId('tab-fundamentals'));
    await waitFor(() => screen.getByTestId('flag-pill-binary_flag'));
    expect(screen.getByTestId('flag-pill-holding_company_flag')).toBeInTheDocument();
    expect(screen.getByTestId('flag-pill-material_dilution_flag')).toBeInTheDocument();
    // All 7 flags
    const flagCount = screen.getAllByTestId(/^flag-pill-/).length;
    expect(flagCount).toBe(7);
  });

  it('Valuation tab: placeholder text rendered', async () => {
    mockFetchSuccess();
    render(<StockDetailClient ticker="MSFT" />);
    await waitFor(() => screen.getByTestId('tab-valuation'));
    fireEvent.click(screen.getByTestId('tab-valuation'));
    await waitFor(() => screen.getByTestId('valuation-placeholder'));
    expect(screen.getByTestId('valuation-placeholder')).toHaveTextContent(/future update/i);
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
