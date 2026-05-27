import { createHmac, timingSafeEqual } from 'crypto';

const ALGOS = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
};

export async function jwtNode({ input, config }) {
  const {
    operation = 'sign',
    secret = '',
    algorithm = 'HS256',
    expiresIn,
  } = config || {};

  if (!ALGOS[algorithm]) throw new Error(`JWT: unsupported algorithm "${algorithm}"`);

  if (operation === 'sign') {
    if (!secret) throw new Error('JWT sign: secret is required');
    let payload = config?.payload ?? input?.payload ?? input ?? {};
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { payload = { value: payload }; }
    }
    const now = Math.floor(Date.now() / 1000);
    const claims = { ...payload, iat: payload.iat ?? now };
    const exp = parseExpiresIn(expiresIn);
    if (exp) claims.exp = now + exp;

    const token = signJwt({ alg: algorithm, typ: 'JWT' }, claims, secret);
    return { token, algorithm, expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null };
  }

  if (operation === 'verify') {
    const token = config?.token ?? input?.token ?? input?.jwt;
    if (!token) throw new Error('JWT verify: token is required');
    if (!secret) throw new Error('JWT verify: secret is required');

    try {
      const decoded = decodeJwt(token);
      const expected = signJwt(decoded.header, decoded.payload, secret).split('.')[2];
      const validSignature = safeEqual(expected, decoded.signature);
      const expired = decoded.payload?.exp ? decoded.payload.exp < Math.floor(Date.now() / 1000) : false;
      return { valid: validSignature && !expired, expired, payload: decoded.payload, header: decoded.header, error: null };
    } catch (err) {
      return { valid: false, expired: false, payload: null, header: null, error: err.message };
    }
  }

  if (operation === 'decode') {
    const token = config?.token ?? input?.token ?? input?.jwt;
    if (!token) throw new Error('JWT decode: token is required');
    const decoded = decodeJwt(token);
    return { payload: decoded.payload, header: decoded.header };
  }

  throw new Error(`JWT: unknown operation "${operation}"`);
}

function signJwt(header, payload, secret) {
  const algorithm = header.alg ?? 'HS256';
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createHmac(ALGOS[algorithm], secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function decodeJwt(token) {
  const [headerRaw, payloadRaw, signature] = String(token).split('.');
  if (!headerRaw || !payloadRaw || !signature) throw new Error('Invalid JWT format');
  const header = JSON.parse(Buffer.from(headerRaw, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadRaw, 'base64url').toString('utf8'));
  if (!ALGOS[header.alg]) throw new Error(`Unsupported JWT algorithm "${header.alg}"`);
  return { header, payload, signature };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseExpiresIn(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const match = String(value).trim().match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}
