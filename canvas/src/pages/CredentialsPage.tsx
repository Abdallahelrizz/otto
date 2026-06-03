import { useEffect, useState, useCallback, useRef } from 'react';
import { DashboardShell } from '../dashboard/DashboardShell';
import { api } from '../api';
import type { Credential } from '../types';
import {
  ArrowLeft,
  Key,
  MagnifyingGlass,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react';

interface ServiceField {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
}

interface ServiceDef {
  id: string;
  name: string;
  category: string;
  color: string;
  iconUrl: string | null;
  svgContent: string | null;
  fields: ServiceField[];
}

/* Full SVG sanitizer — fixes 5 systematic issues in the inlined catalog logos:
   1. ID collisions (84 SVGs share id="a") → prefix every id and url(#…) reference
   2. Missing viewBox (83 SVGs) → synthesize from captured width/height before stripping
   3. Inline <style> bleed (.cls-N selectors) → rename cls-N → s-<scope>-N throughout
   4. Nested <svg> keeping hard-coded dims → strip w/h on inner <svg> tags too
   5. Wide wordmarks without preserveAspectRatio → add xMidYMid meet
*/
function normalizeSvg(raw: string, scope: string): string {
  const s = scope.replace(/[^a-zA-Z0-9]/g, '-');
  let out = raw;

  // Step 1 — rename .cls-N class names in <style> blocks and class="" attributes
  out = out.replace(/\.cls-(\w+)/g, `.s-${s}-$1`);
  out = out.replace(/\bclass="([^"]*)"/g, (_m, cls: string) =>
    `class="${cls.replace(/\bcls-(\w+)/g, `s-${s}-$1`)}"`
  );

  // Step 2 — scope id attributes and all references to them
  out = out.replace(/\bid="([^"]+)"/gi, (_m, id: string) => `id="${s}-${id}"`);
  out = out.replace(/\burl\(#([^)]+)\)/gi, (_m, id: string) => `url(#${s}-${id})`);
  out = out.replace(/\b(xlink:href|href)="#([^"]+)"/gi, (_m, attr: string, id: string) =>
    `${attr}="#${s}-${id}"`
  );

  // Step 3 — fix <svg> elements
  let rootDone = false;
  out = out.replace(/<svg([^>]*)>/gi, (_m, attrs: string) => {
    if (rootDone) {
      // Nested <svg> — strip hard-coded dimensions only
      const inner = attrs
        .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '');
      return `<svg${inner}>`;
    }
    rootDone = true;

    const wm = attrs.match(/\bwidth\s*=\s*["']([0-9.]+)(?:px)?["']/i);
    const hm = attrs.match(/\bheight\s*=\s*["']([0-9.]+)(?:px)?["']/i);
    const w = wm ? parseFloat(wm[1]) : NaN;
    const h = hm ? parseFloat(hm[1]) : NaN;

    let a = attrs
      .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '');

    if (!/viewBox/i.test(a) && !isNaN(w) && !isNaN(h)) {
      a += ` viewBox="0 0 ${w} ${h}"`;
    }
    if (!/preserveAspectRatio/i.test(a)) {
      a += ' preserveAspectRatio="xMidYMid meet"';
    }

    return `<svg${a} width="100%" height="100%">`;
  });

  return out;
}

/* ── Service logo ──────────────────────────────────────────── */
function ServiceLogo({ svc, size = 32 }: { svc: ServiceDef; size?: number }) {
  const svg = svc.svgContent?.trim();
  if (svg && svg.length > 20 && svg.includes('<svg')) {
    return (
      <span
        className="otto-svc-logo-svg"
        data-svg-scope={svc.id}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: normalizeSvg(svg, svc.id) }}
      />
    );
  }
  return (
    <span
      className="otto-svc-logo-initial"
      style={{ width: size, height: size, background: svc.color, fontSize: Math.round(size * 0.45) }}
    >
      {svc.name[0].toUpperCase()}
    </span>
  );
}

/* ── Step 1: Service picker ────────────────────────────────── */
function ServicePicker({
  catalog,
  loading,
  onSelect,
}: {
  catalog: ServiceDef[];
  loading: boolean;
  onSelect: (svc: ServiceDef) => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = catalog.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = Array.from(new Set(filtered.map(s => s.category)));

  return (
    <div className="otto-svc-picker">
      <label className="otto-search otto-svc-search">
        <MagnifyingGlass size={14} weight="bold" />
        <input
          ref={inputRef}
          placeholder="Search services…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </label>

      {loading ? (
        <div className="otto-svc-skeleton-wrap">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="otto-svc-skeleton-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="otto-svc-empty">
          <MagnifyingGlass size={28} weight="duotone" />
          <p>No services match "{search}"</p>
        </div>
      ) : (
        <div className="otto-svc-scroll">
          {categories.map(cat => (
            <div key={cat}>
              <div className="otto-svc-cat-label">{cat}</div>
              <div className="otto-svc-grid">
                {filtered.filter(s => s.category === cat).map(svc => (
                  <button
                    key={svc.id}
                    type="button"
                    className="otto-svc-card"
                    onClick={() => onSelect(svc)}
                    title={svc.name}
                  >
                    <div className="otto-svc-logo-box">
                      <ServiceLogo svc={svc} size={28} />
                    </div>
                    <span className="otto-svc-card-name">{svc.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Step 2: Credential form ───────────────────────────────── */
function CredentialForm({
  svc,
  onBack,
  onClose,
  onCreated,
}: {
  svc: ServiceDef;
  onBack: () => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(`My ${svc.name}`);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const visibleFields = svc.fields.filter(f => f.type !== 'boolean' && f.type !== 'options');

  const setField = (key: string, val: string) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.createCredential(name.trim(), svc.id, formData);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save credential');
      setSaving(false);
    }
  };

  return (
    <div className="otto-cred-form">
      {/* Service header */}
      <div className="otto-cred-form-svc">
        <div className="otto-cred-form-svc-logo">
          <ServiceLogo svc={svc} size={26} />
        </div>
        <div>
          <strong>{svc.name}</strong>
          <small>{svc.category}</small>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="otto-field">
          Name
          <input
            autoFocus
            placeholder={`My ${svc.name}`}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
          />
        </label>

        {visibleFields.map(f => (
          <label key={f.key} className="otto-field">
            {f.label}
            <input
              type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
              placeholder={f.placeholder ?? ''}
              value={formData[f.key] ?? ''}
              onChange={e => setField(f.key, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onClose(); }}
              style={f.type === 'password' ? { fontFamily: 'Geist Mono, monospace' } : undefined}
            />
          </label>
        ))}

        {svc.fields.length === 0 && (
          <div className="otto-inline-error" style={{ background: 'var(--dash-accent-soft)', color: 'var(--dash-muted)', borderColor: 'transparent' }}>
            This service uses OAuth2. Enter a name and save to store a placeholder — connect it from the workflow canvas.
          </div>
        )}
      </div>

      {error && <div className="otto-inline-error">{error}</div>}

      <div className="otto-modal-actions">
        <button className="otto-button is-ghost" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="otto-button is-primary"
          type="button"
          onClick={() => void handleCreate()}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving…' : 'Save Credential'}
        </button>
      </div>
    </div>
  );
}

/* ── Add Credential modal (2-step) ─────────────────────────── */
interface AddCredModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddCredModal({ onClose, onCreated }: AddCredModalProps) {
  const [catalog, setCatalog] = useState<ServiceDef[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selected, setSelected] = useState<ServiceDef | null>(null);

  useEffect(() => {
    fetch('/credential-catalog.json')
      .then(r => r.json())
      .then((data: ServiceDef[]) => { setCatalog(data); setLoadingCatalog(false); })
      .catch(() => setLoadingCatalog(false));
  }, []);

  return (
    <div className="otto-modal-backdrop" onClick={onClose}>
      <div
        className={`otto-modal${selected ? '' : ' otto-modal--wide'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="otto-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selected && (
              <button
                className="otto-icon-button"
                type="button"
                onClick={() => setSelected(null)}
                style={{ flexShrink: 0 }}
                title="Back"
              >
                <ArrowLeft size={14} weight="bold" />
              </button>
            )}
            <div>
              <h2>{selected ? 'Configure Credential' : 'Select a service'}</h2>
            </div>
          </div>
          <button
            className="otto-icon-button"
            type="button"
            onClick={onClose}
            style={{ flexShrink: 0 }}
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        {selected ? (
          <CredentialForm
            svc={selected}
            onBack={() => setSelected(null)}
            onClose={onClose}
            onCreated={() => { onClose(); onCreated(); }}
          />
        ) : (
          <ServicePicker
            catalog={catalog}
            loading={loadingCatalog}
            onSelect={setSelected}
          />
        )}
      </div>
    </div>
  );
}

/* ── Credential card icon ───────────────────────────────────── */
function CredCardLogo({ type, catalog }: { type: string; catalog: ServiceDef[] }) {
  const svc = catalog.find(s => s.id === type);
  const svg = svc?.svgContent?.trim();
  if (svc && svg && svg.length > 20 && svg.includes('<svg')) {
    return (
      <span
        className="otto-svc-logo-svg"
        data-svg-scope={svc.id}
        style={{ width: 22, height: 22 }}
        dangerouslySetInnerHTML={{ __html: normalizeSvg(svg, svc.id) }}
      />
    );
  }
  if (svc) {
    return (
      <span
        className="otto-svc-logo-initial"
        style={{ width: 22, height: 22, background: svc.color, fontSize: 10 }}
      >
        {svc.name[0].toUpperCase()}
      </span>
    );
  }
  return <Key size={18} weight="duotone" />;
}

/* ── Main page ─────────────────────────────────────────────── */
export function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ServiceDef[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listCredentials();
      setCredentials(list);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/credential-catalog.json')
      .then(r => r.json())
      .then((data: ServiceDef[]) => setCatalog(data))
      .catch(() => {});
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this credential? This action cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.deleteCredential(id);
      setCredentials(c => c.filter(x => x.id !== id));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">

        {/* ── Hero ── */}
        <div className="otto-page-hero">
          <div>
            <span className="otto-title-bar" aria-hidden="true" />
            <h1>Credentials</h1>
            <p className="otto-hero-copy">
              Securely store API keys, passwords, and secrets. Otto encrypts every credential
              at rest and never exposes raw values through the API.
            </p>
          </div>
          <div className="otto-hero-actions">
            <button
              className="otto-button is-primary otto-btn-new"
              type="button"
              onClick={() => setShowModal(true)}
            >
              <Plus size={16} weight="bold" />
              Add Credential
            </button>
          </div>
        </div>

        {/* ── Credential grid ── */}
        {loading ? (
          <div className="otto-cred-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="otto-workflow-skeleton" style={{ minHeight: 100 }} />
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <div className="otto-resource-panel">
            <div className="otto-empty-state">
              <Key size={44} weight="duotone" />
              <h3>No credentials yet</h3>
              <p>Add API keys and secrets to use them in your workflow nodes.</p>
              <button
                className="otto-button is-primary"
                type="button"
                onClick={() => setShowModal(true)}
              >
                <Plus size={15} weight="bold" />
                Add your first credential
              </button>
            </div>
          </div>
        ) : (
          <div className="otto-cred-grid">
            {credentials.map(c => (
              <div key={c.id} className="otto-cred-card">
                <div className="otto-cred-icon">
                  <CredCardLogo type={c.type} catalog={catalog} />
                </div>
                <div className="otto-cred-meta">
                  <strong>{c.name}</strong>
                  <small>{c.type}</small>
                </div>
                <button
                  className="otto-icon-button"
                  type="button"
                  title="Delete credential"
                  disabled={deleting === c.id}
                  onClick={() => void handleDelete(c.id)}
                  style={{ flexShrink: 0, color: deleting === c.id ? 'var(--dash-faint)' : undefined }}
                >
                  <Trash size={15} weight="duotone" />
                </button>
              </div>
            ))}

            {/* Add tile */}
            <button
              type="button"
              className="otto-cred-add-tile"
              onClick={() => setShowModal(true)}
            >
              <Plus size={20} weight="bold" />
              <span>Add Credential</span>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <AddCredModal
          onClose={() => setShowModal(false)}
          onCreated={() => void load()}
        />
      )}
    </DashboardShell>
  );
}
