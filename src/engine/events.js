import { EventEmitter } from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(500); // supports many concurrent executions + subscribers

/**
 * Emit an event for a specific execution.
 * type: 'execution:start' | 'execution:end' | 'node:start' | 'node:end' | 'node:skipped' | 'node:token'
 */
export function emitExecutionEvent(executionId, type, data) {
  bus.emit(`exec:${executionId}`, { type, data, ts: Date.now() });

  // Auto-cleanup listeners 10s after execution ends (allows SSE to flush)
  if (type === 'execution:end') {
    setTimeout(() => bus.removeAllListeners(`exec:${executionId}`), 10_000);
  }
}

export function subscribeExecution(executionId, listener) {
  bus.on(`exec:${executionId}`, listener);
}

export function unsubscribeExecution(executionId, listener) {
  bus.off(`exec:${executionId}`, listener);
}
