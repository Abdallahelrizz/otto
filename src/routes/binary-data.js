import { deleteBinaryData, getBinaryData, toBinaryRef } from '../utils/binary-data.js';

export async function binaryDataRoutes(fastify) {
  fastify.get('/api/v1/binary/:id', async (req, reply) => {
    const row = await getBinaryData(req.auth.workspaceId, req.params.id);
    if (!row) return reply.code(404).send({ error: 'Binary data not found' });
    return reply.send({ binary: toBinaryRef(row) });
  });

  fastify.get('/api/v1/binary/:id/download', async (req, reply) => {
    const row = await getBinaryData(req.auth.workspaceId, req.params.id);
    if (!row) return reply.code(404).send({ error: 'Binary data not found' });

    reply.header('Content-Type', row.mime_type);
    reply.header('Content-Length', String(row.size_bytes));
    reply.header('Content-Disposition', `attachment; filename="${safeDownloadName(row.file_name)}"`);
    return reply.send(row.data);
  });

  fastify.delete('/api/v1/binary/:id', async (req, reply) => {
    const deleted = await deleteBinaryData(req.auth.workspaceId, req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'Binary data not found' });
    return reply.send({ ok: true });
  });
}

function safeDownloadName(fileName) {
  return String(fileName ?? 'download.bin').replace(/["\r\n]/g, '_');
}
