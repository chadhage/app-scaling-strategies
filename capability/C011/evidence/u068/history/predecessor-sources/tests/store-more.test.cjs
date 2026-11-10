'use strict';

// The store beyond the happy path: time is applied before every decision and reported once, a failing step loses no expiry, the history is bounded, a
// subject without a lease owns nothing, returned values are copies, and a foreign id costs exactly what an absent one costs (counted, not timed).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { booksProblems } = require('./books.cjs');
const { SMALL, fakeClock, sequentialIds } = require('./helpers.cjs');
const contract = require('../contract.js');
const { createStore } = require('../store.cjs');

const config = contract.resolveConfig(SMALL);
const A = 'conductor-a';
const B = 'conductor-b';
const body = (key, units = 1, tier = 'standard') => ({ key, tier, units });

test('time is applied before every decision and each expiry is reported exactly once, with the figures around it', () => {
  const clock = fakeClock();
  const store = createStore({ config, now: clock.now });
  const held = store.reserve(A, body('key-time-0001', 2)).value.reservation;
  clock.advance(5000);
  store.reserve(B, body('key-time-0002', 3));
  clock.advance(held.deadlineMs - clock.now());
  const next = store.list(B, { limit: 20, offset: 0, state: null });
  assert.deepEqual(next.expired, [{ subject: A, reservation: held.id, before: { units: 2, spend: 8, poolUnits: 5, poolSpend: 20 }, after: { units: 0, spend: 0, poolUnits: 3, poolSpend: 12 } }]);
  assert.deepEqual(store.allowance(A).expired, []);
  assert.deepEqual(next.value.items.map((item) => item.state), ['reserved']);
});

test('an expiry that a failing step could not report stays queued and is reported by the next answer', () => {
  const clock = fakeClock();
  let bad = false;
  const make = sequentialIds();
  const store = createStore({ config, now: clock.now, newId: () => (bad ? 'bad' : make()) });
  const held = store.reserve(A, body('key-fail-0001', 2)).value.reservation;
  clock.advance(held.deadlineMs - clock.now());
  bad = true;
  assert.throws(() => store.reserve(B, body('key-fail-0002')), { code: 'ID_GENERATOR_INVALID' });
  assert.equal(store.snapshot().leases[B].records.length, 0);
  assert.deepEqual([store.snapshot().reserved.units, store.snapshot().leases[A].records[0].state], [0, 'expired']);
  bad = false;
  assert.deepEqual(store.read(A, held.id).expired.map((event) => event.reservation), [held.id]);
  assert.deepEqual(store.read(A, held.id).expired, []);
});

test('an id that is invalid or already used by either lease is refused by throwing, with no effect', () => {
  const store = createStore({ config, now: fakeClock().now, newId: () => 'rsv-00000001' });
  assert.equal(store.reserve(A, body('key-id-00001')).ok, true);
  const before = store.snapshot();
  assert.throws(() => store.reserve(B, body('key-id-00002')), { code: 'ID_GENERATOR_INVALID' });
  assert.throws(() => store.reserve(A, body('key-id-00003')), { code: 'ID_GENERATOR_INVALID' });
  assert.deepEqual(store.snapshot(), before);
  for (const id of ['', 'x', 'RSV-00000001', 'rsv-1', 7, null, undefined]) {
    const odd = createStore({ config, now: fakeClock().now, newId: () => id });
    assert.throws(() => odd.reserve(A, body('key-id-00004')), { code: 'ID_GENERATOR_INVALID' }, String(id));
  }
});

test('the history is bounded: the oldest ended reservation goes first and an active one is never trimmed', () => {
  const clock = fakeClock();
  const store = createStore({ config, now: clock.now, newId: sequentialIds() });
  const keep = [1, 2].map((n) => store.reserve(A, body(`key-trim-0${n}`)).value.reservation);
  const ended = [];
  for (let n = 0; n < 8; n += 1) {
    const made = store.reserve(A, body(`key-trim-1${n}`)).value.reservation;
    ended.push(made.id);
    store.release(A, made.id);
    assert.deepEqual(booksProblems(store.snapshot(), config), []);
  }
  const ids = store.snapshot().leases[A].records.map((record) => record.id);
  assert.equal(ids.length, config.entries);
  assert.deepEqual(ids.filter((id) => keep.some((item) => item.id === id)), keep.map((item) => item.id));
  assert.deepEqual(ids.slice(2), ended.slice(-(config.entries - 2)));
  assert.equal(store.has(A, ended[0]), false);
  assert.equal(store.has(A, keep[0].id), true);
  assert.equal(store.reserve(A, body('key-trim-10')).value.replayed, false, 'a trimmed key is forgotten and reserves again');
});

test('a subject without a lease owns nothing and can reserve nothing', () => {
  const store = createStore({ config, now: fakeClock().now, newId: sequentialIds() });
  const held = store.reserve(A, body('key-lease-0001')).value.reservation;
  const before = store.snapshot();
  for (const subject of ['visitor', 'operator', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '', undefined, null]) {
    assert.deepEqual([store.reserve(subject, body('key-lease-0002')).code, store.allowance(subject).code], ['ROLE_FORBIDDEN', 'ROLE_FORBIDDEN']);
    assert.equal(store.release(subject, held.id).code, 'RESERVATION_NOT_FOUND');
    assert.equal(store.read(subject, held.id).code, 'RESERVATION_NOT_FOUND');
    assert.equal(store.list(subject, { limit: 20, offset: 0, state: null }).value.total, 0);
    assert.equal(store.has(subject, held.id), false);
    assert.equal(store.batch(subject, [{ op: 'reserve', ...body('key-lease-0003') }]).code, 'ROLE_FORBIDDEN');
  }
  assert.deepEqual(store.snapshot(), before);
});

test('the allowance and the operator view carry exactly the figures that were promised', () => {
  const store = createStore({ config, now: fakeClock().now });
  store.reserve(A, body('key-view-00001', 2, 'burst'));
  store.reserve(B, body('key-view-00002', 3));
  const { allowance } = store.allowance(A).value;
  assert.deepEqual(Object.keys(allowance), ['pool', 'lease', 'prices', 'ttlMs']);
  assert.deepEqual(allowance.pool, { units: 10, spend: 60 });
  assert.deepEqual(allowance.lease, { capUnits: 6, capSpend: 40, heldUnits: 2, heldSpend: 16, remainingUnits: 4, remainingSpend: 24, active: 1, maxActive: 3 });
  assert.deepEqual(allowance.prices, { version: contract.priceVersion, standard: 4, burst: 8 });
  const operator = store.operatorPool().value;
  assert.deepEqual(operator.pool, { units: 10, spend: 60, reservedUnits: 5, reservedSpend: 28, freeUnits: 5, freeSpend: 32 });
  assert.deepEqual(operator.leases, [
    { subject: A, capUnits: 6, capSpend: 40, heldUnits: 2, heldSpend: 16, active: 1 }, { subject: B, capUnits: 6, capSpend: 40, heldUnits: 3, heldSpend: 12, active: 1 }
  ]);
});

test('paging and the state filter of a list', () => {
  const clock = fakeClock();
  const store = createStore({ config, now: clock.now });
  const made = [1, 2, 3].map((n) => store.reserve(A, body(`key-page-000${n}`)).value.reservation);
  store.release(A, made[1].id);
  const page = (query) => store.list(A, { limit: 20, offset: 0, state: null, ...query }).value;
  assert.deepEqual(page({ limit: 2 }).items.map((item) => item.id), [made[0].id, made[1].id]);
  assert.deepEqual([page({ limit: 2, offset: 2 }).items.map((item) => item.id), page({ limit: 2, offset: 2 }).total], [[made[2].id], 3]);
  assert.deepEqual(page({ state: 'released' }).items.map((item) => item.id), [made[1].id]);
  assert.deepEqual(page({ state: 'reserved' }).total, 2);
  assert.deepEqual(page({ state: 'expired' }), { total: 0, offset: 0, limit: 20, items: [] });
  assert.deepEqual(page({ offset: 9 }).items, []);
});

function scribble(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const name of Object.keys(value)) {
    scribble(value[name], seen);
    value[name] = Array.isArray(value) ? 'x' : -1;
  }
  if (Array.isArray(value)) value.push('extra');
}

test('every returned value is a copy: writing to everything reachable from an answer changes no later answer', () => {
  const run = (scribbled) => {
    const clock = fakeClock();
    const store = createStore({ config, now: clock.now, newId: sequentialIds() });
    const out = [];
    const note = (answer) => { out.push(JSON.stringify(answer)); if (scribbled) scribble(answer); };
    const first = store.reserve(A, body('key-copy-0001', 2));
    note(first);
    note(store.reserve(A, body('key-copy-0001', 2)));
    note(store.reserve(A, body('key-copy-0002', 9)));
    note(store.reserve(B, body('key-copy-0003', 3, 'burst')));
    note(store.batch(A, [{ op: 'release', id: 'rsv-00000001' }, { op: 'reserve', ...body('key-copy-0004', 1) }]));
    note(store.list(A, { limit: 20, offset: 0, state: null }));
    note(store.read(A, 'rsv-00000001'));
    note(store.allowance(A));
    note(store.operatorPool());
    clock.advance(config.ttlMs);
    note(store.list(B, { limit: 20, offset: 0, state: null }));
    out.push(JSON.stringify(store.snapshot()));
    scribble(store.snapshot());
    out.push(JSON.stringify(store.snapshot()), JSON.stringify(store.stats()));
    return out;
  };
  assert.deepEqual(run(true), run(false));
});

test('a foreign id costs the same counted work as an absent one, and a lookup scans the caller own records only', () => {
  const store = createStore({ config, now: fakeClock().now, newId: sequentialIds() });
  store.reserve(A, body('key-work-00001'));
  store.reserve(A, body('key-work-00002'));
  store.reserve(B, body('key-work-00003'));
  const cost = (call) => { const before = store.stats().visited; call(); return store.stats().visited - before; };
  const foreign = 'rsv-00000001';
  const absent = 'rsv-0000ffff';
  for (const action of [(id) => store.read(B, id), (id) => store.release(B, id), (id) => store.has(B, id)]) assert.equal(cost(() => action(foreign)), cost(() => action(absent)));
  assert.equal(cost(() => store.read(B, foreign)), 1);
  assert.equal(cost(() => store.read(A, 'rsv-00000001')), 2);
  assert.equal(cost(() => store.read(A, absent)), 2);
  assert.equal(cost(() => store.reserve(B, body('key-work-00004'))), 1, 'the key lookup scans the caller own records only');
});
