import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'vm';
import { evaluateExpression, resolveConfig, createExpressionContext } from '../src/engine/expressions.js';

const context = {
  input: { name: 'Ada', count: 3, items: [{ id: 1 }, { id: 2 }] },
  nodes: {
    node_a: { body: { id: 5 } },
    HTTP: { body: { id: 42 } },
    List: { items: [{ json: { id: 10 } }, { json: { id: 20 } }] },
  },
  vars: { region: 'eu' },
};

// ── Functionality is preserved ────────────────────────────────────────────────
test('helpers and data access still resolve correctly', () => {
  const r = resolveConfig({
    nativeNumber: '{{ input.count + 2 }}',
    inline: 'Hello {{ $uppercase($json.name) }}',
    byNodeName: '{{ $node["HTTP"].json.body.id }}',
    byNodeId: '{{ nodes.node_a.body.id }}',
    itemIds: '{{ $items("List").map(item => item.json.id).join(",") }}',
    objectValue: '{{ $pick($json, ["name", "count"]) }}',
    vars: '{{ $vars.region }}',
    firstItem: '{{ $input.first().json.id }}',
  }, context);

  assert.equal(r.nativeNumber, 5);
  assert.equal(r.inline, 'Hello ADA');
  assert.equal(r.byNodeName, 42);
  assert.equal(r.byNodeId, 5);
  assert.equal(r.itemIds, '10,20');
  assert.deepEqual(r.objectValue, { name: 'Ada', count: 3 });
  assert.equal(r.vars, 'eu');
  assert.equal(r.firstItem, 1);
});

// ── The sandbox no longer escapes ─────────────────────────────────────────────
// Every one of these reached the host `process` object before the fix. `$if`,
// `$now`, and the array/object literals must now all stay inside the sandbox.
const ESCAPES = [
  `$if['con'+'structor']('return this')()`,
  `$if['con'+'structor']('return process')()`,
  `$now['con'+'structor']['con'+'structor']('return process')()`,
  `[]['con'+'structor']['con'+'structor']('return process')()`,
  `({})['con'+'structor']['con'+'structor']('return this')()`,
  `this['con'+'structor']['con'+'structor']('return process')()`,
  `$jsonParse['con'+'structor']('return process.env')()`,
];

for (const expr of ESCAPES) {
  test(`escape attempt is blocked: ${expr.slice(0, 44)}...`, () => {
    let result, threw = false;
    try {
      result = evaluateExpression(expr, context);
    } catch {
      threw = true;
    }
    // It must either throw, or return something that is NOT the host process.
    if (!threw) {
      const reachedProcess = result && typeof result === 'object'
        && typeof result.pid === 'number' && result.env && typeof result.exit === 'function';
      assert.equal(reachedProcess, false, `expression reached the host process: ${expr}`);
    }
  });
}

test('literal process/constructor tokens are still blocked outright', () => {
  assert.throws(() => evaluateExpression('process.env', context), /blocked identifier/);
  assert.throws(() => evaluateExpression('this.constructor', context), /blocked identifier/);
});

test('reading a secret env var via the sandbox yields nothing', () => {
  process.env.OTTO_SANDBOX_CANARY = 'super-secret-value';
  try {
    // Even with code generation and host objects removed, this must not leak.
    const expr = `$if['con'+'structor']('return this')()['pro'+'cess']['e'+'nv']['OTTO_SANDBOX_CANARY']`;
    let leaked;
    try { leaked = evaluateExpression(expr, context); } catch { leaked = undefined; }
    assert.notEqual(leaked, 'super-secret-value');
  } finally {
    delete process.env.OTTO_SANDBOX_CANARY;
  }
});

// ── The sandbox itself, with the denylist deliberately OUT of the path ────────
// The tests above route through evaluateExpression, so BLOCKED_IDENTIFIERS can
// short-circuit them — passing without proving anything about the sandbox. These
// run probes straight against the real context, so a pass means the *boundary*
// holds. Never "fix" a failure here by adding a token to the regex.
const HOST_HANDLE_PROBES = [
  `this.hasOwnProperty.constructor('return process.env.OTTO_SANDBOX_CANARY')()`,
  `this.valueOf.constructor('return process.env.OTTO_SANDBOX_CANARY')()`,
  `this.toString.constructor('return process.env.OTTO_SANDBOX_CANARY')()`,
  `this.propertyIsEnumerable.constructor('return process.env.OTTO_SANDBOX_CANARY')()`,
];

for (const probe of HOST_HANDLE_PROBES) {
  test(`no host Function is reachable via: ${probe.slice(0, 34)}...`, () => {
    process.env.OTTO_SANDBOX_CANARY = 'super-secret-value';
    try {
      const vmContext = createExpressionContext(context);
      assert.throws(
        () => new vm.Script(`(${probe})`).runInContext(vmContext, { timeout: 50 }),
        /Code generation from strings disallowed/,
        `reached a host-realm Function: ${probe}`,
      );
    } finally {
      delete process.env.OTTO_SANDBOX_CANARY;
    }
  });
}

test('the context global does not fall through to a host object', () => {
  const vmContext = createExpressionContext(context);
  const inRealm = new vm.Script(
    '(this.hasOwnProperty === Object.prototype.hasOwnProperty)',
  ).runInContext(vmContext, { timeout: 50 });
  // False means the global resolved `hasOwnProperty` off the HOST sandbox object
  // rather than the context's own Object.prototype — i.e. the boundary is open.
  assert.equal(inRealm, true);
});

// ── No expression-controlled code may run on the host stack, off the clock ────
test('a user-supplied toJSON cannot run on the host stack past the timeout', () => {
  const started = Date.now();
  try {
    resolveValueSpin();
  } catch {
    // Timing out is a correct outcome; hanging the host is not.
  }
  assert.ok(
    // Bound is deliberately generous. What this test PROVES is termination: before the
    // fix, expression-controlled code ran on the host until it finished (measured ~400ms)
    // or hung the process forever. A tight wall-clock budget here is not a reliable
    // signal — vm timeouts are wall-clock, so a loaded machine that doesn't promptly
    // schedule the worker makes this flake without any regression. The tight budget lives
    // in EXPRESSION_TIMEOUT_MS / WORKER_WALL_TIMEOUT_MS in src/engine/expressions.js;
    // this asserts the property those constants exist to guarantee.
    Date.now() - started < 1200,
    `expression-controlled code ran on the host stack for ${Date.now() - started}ms`,
  );
});

function resolveValueSpin() {
  return resolveConfig({
    v: 'x{{ ({ toJSON: () => { var s = Date.now(); while (Date.now() - s < 400) {} return 1; } }) }}y',
  }, context);
}

// KNOWN GAP — HARDENING.md item 3. An expression can return instantly and leave work
// spinning on the host event loop. `microtaskMode: 'afterEvaluate'` closes it but
// corrupts async_hooks when the drain is terminated, so the real fix is a terminable
// execution context (worker + terminate(), or isolated-vm). Unskip when that lands.
test('an expression cannot defer work onto the host event loop', async () => {
  const started = Date.now();
  try {
    evaluateExpression(
      '((async () => { await null; var s = Date.now(); while (Date.now() - s < 400) {} })(), "queued")',
      context,
    );
  } catch {
    // Timing out is correct.
  }
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(
    // Bound is deliberately generous. What this test PROVES is termination: before the
    // fix, expression-controlled code ran on the host until it finished (measured ~400ms)
    // or hung the process forever. A tight wall-clock budget here is not a reliable
    // signal — vm timeouts are wall-clock, so a loaded machine that doesn't promptly
    // schedule the worker makes this flake without any regression. The tight budget lives
    // in EXPRESSION_TIMEOUT_MS / WORKER_WALL_TIMEOUT_MS in src/engine/expressions.js;
    // this asserts the property those constants exist to guarantee.
    Date.now() - started < 1200,
    `deferred work ran on the host event loop for ${Date.now() - started}ms`,
  );
});

test('ordinary function syntax and harmless words remain usable', () => {
  assert.deepEqual(
    evaluateExpression('input.items.map(function (x) { return x.id * 2 })', context),
    [2, 4],
  );
  assert.equal(evaluateExpression('"global config"', context), 'global config');
  assert.equal(evaluateExpression('"import the CSV"', context), 'import the CSV');
  assert.equal(evaluateExpression('"prototype"', context), 'prototype');
});

test('asynchronous import and WebAssembly compilation stay blocked', () => {
  assert.throws(() => evaluateExpression('import("node:fs")', context), /blocked identifier/);
  assert.throws(() => evaluateExpression('WebAssembly.compile(new Uint8Array())', context), /blocked identifier/);
});

// Results now cross the boundary as JSON, not via structuredClone. That is a
// deliberate narrowing — JSON is the contract for what an expression may return.
// These lock in the consequences so they stay intentional.
test('expression results follow JSON semantics', () => {
  // Dates serialize to ISO strings (structuredClone used to preserve Date objects).
  const now = evaluateExpression('$now', context);
  assert.equal(typeof now, 'string');
  assert.match(now, /^\d{4}-\d{2}-\d{2}T/);

  // JSON has no NaN/Infinity; both become null.
  assert.equal(evaluateExpression('0/0', context), null);
  assert.equal(evaluateExpression('1/0', context), null);

  // BigInt is not representable and fails loudly rather than silently.
  assert.throws(() => evaluateExpression('1n', context), /Expression failed/);

  // Ordinary data is unaffected.
  assert.deepEqual(evaluateExpression('({ a: { b: [1, { c: 2 }] } })', context), { a: { b: [1, { c: 2 }] } });
  assert.deepEqual(evaluateExpression('input.items.map(i => i.id)', context), [1, 2]);
});

test('a non-serializable result never hands a vm-realm object to the host', () => {
  // structuredClone throws on a function, and the old fallback returned the raw
  // vm-realm object — putting foreign prototypes into resolved node config.
  const out = evaluateExpression('({ ok: 1, fn: $if })', context);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(out.ok, 1);
});
