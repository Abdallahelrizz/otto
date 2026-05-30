import { useState, useEffect, useRef } from 'react';
import { DashboardShell } from '../../dashboard/DashboardShell';
import { SettingsNav } from '../../dashboard/SettingsNav';
import { api } from '../../api';
import type { ApiKey } from '../../types';
import { Plus, X, Key } from '@phosphor-icons/react';

// ── Scope catalog ────────────────────────────────────────────────────────────
const SCOPE_GROUPS = [
  { label: 'Workflows', scopes: ['workflows:read', 'workflows:write', 'workflows:activate', 'workflows:execute', 'workflows:archive', 'workflows:versions:read'] },
  { label: 'Executions', scopes: ['executions:read', 'executions:write', 'executions:retry', 'executions:stop'] },
  { label: 'Nodes', scopes: ['nodes:read'] },
  { label: 'Credentials', scopes: ['credentials:read', 'credentials:write', 'credentials:test', 'credentials:schema:read'] },
  { label: 'Observability & Audit', scopes: ['observability:read', 'audit:read'] },
  { label: 'Variables & Tags', scopes: ['variables:read', 'variables:write', 'tags:read', 'tags:write'] },
  { label: 'Integrations', scopes: ['integrations:read', 'integrations:write'] },
  { label: 'Memory', scopes: ['memory:read', 'memory:write'] },
  { label: 'Approvals & Evaluations', scopes: ['approvals:read', 'approvals:write', 'evaluations:read', 'evaluations:write'] },
  { label: 'Import / Export', scopes: ['import:write', 'export:read'] },
  { label: 'MCP', scopes: ['mcp:invoke'] },
];

const SCOPE_PRESETS = [
  { id: 'full', label: 'Full access', description: 'Access to every endpoint (same as a session).', scopes: ['*'] },
  { id: 'runner', label: 'Workflow runner', description: 'Read workflows + run them + read results.', scopes: ['workflows:read', 'workflows:execute', 'executions:read', 'nodes:read'] },
  { id: 'readonly', label: 'Read-only', description: 'Read workflows, executions, credentials, observability.', scopes: ['workflows:read', 'executions:read', 'credentials:read', 'observability:read', 'nodes:read'] },
  { id: 'mcp', label: 'MCP client', description: 'Workflow + credential introspection for MCP.', scopes: ['workflows:read', 'workflows:write', 'workflows:execute', 'executions:read', 'credentials:read', 'credentials:schema:read', 'nodes:read', 'mcp:invoke'] },
];

const EXPIRY_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
  { label: 'Never', value: null as number | null },
];

function fmtDate(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function SettingsApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newlyMintedKey, setNewlyMintedKey] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formPreset, setFormPreset] = useState('full');
  const [formCustomScopes, setFormCustomScopes] = useState<string[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [formExpiry, setFormExpiry] = useState<number | null>(30);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [copied, setCopied] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadKeys(); }, []);

  async function loadKeys() {
    setLoading(true);
    try { setKeys(await api.listApiKeys()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  function openCreate() {
    setFormName('');
    setFormPreset('full');
    setFormCustomScopes([]);
    setShowCustom(false);
    setFormExpiry(30);
    setCreateError('');
    setNewlyMintedKey(null);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setNewlyMintedKey(null);
  }

  async function handleCreate() {
    if (!formName.trim()) { setCreateError('Name is required'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const scopes = formPreset === 'custom'
        ? formCustomScopes
        : SCOPE_PRESETS.find((p) => p.id === formPreset)?.scopes ?? ['*'];
      const res = await api.createApiKey(formName.trim(), { scopes, expiresInDays: formExpiry });
      setNewlyMintedKey(res.key);
      await loadKeys();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try { await api.deleteApiKey(id); setConfirmRevokeId(null); await loadKeys(); }
    catch { /* ignore */ }
  }

  function handleCopy() {
    if (!newlyMintedKey) return;
    navigator.clipboard.writeText(newlyMintedKey).catch(() => {
      keyRef.current?.select();
      document.execCommand('copy');
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleCustomScope(scope: string) {
    setFormCustomScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]);
  }

  const revokingKey = keys.find((k) => k.id === confirmRevokeId);

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <SettingsNav />
        <div className="otto-page-hero">
          <div>
            <p className="otto-eyebrow">Settings</p>
            <h1>API Keys</h1>
            <p className="otto-hero-copy">
              Your secret keys for the Otto API and MCP clients. Treat them like a password —
              anyone with a key has your access.
            </p>
          </div>
          <div className="otto-hero-actions">
            <button className="otto-button is-primary otto-btn-new" type="button" onClick={openCreate}>
              <Plus size={16} weight="bold" /> Create key
            </button>
          </div>
        </div>

        <div className="otto-resource-panel otto-settings-panel">
          {loading ? (
            <div className="otto-spend-empty"><span className="otto-dots"><span /><span /><span /></span></div>
          ) : keys.length === 0 ? (
            <div className="otto-empty-state">
              <Key size={40} weight="duotone" />
              <h3>No API keys yet</h3>
              <p>Create a key to use Otto from scripts, the CLI, or MCP clients.</p>
              <button className="otto-button is-primary" type="button" onClick={openCreate}>
                <Plus size={15} weight="bold" /> Create your first key
              </button>
            </div>
          ) : (
            <div className="otto-apikey-list">
              {keys.map((k) => (
                <div key={k.id} className="otto-apikey-row">
                  <div className="otto-apikey-main">
                    <div className="otto-apikey-head">
                      <span className="otto-apikey-name">{k.name}</span>
                      <code className="otto-apikey-prefix">{k.key_prefix ?? ''}…</code>
                      {(k.scopes ?? []).map((s) => (
                        <span key={s} className="otto-scope-chip">{s}</span>
                      ))}
                      {isExpired(k.expires_at) && <span className="otto-scope-chip is-error">expired</span>}
                    </div>
                    <div className="otto-apikey-meta">
                      <span>Created {fmtDate(k.created_at)}</span>
                      <span>Expires {fmtDate(k.expires_at)}</span>
                      <span>Last used {fmtDate(k.last_used_at)}</span>
                    </div>
                  </div>
                  <button className="otto-button is-ghost otto-settings-danger" type="button" onClick={() => setConfirmRevokeId(k.id)}>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / reveal modal */}
      {createOpen && (
        <div className="otto-modal-backdrop" onClick={closeCreate}>
          <div className="otto-modal" onClick={(e) => e.stopPropagation()}>
            {newlyMintedKey ? (
              <>
                <div className="otto-modal-header">
                  <div><h2>Key created</h2></div>
                  <button className="otto-icon-button" type="button" onClick={closeCreate}><X size={15} weight="bold" /></button>
                </div>
                <div className="otto-inline-error" style={{ marginBottom: 12 }}>
                  This key is shown <strong>once only</strong>. Copy it now — you cannot retrieve it again.
                </div>
                <div className="otto-key-reveal">
                  <input ref={keyRef} readOnly value={newlyMintedKey} />
                  <button className="otto-button is-primary" type="button" onClick={handleCopy}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p className="otto-settings-hint" style={{ margin: '10px 0 0' }}>
                  Use it like any API key — send <code className="otto-code">Authorization: Bearer otto_…</code>
                </p>
                <div className="otto-modal-actions">
                  <button className="otto-button is-ghost" type="button" onClick={closeCreate}>Done</button>
                </div>
              </>
            ) : (
              <>
                <div className="otto-modal-header">
                  <div><h2>Create API key</h2></div>
                  <button className="otto-icon-button" type="button" onClick={closeCreate}><X size={15} weight="bold" /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
                  <label className="otto-field">
                    Name
                    <input autoFocus placeholder="e.g. MCP client, CI deploy" value={formName} onChange={(e) => setFormName(e.target.value)} />
                  </label>

                  <div className="otto-field-label">Permissions</div>
                  <div className="otto-preset-grid">
                    {SCOPE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`otto-preset-btn${formPreset === p.id && !showCustom ? ' is-active' : ''}`}
                        onClick={() => { setFormPreset(p.id); setShowCustom(false); }}
                      >
                        <strong>{p.label}</strong>
                        <span>{p.description}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="otto-link"
                    onClick={() => { setShowCustom(!showCustom); setFormPreset('custom'); }}
                  >
                    {showCustom ? '▲ Hide custom scopes' : '▼ Custom scopes'}
                  </button>
                  {showCustom && (
                    <div className="otto-scope-picker">
                      {SCOPE_GROUPS.map((g) => (
                        <div key={g.label}>
                          <p className="otto-scope-group-label">{g.label}</p>
                          <div className="otto-chip-row">
                            {g.scopes.map((s) => (
                              <button
                                key={s}
                                type="button"
                                className={`otto-scope-chip is-toggle${formCustomScopes.includes(s) ? ' is-on' : ''}`}
                                onClick={() => toggleCustomScope(s)}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="otto-field-label">Expiration</div>
                  <div className="otto-expiry-row">
                    {EXPIRY_OPTIONS.map((o) => (
                      <button
                        key={String(o.value)}
                        type="button"
                        className={`otto-chip-btn${formExpiry === o.value ? ' is-on' : ''}`}
                        onClick={() => setFormExpiry(o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {createError && <div className="otto-inline-error">{createError}</div>}

                <div className="otto-modal-actions">
                  <button className="otto-button is-ghost" type="button" onClick={closeCreate}>Cancel</button>
                  <button className="otto-button is-primary" type="button" disabled={creating} onClick={() => void handleCreate()}>
                    {creating ? 'Creating…' : 'Create key'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Revoke confirm */}
      {confirmRevokeId && (
        <div className="otto-modal-backdrop" onClick={() => setConfirmRevokeId(null)}>
          <div className="otto-modal otto-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="otto-modal-header">
              <div><h2>Revoke key?</h2></div>
              <button className="otto-icon-button" type="button" onClick={() => setConfirmRevokeId(null)}><X size={15} weight="bold" /></button>
            </div>
            <p className="otto-hero-copy" style={{ marginBottom: 16 }}>
              "{revokingKey?.name ?? ''}" will be permanently revoked. Any clients using it stop working immediately.
            </p>
            <div className="otto-modal-actions">
              <button className="otto-button is-ghost" type="button" onClick={() => setConfirmRevokeId(null)}>Cancel</button>
              <button className="otto-button is-primary otto-settings-danger-solid" type="button" onClick={() => void handleRevoke(confirmRevokeId)}>
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
