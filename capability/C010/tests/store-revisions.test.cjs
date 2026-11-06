'use strict';

// C010 the revision of a lease and of its resources (rev-C010 m7, generated mutants: a deleted increment that no earlier test read). Every successful
// change of a lease raises its revision once; an update and a cancel raise the revision of the resource; a refusal changes nothing.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createStore } = require('../store.cjs');
const { sequentialIds } = require('./helpers.cjs');

const A = 'conductor-a';

test('each successful change raises the lease revision by one, an update or a cancel raises the resource revision by one, a refusal raises nothing', () => {
  const store = createStore({ now: () => 0, newId: sequentialIds(), ownerEntries: 50, owners: [A] });
  const lease = store.apply(A, 'createLease', { name: 'one', ttlMs: 1000 }).value.lease;
  assert.equal(lease.revision, 0);
  const revision = () => store.readLease(A, lease.id).value.lease.revision;
  const run = store.apply(A, 'createResource', { lease: lease.id, kind: 'run', input: { name: 'r', units: 1 } }).value.resource;
  assert.deepEqual([run.revision, revision()], [0, 1], 'a created resource starts at 0 and raises the lease');
  const scratch = store.apply(A, 'createResource', { lease: lease.id, kind: 'scratch', input: { name: 's' } }).value.resource;
  assert.deepEqual([scratch.revision, revision()], [0, 2]);
  const updated = store.apply(A, 'updateResource', { lease: lease.id, kind: 'scratch', id: scratch.id, patch: { name: 's2' } }).value.resource;
  assert.deepEqual([updated.revision, revision()], [1, 3], 'an update raises both');
  const again = store.apply(A, 'updateResource', { lease: lease.id, kind: 'scratch', id: scratch.id, patch: { name: 's3' } }).value.resource;
  assert.deepEqual([again.revision, revision()], [2, 4]);
  assert.equal(store.readResource(A, lease.id, 'scratch', scratch.id).value.resource.revision, 2, 'the stored resource carries the same revision');
  const cancelled = store.apply(A, 'cancelRun', { lease: lease.id, id: run.id }).value.resource;
  assert.deepEqual([cancelled.state, cancelled.revision, revision()], ['cancelled', 1, 5]);
  assert.equal(store.apply(A, 'deleteResource', { lease: lease.id, kind: 'scratch', id: scratch.id }).ok, true);
  assert.equal(revision(), 6);
  assert.equal(store.apply(A, 'cancelRun', { lease: lease.id, id: run.id }).code, 'STATE_CONFLICT');
  assert.equal(store.apply(A, 'updateResource', { lease: lease.id, kind: 'run', id: run.id, patch: { name: 'late' } }).code, 'STATE_CONFLICT');
  assert.equal(revision(), 6, 'a conflict changes nothing');
});
