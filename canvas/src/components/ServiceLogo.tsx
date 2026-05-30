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
}

export function ServiceLogo({
  catalogId,
  name = catalogId,
  fallbackColor = '#64748b',
  size = 24,
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
    return (
      <span
        data-catalog-id={catalogId}
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: normalizeSvg(svg, catalogId) }}
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
