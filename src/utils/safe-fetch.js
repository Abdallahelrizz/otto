import dns from 'dns/promises';
import net from 'net';
import { stripAuthAcrossHost } from './redirect-auth.js';

// IPv4 blocked ranges as [network_int, prefix_bits]
const BLOCKED_CIDRS_V4 = [
  [0x7f000000, 8],   // 127.0.0.0/8   loopback
  [0x0a000000, 8],   // 10.0.0.0/8    RFC1918
  [0xac100000, 12],  // 172.16.0.0/12 RFC1918
  [0xc0a80000, 16],  // 192.168.0.0/16 RFC1918
  [0xa9fe0000, 16],  // 169.254.0.0/16 link-local / cloud metadata (AWS/GCP/Azure IMDS)
  [0x00000000, 8],   // 0.0.0.0/8
  [0x64400000, 10],  // 100.64.0.0/10  shared address space (RFC6598, common in cloud NAT)
];

export class SsrfBlockedError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'SsrfBlockedError';
    this.code = 'SSRF_BLOCKED';
  }
}

function ipv4ToUint32(ip) {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) | parseInt(octet, 10)) >>> 0, 0);
}

function isBlockedIPv4(ip) {
  const val = ipv4ToUint32(ip);
  return BLOCKED_CIDRS_V4.some(([network, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (val & mask) === (network & mask);
  });
}

function isBlockedIPv6(ip) {
  const norm = ip.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const v4mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isBlockedIPv4(v4mapped[1]);

  return (
    norm === '::1' ||                                          // loopback
    /^fc[0-9a-f]{2}:/i.test(norm) ||                          // unique local fc00::/7
    /^fd[0-9a-f]{2}:/i.test(norm) ||                          // unique local fd00::/8
    /^fe[89ab][0-9a-f]:/i.test(norm)                          // link-local fe80::/10
  );
}

function isBlockedIP(ip) {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return false;
}

async function resolveAndCheck(hostname) {
  let address;
  try {
    ({ address } = await dns.lookup(hostname, { family: 4 }));
  } catch {
    ({ address } = await dns.lookup(hostname, { family: 6 }));
  }
  if (isBlockedIP(address)) {
    throw new SsrfBlockedError(`Blocked: ${hostname} resolves to a private/reserved address`);
  }
}

/**
 * Assert a connection target (e.g. a postgres:// or redis:// URL, or a bare
 * hostname) does not point at a private/reserved address. Throws SsrfBlockedError.
 * No-op when SSRF_ALLOW_PRIVATE=true. Used to guard credential-supplied DB/cache hosts.
 */
export async function assertSafeConnectionTarget(target) {
  if (process.env.SSRF_ALLOW_PRIVATE === 'true') return;
  if (!target) return;

  let hostname = String(target);
  // If it looks like a URL, extract the hostname
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(hostname)) {
    try {
      hostname = new URL(hostname).hostname;
    } catch {
      throw new SsrfBlockedError('Invalid connection URL');
    }
  } else if (hostname.includes('@')) {
    // user:pass@host:port form without scheme
    hostname = hostname.split('@').pop().split(':')[0].split('/')[0];
  } else {
    hostname = hostname.split(':')[0].split('/')[0];
  }

  if (!hostname) return;
  if (net.isIP(hostname)) {
    if (isBlockedIP(hostname)) {
      throw new SsrfBlockedError(`Blocked: ${hostname} is a private/reserved address`);
    }
  } else {
    await resolveAndCheck(hostname);
  }
}

/**
 * Fetch wrapper that prevents SSRF by resolving the hostname and checking
 * it against private/reserved IP ranges before making the request.
 * Follows redirects safely (each hop is checked).
 *
 * Set SSRF_ALLOW_PRIVATE=true to disable checks (self-hosted internal workflows).
 */
export async function safeFetch(url, options = {}) {
  if (process.env.SSRF_ALLOW_PRIVATE === 'true') {
    return fetch(url, options);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SsrfBlockedError(`SSRF: invalid URL: ${url}`);
  }

  const { hostname } = parsedUrl;

  if (net.isIP(hostname)) {
    if (isBlockedIP(hostname)) {
      throw new SsrfBlockedError(`Blocked: ${hostname} is a private/reserved address`);
    }
  } else {
    await resolveAndCheck(hostname);
  }

  const resp = await fetch(url, { ...options, redirect: 'manual' });

  // Follow redirects safely — each hop re-checks the IP, and auth headers are
  // stripped when the hop crosses to a different host.
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get('location');
    if (location) {
      const nextUrl = new URL(location, url).toString();
      return safeFetch(nextUrl, stripAuthAcrossHost(options, url, nextUrl));
    }
  }

  return resp;
}
