'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const { loadPage } = require('.\\dom-stub.cjs');

test('U049 exported timeline command functions preserve strict caller and arguments reflection boundaries', () => {
  for (const name of ['build', 'verify', 'jump', 'parseFragment']) {
    assert.equal(typeof T[name], 'function', name);
    for (const property of ['caller', 'arguments']) assert.throws(() => T[name][property], TypeError, `${name}.${property}`);
  }
});

test('U049 the actual registered keyboard command preserves its strict reflection boundary', () => {
  let page;
  assert.doesNotThrow(() => { page = loadPage(); });
  const handlers = page.$('scrub').listeners.get('keydown');
  assert.ok(Array.isArray(handlers) && handlers.length > 0);
  assert.equal(typeof handlers[0], 'function');
  for (const property of ['caller', 'arguments']) {
    assert.throws(() => handlers[0][property], (error) => error?.name === 'TypeError', `actual VM keyboard handler ${property}`);
  }
});
