import { getByPath } from '../utils/path.js';

export async function loopNode({ input, config }) {
  const { over = 'input', limit = 100 } = config;

  const array = over === 'input' ? input : getByPath(input, over);
  if (!Array.isArray(array)) {
    throw new Error(`Loop: expected an array at "${over}", got ${typeof array}`);
  }

  const capped = array.slice(0, Math.min(Number(limit), 1000));

  // Sequential iteration — return collected results
  const results = [];
  for (const item of capped) {
    results.push(item);
  }

  return { items: results, count: results.length };
}
