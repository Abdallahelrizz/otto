// test/safe-fetch-lookup.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import dns from 'dns/promises';
import { pinnedLookup } from '../src/utils/safe-fetch.js';

function withRecords(records, fn) {
  const original = dns.lookup;
  dns.lookup = async () => records;
  return fn().finally(() => { dns.lookup = original; });
}

function lookup(hostname, opts) {
  return new Promise((resolve) => {
    pinnedLookup(hostname, opts, (err, address, family) => resolve({ err, address, family }));
  });
}

const PUBLIC = [
  { address: '2606:4700::6810:84e5', family: 6 },
  { address: '104.16.132.229', family: 4 },
];

test('answers { all: true } with the full record list (Node 20+ autoSelectFamily)', async () => {
  await withRecords(PUBLIC, async () => {
    const { err, address } = await lookup('example.com', { all: true });
    assert.equal(err, null);
    assert.deepEqual(address, PUBLIC);
  });
});

test('answers a single-address lookup with an address and family', async () => {
  await withRecords(PUBLIC, async () => {
    const { err, address, family } = await lookup('example.com', {});
    assert.equal(err, null);
    assert.equal(address, '2606:4700::6810:84e5');
    assert.equal(family, 6);
  });
});

test('honours a requested address family', async () => {
  await withRecords(PUBLIC, async () => {
    const { address, family } = await lookup('example.com', { family: 4 });
    assert.equal(address, '104.16.132.229');
    assert.equal(family, 4);
  });
});

test('rejects a host with any private address, in either answer shape', async () => {
  const mixed = [PUBLIC[1], { address: '169.254.169.254', family: 4 }];
  await withRecords(mixed, async () => {
    for (const opts of [{ all: true }, {}]) {
      const { err } = await lookup('rebind.example', opts);
      assert.equal(err?.code, 'SSRF_BLOCKED');
    }
  });
});

test('rejects a host that resolves to nothing', async () => {
  await withRecords([], async () => {
    const { err } = await lookup('nothing.example', { all: true });
    assert.equal(err?.code, 'SSRF_BLOCKED');
  });
});
