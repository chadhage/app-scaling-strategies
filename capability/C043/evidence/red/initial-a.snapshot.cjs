'use strict';

// INITIAL specification tests A (written before any production file; archived as the RED and replayed unchanged against
// the final code). Self-contained on purpose. The subject (runner.cjs, preset.cjs) is the namespace itself, or the
// behaviorless stubs when C043_RED_SUBJECT names a directory. The step service is the accepted C042, loaded read-only.
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
const input = accepted('input.cjs');

const step = (n, extra = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: `preset-a-step-${n}`, leaseId: 'synthetic-lease-001', units: 5, ...extra });
const doc = (extra = {}) => ({
  schemaVersion: 1, preset: 'bounded-sequence', idempotencyKey: 'preset-run-0001',
  bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 40 }, steps: [step(1), step(2), step(3)], ...extra,
});
const clock = () => { let now = 0; return { now: () => now, advance: (ms) => { now += ms; } }; };

// A spy at the shared boundary: it records every call of the step service with its arguments and its result.
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
  const engine = spy(real, log);
  const runner = await openRunner({ engine, io: runIo, clock: clk.now });
  return { real, engine, log, runner, stepIo, runIo, clk };
}

const committed = (real, lease = 'synthetic-lease-001') => real.leases()[lease].committed;

const text = (value) => JSON.stringify(value);
const cases = [
  ['an unknown schema version', doc({ schemaVersion: 2 }), 'UNSUPPORTED_PRESET_VERSION', 422, 'unsupported'],
  ['an unknown key', { ...doc(), surprise: 1 }, 'UNKNOWN_FIELD', 400, 'rejected'],
  ['a __proto__ key', Buffer.from(text(doc()).replace('{"schemaVersion":1', '{"__proto__":{"x":1},"schemaVersion":1')), 'FORBIDDEN_FIELD', 400, 'rejected'],
  ['an escaped __proto__ key', Buffer.from(text(doc()).replace('{"schemaVersion":1', '{"\\u005f_proto__":{"x":1},"schemaVersion":1')), 'FORBIDDEN_FIELD', 400, 'rejected'],
  ['a duplicated JSON key', Buffer.from(text(doc()).replace('"preset":"bounded-sequence"', '"preset":"bounded-sequence","preset":"other"')), 'DUPLICATE_FIELD', 400, 'rejected'],
  ['more steps than the contract allows', doc({ steps: Array.from({ length: 9 }, (_, index) => step(index + 1)) }), 'TOO_MANY_STEPS', 400, 'rejected'],
  ['an invalid step input in the LAST position', doc({ steps: [step(1), step(2), step(3, { units: 11 })] }), 'FIELD_OUT_OF_RANGE', 400, 'rejected'],
  ['two steps with one idempotency key', doc({ steps: [step(1), step(1), step(3)] }), 'DUPLICATE_STEP_KEY', 400, 'rejected'],
];

test('an invalid preset is a typed failure with C042 recovery actions and NO effect', { timeout: 30000 }, async (context) => {
  for (const [name, source, code, status, outcome] of cases) {
    await context.test(name, async () => {
      const { runner, real, log, stepIo, runIo } = await boot();
      const answer = await runner.run(source);
      assert.equal(answer.status, status);
      assert.equal(answer.body.accepted, false);
      assert.equal(answer.body.outcome, outcome);
      assert.equal(answer.body.error.code, code);
      assert.equal(answer.body.recovery.allowed.includes('correct-and-resubmit'), true);
      assert.deepEqual(log, [], 'no step function may be called for an invalid preset');
      assert.equal(committed(real), 0);
      assert.equal(stepIo.read(), '');
      assert.equal(runIo.read(), '');
    });
  }
});

test('the invalid step in the last position names its path and still causes no call', { timeout: 30000 }, async () => {
  const { runner, log } = await boot();
  const answer = await runner.run(doc({ steps: [step(1), step(2), step(3, { units: 11 })] }));
  assert.equal(answer.body.error.details[0].path, 'steps[2].units');
  assert.deepEqual(log, []);
});

test('a valid preset runs every step through the step service and reports the exact listing', { timeout: 30000 }, async () => {
  const { runner, real, log } = await boot();
  const answer = await runner.run(doc());
  const { body } = answer;
  assert.equal(answer.status, 201);
  assert.equal(body.kind, 'C043-preset-result');
  assert.equal(body.outcome, 'succeeded');
  assert.equal(body.classification, 'COMPLETED');
  assert.equal(body.accepted, true);
  assert.equal(body.replayed, false);
  assert.equal(body.error, null);
  assert.deepEqual(body.ran, [1, 2, 3]);
  assert.deepEqual(body.notRun, []);
  assert.deepEqual(body.effects.map((effect) => effect.reservedAfter), [5, 10, 15]);
  assert.equal(committed(real), 15);
  assert.deepEqual(log.map((call) => call.method), ['submit', 'submit', 'submit']);
});

test('the preset run and a manual run of the same steps are identical at the shared boundary', { timeout: 30000 }, async () => {
  const manual = await boot();
  for (const entry of doc().steps) {
    const parsed = input.parseBody(Buffer.from(text(entry)));
    assert.equal(parsed.ok, true);
    await manual.engine.submit(parsed.input);
  }
  const automatic = await boot();
  const answer = await automatic.runner.run(doc());
  assert.equal(answer.body.outcome, 'succeeded');
  assert.equal(automatic.log.length, 3);
  assert.deepEqual(automatic.log, manual.log, 'same calls, arguments and results');
  assert.equal(automatic.stepIo.read(), manual.stepIo.read(), 'same step-journal records');
  assert.deepEqual(automatic.real.leases(), manual.real.leases());
});

const bounds = (extra) => ({ maxSteps: 4, maxDurationMs: 1000, maxUnits: 40, ...extra });

test('a bound exceeded is PRESET_BOUND_EXCEEDED with the same honest listing and never a success', { timeout: 30000 }, async (context) => {
  await context.test('maxSteps is refused before any step runs', async () => {
    const { runner, log, stepIo } = await boot();
    const answer = await runner.run(doc({ bounds: bounds({ maxSteps: 2 }) }));
    assert.equal(answer.body.error.code, 'PRESET_BOUND_EXCEEDED');
    assert.equal(answer.body.outcome, 'bound-exceeded');
    assert.equal(answer.body.accepted, false);
    assert.equal(answer.status >= 400, true);
    assert.deepEqual(answer.body.bound, { name: 'maxSteps', limit: 2, observed: 3 });
    assert.deepEqual(answer.body.ran, []);
    assert.deepEqual(answer.body.notRun, [1, 2, 3]);
    assert.deepEqual(answer.body.effects, []);
    assert.deepEqual(log, []);
    assert.equal(stepIo.read(), '');
  });
  await context.test('maxUnits is refused before any step runs', async () => {
    const { runner, log } = await boot();
    const answer = await runner.run(doc({ bounds: bounds({ maxUnits: 14 }) }));
    assert.equal(answer.body.error.code, 'PRESET_BOUND_EXCEEDED');
    assert.deepEqual(answer.body.bound, { name: 'maxUnits', limit: 14, observed: 15 });
    assert.deepEqual(answer.body.ran, []);
    assert.deepEqual(log, []);
  });
  await context.test('maxDurationMs on the injected clock stops between steps and lists the standing effects', async () => {
    const clk = clock();
    const { runner, real, log } = await boot({ clk, executor: async () => { clk.advance(600); } });
    const answer = await runner.run(doc());
    assert.equal(answer.body.error.code, 'PRESET_BOUND_EXCEEDED');
    assert.equal(answer.body.outcome, 'bound-exceeded');
    assert.equal(answer.body.accepted, false);
    assert.deepEqual(answer.body.bound, { name: 'maxDurationMs', limit: 1000, observed: 1200 });
    assert.deepEqual(answer.body.ran, [1, 2]);
    assert.deepEqual(answer.body.notRun, [3]);
    assert.deepEqual(answer.body.effects.map((effect) => effect.reservedAfter), [5, 10]);
    assert.equal(committed(real), 10);
    assert.deepEqual(log.map((call) => call.method), ['submit', 'submit']);
  });
  await context.test('exactly at the duration bound is within it, one millisecond over is not', async () => {
    const within = clock();
    const first = await boot({ clk: within, executor: async () => { within.advance(500); } });
    assert.equal((await first.runner.run(doc({ bounds: bounds({ maxDurationMs: 1500 }) }))).body.outcome, 'succeeded');
    const over = clock();
    const second = await boot({ clk: over, executor: async () => { over.advance(500); } });
    const answer = await second.runner.run(doc({ bounds: bounds({ maxDurationMs: 1499 }) }));
    assert.equal(answer.body.outcome, 'bound-exceeded');
    assert.deepEqual(answer.body.ran, [1, 2, 3]);
    assert.deepEqual(answer.body.notRun, []);
    assert.deepEqual(answer.body.bound, { name: 'maxDurationMs', limit: 1499, observed: 1500 });
    assert.equal(committed(second.real), 15);
  });
});
