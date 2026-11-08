'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./u041-support.cjs');

test('U041 A08/A09 named structural kill: observe EVERY actual scan-buffer clear, including hidden rescans', (t) => {
  const { compileGlob } = load('glob.cjs');
  const fill = Uint8Array.prototype.fill;
  let clearCalls = 0;
  t.mock.method(Uint8Array.prototype, 'fill', function (...args) {
    clearCalls += 1;
    return Reflect.apply(fill, this, args);
  });
  for (const [pattern, input] of [['*', 'a'.repeat(128)], ['*a*b*', 'a'.repeat(64)], ['a', 'bbb'], ['*', '']]) {
    clearCalls = 0;
    const outcome = compileGlob(pattern).measure(input);
    assert.equal(clearCalls, outcome.consumed, `A08/A09: ${clearCalls} ACTUAL buffer clears for ${outcome.consumed} consumed characters`);
  }
});
