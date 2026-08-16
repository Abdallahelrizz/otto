/**
 * Per-execution AbortController registry.
 *
 * Why this exists: `POST /executions/:id/cancel` used to remove a queued BullMQ job
 * and mark the row `cancelled` — but manual runs execute IN-PROCESS
 * (`routes/executions.js` calls `runWorkflow` directly), so there was no job to
 * remove and nothing actually stopped the running promise. The UI reported
 * "cancelled" while LLM and HTTP calls kept firing and downstream nodes kept
 * running. This registry is what makes cancel mean something.
 *
 * What cancellation CAN do:
 *   - stop waiting on an in-flight request (the socket is closed)
 *   - stop starting any further nodes
 *   - free the worker slot
 *
 * What it CANNOT do — be honest about this in the UI:
 *   - undo a side effect that already happened (a POST that landed, an email sent,
 *     a row inserted). Cancellation stops future work; it never rolls back past work.
 *   - guarantee an LLM provider stops billing. A non-streaming completion may finish
 *     server-side after we hang up, and tokens already produced are generally billed.
 *
 * Scope: in-process only, by design. A cancel request must be handled by the process
 * running the execution. In queue mode the BullMQ job removal continues to cover the
 * not-yet-started case; a cross-process abort for an already-running queued job needs
 * a pub/sub signal and is NOT solved here.
 */

const controllers = new Map(); // executionId -> AbortController

/** Register a controller for an execution. Returns the AbortSignal to thread through. */
export function registerExecution(executionId) {
  if (!executionId) return undefined;
  // A retry/resume can re-register the same id; drop the stale controller first.
  controllers.get(executionId)?.abort?.(new Error('superseded'));
  const controller = new AbortController();
  controllers.set(executionId, controller);
  return controller.signal;
}

/**
 * Abort a running execution. Returns true if a live in-process run was signalled,
 * false if this process isn't running it (already finished, or another worker owns it).
 */
export function abortExecution(executionId, reason = 'Cancelled by user') {
  const controller = controllers.get(executionId);
  if (!controller) return false;
  controller.abort(new ExecutionCancelledError(reason));
  controllers.delete(executionId);
  return true;
}

/** Always call in a finally — otherwise the map leaks one controller per execution. */
export function unregisterExecution(executionId) {
  controllers.delete(executionId);
}

export function isExecutionCancelled(executionId) {
  return controllers.get(executionId)?.signal.aborted ?? false;
}

/** Test/diagnostic helper — number of live in-process executions. */
export function activeExecutionCount() {
  return controllers.size;
}

export class ExecutionCancelledError extends Error {
  constructor(message = 'Cancelled by user') {
    super(message);
    this.name = 'ExecutionCancelledError';
    this.code = 'EXECUTION_CANCELLED';
  }
}

/** True for both our own cancellation and a raw fetch/SDK abort. */
export function isCancellation(err) {
  return err?.code === 'EXECUTION_CANCELLED'
    || err?.name === 'ExecutionCancelledError'
    || err?.name === 'AbortError'
    || err?.code === 'ABORT_ERR';
}

/** Throw if the signal has already been aborted. Cheap guard before starting work. */
export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new ExecutionCancelledError();
  }
}
