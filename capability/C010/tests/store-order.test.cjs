'use strict';

// C010 scenario "Lists, counts, pagination, search, filters and sort show only the caller's resources" (rev-C010 m7: a generated mutant of the sort
// comparator that the ids of the first tests could not tell apart). Items with the same name are ordered by id, whatever order they were made in:
// here the ids FALL as the world grows, so an order that merely keeps the creation order is wrong.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createStore } = require('../store.cjs');

const A = 'conductor-a';
const PAGE = { limit: 20, offset: 0, sort: 'name', q: null };
const falling = () => { let counter = 0xfffffff0; return (kind) => { counter -= 1; return `${kind}-${counter.toString(16).padStart(8, '0')}`; }; };

test('items with the same name are ordered by id, ascending, although their ids fall in the order they were created; leases follow the same rule', () => {
  const store = createStore({ now: () => 0, newId: falling(), ownerEntries: 50, owners: [A] });
  const lease = store.apply(A, 'createLease', { name: 'one', ttlMs: 1000 }).value.lease.id;
  assert.equal(lease, 'lease-ffffffef');
  for (const name of ['same', 'same', 'same', 'other']) assert.equal(store.apply(A, 'createResource', { lease, kind: 'scratch', input: { name } }).ok, true);
  const ordered = store.listResources(A, lease, 'scratch', PAGE).value.items;
  assert.deepEqual(ordered.map((item) => [item.name, item.id]), [['other', 'scratch-ffffffeb'], ['same', 'scratch-ffffffec'], ['same', 'scratch-ffffffed'], ['same', 'scratch-ffffffee']]);
  const created = store.listResources(A, lease, 'scratch', { ...PAGE, sort: 'created' }).value.items;
  assert.deepEqual(created.map((item) => item.id), ['scratch-ffffffee', 'scratch-ffffffed', 'scratch-ffffffec', 'scratch-ffffffeb'], 'the creation order is kept when no sort is asked for');
  assert.equal(store.apply(A, 'createLease', { name: 'one', ttlMs: 1000 }).value.lease.id, 'lease-ffffffea');
  assert.equal(store.apply(A, 'createLease', { name: 'zero', ttlMs: 1000 }).value.lease.id, 'lease-ffffffe9');
  assert.deepEqual(store.listLeases(A, PAGE).value.items.map((item) => [item.name, item.id]), [['one', 'lease-ffffffea'], ['one', 'lease-ffffffef'], ['zero', 'lease-ffffffe9']]);
});
