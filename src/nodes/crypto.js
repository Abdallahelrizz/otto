/**
 * Crypto node — hashing, HMAC, encoding.
 * Config: operation (md5|sha1|sha256|sha512|hmac-sha256|hmac-sha512|base64-encode|base64-decode|uuid|random-bytes)
 *         value   — input string to hash/encode
 *         secret  — HMAC secret
 *         encoding — output encoding: hex|base64 (default hex)
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';

export async function cryptoNode({ input, config }) {
  const {
    operation = 'sha256',
    secret    = '',
    encoding  = 'hex',
  } = config || {};

  const value = config?.value ?? input?.value ?? input?.text ?? input?.data ?? '';
  const str   = typeof value === 'string' ? value : JSON.stringify(value);

  switch (operation) {
    case 'md5':
    case 'sha1':
    case 'sha256':
    case 'sha512': {
      const hash = createHash(operation).update(str).digest(encoding === 'base64' ? 'base64' : 'hex');
      return { result: hash, operation };
    }

    case 'hmac-sha256':
    case 'hmac-sha512': {
      if (!secret) throw new Error('Crypto: HMAC requires a secret');
      const algo  = operation === 'hmac-sha256' ? 'sha256' : 'sha512';
      const hmac  = createHmac(algo, secret).update(str).digest(encoding === 'base64' ? 'base64' : 'hex');
      return { result: hmac, operation };
    }

    case 'base64-encode': {
      const encoded = Buffer.from(str, 'utf8').toString('base64');
      return { result: encoded, operation };
    }

    case 'base64-decode': {
      const decoded = Buffer.from(str, 'base64').toString('utf8');
      return { result: decoded, operation };
    }

    case 'uuid': {
      return { result: randomUUID(), operation };
    }

    case 'random-bytes': {
      const length = Number(config?.length || 16);
      const bytes  = randomBytes(length);
      const result = encoding === 'base64' ? bytes.toString('base64') : bytes.toString('hex');
      return { result, operation };
    }

    default:
      throw new Error(`Crypto: unknown operation "${operation}"`);
  }
}
