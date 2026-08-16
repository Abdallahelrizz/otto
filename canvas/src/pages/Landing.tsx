import { useNavigate } from 'react-router-dom';

const C = {
  bg: '#07070a',
  bgCard: '#0e0e12',
  bgCardHover: '#111116',
  border: 'rgba(255,255,255,0.07)',
  borderBright: 'rgba(255,255,255,0.12)',
  text: '#f4f4f5',
  textSub: '#a1a1aa',
  textMuted: '#52525b',
  accent: '#a13c3f',
  accentSoft: 'rgba(161,60,63,0.13)',
  accentBright: '#c44a4e',
  success: '#22c55e',
  successSoft: 'rgba(34,197,94,0.12)',
  warning: '#f59e0b',
  warningSoft: 'rgba(245,158,11,0.12)',
  error: '#ef4444',
  errorSoft: 'rgba(239,68,68,0.12)',
};

function Nav({ onOpen }: { onOpen: () => void }) {
  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      padding: '0 32px',
      borderBottom: `1px solid ${C.border}`,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      background: 'rgba(7,7,10,0.72)',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1 }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: C.accent,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 14,
          color: '#fff',
          letterSpacing: '-0.02em',
          flexShrink: 0,
        }}>
          O
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.025em' }}>Otto</span>
      </div>

      {/* Links */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {['Product', 'Docs', 'Pricing', 'GitHub'].map(link => (
          <a
            key={link}
            href="#"
            onClick={e => e.preventDefault()}
            style={{
              padding: '6px 12px',
              fontSize: 13.5,
              color: C.textSub,
              textDecoration: 'none',
              borderRadius: 6,
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textSub)}
          >
            {link}
          </a>
        ))}
      </div>

      {/* CTA */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onOpen}
          style={{
            height: 34,
            padding: '0 16px',
            borderRadius: 7,
            border: 'none',
            background: C.text,
            color: C.bg,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Open App →
        </button>
      </div>
    </nav>
  );
}

function DashboardMockup() {
  const workflows = [
    { name: 'db-backup-nightly', status: 'SUCCESS', trigger: 'Cron: 00 02 * * *', last: '2h ago' },
    { name: 'cache-invalidation-service', status: 'RUNNING', trigger: 'Webhook (GitHub)', last: 'Active now' },
    { name: 'aws-lambda-optimizer', status: 'FAILED', trigger: 'Manual', last: '13h ago' },
  ];

  const statusColor = (s: string) =>
    s === 'SUCCESS' ? C.success : s === 'RUNNING' ? C.warning : C.error;
  const statusBg = (s: string) =>
    s === 'SUCCESS' ? C.successSoft : s === 'RUNNING' ? C.warningSoft : C.errorSoft;

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.borderBright}`,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: `0 0 0 1px ${C.border}, 0 32px 80px rgba(0,0,0,0.6), 0 0 120px rgba(161,60,63,0.08)`,
      maxWidth: 860,
      width: '100%',
    }}>
      {/* Window chrome */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: '#09090d',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        <span style={{ marginLeft: 12, fontSize: 11, color: C.textMuted, fontFamily: 'Geist Mono, monospace' }}>otto-prod / Dashboard</span>
        <div style={{ flex: 1 }} />
        <div style={{
          height: 22,
          padding: '0 10px',
          borderRadius: 5,
          background: C.warning,
          color: '#000',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
        }}>
          DEPLOY
        </div>
      </div>

      {/* App body */}
      <div style={{ display: 'flex', height: 380 }}>
        {/* Sidebar */}
        <div style={{
          width: 168,
          borderRight: `1px solid ${C.border}`,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          background: '#0b0b0f',
          flexShrink: 0,
        }}>
          {/* Brand */}
          <div style={{ padding: '4px 8px 12px', borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>Otto Platform</div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>Production Environment</div>
          </div>

          {/* New workflow button */}
          <div style={{
            height: 28,
            borderRadius: 5,
            border: `1px solid ${C.borderBright}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            color: C.text,
            marginBottom: 8,
            cursor: 'default',
          }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New Workflow
          </div>

          {/* Nav items */}
          {[
            { icon: '⬡', label: 'Workflows', active: false },
            { icon: '◎', label: 'Executions', active: false },
            { icon: '⬡', label: 'Credentials', active: false },
            { icon: '◇', label: 'API Keys', active: false },
            { icon: '◈', label: 'Observability', active: false },
          ].map(({ icon, label, active }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 8px',
                height: 30,
                borderRadius: 5,
                background: active ? C.accentSoft : 'transparent',
                cursor: 'default',
              }}
            >
              <span style={{ fontSize: 11, color: active ? C.accentBright : C.textMuted }}>{icon}</span>
              <span style={{ fontSize: 12, color: active ? C.text : C.textSub, fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
          ))}

          <div style={{ flex: 1 }} />
          <div style={{ padding: '8px 8px 0', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.textMuted }}>Settings</div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '14px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Active Workflows', value: '42', sub: '+3 this week', icon: '↗' },
              { label: 'Executions (24h)', value: '1.2k', sub: '99.1% success', icon: '⚡' },
              { label: 'System Latency', value: '14ms', sub: 'avg. p95', icon: '↔' },
              { label: 'Active Issues', value: '03', sub: '2 critical', icon: '△', warn: true },
            ].map(({ label, value, sub, icon, warn }) => (
              <div key={label} style={{
                background: '#0b0b0f',
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                  <span style={{ fontSize: 11, color: warn ? C.warning : C.textMuted }}>{icon}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: warn ? C.warning : C.text, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Recent workflows table */}
          <div style={{
            background: '#0b0b0f',
            border: `1px solid ${C.border}`,
            borderRadius: 7,
            overflow: 'hidden',
            flex: 1,
          }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Recent Workflows</span>
              <span style={{ fontSize: 11, color: C.accent }}>View All</span>
            </div>
            <div>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr 80px 28px', gap: 8, padding: '7px 14px', borderBottom: `1px solid ${C.border}` }}>
                {['Name', 'Status', 'Trigger', 'Last Run', ''].map(h => (
                  <span key={h} style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                ))}
              </div>
              {workflows.map((wf) => (
                <div key={wf.name} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 1fr 80px 28px',
                  gap: 8,
                  padding: '9px 14px',
                  borderBottom: `1px solid ${C.border}`,
                  alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(wf.status), flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: C.text, fontFamily: 'Geist Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</span>
                  </div>
                  <div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: statusBg(wf.status),
                      color: statusColor(wf.status),
                      letterSpacing: '0.02em',
                    }}>{wf.status}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.trigger}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{wf.last}</span>
                  <span style={{ fontSize: 13, color: C.textMuted, cursor: 'default' }}>▷</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureSection({
  tag,
  title,
  body,
  isLast,
  visual,
}: {
  tag: string;
  title: string;
  body: string;
  isLast?: boolean;
  visual: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 64, alignItems: 'flex-start', padding: '72px 0', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
      {/* Left: copy + timeline dot */}
      <div style={{ flex: '0 0 340px', position: 'relative', paddingLeft: 28 }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 6,
          width: 10,
          height: 10,
          borderRadius: '50%',
          border: `2px solid ${C.accent}`,
          background: C.bg,
          zIndex: 2,
        }} />
        {!isLast && (
          <div style={{
            position: 'absolute',
            left: 4,
            top: 16,
            bottom: -72,
            width: 1,
            background: `linear-gradient(to bottom, ${C.border}, transparent)`,
          }} />
        )}
        <div style={{
          display: 'inline-block',
          fontSize: 11,
          fontWeight: 600,
          color: C.accent,
          background: C.accentSoft,
          border: `1px solid rgba(161,60,63,0.2)`,
          borderRadius: 20,
          padding: '3px 10px',
          letterSpacing: '0.02em',
          marginBottom: 16,
        }}>{tag}</div>
        <h3 style={{ fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: '-0.03em', lineHeight: 1.2, margin: '0 0 12px' }}>{title}</h3>
        <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{body}</p>
        <a
          href="#"
          onClick={e => e.preventDefault()}
          style={{ display: 'inline-block', marginTop: 20, fontSize: 13.5, color: C.text, textDecoration: 'none', borderBottom: `1px solid ${C.border}` }}
        >
          Learn more →
        </a>
      </div>

      {/* Right: visual */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {visual}
      </div>
    </div>
  );
}

function TerminalVisual() {
  const lines = [
    { time: '14:22:01.034', type: '[SYSTEM]', msg: 'Polling queue for pending tasks...', color: C.textMuted },
    { time: '14:22:05.112', type: '[SYSTEM]', msg: 'Queue empty. Sleeping for 1000ms.', color: C.textMuted },
    { time: '14:22:08.452', type: '[EXECUTION]', msg: 'Triggering job: cache-invalidation-service (ID: job_4829)', color: '#93c5fd' },
    { time: '14:22:08.501', type: '[INFO]', msg: 'Fetching GitHub metadata... SUCCESS', color: C.success },
    { time: '14:22:09.118', type: '[EXECUTION]', msg: 'Building container environment... [55%]', color: '#93c5fd' },
  ];

  return (
    <div style={{
      background: '#09090d',
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      fontFamily: 'Geist Mono, monospace',
    }}>
      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>otto-main-cluster.logs</span>
        <span style={{ fontSize: 10, color: C.success, fontWeight: 600 }}>● CONNECTED</span>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ color: C.textMuted, flexShrink: 0 }}>{l.time}</span>
            <span style={{ color: l.color, fontWeight: 600, flexShrink: 0 }}>{l.type}</span>
            <span style={{ color: C.textSub }}>{l.msg}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 12, color: C.accentBright }}>→</span>
          <span style={{ width: 8, height: 14, background: C.textSub, animation: 'none' }} />
        </div>
      </div>
    </div>
  );
}

function ParallelVisual() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* n8n */}
      <div style={{ background: '#09090d', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: C.textSub }}>Serial — one node at a time</span>
          <span style={{ fontSize: 11, color: C.error, fontWeight: 600 }}>sum of every node</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['Trigger', 'Embed', 'Retrieval', 'LLM (sub)', 'IF gate', 'LLM (main)', 'Merge', 'Output'].map(n => (
            <div key={n} style={{ flex: 1, height: 24, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 8, color: C.error, fontFamily: 'Geist Mono, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 3px' }}>{n}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, height: 3, background: 'rgba(239,68,68,0.15)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', background: C.error, borderRadius: 2 }} />
        </div>
      </div>

      {/* Otto */}
      <div style={{ background: '#09090d', border: `1px solid rgba(34,197,94,0.15)`, borderRadius: 8, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: C.textSub }}>Otto — independent branches together</span>
          <span style={{ fontSize: 11, color: C.success, fontWeight: 600 }}>longest path only</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ flex: '0 0 auto', width: 48, height: 48, background: C.accentSoft, border: `1px solid ${C.border}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 8, color: C.text, textAlign: 'center', lineHeight: 1.2 }}>Trigger</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {['Embed', 'Retrieval'].map(n => (
                <div key={n} style={{ flex: 1, background: C.successSoft, border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20 }}>
                  <span style={{ fontSize: 8, color: C.success }}>{n}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {['LLM sub', 'IF gate', 'LLM main'].map(n => (
                <div key={n} style={{ flex: 1, background: C.successSoft, border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20 }}>
                  <span style={{ fontSize: 8, color: C.success }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '0 0 auto', width: 52, height: 48, background: C.successSoft, border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 8, color: C.success, textAlign: 'center', lineHeight: 1.2 }}>Merge + Output</span>
          </div>
        </div>
        {/* Width = the critical path as a share of total node time. Keep this honest:
            parallelism can only remove the time of branches that overlap, so the bar must
            never imply a speedup larger than the graph's own longest path allows. */}
        <div style={{ marginTop: 6, height: 3, background: 'rgba(34,197,94,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: '81%', height: '100%', background: C.success, borderRadius: 2 }} />
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: C.textMuted }}>
        Independent branches run at once — you wait for the longest path, not the sum
      </div>
    </div>
  );
}

function OttoBotVisual() {
  const msgs = [
    { role: 'user', text: 'How can I speed up my data pipeline?' },
    { role: 'bot', text: 'I see nodes C and D are sequential but have no data dependency. Running them with Promise.all() would cut ~340ms from your avg execution time.' },
    { role: 'bot', text: 'You also tend to use OpenAI for summarization tasks — based on your last 12 workflows, Claude Haiku is 4× cheaper with similar output quality for that use case.' },
  ];

  return (
    <div style={{ background: '#09090d', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.success }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>OttoBot</span>
        <span style={{ fontSize: 10, color: C.textMuted }}>— reads your workflow</span>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: m.role === 'user' ? C.accentSoft : C.successSoft,
              border: `1px solid ${m.role === 'user' ? 'rgba(161,60,63,0.2)' : 'rgba(34,197,94,0.2)'}`,
              display: 'grid',
              placeItems: 'center',
              fontSize: 10,
              color: m.role === 'user' ? C.accentBright : C.success,
              flexShrink: 0,
            }}>
              {m.role === 'user' ? 'U' : 'O'}
            </div>
            <div style={{
              background: m.role === 'user' ? C.accentSoft : '#111116',
              border: `1px solid ${m.role === 'user' ? 'rgba(161,60,63,0.15)' : C.border}`,
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: C.text,
              lineHeight: 1.55,
              maxWidth: '85%',
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{
      background: C.bg,
      color: C.text,
      minHeight: '100vh',
      fontFamily: 'Geist, system-ui, -apple-system, sans-serif',
      overflowX: 'hidden',
    }}>
      <Nav onOpen={() => navigate('/app')} />

      {/* Hero */}
      <section style={{
        position: 'relative',
        paddingTop: 140,
        paddingBottom: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        {/* Dot grid */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 40%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Glow */}
        <div style={{
          position: 'absolute',
          bottom: -60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '70%',
          height: 400,
          background: 'radial-gradient(ellipse at center, rgba(161,60,63,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 900, padding: '0 32px' }}>
          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: C.textSub,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: '5px 14px',
            marginBottom: 28,
            letterSpacing: '0.01em',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, display: 'inline-block' }} />
            Open source · Self-hostable · v0.1
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(48px, 7vw, 78px)',
            fontWeight: 800,
            letterSpacing: '-0.045em',
            lineHeight: 1.05,
            margin: '0 0 8px',
            color: C.text,
          }}>
            Automate anything.
          </h1>
          <h1 style={{
            fontSize: 'clamp(48px, 7vw, 78px)',
            fontWeight: 800,
            letterSpacing: '-0.045em',
            lineHeight: 1.05,
            margin: '0 0 28px',
            background: `linear-gradient(135deg, ${C.accentBright} 0%, #e06b6e 50%, #f8b5ba 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            All at once.
          </h1>

          <p style={{
            fontSize: 18,
            color: C.textSub,
            lineHeight: 1.6,
            margin: '0 auto 36px',
            maxWidth: 520,
          }}>
            The workflow orchestrator built for the AI era. Visual, parallel, and completely yours.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/app')}
              style={{
                height: 46,
                padding: '0 24px',
                borderRadius: 9,
                border: 'none',
                background: C.text,
                color: C.bg,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Start Building →
            </button>
            <a
              href="https://github.com"
              style={{
                height: 46,
                padding: '0 24px',
                borderRadius: 9,
                border: `1px solid ${C.borderBright}`,
                background: 'transparent',
                color: C.text,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.text)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.borderBright)}
            >
              View on GitHub
            </a>
          </div>

          {/* Mockup */}
          <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center' }}>
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* Benchmark strip */}
      <div style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: '20px 0',
        overflow: 'hidden',
        background: '#0a0a0e',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 48,
          flexWrap: 'wrap',
          padding: '0 32px',
        }}>
          {[
            // No speed ratio here until there is a reproducible harness that measures
            // both sides identically (see HARDENING.md item 5). Claims must be things a
            // visitor can verify from the repo.
            { value: 'Parallel', label: 'independent branches, by default' },
            { value: '50+', label: 'node types' },
            { value: 'Self-host', label: 'free forever, your infra' },
            { value: '100%', label: 'user-owned credentials' },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature sections */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 48px' }}>
        <FeatureSection
          tag="Parallel execution"
          title="Run workflows at the speed of your ideas."
          body="Otto analyzes your workflow as a DAG and fires every independent node simultaneously. Two API calls that don't depend on each other run at the same time — you wait for the longest path, not the sum of every step. No configuration needed; it's just how execution works."
          visual={<ParallelVisual />}
        />

        <FeatureSection
          tag="OttoBot"
          // Describes what OttoBot actually does today: deterministic DAG analysis +
          // chat grounded in the open workflow. It does NOT persist learning across
          // sessions — do not reinstate "gets smarter over time" until it measurably does.
          title="An assistant that reads your workflow."
          body="OttoBot analyzes the graph you're building — it spots independent branches still wired in series, nodes nothing connects to, and chained LLM calls that could run together. Ask it questions about the open workflow and it answers with your actual nodes in context."
          visual={<OttoBotVisual />}
        />

        <FeatureSection
          tag="Fully observable"
          title="See exactly what's happening, always."
          body="Every execution is logged. Every node output is inspectable as JSON, a table, or a schema. Live SSE streaming brings execution state to the canvas in real time — nodes light up as they run, completed nodes show their output, and failed nodes show the exact error with the context to fix it."
          visual={<TerminalVisual />}
          isLast
        />
      </div>

      {/* Bottom CTA */}
      <div style={{
        borderTop: `1px solid ${C.border}`,
        padding: '80px 32px',
        textAlign: 'center',
        background: '#0a0a0e',
      }}>
        <div style={{
          display: 'inline-block',
          fontSize: 11,
          fontWeight: 600,
          color: C.accent,
          background: C.accentSoft,
          border: `1px solid rgba(161,60,63,0.2)`,
          borderRadius: 20,
          padding: '3px 10px',
          marginBottom: 20,
        }}>
          Free forever · Self-host in minutes
        </div>
        <h2 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 16px', color: C.text }}>
          Ready to move fast?
        </h2>
        <p style={{ fontSize: 16, color: C.textSub, margin: '0 auto 36px', maxWidth: 440, lineHeight: 1.6 }}>
          Deploy Otto in minutes. No credit card, no usage limits, no per-step pricing.
        </p>
        <button
          onClick={() => navigate('/app')}
          style={{
            height: 50,
            padding: '0 32px',
            borderRadius: 10,
            border: 'none',
            background: C.text,
            color: C.bg,
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '-0.01em',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Start Building →
        </button>
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${C.border}`,
        padding: '24px 48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: C.accent,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 11,
            color: '#fff',
          }}>O</div>
          <span style={{ fontSize: 13, color: C.textMuted }}>© 2024 Otto · Open source workflow orchestration</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Security', 'Status', 'Docs'].map(l => (
            <a key={l} href="#" onClick={e => e.preventDefault()} style={{ fontSize: 13, color: C.textMuted, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.textSub)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}
            >{l}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}
