/**
 * Worker thread for isolated expression evaluation.
 * Receives workerData: { expression, context } and posts back { ok, result } or { ok: false }.
 * Only runs the existing evaluateExpression — never a second code path.
 */
import { workerData, parentPort } from 'node:worker_threads';

// Defense-in-depth: this worker only resolves a user-supplied expression, and it
// never needs any secret. Scrub the sensitive environment before loading the
// evaluator so that even a (now-closed) sandbox escape cannot read them here.
for (const key of [
  'CREDENTIAL_ENCRYPTION_KEY', 'API_KEY_PEPPER', 'DATABASE_URL', 'REDIS_URL',
  'REDIS_PUBLIC_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY',
  'POSTGRES_PASSWORD', 'METRICS_TOKEN',
]) {
  delete process.env[key];
}

const { evaluateExpressionLocal, resolveConfigLocal, resolveValueLocal } = await import('./expressions.js');

if (workerData?.reusable && workerData.port) {
  const port = workerData.port;
  port.postMessage({ id: 0, type: 'ready' });
  port.on('message', (message) => {
    let response;
    try {
      let result;
      if (message.operation === 'resolveConfig') result = resolveConfigLocal(message.config, message.context ?? {});
      else if (message.operation === 'resolveValue') result = resolveValueLocal(message.value, message.context ?? {});
      else if (message.operation === 'evaluateExpression') result = evaluateExpressionLocal(message.expression, message.context ?? {});
      else throw new Error('Unknown expression operation');
      response = { id: message.id, ok: true, result };
    } catch (err) {
      response = { id: message.id, ok: false, error: safeErrorMessage(err) };
    }

    // Reaching the next macrotask proves expression-created microtasks drained.
    // If one spins, the parent reaches its wall timeout and terminates this worker.
    setImmediate(() => port.postMessage(response));
  });
} else {
  try {
    const raw = resolveValueLocal(workerData.expression, workerData.context ?? {});
    let result;
    if (raw === null || raw === undefined) result = '';
    else if (typeof raw === 'object') result = JSON.stringify(raw).slice(0, 8192);
    else result = String(raw).slice(0, 8192);
    parentPort.postMessage({ ok: true, result, resolvedType: typeof raw });
  } catch {
    parentPort.postMessage({ ok: false, error: 'Expression could not be evaluated' });
  }
}

function safeErrorMessage(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const desc = err && typeof err === 'object' ? Object.getOwnPropertyDescriptor(err, 'message') : null;
  return typeof desc?.value === 'string' ? desc.value : 'Expression could not be evaluated';
}
