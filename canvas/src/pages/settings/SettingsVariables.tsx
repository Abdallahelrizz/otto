import { useEffect, useState, useCallback } from 'react';
import { DashboardShell } from '../../dashboard/DashboardShell';
import { SettingsNav } from '../../dashboard/SettingsNav';
import { api } from '../../api';
import type { Variable } from '../../types';
import { Plus, Trash, X } from '@phosphor-icons/react';

const TYPES = ['string', 'number', 'boolean', 'json'];

function VarRow({ v, onSaved, onDelete }: { v: Variable; onSaved: () => void; onDelete: () => void }) {
  const [value, setValue] = useState(v.value);
  const [saving, setSaving] = useState(false);
  const dirty = value !== v.value;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try { await api.updateVariable(v.id, { value }); onSaved(); }
    catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="otto-var-row">
      <div className="otto-var-meta">
        <code className="otto-var-name">{v.name}</code>
        <span className="otto-var-type">{v.type}</span>
        {v.description && <span className="otto-var-desc">{v.description}</span>}
      </div>
      <input
        className="otto-var-value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
      />
      {dirty && (
        <button className="otto-button is-primary" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? '…' : 'Save'}
        </button>
      )}
      <button className="otto-icon-button" type="button" title="Delete variable" onClick={onDelete}>
        <Trash size={14} weight="duotone" />
      </button>
    </div>
  );
}

function AddVarModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState('string');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.createVariable(name.trim(), value, type, description || undefined);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create variable');
      setSaving(false);
    }
  };

  return (
    <div className="otto-modal-backdrop" onClick={onClose}>
      <div className="otto-modal" onClick={(e) => e.stopPropagation()}>
        <div className="otto-modal-header">
          <div><h2>Add variable</h2></div>
          <button className="otto-icon-button" type="button" onClick={onClose}><X size={15} weight="bold" /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
          <label className="otto-field">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="MY_VARIABLE"
              style={{ fontFamily: 'Geist Mono, monospace' }}
            />
          </label>
          <label className="otto-field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="otto-field">
            Value
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
          </label>
          <label className="otto-field">
            Description (optional)
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this is for" />
          </label>
        </div>

        {error && <div className="otto-inline-error">{error}</div>}

        <div className="otto-modal-actions">
          <button className="otto-button is-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="otto-button is-primary" type="button" disabled={saving} onClick={() => void create()}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsVariables() {
  const [vars, setVars] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setVars(await api.listVariables()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this variable? This cannot be undone.')) return;
    try { await api.deleteVariable(id); setVars((v) => v.filter((x) => x.id !== id)); }
    catch { /* ignore */ }
  };

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <SettingsNav />
        <div className="otto-page-hero">
          <div>
            <p className="otto-eyebrow">Settings</p>
            <h1>Variables</h1>
            <p className="otto-hero-copy">
              Workspace key/value variables, available to every workflow via {'{{ }}'} expressions.
            </p>
          </div>
          <div className="otto-hero-actions">
            <button className="otto-button is-primary otto-btn-new" type="button" onClick={() => setAddOpen(true)}>
              <Plus size={16} weight="bold" /> Add variable
            </button>
          </div>
        </div>

        <div className="otto-resource-panel otto-settings-panel">
          {loading ? (
            <div className="otto-spend-empty"><span className="otto-dots"><span /><span /><span /></span></div>
          ) : vars.length === 0 ? (
            <div className="otto-empty-state">
              <h3>No variables yet</h3>
              <p>Add reusable values your workflows can reference.</p>
              <button className="otto-button is-primary" type="button" onClick={() => setAddOpen(true)}>
                <Plus size={15} weight="bold" /> Add your first variable
              </button>
            </div>
          ) : (
            <div className="otto-var-list">
              {vars.map((v) => (
                <VarRow key={v.id} v={v} onSaved={() => void load()} onDelete={() => void remove(v.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {addOpen && <AddVarModal onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); void load(); }} />}
    </DashboardShell>
  );
}
