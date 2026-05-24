// otto-v5.jsx — renders both themes (dark+amber, light+amber) as two
// artboards on the design canvas.

/* eslint-disable react/jsx-key */

const { THEMES, Sidebar, Topbar, Canvas, Inspector, BottomPanels } = window;

function Workspace({ t }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex',
      background: t.bgCanvas,
      fontFamily: 'Inter',
      color: t.textPrimary,
      overflow: 'hidden',
    }}>
      <Sidebar t={t} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar t={t} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Canvas t={t} />
          <Inspector t={t} />
        </div>
        <BottomPanels t={t} />
      </div>
    </div>
  );
}

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="themes"
        title="Otto · Amber on dark / amber on light"
        subtitle="Same components, two themes. Inter throughout, JetBrains Mono for technical text. Amber is the only brand color."
      >
        <DCArtboard
          id="dark"
          label="A · Dark + Amber"
          width={1680}
          height={1024}
          style={{ background: THEMES.dark.bgCanvas }}
        >
          <Workspace t={THEMES.dark} />
        </DCArtboard>

        <DCArtboard
          id="light"
          label="B · Light + Amber"
          width={1680}
          height={1024}
          style={{ background: THEMES.light.bgCanvas }}
        >
          <Workspace t={THEMES.light} />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
