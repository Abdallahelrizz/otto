/**
 * Set / Transform node — shapes, renames, or computes data fields.
 *
 * Config:
 *   assignments: [{ key: 'outputField', value: '{{ input.sourceField }}' }]
 *   mode: 'set'    — output ONLY the assigned fields (default)
 *         'merge'  — merge assigned fields onto the existing input (note: Merge node uses 'merge-object', this is a different node)
 */
export async function setNode({ input, config }) {
  const { assignments = [], mode = 'set' } = config;

  // Note: expressions in `value` are already resolved by executor.resolveConfig()
  // before this handler is called, so we just build the output object.
  const result = {};
  for (const { key, value } of assignments) {
    result[key] = value;
  }

  if (mode === 'merge') {
    return { ...input, ...result };
  }

  return result;
}
