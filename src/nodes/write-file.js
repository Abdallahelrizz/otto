import path from 'path';
import {
  getBinaryData,
  getBinaryRef,
  toBinaryRef,
  writeWorkspaceFile,
} from '../utils/binary-data.js';

export async function writeFileNode({ input, config, workspaceId }) {
  const binaryProperty = config.binaryProperty ?? 'data';
  const ref = getBinaryRef(input, binaryProperty);
  if (!ref) throw new Error(`Write File: binary property "${binaryProperty}" was not found`);

  const row = await getBinaryData(workspaceId, ref.id);
  if (!row) throw new Error(`Write File: binary data "${ref.id}" was not found`);

  const requestedPath = config.path
    || config.filePath
    || ref.fileName
    || row.file_name;
  const result = await writeWorkspaceFile(workspaceId, String(requestedPath), row.data);

  return {
    path: path.relative(result.workspaceRoot, result.filePath),
    fileName: path.basename(result.filePath),
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    binary: {
      [binaryProperty]: toBinaryRef(row),
    },
  };
}
