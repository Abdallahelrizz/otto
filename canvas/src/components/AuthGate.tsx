import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import type { AuthStatus } from '../types';

const F = 'Geist, system-ui, sans-serif';

type Mode = 'loading' | 'setup' | 'login' | 'ready' | 'unavailable';

/* ── Loading splash ── */
function LoadingSplash() {
  const cols = 10;
  const rows = 8;
  const tiles: { x: number; y: number; opacity: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = r % 2 === 1 ? 5 : 0; // stagger odd rows
      const isOdd  = (r + c) % 2 === 1;
      tiles.push({
        x:       (c + offsetX) * (100 / cols),
        y:       (r + 0.5)     * (100 / rows),
        opacity: isOdd ? 0.06 : 0.032,
      });
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-canvas)', overflow: 'hidden' }}>
      {/* Staggered logo grid */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {tiles.map((tile, i) => (
          <img
            key={i}
            src="/big_new_logo.svg"
            alt=""
            width={52}
            height={52}
            style={{
              position: 'absolute',
              left:      `${tile.x}%`,
              top:       `${tile.y}%`,
              transform: 'translate(-50%, -50%)',
              opacity:   tile.opacity,
            }}
          />
        ))}
      </div>

      {/* Center: logo + spinner */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}>
        <img src="/big_new_logo.svg" alt="Otto" width={80} height={80} />
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid var(--border-input)',
          borderTopColor: 'var(--accent)',
          animation: 'otto-spin 0.85s linear infinite',
        }} />
      </div>
    </div>
  );
}

/* ── Field ── */
function Field({
  label, value, onChange, type = 'text', placeholder, autoComplete, required, minLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; autoComplete?: string;
  required?: boolean; minLength?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontFamily: F, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        style={{
          height: 38,
          borderRadius: 8,
          border: '1px solid var(--border-input)',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          padding: '0 12px',
          fontFamily: F,
          fontSize: 14,
          outline: 'none',
          transition: 'border-color 0.15s',
          width: '100%',
          boxSizing: 'border-box',
        }}
        onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'; }}
        onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border-input)'; }}
      />
    </div>
  );
}

/* ── Main ── */
export function AuthGate({ children }: { children: ReactNode }) {
  const theme = useStore(s => s.theme);

  const [mode,        setMode]        = useState<Mode>('loading');
  const [email,       setEmail]       = useState('');
  const [name,        setName]        = useState('');
  const [workspace,   setWorkspace]   = useState('Otto Workspace');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  const enterReady = async (_?: AuthStatus) => {
    setMode('ready');
  };

  const checkStatus = async () => {
    setMode('loading');
    setError(null);
    try {
      const status = await api.authStatus();
      if (status.setupRequired)   setMode('setup');
      else if (status.authenticated) await enterReady(status);
      else                           setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Otto');
      setMode('unavailable');
    }
  };

  useEffect(() => { void checkStatus(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'unavailable') return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'setup') {
        await api.setupOwner({ email, name, password, workspaceName: workspace });
      } else {
        await api.login({ email, password });
      }
      await enterReady();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'ready') return <>{children}</>;

  // Full-screen splash while checking auth
  if (mode === 'loading') {
    return (
      <div className={`theme-${theme}`}>
        <LoadingSplash />
      </div>
    );
  }

  const titles: Record<Mode, string> = {
    setup:       'Create your account',
    login:       'Sign in to Otto',
    unavailable: 'Cannot connect',
    loading:     '',
    ready:       '',
  };

  const subtitles: Record<Mode, string> = {
    setup:       'First-time setup — you\'ll be the owner.',
    login:       'Enter your credentials to continue.',
    unavailable: 'The backend is unreachable. Check your connection.',
    loading:     '',
    ready:       '',
  };

  return (
    <div className={`theme-${theme}`} style={{
      minHeight: '100dvh',
      background: 'var(--bg-canvas)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: 'min(380px, 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: 'var(--accent-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <h1 style={{ fontFamily: F, fontSize: 22, fontWeight: 700, letterSpacing: '-0.022em', color: 'var(--text-primary)', margin: 0 }}>
            {titles[mode]}
          </h1>
          <p style={{ fontFamily: F, fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {subtitles[mode]}
          </p>
        </div>

        {/* Form card */}
        <form onSubmit={submit} style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'var(--shadow)',
        }}>
          {mode === 'setup' && (
            <>
              <Field label="Your name" value={name} onChange={setName} placeholder="Ada Lovelace" autoComplete="name" />
              <Field label="Workspace name" value={workspace} onChange={setWorkspace} placeholder="My Workspace" />
            </>
          )}

          {mode !== 'unavailable' && (
            <>
              <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" autoComplete="email" required />
              <Field
                label="Password"
                value={password}
                onChange={setPassword}
                type="password"
                placeholder={mode === 'setup' ? 'At least 8 characters' : '••••••••'}
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                required
                minLength={8}
              />
            </>
          )}

          {error && (
            <div style={{
              fontFamily: F,
              fontSize: 13,
              color: 'var(--node-error)',
              background: 'color-mix(in srgb, var(--node-error) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--node-error) 22%, transparent)',
              borderRadius: 7,
              padding: '8px 12px',
              lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          {mode === 'unavailable' ? (
            <button
              type="button"
              onClick={() => void checkStatus()}
              style={{
                height: 40, borderRadius: 8, border: 'none',
                background: 'var(--accent-strong)', color: '#fff',
                fontFamily: F, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Retry connection
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              style={{
                height: 40, borderRadius: 8, border: 'none',
                background: submitting ? 'var(--bg-hover)' : 'var(--accent-strong)',
                color: submitting ? 'var(--text-muted)' : '#fff',
                fontFamily: F, fontSize: 14, fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {submitting ? 'Please wait…' : mode === 'setup' ? 'Create account' : 'Sign in'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
