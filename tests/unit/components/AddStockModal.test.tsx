/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-056: Add Stock to Universe
// TASK-056-007: Component tests — AddStockModal
// Fixtures: synthetic (global.fetch mocked)

jest.mock('../../../src/components/universe/RemoveStockDialog', () => {
  const React = require('react');
  return function MockDialog() { return React.createElement('div', null); };
});

global.fetch = jest.fn();

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Flush all pending microtasks + one setTimeout tick
const flushPromises = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
import AddStockModal from '../../../src/components/universe/AddStockModal';

// ── SSE stream helper ──────────────────────────────────────────────────────────
// Build mock fetch return values without relying on TextEncoder / Response (not in jsdom)

function makeSseResponse(events: object[]) {
  const lines = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  let done = false;
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h === 'content-type' ? 'text/event-stream' : null) },
    body: {
      getReader() {
        return {
          read(): Promise<{ done: boolean; value: Uint8Array | undefined }> {
            if (!done) {
              done = true;
              // minimal TextEncoder polyfill: encode as UTF-8 byte array via Buffer
              const buf = Buffer.from(lines, 'utf-8');
              const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
              return Promise.resolve({ done: false, value: view });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    },
  };
}

function makeJsonResponse(body: object, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(body),
    body: null,
  };
}

const MOCK_STOCK = {
  ticker: 'NVDA',
  company_name: 'NVIDIA Corp',
  sector: 'Technology',
  market_cap: 2e12,
  current_price: 800,
  revenue_growth_fwd: 0.20,
  eps_growth_fwd: 0.30,
  operating_margin: 0.55,
  fcf_conversion: 0.90,
  net_debt_to_ebitda: -0.5,
  is_active: true,
  active_code: '4AA',
  confidence_level: 'high',
};

const SUCCESS_EVENTS = [
  { stage: 'validate',        label: 'Validating ticker…',           step: 1, total: 8 },
  { stage: 'create_record',   label: 'Creating stock record…',       step: 2, total: 8 },
  { stage: 'fundamentals',    label: 'Fetching fundamentals…',       step: 3, total: 8 },
  { stage: 'estimates',       label: 'Fetching forward estimates…',  step: 4, total: 8 },
  { stage: 'metrics',         label: 'Computing metrics…',           step: 5, total: 8 },
  { stage: 'flags',           label: 'Computing classification flags…', step: 6, total: 8 },
  { stage: 'enrichment',      label: 'Running LLM enrichment…',      step: 7, total: 8 },
  { stage: 'classification',  label: 'Classifying…',                 step: 8, total: 8 },
  { stage: 'done',            result: MOCK_STOCK },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EPIC-004/STORY-056: AddStockModal', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with ticker input in idle state', () => {
    render(<AddStockModal onClose={jest.fn()} onAdded={jest.fn()} />);
    expect(screen.getByTestId('add-stock-modal')).toBeInTheDocument();
    expect(screen.getByTestId('ticker-input')).toBeInTheDocument();
    expect(screen.getByTestId('add-submit-btn')).toBeInTheDocument();
  });

  it('shows validation error when submitting empty ticker', () => {
    render(<AddStockModal onClose={jest.fn()} onAdded={jest.fn()} />);
    fireEvent.click(screen.getByTestId('add-submit-btn'));
    expect(screen.getByText(/Ticker is required/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid ticker characters', () => {
    render(<AddStockModal onClose={jest.fn()} onAdded={jest.fn()} />);
    fireEvent.change(screen.getByTestId('ticker-input'), { target: { value: 'AB$CD' } });
    fireEvent.click(screen.getByTestId('add-submit-btn'));
    expect(screen.getByText(/alphanumeric/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows progress bar while stream is pending', async () => {
    // Mock fetch to never resolve — modal stays in submitting state
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    render(<AddStockModal onClose={jest.fn()} onAdded={jest.fn()} />);
    fireEvent.change(screen.getByTestId('ticker-input'), { target: { value: 'NVDA' } });
    fireEvent.click(screen.getByTestId('add-submit-btn'));
    // setStatus('submitting') is called synchronously before the first await
    await waitFor(() => expect(screen.getByTestId('add-progress-bar')).toBeInTheDocument());
  });

  it('calls onAdded with stock and onClose when done event received', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeSseResponse(SUCCESS_EVENTS));
    const onAdded = jest.fn();
    const onClose = jest.fn();
    render(<AddStockModal onClose={onClose} onAdded={onAdded} />);
    fireEvent.change(screen.getByTestId('ticker-input'), { target: { value: 'NVDA' } });
    fireEvent.click(screen.getByTestId('add-submit-btn'));
    await flushPromises();
    await flushPromises();
    expect(onAdded).toHaveBeenCalledWith(MOCK_STOCK);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error state with failedStage and Retry button on pipeline error', async () => {
    const errorEvents = [
      { stage: 'error', failedStage: 'enrichment', message: 'LLM timeout' },
    ];
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeSseResponse(errorEvents));
    render(<AddStockModal onClose={jest.fn()} onAdded={jest.fn()} />);
    fireEvent.change(screen.getByTestId('ticker-input'), { target: { value: 'NVDA' } });
    fireEvent.click(screen.getByTestId('add-submit-btn'));
    await flushPromises();
    await flushPromises();
    expect(screen.getByTestId('add-error-message')).toBeInTheDocument();
    expect(screen.getByText(/LLM timeout/i)).toBeInTheDocument();
    expect(screen.getByText(/enrichment/i)).toBeInTheDocument();
    expect(screen.getByTestId('add-retry-btn')).toBeInTheDocument();
  });

  it('clicking Retry resets to idle state', async () => {
    const errorEvents = [
      { stage: 'error', failedStage: 'fundamentals', message: 'timeout' },
    ];
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeSseResponse(errorEvents));
    render(<AddStockModal onClose={jest.fn()} onAdded={jest.fn()} />);
    fireEvent.change(screen.getByTestId('ticker-input'), { target: { value: 'NVDA' } });
    fireEvent.click(screen.getByTestId('add-submit-btn'));
    await flushPromises();
    await flushPromises();
    expect(screen.getByTestId('add-retry-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-retry-btn'));
    expect(screen.getByTestId('ticker-input')).toBeInTheDocument();
  });

  it('shows already-in-universe message on 409 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({ error: 'already_in_universe' }, 409),
    );
    render(<AddStockModal onClose={jest.fn()} onAdded={jest.fn()} />);
    fireEvent.change(screen.getByTestId('ticker-input'), { target: { value: 'MSFT' } });
    fireEvent.click(screen.getByTestId('add-submit-btn'));
    await waitFor(() => expect(screen.getByTestId('add-error-message')).toBeInTheDocument());
    expect(screen.getByText(/already in your universe/i)).toBeInTheDocument();
  });

  it('Escape key closes modal in idle state', () => {
    const onClose = jest.fn();
    render(<AddStockModal onClose={onClose} onAdded={jest.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
