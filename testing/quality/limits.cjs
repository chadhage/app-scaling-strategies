'use strict';
// Input bounds (V6, V7, N7, N8): the validator answers a hostile input with a typed finding; it never recurses and never scans an unbounded string.
// The caps bound the WORK, not only the size: nesting, statements, runs of combining marks and the total number of characters over every string,
// every key and the markdown are all limited before anything expensive (normalisation, parsing, scanning) happens.
const { hasMarkRun, MAX_MARK_RUN } = require('./text.cjs');

const LIMITS = Object.freeze({ maxDepth: 64, maxNodes: 100000, maxStringLength: 20000, maxMarkdownLength: 1000000, maxJsonBytes: 2000000, maxTotalChars: 1000000, maxBlockDepth: 32, maxStatements: 2000, maxMarkRun: MAX_MARK_RUN });

const tooLarge = (path, message) => ({ code: 'INPUT_TOO_LARGE', path, message });
const tooDeep = (path) => ({ code: 'INPUT_TOO_DEEP', path, message: `the input is nested deeper than ${LIMITS.maxDepth} levels` });
const markRun = (path) => ({ code: 'INPUT_COMBINING_RUN', path, message: `a run of more than ${LIMITS.maxMarkRun} combining marks is refused: normalising it would take super-quadratic time` });

// Lists every key and string value of a JSON-like tree in document order, plus the joined text of every array of strings (a value split
// across elements). Iterative, so a 5000-deep tree is answered with a finding instead of a RangeError. Returns { error, items, joins, numbers, totalChars }.
function inventory(root) {
  const items = [];
  const joins = [];
  const numbers = [];
  const stack = [{ value: root, path: '', depth: 0 }];
  let nodes = 0;
  let totalChars = 0;
  const fail = (error) => ({ error, items, joins, numbers, totalChars });
  const spend = (path, text) => {
    totalChars += text.length;
    if (totalChars > LIMITS.maxTotalChars) return tooLarge(path.slice(0, 80), `the strings and keys together are longer than ${LIMITS.maxTotalChars} characters`);
    return hasMarkRun(text) ? markRun(path.slice(0, 80)) : null;
  };
  while (stack.length > 0) {
    const { value, path, depth } = stack.pop();
    nodes += 1;
    if (nodes > LIMITS.maxNodes) return fail(tooLarge(path, `the input has more than ${LIMITS.maxNodes} values`));
    if (depth > LIMITS.maxDepth) return fail(tooDeep(path));
    if (typeof value === 'string') {
      if (value.length > LIMITS.maxStringLength) return fail(tooLarge(path, `a string is longer than ${LIMITS.maxStringLength} characters`));
      const refused = spend(path, value);
      if (refused) return fail(refused);
      items.push({ path, text: value, key: false });
    } else if (typeof value === 'number') {
      numbers.push(value);
    } else if (Array.isArray(value)) {
      if (value.length > LIMITS.maxNodes - nodes) return fail(tooLarge(path, `an array has more than ${LIMITS.maxNodes} elements`));
      if (value.length > 1 && value.every((v) => typeof v === 'string')) {
        const text = value.join('\n');
        if (text.length <= LIMITS.maxStringLength) joins.push({ path: `${path}[*]`, text });
      }
      for (let i = value.length - 1; i >= 0; i -= 1) stack.push({ value: value[i], path: `${path}[${i}]`, depth: depth + 1 });
    } else if (value !== null && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length > LIMITS.maxNodes - nodes) return fail(tooLarge(path, `an object has more than ${LIMITS.maxNodes} keys`));
      for (let i = keys.length - 1; i >= 0; i -= 1) {
        const k = keys[i];
        const child = path ? `${path}.${k}` : k;
        if (k.length > LIMITS.maxStringLength) return fail(tooLarge(child.slice(0, 80), `a key is longer than ${LIMITS.maxStringLength} characters`));
        const refused = spend(child, k);
        if (refused) return fail(refused);
        items.push({ path: child, text: k, key: true });
        stack.push({ value: value[k], path: child, depth: depth + 1 });
      }
    }
  }
  return { error: null, items, joins, numbers, totalChars };
}

module.exports = { LIMITS, inventory };
