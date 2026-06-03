// test/services-response-cap.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { assertWithinCap } from '../src/nodes/service-utils.js';

test('assertWithinCap allows responses under the cap', () => {
  assert.doesNotThrow(() => assertWithinCap('500', 1000));
});

test('assertWithinCap throws when content-length exceeds the cap', () => {
  assert.throws(() => assertWithinCap('2000', 1000), /response too large/i);
});

test('assertWithinCap allows missing/unknown content-length (cap enforced later)', () => {
  assert.doesNotThrow(() => assertWithinCap(null, 1000));
  assert.doesNotThrow(() => assertWithinCap('not-a-number', 1000));
});
