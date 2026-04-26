/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-051: Classification Override Modal
// TASK-051-004: Unit tests — ClassificationModal component
// PRD §Screen 2 — Classification Detail, §Override UI; RFC-003 §Classification Override Modal; ADR-007

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ClassificationModal from '../../../src/components/universe/ClassificationModal';

const TICKER = 'MSFT';

// ── Base fixtures (synthetic) ─────────────────────────────────────────────────

const BASE_CLASS_RESPONSE = {
  ticker: TICKER,
  system_suggested_code: '4AA',
  system_confidence: 'high',
  user_override_code: null,
  user_override_reason: null,
  active_code: '4AA',
  reason_codes: ['STRONG_GROWTH', 'HIGH_FCF'],
  scores: {
    bucket: { 1: 10, 2: 20, 3: 30, 4: 50, 5: 15, 6: 10, 7: 5, 8: 5 },
    eq: { A: 8, B: 5, C: 2 },
    bs: { A: 7, B: 4, C: 1 },
  },
  override_scope: 'display_only',
  classified_at: '2026-04-01T10:00:00.000Z',
};

const BASE_HISTORY_RESPONSE = {
  ticker: TICKER,
  history: [
    { classified_at: '2026-04-01T10:00:00.000Z', previous_code: '3AA', suggested_code: '4AA' },
    { classified_at: '2026-03-15T08:00:00.000Z', previous_code: null, suggested_code: '3AA' },
    { classified_at: '2026-03-01T06:00:00.000Z', previous_code: null, suggested_code: null },
  ],
};

function mockFetch(classOverride = {}, histOverride = {}) {
  const classResp = { ...BASE_CLASS_RESPONSE, ...classOverride };
  const histResp = { ...BASE_HISTORY_RESPONSE, ...histOverride };
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(histResp) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(classResp) });
  });
}

function renderModal(props: Partial<React.ComponentProps<typeof ClassificationModal>> = {}) {
  const defaults = {
    ticker: TICKER,
    companyName: 'Microsoft Corporation',
    sector: 'Technology',
    onClose: jest.fn(),
    onOverrideChange: jest.fn(),
  };
  return render(<ClassificationModal {...defaults} {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EPIC-004/STORY-051/TASK-051-004: ClassificationModal', () => {

  // ── Loading and data display ────────────────────────────────────────────────

  it('shows loading state initially', () => {
    // Never-resolving fetch
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByText(/loading classification/i)).toBeInTheDocument();
  });

  it('loads and shows system suggested code "4AA"', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByText('4AA').length).toBeGreaterThan(0);
    });
  });

  it('shows "—" when system_suggested_code is null', async () => {
    mockFetch({ system_suggested_code: null, active_code: null });
    renderModal();
    await waitFor(() => {
      // Dark theme: null code renders as "—" em dash
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  it('shows all 3 history rows when history has 3 entries', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('history-row')).toHaveLength(3);
    });
  });

  it('shows "No classification history yet." for empty history', async () => {
    mockFetch({}, { history: [] });
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('history-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('history-empty-state')).toHaveTextContent('No classification history yet.');
    });
  });

  // ── Override section state ─────────────────────────────────────────────────

  it('shows "Set my classification" form when user has no override', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('override-bucket-select')).toBeInTheDocument();
      expect(screen.getByTestId('override-eq-select')).toBeInTheDocument();
      expect(screen.getByTestId('override-bs-select')).toBeInTheDocument();
      expect(screen.getByTestId('override-reason-input')).toBeInTheDocument();
      expect(screen.getByTestId('save-override-btn')).toBeInTheDocument();
    });
  });

  it('shows existing override code + reason + "Clear override" when user has override', async () => {
    mockFetch({ user_override_code: '3AA', user_override_reason: 'I think this is bucket 3', active_code: '3AA' });
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('clear-override-btn')).toBeInTheDocument();
      expect(screen.getAllByText('3AA').length).toBeGreaterThan(0);
      expect(screen.getByText('I think this is bucket 3')).toBeInTheDocument();
      expect(screen.queryByTestId('save-override-btn')).not.toBeInTheDocument();
    });
  });

  // ── Override scope disclaimer ─────────────────────────────────────────────

  it('override scope disclaimer always visible (no override)', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('override-disclaimer')).toBeInTheDocument();
      expect(screen.getByTestId('override-disclaimer')).toHaveTextContent(/display only/i);
    });
  });

  it('override scope disclaimer always visible (with override)', async () => {
    mockFetch({ user_override_code: '3AA', user_override_reason: 'My override reason here' });
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('override-disclaimer')).toBeInTheDocument();
    });
  });

  // ── Form validation ────────────────────────────────────────────────────────

  it('Save button disabled when reason is empty', async () => {
    renderModal();
    await waitFor(() => screen.getByTestId('save-override-btn'));
    // code is pre-selected via 3 selects (default 4AA), reason is empty
    expect(screen.getByTestId('save-override-btn')).toBeDisabled();
  });

  it('Save button disabled when reason is 9 chars (below minimum)', async () => {
    renderModal();
    await waitFor(() => screen.getByTestId('save-override-btn'));
    fireEvent.change(screen.getByTestId('override-reason-input'), { target: { value: 'Too short' } }); // 9 chars
    expect(screen.getByTestId('save-override-btn')).toBeDisabled();
  });

  it('Save button enabled when reason is 14 chars', async () => {
    renderModal();
    await waitFor(() => screen.getByTestId('save-override-btn'));
    fireEvent.change(screen.getByTestId('override-reason-input'), { target: { value: 'My full thesis' } }); // 14 chars
    expect(screen.getByTestId('save-override-btn')).not.toBeDisabled();
  });

  it('Save button disabled — no fetch called when reason too short', async () => {
    renderModal();
    await waitFor(() => screen.getByTestId('save-override-btn'));
    fireEvent.change(screen.getByTestId('override-reason-input'), { target: { value: 'Too short' } });
    // Button is disabled, no POST should fire
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/classification-override'), expect.anything());
  });

  // ── Save flow ─────────────────────────────────────────────────────────────

  it('Save calls POST with correct body and calls onOverrideChange', async () => {
    const onOverrideChange = jest.fn();
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/history')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ ticker: TICKER, history: [] }) });
      if (url.includes('classification-override') && !url.includes('/history')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ active_code: '3AA', ticker: TICKER }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(BASE_CLASS_RESPONSE) });
    });
    renderModal({ onOverrideChange });
    await waitFor(() => screen.getByTestId('override-bucket-select'));
    // Select bucket=3, EQ=A, BS=A → composedCode = "3AA"
    fireEvent.change(screen.getByTestId('override-bucket-select'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('override-eq-select'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('override-bs-select'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('override-reason-input'), { target: { value: 'My full reasoning here' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-override-btn'));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/classification-override',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticker: TICKER, final_code: '3AA', override_reason: 'My full reasoning here' }),
      }),
    );
    expect(onOverrideChange).toHaveBeenCalledWith(TICKER, '3AA');
  });

  // ── Clear flow ────────────────────────────────────────────────────────────

  it('Clear override calls DELETE and calls onOverrideChange with system code', async () => {
    const onOverrideChange = jest.fn();
    mockFetch({ user_override_code: '3AA', user_override_reason: 'My override reason here', active_code: '3AA' });
    renderModal({ onOverrideChange });
    await waitFor(() => screen.getByTestId('clear-override-btn'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('clear-override-btn'));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/classification-override/${TICKER}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(onOverrideChange).toHaveBeenCalledWith(TICKER, '4AA'); // reverts to system_suggested_code
  });

  // ── API error ─────────────────────────────────────────────────────────────

  it('API error on save shows error message', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/history')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ ticker: TICKER, history: [] }) });
      if (url.includes('classification-override')) return Promise.resolve({ ok: false, status: 500 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(BASE_CLASS_RESPONSE) });
    });
    renderModal();
    await waitFor(() => screen.getByTestId('override-bucket-select'));
    fireEvent.change(screen.getByTestId('override-bucket-select'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('override-reason-input'), { target: { value: 'My full reasoning here' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-override-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('save-error')).toBeInTheDocument();
    });
  });

  // ── Bucket scores ─────────────────────────────────────────────────────────

  it('winning bucket (bucket 4, score 50) test ID is present', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('bucket-score-4')).toBeInTheDocument();
    });
  });

  // ── Empty reason codes ────────────────────────────────────────────────────

  it('empty reason_codes shows "No reason codes available"', async () => {
    mockFetch({ reason_codes: [] });
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/no reason codes available/i)).toBeInTheDocument();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it('modal has role="dialog" and aria-modal="true"', async () => {
    renderModal();
    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });

  it('ESC key calls onClose', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    // Wait for modal to be ready
    await waitFor(() => screen.getByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

});

// ── STORY-082: Demotion notice in Classification tab ──────────────────────────

describe('EPIC-005/STORY-082: ClassificationModal demotion notice (Scenarios 10–11)', () => {

  // Scenario 10: demotion notice shown when effectiveCode !== system_suggested_code
  it('Scenario 10 — shows demotion notice for B6 low confidence stock', async () => {
    mockFetch({ system_suggested_code: '6BA', system_confidence: 'low', active_code: '6BA' });
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('demotion-notice')).toBeInTheDocument();
      expect(screen.getByTestId('demotion-notice')).toHaveTextContent('Valued as B5');
      expect(screen.getByTestId('demotion-notice')).toHaveTextContent('demoted from B6');
      expect(screen.getByTestId('demotion-notice')).toHaveTextContent('low confidence');
    });
  });

  // Scenario 11: no demotion notice when no demotion occurs
  it('Scenario 11 — no demotion notice for high confidence stock', async () => {
    mockFetch({ system_suggested_code: '6BA', system_confidence: 'high', active_code: '6BA' });
    renderModal();
    await waitFor(() => screen.getByText('6BA'));
    expect(screen.queryByTestId('demotion-notice')).not.toBeInTheDocument();
  });

  it('no demotion notice for medium confidence stock', async () => {
    mockFetch({ system_suggested_code: '6BA', system_confidence: 'medium', active_code: '6BA' });
    renderModal();
    await waitFor(() => screen.getByText('6BA'));
    expect(screen.queryByTestId('demotion-notice')).not.toBeInTheDocument();
  });

  it('no demotion notice for B1 low confidence (floor — no demotion)', async () => {
    mockFetch({ system_suggested_code: '1AA', system_confidence: 'low', active_code: '1AA' });
    renderModal();
    await waitFor(() => screen.getByText('1AA'));
    expect(screen.queryByTestId('demotion-notice')).not.toBeInTheDocument();
  });

  it('demotion notice for B5 low confidence: shows B4', async () => {
    mockFetch({ system_suggested_code: '5AA', system_confidence: 'low', active_code: '5AA' });
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('demotion-notice')).toHaveTextContent('Valued as B4');
      expect(screen.getByTestId('demotion-notice')).toHaveTextContent('demoted from B5');
    });
  });

});
