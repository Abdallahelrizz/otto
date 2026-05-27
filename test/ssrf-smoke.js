import assert from 'assert/strict';
import { safeFetch, SsrfBlockedError } from '../src/utils/safe-fetch.js';

async function test(description, fn) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
  } catch (err) {
    console.error(`  ✗ ${description}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function expectBlocked(url) {
  try {
    await safeFetch(url);
    throw new Error(`Expected SSRF block for ${url} but request succeeded`);
  } catch (err) {
    if (!(err instanceof SsrfBlockedError)) throw new Error(`Expected SsrfBlockedError but got ${err.name}: ${err.message}`);
  }
}

console.log('\nSSRF smoke tests');

// Direct IP blocks
await test('blocks localhost IPv4 (127.0.0.1)', () => expectBlocked('http://127.0.0.1/'));
await test('blocks loopback range (127.1.2.3)', () => expectBlocked('http://127.1.2.3/'));
await test('blocks cloud metadata (169.254.169.254)', () => expectBlocked('http://169.254.169.254/'));
await test('blocks RFC1918 10.x', () => expectBlocked('http://10.0.0.1/'));
await test('blocks RFC1918 172.16.x', () => expectBlocked('http://172.16.0.1/'));
await test('blocks RFC1918 192.168.x', () => expectBlocked('http://192.168.1.1/'));
await test('blocks IPv6 loopback (::1)', () => expectBlocked('http://[::1]/'));
await test('blocks IPv6 link-local (fe80::1)', () => expectBlocked('http://[fe80::1]/'));
await test('blocks invalid URL', () => expectBlocked('not-a-url'));

// SSRF_ALLOW_PRIVATE bypass
await test('SSRF_ALLOW_PRIVATE=true bypasses loopback block', async () => {
  process.env.SSRF_ALLOW_PRIVATE = 'true';
  try {
    // This will fail at network level (connection refused), not with SsrfBlockedError
    await safeFetch('http://127.0.0.1:1/').catch((err) => {
      if (err instanceof SsrfBlockedError) throw new Error('Should not have been SSRF-blocked with SSRF_ALLOW_PRIVATE=true');
    });
  } finally {
    delete process.env.SSRF_ALLOW_PRIVATE;
  }
});

console.log('\nDone.\n');
