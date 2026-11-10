'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('G3 timeline exposes the documented typed saved-run contract before use', () => {
  let T;
  assert.doesNotThrow(() => { T = require('..\\timeline.js'); }, 'the public model loads');
  assert.equal(typeof T, 'object');
  for (const name of ['build', 'verify', 'stateAt', 'locate', 'jump', 'parseFragment', 'formatFragment', 'using']) assert.equal(typeof T[name], 'function', name);
  assert.equal(T.FORMAT, 'X001-saved-run/1');
  assert.equal(T.NOT_RECORDED, 'NOT_RECORDED');
  assert.equal(T.MAX_ENTRIES, 500);
  assert.deepEqual(T.JUMPS, ['gap', 'failure', 'unknown', 'epoch']);
  assert.deepEqual(T.build(null), { ok: false, code: 'SAVED_RUN_REQUIRED', detail: null });
  assert.deepEqual(T.verify(null), { ok: false, checked: 0, mismatches: [], code: 'SAVED_RUN_REQUIRED' });
});

test('G3 real page initializes an honest unloaded chooser with its actual scripts and no effects', () => {
  let page;
  assert.doesNotThrow(() => { page = require('.\\dom-stub.cjs').loadPage(); }, 'the public page initializes');
  assert.equal(page.position(), 0);
  assert.equal(page.text('status'), 'No saved run is loaded. Nothing is assumed to have succeeded.');
  assert.equal(page.$('saved-run').children.length, 10);
  assert.equal(page.$('entries').children.length, 0);
  assert.deepEqual(page.calls, []);
});
