import vm from 'vm';
import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';
import { normalizeItems, toJson } from '../utils/items.js';

const FULL_EXPRESSION_RE = /^=?\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const INLINE_EXPRESSION_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;

// Dangerous identifiers (match anywhere — bracket/dot access alike). This blocklist is
// now DEFENSE-IN-DEPTH only, not the security boundary: see createExpressionContext.
const BLOCKED_IDENTIFIERS = /constructor|__proto__|prototype|globalThis|process|require|\bmodule\b|\bimport\s*\(|\bexports\b|\beval\b|\bFunction\b|child_process|Reflect|Proxy|WebAssembly|queueMicrotask|setImmediate|Atomics|SharedArrayBuffer/;
// Obfuscation primitives used to build the names above at runtime.
const BLOCKED_OBFUSCATION = /fromCharCode|fromCodePoint|\batob\b|\bunescape\b|\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F{]/;
// `vm.Script`'s timeout is WALL-CLOCK, not CPU time. At 50ms, a trivial expression
// (literally `"prototype"`) intermittently died with "Script execution timed out"
// whenever the worker thread wasn't promptly scheduled — reproduced as a test failing
// ~2 runs in 3 under load. In production that means VALID expressions randomly failing.
//
// This inner timeout is no longer the security boundary: the terminable worker below is,
// because it is the only thing that can kill an expression spinning in a microtask, which
// no vm timeout can touch. So the inner limit can afford headroom for scheduling jitter
// while the outer wall-clock terminate keeps the real bound. Keep OUTER > INNER with
// enough margin that the inner fires first for ordinary synchronous runaways.
// Budget is capped by the sandbox tests, which assert the WHOLE operation (inner script
// timeout + worker round trip) finishes well under 250ms — that bound is the guarantee
// that expression-controlled code cannot occupy the host. So these cannot simply be
// raised; INNER + overhead must stay comfortably below 250ms.
// These bound two DIFFERENT things and must not be tuned as a pair:
//   EXPRESSION_TIMEOUT_MS bounds ONE expression's synchronous execution inside the vm.
//   WORKER_WALL_TIMEOUT_MS bounds the WHOLE node-config batch round trip, and its expiry
//   terminates the worker — the only thing that can kill a microtask spin.
// So the outer must comfortably exceed inner × (expressions per config) + worker cold
// start (~50ms), or configs with several expressions time out spuriously under load.
// 50/150 was too tight on both counts and produced real false positives on valid input.
const EXPRESSION_TIMEOUT_MS = 120;
const WORKER_WALL_TIMEOUT_MS = 800;
const WORKER_START_TIMEOUT_MS = 2_000;

let evaluator = null;
let nextRequestId = 1;

function startEvaluator() {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL('./expression-worker.js', import.meta.url), {
    workerData: { port: port2, reusable: true },
    transferList: [port2],
    // Do NOT inherit process.execArgv. Node rejects many perfectly ordinary parent
    // flags when they are passed to a Worker (--tls-cipher-list, --secure-heap,
    // --stack-trace-limit, --v8-pool-size, --node-snapshot, the test runner's own
    // flags…), and the failure mode is ERR_WORKER_INVALID_EXEC_ARGV at spawn time —
    // i.e. every expression in the workflow dies. The evaluator needs none of them.
    // Same reasoning as src/routes/expressions.js.
    execArgv: [],
  });
  worker.unref();
  port1.unref();
  const state = { worker, port: port1 };
  const ready = waitForMessage(state, 0, WORKER_START_TIMEOUT_MS);
  if (ready.type !== 'ready') {
    void worker.terminate(); port1.close();
    throw new Error('Expression worker failed to start');
  }
  evaluator = state;
  return state;
}

function discardEvaluator(state) {
  if (evaluator === state) evaluator = null;
  state.port.close();
  void state.worker.terminate();
}

function waitForMessage(state, id, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (performance.now() < deadline) {
    const received = receiveMessageOnPort(state.port);
    if (received?.message && (received.message.id === id || received.message.type === 'ready')) return received.message;
    Atomics.wait(sleeper, 0, 0, Math.min(2, Math.max(0, deadline - performance.now())));
  }
  throw new Error('Expression evaluation timed out');
}

function runInEvaluator(operation, payload) {
  const state = evaluator ?? startEvaluator();
  const id = nextRequestId++;
  state.port.postMessage({ id, operation, ...payload });
  let message;
  try {
    message = waitForMessage(state, id, WORKER_WALL_TIMEOUT_MS);
  } catch (err) {
    discardEvaluator(state);
    throw err;
  }
  if (!message.ok) throw new Error(message.error);
  return message.result;
}

// ── Non-blocking evaluator (the production path) ────────────────────────────
//
// The sync evaluator above parks the MAIN THREAD in `Atomics.wait` until the
// worker replies. That is correct but it blocks the entire event loop for the
// duration — measured ~12ms per node config, ~10ms mean loop lag. In a server
// whose whole thesis is running independent branches concurrently, that would
// serialize every "parallel" node behind one another and stall SSE, health
// checks, and every other in-flight request.
//
// So the executor uses this async evaluator instead: same worker protocol, same
// terminate-on-timeout guarantee (which is what actually closes the item-3 DoS),
// but the wait is a normal `await` and the loop stays free.
//
// This is a SEPARATE MessageChannel on purpose. Attaching a 'message' listener
// puts a port into flowing mode, after which `receiveMessageOnPort` (used by the
// sync path) would never see anything again. Two ports keeps both paths working.
let asyncEvaluator = null;

function startAsyncEvaluator() {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL('./expression-worker.js', import.meta.url), {
    workerData: { port: port2, reusable: true },
    transferList: [port2],
    execArgv: process.execArgv.filter((arg) => !arg.startsWith('--input-type')),
  });
  worker.unref();
  const state = { worker, port: port1, pending: new Map(), ready: false, onReady: null };

  port1.on('message', (msg) => {
    if (msg?.type === 'ready') {
      state.ready = true;
      state.onReady?.();
      return;
    }
    const entry = state.pending.get(msg?.id);
    if (!entry) return;
    state.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (state.pending.size === 0) state.port.unref();
    entry.resolve(msg);
  });

  // NOTE: the port stays ref'd until the worker reports ready. Everything else
  // here (worker, port, timers) is unref'd, so unref'ing it before `ready` lands
  // leaves the loop with no live handles and Node exits with the startup promise
  // still pending — an immediate hang.
  state.readyPromise = new Promise((resolve, reject) => {
    const settle = () => {
      if (state.pending.size === 0) state.port.unref();
      resolve();
    };
    if (state.ready) return settle();
    state.onReady = settle;
    const t = setTimeout(() => {
      if (!state.ready) reject(new Error('Expression worker failed to start'));
    }, WORKER_START_TIMEOUT_MS);
    t.unref?.();
  });

  asyncEvaluator = state;
  return state;
}

function discardAsyncEvaluator(state, err) {
  if (asyncEvaluator === state) asyncEvaluator = null;
  for (const [, entry] of state.pending) {
    clearTimeout(entry.timer);
    entry.reject(err ?? new Error('Expression evaluation timed out'));
  }
  state.pending.clear();
  try { state.port.close(); } catch { /* already closed */ }
  void state.worker.terminate();
}

async function runInEvaluatorAsync(operation, payload) {
  const state = asyncEvaluator ?? startAsyncEvaluator();
  await state.readyPromise;

  const id = nextRequestId++;
  const message = await new Promise((resolve, reject) => {
    // Wall-clock deadline. On expiry we TERMINATE the worker — that is the part
    // that actually kills an expression spinning in a microtask, which no vm
    // timeout can do. The next call transparently starts a fresh worker.
    const timer = setTimeout(() => {
      state.pending.delete(id);
      discardAsyncEvaluator(state, new Error('Expression evaluation timed out'));
      reject(new Error('Expression evaluation timed out'));
    }, WORKER_WALL_TIMEOUT_MS);

    state.pending.set(id, { resolve, reject, timer });
    state.port.ref(); // keep the loop alive only while a request is outstanding
    state.port.postMessage({ id, operation, ...payload });
  });

  if (!message.ok) throw new Error(message.error);
  return message.result;
}

/**
 * Async counterpart of `resolveConfig` — used by the executor hot path so that
 * resolving a node's expressions never blocks the event loop. Falls back to the
 * fully in-process path when the config contains no `{{ }}` at all.
 */
export async function resolveConfigAsync(config, context = {}) {
  if (containsExpression(config)) return runInEvaluatorAsync('resolveConfig', { config, context });
  return resolveConfigLocal(config, context);
}

function containsExpression(value) {
  if (typeof value === 'string') return value.includes('{{');
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => key !== '_ottoImport' && containsExpression(child));
}

export function resolveValue(value, context = {}) {
  if (typeof value === 'string' && value.includes('{{')) return runInEvaluator('resolveValue', { value, context });
  return resolveValueLocal(value, context);
}

export function resolveValueLocal(value, context = {}, vmContext = null) {
  if (typeof value !== 'string') return value;

  const fullMatch = value.match(FULL_EXPRESSION_RE);
  if (fullMatch) {
    const resolved = evaluateExpressionLocal(fullMatch[1], context, vmContext);
    return resolved === undefined ? '' : resolved;
  }

  return value.replace(INLINE_EXPRESSION_RE, (_, expression) => {
    const resolved = evaluateExpressionLocal(expression, context, vmContext);
    if (resolved === undefined || resolved === null) return '';
    if (typeof resolved === 'object') return JSON.stringify(resolved);
    return String(resolved);
  });
}

export function resolveConfig(config, context = {}) {
  if (containsExpression(config)) return runInEvaluator('resolveConfig', { config, context });
  return resolveConfigLocal(config, context);
}

export function resolveConfigLocal(config, context = {}, existingContext = null) {
  if (!config || typeof config !== 'object') return config;
  const vmContext = existingContext ?? (containsExpression(config) ? createExpressionContext(context) : null);
  if (Array.isArray(config)) {
    return config.map((value) => (
      value && typeof value === 'object' ? resolveConfigLocal(value, context, vmContext) : resolveValueLocal(value, context, vmContext)
    ));
  }

  const out = {};
  for (const [key, val] of Object.entries(config)) {
    if (key === '_ottoImport') {
      out[key] = val;
    } else if (typeof val === 'object' && val !== null) {
      out[key] = resolveConfigLocal(val, context, vmContext);
    } else {
      out[key] = resolveValueLocal(val, context, vmContext);
    }
  }
  return out;
}

export function evaluateExpression(rawExpression, context = {}) {
  return runInEvaluator('evaluateExpression', { expression: rawExpression, context });
}

export function evaluateExpressionLocal(rawExpression, context = {}, existingContext = null) {
  const expression = String(rawExpression ?? '').trim();
  if (!expression) return '';
  assertSafeExpression(expression);

  const vmContext = existingContext ?? createExpressionContext(context);

  try {
    // Serialize INSIDE the context, under the timeout. Two reasons, both load-bearing:
    //   1. No vm-realm object is ever handed back to the host, so a foreign prototype
    //      can't end up in resolved node config.
    //   2. Every expression-controlled callback JSON.stringify might invoke (toJSON,
    //      a getter, Symbol.toPrimitive) runs inside the timed context. Serializing on
    //      the host instead lets those run on the host stack with no timeout at all,
    //      which is an unauthenticated event-loop hang.
    // Only a primitive string crosses the boundary.
    const script = new vm.Script(`JSON.stringify({ v: (${expression}) })`, {
      filename: 'otto-expression.vm',
      displayErrors: true,
    });
    const json = script.runInContext(vmContext, { timeout: EXPRESSION_TIMEOUT_MS });
    return typeof json === 'string' ? JSON.parse(json).v : undefined;
  } catch (err) {
    throw new Error(`Expression failed "${expression}": ${errorMessage(err)}`);
  }
}

// Read `message` without triggering an accessor. A thrown vm-realm object can carry a
// `message` getter, which would otherwise run expression code on the host stack, untimed.
function errorMessage(err) {
  if (err instanceof Error) return err.message; // host-realm error — safe to read
  if (typeof err === 'string') return err;
  const desc = err && typeof err === 'object'
    ? Object.getOwnPropertyDescriptor(err, 'message')
    : null;
  return typeof desc?.value === 'string' ? desc.value : 'evaluation failed';
}

function assertSafeExpression(expression) {
  // Ignore ordinary words inside quoted data while still inspecting executable code.
  // Escape sequences remain checked against the original source below.
  const executable = expression.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '');
  if (BLOCKED_IDENTIFIERS.test(executable) || BLOCKED_OBFUSCATION.test(expression)) {
    throw new Error('Expression contains a blocked identifier');
  }
}

// Break only TRUE cycles (a node that is its own ancestor), preserving shared
// sibling references — the expression payload deliberately points `json`, `item`,
// and `items[0]` at the same objects, and a naive "seen" set would drop them.
function decycle(value, ancestors) {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return undefined; // real cycle
  ancestors.add(value);
  let out;
  if (Array.isArray(value)) {
    out = value.map((v) => decycle(v, ancestors));
  } else {
    out = {};
    for (const key of Object.keys(value)) {
      const cloned = decycle(value[key], ancestors);
      if (cloned !== undefined) out[key] = cloned;
    }
  }
  ancestors.delete(value); // leaving this branch — a shared ref elsewhere is not a cycle
  return out;
}

// Cycle-safe stringify: never throws on a weird node output.
function safeStringify(value) {
  return JSON.stringify(decycle(value, new Set())) ?? 'null';
}

/**
 * Build the vm context an expression runs in.
 *
 * SECURITY: Node's `vm` is not a sandbox by itself — an expression that gets a
 * reference to ANY host-realm object can walk `.constructor.constructor` back to
 * the host `Function` and run arbitrary code in this process. We close that with
 * two independent defenses:
 *
 *   1. No host objects enter the context. Every value the expression can touch
 *      (input, node outputs, vars, helpers, $now) is rebuilt INSIDE the context
 *      by the bootstrap script below — so every constructor chain stays sandboxed.
 *      The only thing handed in is a JSON *string* (a primitive), and it is
 *      deleted right after the bootstrap parses it.
 *   2. Code generation is disabled for the context (`codeGeneration.strings/wasm`
 *      = false), so even if a reference leaked, `Function(...)`/`eval(...)` throw.
 *
 * The regex blocklist in assertSafeExpression is a third, non-load-bearing layer.
 * For hard multi-tenant isolation you can still layer `isolated-vm` on top.
 */
export function createExpressionContext(context) {
  const input = context.input ?? {};
  const inputItems = normalizeItems(input);
  const nodeOutputsRaw = context.nodes ?? {};

  // Precompute serializable node-output wrappers (plain data only — no functions).
  const nodeData = {};
  for (const [name, value] of Object.entries(nodeOutputsRaw)) {
    const items = normalizeItems(value);
    nodeData[name] = {
      json: items[0]?.json ?? {},
      binary: items[0]?.binary ?? {},
      item: items[0] ?? { json: {}, binary: {} },
      items,
      data: value,
    };
  }

  const payload = safeStringify({
    input,
    nodes: nodeOutputsRaw,
    vars: context.vars ?? {},
    json: toJson(input),
    binary: input?.binary ?? inputItems[0]?.binary ?? {},
    inputItems,
    nodeData,
  });

  // The sandbox object is the context global's fall-through target: any property the
  // expression looks up and doesn't find is resolved against THIS object. A plain `{}`
  // inherits the HOST realm's Object.prototype, which puts host intrinsics
  // (`this.hasOwnProperty`, `this.valueOf`, …) one lookup away — and each of those is a
  // host function whose `.constructor` is the host `Function`. `codeGeneration` binds
  // the vm context, not the host realm, so that host `Function` still compiles.
  // A null prototype removes the entire class of handle.
  // NB: doing this from inside the context (`Object.setPrototypeOf(this, null)`) does
  // NOT work — it retargets the global proxy, not this object.
  const sandbox = Object.create(null);
  sandbox.__otto_payload__ = payload;
  const vmContext = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    // NOT setting `microtaskMode: 'afterEvaluate'` — deliberately. It does drain
    // microtasks inside the timeout and closes the deferred-work DoS, but when the
    // drain hits the timeout it terminates a microtask queue mid-flight, which
    // corrupts the async_hooks stack for any consumer in the process (reproduced:
    // it takes down a whole `node --test` file). An attacker can trigger that path
    // on demand, and OTel/APM instrumentation uses the same mechanism. The correct
    // fix is a terminable execution context, not a context flag —
    // see HARDENING.md item 3.
  });
  vm.runInContext(BOOTSTRAP, vmContext, {
    filename: 'otto-bootstrap.vm',
    timeout: EXPRESSION_TIMEOUT_MS,
  });
  return vmContext;
}

// Runs ONCE per context, inside the sandbox. Parses the JSON payload into
// context-native objects and installs every global/helper as context-native
// values. `this` is the context's global object.
const BOOTSTRAP = `
(function () {
  var __g = this;
  var __d = JSON.parse(__g.__otto_payload__);
  delete __g.__otto_payload__;

  var input = __d.input;
  var inputItems = __d.inputItems;
  var nodeData = __d.nodeData;

  function wrapNode(nd) {
    return {
      json: nd.json,
      binary: nd.binary,
      item: nd.item,
      items: nd.items,
      data: nd.data,
      all: function () { return nd.items; },
      first: function () { return nd.items.length ? nd.items[0] : null; },
      last: function () { return nd.items.length ? nd.items[nd.items.length - 1] : null; },
    };
  }

  var nodeProxy = {};
  for (var k in nodeData) {
    if (Object.prototype.hasOwnProperty.call(nodeData, k)) nodeProxy[k] = wrapNode(nodeData[k]);
  }

  function startOfToday() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function splitKeys(keys) {
    if (Array.isArray(keys)) return keys;
    return String(keys == null ? '' : keys).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function pick(value, keys) {
    var s = value == null ? {} : value; var w = splitKeys(keys); var o = {};
    for (var i = 0; i < w.length; i++) { if (w[i] in s) o[w[i]] = s[w[i]]; }
    return o;
  }
  function omit(value, keys) {
    var blocked = splitKeys(keys); var s = value == null ? {} : value; var o = {};
    for (var key in s) { if (Object.prototype.hasOwnProperty.call(s, key) && blocked.indexOf(key) === -1) o[key] = s[key]; }
    return o;
  }

  __g.input = input;
  __g.nodes = __d.nodes;
  __g.$json = __d.json;
  __g.$binary = __d.binary;
  __g.$input = {
    item: inputItems.length ? inputItems[0] : { json: {}, binary: {} },
    all: function () { return inputItems; },
    first: function () { return inputItems.length ? inputItems[0] : null; },
    last: function () { return inputItems.length ? inputItems[inputItems.length - 1] : null; },
  };
  __g.$items = function (name) {
    if (!name) return inputItems;
    var nd = nodeData[name];
    return nd ? nd.items : [];
  };
  __g.$node = nodeProxy;
  __g.$nodes = nodeProxy;
  __g.$vars = __d.vars;
  __g.$now = new Date();
  __g.$today = startOfToday();
  __g.$if = function (c, a, b) { return c ? a : b; };
  __g.$jsonParse = function (v) { return JSON.parse(String(v)); };
  __g.$jsonStringify = function (v) { return JSON.stringify(v); };
  __g.$length = function (v) {
    if (v == null) return 0;
    if (Array.isArray(v) || typeof v === 'string') return v.length;
    return Object.keys(v).length;
  };
  __g.$keys = function (v) { return Object.keys(v == null ? {} : v); };
  __g.$values = function (v) { return Object.values(v == null ? {} : v); };
  __g.$contains = function (v, s) {
    if (Array.isArray(v)) return v.indexOf(s) !== -1;
    return String(v == null ? '' : v).indexOf(String(s)) !== -1;
  };
  __g.$pick = pick;
  __g.$omit = omit;
  __g.$lowercase = function (v) { return String(v == null ? '' : v).toLowerCase(); };
  __g.$uppercase = function (v) { return String(v == null ? '' : v).toUpperCase(); };
  __g.$trim = function (v) { return String(v == null ? '' : v).trim(); };
  __g.$number = function (v) { return Number(v); };
  __g.$string = function (v) { return String(v == null ? '' : v); };
  __g.$boolean = function (v) { return Boolean(v); };
}).call(this);
`;
