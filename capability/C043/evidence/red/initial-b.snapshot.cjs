'use strict';

// INITIAL specification tests B (written before any production file; archived as the RED and replayed unchanged against
// the final code): honest behaviour, idempotency, cancellation, restart and resume, and the recovery controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const findRoot = (dir) => (fs.existsSync(path.join(dir, 'C043.feature')) ? dir : findRoot(path.dirname(dir)));
const ROOT = findRoot(__dirname);
const SUBJECT = process.env.C043_RED_SUBJECT ? path.resolve(process.env.C043_RED_SUBJECT) : ROOT;
const accepted = (name) => require(path.join(ROOT, '..', 'C042', name));
const { openRunner } = require(path.join(SUBJECT, 'runner.cjs'));
const { openEngine } = accepted('engine.cjs');
const { createMemoryIo } = accepted('journal.cjs');

const step = (n, extra = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: `preset-a-step-${n}`, leaseId: 'synthetic-lease-001', units: 5, ...extra });
const doc = (extra = {}) => ({
  schemaVersion: 1, preset: 'bounded-sequence', idempotencyKey: 'preset-run-0001',
  bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 40 }, steps: [step(1), step(2), step(3)], ...extra,
});
const clock = () => { let now = 0; return { now: () => now, advance: (ms) => { now += ms; } }; };

function spy(real, log) {
  const record = (method, args, result) => {
    log.push({ method, args: JSON.parse(JSON.stringify(args)), result: JSON.parse(JSON.stringify(result)) });
    return result;
  };
  const wrap = (method) => (...args) => {
    const out = real[method](...args);
    return out && typeof out.then === 'function' ? out.then((value) => record(method, args, value)) : record(method, args, out);
  };
  return {
    submit: wrap('submit'), inspect: wrap('inspect'), cancel: wrap('cancel'), resume: wrap('resume'),
    unsupportedAction: wrap('unsupportedAction'), leases: () => real.leases(), snapshot: () => real.snapshot(),
    halt: () => real.halt(), get tornTailBytes() { return real.tornTailBytes; },
  };
}

async function boot({ executor, stepIo = createMemoryIo(), runIo = createMemoryIo(), clk = clock() } = {}) {
  const real = await openEngine({ io: stepIo, executor });
  const log = [];
  const runner = await openRunner({ engine: spy(real, log), io: runIo, clock: clk.now });
  return { real, log, runner, stepIo, runIo, clk };
}

const committed = (real, lease = 'synthetic-lease-001') => real.leases()[lease].committed;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function gate() {
  const entered = new Map();
  const released = new Map();
  const slot = (map, key) => { if (!map.has(key)) map.set(key, deferred()); return map.get(key); };
  return {
    executor: async ({ key }) => { slot(entered, key).resolve(); await slot(released, key).promise; },
    entered: (key) => slot(entered, key).promise,
    release: (key) => slot(released, key).resolve(),
  };
}

// Waits until the executor holds the step, and fails (instead of hanging) when the answer arrives first.
async function inFlight(held, key, pending) {
  const first = await Promise.race([held.entered(key).then(() => 'in-flight'), Promise.allSettled(pending).then(() => 'answered-first')]);
  assert.equal(first, 'in-flight', `step ${key} must be in flight while its executor holds it`);
}

const statuses = (body) => body.steps.map((entry) => entry.status);
const normal = (body) => ({ ...body, replayed: false, steps: body.steps.map((entry) => ({ ...entry, appliedByThisRequest: false })) });

test('the preset stops at the first refused step and lists what ran, what did not and which effects stand', { timeout: 30000 }, async () => {
  const { runner, real, log } = await boot();
  const lease2 = (n, units) => step(n, { leaseId: 'synthetic-lease-002', units });
  const answer = await runner.run(doc({ steps: [lease2(1, 6), lease2(2, 6), step(3)] }));
  assert.equal(answer.status, 409);
  assert.equal(answer.body.outcome, 'failed');
  assert.equal(answer.body.classification, 'FAILED');
  assert.equal(answer.body.accepted, false);
  assert.equal(answer.body.error.code, 'PRESET_STEP_FAILED');
  assert.equal(answer.body.error.details[0].code, 'CAPACITY_EXHAUSTED');
  assert.deepEqual(statuses(answer.body), ['succeeded', 'failed', 'not-run']);
  assert.deepEqual(answer.body.ran, [1, 2]);
  assert.deepEqual(answer.body.notRun, [3]);
  assert.equal(answer.body.effects.length, 1);
  assert.deepEqual(log.map((call) => call.method), ['submit', 'submit'], 'step 3 is never called');
  assert.equal(committed(real, 'synthetic-lease-002'), 6);
  assert.equal(committed(real), 0);
});

test('a step whose executor fails stops the preset as INTERRUPTED, not as a failure and not as a success', { timeout: 30000 }, async () => {
  const { runner, log } = await boot({ executor: async ({ key }) => { if (key === 'preset-a-step-2') throw new Error('synthetic failure'); } });
  const answer = await runner.run(doc());
  assert.equal(answer.status, 409);
  assert.equal(answer.body.outcome, 'interrupted');
  assert.equal(answer.body.classification, 'INTERRUPTED');
  assert.equal(answer.body.error.code, 'PRESET_INTERRUPTED');
  assert.deepEqual(statuses(answer.body), ['succeeded', 'interrupted', 'not-run']);
  assert.deepEqual(answer.body.recovery.allowed, ['resume', 'cancel', 'inspect']);
  assert.equal(answer.body.effects.length, 1);
  assert.deepEqual(log.map((call) => call.method), ['submit', 'submit']);
});

test('re-running with the same idempotency key gives one set of effects and the same result', { timeout: 30000 }, async (context) => {
  await context.test('a sequential re-run is the recorded result and calls no step again', async () => {
    const { runner, real, log } = await boot();
    const first = await runner.run(doc());
    const calls = log.length;
    const again = await runner.run(doc());
    assert.equal(again.status, 200);
    assert.equal(again.body.replayed, true);
    assert.deepEqual(normal(again.body), normal(first.body));
    assert.equal(log.length, calls);
    assert.equal(committed(real), 15);
  });
  await context.test('parallel duplicates join the preset in flight', async () => {
    const held = gate();
    const { runner, real, log } = await boot({ executor: held.executor });
    const all = [runner.run(doc()), runner.run(doc()), runner.run(doc())];
    for (const n of [1, 2, 3]) {
      await inFlight(held, `preset-a-step-${n}`, all);
      held.release(`preset-a-step-${n}`);
    }
    const answers = await Promise.all(all);
    assert.equal(answers.filter((answer) => answer.body.replayed === false).length, 1);
    assert.deepEqual(answers.map((answer) => answer.body.outcome), ['succeeded', 'succeeded', 'succeeded']);
    assert.equal(answers.filter((answer) => answer.status === 201).length, 1);
    assert.equal(log.filter((call) => call.method === 'submit').length, 3);
    assert.equal(committed(real), 15);
  });
  await context.test('the same key with a different preset is a typed conflict and changes nothing', async () => {
    const { runner, real, log } = await boot();
    await runner.run(doc());
    const calls = log.length;
    const answer = await runner.run(doc({ steps: [step(1), step(2, { units: 6 }), step(3)] }));
    assert.equal(answer.status, 409);
    assert.equal(answer.body.outcome, 'rejected');
    assert.equal(answer.body.error.code, 'IDEMPOTENCY_KEY_CONFLICT');
    assert.equal(answer.body.recovery.allowed.includes('correct-and-resubmit'), true);
    assert.equal(log.length, calls);
    assert.equal(committed(real), 15);
  });
});

test('cancellation is explicit, applies to the step in flight and is never a success', { timeout: 30000 }, async (context) => {
  await context.test('cancel while step 2 is in flight', async () => {
    const held = gate();
    const { runner, real } = await boot({ executor: held.executor });
    const running = runner.run(doc());
    await inFlight(held, 'preset-a-step-1', [running]);
    held.release('preset-a-step-1');
    await inFlight(held, 'preset-a-step-2', [running]);
    const cancelled = await runner.cancel('preset-run-0001');
    const original = await running;
    held.release('preset-a-step-2');
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.accepted, true);
    assert.equal(cancelled.body.outcome, 'cancelled');
    assert.equal(cancelled.body.classification, 'CANCELLED');
    assert.equal(cancelled.body.error.code, 'PRESET_CANCELLED');
    assert.deepEqual(statuses(cancelled.body), ['succeeded', 'cancelled', 'not-run']);
    assert.deepEqual(cancelled.body.notRun, [3]);
    assert.equal(cancelled.body.effects.length, 1);
    assert.equal(original.body.outcome, 'cancelled');
    assert.equal(original.body.accepted, false);
    assert.deepEqual(real.leases()['synthetic-lease-001'], { capacity: 100, committed: 5, held: 0, available: 95 });
  });
  await context.test('cancelling a completed preset is a typed refusal that lists what is allowed', async () => {
    const { runner } = await boot();
    await runner.run(doc());
    const answer = await runner.cancel('preset-run-0001');
    assert.equal(answer.status, 409);
    assert.equal(answer.body.accepted, false);
    assert.equal(answer.body.error.code, 'ACTION_NOT_ALLOWED');
    assert.deepEqual(answer.body.recovery.allowed, ['retry', 'inspect']);
  });
});

test('after a restart the preset is INTERRUPTED until an explicit resume, which never re-executes an acknowledged step', { timeout: 30000 }, async () => {
  const held = gate();
  const first = await boot({ executor: held.executor });
  const running = first.runner.run(doc());
  await inFlight(held, 'preset-a-step-1', [running]);
  held.release('preset-a-step-1');
  await inFlight(held, 'preset-a-step-2', [running]);
  first.runner.halt();
  first.real.halt();
  await running.catch(() => {});
  const second = await boot({ stepIo: first.stepIo, runIo: first.runIo });
  const inspected = second.runner.inspect('preset-run-0001');
  assert.equal(inspected.body.outcome, 'interrupted');
  assert.equal(inspected.body.run.state, 'interrupted');
  assert.equal(inspected.body.recovery.allowed.includes('resume'), true);
  assert.deepEqual(statuses(inspected.body), ['succeeded', 'interrupted', 'not-run']);
  assert.deepEqual(second.log, [], 'nothing is resumed or called automatically');
  const resumed = await second.runner.resume('preset-run-0001');
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.outcome, 'succeeded');
  assert.deepEqual(resumed.body.ran, [1, 2, 3]);
  assert.equal(second.log.some((call) => JSON.stringify(call.args).includes('preset-a-step-1')), false, 'the acknowledged step is not called again');
  assert.equal(committed(second.real), 15);
  const again = await second.runner.resume('preset-run-0001');
  assert.equal(again.body.error.code, 'ACTION_NOT_ALLOWED');
});

test('only the offered recovery controls execute and every other action is a typed refusal', { timeout: 30000 }, async (context) => {
  await context.test('every offered control of an interrupted preset works', async () => {
    const make = () => boot({ executor: async ({ key }) => { if (key === 'preset-a-step-2') throw new Error('synthetic failure'); } });
    const a = await make();
    const interrupted = await a.runner.run(doc());
    assert.deepEqual(interrupted.body.recovery.allowed, ['resume', 'cancel', 'inspect']);
    assert.equal(a.runner.inspect('preset-run-0001').body.accepted, true);
    const cancelled = await a.runner.cancel('preset-run-0001');
    assert.equal(cancelled.body.outcome, 'cancelled');
    const b = await make();
    await b.runner.run(doc());
    const resumed = await b.runner.resume('preset-run-0001');
    assert.equal(resumed.body.outcome, 'interrupted', 'the executor still fails, so resume reports the honest outcome');
  });
  await context.test('an action that does not exist is UNSUPPORTED_ACTION and changes nothing', async () => {
    const { runner, real, log } = await boot();
    await runner.run(doc());
    const calls = log.length;
    const answer = runner.unsupportedAction('preset-run-0001');
    assert.equal(answer.status, 422);
    assert.equal(answer.body.error.code, 'UNSUPPORTED_ACTION');
    assert.equal(answer.body.accepted, false);
    assert.equal(runner.inspect('preset-run-0001').body.run.state, 'completed');
    assert.equal(log.length, calls);
    assert.equal(committed(real), 15);
  });
  await context.test('an unknown preset is RUN_NOT_FOUND for inspect, cancel and resume', async () => {
    const { runner } = await boot();
    for (const answer of [runner.inspect('no-such-run-001'), await runner.cancel('no-such-run-001'), await runner.resume('no-such-run-001')]) {
      assert.equal(answer.status, 404);
      assert.equal(answer.body.error.code, 'RUN_NOT_FOUND');
    }
  });
});
