import {
  readWorkspaceFile,
  saveBinaryData,
} from '../utils/binary-data.js';

export async function readFileNode({ config, workspaceId }) {
  const filePath = config.path ?? config.filePath;
  const binaryProperty = config.binaryProperty ?? 'data';

  if (!filePath) throw new Error('Read File: path is required');

  const file = await readWorkspaceFile(workspaceId, String(filePath));
  const ref = await saveBinaryData({
    workspaceId,
    fileName: file.fileName,
    mimeType: config.mimeType || file.mimeType,
    buffer: file.buffer,
    metadata: {
      source: 'read_file',
      path: file.path,
    },
  });

  return {
    fileName: ref.fileName,
    mimeType: ref.mimeType,
    sizeBytes: ref.sizeBytes,
    binary: {
      [binaryProperty]: ref,
    },
  };
}
