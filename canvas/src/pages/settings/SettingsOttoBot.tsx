import { useEffect, useState, useRef } from 'react';
import { DashboardShell } from '../../dashboard/DashboardShell';
import { SettingsNav } from '../../dashboard/SettingsNav';
import { api } from '../../api';
import type { AuthStatus } from '../../types';
import { Robot } from '@phosphor-icons/react';

function CredentialDropdown({
  value,
  onChange,
  disabled,
  options
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  disabled: boolean;
  options: Array<{ id: string; name: string; type: string }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  const current = options.find((o) => o.id === value);
  const label = current ? `${current.name} (${current.type})` : '-- Select an AI Credential --';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="otto-sort-wrap" ref={ref} style={{ maxWidth: 400, opacity: disabled ? 0.6 : 1 }}>
      <button 
        type="button" 
        className="otto-sort-trigger" 
        style={{ width: '100%', justifyContent: 'space-between', padding: '0 10px', minHeight: 34, background: 'var(--dash-input-bg)', border: '1px solid var(--dash-border)', borderRadius: 7 }}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
      >
        <span>{label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && !disabled && (
        <div className="otto-sort-menu" role="listbox" style={{ width: '100%', top: 'calc(100% + 4px)' }}>
          <button
            className={`otto-sort-option${!value ? ' is-active' : ''}`}
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            -- Select an AI Credential --
          </button>
          {options.map((opt) => (
            <button
              key={opt.id}
              className={`otto-sort-option${value === opt.id ? ' is-active' : ''}`}
              type="button"
              role="option"
              aria-selected={value === opt.id}
              onClick={() => { onChange(opt.id); setOpen(false); }}
            >
              {opt.name} ({opt.type})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsOttoBot() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [credentials, setCredentials] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void api.authStatus().then(setAuth).catch(() => {});
    void api.ottobotCredentials().then((res) => setCredentials(res.credentials)).catch(() => {});
  }, []);

  const settings = auth?.workspace?.ottobot_settings ?? { enabled: true, credentialId: null };

  const handleUpdate = async (patch: Partial<typeof settings>) => {
    if (!auth) return;
    setIsSaving(true);
    try {
      const res = await api.updateOttobotSettings(patch);
      setAuth((prev) => prev ? { ...prev, workspace: { ...prev.workspace!, ottobot_settings: res.ottobot_settings } } : null);
    } catch (err) {
      alert((err as Error).message ?? 'Failed to update Settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <SettingsNav />
        <div className="otto-page-hero">
          <div>
            <span className="otto-title-bar" aria-hidden="true" />
            <h1>OttoBot</h1>
            <p className="otto-hero-copy">Configure your AI workspace assistant.</p>
          </div>
        </div>

        <div className="otto-resource-panel otto-settings-panel">
          <h2 className="otto-settings-h2">
            <Robot size={18} weight="duotone" style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            Assistant Settings
          </h2>
          <p style={{ margin: '0 0 16px', color: 'var(--dash-muted)' }}>
            OttoBot uses your configured workspace credentials to power the chat.
            Token usage will be attributed to "OttoBot Chat" on the Usage page.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Enable Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                onClick={() => { if (!isSaving) handleUpdate({ enabled: !settings.enabled }); }}
                disabled={isSaving}
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: settings.enabled ? 'var(--dash-accent-strong)' : 'var(--dash-input-bg)',
                  border: `1px solid ${settings.enabled ? 'var(--dash-accent-strong)' : 'var(--dash-border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: settings.enabled ? '#fff' : 'var(--dash-muted)',
                    transform: settings.enabled ? 'translateX(16px)' : 'translateX(0)',
                    transition: 'transform 0.2s, background 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                />
              </button>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>Enable OttoBot</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--dash-muted)' }}>Allow workspace members to chat with OttoBot.</span>
              </div>
            </div>

            {/* Credential Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontWeight: 600 }}>AI Credential</label>
              <CredentialDropdown
                value={settings.credentialId ?? null}
                onChange={(val) => handleUpdate({ credentialId: val })}
                disabled={isSaving || !settings.enabled}
                options={credentials}
              />
              {credentials.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--c-error)' }}>
                  No AI credentials found. Add an OpenAI, Anthropic, or OpenRouter credential first.
                </span>
              ) : (
                <span style={{ fontSize: '0.85rem', color: 'var(--dash-muted)', maxWidth: 400 }}>
                  If you wish to create your own credential for OttoBot specifically, link it here after you create it, and then when it is linked, we should see usage specifically from OttoBot.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
