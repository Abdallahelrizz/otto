import { DashboardShell } from '../../dashboard/DashboardShell';
import { SettingsNav } from '../../dashboard/SettingsNav';

const FACTS = [
  { label: 'Version', value: '0.1.0' },
  { label: 'Engine', value: 'Node.js + Fastify' },
  { label: 'Queue', value: 'BullMQ + Redis' },
];

export function SettingsAbout() {
  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <SettingsNav />
        <div className="otto-page-hero">
          <div>
            <span className="otto-title-bar" aria-hidden="true" />
            <h1>About</h1>
            <p className="otto-hero-copy">
              Open-source workflow orchestrator — n8n, but built for the AI era.
            </p>
          </div>
        </div>

        <div className="otto-resource-panel otto-settings-panel">
          <h2 className="otto-settings-h2">Otto</h2>
          <dl className="otto-settings-facts">
            {FACTS.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd className="otto-mono">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </DashboardShell>
  );
}
