// otto-v5-data.jsx — theme tokens for dark + light, Icon, workflow data.
// Exposes everything via window for downstream Babel scripts.

/* eslint-disable react/jsx-key */

const { useState, useEffect } = React;

// ─── Otto Amber — punchier than n8n's orange-amber ───────────────────
// Reads as ignition/energy. Same hex in both themes.
const AMBER       = '#FF6F1A';
const AMBER_HOVER = '#FF8A47';

// ─── Theme tokens — dark vs light ────────────────────────────────────
const THEMES = {
  dark: {
    name:        'Dark',
    bgCanvas:    '#0A0908',
    bgPanel:     '#100F0E',
    bgSidebar:   '#0E0D0C',
    bgCard:      '#16151A',
    bgCardLift:  '#1B1A1F',
    border:      'rgba(255,255,255,0.07)',
    borderStrong:'rgba(255,255,255,0.13)',
    textPrimary: 'rgba(247,245,242,0.96)',
    textSecond:  'rgba(170,165,160,0.72)',
    textMuted:   'rgba(120,115,110,0.55)',
    brand:       AMBER,
    brandHover:  AMBER_HOVER,
    brandSoft:   'rgba(255,111,26,0.13)',
    brandRing:   'rgba(255,111,26,0.34)',
    live:        '#22C55E',
    liveSoft:    'rgba(34,197,94,0.15)',
    warn:        AMBER,
    err:         '#EF4444',
    ok:          '#22C55E',
    shadow:      'none',
    shadowMain:  '0 16px 48px rgba(0,0,0,0.55)',
    grid:        'rgba(255,255,255,0.035)',
    btnFg:       '#FFFFFF',
    inputBg:     '#0F0E0D',
    sidebarHover:'rgba(255,255,255,0.04)',
  },
  light: {
    name:        'Light',
    bgCanvas:    '#FAFAF8',
    bgPanel:     '#FFFFFF',
    bgSidebar:   '#F4F3F0',
    bgCard:      '#FFFFFF',
    bgCardLift:  '#FAFAF8',
    border:      'rgba(15,15,10,0.08)',
    borderStrong:'rgba(15,15,10,0.14)',
    textPrimary: '#0A0908',
    textSecond:  '#525050',
    textMuted:   '#A3A09C',
    brand:       AMBER,
    brandHover:  AMBER_HOVER,
    brandSoft:   'rgba(255,111,26,0.08)',
    brandRing:   'rgba(255,111,26,0.28)',
    live:        '#16A34A',
    liveSoft:    'rgba(22,163,74,0.10)',
    warn:        AMBER,
    err:         '#DC2626',
    ok:          '#16A34A',
    shadow:      '0 1px 2px rgba(15,15,10,0.04), 0 3px 12px rgba(15,15,10,0.05)',
    shadowMain:  '0 4px 12px rgba(15,15,10,0.06), 0 18px 48px rgba(15,15,10,0.10)',
    grid:        'rgba(15,15,10,0.06)',
    btnFg:       '#FFFFFF',
    inputBg:     '#FAFAF8',
    sidebarHover:'rgba(15,15,10,0.04)',
  },
};

// ─── Lucide icon component ───────────────────────────────────────────
function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.75 }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!window.lucide?.icons) {
      const t = setTimeout(() => tick((x) => x + 1), 60);
      return () => clearTimeout(t);
    }
  }, []);
  if (!window.lucide?.icons) return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  const pascal = name.replace(/(?:^|-)([a-z])/g, (_, c) => c.toUpperCase());
  const icon = window.lucide.icons[pascal];
  if (!icon) return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  const children = icon[2] || [];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
         fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      {children.map(([t, a], i) => React.createElement(t, { key: i, ...camel(a) }))}
    </svg>
  );
}
function camel(attrs) {
  const out = {};
  for (const k in attrs) {
    if (k === 'class') out.className = attrs[k];
    else if (k.includes('-')) out[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrs[k];
    else out[k] = attrs[k];
  }
  return out;
}

// alpha helper for hex or rgba inputs
function hexA(input, a) {
  if (input.startsWith('rgba(')) return input.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);
  if (input.startsWith('rgb('))  return input.replace(/rgb\(([^)]+)\)/, `rgba($1, ${a})`);
  const h = input.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Node visual palette — recognition by shape × color ──────────────
// Shape encodes what the node DOES; color encodes who/what it IS.
const SERVICE = {
  postgres:  '#336791',  // Postgres blue
  openai:    '#10A37F',  // OpenAI green
  anthropic: '#D97757',  // Anthropic warm
  twilio:    '#F22F46',  // Twilio red
  slack:     '#611F69',  // Slack aubergine
  github:    '#1F2328',  // GitHub near-black
  stripe:    '#635BFF',  // Stripe indigo
};
const NEUTRAL_GRAY_DARK  = 'rgba(170,165,160,0.75)';
const NEUTRAL_GRAY_LIGHT = '#525050';

// ─── Sidebar nav (matching reference) ────────────────────────────────
const NAV = [
  { id: 'workflows', label: 'Workflows',    icon: 'git-fork',    active: true,  badge: 12 },
  { id: 'library',   label: 'Node library', icon: 'layout-grid', active: false, badge: null },
  { id: 'history',   label: 'History',      icon: 'history',     active: false, badge: null },
  { id: 'models',    label: 'Models',       icon: 'cpu',         active: false, badge: 4  },
  { id: 'memory',    label: 'Memory',       icon: 'database',    active: false, badge: null },
  { id: 'settings',  label: 'Settings',     icon: 'settings-2',  active: false, badge: null },
];

// ─── Workflow ────────────────────────────────────────────────────────
const TRIGGER_NODE = {
  id: 'trigger',
  label: 'Webhook',
  sub: 'POST /webhook/leads',
  icon: 'webhook',
  tag: 'TRIGGER',
  visual: { shape: 'rounded', tint: 'amber' },    // amber rounded — Otto trigger
  x: 60, y: 282,
};

const AI_AGENT_NODE = {
  id: 'agent',
  label: 'Lead enrichment agent',
  sub: 'Autonomous orchestration · gpt-4o',
  icon: 'sparkles',
  tag: 'MAIN',
  visual: { shape: 'circle', tint: 'amber' },     // amber circle — Otto-native AI
  x: 332, y: 86,
  tools: [
    { id: 't1', name: 'CRM lookup',         type: 'http_request',  icon: 'globe',           visual: { shape: 'square',  tint: 'neutral' } },
    { id: 't2', name: 'Customer DB',        type: 'postgres_query',icon: 'database',        visual: { shape: 'square',  tint: 'service', color: SERVICE.postgres } },
    { id: 't3', name: 'Past conversations', type: 'memory_read',   icon: 'brain',           visual: { shape: 'circle',  tint: 'amber' } },
    { id: 't4', name: 'Calculator',         type: 'code_js',       icon: 'function-square', visual: { shape: 'square',  tint: 'neutral' } },
  ],
};

const ACTION_NODES = [
  { id: 'act1', label: 'Create CRM record', sub: 'INSERT · customers',  icon: 'database',          tag: 'ACTION', visual: { shape: 'square', tint: 'service', color: SERVICE.postgres }, x: 820, y: 152 },
  { id: 'act2', label: 'Notify ops',         sub: 'SMS · oncall',         icon: 'message-square',    tag: 'ACTION', visual: { shape: 'square', tint: 'service', color: SERVICE.twilio   }, x: 820, y: 272 },
  { id: 'act3', label: 'Save to memory',     sub: 'leads_history',         icon: 'brain',             tag: 'ACTION', visual: { shape: 'circle', tint: 'amber'   },                              x: 820, y: 392 },
];

const RUN_TIMELINE = [
  { id: 'trigger',  label: 'Webhook',          status: 'success', dur: '12ms'  },
  { id: 'agent',    label: 'Lead agent',       status: 'success', dur: '1.4s'  },
  { id: 'act1',     label: 'Create task',      status: 'success', dur: '89ms'  },
  { id: 'act2',     label: 'Notify admin',     status: 'running', dur: null    },
  { id: 'act3',     label: 'Write answer',     status: 'pending', dur: null    },
];

const AGENT_OUTPUT = `{
  "sentiment": "positive",
  "score": 0.982,
  "summary": "User highly satisfied with response speed.",
  "tags": [ "shipping", "quality" ],
  "tools_used": [ "CRM lookup", "Chat history" ]
}`;

Object.assign(window, {
  AMBER, AMBER_HOVER, THEMES,
  SERVICE, NEUTRAL_GRAY_DARK, NEUTRAL_GRAY_LIGHT,
  Icon, hexA,
  NAV,
  TRIGGER_NODE, AI_AGENT_NODE, ACTION_NODES,
  RUN_TIMELINE, AGENT_OUTPUT,
});
