import {
  getBinaryMetadata,
  getBinaryRef,
  listBinaryMetadata,
  toBinaryRef,
} from '../utils/binary-data.js';
import { makeItem } from '../utils/items.js';

function parseBoolean(value, fallback = true) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(limit, 1), 250);
}

function metadataOutput(row) {
  const ref = toBinaryRef(row);
  return ref ? {
    ...ref,
    metadata: ref.metadata ?? {},
  } : null;
}

export async function binaryMetadata({ input, config, workspaceId }) {
  const source = config.source ?? 'input';
  const binaryProperty = config.binaryProperty ?? 'data';
  const lookup = parseBoolean(config.lookup, true);

  if (source === 'recent') {
    const rows = await listBinaryMetadata(workspaceId, {
      limit: parseLimit(config.limit),
      mimeType: config.mimeType,
      fileNameContains: config.fileNameContains,
    });
    const binaries = rows.map(metadataOutput).filter(Boolean);
    return {
      source,
      binaries,
      items: binaries.map((binary, index) => makeItem(binary, { pairedItem: { item: index } })),
      count: binaries.length,
    };
  }

  const ref = source === 'id'
    ? { id: config.binaryId }
    : getBinaryRef(input, binaryProperty);

  if (!ref?.id) {
    return {
      source,
      binaryProperty,
      found: false,
      binary: null,
    };
  }

  if (!lookup) {
    return {
      source,
      binaryProperty,
      found: true,
      binary: {
        id: ref.id,
        fileName: ref.fileName ?? null,
        mimeType: ref.mimeType ?? null,
        sizeBytes: ref.sizeBytes ?? null,
        metadata: ref.metadata ?? {},
        createdAt: ref.createdAt ?? null,
      },
    };
  }

  const row = await getBinaryMetadata(workspaceId, ref.id);
  return {
    source,
    binaryProperty,
    found: Boolean(row),
    binary: metadataOutput(row),
  };
}
