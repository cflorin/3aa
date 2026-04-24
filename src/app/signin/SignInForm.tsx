// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-003: SignInForm client component — form, validation, submit, error display
// EPIC-004/STORY-054/TASK-054-003: Applied dark terminal theme (screen-other.jsx spec)
// ADR-011: no Remember Me; no self-service reset; admin-assisted only

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { T } from '@/lib/theme';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: T.inputBg,
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  color: T.text,
  fontSize: 13,
  padding: '8px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: T.textDim,
  display: 'block',
  marginBottom: 4,
};

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email) { setError('Email is required'); return; }
    if (!email.includes('@')) { setError('Enter a valid email address'); return; }
    if (!password) { setError('Password is required'); return; }

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
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: T.bg,
      fontFamily: 'var(--font-dm-sans, "DM Sans", system-ui, sans-serif)',
    }}>
      <div style={{ width: 360 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#0b0d11',
            fontFamily: 'var(--font-dm-mono, monospace)',
          }}>
            3A
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>
              3AA Monitor
            </div>
            <div style={{ fontSize: 11, color: T.textDim }}>Stock monitoring platform</div>
          </div>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          aria-label="Sign in"
          noValidate
          style={{
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: '24px 24px 20px',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 18 }}>
            Sign in to your account
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="email" style={labelStyle}>Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              style={inputStyle}
            />
          </div>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              style={{ fontSize: 11, color: '#ef4444', marginBottom: 10, margin: '0 0 10px' }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 9,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: T.accent,
              color: '#0b0d11',
              cursor: loading ? 'default' : 'pointer',
              borderRadius: 4,
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.1s',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: T.textDim, margin: '14px 0 0' }}>
            Forgot password? Contact your administrator.
          </p>
        </form>
      </div>
    </div>
  );
}
