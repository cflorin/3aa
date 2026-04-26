/**
 * @jest-environment jsdom
 */
// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-084: Recompute Classification — Admin API & Universe Screen Button
// TASK-084-004: Component tests — RecomputeClassificationButton
// Fixtures: synthetic (global.fetch mocked)

global.fetch = jest.fn();

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RecomputeClassificationButton from '../../../src/components/universe/RecomputeClassificationButton';

const mockFetch = global.fetch as jest.Mock;

const MOCK_SUMMARY = { processed: 5, recomputed: 4, skipped: 1, errors: 0, duration_ms: 120 };

// Flush all microtasks + one setTimeout tick (same pattern as AddStockModal tests)
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

describe('EPIC-005/STORY-084/TASK-084-004: RecomputeClassificationButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders idle button', () => {
    render(<RecomputeClassificationButton />);
    const btn = screen.getByTestId('recompute-classification-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Recompute Classification');
    expect(btn).not.toBeDisabled();
  });

  it('shows loading state while request is in-flight', async () => {
    let resolve!: (v: unknown) => void;
    mockFetch.mockReturnValue(new Promise(r => { resolve = r; }));

    render(<RecomputeClassificationButton />);
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));

    expect(screen.getByTestId('recompute-classification-btn')).toBeDisabled();
    expect(screen.getByTestId('recompute-classification-btn')).toHaveTextContent('Recomputing…');

    await act(async () => {
      resolve({ ok: true, json: () => Promise.resolve(MOCK_SUMMARY) });
      await flushPromises();
    });
  });

  it('calls POST /api/admin/sync/classification on click', async () => {
    mockFetch.mockReturnValue(makeOkResponse(MOCK_SUMMARY));
    render(<RecomputeClassificationButton />);
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/sync/classification', { method: 'POST' });
  });

  it('shows success state and summary after completion', async () => {
    mockFetch.mockReturnValue(makeOkResponse(MOCK_SUMMARY));
    render(<RecomputeClassificationButton />);
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));
    await flushPromises();

    expect(screen.getByTestId('recompute-success-msg')).toHaveTextContent('4 reclassified, 1 skipped');
    expect(screen.getByTestId('recompute-classification-btn')).toHaveTextContent('✓ Done');
  });

  it('fires onSuccess callback with summary', async () => {
    mockFetch.mockReturnValue(makeOkResponse(MOCK_SUMMARY));
    const onSuccess = jest.fn();
    render(<RecomputeClassificationButton onSuccess={onSuccess} />);
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));
    await flushPromises();

    expect(onSuccess).toHaveBeenCalledWith(MOCK_SUMMARY);
  });

  it('shows error state on API failure', async () => {
    mockFetch.mockReturnValue(makeErrorResponse(500, { error: 'Internal server error' }));
    render(<RecomputeClassificationButton />);
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));
    await flushPromises();

    expect(screen.getByTestId('recompute-error-msg')).toHaveTextContent('Internal server error');
    expect(screen.getByTestId('recompute-classification-btn')).not.toBeDisabled();
  });

  it('shows error state when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<RecomputeClassificationButton />);
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));
    await flushPromises();

    await waitFor(() => expect(screen.getByTestId('recompute-error-msg')).toBeInTheDocument());
    expect(screen.getByTestId('recompute-error-msg')).toHaveTextContent('Network error');
  });

  it('includes error count in success message when errors > 0', async () => {
    const summaryWithErrors = { ...MOCK_SUMMARY, errors: 2 };
    mockFetch.mockReturnValue(makeOkResponse(summaryWithErrors));
    render(<RecomputeClassificationButton />);
    fireEvent.click(screen.getByTestId('recompute-classification-btn'));
    await flushPromises();

    expect(screen.getByTestId('recompute-success-msg')).toHaveTextContent('2 errors');
  });
});
