'use strict';

// C010 scenario "Random operation sequences keep the global invariant" (L-0119): a seeded random sequence over lease, resource of each kind, read,
// list, update, delete, cancel, reference, batch, end, EXPIRE (the clock moves) and DUPLICATE (the same operation again) by every identity, with
// the global invariant checked after EVERY operation: no identity observes or changes a resource of a lease it does not own, an owner never
// changes, a refusal and a read have no effect, a change touches only the caller's live leases (an expired lease of another owner may be reaped:
// it was unreachable), every id in an answer is the caller's own, the quota and the references hold. There is no restart in the alphabet: C010
// keeps no state outside its process (README).
const assert = require('node:assert/strict');
const test = require('node:test');
const { createStore } = require('../store.cjs');
const { call, fakeClock, same, startApp } = require('./helpers.cjs');

const ID_TEXT = /(?:lease|run|scratch|export)-[0-9a-f]{8,32}/g;
const OWNER_ENTRIES = 12;
const ABSENT = { lease: 'lease-ffffffffffffffff', run: 'run-ffffffffffffffff' };

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (random, list) => list[Math.floor(random() * list.length)];
const sequential = () => { let n = 0; return (kind) => { n += 1; return `${kind}-${n.toString(16).padStart(8, '0')}`; }; };
const everything = (lease) => [lease.id, ...[...lease.runs, ...lease.scratches, ...lease.exports].map((item) => item.id)];
const ownedIds = (snapshot, subject) => new Set(snapshot.leases.filter((lease) => lease.owner === subject).flatMap(everything));

function check(label, { subject, mutating, before, after, now, ok, ids }) {
  const was = new Map(before.leases.map((lease) => [lease.id, lease]));
  for (const lease of after.leases) {
    if (was.has(lease.id)) assert.equal(lease.owner, was.get(lease.id).owner, `${label}: an owner changed`);
    else assert.equal(lease.owner, subject, `${label}: a lease appeared for another owner`);
  }
  if (!ok || !mutating) assert.deepEqual(after, before, `${label}: ${ok ? 'a read' : 'a refusal'} had an effect`);
  else {
    for (const lease of before.leases.filter((entry) => entry.owner !== subject && entry.expiresAtMs > now)) {
      assert.deepEqual(after.leases.find((entry) => entry.id === lease.id), lease, `${label}: a live lease of another owner changed or vanished`);
    }
  }
  if (ok) {
    const mine = new Set([...ownedIds(before, subject), ...ownedIds(after, subject)]);
    for (const id of ids) assert.ok(mine.has(id), `${label}: the answer shows ${id}, which is not this identity's`);
  }
  for (const owner of new Set(after.leases.map((lease) => lease.owner))) {
    assert.ok(after.leases.filter((lease) => lease.owner === owner).flatMap(everything).length <= OWNER_ENTRIES, `${label}: ${owner} exceeds its share`);
  }
  for (const lease of after.leases) for (const item of lease.exports) assert.ok(lease.runs.some((run) => run.id === item.runId), `${label}: an export without its run`);
}

function universe(snapshot) {
  const items = snapshot.leases.flatMap((lease) => [['run', lease.runs], ['scratch', lease.scratches], ['export', lease.exports]].flatMap(([kind, list]) => list.map((item) => ({ kind, id: item.id, lease: lease.id }))));
  return { leases: [...snapshot.leases.map((lease) => lease.id), ABSENT.lease], items: [...items, { kind: 'run', id: ABSENT.run, lease: ABSENT.lease }] };
}

// The store operations of one step; each is { mutating, run }.
function storePlans(store, random, subject, clock, world) {
  const lease = pick(random, world.leases);
  const item = pick(random, world.items);
  const other = pick(random, world.items);
  const name = pick(random, ['a', 'b', 'shared']);
  const query = { limit: 5, offset: 0, sort: pick(random, ['created', 'name']), q: pick(random, [null, 'a', 'shared']) };
  const kind = pick(random, ['run', 'scratch', 'export']);
  const runId = item.kind === 'run' ? item.id : ABSENT.run;
  return [
    [true, () => store.apply(subject, 'createLease', { name, ttlMs: pick(random, [30, 300, 100000]) })], [true, () => store.apply(subject, 'createResource', { lease, kind: 'run', input: { name, units: 3 } })],
    [true, () => store.apply(subject, 'createResource', { lease, kind: 'scratch', input: { name } })], [true, () => store.apply(subject, 'createResource', { lease, kind: 'export', input: { name, runId } })],
    [false, () => store.readLease(subject, lease)], [false, () => store.readResource(subject, item.lease, item.kind, item.id)], [false, () => store.listLeases(subject, query)], [false, () => store.listResources(subject, lease, kind, query)],
    [true, () => store.apply(subject, 'updateResource', { lease: item.lease, kind: item.kind === 'export' ? 'run' : item.kind, id: item.id, patch: item.kind === 'scratch' ? { name } : { units: 7 } })],
    [true, () => store.apply(subject, 'deleteResource', { lease: item.lease, kind: item.kind, id: item.id })], [true, () => store.apply(subject, 'cancelRun', { lease: item.lease, id: item.id })],
    [true, () => store.apply(subject, 'endLease', { lease })], [true, () => store.batch(subject, [{ op: 'delete', lease: item.lease, kind: item.kind, id: item.id }, { op: 'cancel', lease: other.lease, kind: 'run', id: other.id }])],
    [false, () => { clock.value += pick(random, [0, 50, 400, 5000]); return { ok: true, value: {} }; }]
  ];
}

test('store level: 15 seeds of 200 random operations by both conductors and a stranger keep the global invariant after every single one', () => {
  for (let seed = 1; seed <= 15; seed += 1) {
    const random = prng(seed * 7919);
    const clock = { value: 1000 };
    const store = createStore({ now: () => clock.value, newId: sequential(), ownerEntries: OWNER_ENTRIES, owners: ['conductor-a', 'conductor-b'] });
    let previous = null;
    for (let step = 0; step < 200; step += 1) {
      const subject = pick(random, ['conductor-a', 'conductor-b', 'conductor-a', 'conductor-b', 'visitor']);
      const before = store.snapshot();
      const plans = storePlans(store, random, subject, clock, universe(before));
      // One step in sixteen is a DUPLICATE: the previous operation again (same subject, same arguments).
      const [who, mutating, run] = random() < 1 / 16 && previous ? previous : [subject, ...plans[Math.floor(random() * plans.length)]];
      previous = [who, mutating, run];
      const answer = run();
      const after = store.snapshot();
      const shown = JSON.stringify(answer.value ?? {}).match(ID_TEXT) ?? [];
      check(`seed ${seed} step ${step} ${who}`, { subject: who, mutating, before, after, now: clock.value, ok: answer.ok, ids: who === 'conductor-a' || who === 'conductor-b' ? shown : [] });
    }
  }
});

test('HTTP level: 2 seeds of 60 random requests by all five identities over real sockets keep the global invariant after every single one', async () => {
  const context = await startApp({ app: { limits: { ownerEntries: OWNER_ENTRIES }, newId: sequential() }, clock: fakeClock() });
  try {
    const tokens = Object.fromEntries(['visitor', 'conductor-a', 'conductor-b', 'operator'].map((name) => [name, context.app.issueToken(name, { ttlMs: 900000 })]));
    for (let seed = 1; seed <= 2; seed += 1) {
      const random = prng(seed * 104729);
      let last = null;
      for (let step = 0; step < 60; step += 1) {
        const who = pick(random, ['conductor-a', 'conductor-b', 'conductor-a', 'conductor-b', 'visitor', 'operator', null]);
        const subject = who ?? 'anonymous';
        const world = universe(context.app.snapshot());
        const lease = pick(random, world.leases);
        const item = pick(random, world.items);
        const other = pick(random, world.items);
        const folder = { run: 'runs', scratch: 'scratches', export: 'exports' }[item.kind];
        const name = pick(random, ['a', 'b', 'shared']);
        const plans = [
          ['POST', '/v1/leases', { name, ttlMs: pick(random, [200, 900, 600000]) }], ['POST', `/v1/leases/${lease}/runs`, { name, units: 2 }], ['POST', `/v1/leases/${lease}/scratches`, { name }],
          ['POST', `/v1/leases/${lease}/exports`, { name, runId: item.kind === 'run' ? item.id : ABSENT.run }], ['GET', `/v1/leases/${lease}`], ['GET', `/v1/leases/${item.lease}/${folder}/${item.id}`],
          ['GET', '/v1/leases?limit=3&sort=name'], ['GET', `/v1/leases/${lease}/runs?q=a`], ['PATCH', `/v1/leases/${item.lease}/${folder}/${item.id}`, item.kind === 'scratch' ? { name } : { units: 9 }],
          ['DELETE', `/v1/leases/${item.lease}/${folder}/${item.id}`], ['POST', `/v1/leases/${item.lease}/runs/${item.id}/cancel`], ['DELETE', `/v1/leases/${lease}`],
          ['POST', '/v1/batch', { ops: [{ op: 'delete', lease: item.lease, kind: item.kind, id: item.id }, { op: 'cancel', lease: other.lease, kind: 'run', id: other.id }] }],
          ['GET', '/v1/operator/leases'], ['GET', '/v1/operator/audit'], ['GET', '/v1/me']
        ];
        const choice = Math.floor(random() * (plans.length + 2));
        if (choice === plans.length) { context.clock.advance(pick(random, [100, 800, 5000])); continue; }
        const [method, route, body] = choice === plans.length + 1 && last ? last : plans[choice];
        last = [method, route, body];
        const before = same(context.app.snapshot());
        const answer = await call(context, who && tokens[who], method, route, body);
        const after = same(context.app.snapshot());
        const operator = route.startsWith('/v1/operator');
        const conductor = who === 'conductor-a' || who === 'conductor-b';
        check(`seed ${seed} step ${step} ${subject} ${method} ${route.slice(0, 60)}`, { subject, mutating: method !== 'GET', before, after, now: context.clock.now(), ok: answer.status === 200, ids: conductor ? answer.text.match(ID_TEXT) ?? [] : [] });
        if (!conductor && route !== '/v1/me' && !(who === 'operator' && operator)) assert.notEqual(answer.status, 200, `${subject} reached ${method} ${route}`);
        if (operator && answer.status === 200) for (const entry of universe(after).items) assert.equal(answer.text.includes(entry.id), false, 'the operator view shows no resource id');
      }
    }
  } finally {
    await context.close();
  }
});
