import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Workflows } from './pages/Workflows';
import { Executions } from './pages/Executions';
import { Credentials } from './pages/Credentials';
import { Observability } from './pages/Observability';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to="/workflows" replace />} />
        <Route path="workflows" element={<Workflows />} />
        <Route path="executions" element={<Executions />} />
        <Route path="credentials" element={<Credentials />} />
        <Route path="observability" element={<Observability />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
