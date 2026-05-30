/**
 * Worker thread for isolated expression evaluation.
 * Receives workerData: { expression, context } and posts back { ok, result } or { ok: false }.
 * Only runs the existing evaluateExpression — never a second code path.
 */
import { workerData, parentPort } from 'worker_threads';
import { resolveValue } from './expressions.js';

try {
  const raw = resolveValue(workerData.expression, workerData.context ?? {});
  let result;
  if (raw === null || raw === undefined) {
    result = '';
  } else if (typeof raw === 'object') {
    result = JSON.stringify(raw).slice(0, 8192);
  } else {
    result = String(raw).slice(0, 8192);
  }
  parentPort.postMessage({ ok: true, result, resolvedType: typeof raw });
} catch {
  parentPort.postMessage({ ok: false, error: 'Expression could not be evaluated' });
}
