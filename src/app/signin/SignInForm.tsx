// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-003: SignInForm client component — form, validation, submit, error display
// ADR-011: no Remember Me; no self-service reset; admin-assisted only
// PRD §9A / Screen 1: email/password form with inline errors

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Client-side validation before fetch
    if (!email) {
      setError('Email is required');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push('/universe');
        return;
      }

      const body = await res.json();
      if (res.status === 401 || res.status === 429 || res.status === 400) {
        // Display API error message verbatim — do not substitute client message (prevents enumeration)
        setError(body.error ?? 'Something went wrong. Please try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Sign in" noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={loading}
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={loading}
        />
      </div>
      {error && (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      )}
      <button type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p>
        Forgot password?{' '}
        <span>Contact your administrator to reset your password.</span>
      </p>
    </form>
  );
}
