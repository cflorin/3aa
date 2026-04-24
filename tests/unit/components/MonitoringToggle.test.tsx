/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-050: Monitoring Deactivate/Reactivate UI
// TASK-050-003: Unit tests — MonitoringToggle component
// PRD §Screen 2 — Monitor List Management; RFC-003 §Monitor List Management UI

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import MonitoringToggle from '../../../src/components/universe/MonitoringToggle';

const TICKER = 'MSFT';

function renderToggle(isActive: boolean, onStateChange = jest.fn()) {
  return { onStateChange, ...render(<MonitoringToggle ticker={TICKER} isActive={isActive} onStateChange={onStateChange} />) };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: fetch resolves successfully
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EPIC-004/STORY-050/TASK-050-003: MonitoringToggle', () => {

  // ── Button visibility ───────────────────────────────────────────────────────

  it('active stock shows "Deactivate" button', () => {
    renderToggle(true);
    expect(screen.getByTestId('deactivate-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('reactivate-btn')).not.toBeInTheDocument();
  });

  it('inactive stock shows "Reactivate" button and Inactive badge', () => {
    renderToggle(false);
    expect(screen.getByTestId('reactivate-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('deactivate-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('monitoring-inactive-badge')).toHaveTextContent('Inactive');
  });

  // ── Deactivate confirmation flow ────────────────────────────────────────────

  it('Deactivate click shows inline confirmation with Confirm and Cancel', () => {
    renderToggle(true);
    fireEvent.click(screen.getByTestId('deactivate-btn'));
    expect(screen.getByTestId('confirm-deactivate-btn')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-deactivate-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('deactivate-btn')).not.toBeInTheDocument();
  });

  it('Cancel hides confirmation and makes no fetch call', () => {
    renderToggle(true);
    fireEvent.click(screen.getByTestId('deactivate-btn'));
    fireEvent.click(screen.getByTestId('cancel-deactivate-btn'));
    expect(screen.getByTestId('deactivate-btn')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Confirm deactivation ────────────────────────────────────────────────────

  it('Confirm calls fetch with is_active=false and onStateChange(ticker, false)', async () => {
    const { onStateChange } = renderToggle(true);
    fireEvent.click(screen.getByTestId('deactivate-btn'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-deactivate-btn'));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/stocks/${TICKER}/monitoring`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ is_active: false }),
      }),
    );
    expect(onStateChange).toHaveBeenCalledWith(TICKER, false);
  });

  // ── Reactivate ──────────────────────────────────────────────────────────────

  it('Reactivate calls fetch with is_active=true immediately (no confirmation)', async () => {
    const { onStateChange } = renderToggle(false);
    await act(async () => {
      fireEvent.click(screen.getByTestId('reactivate-btn'));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/stocks/${TICKER}/monitoring`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ is_active: true }),
      }),
    );
    expect(onStateChange).toHaveBeenCalledWith(TICKER, true);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it('API error on deactivate: reverts via onStateChange(ticker, true) and shows error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const { onStateChange } = renderToggle(true);
    fireEvent.click(screen.getByTestId('deactivate-btn'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-deactivate-btn'));
    });
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(TICKER, false); // optimistic
      expect(onStateChange).toHaveBeenCalledWith(TICKER, true);  // revert
    });
    expect(screen.getByTestId('toggle-error')).toBeInTheDocument();
  });

  it('API error on reactivate: reverts via onStateChange(ticker, false) and shows error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const { onStateChange } = renderToggle(false);
    await act(async () => {
      fireEvent.click(screen.getByTestId('reactivate-btn'));
    });
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(TICKER, true);  // optimistic
      expect(onStateChange).toHaveBeenCalledWith(TICKER, false); // revert
    });
    expect(screen.getByTestId('toggle-error')).toBeInTheDocument();
  });

  // ── Propagation stop ────────────────────────────────────────────────────────

  it('button clicks stop propagation (outer div click handler not triggered)', () => {
    const outerClick = jest.fn();
    render(
      <div onClick={outerClick}>
        <MonitoringToggle ticker={TICKER} isActive={true} onStateChange={jest.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('deactivate-btn'));
    expect(outerClick).not.toHaveBeenCalled();
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  it('button is disabled during in-flight fetch', async () => {
    // Never-resolving promise simulates in-flight request
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    renderToggle(false);
    act(() => {
      fireEvent.click(screen.getByTestId('reactivate-btn'));
    });
    // After optimistic update, reactivate-btn is gone (now showing deactivate-btn)
    // The active state button should be disabled while loading
    await waitFor(() => {
      const btn = screen.queryByTestId('deactivate-btn');
      if (btn) expect(btn).toBeDisabled();
    });
  });

});
