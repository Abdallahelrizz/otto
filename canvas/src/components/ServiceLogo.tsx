/**
 * ServiceLogo — renders a brand SVG logo from the credential catalog.
 * Falls back to a colored initial badge when no SVG is available.
 * Uses a module-level singleton cache so the catalog is only fetched once.
 */
import { useEffect, useState } from 'react';

interface CatalogEntry {
  id: string;
  svgContent?: string | null;
  color?: string | null;
  name?: string;
}

// ── Singleton catalog cache ────────────────────────────────────────────────
let _cache: Map<string, CatalogEntry> | null = null;
let _pending: Promise<void> | null = null;

function loadCatalog(): Promise<void> {
  if (_cache) return Promise.resolve();
  if (_pending) return _pending;
  _pending = fetch('/credential-catalog.json')
    .then((r) => r.json())
    .then((entries: CatalogEntry[]) => {
      _cache = new Map(entries.map((e) => [e.id, e]));
    })
    .catch(() => {
      _cache = new Map(); // empty map on failure — falls back to initial
    });
  return _pending;
}

// ── SVG sanitizer (safe rendering of external SVG content) ────────────────
function normalizeSvg(raw: string, scope: string): string {
  const s = scope.replace(/[^a-zA-Z0-9]/g, '-');
  let out = raw;
  out = out.replace(/\.cls-(\w+)/g, `.s-${s}-$1`);
  out = out.replace(/\bclass="([^"]*)"/g, (_m, cls: string) =>
    `class="${cls.replace(/\bcls-(\w+)/g, `s-${s}-$1`)}"`
  );
  out = out.replace(/\bid="([^"]+)"/gi, (_m, id: string) => `id="${s}-${id}"`);
  out = out.replace(/\burl\(#([^)]+)\)/gi, (_m, id: string) => `url(#${s}-${id})`);
  out = out.replace(/\b(xlink:href|href)="#([^"]+)"/gi, (_m, attr: string, id: string) =>
    `${attr}="#${s}-${id}"`
  );
  let rootDone = false;
  out = out.replace(/<svg([^>]*)>/gi, (_m, attrs: string) => {
    if (rootDone) {
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
    if (!/viewBox/i.test(a) && !isNaN(w) && !isNaN(h)) a += ` viewBox="0 0 ${w} ${h}"`;
    if (!/preserveAspectRatio/i.test(a)) a += ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${a} width="100%" height="100%">`;
  });
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────
interface ServiceLogoProps {
  /** Credential catalog ID, e.g. 'slackApi', 'githubApi', 'stripeApi' */
  catalogId: string;
  /** Fallback name for the initial badge */
  name?: string;
  /** Fallback brand color for the initial badge */
  fallbackColor?: string;
  size?: number;
  darkTile?: boolean;
}

function relativeLuminance(hex: string): number | null {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) return null;
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function adaptSvgForDarkTile(svg: string): string {
  return svg.replace(/\b(fill|stroke)="(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)"/g, (match, attr: string, color: string) => {
    const lum = relativeLuminance(color);
    if (lum === null || lum > 0.12) return match;
    return `${attr}="var(--text-primary)"`;
  });
}

export function ServiceLogo({
  catalogId,
  name = catalogId,
  fallbackColor = '#64748b',
  size = 24,
  darkTile = false,
}: ServiceLogoProps) {
  const [loaded, setLoaded] = useState(Boolean(_cache));

  useEffect(() => {
    if (_cache) return;
    loadCatalog().then(() => setLoaded(true));
  }, []);

  const entry = loaded && _cache ? _cache.get(catalogId) : null;
  const svg = entry?.svgContent?.trim();
  const color = entry?.color ?? fallbackColor;
  const initial = (entry?.name ?? name)[0]?.toUpperCase() ?? '?';

  if (loaded && svg && svg.length > 20 && svg.includes('<svg')) {
    const normalized = normalizeSvg(svg, catalogId);
    return (
      <span
        data-catalog-id={catalogId}
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: darkTile ? adaptSvgForDarkTile(normalized) : normalized }}
      />
    );
  }

  return (
    <span style={{
      width: size,
      height: size,
      borderRadius: '4px',
      background: color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      color: '#fff',
      fontSize: Math.round(size * 0.44),
      fontWeight: 700,
      fontFamily: 'Geist, system-ui, sans-serif',
      letterSpacing: '-0.02em',
    }}>
      {loaded ? initial : ''}
    </span>
  );
}
