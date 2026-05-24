// node-cards-v2.jsx — Otto node cards, restructure.
//
// Icon-dominant, near-square nodes. Simple = 72×72; complex = 100×variable
// with always-visible labeled handles. Multi-font system:
//   Inter         — UI chrome
//   JetBrains Mono — node + handle labels, slugs
//   Geist Mono    — code / param values
//   Fraunces      — workflow name + empty state heading
//
// Lucide icons via UMD: window.lucide.icons[PascalName] = [tag, attrs, children].

/* eslint-disable react/jsx-key, react/no-unknown-property */

const { useState, useEffect } = React;

// ─── Category vocabulary ─────────────────────────────────────────────
const CATS = {
  triggers: { label: 'TRIGGERS', color: '#f59e0b' },
  core:     { label: 'CORE',     color: '#64748b' },
  ai:       { label: 'AI',       color: '#8b5cf6' },
  data:     { label: 'DATA',     color: '#06b6d4' },
};

// ─── Node defs — handles described explicitly ────────────────────────
const NODES = [
  { type: 'webhook_trigger', cat: 'triggers', label: 'Webhook',         icon: 'zap',                slug: 'WEBHK',
    handles: { in: [],                                                                    out: [{ id: 'output' }]                          } },

  { type: 'http_request',    cat: 'core',     label: 'HTTP Request',    icon: 'globe',              slug: 'HTTP',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'if',              cat: 'core',     label: 'IF Condition',    icon: 'git-branch',         slug: 'IF',     complex: true,
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'true',  label: 'true',  color: '#22c55e' },
                                                                                                 { id: 'false', label: 'false', color: '#ef4444' }] } },

  { type: 'merge',           cat: 'core',     label: 'Merge',           icon: 'git-merge',          slug: 'MERGE',  complex: true,
    handles: { in: [{ id: 'in1', label: 'input 1' },
                     { id: 'in2', label: 'input 2' },
                     { id: 'in3', label: 'input 3' }],                                    out: [{ id: 'output' }]                          } },

  { type: 'set',             cat: 'core',     label: 'Set / Transform', icon: 'sliders-horizontal', slug: 'SET',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'code',            cat: 'core',     label: 'Code (JS)',       icon: 'braces',             slug: 'CODE',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'delay',           cat: 'core',     label: 'Delay',           icon: 'timer',              slug: 'DELAY',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'filter',          cat: 'core',     label: 'Filter',          icon: 'filter',             slug: 'FLTR',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'loop',            cat: 'core',     label: 'Loop',            icon: 'repeat',             slug: 'LOOP',   complex: true,
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'loop', label: 'loop' },
                                                                                                 { id: 'done', label: 'done' }]            } },

  { type: 'sub_workflow',    cat: 'core',     label: 'Sub-workflow',    icon: 'workflow',           slug: 'SUBFL',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'send_email',      cat: 'core',     label: 'Send Email',      icon: 'mail',               slug: 'EMAIL',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'llm_call',        cat: 'ai',       label: 'LLM Call',        icon: 'brain',              slug: 'LLM',    complex: true,
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }],
               extras: [{ id: 'model', label: 'model', side: 'bottom' }] } },

  { type: 'ai_agent',        cat: 'ai',       label: 'AI Agent',        icon: 'bot',                slug: 'AGENT',  complex: true,
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }],
               extras: [
                 { id: 't1', label: '1', side: 'bottom' },
                 { id: 't2', label: '2', side: 'bottom' },
                 { id: 't3', label: '3', side: 'bottom' },
                 { id: 't4', label: '4', side: 'bottom' },
                 { id: 't5', label: '5', side: 'bottom' },
               ] } },

  { type: 'vector_search',   cat: 'ai',       label: 'Vector Search',   icon: 'search',             slug: 'VEC',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'postgres_query',  cat: 'data',     label: 'Postgres Query',  icon: 'database',           slug: 'PG',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'redis_get',       cat: 'data',     label: 'Redis Get',       icon: 'zap',                slug: 'GET',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },

  { type: 'redis_set',       cat: 'data',     label: 'Redis Set',       icon: 'pencil',             slug: 'SET',
    handles: { in: [{ id: 'input' }],                                                     out: [{ id: 'output' }]                          } },
];

const SIMPLE_NODES  = NODES.filter((n) => !n.complex);
const COMPLEX_NODES = NODES.filter((n) =>  n.complex);

// ─── Lucide icon — pulls SVG data straight from window.lucide.icons ──
function LucideIcon({ name, size = 16, color = 'currentColor', strokeWidth = 1.75 }) {
  const [, force] = useState(0);
  useEffect(() => {
    // Lucide UMD loads synchronously but the very first paint may race; tick once.
    if (!window.lucide?.icons) {
      const t = setTimeout(() => force((x) => x + 1), 60);
      return () => clearTimeout(t);
    }
  }, []);

  if (!window.lucide?.icons) {
    return <span style={{ display: 'inline-block', width: size, height: size }} />;
  }
  const pascalName = name.replace(/(?:^|-)([a-z])/g, (_, c) => c.toUpperCase());
  const icon = window.lucide.icons[pascalName];
  if (!icon) {
    return <span style={{ display: 'inline-block', width: size, height: size, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }} />;
  }
  const children = icon[2] || [];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      {children.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrsToReact(attrs) }))}
    </svg>
  );
}

function attrsToReact(attrs) {
  const out = {};
  for (const k in attrs) {
    if (k === 'class') out.className = attrs[k];
    else if (k.includes('-')) out[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrs[k];
    else out[k] = attrs[k];
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Card height for a node based on its handle config.
// 72 baseline; grows if the vertical side (left inputs OR right outputs)
// has >1 handle.
function cardHeightFor(node) {
  const vert = Math.max(node.handles.in.length, node.handles.out.length);
  if (vert <= 1) return 72;
  // Need: 14px top padding + (n-1) * 22px between dots + 14px bottom + extra for label
  const dotsArea = 14 + (vert - 1) * 22 + 14;
  return Math.max(72, dotsArea + 24);
}

function cardWidthFor(node) {
  if (node.complex) return 100;
  return 72;
}

// ─── Handles — variant-agnostic positioning ──────────────────────────
function Handles({ node, width, height }) {
  const cat = CATS[node.cat];

  const ins  = node.handles.in;
  const outs = node.handles.out;
  const extras = node.handles.extras || [];

  // Evenly distribute handles along an edge
  const yFor = (i, count) => ((i + 1) / (count + 1)) * height;
  const xFor = (i, count) => ((i + 1) / (count + 1)) * width;

  const dotSize = 8;
  const ringBg = '#0a0a0c';

  // Common dot + label styles
  const dotStyle = (color) => ({
    position: 'absolute',
    width: dotSize, height: dotSize,
    borderRadius: '50%',
    background: color,
    boxShadow: `0 0 0 2px ${ringBg}`,
    zIndex: 2,
  });

  const labelStyle = {
    position: 'absolute',
    fontFamily: '"JetBrains Mono"',
    fontSize: 11,            // per spec: never below 11px
    fontWeight: 500,
    letterSpacing: '0.02em',
    color: 'rgba(225,225,232,0.78)',
    whiteSpace: 'nowrap',
    lineHeight: 1,
    pointerEvents: 'none',
    zIndex: 2,
  };

  return (
    <>
      {/* Inputs — left edge */}
      {ins.map((h, i) => {
        const y = yFor(i, ins.length);
        const color = h.color || cat.color;
        return (
          <React.Fragment key={`in-${h.id}`}>
            <span style={{ ...dotStyle(color), left: -dotSize / 2, top: y, transform: 'translateY(-50%)' }} />
            {h.label && (
              <span style={{
                ...labelStyle,
                right: `calc(100% + 12px)`,
                top: y, transform: 'translateY(-50%)',
                textAlign: 'right',
                color: hexA(color, 0.95),
              }}>
                {h.label}
              </span>
            )}
          </React.Fragment>
        );
      })}

      {/* Outputs — right edge */}
      {outs.map((h, i) => {
        const y = yFor(i, outs.length);
        const color = h.color || cat.color;
        return (
          <React.Fragment key={`out-${h.id}`}>
            <span style={{ ...dotStyle(color), right: -dotSize / 2, top: y, transform: 'translateY(-50%)' }} />
            {h.label && (
              <span style={{
                ...labelStyle,
                left: `calc(100% + 12px)`,
                top: y, transform: 'translateY(-50%)',
                color: hexA(color, 0.95),
              }}>
                {h.label}
              </span>
            )}
          </React.Fragment>
        );
      })}

      {/* Extras — bottom edge */}
      {extras.length > 0 && (() => {
        const bottoms = extras.filter((e) => (e.side || 'bottom') === 'bottom');
        return bottoms.map((h, i) => {
          const x = xFor(i, bottoms.length);
          const color = h.color || cat.color;
          return (
            <React.Fragment key={`ex-${h.id}`}>
              <span style={{ ...dotStyle(color), bottom: -dotSize / 2, left: x, transform: 'translateX(-50%)' }} />
              {h.label && (
                <span style={{
                  ...labelStyle,
                  top: `calc(100% + 12px)`,
                  left: x,
                  transform: 'translateX(-50%)',
                  fontSize: bottoms.length > 3 ? 11 : 11,
                  color: hexA(color, 0.9),
                }}>
                  {h.label}
                </span>
              )}
            </React.Fragment>
          );
        });
      })()}
    </>
  );
}

// ─── Card body — variant-specific ────────────────────────────────────
function CardBody({ node, variant, width, height }) {
  const cat = CATS[node.cat];
  const color = cat.color;

  const baseStyle = {
    position: 'relative',
    width, height,
    borderRadius: 6,
    boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center',
    transition: 'all 130ms ease-out',
    overflow: 'hidden',
  };

  let style = {};
  let labelColor = 'rgba(232,232,238,0.92)';
  let iconElement, slugTop = null, capStrip = null, bottomLabel = null;

  // ─── P1 · Pure Square ─────────────────────────────────────────────
  if (variant === 'pure-square') {
    style = {
      background: '#101015',
      border: `1.5px solid ${hexA(color, 0.55)}`,
      paddingTop: 10,
      paddingBottom: 8,
    };
    iconElement = (
      <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
        <LucideIcon name={node.icon} size={28} color={color} strokeWidth={1.75} />
      </div>
    );
    bottomLabel = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 4px 0' }}>
        <span style={nodeLabelStyle(labelColor)}>{node.label}</span>
      </div>
    );
  }

  // ─── P2 · Capped Header ───────────────────────────────────────────
  if (variant === 'capped-header') {
    style = {
      background: '#0e0e13',
      border: `1px solid rgba(255,255,255,0.07)`,
      paddingTop: 0,
    };
    capStrip = (
      <div style={{
        width: '100%', height: 5,
        background: color,
        flexShrink: 0,
      }} />
    );
    iconElement = (
      <div style={{ height: 32, display: 'flex', alignItems: 'center', marginTop: 8 }}>
        <LucideIcon name={node.icon} size={28} color={color} strokeWidth={1.75} />
      </div>
    );
    bottomLabel = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 4px 6px' }}>
        <span style={nodeLabelStyle(labelColor)}>{node.label}</span>
      </div>
    );
  }

  // ─── P3 · Tinted Body ─────────────────────────────────────────────
  if (variant === 'tinted-body') {
    style = {
      background: `linear-gradient(180deg, ${hexA(color, 0.14)} 0%, ${hexA(color, 0.04)} 100%), #0d0d12`,
      border: `1.5px solid ${hexA(color, 0.30)}`,
      paddingTop: 10,
      paddingBottom: 8,
    };
    iconElement = (
      <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
        <LucideIcon name={node.icon} size={28} color={color} strokeWidth={1.75} />
      </div>
    );
    bottomLabel = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 4px 0' }}>
        <span style={nodeLabelStyle(labelColor)}>{node.label}</span>
      </div>
    );
  }

  // ─── P4 · Engineering Slug ────────────────────────────────────────
  // Mono slug at the top, icon center, no label below — most industrial.
  if (variant === 'engineering-slug') {
    style = {
      background: '#0c0c10',
      border: `1.5px solid ${hexA(color, 0.50)}`,
      paddingTop: 0,
    };
    slugTop = (
      <div style={{
        width: '100%', padding: '4px 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${hexA(color, 0.18)}`,
        background: hexA(color, 0.08),
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: '"JetBrains Mono"',
          fontSize: 11, fontWeight: 600,
          color: hexA(color, 0.95),
          letterSpacing: '0.08em',
        }}>
          {node.slug}
        </span>
        <span style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: hexA(color, 0.85),
          boxShadow: `0 0 5px ${hexA(color, 0.7)}`,
        }} />
      </div>
    );
    iconElement = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LucideIcon name={node.icon} size={30} color={color} strokeWidth={1.75} />
      </div>
    );
    // No bottom label — slug stands in for type
  }

  return (
    <div style={{ ...baseStyle, ...style }}>
      {capStrip}
      {slugTop}
      {iconElement}
      {bottomLabel}
    </div>
  );
}

function nodeLabelStyle(color) {
  return {
    fontFamily: '"JetBrains Mono"',
    fontSize: 11,
    fontWeight: 500,
    color,
    textAlign: 'center',
    lineHeight: 1.18,
    letterSpacing: '-0.005em',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    wordBreak: 'break-word',
    maxWidth: '100%',
  };
}

// ─── Full node (body + handles) ──────────────────────────────────────
function NodeCard({ node, variant }) {
  const width  = cardWidthFor(node);
  const height = cardHeightFor(node);
  return (
    <div style={{ position: 'relative', width, height }}>
      <CardBody node={node} variant={variant} width={width} height={height} />
      <Handles node={node} width={width} height={height} />
    </div>
  );
}

// ─── Slot — wraps a card with enough room for outside handle labels ──
// For simple cards (no labels), the slot is just the card size + tight margin.
// For complex cards, slot adds gutters per side based on which sides have labeled handles.
function NodeSlot({ node, variant }) {
  const w = cardWidthFor(node);
  const h = cardHeightFor(node);

  // outside-label gutters
  const hasLeftLabel  = node.handles.in.some((x) => x.label);
  const hasRightLabel = node.handles.out.some((x) => x.label);
  const hasBottomLabel = (node.handles.extras || []).some((x) => x.label);

  const gutter = {
    left:   hasLeftLabel  ? 64 : 14,
    right:  hasRightLabel ? 64 : 14,
    top:    14,
    bottom: hasBottomLabel ? 32 : 14,
  };

  return (
    <div style={{
      position: 'relative',
      paddingLeft: gutter.left,
      paddingRight: gutter.right,
      paddingTop: gutter.top,
      paddingBottom: gutter.bottom,
      width: w + gutter.left + gutter.right,
      height: h + gutter.top + gutter.bottom,
      boxSizing: 'border-box',
    }}>
      <NodeCard node={node} variant={variant} />
    </div>
  );
}

// ─── Section header (used inside each variant board) ─────────────────
function SectionHeader({ label, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      marginBottom: 10, marginTop: 4,
    }}>
      <span style={{
        fontFamily: '"JetBrains Mono"',
        fontSize: 11, fontWeight: 600,
        color: 'rgba(180,180,190,0.85)',
        letterSpacing: '0.16em',
      }}>{label}</span>
      <span style={{
        fontFamily: '"JetBrains Mono"',
        fontSize: 11, fontWeight: 500,
        color: 'rgba(120,120,135,0.7)',
        letterSpacing: '0.06em',
      }}>{String(count).padStart(2, '0')}</span>
      <div style={{
        flex: 1, height: 1,
        background: 'rgba(255,255,255,0.05)',
        alignSelf: 'center', marginLeft: 4,
      }} />
    </div>
  );
}

// ─── Mock chrome — workflow name in Fraunces, gives variant board context
function MockChrome({ workflow }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      paddingBottom: 16,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{
        fontFamily: '"Fraunces"',
        fontSize: 22, fontWeight: 500,
        fontVariationSettings: '"opsz" 144',
        color: '#fafafa',
        letterSpacing: '-0.01em',
        fontStyle: 'normal',
      }}>otto</span>
      <span style={{
        fontFamily: '"Inter"',
        fontSize: 12, fontWeight: 500,
        color: 'rgba(150,150,160,0.5)',
      }}>/</span>
      <span style={{
        fontFamily: '"Fraunces"',
        fontSize: 18, fontWeight: 400,
        fontVariationSettings: '"opsz" 60',
        color: 'rgba(232,232,238,0.92)',
        fontStyle: 'italic',
        letterSpacing: '-0.005em',
      }}>{workflow}</span>

      <div style={{ flex: 1 }} />

      <span style={{
        fontFamily: '"JetBrains Mono"',
        fontSize: 11, fontWeight: 500,
        color: 'rgba(120,120,135,0.7)',
        letterSpacing: '0.08em',
      }}>17n · 24e</span>
      <span style={{
        fontFamily: '"Inter"',
        fontSize: 12, fontWeight: 500,
        color: 'rgba(180,180,190,0.8)',
        padding: '5px 11px',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 5,
      }}>Run</span>
    </div>
  );
}

// ─── Variant board — chrome + simple grid + complex row ──────────────
function VariantBoard({ name, code, mantra, variant, workflow }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#0a0a0c',
      padding: '24px 32px 32px',
      boxSizing: 'border-box',
      color: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
    }}>
      <MockChrome workflow={workflow} />

      {/* Variant identity row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{
          fontFamily: '"Inter"',
          fontSize: 19, fontWeight: 600,
          letterSpacing: '-0.018em',
        }}>{name}</span>
        <span style={{
          fontFamily: '"JetBrains Mono"',
          fontSize: 11, fontWeight: 600,
          color: 'rgba(180,180,190,0.85)',
          letterSpacing: '0.10em',
          padding: '3px 7px',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 3,
        }}>{code}</span>
        <span style={{
          fontFamily: '"Inter"',
          fontSize: 13, fontWeight: 400,
          color: 'rgba(150,150,160,0.85)',
          letterSpacing: '-0.002em',
          marginLeft: 4,
        }}>{mantra}</span>
      </div>

      {/* SIMPLE NODES */}
      <SectionHeader label="SIMPLE NODES" count={SIMPLE_NODES.length} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, max-content)',
        rowGap: 8,
        columnGap: 24,
        justifyContent: 'start',
      }}>
        {SIMPLE_NODES.map((n) => (
          <NodeSlot key={n.type} node={n} variant={variant} />
        ))}
      </div>

      {/* COMPLEX NODES */}
      <SectionHeader label="COMPLEX NODES" count={COMPLEX_NODES.length} />
      <div style={{
        display: 'flex',
        gap: 20,
        alignItems: 'flex-start',
      }}>
        {COMPLEX_NODES.map((n) => (
          <NodeSlot key={n.type} node={n} variant={variant} />
        ))}
      </div>
    </div>
  );
}

// ─── Typography demo board ──────────────────────────────────────────
function TypographyBoard() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#0a0a0c',
      padding: '36px 40px',
      boxSizing: 'border-box',
      color: '#fafafa',
      display: 'flex', flexDirection: 'column', gap: 28,
    }}>
      {/* Board title */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{
          fontFamily: '"Inter"',
          fontSize: 19, fontWeight: 600,
          letterSpacing: '-0.018em',
        }}>Typographic system</span>
        <span style={{
          fontFamily: '"JetBrains Mono"',
          fontSize: 11, fontWeight: 600,
          color: 'rgba(180,180,190,0.85)',
          letterSpacing: '0.10em',
          padding: '3px 7px',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 3,
        }}>T0</span>
        <span style={{
          fontFamily: '"Inter"',
          fontSize: 13, color: 'rgba(150,150,160,0.85)',
          marginLeft: 4,
        }}>4 families, role-restricted. Serif as the surprising accent.</span>
      </div>

      {/* Mock canvas with the empty state */}
      <div style={{
        background: '#0a0a0c',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '36px 40px',
        display: 'flex', flexDirection: 'column', gap: 12,
        alignItems: 'flex-start',
      }}>
        <span style={{
          fontFamily: '"JetBrains Mono"',
          fontSize: 11, fontWeight: 500,
          color: 'rgba(150,150,160,0.55)',
          letterSpacing: '0.16em',
        }}>EMPTY STATE</span>
        <span style={{
          fontFamily: '"Fraunces"',
          fontSize: 36, fontWeight: 500,
          fontVariationSettings: '"opsz" 144',
          color: '#fafafa',
          letterSpacing: '-0.018em',
          lineHeight: 1.1,
        }}>
          Start with a trigger.
        </span>
        <span style={{
          fontFamily: '"Inter"',
          fontSize: 14, fontWeight: 400,
          color: 'rgba(170,170,180,0.85)',
          letterSpacing: '-0.005em',
          maxWidth: 520, lineHeight: 1.45,
        }}>
          Drop a Webhook, Scheduler, or Manual trigger from the sidebar.
          Everything downstream runs the moment data arrives.
        </span>
      </div>

      {/* Four-up: each font role */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <FontCard
          family="Fraunces"
          role="Serif accent"
          where="Workflow name. Empty-state heading. Nowhere else."
          sample={<span style={{ fontFamily: '"Fraunces"', fontVariationSettings: '"opsz" 144', fontSize: 26, fontWeight: 500, letterSpacing: '-0.015em' }}>Lead Enrichment</span>}
          spec="500 / 144 opsz"
        />
        <FontCard
          family="Inter"
          role="UI chrome"
          where="Buttons. Sidebar. Inspector labels. Tooltips."
          sample={<div style={{ fontFamily: '"Inter"', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Add node</span>
            <span style={{ fontSize: 12, color: 'rgba(170,170,180,0.85)' }}>Search 17 types</span>
            <span style={{ fontSize: 11, color: 'rgba(140,140,150,0.65)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Triggers</span>
          </div>}
          spec="400 / 500 / 600"
        />
        <FontCard
          family="JetBrains Mono"
          role="Technical, small"
          where="Node labels. Handle labels. Execution log lines."
          sample={<div style={{ fontFamily: '"JetBrains Mono"', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 500 }}>→ true</span>
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500 }}>→ false</span>
            <span style={{ fontSize: 11, color: 'rgba(170,170,180,0.85)', fontWeight: 500 }}>input 1</span>
          </div>}
          spec="500 / 600"
        />
        <FontCard
          family="Geist Mono"
          role="Code & values"
          where="Code fields. Parameter values. JSON output."
          sample={<div style={{ fontFamily: '"Geist Mono"', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'rgba(140,180,255,0.92)' }}>{`{ "model":`}</span>
            <span style={{ fontSize: 12, color: 'rgba(160,220,170,0.92)', paddingLeft: 12 }}>{`"gpt-4o-mini"`}</span>
            <span style={{ fontSize: 12, color: 'rgba(140,180,255,0.92)' }}>{`}`}</span>
          </div>}
          spec="400 / 500"
        />
      </div>
    </div>
  );
}

function FontCard({ family, role, where, sample, spec }) {
  return (
    <div style={{
      background: '#0d0d12',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 6,
      padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
      minHeight: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: '"Inter"',
          fontSize: 13, fontWeight: 600,
          color: '#fafafa',
        }}>{family}</span>
        <span style={{
          fontFamily: '"JetBrains Mono"',
          fontSize: 11, color: 'rgba(140,140,150,0.7)',
          letterSpacing: '0.04em',
        }}>{spec}</span>
      </div>
      <span style={{
        fontFamily: '"JetBrains Mono"',
        fontSize: 11, fontWeight: 500,
        color: 'rgba(180,180,190,0.85)',
        letterSpacing: '0.10em',
      }}>{role.toUpperCase()}</span>
      <div style={{
        background: '#08080b',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 4,
        padding: '16px 14px',
        minHeight: 78,
        display: 'flex', alignItems: 'center',
      }}>{sample}</div>
      <span style={{
        fontFamily: '"Inter"',
        fontSize: 11, fontWeight: 400,
        color: 'rgba(150,150,160,0.75)',
        lineHeight: 1.4,
      }}>{where}</span>
    </div>
  );
}

// ─── Top-level: design canvas with 5 artboards ───────────────────────
function App() {
  const variants = [
    { id: 'pure-square',       name: 'Pure Square',       code: 'P1', mantra: 'Bordered chip. Icon dominates. Nothing else competes.',         workflow: 'Lead Enrichment Pipeline' },
    { id: 'capped-header',     name: 'Capped Header',     code: 'P2', mantra: '5px color bar caps the top. Card body stays dark and quiet.',   workflow: 'Daily Brief Generator' },
    { id: 'tinted-body',       name: 'Tinted Body',       code: 'P3', mantra: 'Category color washes down the whole face — strongest read.',   workflow: 'Inbound Support Triage' },
    { id: 'engineering-slug',  name: 'Engineering Slug',  code: 'P4', mantra: 'Mono type-slug at top. Most industrial; no human-readable name.', workflow: 'Memory Consolidation' },
  ];

  return (
    <DesignCanvas>
      <DCSection
        id="type-system"
        title="Otto · Typographic System"
        subtitle="Inter + Geist Mono + JetBrains Mono + Fraunces — restricted by role."
      >
        <DCArtboard
          id="typography"
          label="T0 · Type system"
          width={1080}
          height={620}
          style={{ background: '#0a0a0c' }}
        >
          <TypographyBoard />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="node-cards"
        title="Otto · Node Card Variants (icon-dominant)"
        subtitle="4 directions × 17 nodes — simple 72×72, complex 100×variable with labeled handles."
      >
        {variants.map((v) => (
          <DCArtboard
            key={v.id}
            id={v.id}
            label={`${v.code} · ${v.name}`}
            width={1240}
            height={760}
            style={{ background: '#0a0a0c' }}
          >
            <VariantBoard
              name={v.name}
              code={v.code}
              mantra={v.mantra}
              variant={v.id}
              workflow={v.workflow}
            />
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
