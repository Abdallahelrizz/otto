import { listWorkspaceFiles } from '../utils/binary-data.js';
import { makeItem } from '../utils/items.js';

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(next, min), max);
}

export async function listFiles({ config, workspaceId }) {
  const result = await listWorkspaceFiles(workspaceId, {
    path: config.path || '.',
    recursive: parseBoolean(config.recursive, false),
    includeDirectories: parseBoolean(config.includeDirectories, false),
    pattern: config.pattern || '',
    maxDepth: parseNumber(config.maxDepth, 5, 0, 20),
    limit: parseNumber(config.limit, 250, 1, 1000),
  });

  return {
    path: result.path,
    files: result.files,
    items: result.files.map((file, index) => makeItem(file, { pairedItem: { item: index } })),
    count: result.count,
    truncated: result.truncated,
  };
}
