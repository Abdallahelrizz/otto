import { useEffect, useState } from 'react';
import { DashboardShell } from '../../dashboard/DashboardShell';
import { SettingsNav } from '../../dashboard/SettingsNav';
import { api } from '../../api';
import type { AuthStatus } from '../../types';

export function SettingsGeneral() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);

  useEffect(() => {
    void api.authStatus().then(setAuth).catch(() => {});
  }, []);

  const signOut = () => {
    void api.logout().then(() => { window.location.href = '/'; }).catch(() => {});
  };

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <SettingsNav />
        <div className="otto-page-hero">
          <div>
            <span className="otto-title-bar" aria-hidden="true" />
            <h1>General</h1>
            <p className="otto-hero-copy">Your account and session.</p>
          </div>
        </div>

        <div className="otto-resource-panel otto-settings-panel">
          <h2 className="otto-settings-h2">Account</h2>
          <dl className="otto-settings-facts">
            <div><dt>Email</dt><dd>{auth?.user?.email ?? '—'}</dd></div>
            <div><dt>Name</dt><dd>{auth?.user?.name ?? '—'}</dd></div>
            <div><dt>Plan</dt><dd style={{ textTransform: 'capitalize' }}>{auth?.workspace?.plan ?? 'free'}</dd></div>
          </dl>
          <div className="otto-settings-actions">
            <button className="otto-button is-ghost otto-settings-danger" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
