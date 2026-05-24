export async function placeholderNode({ config }) {
  const original = config?.n8nOriginalType ?? 'unknown';
  throw new Error(`Placeholder node — no handler for "${original}". Map or replace this node before running.`);
}
