/**
 * @jest-environment jsdom
 */
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-079: Stock Detail Page: Valuation Tab
// TASK-079-003: Unit tests — ValuationTab component

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValuationTab from '@/components/stock-detail/ValuationTab';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeValuationResponse(overrides: Record<string, unknown> = {}) {
  return {
    ticker: 'AAPL',
    systemState: {
      ticker: 'AAPL', activeCode: '4AA',
      valuationZone: 'comfortable_zone', valuationStateStatus: 'ready',
      maxThreshold: '22.0', comfortableThreshold: '20.0',
      veryGoodThreshold: '18.0', stealThreshold: '16.0',
    },
    userResult: {
      activeCode: '4AA', primaryMetric: 'forward_pe', metricReason: 'bucket_4',
      currentMultiple: 19.5, currentMultipleBasis: 'spot', metricSource: 'forward_pe',
      maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0,
      thresholdSource: 'anchored', derivedFromCode: null, thresholdAdjustments: [],
      baseTsrHurdleLabel: '12-13%', baseTsrHurdleDefault: 12.5, adjustedTsrHurdle: 11.0,
      hurdleSource: 'default', tsrReasonCodes: ['bucket_4_base'],
      valuationZone: 'comfortable_zone', valuationStateStatus: 'ready',
      grossMarginAdjustmentApplied: false, dilutionAdjustmentApplied: false, cyclicalityContextFlag: false,
    },
    hasUserOverride: false,
    userOverride: null,
    ...overrides,
  };
}

function setupFetch(valuationBody: unknown, historyBody: unknown = { history: [] }) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(historyBody) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(valuationBody) });
  });
}

beforeEach(() => mockFetch.mockClear());

describe('EPIC-005/STORY-079/TASK-079-001: ValuationTab', () => {
  it('renders zone badge for comfortable_zone', async () => {
    setupFetch(makeValuationResponse());
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('zone-badge')).toBeInTheDocument());
    expect(screen.getByTestId('zone-badge')).toHaveTextContent('Comfortable');
  });

  it('renders steal_zone badge with correct label', async () => {
    setupFetch(makeValuationResponse({ userResult: { ...makeValuationResponse().userResult, valuationZone: 'steal_zone', valuationStateStatus: 'ready' } }));
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('zone-badge')).toHaveTextContent('Steal Zone'));
  });

  it('renders threshold gauge when thresholds are non-null', async () => {
    setupFetch(makeValuationResponse());
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('threshold-gauge')).toBeInTheDocument());
  });

  it('hides gauge when thresholds are null', async () => {
    const r = { ...makeValuationResponse().userResult, maxThreshold: null, comfortableThreshold: null, veryGoodThreshold: null, stealThreshold: null };
    setupFetch(makeValuationResponse({ userResult: r }));
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    // Wait for component to finish loading (zone-badge present), then check gauge state
    await waitFor(() => expect(screen.getByTestId('zone-badge')).toBeInTheDocument());
    expect(screen.queryByTestId('threshold-gauge')).not.toBeInTheDocument();
    expect(screen.getByTestId('gauge-unavailable')).toBeInTheDocument();
  });

  it('shows adjusted TSR hurdle', async () => {
    setupFetch(makeValuationResponse());
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('adjusted-hurdle')).toHaveTextContent('11.0%'));
  });

  it('shows manual_required status message', async () => {
    const r = { ...makeValuationResponse().userResult, valuationStateStatus: 'manual_required', valuationZone: 'not_applicable', currentMultiple: null };
    setupFetch(makeValuationResponse({ userResult: r }));
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('status-message')).toHaveTextContent('Primary metric unavailable'));
  });

  it('shows not_applicable message for B8 stocks', async () => {
    const r = { ...makeValuationResponse().userResult, valuationStateStatus: 'not_applicable', valuationZone: 'not_applicable' };
    setupFetch(makeValuationResponse({ userResult: r }));
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('status-message')).toHaveTextContent('Bucket 8'));
  });

  it('shows valuation-not-computed when systemState is null', async () => {
    setupFetch({ ticker: 'AAPL', systemState: null, userResult: null, hasUserOverride: false, userOverride: null });
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('valuation-not-computed')).toBeInTheDocument());
  });

  it('shows gross margin and dilution badges when applied', async () => {
    const r = { ...makeValuationResponse().userResult, grossMarginAdjustmentApplied: true, dilutionAdjustmentApplied: true };
    setupFetch(makeValuationResponse({ userResult: r }));
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('gross-margin-adj-badge')).toBeInTheDocument();
      expect(screen.getByTestId('dilution-adj-badge')).toBeInTheDocument();
    });
  });

  it('shows forwardOperatingEarnings field for holding company', async () => {
    setupFetch(makeValuationResponse());
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={true} insurerFlag={false} />);
    await waitFor(() => screen.getByTestId('edit-overrides-btn'));
    await userEvent.click(screen.getByTestId('edit-overrides-btn'));
    expect(screen.getByTestId('override-forwardOperatingEarnings')).toBeInTheDocument();
  });

  it('hides forwardOperatingEarnings field for non-holding company', async () => {
    setupFetch(makeValuationResponse());
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => screen.getByTestId('edit-overrides-btn'));
    await userEvent.click(screen.getByTestId('edit-overrides-btn'));
    expect(screen.queryByTestId('override-forwardOperatingEarnings')).not.toBeInTheDocument();
  });

  it('save button disabled when partial threshold fill (3 of 4 filled)', async () => {
    setupFetch(makeValuationResponse());
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => screen.getByTestId('edit-overrides-btn'));
    await userEvent.click(screen.getByTestId('edit-overrides-btn'));

    await userEvent.type(screen.getByTestId('override-maxThreshold'), '30');
    await userEvent.type(screen.getByTestId('override-comfortableThreshold'), '27');
    await userEvent.type(screen.getByTestId('override-veryGoodThreshold'), '24');
    // leave stealThreshold empty

    expect(screen.getByTestId('save-override-btn')).toBeDisabled();
  });

  it('renders valuation history rows', async () => {
    setupFetch(makeValuationResponse(), {
      history: [
        { id: '1', valuationZone: 'comfortable_zone', previousZone: 'above_max', computedAt: '2026-04-25T10:00:00Z' },
        { id: '2', valuationZone: 'above_max', previousZone: null, computedAt: '2026-04-24T10:00:00Z' },
      ],
    });
    render(<ValuationTab ticker="AAPL" holdingCompanyFlag={false} insurerFlag={false} />);
    await waitFor(() => expect(screen.getByTestId('valuation-history-row-0')).toBeInTheDocument());
    expect(screen.getByTestId('valuation-history-row-1')).toBeInTheDocument();
  });
});
