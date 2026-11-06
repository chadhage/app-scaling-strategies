'use strict';

// U006 test tooling: a generic walker that tries to overwrite every reachable own data property of a value (strict mode) and to extend every array, so that a test can prove
// that a public return value is not shared with later callers (a frozen value refuses the write, which is also a copy-safe answer), and a deep-frozen check.

function mutateEverything(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!('value' in descriptor)) continue;
    mutateEverything(descriptor.value, seen);
    try { value[key] = 'MUTATED'; } catch { /* a frozen value refuses the write */ }
  }
  if (Array.isArray(value)) {
    try { value.push('MUTATED'); } catch { /* frozen */ }
  }
}

function deepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !('value' in descriptor) || deepFrozen(descriptor.value, seen);
  });
}

module.exports = { mutateEverything, deepFrozen };
