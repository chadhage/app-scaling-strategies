'use strict';

// THE SAME STEPS: the automatic runner invokes the accepted C042 step service and nothing else. A spy at the shared
// boundary, a differential property test over seeded random presets (no library) and a test that a private copy of
// the step service is caught.
const test = require('node:test');
const {
  assert, boot, clock, committed, createMemoryIo, doc, methods, step,
} = require('./support.cjs');
const input = require('../../C042/input.cjs');
const { openEngine } = require('../../C042/engine.cjs');
const { openRunner } = require('../runner.cjs');

// A tiny seeded LCG: deterministic, no library.
function lcg(seed) {
  let state = seed >>> 0;
  return { next: () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }, int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); } };
}

function randomCase(seed) {
  const random = lcg(seed);
  const count = random.int(1, 6);
  const steps = Array.from({ length: count }, (_, index) => step(`diff-${seed}-${index + 1}`, { idempotencyKey: `diff-${seed}-step-${index + 1}`, leaseId: random.next() < 0.5 ? 'synthetic-lease-002' : 'synthetic-lease-001', units: random.int(1, 10) }));
  const failing = new Set(steps.filter(() => random.next() < 0.1).map((entry) => entry.idempotencyKey));
  const applied = steps.filter(() => random.next() < 0.2);
  return { steps, failing, applied, preset: doc({ idempotencyKey: `diff-run-${seed}`, bounds: { maxSteps: 8, maxDurationMs: 60000, maxUnits: 80 }, steps }) };
}

const outcome = (answer) => answer.body.outcome;
const executorFor = (failing) => async ({ key }) => { if (failing.has(key)) throw new Error('synthetic step failure'); };

test('the spy sees exactly what a manual run sees: the frozen output of the C042 validator', { timeout: 30000 }, async () => {
  const seen = [];
  const real = await openEngine({ io: createMemoryIo() });
  const engine = { submit: (value) => { seen.push(value); return real.submit(value); }, inspect: (key) => real.inspect(key), cancel: (key) => real.cancel(key), resume: (key) => real.resume(key) };
  const runner = await openRunner({ engine, io: createMemoryIo(), clock: () => 0 });
  assert.equal((await runner.run(Buffer.from(JSON.stringify(doc())))).body.outcome, 'succeeded');
  assert.equal(seen.length, 3);
  for (const [index, value] of seen.entries()) {
    const manual = input.parseBody(Buffer.from(JSON.stringify(doc().steps[index])));
    assert.equal(Object.isFrozen(value), true, 'every step handed to the step service is the frozen output of the C042 validator');
    assert.deepEqual(Object.keys(value), Object.keys(manual.input));
    assert.deepEqual({ ...value }, { ...manual.input });
  }
});

test('a private copy of the step service is caught: the shared boundary sees nothing and the ledger stays empty', { timeout: 30000 }, async () => {
  const shared = await boot();
  const privateEngine = await openEngine({ io: createMemoryIo() });
  const runner = await openRunner({ engine: privateEngine, io: createMemoryIo(), clock: () => 0 });
  await runner.run(doc());
  assert.deepEqual(shared.log, [], 'the spy at the shared boundary recorded no call');
  assert.equal(committed(shared.real), 0, 'the shared ledger is unchanged');
  assert.equal(committed(privateEngine), 15, 'the work happened in a copy, which the same-steps proof exposes');
});

test('differential property: for 80 seeded random presets the preset run equals the manual run, call for call', { timeout: 120000 }, async () => {
  let failed = 0;
  let interrupted = 0;
  let replayed = 0;
  let completed = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const sample = randomCase(seed);
    const prepare = async (booted) => { for (const entry of sample.applied) await booted.real.submit(entry); booted.log.length = 0; };
    const manual = await boot({ executor: executorFor(sample.failing) });
    await prepare(manual);
    const manualAnswers = [];
    for (const entry of sample.steps) {
      const parsed = input.parseBody(Buffer.from(JSON.stringify(entry)));
      const answer = await manual.engine.submit(parsed.input);
      manualAnswers.push(answer);
      if (answer.body.outcome !== 'succeeded') break;
    }
    const automatic = await boot({ executor: executorFor(sample.failing) });
    await prepare(automatic);
    const answer = await automatic.runner.run(sample.preset);
    assert.deepEqual(automatic.log, manual.log, `seed ${seed}: same calls, arguments and results`);
    assert.equal(automatic.stepIo.read(), manual.stepIo.read(), `seed ${seed}: same step-journal records`);
    assert.deepEqual(automatic.real.leases(), manual.real.leases(), `seed ${seed}: same ledger`);
    assert.deepEqual(methods(automatic.log), manualAnswers.map(() => 'submit'));
    assert.equal(answer.body.ran.length, manualAnswers.length, `seed ${seed}: the preset ran exactly the steps the manual run ran`);
    const last = manualAnswers.at(-1).body;
    const expected = last.outcome === 'succeeded' ? 'succeeded' : last.outcome === 'interrupted' ? 'interrupted' : last.outcome === 'unknown' ? 'unknown' : 'failed';
    assert.equal(outcome(answer), manualAnswers.length === sample.steps.length && last.outcome === 'succeeded' ? 'succeeded' : expected, `seed ${seed}`);
    manualAnswers.forEach((entry, index) => {
      const fact = answer.body.steps[index];
      assert.equal(fact.applied, entry.body.effect.applied === null ? null : entry.body.effect.applied, `seed ${seed} step ${index + 1}`);
      assert.equal(fact.appliedByThisRequest, entry.body.effect.appliedByThisRequest);
    });
    if (answer.body.outcome === 'failed') failed += 1;
    if (answer.body.outcome === 'interrupted') interrupted += 1;
    if (answer.body.steps.some((entry) => entry.status === 'replayed')) replayed += 1;
    if (answer.body.outcome === 'succeeded') completed += 1;
  }
  assert.equal(failed >= 3 && interrupted >= 3 && replayed >= 3 && completed >= 10, true, `the seeds must exercise failures (${failed}), interruptions (${interrupted}), replays (${replayed}) and completions (${completed})`);
});

test('a differential run with a duration bound stops where the clock says and the manual run has no such stop', { timeout: 30000 }, async () => {
  const clk = clock();
  const booted = await boot({ clk, executor: async () => { clk.advance(300); } });
  const answer = await booted.runner.run(doc({ bounds: { maxSteps: 4, maxDurationMs: 500, maxUnits: 40 } }));
  assert.equal(answer.body.error.code, 'PRESET_BOUND_EXCEEDED');
  assert.deepEqual(methods(booted.log), ['submit', 'submit']);
  const manual = await boot({ clk: clock(), executor: async () => {} });
  for (const entry of doc().steps) await manual.engine.submit(input.parseBody(Buffer.from(JSON.stringify(entry))).input);
  assert.equal(committed(manual.real), 15, 'by hand there is no duration bound; the bound belongs to the preset');
});
