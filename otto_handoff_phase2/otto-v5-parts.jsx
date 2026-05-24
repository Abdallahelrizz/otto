// otto-v5-parts.jsx — all components, theme-aware (accept `t` = theme tokens).
//
// Tightened from v4: smaller radii, less padding, cleaner type hierarchy.
// Brand color is amber, used sparingly (MAIN tag, primary buttons, brand
// mark, hero rings, otto bot accent). Everything else is grayscale or
// semantic (live green, error red).

/* eslint-disable react/jsx-key */

const {
  AMBER, AMBER_HOVER, THEMES,
  SERVICE, NEUTRAL_GRAY_DARK, NEUTRAL_GRAY_LIGHT,
  Icon, hexA,
  NAV,
  TRIGGER_NODE, AI_AGENT_NODE, ACTION_NODES,
  RUN_TIMELINE, AGENT_OUTPUT,
} = window;

// ─── Visual resolver — maps node.visual → concrete styling ────────────
// shape: 'rounded' | 'circle' | 'square'
// tint:  'amber'   | 'service' (uses visual.color)  | 'neutral'
function resolveVisual(visual, t) {
  const v = visual || { shape: 'square', tint: 'neutral' };

  const radius = v.shape === 'circle'  ? '50%'
               : v.shape === 'rounded' ? 7
               :                          3;

  let color;
  if (v.tint === 'amber')        color = t.brand;
  else if (v.tint === 'service') color = v.color || (t.name === 'Dark' ? NEUTRAL_GRAY_DARK : NEUTRAL_GRAY_LIGHT);
  else                           color = t.name === 'Dark' ? NEUTRAL_GRAY_DARK : NEUTRAL_GRAY_LIGHT;

  return { radius, color };
}

// ═══════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════

function Tag({ children, color, t }) {
  return (
    <span style={{
      fontFamily: '"JetBrains Mono"',
      fontSize: 9.5, fontWeight: 700,
      letterSpacing: '0.10em',
      color: color,
      background: hexA(color, t.name === 'Dark' ? 0.12 : 0.10),
      border: `1px solid ${hexA(color, t.name === 'Dark' ? 0.22 : 0.18)}`,
      padding: '2px 6px',
      borderRadius: 3,
      whiteSpace: 'nowrap',
      lineHeight: 1.1,
      textTransform: 'uppercase',
    }}>{children}</span>
  );
}

function Dot({ side, color, bgColor }) {
  const pos = side === 'left'  ? { left:  -5 } :
              side === 'right' ? { right: -5 } : {};
  return (
    <span style={{
      position: 'absolute',
      top: '50%', transform: 'translateY(-50%)',
      width: 8, height: 8, borderRadius: '50%',
      background: color,
      boxShadow: `0 0 0 2px ${bgColor}`,
      ...pos,
    }} />
  );
}

// ═══════════════════════════════════════════════════════════════════
// NODES
// ═══════════════════════════════════════════════════════════════════

const SMALL_W = 196;
const SMALL_H = 58;

function SmallNode({ node, side = 'right', t }) {
  const v = resolveVisual(node.visual, t);
  const tagColor = node.tag === 'TRIGGER' ? t.brand : t.textSecond;
  return (
    <div style={{
      position: 'relative',
      width: SMALL_W,
      height: SMALL_H,
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: 6,
      boxShadow: t.shadow,
      padding: '9px 12px',
      boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', gap: 10,
      transition: 'all 130ms ease-out',
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: v.radius,
        background: hexA(v.color, t.name === 'Dark' ? 0.14 : 0.11),
        border: `1px solid ${hexA(v.color, t.name === 'Dark' ? 0.22 : 0.18)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name={node.icon} size={14} color={v.color} strokeWidth={2} />
      </span>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600,
          color: t.textPrimary,
          letterSpacing: '-0.012em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{node.label}</div>
        <div style={{
          fontFamily: '"JetBrains Mono"', fontSize: 10.5, fontWeight: 400,
          color: t.textMuted,
          letterSpacing: '0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{node.sub}</div>
      </div>

      <div style={{ position: 'absolute', top: 7, right: 10 }}>
        <Tag color={tagColor} t={t}>{node.tag}</Tag>
      </div>

      {side === 'right' && <Dot side="left"  color={t.textMuted} bgColor={t.bgCanvas} />}
      {side === 'left'  && <Dot side="right" color={t.textMuted} bgColor={t.bgCanvas} />}
      {side === 'both'  && (<><Dot side="left" color={t.textMuted} bgColor={t.bgCanvas} /><Dot side="right" color={t.textMuted} bgColor={t.bgCanvas} /></>)}
    </div>
  );
}

// ─── BIG AI AGENT NODE ───────────────────────────────────────────────
const BIG_W = 336;

function BigAgentNode({ node, t, selected = true }) {
  const headerV = resolveVisual(node.visual, t);
  return (
    <div style={{
      position: 'relative',
      width: BIG_W,
      background: t.bgCard,
      border: `1.5px solid ${selected ? t.brand : t.borderStrong}`,
      borderRadius: 8,
      boxShadow: selected
        ? `0 0 0 3px ${t.brandRing}, ${t.shadowMain}`
        : t.shadowMain,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <span style={{
          width: 34, height: 34, borderRadius: headerV.radius,
          background: hexA(headerV.color, t.name === 'Dark' ? 0.14 : 0.10),
          border: `1px solid ${hexA(headerV.color, t.name === 'Dark' ? 0.30 : 0.22)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="sparkles" size={17} color={headerV.color} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              fontSize: 14.5, fontWeight: 700, color: t.textPrimary,
              letterSpacing: '-0.018em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{node.label}</span>
            <Tag color={t.brand} t={t}>MAIN</Tag>
          </div>
          <div style={{
            fontFamily: '"JetBrains Mono"', fontSize: 10.5,
            color: t.textSecond, fontWeight: 400,
            letterSpacing: '0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{node.sub}</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: t.border }} />

      {/* Tools list */}
      <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '2px 2px', marginBottom: 3,
        }}>
          <span style={{
            fontFamily: '"JetBrains Mono"', fontSize: 9.5, fontWeight: 600,
            color: t.textSecond, letterSpacing: '0.16em',
          }}>TOOLS</span>
          <span style={{
            fontFamily: '"JetBrains Mono"', fontSize: 9.5, fontWeight: 500,
            color: t.textMuted, letterSpacing: '0.04em',
          }}>{String(node.tools.length).padStart(2, '0')}</span>
        </div>

        {node.tools.map((tool) => {
          const tv = resolveVisual(tool.visual, t);
          return (
            <div key={tool.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 9px',
              background: t.bgCardLift,
              border: `1px solid ${t.border}`,
              borderRadius: 5,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: tv.radius,
                background: hexA(tv.color, t.name === 'Dark' ? 0.14 : 0.10),
                border: `1px solid ${hexA(tv.color, t.name === 'Dark' ? 0.26 : 0.18)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon name={tool.icon} size={12} color={tv.color} strokeWidth={2} />
              </span>
              <span style={{
                flex: 1,
                fontSize: 12, fontWeight: 600,
                color: t.textPrimary, letterSpacing: '-0.008em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{tool.name}</span>
              <span style={{
                fontFamily: '"JetBrains Mono"', fontSize: 10, fontWeight: 500,
                color: t.textMuted, letterSpacing: '0.02em',
              }}>{tool.type}</span>
            </div>
          );
        })}

        {/* Add tool — solid border, less playful */}
        <button style={{
          marginTop: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '7px 10px',
          background: 'transparent',
          border: `1px solid ${t.border}`,
          borderRadius: 5,
          color: t.textSecond,
          fontFamily: 'Inter', fontSize: 11.5, fontWeight: 500,
          cursor: 'pointer',
          letterSpacing: '-0.005em',
        }}>
          <Icon name="plus" size={12} color={t.textSecond} strokeWidth={2.5} />
          Add tool
        </button>
      </div>

      {/* Handles — 1 input on left, 3 outputs on right */}
      <Dot side="left" color={t.textMuted} bgColor={t.bgCanvas} />
      <span style={{
        position: 'absolute', top: 96, right: -5,
        width: 8, height: 8, borderRadius: '50%',
        background: t.textMuted,
        boxShadow: `0 0 0 2px ${t.bgCanvas}`,
      }} />
      <span style={{
        position: 'absolute', top: 216, right: -5,
        width: 8, height: 8, borderRadius: '50%',
        background: t.textMuted,
        boxShadow: `0 0 0 2px ${t.bgCanvas}`,
      }} />
      <span style={{
        position: 'absolute', top: 336, right: -5,
        width: 8, height: 8, borderRadius: '50%',
        background: t.textMuted,
        boxShadow: `0 0 0 2px ${t.bgCanvas}`,
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CANVAS
// ═══════════════════════════════════════════════════════════════════

function edgePath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.55, 70);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function Canvas({ t }) {
  const triggerOut = { x: TRIGGER_NODE.x + SMALL_W, y: TRIGGER_NODE.y + SMALL_H / 2 };
  const agentIn    = { x: AI_AGENT_NODE.x,          y: AI_AGENT_NODE.y + 96 };
  const agentOuts  = [96, 216, 336].map((dy) => ({
    x: AI_AGENT_NODE.x + BIG_W,
    y: AI_AGENT_NODE.y + dy,
  }));
  const actionIns  = ACTION_NODES.map((n) => ({ x: n.x, y: n.y + SMALL_H / 2 }));

  return (
    <div style={{
      position: 'relative',
      flex: 1,
      background: t.bgCanvas,
      backgroundImage: `radial-gradient(${t.grid} 1px, transparent 1px)`,
      backgroundSize: '18px 18px',
      overflow: 'hidden',
    }}>
      {/* Edge layer */}
      <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <path d={edgePath(triggerOut.x, triggerOut.y, agentIn.x, agentIn.y)}
              stroke={t.name === 'Dark' ? '#3f3a36' : '#c8c4be'} strokeWidth="1.4" fill="none" />
        {agentOuts.map((p, i) => (
          <path key={i}
            d={edgePath(p.x, p.y, actionIns[i].x, actionIns[i].y)}
            stroke={t.name === 'Dark' ? '#3f3a36' : '#c8c4be'} strokeWidth="1.4" fill="none" />
        ))}
      </svg>

      <div style={{ position: 'absolute', left: TRIGGER_NODE.x, top: TRIGGER_NODE.y }}>
        <SmallNode node={TRIGGER_NODE} side="right" t={t} />
      </div>
      <div style={{ position: 'absolute', left: AI_AGENT_NODE.x, top: AI_AGENT_NODE.y }}>
        <BigAgentNode node={AI_AGENT_NODE} t={t} selected />
      </div>
      {ACTION_NODES.map((n) => (
        <div key={n.id} style={{ position: 'absolute', left: n.x, top: n.y }}>
          <SmallNode node={n} side="left" t={t} />
        </div>
      ))}

      {/* Floating canvas tabs (Editor/Executions/Test) */}
      <CanvasTabs t={t} />

      {/* Zoom controls bottom-left */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        display: 'flex', flexDirection: 'column',
        background: t.bgPanel,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: t.shadow,
      }}>
        <ToolBtn icon="plus"        t={t} />
        <ToolBtn icon="minus"       t={t} />
        <ToolBtn icon="maximize-2"  t={t} />
      </div>
    </div>
  );
}

function ToolBtn({ icon, t }) {
  return (
    <button style={{
      width: 28, height: 28,
      background: 'transparent', border: 'none',
      borderTop: `1px solid ${t.border}`,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: t.textSecond,
    }}>
      <Icon name={icon} size={13} color={t.textSecond} strokeWidth={2} />
    </button>
  );
}

function CanvasTabs({ t }) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex',
      background: t.bgPanel,
      border: `1px solid ${t.border}`,
      borderRadius: 7,
      padding: 3,
      boxShadow: t.shadow,
    }}>
      {['Editor', 'Executions', 'Test'].map((label, i) => {
        const active = i === 0;
        return (
          <span key={label} style={{
            padding: '5px 13px',
            fontSize: 12, fontWeight: active ? 600 : 500,
            color: active ? t.textPrimary : t.textSecond,
            background: active ? (t.name === 'Dark' ? t.bgCardLift : '#F4F3F0') : 'transparent',
            borderRadius: 4,
            letterSpacing: '-0.005em',
            cursor: 'pointer',
          }}>{label}</span>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR + TOPBAR
// ═══════════════════════════════════════════════════════════════════

function Sidebar({ t }) {
  return (
    <div style={{
      width: 216,
      background: t.bgSidebar,
      borderRight: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Brand mark */}
      <div style={{
        height: 54,
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '0 16px',
        borderBottom: `1px solid ${t.border}`,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 5,
          background: t.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="zap" size={13} color="#fff" strokeWidth={2.6} />
        </span>
        <span style={{
          fontSize: 16, fontWeight: 700, color: t.textPrimary,
          letterSpacing: '-0.022em',
        }}>otto</span>
      </div>

      {/* Nav */}
      <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map((item) => (
          <NavRow key={item.id} item={item} t={t} />
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div style={{
        padding: '10px 8px 12px',
        display: 'flex', flexDirection: 'column', gap: 9,
        borderTop: `1px solid ${t.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 6px' }}>
          <span style={{
            width: 26, height: 26, borderRadius: 13,
            background: `linear-gradient(135deg, ${AMBER}, ${AMBER_HOVER})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Inter', fontSize: 10.5, fontWeight: 700, color: '#fff',
            letterSpacing: '-0.01em',
          }}>AE</span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: 12, fontWeight: 600, color: t.textPrimary,
              letterSpacing: '-0.008em',
            }}>Abdallah Elrizz</span>
            <span style={{
              fontFamily: '"JetBrains Mono"', fontSize: 10, fontWeight: 500,
              color: t.textMuted, letterSpacing: '0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>Pro · 38%</span>
          </div>
        </div>

        <button style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%', padding: '8px 12px',
          background: t.brand, border: 'none',
          color: t.btnFg, fontFamily: 'Inter', fontSize: 12.5, fontWeight: 600,
          letterSpacing: '-0.005em',
          borderRadius: 5,
          cursor: 'pointer',
        }}>
          <Icon name="plus" size={13} color={t.btnFg} strokeWidth={2.6} />
          New workflow
        </button>
      </div>
    </div>
  );
}

function NavRow({ item, t }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 10px',
      borderRadius: 5,
      background: item.active ? (t.name === 'Dark' ? t.bgCardLift : '#EAE7E2') : 'transparent',
      cursor: 'pointer',
    }}>
      <Icon name={item.icon} size={14} color={item.active ? t.textPrimary : t.textSecond} strokeWidth={1.9} />
      <span style={{
        flex: 1, fontSize: 12.5, fontWeight: item.active ? 600 : 500,
        color: item.active ? t.textPrimary : t.textSecond,
        letterSpacing: '-0.008em',
      }}>{item.label}</span>
      {item.badge != null && (
        <span style={{
          fontFamily: '"JetBrains Mono"', fontSize: 9.5, fontWeight: 600,
          color: t.textMuted, letterSpacing: '0.02em',
          padding: '1px 6px',
          background: t.name === 'Dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,15,10,0.04)',
          borderRadius: 8,
        }}>{item.badge}</span>
      )}
    </div>
  );
}

function Topbar({ t }) {
  return (
    <div style={{
      height: 54,
      background: t.bgPanel,
      borderBottom: `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '0 16px',
      flexShrink: 0,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <Icon name="git-fork" size={13} color={t.textSecond} strokeWidth={2} />
        <span style={{ fontSize: 12.5, color: t.textSecond, letterSpacing: '-0.005em', fontWeight: 500 }}>Workflows</span>
        <span style={{ color: t.textMuted, fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12.5, color: t.textSecond, letterSpacing: '-0.005em', fontWeight: 500 }}>Pipelines</span>
        <span style={{ color: t.textMuted, fontSize: 12 }}>/</span>
        <span style={{
          fontSize: 13, fontWeight: 600, color: t.textPrimary,
          letterSpacing: '-0.012em',
        }}>Lead Enrichment</span>

        <span style={{
          fontFamily: '"JetBrains Mono"', fontSize: 9.5,
          color: t.textMuted, letterSpacing: '0.06em', fontWeight: 600,
          marginLeft: 8,
          padding: '2px 6px',
          border: `1px solid ${t.border}`,
          borderRadius: 3,
        }}>v3.2.1</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Active toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 32, height: 18,
          background: t.live, borderRadius: 10,
          position: 'relative', display: 'inline-block',
        }}>
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff',
          }} />
        </span>
        <span style={{
          fontSize: 12.5, fontWeight: 500, color: t.textPrimary,
          letterSpacing: '-0.005em',
        }}>Active</span>
      </div>

      <button style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 11px',
        background: 'transparent',
        border: `1px solid ${t.border}`,
        color: t.textPrimary,
        fontFamily: 'Inter', fontSize: 12, fontWeight: 500,
        borderRadius: 5, cursor: 'pointer',
        letterSpacing: '-0.005em',
      }}>
        <Icon name="share-2" size={13} color={t.textPrimary} strokeWidth={2} />
        Share
      </button>
      <button style={{
        padding: '7px 14px',
        background: t.brand, border: 'none',
        color: t.btnFg,
        fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
        borderRadius: 5, cursor: 'pointer',
        letterSpacing: '-0.005em',
      }}>Save</button>
      <button style={{
        width: 28, height: 28,
        background: 'transparent', border: `1px solid ${t.border}`,
        color: t.textSecond,
        borderRadius: 5, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="more-horizontal" size={14} color={t.textSecond} strokeWidth={2} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INSPECTOR
// ═══════════════════════════════════════════════════════════════════

function Inspector({ t }) {
  return (
    <div style={{
      width: 318,
      background: t.bgPanel,
      borderLeft: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        height: 54,
        padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 9,
        borderBottom: `1px solid ${t.border}`,
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 13.5, fontWeight: 700, color: t.textPrimary,
          letterSpacing: '-0.012em',
        }}>Properties</span>
        <span style={{
          fontFamily: '"JetBrains Mono"', fontSize: 9.5, fontWeight: 600,
          color: t.textMuted, letterSpacing: '0.04em',
          padding: '2px 6px',
          background: t.name === 'Dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,15,10,0.04)',
          border: `1px solid ${t.border}`,
          borderRadius: 3,
        }}>agent_923</span>
        <div style={{ flex: 1 }} />
        <button style={{
          width: 24, height: 24, borderRadius: 4,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: t.textSecond,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="x" size={14} color={t.textSecond} strokeWidth={2} />
        </button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
        <Field label="Node name" t={t}>
          <Input value="Lead enrichment agent" t={t} />
        </Field>

        <Field label="Description" t={t}>
          <Textarea value="Autonomous agent that enriches incoming lead payloads via tool calls. Routes results to CRM, ops Slack, and long-term memory." rows={3} t={t} />
        </Field>

        <Field label="Chat model" t={t}>
          <Select value="gpt-4o · OpenAI" t={t} />
        </Field>

        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="Max iter" flex t={t}>
            <Input value="10" mono t={t} />
          </Field>
          <Field label="Memory" flex t={t}>
            <Input value="50k tokens" mono t={t} />
          </Field>
        </div>

        <Field label="System prompt" t={t}>
          <Textarea value="You are a lead-enrichment agent. Given an incoming lead, use the available tools to gather context, score quality, then route to the appropriate downstream action." rows={4} t={t} />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children, flex, t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: flex ? 1 : 'initial', minWidth: 0 }}>
      <label style={{
        fontFamily: '"JetBrains Mono"', fontSize: 9.5, fontWeight: 600,
        color: t.textSecond, letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, mono, t }) {
  return (
    <div style={{
      padding: '7px 10px',
      background: t.inputBg,
      border: `1px solid ${t.border}`,
      borderRadius: 4,
      fontFamily: mono ? '"JetBrains Mono"' : 'Inter',
      fontSize: 12, fontWeight: 500,
      color: t.textPrimary,
      letterSpacing: '-0.005em',
    }}>{value}</div>
  );
}

function Textarea({ value, rows = 3, t }) {
  return (
    <div style={{
      padding: '8px 10px',
      background: t.inputBg,
      border: `1px solid ${t.border}`,
      borderRadius: 4,
      fontSize: 12, fontWeight: 400,
      color: t.textPrimary, lineHeight: 1.5,
      letterSpacing: '-0.003em',
      minHeight: rows * 18,
    }}>{value}</div>
  );
}

function Select({ value, t }) {
  return (
    <div style={{
      padding: '7px 10px',
      background: t.inputBg,
      border: `1px solid ${t.border}`,
      borderRadius: 4,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 12, color: t.textPrimary,
      letterSpacing: '-0.005em', fontWeight: 500,
    }}>
      <span>{value}</span>
      <Icon name="chevron-down" size={12} color={t.textSecond} strokeWidth={2} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BOTTOM PANELS — otto bot + Live execution
// ═══════════════════════════════════════════════════════════════════

function BottomPanels({ t }) {
  return (
    <div style={{
      display: 'flex', height: 248,
      borderTop: `1px solid ${t.border}`,
      flexShrink: 0,
    }}>
      <OttoBotPanel t={t} />
      <ExecutionPanel t={t} />
    </div>
  );
}

function OttoBotPanel({ t }) {
  return (
    <div style={{
      flex: 1,
      background: t.bgPanel,
      display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${t.border}`,
    }}>
      <div style={{
        height: 36,
        padding: '0 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${t.border}`,
        flexShrink: 0,
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: 4,
          background: t.brandSoft,
          border: `1px solid ${t.brandRing}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="zap" size={10} color={t.brand} strokeWidth={2.6} />
        </span>
        <span style={{
          fontSize: 12.5, fontWeight: 600, color: t.textPrimary,
          letterSpacing: '-0.008em',
        }}>otto bot</span>
        <span style={{
          fontFamily: '"JetBrains Mono"', fontSize: 9.5,
          color: t.textMuted, letterSpacing: '0.04em', fontWeight: 500,
        }}>workflow assistant</span>
        <div style={{ flex: 1 }} />
        <Icon name="chevron-down" size={13} color={t.textSecond} strokeWidth={2} />
      </div>

      <div style={{
        flex: 1, padding: '12px 14px',
        overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 5,
            background: t.brandSoft, border: `1px solid ${t.brandRing}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon name="zap" size={11} color={t.brand} strokeWidth={2.6} />
          </span>
          <div style={{
            flex: 1,
            fontSize: 12.5, color: t.textPrimary, lineHeight: 1.55,
            letterSpacing: '-0.003em',
          }}>
            Your agent runs <strong style={{ color: t.textPrimary, fontWeight: 600 }}>CRM lookup</strong> and <strong style={{ color: t.textPrimary, fontWeight: 600 }}>Chat history</strong> sequentially. They have no shared deps — running them in parallel cuts agent latency by <strong style={{ color: t.brand, fontWeight: 700 }}>~2.3×</strong>.
            <div style={{ marginTop: 9, display: 'flex', gap: 6 }}>
              <button style={{
                padding: '5px 11px',
                background: t.brand, color: t.btnFg, border: 'none',
                fontSize: 11.5, fontWeight: 600, fontFamily: 'Inter',
                borderRadius: 4, cursor: 'pointer', letterSpacing: '-0.005em',
              }}>Refactor for me</button>
              <button style={{
                padding: '5px 11px',
                background: 'transparent', color: t.textSecond,
                border: `1px solid ${t.border}`,
                fontSize: 11.5, fontWeight: 500, fontFamily: 'Inter',
                borderRadius: 4, cursor: 'pointer', letterSpacing: '-0.005em',
              }}>Show where</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        padding: 10,
        borderTop: `1px solid ${t.border}`,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px',
          background: t.inputBg,
          border: `1px solid ${t.border}`,
          borderRadius: 5,
        }}>
          <span style={{
            fontSize: 12.5, color: t.textMuted,
            flex: 1, letterSpacing: '-0.005em', fontWeight: 400,
          }}>Ask otto bot to improve this workflow…</span>
          <Icon name="send-horizontal" size={13} color={t.brand} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

function ExecutionPanel({ t }) {
  return (
    <div style={{
      flex: 1,
      background: t.bgPanel,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        height: 36,
        padding: '0 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${t.border}`,
        flexShrink: 0,
      }}>
        <Icon name="activity" size={13} color={t.live} strokeWidth={2.2} />
        <span style={{
          fontSize: 12.5, fontWeight: 600, color: t.textPrimary,
          letterSpacing: '-0.008em',
        }}>Live execution</span>
        <span style={{
          fontFamily: '"JetBrains Mono"', fontSize: 9.5,
          color: t.live, letterSpacing: '0.06em', fontWeight: 700,
          padding: '2px 7px',
          background: t.liveSoft,
          border: `1px solid ${hexA(t.live, t.name === 'Dark' ? 0.30 : 0.22)}`,
          borderRadius: 3,
          textTransform: 'uppercase',
        }}>· running</span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: '"JetBrains Mono"', fontSize: 9.5,
          color: t.textMuted, letterSpacing: '0.04em', fontWeight: 500,
        }}>exec_8f3a · 2s ago</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Timeline */}
        <div style={{
          width: 188, borderRight: `1px solid ${t.border}`,
          padding: '11px 10px', display: 'flex', flexDirection: 'column', gap: 4,
          overflow: 'auto', flexShrink: 0,
        }}>
          {RUN_TIMELINE.map((step) => <TimelineRow key={step.id} step={step} t={t} />)}
        </div>

        {/* JSON output */}
        <div style={{
          flex: 1, padding: '12px 14px',
          background: t.name === 'Dark' ? t.bgCanvas : t.bgSidebar,
          overflow: 'auto', minWidth: 0,
        }}>
          <div style={{
            fontFamily: '"JetBrains Mono"', fontSize: 9.5, fontWeight: 600,
            color: t.textMuted, letterSpacing: '0.10em',
            marginBottom: 8, textTransform: 'uppercase',
          }}>Output · agent.tool_call</div>
          <pre style={{
            margin: 0,
            fontFamily: '"JetBrains Mono"', fontSize: 11.5, fontWeight: 400,
            color: t.textPrimary, lineHeight: 1.55,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            <SyntaxJson text={AGENT_OUTPUT} t={t} />
          </pre>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ step, t }) {
  const c = step.status === 'success' ? t.ok
          : step.status === 'running' ? t.live
          : step.status === 'error'   ? t.err
          : t.textMuted;

  const isRunning = step.status === 'running';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '6px 8px',
      background: isRunning ? t.liveSoft : 'transparent',
      border: isRunning ? `1px solid ${hexA(t.live, 0.22)}` : `1px solid transparent`,
      borderRadius: 4,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: c,
        animation: isRunning ? 'otto-pulse 1.4s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        fontSize: 11.5, fontWeight: 500,
        color: step.status === 'pending' ? t.textMuted : t.textPrimary,
        letterSpacing: '-0.005em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{step.label}</span>
      {step.dur && (
        <span style={{
          fontFamily: '"JetBrains Mono"', fontSize: 9.5, fontWeight: 500,
          color: t.textMuted, letterSpacing: '0.02em',
        }}>{step.dur}</span>
      )}
    </div>
  );
}

function SyntaxJson({ text, t }) {
  const keyC    = t.name === 'Dark' ? '#FFB870' : '#B85A12';
  const strC    = t.name === 'Dark' ? '#86EFAC' : '#15803D';
  const numC    = t.name === 'Dark' ? '#7DD3FC' : '#0369A1';
  const boolC   = t.name === 'Dark' ? '#FBBF24' : '#A16207';

  const parts = text.split(/("[^"]*"\s*:|"[^"]*"|true|false|null|-?\d+\.?\d*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (/^"[^"]*"\s*:$/.test(p))      return <span key={i} style={{ color: keyC }}>{p}</span>;
        if (/^"[^"]*"$/.test(p))          return <span key={i} style={{ color: strC }}>{p}</span>;
        if (p === 'true' || p === 'false')return <span key={i} style={{ color: boolC }}>{p}</span>;
        if (p === 'null')                 return <span key={i} style={{ color: t.textMuted }}>{p}</span>;
        if (/^-?\d+\.?\d*$/.test(p))      return <span key={i} style={{ color: numC }}>{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

Object.assign(window, {
  Sidebar, Topbar, Canvas, Inspector, BottomPanels,
});
