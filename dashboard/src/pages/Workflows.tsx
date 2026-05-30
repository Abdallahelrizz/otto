import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Workflow } from '../types';

const mockWorkflows: Workflow[] = [
  {
    id: '1',
    name: 'Lead Enrichment Pipeline',
    description: 'Enriches leads from web form submissions using Clearbit and saves to CRM',
    active: true,
    lastRunAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    name: 'Slack Alert Monitor',
    description: 'Monitors error logs and sends Slack notifications for critical issues',
    active: true,
    lastRunAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    name: 'Weekly Report Generator',
    description: 'Generates and emails weekly analytics reports to stakeholders',
    active: false,
    lastRunAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '4',
    name: 'Customer Onboarding Flow',
    description: 'Automated welcome sequence with email, CRM update, and Slack notification',
    active: true,
    lastRunAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function StatusBadge({ active, running = false }: { active: boolean; running?: boolean }) {
  if (running) {
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-2 bg-brand-accent/20 text-brand-accent border border-brand-accent/30">
        RUNNING
      </span>
    );
  }
  return active ? (
    <span className="px-2 py-1 text-xs font-medium rounded-2 bg-brand-success/20 text-brand-success border border-brand-success/30">
      ACTIVE
    </span>
  ) : (
    <span className="px-2 py-1 text-xs font-medium rounded-2 bg-white/5 text-gray-400 border border-white/10">
      INACTIVE
    </span>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`p-5 bg-[#111] border rounded-4 transition-all duration-150 ${
        isHovered ? 'border-brand-accent' : 'border-white/8'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between mb-3">
        <StatusBadge active={workflow.active} />
        {isHovered && (
          <button className="px-3 py-1.5 text-xs font-medium bg-brand-accent text-white rounded-2 hover:bg-brand-accent/80 transition-colors">
            Run
          </button>
        )}
      </div>
      <h3 className="text-base font-semibold text-white mb-2">{workflow.name}</h3>
      <p className="text-sm text-gray-400 mb-4 line-clamp-2">{workflow.description}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Last run</span>
        <span className="font-mono text-gray-400">
          {workflow.lastRunAt
            ? formatDistanceToNow(new Date(workflow.lastRunAt), { addSuffix: true })
            : 'Never'}
        </span>
      </div>
    </div>
  );
}

export function Workflows() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Workflows</h1>
        <p className="text-sm text-gray-400">Manage and monitor your automation workflows</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockWorkflows.map((workflow) => (
          <WorkflowCard key={workflow.id} workflow={workflow} />
        ))}
      </div>
    </div>
  );
}
