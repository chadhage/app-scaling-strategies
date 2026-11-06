'use strict';

// The store, without HTTP: ownership is decided in ONE place, so it is tested here against every function that takes a subject. A foreign, an
// ended, an expired and an absent target are the same refusal and cost the same work (counted, never timed); a refused or over-quota change
// has no effect; nothing the store returns is shared with its state.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createStore } = require('../store.cjs');

const A = 'conductor-a';
const B = 'conductor-b';
const OWNERS = [A, B];
const sequential = () => { let n = 0; return (kind) => { n += 1; return `${kind}-${n.toString(16).padStart(8, '0')}`; }; };

function world(options = {}) {
  const clock = { value: 1000 };
  const store = createStore({ now: () => clock.value, newId: sequential(), ownerEntries: options.ownerEntries ?? 50, owners: OWNERS });
  const lease = (subject, name = 'lease', ttlMs = 100000) => store.apply(subject, 'createLease', { name, ttlMs }).value.lease;
  const resource = (subject, leaseId, kind, input) => store.apply(subject, 'createResource', { lease: leaseId, kind, input }).value.resource;
  const a = lease(A, 'lease-a');
  const b = lease(B, 'lease-b');
  const ids = {
    a: { lease: a.id, run: resource(A, a.id, 'run', { name: 'run-a', units: 5 }).id, scratch: resource(A, a.id, 'scratch', { name: 'scratch-a' }).id },
    b: { lease: b.id, run: resource(B, b.id, 'run', { name: 'run-b', units: 5 }).id, scratch: resource(B, b.id, 'scratch', { name: 'scratch-b' }).id }
  };
  ids.a.export = resource(A, a.id, 'export', { name: 'export-a', runId: ids.a.run }).id;
  ids.b.export = resource(B, b.id, 'export', { name: 'export-b', runId: ids.b.run }).id;
  return { store, clock, ids, lease, resource };
}
const MISSING = { ok: false, code: 'TARGET_NOT_FOUND' };
const PAGE = { limit: 20, offset: 0, sort: 'created', q: null };

test('every read answers the owner and nobody else: the same call by another subject is the one refusal', () => {
  const { store, ids } = world();
  for (const [kind, folder] of [['run', 'run'], ['scratch', 'scratch'], ['export', 'export']]) {
    assert.equal(store.readResource(A, ids.a.lease, kind, ids.a[folder]).ok, true, kind);
    assert.deepEqual(store.readResource(B, ids.a.lease, kind, ids.a[folder]), MISSING, `${kind} by the other conductor`);
    assert.deepEqual(store.readResource(B, ids.b.lease, kind, ids.a[folder]), MISSING, `${kind} of the other lease inside an own lease`);
    assert.deepEqual(store.listResources(B, ids.a.lease, kind, PAGE), MISSING);
    assert.equal(store.has(B, { lease: ids.a.lease, kind, id: ids.a[folder] }), false);
    assert.equal(store.has(A, { lease: ids.a.lease, kind, id: ids.a[folder] }), true);
  }
  assert.deepEqual(store.readLease(B, ids.a.lease), MISSING);
  assert.equal(store.readLease(A, ids.a.lease).value.lease.id, ids.a.lease);
  assert.equal(store.has(B, { lease: ids.a.lease }), false);
  assert.equal(store.has(A, { lease: ids.a.lease }), true);
  assert.equal(store.has('visitor', { lease: ids.a.lease }), false);
  assert.deepEqual(store.listLeases(B, PAGE).value.items.map((item) => item.id), [ids.b.lease]);
  assert.deepEqual(store.listLeases('visitor', PAGE).value.items, []);
});

test('a foreign target, an expired one, an ended one and one that never existed are the same refusal and cost the same work', () => {
  const { store, clock, ids, lease } = world();
  const short = lease(B, 'short', 500);
  const gone = lease(B, 'gone');
  assert.equal(store.apply(B, 'endLease', { lease: gone.id }).ok, true);
  clock.value += 600;
  const work = (fn) => { const before = store.stats().visited; const result = fn(); return [result, store.stats().visited - before]; };
  const calls = [ids.a.lease, short.id, gone.id, 'lease-ffffffffffffffff'].map((id) => work(() => store.readLease(B, id)));
  for (const [result, visited] of calls) { assert.deepEqual(result, MISSING); assert.equal(visited, calls[0][1], 'the same number of elements was looked at'); }
  assert.ok(calls[0][1] > 0);
  const inner = [[B, ids.b.lease, ids.a.run], [B, ids.b.lease, 'run-ffffffffffffffff']].map(([who, l, id]) => work(() => store.readResource(who, l, 'run', id)));
  assert.equal(inner[0][1], inner[1][1], 'a foreign id and an absent id inside an own lease cost the same');
  assert.deepEqual(inner.map(([result]) => result), [MISSING, MISSING]);
  assert.equal(store.has(B, { lease: short.id }), false, 'an expired lease is not owned any more');
});

test('creating: the owner is the subject, ids are server-made and checked, and the quota and every bound refuse without an effect', () => {
  const { store, ids } = world({ ownerEntries: 7 });
  const before = store.snapshot();
  assert.equal(before.leases.find((entry) => entry.id === ids.a.lease).owner, A);
  assert.equal(store.apply(A, 'createLease', { name: 'one', ttlMs: 10 }).value.lease.counts.runs, 0);
  assert.equal(store.apply(A, 'createResource', { lease: ids.a.lease, kind: 'scratch', input: { name: 'x' } }).ok, true);
  assert.equal(store.apply(A, 'createResource', { lease: ids.a.lease, kind: 'scratch', input: { name: 'y' } }).ok, true);
  const snapshot = store.snapshot();
  assert.deepEqual(store.apply(A, 'createResource', { lease: ids.a.lease, kind: 'scratch', input: { name: 'over' } }), { ok: false, code: 'OWNER_QUOTA_FULL' });
  assert.deepEqual(store.apply(A, 'createLease', { name: 'over', ttlMs: 10 }), { ok: false, code: 'OWNER_QUOTA_FULL' });
  assert.deepEqual(store.snapshot(), snapshot, 'an over-quota creation has no effect');
  assert.equal(store.apply(B, 'createResource', { lease: ids.b.lease, kind: 'scratch', input: { name: 'fine' } }).ok, true, 'the other conductor has its own share');
  assert.deepEqual(store.apply(B, 'createResource', { lease: ids.a.lease, kind: 'scratch', input: { name: 'evil' } }), MISSING);
  assert.deepEqual(store.apply(B, 'createResource', { lease: ids.b.lease, kind: 'export', input: { name: 'evil', runId: ids.a.run } }), MISSING, 'a reference to a foreign run');
  assert.deepEqual(store.apply(B, 'createResource', { lease: ids.b.lease, kind: 'export', input: { name: 'evil', runId: 'run-ffffffffffffffff' } }), MISSING);
});

test('the id generator is not trusted: a malformed or a used id throws and changes nothing', () => {
  for (const bad of ['nope', 'lease-1', 'run-00000001', 12, null]) {
    const store = createStore({ now: () => 0, newId: () => bad, ownerEntries: 5, owners: OWNERS });
    assert.throws(() => store.apply(A, 'createLease', { name: 'x', ttlMs: 10 }), (error) => error.code === 'ID_GENERATOR_INVALID', String(bad));
    assert.deepEqual(store.snapshot(), { leases: [] });
  }
  const used = createStore({ now: () => 0, newId: () => 'lease-00000001', ownerEntries: 5, owners: OWNERS });
  assert.equal(used.apply(A, 'createLease', { name: 'x', ttlMs: 10 }).ok, true);
  assert.throws(() => used.apply(B, 'createLease', { name: 'y', ttlMs: 10 }), (error) => error.code === 'ID_GENERATOR_INVALID');
  assert.equal(used.snapshot().leases.length, 1);
  const clash = createStore({ now: () => 0, newId: (kind) => (kind === 'run' ? 'run-00000001' : 'lease-00000001'), ownerEntries: 9, owners: OWNERS });
  clash.apply(A, 'createLease', { name: 'x', ttlMs: 10 });
  assert.equal(clash.apply(A, 'createResource', { lease: 'lease-00000001', kind: 'run', input: { name: 'r', units: 1 } }).ok, true);
  assert.throws(() => clash.apply(A, 'createResource', { lease: 'lease-00000001', kind: 'run', input: { name: 's', units: 1 } }), (error) => error.code === 'ID_GENERATOR_INVALID');
});

test('updating, cancelling and deleting follow the state of the run, and deleting a run removes its exports', () => {
  const { store, ids } = world();
  const key = { lease: ids.a.lease, kind: 'run', id: ids.a.run };
  assert.deepEqual(store.apply(B, 'updateResource', { ...key, patch: { units: 9 } }), MISSING);
  assert.deepEqual(store.apply(B, 'cancelRun', { lease: ids.a.lease, id: ids.a.run }), MISSING);
  assert.deepEqual(store.apply(B, 'deleteResource', key), MISSING);
  assert.equal(store.apply(A, 'updateResource', { ...key, patch: { units: 9, name: 'renamed' } }).value.resource.units, 9);
  assert.equal(store.apply(A, 'updateResource', { lease: ids.a.lease, kind: 'scratch', id: ids.a.scratch, patch: { name: 'moved' } }).value.resource.name, 'moved');
  assert.equal(store.apply(A, 'cancelRun', { lease: ids.a.lease, id: ids.a.run }).value.resource.state, 'cancelled');
  for (const op of [() => store.apply(A, 'cancelRun', { lease: ids.a.lease, id: ids.a.run }), () => store.apply(A, 'updateResource', { ...key, patch: { units: 1 } })]) assert.deepEqual(op(), { ok: false, code: 'STATE_CONFLICT' });
  assert.equal(store.apply(A, 'deleteResource', key).ok, true);
  assert.equal(store.snapshot().leases.find((entry) => entry.id === ids.a.lease).exports.length, 0);
  assert.equal(store.snapshot().leases.find((entry) => entry.id === ids.b.lease).exports.length, 1);
  assert.equal(store.apply(A, 'deleteResource', { lease: ids.a.lease, kind: 'scratch', id: ids.a.scratch }).ok, true);
  assert.deepEqual(store.apply(B, 'endLease', { lease: ids.a.lease }), MISSING);
  assert.equal(store.apply(A, 'endLease', { lease: ids.a.lease }).value.ended, true);
  assert.deepEqual(store.readLease(A, ids.a.lease), MISSING);
});

test('a batch is atomic: any refusal or conflict discards every operation, and foreign targets are refused wherever they stand', () => {
  const { store, ids } = world();
  const before = store.snapshot();
  const own = [{ op: 'update', lease: ids.b.lease, kind: 'run', id: ids.b.run, patch: { units: 2 } }, { op: 'delete', lease: ids.b.lease, kind: 'scratch', id: ids.b.scratch }];
  for (const foreign of [{ op: 'delete', lease: ids.a.lease, kind: 'run', id: ids.a.run }, { op: 'cancel', lease: ids.a.lease, kind: 'run', id: ids.a.run }, { op: 'update', lease: ids.a.lease, kind: 'scratch', id: ids.a.scratch, patch: { name: 'z' } }]) {
    assert.deepEqual(store.batch(B, [...own, foreign]), MISSING);
    assert.deepEqual(store.batch(B, [foreign, ...own]), MISSING);
  }
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(store.batch(B, [{ op: 'cancel', lease: ids.b.lease, kind: 'run', id: ids.b.run }, { op: 'cancel', lease: ids.b.lease, kind: 'run', id: ids.b.run }]), { ok: false, code: 'STATE_CONFLICT' });
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(store.batch(B, own), { ok: true, value: { applied: 2 } });
  assert.equal(store.snapshot().leases.find((entry) => entry.id === ids.b.lease).scratches.length, 0);
});

test('lists page, filter and sort the caller\'s own items only: totals count the same items', () => {
  const { store, ids, resource } = world();
  for (const name of ['b-3', 'b-1', 'b-2']) resource(B, ids.b.lease, 'scratch', { name });
  resource(A, ids.a.lease, 'scratch', { name: 'b-9' });
  const page = (query) => store.listResources(B, ids.b.lease, 'scratch', { ...PAGE, ...query }).value;
  assert.equal(page({}).total, 4);
  assert.deepEqual(page({ sort: 'name' }).items.map((item) => item.name), ['b-1', 'b-2', 'b-3', 'scratch-b']);
  assert.deepEqual(page({ q: 'b-' }).items.map((item) => item.name), ['b-3', 'b-1', 'b-2']);
  assert.deepEqual(page({ limit: 2, offset: 1, sort: 'name' }).items.map((item) => item.name), ['b-2', 'b-3']);
  assert.deepEqual([page({ offset: 9 }).total, page({ offset: 9 }).items.length], [4, 0]);
  assert.equal(store.listLeases(A, { ...PAGE, q: 'lease-a' }).value.total, 1);
  assert.equal(store.listLeases(A, { ...PAGE, q: 'lease-b' }).value.total, 0);
  const tie = createStore({ now: () => 0, newId: sequential(), ownerEntries: 9, owners: OWNERS });
  const lease = tie.apply(A, 'createLease', { name: 'l', ttlMs: 10 }).value.lease.id;
  for (const name of ['same', 'same', 'other']) tie.apply(A, 'createResource', { lease, kind: 'scratch', input: { name } });
  assert.deepEqual(tie.listResources(A, lease, 'scratch', { ...PAGE, sort: 'name' }).value.items.map((item) => [item.name, item.id]), [['other', 'scratch-00000004'], ['same', 'scratch-00000002'], ['same', 'scratch-00000003']]);
});

test('ended, expired and moved leases: reaping frees the share, the operator sees only live leases, a move changes who owns it', () => {
  const { store, clock, ids, lease } = world({ ownerEntries: 5 });
  const short = lease(A, 'short', 50);
  assert.equal(store.operatorLeases(PAGE).value.total, 3);
  clock.value += 60;
  assert.equal(store.operatorLeases(PAGE).value.total, 2, 'an expired lease is not listed');
  assert.equal(store.snapshot().leases.some((entry) => entry.id === short.id), true, 'reads never reap');
  assert.equal(store.apply(A, 'createLease', { name: 'again', ttlMs: 10 }).ok, true, 'the expired lease and its entry are reaped by the next change');
  assert.equal(store.snapshot().leases.some((entry) => entry.id === short.id), false);
  assert.deepEqual(store.operatorLeases({ ...PAGE, limit: 1 }).value.items.map((item) => Object.keys(item).sort()), [['counts', 'expiresAtMs', 'id', 'owner']]);
  assert.equal(store.transfer(ids.b.lease, A), true);
  assert.equal(store.readLease(A, ids.b.lease).ok, true);
  assert.deepEqual(store.readLease(B, ids.b.lease), MISSING);
  assert.equal(store.transfer('lease-ffffffffffffffff', A), false);
  assert.throws(() => store.transfer(ids.b.lease, 'visitor'), RangeError);
});

test('nothing the store returns is shared with its state: every reachable object of every public answer can be rewritten without a later answer changing', () => {
  const { store, ids } = world();
  const applied = store.apply(A, 'updateResource', { lease: ids.a.lease, kind: 'scratch', id: ids.a.scratch, patch: { name: 'same' } });
  const reads = () => [store.readLease(A, ids.a.lease), store.listLeases(A, PAGE), store.readResource(A, ids.a.lease, 'run', ids.a.run), store.listResources(A, ids.a.lease, 'run', PAGE), store.operatorLeases(PAGE)];
  const baseline = JSON.stringify(reads());
  const rewrite = (value) => {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) rewrite(value[key]);
      if (Array.isArray(value)) value.push('polluted'); else value.polluted = true;
      for (const key of Object.keys(value)) if (key !== 'polluted') value[key] = 'rewritten';
    }
  };
  for (const answer of [applied, ...reads(), store.snapshot(), store.stats()]) rewrite(answer);
  assert.equal(JSON.stringify(reads()), baseline);
  assert.deepEqual(store.snapshot().leases.find((entry) => entry.id === ids.a.lease).scratches.map((item) => item.name), ['same']);
});
