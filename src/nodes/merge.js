/**
 * Merge / Join node — waits for all incoming branches and combines their data.
 *
 * Config:
 *   mode: 'merge-object'  — shallow-merge all active inputs into one object (default)
 *         'collect-array' — collect each active input as an array element,
 *                           preserving per-source identity
 *
 * Output for collect-array:
 *   { items: [ { source: 'nodeId', data: {...} }, ... ] }
 *
 * Skipped branches (inactive sides of IF nodes) are always excluded.
 * Existing wiring using the default mode is unaffected.
 */
import { makeItem } from '../utils/items.js';

export async function mergeNode({ input, rawInputs, config }) {
  const { mode = 'merge-object' } = config;

  if (mode === 'collect-array') {
    return {
      items: rawInputs.map(({ source, data }) => makeItem(data, { source, data })),
      count: rawInputs.length,
    };
  }

  // merge-object: executor already merged active inputs into `input`
  return input;
}
