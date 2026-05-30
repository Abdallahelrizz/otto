import type { CSSProperties } from 'react';

const UI_FONT = 'Geist, system-ui, sans-serif';
const MONO_FONT = 'Geist Mono, monospace';

export const fieldStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: '7px',
  color: 'var(--text-primary)',
  fontFamily: UI_FONT,
  fontSize: '13px',
  padding: '7px 10px',
  outline: 'none',
  boxSizing: 'border-box',
};

export const textareaStyle: CSSProperties = {
  ...fieldStyle,
  resize: 'vertical',
  minHeight: '72px',
  lineHeight: 1.5,
};

export const selectStyle: CSSProperties = {
  ...fieldStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '30px',
};

export const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: UI_FONT,
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '5px',
  letterSpacing: '-0.005em',
};

export const monoStyle: CSSProperties = {
  fontFamily: MONO_FONT,
  fontVariantNumeric: 'tabular-nums',
};

export const panelChromeStyle: CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  boxShadow: 'var(--shadow)',
};

export function pillStyle(opts: {
  color?: string;
  bg?: string;
  border?: string;
  size?: 'sm' | 'md';
}): CSSProperties {
  const sm = opts.size === 'sm';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: UI_FONT,
    fontSize: sm ? '10px' : '11px',
    fontWeight: 600,
    color: opts.color ?? 'var(--text-secondary)',
    background: opts.bg ?? 'var(--bg-hover)',
    border: `1px solid ${opts.border ?? 'var(--border)'}`,
    borderRadius: '5px',
    padding: sm ? '1px 5px' : '2px 7px',
    lineHeight: 1.25,
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.01em',
  };
}

export function tabStyle(active: boolean): CSSProperties {
  return {
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: active ? 'var(--bg-hover)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontFamily: UI_FONT,
    fontSize: '11px',
    fontWeight: active ? 600 : 500,
    padding: '4px 9px',
    transition: 'background 0.1s, color 0.1s',
    letterSpacing: '-0.005em',
  };
}

export function smallButtonStyle(opts?: { variant?: 'ghost' | 'solid' }): CSSProperties {
  const solid = opts?.variant === 'solid';
  return {
    border: `1px solid ${solid ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: '6px',
    background: solid ? 'var(--accent)' : 'var(--bg-input)',
    color: solid ? 'var(--accent-contrast)' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontFamily: UI_FONT,
    fontSize: '12px',
    fontWeight: 500,
    padding: '4px 9px',
    transition: 'background 0.1s, color 0.1s',
  };
}

export const UI_FONT_FAMILY = UI_FONT;
export const MONO_FONT_FAMILY = MONO_FONT;
