import { format } from 'date-fns';

const mockDaily = [
  { day: '2024-01-21', total: 142, success: 135, error: 7 },
  { day: '2024-01-22', total: 189, success: 180, error: 9 },
  { day: '2024-01-23', total: 167, success: 160, error: 7 },
  { day: '2024-01-24', total: 203, success: 195, error: 8 },
  { day: '2024-01-25', total: 178, success: 170, error: 8 },
  { day: '2024-01-26', total: 195, success: 188, error: 7 },
  { day: '2024-01-27', total: 156, success: 150, error: 6 },
];

const mockLogs = [
  {
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    level: 'info',
    message: '[Lead Enrichment Pipeline] Execution started',
    executionId: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    timestamp: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    level: 'error',
    message: '[Weekly Report Generator] Node "Send Email" failed: SMTP connection timeout',
    executionId: '550e8400-e29b-41d4-a716-446655440003',
  },
  {
    timestamp: new Date(Date.now() - 30 * 1000).toISOString(),
    level: 'info',
    message: '[Slack Alert Monitor] Execution completed successfully in 45s',
    executionId: '550e8400-e29b-41d4-a716-446655440002',
  },
];

function MetricCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
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

function BarChart() {
  const maxValue = Math.max(...mockDaily.map((d) => d.total));

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
        Daily Executions
      </h3>
      <div className="flex items-end gap-2 h-32">
        {mockDaily.map((day) => (
          <div key={day.day} className="flex-1 flex flex-col items-center">
            <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
              <div className="relative w-full">
                <div
                  className="w-full bg-brand-success/40 rounded-t-1"
                  style={{ height: `${(day.success / maxValue) * 80}px` }}
                />
                <div
                  className="w-full bg-brand-error/40 rounded-b-1"
                  style={{ height: `${(day.error / maxValue) * 80}px` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        {mockDaily.map((day) => (
          <div key={day.day} className="flex-1 text-center">
            <div className="text-xs font-mono text-gray-500">
              {format(new Date(day.day), 'MMM dd')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogTerminal() {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Recent Logs</h3>
      <div className="bg-black border border-white/8 rounded-4 p-4 h-64 overflow-y-auto font-mono text-xs">
        {mockLogs.map((log, i) => (
          <div key={i} className="flex gap-3 mb-2">
            <span className="text-gray-500">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
            <span
              className={`${
                log.level === 'error'
                  ? 'text-brand-error'
                  : log.level === 'warning'
                  ? 'text-brand-warning'
                  : 'text-gray-300'
              }`}
            >
              [{log.level.toUpperCase()}]
            </span>
            <span className="text-gray-300 truncate">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Observability() {
  const totalExecutions = mockDaily.reduce((sum, d) => sum + d.total, 0);
  const totalSuccess = mockDaily.reduce((sum, d) => sum + d.success, 0);
  const totalError = mockDaily.reduce((sum, d) => sum + d.error, 0);
  const successRate = Math.round((totalSuccess / totalExecutions) * 100);
  const errorRate = Math.round((totalError / totalExecutions) * 100);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Observability</h1>
        <p className="text-sm text-gray-400">Monitor system performance and execution metrics</p>
      </div>

      <div className="grid grid-cols-6 gap-4 mb-6">
        <MetricCard label="Total Executions" value={totalExecutions} />
        <MetricCard label="Success Rate" value={`${successRate}%`} />
        <MetricCard label="Error Rate" value={`${errorRate}%`} />
        <MetricCard label="Avg Duration" value="1.2s" />
        <MetricCard label="P95 Duration" value="3.4s" />
        <MetricCard label="Tokens Used" value="245K" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#111] border border-white/8 rounded-4 p-6">
          <BarChart />
        </div>
        <div className="bg-[#111] border border-white/8 rounded-4 p-6">
          <LogTerminal />
        </div>
      </div>
    </div>
  );
}
