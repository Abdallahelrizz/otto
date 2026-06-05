import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CanvasApp } from './pages/CanvasApp';
import { WorkflowsDashboard } from './pages/WorkflowsDashboard';
import { ExecutionHistory } from './pages/ExecutionHistory';
import { CredentialsPage } from './pages/CredentialsPage';
import { UsagePage } from './pages/UsagePage';
import { SettingsGeneral } from './pages/settings/SettingsGeneral';
import { SettingsOttoBot } from './pages/settings/SettingsOttoBot';
import { SettingsApiKeys } from './pages/settings/SettingsApiKeys';
import { SettingsVariables } from './pages/settings/SettingsVariables';
import { SettingsAuditLog } from './pages/settings/SettingsAuditLog';
import { SettingsAbout } from './pages/settings/SettingsAbout';
import { AuthGate } from './components/AuthGate';
import { useStore } from './store';

function AppRoute({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}

export function App() {
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/workflows" replace />} />

      {/* App pages — all auth-gated */}
      <Route path="/app" element={<Navigate to="/app/workflows" replace />} />
      <Route path="/app/workflows" element={<AppRoute><WorkflowsDashboard /></AppRoute>} />
      <Route path="/app/editor" element={<CanvasApp />} />
      <Route path="/app/editor/:id" element={<CanvasApp />} />
      <Route path="/app/executions" element={<AppRoute><ExecutionHistory /></AppRoute>} />
      <Route path="/app/credentials" element={<AppRoute><CredentialsPage /></AppRoute>} />
      <Route path="/app/observability" element={<AppRoute><UsagePage /></AppRoute>} />
      <Route path="/app/settings" element={<Navigate to="/app/settings/general" replace />} />
      <Route path="/app/settings/general" element={<AppRoute><SettingsGeneral /></AppRoute>} />
      <Route path="/app/settings/ottobot" element={<AppRoute><SettingsOttoBot /></AppRoute>} />
      <Route path="/app/settings/api-keys" element={<AppRoute><SettingsApiKeys /></AppRoute>} />
      <Route path="/app/settings/variables" element={<AppRoute><SettingsVariables /></AppRoute>} />
      <Route path="/app/settings/audit" element={<AppRoute><SettingsAuditLog /></AppRoute>} />
      <Route path="/app/settings/about" element={<AppRoute><SettingsAbout /></AppRoute>} />

      <Route path="*" element={<Navigate to="/app/workflows" replace />} />
    </Routes>
  );
}
