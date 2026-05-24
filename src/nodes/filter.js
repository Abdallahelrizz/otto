import { SKIP } from '../engine/skip.js';
import { getByPath } from '../utils/path.js';

const OPERATORS = {
  '==':         (a, b) => a == b,
  '!=':         (a, b) => a != b,
  '>':          (a, b) => Number(a) > Number(b),
  '<':          (a, b) => Number(a) < Number(b),
  '>=':         (a, b) => Number(a) >= Number(b),
  '<=':         (a, b) => Number(a) <= Number(b),
  'contains':   (a, b) => String(a).includes(String(b)),
  'startsWith': (a, b) => String(a).startsWith(String(b)),
  'endsWith':   (a, b) => String(a).endsWith(String(b)),
  'isEmpty':    (a)    => a === '' || a === null || a === undefined,
  'isNotEmpty': (a)    => a !== '' && a !== null && a !== undefined,
};

export async function filterNode({ input, config }) {
  const { conditions = [], combinator = 'and' } = config;
  if (conditions.length === 0) return input; // no conditions = pass everything

  const results = conditions.map(({ left, operator, right }) => {
    const fn = OPERATORS[operator];
    if (!fn) throw new Error(`Filter: unknown operator "${operator}"`);
    return fn(getByPath(input, left), right);
  });

  const passed = combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
  return passed ? input : SKIP;
}
