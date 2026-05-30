import { randomUUID } from 'crypto';
import { mkdir, readFile, readdir, lstat, writeFile, realpath } from 'fs/promises';
import path from 'path';
import { db } from '../db/client.js';

// Defense-in-depth against symlink escapes: resolve real path and re-check it
// is still inside the workspace root. Tolerates non-existent files (write path).
async function assertRealInsideRoot(workspaceRoot, filePath) {
  const rootWithSep = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
  let target = filePath;
  // Walk up to the nearest existing ancestor (file may not exist yet on write)
  for (let i = 0; i < 64; i++) {
    try {
      const real = await realpath(target);
      if (real !== workspaceRoot && !real.startsWith(rootWithSep)) {
        throw new Error('Path escapes the workspace directory');
      }
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      const parent = path.dirname(target);
      if (parent === target) return; // reached fs root without finding anything
      target = parent;
    }
  }
}

const MIME_BY_EXT = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
};

export function detectMimeType(fileName) {
  return MIME_BY_EXT[path.extname(fileName ?? '').toLowerCase()] ?? 'application/octet-stream';
}

export function getFilesRoot() {
  return path.resolve(process.env.OTTO_FILES_DIR ?? path.join(process.cwd(), 'files'));
}

export function resolveWorkspaceFilePath(workspaceId, requestedPath = '') {
  if (!workspaceId) throw new Error('Binary file path: workspaceId is required');
  const workspaceRoot = path.join(getFilesRoot(), workspaceId);
  const finalPath = path.resolve(workspaceRoot, requestedPath || '.');
  const rootWithSep = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;

  if (finalPath !== workspaceRoot && !finalPath.startsWith(rootWithSep)) {
    throw new Error('File path escapes the workspace file directory');
  }

  return { workspaceRoot, filePath: finalPath };
}

function toWorkspaceRelative(workspaceRoot, filePath) {
  const rel = path.relative(workspaceRoot, filePath) || '.';
  return rel.split(path.sep).join('/');
}

function globToRegExp(pattern) {
  const source = String(pattern ?? '').trim();
  if (!source) return null;
  const escaped = source.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function fileEntry(workspaceRoot, filePath, stat, type) {
  const fileName = path.basename(filePath);
  return {
    path: toWorkspaceRelative(workspaceRoot, filePath),
    fileName,
    type,
    extension: type === 'file' ? path.extname(fileName).toLowerCase() : '',
    mimeType: type === 'file' ? detectMimeType(fileName) : null,
    sizeBytes: type === 'file' ? stat.size : 0,
    createdAt: stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
  };
}

export async function readWorkspaceFile(workspaceId, requestedPath) {
  const { filePath, workspaceRoot } = resolveWorkspaceFilePath(workspaceId, requestedPath);
  await assertRealInsideRoot(workspaceRoot, filePath);
  const data = await readFile(filePath);
  return {
    buffer: data,
    fileName: path.basename(filePath),
    mimeType: detectMimeType(filePath),
    path: requestedPath,
  };
}

export async function writeWorkspaceFile(workspaceId, requestedPath, buffer) {
  const { filePath, workspaceRoot } = resolveWorkspaceFilePath(workspaceId, requestedPath);
  if (filePath === workspaceRoot) throw new Error('Write file: path must include a file name');
  await mkdir(path.dirname(filePath), { recursive: true });
  await assertRealInsideRoot(workspaceRoot, filePath);
  await writeFile(filePath, buffer);
  return { filePath, workspaceRoot };
}

export async function listWorkspaceFiles(workspaceId, options = {}) {
  const {
    path: requestedPath = '.',
    recursive = false,
    includeDirectories = false,
    pattern = '',
    maxDepth = 5,
    limit = 250,
  } = options;
  const { filePath, workspaceRoot } = resolveWorkspaceFilePath(workspaceId, requestedPath || '.');
  await assertRealInsideRoot(workspaceRoot, filePath);
  const matcher = globToRegExp(pattern);
  const entries = [];
  const boundedLimit = Math.min(Math.max(Number(limit) || 250, 1), 1000);
  const boundedDepth = Math.min(Math.max(Number(maxDepth) || 0, 0), 20);

  const addEntry = (entry) => {
    if (entries.length >= boundedLimit) return false;
    const matched = !matcher || matcher.test(entry.path) || matcher.test(entry.fileName);
    if (matched) entries.push(entry);
    return entries.length < boundedLimit;
  };

  async function walk(currentPath, depth) {
    if (entries.length >= boundedLimit) return;
    const stat = await lstat(currentPath);
    if (stat.isSymbolicLink()) {
      if (includeDirectories) {
        addEntry({
          path: toWorkspaceRelative(workspaceRoot, currentPath),
          fileName: path.basename(currentPath),
          type: 'symlink',
          extension: '',
          mimeType: null,
          sizeBytes: 0,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        });
      }
      return;
    }
    if (stat.isFile()) {
      addEntry(fileEntry(workspaceRoot, currentPath, stat, 'file'));
      return;
    }
    if (!stat.isDirectory()) return;

    if (includeDirectories && currentPath !== workspaceRoot) {
      addEntry(fileEntry(workspaceRoot, currentPath, stat, 'directory'));
    }
    if (!recursive && currentPath !== filePath) return;
    if (recursive && depth >= boundedDepth) return;

    const children = await readdir(currentPath, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (entries.length >= boundedLimit) break;
      await walk(path.join(currentPath, child.name), depth + 1);
    }
  }

  await walk(filePath, 0);

  return {
    path: toWorkspaceRelative(workspaceRoot, filePath),
    files: entries,
    count: entries.length,
    truncated: entries.length >= boundedLimit,
    workspaceRoot,
  };
}

export async function saveBinaryData({ workspaceId, fileName, mimeType, buffer, metadata = {} }) {
  if (!workspaceId) throw new Error('Binary data: workspaceId is required');
  if (!Buffer.isBuffer(buffer)) throw new Error('Binary data: buffer is required');

  const id = randomUUID();
  const safeName = fileName || `${id}.bin`;
  const type = mimeType || detectMimeType(safeName);

  const { rows } = await db.query(
    `INSERT INTO binary_data (id, workspace_id, file_name, mime_type, size_bytes, data, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, file_name, mime_type, size_bytes, metadata, created_at`,
    [id, workspaceId, safeName, type, buffer.length, buffer, JSON.stringify(metadata)]
  );

  return toBinaryRef(rows[0]);
}

export async function getBinaryData(workspaceId, id) {
  const { rows } = await db.query(
    `SELECT id, file_name, mime_type, size_bytes, data, metadata, created_at
     FROM binary_data
     WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  return rows[0] ?? null;
}

export async function getBinaryMetadata(workspaceId, id) {
  const { rows } = await db.query(
    `SELECT id, file_name, mime_type, size_bytes, metadata, created_at
     FROM binary_data
     WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  return rows[0] ?? null;
}

export async function listBinaryMetadata(workspaceId, options = {}) {
  const where = ['workspace_id = $1'];
  const params = [workspaceId];
  if (options.mimeType) {
    params.push(String(options.mimeType));
    where.push(`mime_type = $${params.length}`);
  }
  if (options.fileNameContains) {
    params.push(`%${String(options.fileNameContains)}%`);
    where.push(`file_name ILIKE $${params.length}`);
  }
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 250);
  params.push(limit);

  const { rows } = await db.query(
    `SELECT id, file_name, mime_type, size_bytes, metadata, created_at
     FROM binary_data
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function deleteBinaryData(workspaceId, id) {
  const { rowCount } = await db.query(
    'DELETE FROM binary_data WHERE id = $1 AND workspace_id = $2',
    [id, workspaceId]
  );
  return rowCount > 0;
}

export function toBinaryRef(row) {
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export function getBinaryRef(input, binaryProperty = 'data') {
  const source = input?.binary?.[binaryProperty]
    ?? input?.binaryData?.[binaryProperty]
    ?? input?.[binaryProperty];

  if (!source || typeof source !== 'object' || !source.id) return null;
  return source;
}

export function bufferFromValue(value, encoding = 'utf8') {
  if (Buffer.isBuffer(value)) return value;
  if (value == null) return Buffer.alloc(0);
  if (typeof value === 'string') return Buffer.from(value, encoding);
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8');
}
