import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import type { AuthStatus } from '../types';

type Mode = 'loading' | 'setup' | 'login' | 'ready' | 'unavailable';

const inputStyle: CSSProperties = {
  height: 36,
  borderRadius: 5,
  border: '1px solid var(--border-input)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  padding: '0 10px',
  fontFamily: "'Inter'",
  fontSize: 13,
  outline: 'none',
};

export function AuthGate({ children }: { children: ReactNode }) {
  const restoreLastWorkflow = useStore((s) => s.restoreLastWorkflow);
  const [mode, setMode] = useState<Mode>('loading');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Otto Workspace');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const enterReady = async (_status?: AuthStatus) => {
    setMode('ready');
    await restoreLastWorkflow();
  };

  const checkStatus = async () => {
    setMode('loading');
    setError(null);
    try {
      await api.authStatus()
      .then(async (status) => {
        if (status.setupRequired) setMode('setup');
        else if (status.authenticated) await enterReady(status);
        else setMode('login');
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Otto');
      setMode('unavailable');
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'unavailable') return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'setup') {
        await api.setupOwner({ email, name, password, workspaceName });
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

  return (
    <div className="theme-dark" style={{
      minHeight: '100vh',
      background: 'var(--bg-canvas)',
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter'",
      padding: 24,
    }}>
      <form onSubmit={submit} style={{
        width: 'min(360px, 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 18,
        boxShadow: 'var(--shadow-main)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 2 }}>
          <span style={{ width: 24, height: 24, borderRadius: 5, background: '#FF6F1A', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800 }}>o</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.012em' }}>
              {mode === 'setup' ? 'Create owner account' : mode === 'loading' ? 'Opening Otto' : mode === 'unavailable' ? 'Service unavailable' : 'Sign in'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {mode === 'setup' ? 'First-time setup' : mode === 'unavailable' ? 'Database connection required' : 'Workspace access'}
            </div>
          </div>
        </div>

        {mode === 'setup' && (
          <>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoComplete="name" />
            <input style={inputStyle} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Workspace name" />
          </>
        )}
        {mode !== 'unavailable' && (
          <>
            <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" required />
            <input style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} required minLength={8} />
          </>
        )}

        {error && <div style={{ fontSize: 12, color: 'var(--node-error)', lineHeight: 1.4 }}>{error}</div>}

        {mode === 'unavailable' ? (
          <button
            type="button"
            onClick={() => void checkStatus()}
            style={{
              height: 36,
              borderRadius: 5,
              border: 'none',
              background: '#FF6F1A',
              color: '#fff',
              fontFamily: "'Inter'",
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry connection
          </button>
        ) : (
          <button
            type="submit"
            disabled={submitting || mode === 'loading'}
            style={{
              height: 36,
              borderRadius: 5,
              border: 'none',
              background: '#FF6F1A',
              color: '#fff',
              fontFamily: "'Inter'",
              fontSize: 13,
              fontWeight: 700,
              cursor: submitting || mode === 'loading' ? 'not-allowed' : 'pointer',
              opacity: submitting || mode === 'loading' ? 0.65 : 1,
            }}
          >
            {submitting || mode === 'loading' ? 'Please wait...' : mode === 'setup' ? 'Create account' : 'Sign in'}
          </button>
        )}
      </form>
    </div>
  );
}
