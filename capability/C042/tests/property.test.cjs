'use strict';

// A stateful property test whose operation alphabet includes the RECOVERY operations (journal write failures that
// landed, were lost or tore the file; an executor failure; a restart; cancel and explicit resume) next to the plain
// ones. A global invariant, derived from the journal itself and not from the engine, is checked after EVERY operation.
const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../contract.js');
const { openEngine } = require('../engine.cjs');
const input = require('../input.cjs');
const journal = require('../journal.cjs');
const { deferred } = require('./support.cjs');

const SEEDS = 40;
const OPERATIONS = 70;
const KEYS = Array.from({ length: 6 }, (_, index) => `key-000${index}-prop`);
const rng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const inputFor = (key, bump = 0) => input.validateInput({
  schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key,
  leaseId: KEYS.indexOf(key) % 2 ? 'synthetic-lease-002' : 'synthetic-lease-001', units: (KEYS.indexOf(key) % 2 ? 4 : 1 + (KEYS.indexOf(key) % 3)) + bump,
}).input;
const turns = async () => { for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };

function makeWorld() {
  const inner = journal.createMemoryIo();
  const world = { armed: null, failExecutor: false, released: new Set(), gates: new Map(), responses: [], errors: [], pending: [], log: [] };
  world.io = {
    kind: 'faulty', read: () => inner.read(), truncate: (bytes) => inner.truncate(bytes),
    append(text) {
      const mode = world.armed;
      world.armed = null;
      if (mode === 'landed') inner.append(text);
      if (mode === 'torn') inner.append(text.slice(0, Math.floor(text.length / 2)));
      if (mode) throw new Error('EIO');
      inner.append(text);
    },
  };
  world.raw = inner;
  world.gate = (key) => { if (!world.gates.has(key)) world.gates.set(key, deferred()); return world.gates.get(key); };
  world.executor = async ({ key }) => {
    if (world.failExecutor) { world.failExecutor = false; throw new Error('executor failure'); }
    if (!world.released.has(key)) await world.gate(key).promise;
  };
  world.release = (key) => { world.released.add(key); world.gate(key).resolve(); };
  world.track = (promise, meta) => {
    const record = { ...meta, settled: false };
    world.pending.push(record);
    promise.then((answer) => { record.settled = true; world.responses.push({ ...meta, status: answer.status, body: answer.body }); }, (error) => { record.settled = true; world.errors.push(error); });
  };
  return world;
}

function derive(world) {
  const copy = journal.createMemoryIo();
  copy.append(world.raw.read());
  const { records } = journal.openJournal(copy);
  const keys = new Map();
  const committed = {};
  for (const record of records) {
    const step = keys.get(record.key);
    if (record.type === 'begin') {
      assert.equal(step, undefined, `${record.key} began twice`);
      keys.set(record.key, { state: 'open', input: record.input, commit: null });
      continue;
    }
    assert.equal(step?.state, 'open', `${record.type} for ${record.key} outside an open step`);
    if (record.type === 'cancel') step.state = 'cancelled';
    if (record.type === 'commit') {
      committed[record.leaseId] = (committed[record.leaseId] ?? 0) + record.units;
      assert.deepEqual([record.leaseId, record.units, record.reservedAfter], [step.input.leaseId, step.input.units, committed[record.leaseId]], `commit of ${record.key} matches its step and the running total`);
      assert.equal(committed[record.leaseId] <= contract.LEASES[record.leaseId], true, 'a lease is never oversubscribed');
      step.state = 'committed';
      step.commit = record;
    }
  }
  return { keys, committed, records };
}

// The global invariant: journal grammar, ledger, engine agreement, honest answers, one effect per key, counts reconcile.
function check(world, engine, label) {
  const derived = derive(world);
  const states = {};
  for (const key of KEYS) {
    const seen = engine.inspect(key).body;
    const step = derived.keys.get(key);
    states[key] = seen.step.state;
    if (!step) { assert.equal(seen.error.code, 'STEP_NOT_FOUND', `${label}: ${key} is unknown to the journal and to the engine`); continue; }
    if (step.state === 'committed') {
      assert.deepEqual([seen.step.state, seen.effect.reservedAfter, seen.trail.filter((item) => item.type === 'commit').length], ['committed', step.commit.reservedAfter, 1], `${label}: ${key}`);
    } else if (step.state === 'cancelled') {
      assert.equal(seen.step.state, 'cancelled', `${label}: ${key}`);
    } else {
      assert.equal(['in-flight', 'interrupted', 'uncertain'].includes(seen.step.state), true, `${label}: ${key} is ${seen.step.state}`);
      assert.equal(seen.effect.applied === true, false, `${label}: an unfinished step is never applied`);
    }
  }
  for (const [leaseId, capacity] of Object.entries(contract.LEASES)) {
    const lease = engine.leases()[leaseId];
    const inFlight = KEYS.filter((key) => states[key] === 'in-flight' && derived.keys.get(key).input.leaseId === leaseId).reduce((sum, key) => sum + derived.keys.get(key).input.units, 0);
    assert.deepEqual([lease.committed, lease.held], [derived.committed[leaseId] ?? 0, inFlight], `${label}: ledger of ${leaseId}`);
    assert.equal(lease.committed + lease.held <= capacity, true);
  }
  const appliers = new Map();
  for (const response of world.responses) {
    const { body } = response;
    assert.deepEqual(contract.validateResultEnvelope(body), { ok: true, problems: [] }, `${label}: envelope of ${response.op}`);
    assert.equal(response.status >= 200 && response.status < 300, body.accepted, `${label}: HTTP status and accepted agree`);
    if (body.outcome === 'succeeded') assert.equal(derived.keys.get(body.idempotencyKey)?.commit?.reservedAfter, body.effect.reservedAfter, `${label}: success only for a journaled commit`);
    if (body.outcome === 'cancelled') assert.equal(derived.keys.get(body.idempotencyKey).commit, null, `${label}: a cancelled step has no effect`);
    if (body.outcome === 'unknown') assert.notEqual(body.effect.applied, true);
    if (body.effect.appliedByThisRequest) appliers.set(body.idempotencyKey, (appliers.get(body.idempotencyKey) ?? 0) + 1);
  }
  for (const [key, count] of appliers) assert.equal(count === 1 && derived.keys.get(key).commit !== null, true, `${label}: ${key} was applied by ${count} requests`);
  const applied = world.responses.filter((item) => item.body.effect.appliedByThisRequest).length;
  const duplicates = world.responses.filter((item) => item.body.outcome === 'succeeded' && item.body.replayed).length;
  assert.equal(applied + duplicates + (world.responses.length - applied - duplicates), world.responses.length);
  assert.equal(applied <= [...derived.keys.values()].filter((step) => step.state === 'committed').length, true, `${label}: no more applied claims than effects`);
  assert.deepEqual(world.errors, []);
  return states;
}

async function run(seed) {
  const random = rng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const world = makeWorld();
  let engine = await openEngine({ io: world.io, executor: world.executor });
  const operations = {
    submit: () => { const key = pick(KEYS); world.track(engine.submit(inputFor(key)), { op: `submit ${key}`, key }); },
    conflict: () => { const key = pick(KEYS); world.track(engine.submit(inputFor(key, 1)), { op: `conflict ${key}`, key }); },
    release: () => world.release(pick(KEYS)),
    cancel: () => { const key = pick(KEYS); const answer = engine.cancel(key); world.responses.push({ op: `cancel ${key}`, key, status: answer.status, body: answer.body }); },
    resume: () => { const key = pick(KEYS); world.track(engine.resume(key), { op: `resume ${key}`, key }); },
    inspect: () => { const key = pick(KEYS); const answer = engine.inspect(key); world.responses.push({ op: `inspect ${key}`, key, status: answer.status, body: answer.body }); },
    undo: () => { const key = pick(KEYS); const answer = engine.unsupportedAction(key); world.responses.push({ op: `undo ${key}`, key, status: answer.status, body: answer.body }); },
    failLanded: () => { world.armed = 'landed'; },
    failLost: () => { world.armed = 'lost'; },
    failTorn: () => { world.armed = 'torn'; },
    failExecutor: () => { world.failExecutor = true; },
    restart: async () => {
      const before = check(world, engine, `seed ${seed} before restart`);
      engine.halt();
      for (const item of world.pending) if (!item.settled) item.abandoned = true;
      engine = await openEngine({ io: world.io, executor: world.executor });
      const after = check(world, engine, `seed ${seed} after restart`);
      for (const key of KEYS) {
        const kept = ['committed', 'cancelled', 'none'].includes(before[key]);
        assert.equal(kept ? after[key] === before[key] : after[key] === 'interrupted', true, `seed ${seed}: ${key} was ${before[key]} and is ${after[key]} after the restart`);
      }
      assert.equal(engine.leases()['synthetic-lease-002'].held + engine.leases()['synthetic-lease-001'].held, 0, 'nothing is in flight after a restart');
    },
  };
  const alphabet = ['submit', 'submit', 'submit', 'submit', 'conflict', 'release', 'release', 'cancel', 'cancel', 'resume', 'resume', 'inspect', 'undo', 'failLanded', 'failLost', 'failTorn', 'failExecutor', 'restart', 'restart'];
  for (let step = 0; step < OPERATIONS; step += 1) {
    const name = pick(alphabet);
    world.log.push(name);
    await operations[name]();
    await turns();
    check(world, engine, `seed ${seed} step ${step} after ${name} [${world.log.slice(-6).join(', ')}]`);
  }
  for (const key of KEYS) world.release(key);
  for (let guard = 0; guard < 5000 && world.pending.some((item) => !item.settled && !item.abandoned); guard += 1) await new Promise((resolve) => setImmediate(resolve));
  const stuck = world.pending.filter((item) => !item.settled && !item.abandoned);
  assert.deepEqual(stuck.map((item) => item.op), [], `seed ${seed}: requests of the running service that never finished`);
  check(world, engine, `seed ${seed} after draining`);
  return world;
}

test('no sequence of operations, recovery paths included, applies a key twice or reports an unjournaled success', async () => {
  const totals = { responses: 0, applied: 0, replays: 0, outcomes: new Set(), restarts: 0, codes: new Set() };
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const world = await run(seed);
    totals.responses += world.responses.length;
    totals.applied += world.responses.filter((item) => item.body.effect.appliedByThisRequest).length;
    totals.replays += world.responses.filter((item) => item.body.replayed && item.body.outcome === 'succeeded').length;
    totals.restarts += world.log.filter((name) => name === 'restart').length;
    for (const response of world.responses) { totals.outcomes.add(response.body.outcome); if (response.body.error) totals.codes.add(response.body.error.code); }
  }
  assert.equal(totals.responses > 1500, true, `${totals.responses} responses were checked`);
  assert.equal(totals.applied > 40 && totals.replays > 40 && totals.restarts > 100, true, JSON.stringify({ ...totals, outcomes: [...totals.outcomes], codes: [...totals.codes] }));
  for (const outcome of contract.OUTCOMES) assert.equal(totals.outcomes.has(outcome), true, `the walk reached ${outcome}`);
  for (const code of ['JOURNAL_UNCERTAIN', 'STEP_INTERRUPTED', 'STEP_CANCELLED', 'IDEMPOTENCY_KEY_CONFLICT', 'CAPACITY_EXHAUSTED', 'ACTION_NOT_ALLOWED']) assert.equal(totals.codes.has(code), true, `the walk reached ${code}`);
});
