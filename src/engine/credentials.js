import { createDecipheriv } from 'crypto';
import { db } from '../db/client.js';

function decrypt(encryptedData) {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) throw new Error('CREDENTIAL_ENCRYPTION_KEY is not set');

  const { iv, tag, data } = encryptedData;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

export async function getCredential(credentialId, { workflowId, nodeId } = {}) {
  const { rows } = await db.query(
    'SELECT id, name, type, data FROM credentials WHERE id = $1',
    [credentialId]
  );
  if (!rows.length) throw new Error(`Credential ${credentialId} not found`);
  const cred = rows[0];

  // Fire-and-forget access log (non-blocking, non-fatal)
  db.query(
    `INSERT INTO credentials_access_log (credential_id, workflow_id, node_id)
     VALUES ($1, $2, $3)`,
    [credentialId, workflowId ?? null, nodeId ?? null]
  ).catch(() => {});

  return { id: cred.id, name: cred.name, type: cred.type, data: decrypt(cred.data) };
}
