'use strict';

// A seeded stateful property test. The operation alphabet includes the recovery operations next to the plain ones:
// start, duplicate key, conflicting key, cancel, resume, inspect, release a held step, crash and restart, a step
// failure, a bound exceeded (injected clock), an unsupported action and an invalid preset. After EVERY operation a
// global invariant derived from the two journals (not from the runner) is checked.
const test = require('node:test');
const {
  assert, clock, createMemoryIo, deferred, doc, settle, spy, step,
} = require('./support.cjs');
const { openEngine } = require('../../C042/engine.cjs');
const { openJournal } = require('../../C042/journal.cjs');
const { openRunner } = require('../runner.cjs');
const { openRunLog } = require('../runlog.cjs');
const { checkAnswer } = require('../verify.js');
const { validateResultEnvelope } = require('../envelope.js');

function lcg(seed) {
  let state = seed >>> 0;
  return { next: () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }, int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); } };
}

const copyOf = (io) => { const copy = createMemoryIo(); copy.append(io.read()); return copy; };

async function createWorld(seed) {
  const random = lcg(seed);
  const world = { random, stepIo: createMemoryIo(), runIo: createMemoryIo(), fired: [], runs: [], count: 0, terminal: new Map(), log: [] };
  world.plan = { fail: new Set(), hold: new Set(), holds: new Map(), clk: clock(), tick: 0 };
  const executor = async ({ key }) => {
    world.plan.clk.advance(world.plan.tick);
    if (world.plan.hold.has(key)) {
      if (!world.plan.holds.has(key)) world.plan.holds.set(key, deferred());
      await world.plan.holds.get(key).promise;
    }
    if (world.plan.fail.has(key)) { world.plan.fail.delete(key); throw new Error('synthetic failure'); }
  };
  world.boot = async () => {
    world.real = await openEngine({ io: world.stepIo, executor });
    world.log = [];
    world.runner = await openRunner({ engine: spy(world.real, world.log), io: world.runIo, clock: world.plan.clk.now });
  };
  await world.boot();
  return world;
}

function makeDoc(world, bounds) {
  world.count += 1;
  const n = String(world.count).padStart(4, '0');
  const steps = Array.from({ length: world.random.int(1, 3) }, (_, index) => step(index, {
    idempotencyKey: `prop-${n}-step-${index + 1}`, leaseId: world.random.next() < 0.4 ? 'synthetic-lease-002' : 'synthetic-lease-001', units: world.random.int(1, 6),
  }));
  return doc({ idempotencyKey: `prop-run-${n}`, bounds: { maxSteps: 4, maxDurationMs: 60000, maxUnits: 40, ...bounds }, steps });
}

const fire = (world, label, promise) => {
  const slot = { label, done: false, answer: null, error: null };
  Promise.resolve(promise).then((answer) => { slot.done = true; slot.answer = answer; }, (error) => { slot.done = true; slot.error = error; });
  world.fired.push(slot);
};
const pick = (world, list) => list[world.random.int(0, list.length - 1)];
const unfinishedStepKeys = (world) => world.runs.flatMap((entry) => entry.steps.map((item) => item.idempotencyKey));

const OPERATIONS = [
  [22, 'start', (world) => { const entry = makeDoc(world); world.runs.push(entry); if (world.random.next() < 0.4) world.plan.hold.add(entry.steps[0].idempotencyKey); fire(world, 'start', world.runner.run(entry)); }],
  [8, 'duplicate', (world) => { if (world.runs.length) fire(world, 'duplicate', world.runner.run(pick(world, world.runs))); }],
  [4, 'conflict', (world) => {
    if (!world.runs.length) return;
    const entry = pick(world, world.runs);
    fire(world, 'conflict', world.runner.run({ ...entry, steps: entry.steps.map((item, index) => (index === 0 ? { ...item, units: item.units === 6 ? 5 : item.units + 1 } : item)) }));
  }],
  [12, 'release', (world) => { const key = pick(world, [...world.plan.hold, 'none']); if (key !== 'none') { world.plan.hold.delete(key); world.plan.holds.get(key)?.resolve(); } }],
  [10, 'inspect', (world) => { if (world.runs.length) fire(world, 'inspect', world.runner.inspect(pick(world, world.runs).idempotencyKey)); }],
  [8, 'cancel', (world) => { if (world.runs.length) fire(world, 'cancel', world.runner.cancel(pick(world, world.runs).idempotencyKey)); }],
  [12, 'resume', (world) => { if (world.runs.length) fire(world, 'resume', world.runner.resume(pick(world, world.runs).idempotencyKey)); }],
  [6, 'crash', async (world) => { world.runner.halt(); world.real.halt(); await world.boot(); }],
  [8, 'fail-next', (world) => { if (world.runs.length) world.plan.fail.add(pick(world, unfinishedStepKeys(world))); }],
  [5, 'bound', (world) => { world.plan.tick = 700; const entry = makeDoc(world, { maxDurationMs: 1000 }); world.runs.push(entry); fire(world, 'bound', world.runner.run(entry)); }],
  [2, 'unsupported', (world) => { if (world.runs.length) fire(world, 'unsupported', world.runner.unsupportedAction(pick(world, world.runs).idempotencyKey)); }],
  [4, 'invalid', (world) => { fire(world, 'invalid', world.runner.run({ ...makeDoc(world), steps: [step(1, { units: 99 })] })); }],
];

function ackedSuccess(world) {
  const log = openRunLog(copyOf(world.runIo));
  const keys = new Set();
  for (const run of log.runs.values()) for (const ack of run.acks) if (ack && ['succeeded', 'replayed'].includes(ack.status)) keys.add(ack.key);
  return keys;
}

// The global invariant, derived from the journals: the step journal is the truth about effects, the preset journal about runs.
function check(world, before, mark, label) {
  const at = `${label} (seed ${world.seed})`;
  for (const slot of world.fired) {
    assert.equal(slot.error, null, `${at}: ${slot.label} threw ${slot.error && slot.error.stack}`);
    if (!slot.done || slot.checked) continue;
    slot.checked = true;
    assert.equal(validateResultEnvelope(slot.answer.body).ok, true, `${at}: ${slot.label} answered an invalid envelope ${JSON.stringify(validateResultEnvelope(slot.answer.body).problems)}`);
    assert.equal(checkAnswer(slot.answer.status, slot.answer.body, undefined).ok, true, `${at}: ${slot.label} answered a dishonest HTTP status`);
  }
  const steps = openJournal(copyOf(world.stepIo)).records;
  const begins = new Map();
  const commits = new Map();
  for (const record of steps) {
    const map = record.type === 'begin' ? begins : record.type === 'commit' ? commits : null;
    if (map) map.set(record.key, (map.get(record.key) ?? 0) + 1);
  }
  for (const [key, count] of [...begins, ...commits]) assert.equal(count, 1, `${at}: ${key} has more than one begin or commit`);
  for (const key of commits.keys()) assert.equal(begins.has(key), true, `${at}: a commit without a begin`);
  const totals = {};
  for (const record of steps.filter((item) => item.type === 'commit')) totals[record.leaseId] = (totals[record.leaseId] ?? 0) + record.units;
  assert.equal((totals['synthetic-lease-001'] ?? 0) <= 100 && (totals['synthetic-lease-002'] ?? 0) <= 10, true, `${at}: a lease is oversubscribed`);
  const log = openRunLog(copyOf(world.runIo));
  for (const run of log.runs.values()) {
    for (const ack of run.acks.filter((item) => item && ['succeeded', 'replayed'].includes(item.status))) assert.equal(commits.has(ack.key), true, `${at}: ${ack.key} is acknowledged as success without a committed effect`);
    if (run.terminal && run.terminal.state === 'completed') assert.equal(run.done, run.preset.steps.length, `${at}: completed with an unacknowledged step`);
    if (run.terminal) {
      const frozen = JSON.stringify([run.terminal, run.acks]);
      assert.equal(world.terminal.get(run.key) ?? frozen, frozen, `${at}: a terminal run changed`);
      world.terminal.set(run.key, frozen);
    }
  }
  for (const run of [...log.runs.values()].slice(-4)) {
    const view = world.runner.inspect(run.key);
    assert.equal(validateResultEnvelope(view.body).ok, true, `${at}: inspect answered an invalid envelope ${JSON.stringify(validateResultEnvelope(view.body).problems)}`);
    assert.equal(view.body.effects.length, run.acks.filter((item) => item && item.applied === true).length, `${at}: the listing disagrees with the journal`);
  }
  for (const entry of world.log.slice(mark)) {
    const key = entry.method === 'submit' ? entry.args[0].idempotencyKey : entry.args[0];
    if (['submit', 'resume', 'cancel'].includes(entry.method)) assert.equal(before.has(key), false, `${at}: ${entry.method} called the already acknowledged step ${key}`);
  }
}

const SEEDS = 20;
const STEPS_PER_SEED = 50;

test(`stateful property: ${SEEDS} seeds x ${STEPS_PER_SEED} operations, recovery operations in the alphabet, invariant after every operation`, { timeout: 240000 }, async () => {
  const total = OPERATIONS.reduce((sum, [weight]) => sum + weight, 0);
  const seen = {};
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const world = await createWorld(seed);
    world.seed = seed;
    for (let index = 0; index < STEPS_PER_SEED; index += 1) {
      let roll = world.random.int(1, total);
      const [, name, run] = OPERATIONS.find(([weight]) => { roll -= weight; return roll <= 0; });
      seen[name] = (seen[name] ?? 0) + 1;
      const before = ackedSuccess(world);
      const mark = name === 'crash' ? 0 : world.log.length;
      await run(world);
      await settle();
      check(world, before, mark, `op ${index} ${name}`);
    }
    for (const key of [...world.plan.hold]) { world.plan.hold.delete(key); world.plan.holds.get(key)?.resolve(); }
    world.runner.halt();
    world.real.halt();
  }
  for (const [, name] of OPERATIONS) assert.equal((seen[name] ?? 0) > 5, true, `the alphabet must be exercised: ${name} ran ${seen[name] ?? 0} times`);
});
