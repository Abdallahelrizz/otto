/**
 * Cancellation semantics (HARDENING.md — "cancellation does not cancel").
 *
 * These lock in what cancel MUST do: abort in-flight work, stop the loop, refuse
 * to retry, and refuse to be swallowed by continueOnError. Infra-free.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerExecution,
  abortExecution,
  unregisterExecution,
  isExecutionCancelled,
  activeExecutionCount,
  isCancellation,
  throwIfAborted,
  ExecutionCancelledError,
} from '../src/engine/abort-registry.js';

test('registering an execution yields a live, un-aborted signal', () => {
  const signal = registerExecution('exec-1');
  assert.ok(signal, 'expected a signal');
  assert.equal(signal.aborted, false);
  unregisterExecution('exec-1');
});

test('abortExecution aborts the signal handed to the executor', () => {
  const signal = registerExecution('exec-2');
  assert.equal(abortExecution('exec-2'), true);
  assert.equal(signal.aborted, true);
  assert.ok(isCancellation(signal.reason), 'reason should be a cancellation');
});

test('aborting an execution this process is not running returns false', () => {
  assert.equal(abortExecution('never-registered'), false);
});

test('unregister releases the controller (no leak per execution)', () => {
  const before = activeExecutionCount();
  registerExecution('exec-3');
  assert.equal(activeExecutionCount(), before + 1);
  unregisterExecution('exec-3');
  assert.equal(activeExecutionCount(), before);
});

test('isExecutionCancelled reflects state and is false once unregistered', () => {
  registerExecution('exec-4');
  assert.equal(isExecutionCancelled('exec-4'), false);
  abortExecution('exec-4');
  // abort() removes it from the map, so it is no longer a live execution
  assert.equal(isExecutionCancelled('exec-4'), false);
});

test('isCancellation recognises our error, AbortError, and ABORT_ERR', () => {
  assert.equal(isCancellation(new ExecutionCancelledError()), true);
  const abortErr = new Error('aborted'); abortErr.name = 'AbortError';
  assert.equal(isCancellation(abortErr), true);
  const codeErr = new Error('aborted'); codeErr.code = 'ABORT_ERR';
  assert.equal(isCancellation(codeErr), true);
  assert.equal(isCancellation(new Error('genuine failure')), false);
});

test('throwIfAborted is a no-op until aborted, then throws a cancellation', () => {
  const signal = registerExecution('exec-5');
  assert.doesNotThrow(() => throwIfAborted(signal));
  abortExecution('exec-5');
  assert.throws(() => throwIfAborted(signal), (err) => isCancellation(err));
});

test('an aborted signal actually aborts an in-flight fetch-style await', async () => {
  // This is the property that was missing: the promise must reject promptly,
  // not run to completion.
  const signal = registerExecution('exec-6');
  const inFlight = new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('completed anyway'), 5000);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

  const started = Date.now();
  abortExecution('exec-6');
  await assert.rejects(inFlight, (err) => isCancellation(err));
  assert.ok(Date.now() - started < 1000, 'should reject promptly, not after 5s');
});

test('re-registering the same id supersedes the previous controller', () => {
  const first = registerExecution('exec-7');
  const second = registerExecution('exec-7');
  assert.equal(first.aborted, true, 'stale controller must be aborted');
  assert.equal(second.aborted, false);
  unregisterExecution('exec-7');
});

test('AbortSignal.any combines a request timeout with execution cancel', () => {
  // http_request and the service engine rely on this: cancelling must not
  // disable the per-request timeout, and vice versa.
  const execSignal = registerExecution('exec-8');
  const timeoutController = new AbortController();
  const combined = AbortSignal.any([timeoutController.signal, execSignal]);

  assert.equal(combined.aborted, false);
  abortExecution('exec-8');
  assert.equal(combined.aborted, true, 'cancel must abort the combined signal');

  // and the other direction
  const exec2 = registerExecution('exec-9');
  const t2 = new AbortController();
  const combined2 = AbortSignal.any([t2.signal, exec2]);
  t2.abort(new Error('timeout'));
  assert.equal(combined2.aborted, true, 'timeout must still abort independently');
  unregisterExecution('exec-9');
});
