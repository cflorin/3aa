/**
 * @jest-environment jsdom
 */
// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-004: Unit tests — SignInForm client component
// ADR-011: no Remember Me, no Sign Up link; error messages verbatim from API

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignInForm from '../../../src/app/signin/SignInForm';

const mockFetch = jest.fn();

beforeAll(() => {
  // jsdom environment doesn't have fetch; set it on the global before all tests
  (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

describe('EPIC-002/STORY-014/TASK-014-004: SignInForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
  });

  it('renders email input, password input, and submit button', () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows "Email is required" without calling fetch when email is empty on submit', async () => {
    render(<SignInForm />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows "Enter a valid email address" without calling fetch when email has no @', async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'notanemail' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows "Password is required" without calling fetch when password is empty', async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Password is required');
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls fetch POST /api/auth/signin with email and password on valid submit', async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/signin', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      }));
    });
  });

  it('calls router.push("/universe") on 200 response', async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/universe');
    });
  });

  it('displays API error message on 401 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid email or password' }),
    } as Response);
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });

  it('displays rate limit message on 429 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many sign-in attempts. Please try again later.' }),
    } as Response);
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'anypass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too many sign-in attempts. Please try again later.');
    });
  });

  it('submit button is disabled during in-flight request', async () => {
    // Make fetch hang so we can check intermediate state
    let resolveFetch: (value: Response) => void;
    mockFetch.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; })
    );
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button')).toHaveTextContent('Signing in…');
    });
    // Resolve fetch to avoid hanging
    resolveFetch!({ ok: true, status: 200, json: async () => ({}) } as Response);
  });

  it('does not render Remember Me checkbox or Sign Up link', () => {
    render(<SignInForm />);
    expect(screen.queryByLabelText(/remember me/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();
  });
});
