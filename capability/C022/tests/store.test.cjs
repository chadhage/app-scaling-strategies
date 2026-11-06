'use strict';

// The tenant-scoped store WITHOUT HTTP: a tripwire proves that an operation opens only its own tenant, ids, ordering and quotas are per
// tenant, cursors and ETags are keyed MACs, audit rings are per user, and no answer shares a mutable object with the store.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');
const { createStore } = require('../store.cjs');
const { seededBytes } = require('./helpers.cjs');

const make = (extra = {}) => {
  const touched = [];
  const store = createStore({ randomBytes: seededBytes(extra.seed || 'st'), observe: (tenant) => touched.push(tenant), ...extra.options });
  return { store, touched };
};

test('scope(tenant) opens one tenant and the tripwire sees exactly that tenant for every operation of the handle', () => {
  const { store, touched } = make();
  const alder = store.scope('tenant-alder');
  const project = alder.get('proj-0001');
  alder.list({ limit: 5, after: null, q: '' });
  alder.create({ name: 'new', units: 1 }, 'ada');
  alder.update('proj-0004', { name: 'newer', units: 2 });
  alder.etag(project);
  alder.readCursor('', alder.mintCursor('', 'proj-0002'));
  alder.profiles();
  alder.hasProfile('synthetic-001');
  alder.record('ada', { outcome: 'applied', code: 'ok', op: 'x' });
  alder.auditLog();
  alder.remove('proj-0004');
  assert.deepEqual([...new Set(touched)], ['tenant-alder']);
  assert.equal(touched.length, 1, 'one scope call, one tripwire event: every method closes over that one tenant');
  store.recordAnonymous({ outcome: 'unauthenticated', code: 'X', op: 'y' });
  store.anonymousLog();
  store.snapshot();
  assert.equal(touched.length, 1, 'anonymous records and the snapshot open no tenant scope');
});

test('the same id means a different object in each tenant; counters, ordering and quotas are per tenant', () => {
  const { store } = make();
  const alder = store.scope('tenant-alder');
  const birch = store.scope('tenant-birch');
  assert.equal(alder.get('proj-0001').name, 'alder-orchard');
  assert.equal(birch.get('proj-0001').name, 'birch-harbor');
  assert.equal(birch.get('proj-0003'), null, 'alder owns proj-0003, birch does not');
  assert.equal(alder.get('proj-0003').owner, 'ada');
  assert.equal(birch.create({ name: 'grove', units: 1 }, 'ben').id, 'proj-0003');
  assert.equal(alder.create({ name: 'lake', units: 1 }, 'alf').id, 'proj-0004');
  assert.equal(alder.remove('proj-0004'), true);
  assert.equal(alder.remove('proj-0004'), false);
  assert.equal(alder.create({ name: 'lake2', units: 1 }, 'alf').id, 'proj-0005', 'ids are never reused');
  const cedar = store.scope('tenant-cedar');
  for (let index = 0; index < contract.limits.projectsPerTenant; index += 1) assert.ok(cedar.create({ name: `c${index}`, units: 1 }, 'cai'));
  assert.equal(cedar.create({ name: 'over', units: 1 }, 'cai'), null, 'the quota is the tenant\'s own');
  assert.ok(alder.create({ name: 'still', units: 1 }, 'alf'), 'the neighbour is not starved');
  for (const tenant of ['tenant-alder', 'tenant-birch']) assert.equal(store.scope(tenant).get('__proto__'), null);
  assert.equal(alder.get('constructor'), null);
});

test('ids stay in numeric order past four digits and a page after proj-9999 starts at proj-10000', () => {
  const { store } = make({ options: { limits: { ...contract.limits, projectsPerTenant: 3 } } });
  const cedar = store.scope('tenant-cedar');
  for (let index = 0; index < 9998; index += 1) assert.equal(cedar.remove(cedar.create({ name: 'x', units: 1 }, 'cai').id), true);
  for (let index = 0; index < 3; index += 1) cedar.create({ name: 'y', units: 1 }, 'cai');
  const ids = cedar.list({ limit: 10, after: null, q: '' }).items.map((item) => item.id);
  assert.deepEqual(ids, ['proj-9999', 'proj-10000', 'proj-10001'], 'numeric order, not string order');
  assert.equal(cedar.list({ limit: 1, after: 'proj-9999', q: '' }).items[0].id, 'proj-10000');
  assert.equal(cedar.list({ limit: 1, after: 'proj-9999', q: '' }).next, 'proj-10000');
});

test('list, search and pages: counts and cursors are the tenant\'s own, search is case-insensitive substring, the page tail is exact', () => {
  const { store } = make();
  const alder = store.scope('tenant-alder');
  const all = alder.list({ limit: 10, after: null, q: '' });
  assert.deepEqual(all.items.map((item) => item.name), ['alder-orchard', 'alder-river', 'alder-meadow']);
  assert.equal(all.count, 3);
  assert.equal(all.next, null);
  const first = alder.list({ limit: 2, after: null, q: '' });
  assert.equal(first.next, 'proj-0002');
  assert.equal(alder.list({ limit: 2, after: first.next, q: '' }).next, null);
  assert.equal(alder.list({ limit: 3, after: null, q: '' }).next, null, 'exactly a full page has no next');
  assert.deepEqual(alder.list({ limit: 5, after: null, q: 'river' }).items.map((item) => item.id), ['proj-0002']);
  assert.equal(alder.list({ limit: 5, after: null, q: 'birch' }).count, 0);
  assert.equal(store.scope('tenant-birch').list({ limit: 5, after: null, q: 'alder' }).count, 0);
});

test('cursors and ETags are keyed MACs over the tenant (and the query): a value of one tenant verifies in no other, and any altered character fails', () => {
  const { store } = make();
  const alder = store.scope('tenant-alder');
  const birch = store.scope('tenant-birch');
  const cursor = alder.mintCursor('river', 'proj-0002');
  assert.equal(alder.readCursor('river', cursor), 'proj-0002');
  assert.equal(birch.readCursor('river', cursor), null);
  assert.equal(alder.readCursor('', cursor), null, 'bound to its query');
  assert.equal(alder.readCursor('river', `${cursor}.x`), null);
  assert.equal(alder.readCursor('river', cursor.split('.')[0]), null);
  assert.equal(alder.readCursor('river', ''), null);
  assert.equal(alder.readCursor('river', `${cursor.split('.')[0]}.${'A'.repeat(22)}`), null);
  assert.equal(alder.readCursor('river', `${cursor.split('.')[0]}.short`), null);
  for (let index = 0; index < cursor.length; index += 1) {
    const altered = `${cursor.slice(0, index)}${cursor[index] === 'A' ? 'B' : 'A'}${cursor.slice(index + 1)}`;
    assert.equal(alder.readCursor('river', altered), null, `character ${index}`);
  }
  const a = alder.get('proj-0001');
  const b = birch.get('proj-0001');
  assert.notEqual(alder.etag(a), birch.etag(b));
  assert.notEqual(alder.etag(a), alder.etag({ ...a, version: 2 }));
  assert.equal(alder.etag(a), alder.etag({ ...a }));
  const other = make({ seed: 'other' }).store.scope('tenant-alder');
  assert.notEqual(other.etag(a), alder.etag(a), 'another instance has another key');
});

test('answers are frozen copies: nothing a consumer does reaches the store', () => {
  const { store } = make();
  const alder = store.scope('tenant-alder');
  const project = alder.get('proj-0001');
  assert.equal(Object.isFrozen(project), true);
  assert.throws(() => { project.name = 'taken'; }, TypeError);
  const listed = alder.list({ limit: 5, after: null, q: '' });
  listed.items.length = 0;
  listed.count = 99;
  assert.equal(alder.list({ limit: 5, after: null, q: '' }).items.length, 3);
  assert.equal(Object.isFrozen(alder.create({ name: 'n', units: 1 }, 'ada')), true);
  assert.equal(Object.isFrozen(alder.update('proj-0001', { name: 'u', units: 3 })), true);
  assert.equal(alder.get('proj-0001').version, 2);
  assert.equal(Object.isFrozen(alder.record('ada', { outcome: 'applied', code: 'ok', op: 'x' })), true);
  assert.equal(Object.isFrozen(alder), true);
  alder.auditLog().length = 0;
  assert.equal(alder.auditLog().length, 1);
});

test('the audit trail: a ring per user of a tenant, a sequence per tenant, a separate bounded anonymous ring', () => {
  const { store } = make({ options: { limits: { ...contract.limits, auditPerUser: 3, anonymousAudit: 2 } } });
  const alder = store.scope('tenant-alder');
  const birch = store.scope('tenant-birch');
  alder.record('ana', { outcome: 'denied', code: 'ROLE_FORBIDDEN', op: 'project.create' });
  for (let index = 0; index < 10; index += 1) alder.record('alf', { outcome: 'rejected', code: 'RESOURCE_NOT_FOUND', op: 'project.read' });
  birch.record('bea', { outcome: 'applied', code: 'ok', op: 'admin.role' });
  const log = alder.auditLog();
  assert.equal(log.filter((entry) => entry.user === 'alf').length, 3, 'alf is bounded');
  assert.equal(log.filter((entry) => entry.user === 'ana').length, 1, 'alf did not evict ana');
  assert.deepEqual(log.map((entry) => entry.seq), [...log.map((entry) => entry.seq)].sort((a, b) => a - b));
  assert.equal(birch.auditLog().length, 1);
  assert.equal(birch.auditLog()[0].seq, 1, 'a sequence per tenant');
  for (let index = 0; index < 5; index += 1) store.recordAnonymous({ outcome: 'unauthenticated', code: 'TOKEN_UNKNOWN', op: 'x' });
  assert.equal(store.anonymousLog().length, 2);
  assert.ok(store.anonymousLog().every((entry) => entry.user === null));
  assert.deepEqual(store.snapshot().audit['tenant-alder'].sort(), [['alf', 3], ['ana', 1]]);
  assert.equal(store.snapshot().anonymousAudit, 2);
});

test('the snapshot is a copy: resources and counters as plain data, audit excluded from the tenants', () => {
  const { store } = make();
  const snapshot = store.snapshot();
  assert.deepEqual(Object.keys(snapshot.tenants), contract.tenants);
  assert.equal(snapshot.tenants['tenant-alder'].counter, 3);
  snapshot.tenants['tenant-alder'].projects.length = 0;
  assert.equal(store.snapshot().tenants['tenant-alder'].projects.length, 3);
});

test('the default randomness and no tripwire: two stores have different keys and scope() needs no observer', () => {
  const one = createStore();
  const two = createStore();
  const a = one.scope('tenant-alder');
  const project = a.get('proj-0001');
  assert.notEqual(a.etag(project), two.scope('tenant-alder').etag(project));
});
