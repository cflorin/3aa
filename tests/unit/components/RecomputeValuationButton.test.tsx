/**
 * @jest-environment jsdom
 */
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-086: Recompute Valuations — Admin API & Universe Screen Button
// TASK-086-004: Component tests — RecomputeValuationButton
// Fixtures: synthetic (global.fetch mocked)

global.fetch = jest.fn();

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RecomputeValuationButton from '../../../src/components/universe/RecomputeValuationButton';

const mockFetch = global.fetch as jest.Mock;

const MOCK_SUMMARY = { total: 15, updated: 12, skipped: 2, errors: 0, duration_ms: 340 };

const flushPromises = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

function makeOkResponse(body: object) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function makeErrorResponse(status: number, body: object) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('EPIC-005/STORY-086/TASK-086-004: RecomputeValuationButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders idle button with correct label', () => {
    render(<RecomputeValuationButton />);
    const btn = screen.getByTestId('recompute-valuation-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Recompute Valuations');
    expect(btn).not.toBeDisabled();
  });

  it('shows loading state while request is in-flight', async () => {
    let resolve!: (v: unknown) => void;
    mockFetch.mockReturnValue(new Promise(r => { resolve = r; }));

    render(<RecomputeValuationButton />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));

    expect(screen.getByTestId('recompute-valuation-btn')).toBeDisabled();
    expect(screen.getByTestId('recompute-valuation-btn')).toHaveTextContent('Recomputing…');

    await act(async () => {
      resolve({ ok: true, json: () => Promise.resolve(MOCK_SUMMARY) });
      await flushPromises();
    });
  });

  it('calls POST /api/admin/sync/valuation on click', async () => {
    mockFetch.mockReturnValue(makeOkResponse(MOCK_SUMMARY));
    render(<RecomputeValuationButton />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/sync/valuation', { method: 'POST' });
  });

  it('shows success state and summary after completion', async () => {
    mockFetch.mockReturnValue(makeOkResponse(MOCK_SUMMARY));
    render(<RecomputeValuationButton />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    await flushPromises();

    expect(screen.getByTestId('recompute-valuation-btn')).toHaveTextContent('✓ Done');
    expect(screen.getByTestId('recompute-valuation-status')).toHaveTextContent('12 updated, 2 skipped');
  });

  it('omits error count from success message when errors=0', async () => {
    mockFetch.mockReturnValue(makeOkResponse(MOCK_SUMMARY));
    render(<RecomputeValuationButton />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    await flushPromises();

    expect(screen.getByTestId('recompute-valuation-status')).not.toHaveTextContent('error');
  });

  it('includes error count in success message when errors > 0', async () => {
    const summaryWithErrors = { ...MOCK_SUMMARY, errors: 2 };
    mockFetch.mockReturnValue(makeOkResponse(summaryWithErrors));
    render(<RecomputeValuationButton />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    await flushPromises();

    expect(screen.getByTestId('recompute-valuation-status')).toHaveTextContent('2 error(s)');
  });

  it('fires onSuccess callback with summary', async () => {
    mockFetch.mockReturnValue(makeOkResponse(MOCK_SUMMARY));
    const onSuccess = jest.fn();
    render(<RecomputeValuationButton onSuccess={onSuccess} />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    await flushPromises();

    expect(onSuccess).toHaveBeenCalledWith(MOCK_SUMMARY);
  });

  it('shows error state on API failure', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(500, { error: 'Internal server error' }));
    render(<RecomputeValuationButton />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    await flushPromises();

    expect(screen.getByTestId('recompute-valuation-error')).toHaveTextContent('Internal server error');
    expect(screen.getByTestId('recompute-valuation-btn')).not.toBeDisabled();
  });

  it('shows error state when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<RecomputeValuationButton />);
    fireEvent.click(screen.getByTestId('recompute-valuation-btn'));
    await flushPromises();

    await waitFor(() => expect(screen.getByTestId('recompute-valuation-error')).toBeInTheDocument());
    expect(screen.getByTestId('recompute-valuation-error')).toHaveTextContent('Network error');
  });
});
