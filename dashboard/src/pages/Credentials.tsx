import { useState } from 'react';
import type { Credential } from '../types';

const mockCredentials: Credential[] = [
  {
    id: '1',
    name: 'OpenAI API Key',
    type: 'openai',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    name: 'Slack Bot Token',
    type: 'bearer_token',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    name: 'Postgres Connection',
    type: 'postgres',
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '4',
    name: 'SendGrid API Key',
    type: 'api_key',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function maskValue(type: string): string {
  switch (type) {
    case 'openai':
      return 'sk-...7Xk9';
    case 'bearer_token':
      return 'xoxb-...4Zm2';
    case 'postgres':
      return 'postgres://***:***@db.example.com:5432/db';
    case 'api_key':
      return 'SG...Ab3C';
    default:
      return '***...***';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'openai':
      return 'OpenAI';
    case 'bearer_token':
      return 'Bearer Token';
    case 'postgres':
      return 'PostgreSQL';
    case 'api_key':
      return 'API Key';
    case 'basic':
      return 'Basic Auth';
    case 'anthropic':
      return 'Anthropic';
    default:
      return type.toUpperCase();
  }
}

function CredentialCard({ credential }: { credential: Credential }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`p-5 bg-[#111] border rounded-4 transition-all duration-150 ${
        isHovered ? 'border-brand-accent' : 'border-white/8'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2 bg-white/5 border border-white/8 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 012 12H6a6 6 0 01-6-6V9a6 6 0 016-6h10a2 2 0 012 2m0 0V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{credential.name}</h3>
            <p className="text-xs text-gray-500">{getTypeLabel(credential.type)}</p>
          </div>
        </div>
        {isHovered && (
          <button className="text-gray-400 hover:text-brand-error transition-colors">Delete</button>
        )}
      </div>
      <div className="bg-black/50 border border-white/5 rounded-2 px-3 py-2 font-mono text-xs text-gray-300">
        {maskValue(credential.type)}
      </div>
    </div>
  );
}

function AddCredentialModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('api_key');
  const [value, setValue] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-full max-w-md bg-[#111] border border-white/8 rounded-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Add Credential</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            X
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-white/8 rounded-2 text-white text-sm focus:outline-none focus:border-brand-accent"
              placeholder="My API Key"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-white/8 rounded-2 text-white text-sm focus:outline-none focus:border-brand-accent"
            >
              <option value="api_key">API Key</option>
              <option value="bearer_token">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Value</label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 bg-black border border-white/8 rounded-2 text-white text-sm font-mono focus:outline-none focus:border-brand-accent"
              placeholder="sk-..."
              required
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-white/8 rounded-2 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-brand-accent rounded-2 text-sm font-medium text-white hover:bg-brand-accent/80 transition-colors"
            >
              Add Credential
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Credentials() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Credentials</h1>
          <p className="text-sm text-gray-400">Manage API keys and connection secrets</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-brand-accent text-white text-sm font-medium rounded-2 hover:bg-brand-accent/80 transition-colors"
        >
          Add Credential
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockCredentials.map((credential) => (
          <CredentialCard key={credential.id} credential={credential} />
        ))}
      </div>

      <AddCredentialModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
