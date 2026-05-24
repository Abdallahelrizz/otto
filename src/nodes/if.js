/**
 * IF node — conditional routing.
 * Evaluates one or more conditions and routes data to the 'true' or 'false' branch.
 *
 * Config:
 *   conditions: [{ left: 'field.path', operator: string, right: any }]
 *   combinator: 'and' | 'or'  (default: 'and')
 *
 * Output shape (consumed by executor's collectInput):
 *   { _ifBranches: { true: data | SKIP, false: data | SKIP } }
 */
import { SKIP } from '../engine/skip.js';
import { getByPath } from '../utils/path.js';

const OPERATORS = {
  '==':          (a, b) => a == b,
  '!=':          (a, b) => a != b,
  '>':           (a, b) => Number(a) > Number(b),
  '<':           (a, b) => Number(a) < Number(b),
  '>=':          (a, b) => Number(a) >= Number(b),
  '<=':          (a, b) => Number(a) <= Number(b),
  'contains':    (a, b) => String(a).includes(String(b)),
  'startsWith':  (a, b) => String(a).startsWith(String(b)),
  'endsWith':    (a, b) => String(a).endsWith(String(b)),
  'isEmpty':     (a)    => a === '' || a === null || a === undefined,
  'isNotEmpty':  (a)    => a !== '' && a !== null && a !== undefined,
};


function evaluate(condition, input) {
  const { left, operator, right } = condition;
  const leftVal = getByPath(input, left);
  const fn = OPERATORS[operator];
  if (!fn) throw new Error(`IF node: unknown operator "${operator}"`);
  return fn(leftVal, right);
}

export async function ifNode({ input, config }) {
  const { conditions = [], combinator = 'and' } = config;

  if (conditions.length === 0) throw new Error('IF node: at least one condition is required');

  const results = conditions.map(c => evaluate(c, input));
  const passed = combinator === 'or'
    ? results.some(Boolean)
    : results.every(Boolean);

  return {
    _ifBranches: {
      true:  passed ? input : SKIP,
      false: passed ? SKIP  : input,
    },
  };
}
