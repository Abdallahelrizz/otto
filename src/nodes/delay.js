export async function delayNode({ input, config, signal }) {
  const { amount = 1, unit = 's' } = config;
  const multipliers = { ms: 1, s: 1_000, m: 60_000 };
  const ms = Number(amount) * (multipliers[unit] ?? 1_000);
  const capped = Math.min(ms, 5 * 60 * 1_000); // 5-minute cap

  // The sleep must be abortable. With a plain setTimeout, cancelling an execution — or
  // hitting the workflow timeout — left this node sleeping to completion and then
  // reporting success, so a "timed out" run still showed the delay node as succeeded and
  // continued into downstream nodes. Up to 5 minutes of work after the user stopped it.
  await new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Cancelled by user'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, capped);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Cancelled by user'));
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });

  return input;
}
