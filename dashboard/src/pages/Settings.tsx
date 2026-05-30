import { useAppStore } from '../store';

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">{title}</h2>
      <div className="bg-[#111] border border-white/8 rounded-4">{children}</div>
    </div>
  );
}

function SettingsRow({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-white/8 last:border-b-0">
      <div>
        <div className="text-sm text-white font-medium">{label}</div>
        <div className="text-xs text-gray-400 mt-1">{value}</div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Settings() {
  const { theme, setTheme, workspace, user } = useAppStore();

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Settings</h1>
        <p className="text-sm text-gray-400">Manage workspace and account preferences</p>
      </div>

      <SettingsSection title="Workspace">
        <SettingsRow label="Workspace Name" value={workspace?.name || 'Demo Workspace'} />
        <SettingsRow label="Plan" value={workspace?.plan || 'Free'} />
        <SettingsRow label="Created" value="January 1, 2024" />
      </SettingsSection>

      <SettingsSection title="Theme">
        <div className="p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 p-4 border rounded-2 transition-all ${
                theme === 'dark'
                  ? 'border-brand-accent bg-brand-accent/10'
                  : 'border-white/8 hover:border-white/20'
              }`}
            >
              <div className="text-sm font-medium text-white mb-1">Dark</div>
              <div className="text-xs text-gray-400">Default dark theme</div>
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 p-4 border rounded-2 transition-all ${
                theme === 'light'
                  ? 'border-brand-accent bg-brand-accent/10'
                  : 'border-white/8 hover:border-white/20'
              }`}
            >
              <div className="text-sm font-medium text-white mb-1">Light</div>
              <div className="text-xs text-gray-400">Light theme</div>
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow label="Email" value={user?.email || 'demo@example.com'} />
        <SettingsRow label="Name" value={user?.name || 'Demo User'} />
        <SettingsRow
          label="Password"
          value="••••••••"
          action={
            <button className="px-3 py-1.5 border border-white/8 rounded-2 text-xs font-medium text-gray-300 hover:bg-white/5 transition-colors">
              Change
            </button>
          }
        />
      </SettingsSection>

      <SettingsSection title="API Keys">
        <SettingsRow
          label="Production Key"
          value="otto_prod_...Ab3C"
          action={
            <button className="px-3 py-1.5 border border-white/8 rounded-2 text-xs font-medium text-gray-300 hover:bg-white/5 transition-colors">
              Revoke
            </button>
          }
        />
        <div className="p-4">
          <button className="px-4 py-2 border border-white/8 rounded-2 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors">
            Generate New Key
          </button>
        </div>
      </SettingsSection>

      <div className="mt-8">
        <SettingsSection title="Danger Zone">
          <div className="p-4 bg-brand-error/10 border border-brand-error/30 rounded-4 mb-4">
            <div className="text-sm font-medium text-white mb-1">Delete Workspace</div>
            <div className="text-xs text-gray-400 mb-3">
              This action cannot be undone. All workflows, executions, and data will be permanently
              deleted.
            </div>
            <button className="px-4 py-2 bg-brand-error text-white text-sm font-medium rounded-2 hover:bg-brand-error/80 transition-colors">
              Delete Workspace
            </button>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
