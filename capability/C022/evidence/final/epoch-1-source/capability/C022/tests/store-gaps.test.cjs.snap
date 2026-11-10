'use strict';

// Return values of the store that a caller may rely on (found by the systematic mutants: the old assertion Object.isFrozen(record(...)) is
// also true for undefined, so dropping the return survived the whole suite). record and recordAnonymous return the stored, frozen entry with
// its own sequence number, the entry as given and the user (null for the anonymous ring).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createStore } = require('../store.cjs');
const { seededBytes } = require('./helpers.cjs');

test('record and recordAnonymous return the stored entry: frozen, numbered, with the user', () => {
  const store = createStore({ randomBytes: seededBytes('rec') });
  const alder = store.scope('tenant-alder');
  const first = alder.record('ada', { outcome: 'applied', code: 'ok', op: 'x' });
  assert.deepEqual(first, { seq: 1, outcome: 'applied', code: 'ok', op: 'x', user: 'ada' });
  assert.equal(Object.isFrozen(first), true);
  const second = alder.record('alf', { outcome: 'denied', code: 'ROLE_FORBIDDEN', op: 'y', user: 'mallory' });
  assert.deepEqual(second, { seq: 2, outcome: 'denied', code: 'ROLE_FORBIDDEN', op: 'y', user: 'alf' }, 'the caller of record names the user: an entry cannot name another');
  assert.deepEqual(alder.auditLog(), [first, second]);
  const anonymous = store.recordAnonymous({ outcome: 'unauthenticated', code: 'X', op: 'z', user: 'mallory' });
  assert.deepEqual(anonymous, { seq: 1, outcome: 'unauthenticated', code: 'X', op: 'z', user: null });
  assert.equal(Object.isFrozen(anonymous), true);
  assert.deepEqual(store.anonymousLog(), [anonymous]);
});
