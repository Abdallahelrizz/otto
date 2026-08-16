import { createCipheriv, randomBytes } from 'crypto';

export function encryptCredential(plainObject) {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) throw new Error('CREDENTIAL_ENCRYPTION_KEY is not set');
  // Invalid hex previously reached crypto with a misleading key-length failure.
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes of hex');

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);

  let encrypted = cipher.update(JSON.stringify(plainObject), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    iv:   iv.toString('hex'),
    tag:  cipher.getAuthTag().toString('hex'),
    data: encrypted,
  };
}
