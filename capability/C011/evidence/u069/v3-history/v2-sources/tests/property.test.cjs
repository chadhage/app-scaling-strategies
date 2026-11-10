'use strict';

// Seeded random sequences over {reserve, retry with the same key, same key with another body, reserve beyond each bound, release, release twice, foreign
// release, batch, advance the injected clock to and past deadlines, reads} as every identity, with the CONSERVATION invariant (books.cjs), a reference
// model of every reservation, and the OWNERSHIP invariant after EVERY operation: an operation of one lease never changes a reservation of another,
// a refusal changes nothing, and a subject without a lease changes nothing.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { afterTime, booksProblems, recordsOf } = require('./books.cjs');
const { CONDUCTORS, PRICES, SMALL, bookProblems, fakeClock, get, release, reserve, withApp } = require('./helpers.cjs');
const contract = require('../contract.js');
const { createStore } = require('../store.cjs');

const config = contract.resolveConfig(SMALL);
const CODES = new Set(['RESERVATION_LIMIT_REACHED', 'LEASE_CAP_EXCEEDED', 'LEASE_SPEND_CAP_EXCEEDED', 'CAPACITY_EXCEEDED', 'SPEND_EXCEEDED', 'IDEMPOTENCY_CONFLICT', 'RESERVATION_NOT_FOUND', 'ROLE_FORBIDDEN']);
const SUBJECTS = [...CONDUCTORS, 'visitor', 'operator'];

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function storeRun(seed, steps, labels) {
  const random = prng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const clock = fakeClock();
  const store = createStore({ config, now: clock.now });
  const model = new Map();
  const known = { 'conductor-a': [], 'conductor-b': [] };
  const keys = Array.from({ length: 5 }, (_, n) => `key-prop-0${n}`);
  const bodyOf = () => ({ key: pick(keys), tier: pick(['standard', 'burst']), units: 1 + Math.floor(random() ** 3 * 8) });
  const idFor = (subject) => {
    const own = known[subject] ?? [];
    const other = Object.values(known).flat();
    return pick([...own, ...own, ...other, 'rsv-0000ffff']) ?? 'rsv-0000ffff';
  };
  const learn = (subject, value) => {
    const { reservation } = value;
    if (!model.has(reservation.id)) { model.set(reservation.id, { subject, ...reservation }); known[subject].push(reservation.id); } else assert.equal(model.get(reservation.id).subject, subject);
    model.get(reservation.id).state = reservation.state;
  };
  const tick = () => { for (const entry of model.values()) if (entry.state === 'reserved' && clock.now() >= entry.deadlineMs) entry.state = 'expired'; };
  const compare = () => {
    const snapshot = store.snapshot();
    assert.deepEqual(booksProblems(snapshot, config), []);
    for (const entry of model.values()) {
      const record = snapshot.leases[entry.subject].records.find((item) => item.id === entry.id);
      if (record === undefined) { assert.notEqual(entry.state, 'reserved', 'a held reservation vanished'); continue; }
      assert.deepEqual([record.units, record.spend, record.state, record.deadlineMs], [entry.units, entry.spend, entry.state, entry.deadlineMs], entry.id);
    }
    return snapshot;
  };

  for (let step = 0; step < steps; step += 1) {
    const subject = pick(SUBJECTS);
    const before = store.snapshot();
    const kind = pick(['reserve', 'reserve', 'reserve', 'retry', 'release', 'release', 'batch', 'advance', 'advance', 'read']);
    let answer = null;
    if (kind === 'advance') {
      const deadlines = Object.values(known).flat().map((id) => model.get(id)).filter((entry) => entry.state === 'reserved').map((entry) => entry.deadlineMs - clock.now());
      clock.advance(pick([0, 1, ...deadlines, ...deadlines.map((ms) => ms - 1), Math.floor(random() * config.ttlMs)].filter((ms) => ms >= 0)));
      answer = store.operatorPool();
    } else if (kind === 'reserve' || kind === 'retry') {
      const input = bodyOf();
      answer = store.reserve(subject, input);
      if (answer.ok) { assert.equal(answer.value.reservation.spend, input.units * PRICES[input.tier]); learn(subject, answer.value); }
    } else if (kind === 'release') {
      answer = store.release(subject, idFor(subject));
      if (answer.ok) learn(subject, answer.value);
    } else if (kind === 'batch') {
      const ops = Array.from({ length: 1 + Math.floor(random() * 3) }, () => (random() < 0.5 ? { op: 'reserve', ...bodyOf() } : { op: 'release', id: idFor(subject) }));
      answer = store.batch(subject, ops);
      if (answer.ok) for (const result of answer.value.results) learn(subject, result);
    } else {
      answer = [store.read(subject, idFor(subject)), store.list(subject, { limit: 5, offset: 0, state: null }), store.allowance(subject)][Math.floor(random() * 3)];
    }
    tick();
    const after = compare();
    if (answer && answer.ok === false) {
      assert.ok(CODES.has(answer.code), String(answer.code));
      assert.deepEqual(after, afterTime(before, clock.now()), `a refusal changed the books at step ${step}`);
      labels.add(`${kind}:${answer.code}`);
    } else if (answer && kind !== 'advance' && kind !== 'read') {
      labels.add(`${kind}:ok${answer.value.replayed ? ':replayed' : ''}`);
    }
    labels.add(`state:${[...model.values()].map((entry) => entry.state).sort().filter((state, at, all) => all.indexOf(state) === at).join('+')}`);
    for (const other of CONDUCTORS.filter((name) => name !== subject)) {
      assert.deepEqual(recordsOf(after, other), recordsOf(afterTime(before, clock.now()), other), `${kind} of ${subject} changed ${other} at step ${step}`);
    }
    if (!CONDUCTORS.includes(subject)) assert.deepEqual(after, afterTime(before, clock.now()), `${kind} of ${subject} changed the books`);
  }
  return model.size;
}

test('seeded random sequences keep the conservation and the ownership invariants after every single operation (store)', () => {
  const labels = new Set();
  for (let seed = 1; seed <= 25; seed += 1) storeRun(seed, 200, labels);
  // The alphabet is really exercised: every bound, a replay, a conflict, a foreign release, a release, a repeated release and the three states.
  for (const wanted of ['reserve:ok', 'reserve:LEASE_CAP_EXCEEDED', 'reserve:LEASE_SPEND_CAP_EXCEEDED', 'reserve:CAPACITY_EXCEEDED', 'reserve:SPEND_EXCEEDED', 'reserve:RESERVATION_LIMIT_REACHED',
    'reserve:IDEMPOTENCY_CONFLICT', 'reserve:ROLE_FORBIDDEN', 'retry:ok:replayed', 'release:ok', 'release:ok:replayed', 'release:RESERVATION_NOT_FOUND', 'batch:ok', 'batch:LEASE_CAP_EXCEEDED',
    'batch:RESERVATION_NOT_FOUND', 'state:expired+released+reserved']) assert.ok(labels.has(wanted), `never exercised: ${wanted} (${[...labels].filter((label) => !label.startsWith('state')).join(' ')})`);
});

test('seeded random sequences over real HTTP: the books balance and no lease ever sees or changes the other after every operation', () => withApp({}, async (ctx) => {
  const random = prng(7);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const ids = [];
  let advances = 0;
  const listOf = async (who) => (await get(ctx, who, '/v1/reservations?limit=50')).json.items;
  for (let step = 0; step < 60; step += 1) {
    const kind = pick(['reserve', 'reserve', 'release', 'foreign', 'advance']);
    const target = pick(ids);
    const actor = kind === 'foreign' && target !== undefined ? CONDUCTORS.find((name) => name !== target[0]) : kind === 'release' && target !== undefined ? target[0] : pick(CONDUCTORS);
    const other = CONDUCTORS.find((name) => name !== actor);
    const otherBefore = JSON.stringify(await listOf(other));
    if (kind === 'reserve') {
      const answer = await reserve(ctx, actor, 1 + Math.floor(random() * 4), { tier: pick(['standard', 'burst']), key: pick(['key-http-0001', 'key-http-0002', 'key-http-0003']) });
      if (answer.status === 200) ids.push([actor, answer.json.reservation.id]);
    } else if ((kind === 'release' || kind === 'foreign') && target !== undefined) {
      const held = (await listOf(target[0])).some((item) => item.id === target[1]);
      const answer = await release(ctx, actor, target[1]);
      assert.equal(answer.status, kind === 'release' && held ? 200 : 404, answer.text);
    } else if (kind === 'advance' && advances < 5) {
      advances += 1;
      ctx.clock.advance(pick([1, 1000, 150000, 150000]));
    }
    if (kind !== 'advance') assert.equal(JSON.stringify(await listOf(other)), otherBefore, `${kind} of ${actor} changed ${other}`);
    assert.deepEqual(await bookProblems(ctx), [], `step ${step} ${kind}`);
  }
}));
