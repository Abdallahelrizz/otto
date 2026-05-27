import { formatDistanceToNow } from 'date-fns';
import type { Execution } from '../types';

const mockExecutions: Execution[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    workflowId: '1',
    workflowName: 'Lead Enrichment Pipeline',
    status: 'success',
    triggerType: 'webhook',
    startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    durationMs: 58234,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    workflowId: '2',
    workflowName: 'Slack Alert Monitor',
    status: 'running',
    triggerType: 'manual',
    startedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    workflowId: '3',
    workflowName: 'Weekly Report Generator',
    status: 'error',
    triggerType: 'schedule',
    startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    durationMs: 125000,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    workflowId: '4',
    workflowName: 'Customer Onboarding Flow',
    status: 'success',
    triggerType: 'form',
    startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 44 * 60 * 1000).toISOString(),
    durationMs: 62300,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    workflowId: '1',
    workflowName: 'Lead Enrichment Pipeline',
    status: 'cancelled',
    triggerType: 'manual',
    startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
  },
];

function StatusBadge({ status }: { status: Execution['status'] }) {
  const styles = {
    pending: 'bg-white/5 text-gray-400 border-white/10',
    running: 'bg-brand-accent/20 text-brand-accent border-brand-accent/30',
    success: 'bg-brand-success/20 text-brand-success border-brand-success/30',
    error: 'bg-brand-error/20 text-brand-error border-brand-error/30',
    cancelled: 'bg-white/5 text-gray-400 border-white/10',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-2 border ${styles[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

function StatCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="p-4 bg-[#111] border border-white/8 rounded-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white">
        {value}
        {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

export function Executions() {
  const totalExecutions = mockExecutions.length;
  const successCount = mockExecutions.filter((e) => e.status === 'success').length;
  const successRate = totalExecutions > 0 ? Math.round((successCount / totalExecutions) * 100) : 0;
  const avgDuration =
    mockExecutions
      .filter((e) => e.durationMs)
      .reduce((sum, e) => sum + (e.durationMs || 0), 0) / mockExecutions.length;
  const activeNow = mockExecutions.filter((e) => e.status === 'running').length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Executions</h1>
        <p className="text-sm text-gray-400">Monitor workflow execution history and status</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Executions" value={totalExecutions} />
        <StatCard label="Success Rate" value={`${successRate}%`} />
        <StatCard label="Avg Duration" value={avgDuration > 0 ? formatDuration(avgDuration) : '-'} />
        <StatCard label="Active Now" value={activeNow} />
      </div>

      <div className="bg-[#111] border border-white/8 rounded-4 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/8">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                ID
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Workflow
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Trigger
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Started
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {mockExecutions.map((exec) => (
              <tr key={exec.id} className="border-b border-white/8 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 font-mono text-sm text-gray-300">
                  {exec.id.slice(0, 8)}...
                </td>
                <td className="px-4 py-3 text-sm text-white">{exec.workflowName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={exec.status} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-400 capitalize">{exec.triggerType}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {exec.startedAt
                    ? formatDistanceToNow(new Date(exec.startedAt), { addSuffix: true })
                    : '-'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {exec.durationMs ? formatDuration(exec.durationMs) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
