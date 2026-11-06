'use strict';
// Input bounds (V6, V7): the validator answers a hostile input with a typed finding; it never recurses and never scans an unbounded string.
const LIMITS = Object.freeze({ maxDepth: 64, maxNodes: 100000, maxStringLength: 20000, maxMarkdownLength: 1000000, maxJsonBytes: 2000000 });

const tooLarge = (path, message) => ({ code: 'INPUT_TOO_LARGE', path, message });
const tooDeep = (path) => ({ code: 'INPUT_TOO_DEEP', path, message: `the input is nested deeper than ${LIMITS.maxDepth} levels` });

// Lists every key and string value of a JSON-like tree in document order, plus the joined text of every array of strings (a value split
// across elements). Iterative, so a 5000-deep tree is answered with a finding instead of a RangeError. Returns { error, items, joins }.
function inventory(root) {
  const items = [];
  const joins = [];
  const numbers = [];
  const stack = [{ value: root, path: '', depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, path, depth } = stack.pop();
    nodes += 1;
    if (nodes > LIMITS.maxNodes) return { error: tooLarge(path, `the input has more than ${LIMITS.maxNodes} values`), items, joins, numbers };
    if (depth > LIMITS.maxDepth) return { error: tooDeep(path), items, joins, numbers };
    if (typeof value === 'string') {
      if (value.length > LIMITS.maxStringLength) return { error: tooLarge(path, `a string is longer than ${LIMITS.maxStringLength} characters`), items, joins, numbers };
      items.push({ path, text: value, key: false });
    } else if (typeof value === 'number') {
      numbers.push(value);
    } else if (Array.isArray(value)) {
      if (value.length > LIMITS.maxNodes - nodes) return { error: tooLarge(path, `an array has more than ${LIMITS.maxNodes} elements`), items, joins, numbers };
      if (value.length > 1 && value.every((v) => typeof v === 'string')) {
        const text = value.join('\n');
        if (text.length <= LIMITS.maxStringLength) joins.push({ path: `${path}[*]`, text });
      }
      for (let i = value.length - 1; i >= 0; i -= 1) stack.push({ value: value[i], path: `${path}[${i}]`, depth: depth + 1 });
    } else if (value !== null && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length > LIMITS.maxNodes - nodes) return { error: tooLarge(path, `an object has more than ${LIMITS.maxNodes} keys`), items, joins, numbers };
      for (let i = keys.length - 1; i >= 0; i -= 1) {
        const k = keys[i];
        const child = path ? `${path}.${k}` : k;
        if (k.length > LIMITS.maxStringLength) return { error: tooLarge(child.slice(0, 80), `a key is longer than ${LIMITS.maxStringLength} characters`), items, joins, numbers };
        items.push({ path: child, text: k, key: true });
        stack.push({ value: value[k], path: child, depth: depth + 1 });
      }
    }
  }
  return { error: null, items, joins, numbers };
}

module.exports = { LIMITS, inventory };
