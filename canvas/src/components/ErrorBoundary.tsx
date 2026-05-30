import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[otto] render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        height: '100%',
        minHeight: 240,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        padding: 24,
        fontFamily: "'Inter'",
      }}>
        <div style={{
          width: 'min(440px, 100%)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Panel crashed</div>
          <pre style={{
            margin: 0,
            color: 'var(--node-error)',
            fontFamily: "'JetBrains Mono'",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12,
              height: 30,
              border: 'none',
              borderRadius: 5,
              background: 'var(--accent-strong)',
              color: '#fff',
              padding: '0 12px',
              fontFamily: "'Inter'",
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}
