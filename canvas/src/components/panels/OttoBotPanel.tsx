import { useState } from 'react';

const AMBER = '#FF6F1A';

export function OttoBotPanel() {
  const [input, setInput] = useState('');

  return (
    <div style={{
      flex: 1,
      background: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border)',
      minWidth: 0,
    }}>
      {/* Header */}
      <div style={{
        height: 36,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{
          width: 18,
          height: 18,
          borderRadius: '4px',
          background: 'var(--brand-soft)',
          border: '1px solid var(--brand-ring)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </span>
        <span style={{
          fontSize: '12.5px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.008em',
          fontFamily: "'Inter'",
        }}>
          otto bot
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono'",
          fontSize: '9.5px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          fontWeight: 500,
        }}>
          workflow assistant
        </span>
        <div style={{ flex: 1 }} />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        padding: '12px 14px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
      }}>
        <div style={{ display: 'flex', gap: '9px' }}>
          <span style={{
            width: 22,
            height: 22,
            borderRadius: '5px',
            background: 'var(--brand-soft)',
            border: '1px solid var(--brand-ring)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <div style={{ flex: 1 }}>
            <p style={{
              fontSize: '12.5px',
              color: 'var(--text-primary)',
              lineHeight: 1.55,
              letterSpacing: '-0.003em',
              margin: 0,
              fontFamily: "'Inter'",
            }}>
              Your agent runs <strong style={{ fontWeight: 600 }}>CRM lookup</strong> and <strong style={{ fontWeight: 600 }}>Chat history</strong> sequentially. They have no shared deps — running them in parallel cuts agent latency by{' '}
              <strong style={{ color: AMBER, fontWeight: 700 }}>~2.3×</strong>.
            </p>
            <div style={{ marginTop: '9px', display: 'flex', gap: '6px' }}>
              <button style={{
                padding: '5px 11px',
                background: AMBER,
                color: '#fff',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: 600,
                fontFamily: "'Inter'",
                borderRadius: '4px',
                cursor: 'pointer',
                letterSpacing: '-0.005em',
              }}>
                Refactor for me
              </button>
              <button style={{
                padding: '5px 11px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                fontSize: '11.5px',
                fontWeight: 500,
                fontFamily: "'Inter'",
                borderRadius: '4px',
                cursor: 'pointer',
                letterSpacing: '-0.005em',
              }}>
                Show where
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Input */}
      <div style={{
        padding: '10px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 10px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: '5px',
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask otto bot to improve this workflow…"
            style={{
              flex: 1,
              fontSize: '12.5px',
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              letterSpacing: '-0.005em',
              fontWeight: 400,
              fontFamily: "'Inter'",
            }}
          />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
