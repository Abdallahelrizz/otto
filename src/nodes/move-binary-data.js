import {
  bufferFromValue,
  detectMimeType,
  getBinaryData,
  getBinaryRef,
  saveBinaryData,
  toBinaryRef,
} from '../utils/binary-data.js';
import { getByPath } from '../utils/path.js';

export async function moveBinaryData({ input, config, workspaceId }) {
  const mode = config.mode ?? 'json_to_binary';
  const binaryProperty = config.binaryProperty ?? 'data';

  if (mode === 'binary_to_json') {
    const ref = getBinaryRef(input, binaryProperty);
    if (!ref) throw new Error(`Move Binary Data: binary property "${binaryProperty}" was not found`);
    const row = await getBinaryData(workspaceId, ref.id);
    if (!row) throw new Error(`Move Binary Data: binary data "${ref.id}" was not found`);

    const targetField = config.targetField ?? 'data';
    const encoding = config.encoding === 'base64' ? 'base64' : 'utf8';
    const value = row.data.toString(encoding);
    return setByPath({ ...(input ?? {}) }, String(targetField), value);
  }

  const sourceField = config.sourceField ?? 'data';
  const value = getByPath(input, String(sourceField));
  const fileName = config.fileName ?? `${binaryProperty}.txt`;
  const buffer = bufferFromValue(value, config.encoding === 'base64' ? 'base64' : 'utf8');
  const ref = await saveBinaryData({
    workspaceId,
    fileName: String(fileName),
    mimeType: config.mimeType || detectMimeType(String(fileName)),
    buffer,
    metadata: {
      source: 'move_binary_data',
      sourceField,
    },
  });

  return {
    ...(input ?? {}),
    binary: {
      ...((input?.binary && typeof input.binary === 'object') ? input.binary : {}),
      [binaryProperty]: toBinaryRef({
        id: ref.id,
        file_name: ref.fileName,
        mime_type: ref.mimeType,
        size_bytes: ref.sizeBytes,
        metadata: ref.metadata,
        created_at: ref.createdAt,
      }),
    },
  };
}

function setByPath(target, dottedPath, value) {
  const parts = dottedPath.split('.').filter(Boolean);
  if (parts.length === 0) return value;

  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
  return target;
}
