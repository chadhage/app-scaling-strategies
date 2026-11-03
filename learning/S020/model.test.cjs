'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('./model.js');

test('exhausting the declared allowance allocates sandbox capacity without touching the reserve', () => {
  const initial = lesson.createRun({ allowance: 4, extraUnits: 1, budgetMs: 250 });
  const exhausted = lesson.act(initial, 'exhaust');
  assert.equal(exhausted.allocatedTotal, 4,
    'Exhaustion must consume the declared harness allowance, not remain at baseline');
  assert.equal(exhausted.reservedUnits, 2);
  assert.equal(initial.allocatedTotal, 2, 'The previous immutable state must be retained');
});

function blocked(config) {
  let run = lesson.createRun(config);
  for (const action of ['exhaust', 'unsafe-expansion', 'promote']) run = lesson.act(run, action);
  return run;
}

test('a harness rejection and blocked promotion preserve the reserve, never claiming an Azure quota event', () => {
  const run = blocked();
  assert.equal(run.requestedTotal, 5);
  assert.equal(run.allocatedTotal, 4);
  assert.equal(run.reservedUnits, 2);
  assert.equal(run.route, 'reserved-v1');
  assert.equal(run.promotion, 'blocked');
  assert.equal(run.rejection.source, 'harness-admission-limit');
  assert.equal(run.rejection.nativeAzureQuota, 'untested');
  const before = lesson.summarize(run);
  assert.equal(before.verdict, 'UNKNOWN');
  assert.equal(before.attemptedExisting, 0);
  const observed = lesson.summarize(lesson.act(run, 'probe', 'healthy'));
  assert.equal(observed.verdict, 'PASS');
  assert.equal(observed.attemptedExisting, 4);
  assert.equal(observed.successfulExisting, 4);
  assert.equal(observed.failedExisting, 0);
  assert.equal(observed.unknownExisting, 0);
  assert.equal(observed.unsupportedUnits, 1);
  assert.equal(observed.unsupportedNewJourneysPerWindow, 2);
  assert.equal(observed.withheldSandboxJourneysPerWindow, 4);
  assert.equal(observed.promotedNewJourneys, 0);
  assert.match(observed.userOutcome, /expansion safely aborted/);
  assert.match(observed.nativeAzureQuota, /^UNTESTED/);
  assert.equal(observed.cleanup, 'N/A - no resources created');
});

test('all declared capacity and budget boundaries preserve the same invariant and explicit unmet demand', () => {
  for (let allowance = 3; allowance <= 6; allowance += 1) {
    for (let extraUnits = 1; extraUnits <= 3; extraUnits += 1) {
      for (const budgetMs of [100, 500]) {
        const run = lesson.act(blocked({ allowance, extraUnits, budgetMs }), 'probe', 'healthy');
        const summary = lesson.summarize(run);
        assert.equal(run.allocatedTotal, allowance);
        assert.equal(run.requestedTotal, allowance + extraUnits);
        assert.equal(run.reservedUnits, 2);
        assert.equal(summary.unsupportedNewJourneysPerWindow, extraUnits * 2);
        assert.equal(summary.withheldSandboxJourneysPerWindow, (allowance - 2) * 2);
        assert.equal(summary.verdict, 'PASS');
        assert.ok(run.samples.every((sample) => sample.latencyMs <= budgetMs));
      }
    }
  }
});

test('over-budget HTTP 200 is a real synthetic failure and cannot be erased by a healthy probe', () => {
  let run = lesson.act(blocked(), 'probe', 'over-budget');
  assert.equal(run.samples[0].httpStatus, 200);
  assert.equal(run.samples[0].businessCorrect, true);
  assert.equal(run.samples[0].latencyMs, 251);
  assert.equal(run.samples[0].outcome, 'failure');
  run = lesson.act(run, 'probe', 'healthy');
  const summary = lesson.summarize(run);
  assert.equal(summary.attemptedExisting, 8);
  assert.equal(summary.successfulExisting, 7);
  assert.equal(summary.failedExisting, 1);
  assert.equal(summary.unknownExisting, 0);
  assert.equal(summary.verdict, 'FAIL');
  assert.equal(summary.userOutcome, 'Interrupted reserved service');
});

test('missing observations stay unknown through later recovery and are never invented', () => {
  let run = lesson.act(blocked(), 'probe', 'missing-observations');
  assert.deepEqual(run.samples.slice(2).map((sample) => [
    sample.httpStatus, sample.latencyMs, sample.businessCorrect, sample.outcome
  ]), [[null, null, null, 'unknown'], [null, null, null, 'unknown']]);
  run = lesson.act(run, 'probe', 'healthy');
  const summary = lesson.summarize(run);
  assert.equal(summary.verdict, 'UNKNOWN');
  assert.equal(summary.attemptedExisting, 8);
  assert.equal(summary.successfulExisting, 6);
  assert.equal(summary.failedExisting, 0);
  assert.equal(summary.unknownExisting, 2);
  assert.equal(summary.userOutcome, 'Unverified reserved service');
  run = lesson.act(run, 'probe', 'over-budget');
  assert.equal(lesson.summarize(run).verdict, 'FAIL', 'Known failure takes precedence over uncertainty');
});

test('configuration accepts only exact bounded integer data fields', () => {
  for (const [key, values] of [
    ['allowance', [undefined, null, '', '4', 2, 7, 3.5, NaN, Infinity]],
    ['extraUnits', [0, 4, 1.5, '1', NaN]],
    ['budgetMs', [99, 501, 250.5, '250', -Infinity]]
  ]) {
    for (const value of values) {
      assert.throws(() => lesson.createRun({ ...lesson.DEFAULTS, [key]: value }), { code: 'ERR_S020_INPUT' });
    }
  }
  for (const value of [null, [], 4, {}, { ...lesson.DEFAULTS, override: true },
    { ...lesson.DEFAULTS, [Symbol('extra')]: 1 }, Object.create(lesson.DEFAULTS)]) {
    assert.throws(() => lesson.createRun(value), { code: 'ERR_S020_INPUT' });
  }
  const accessor = { ...lesson.DEFAULTS };
  Object.defineProperty(accessor, 'allowance', { get() { throw new Error('Must not execute an accessor'); } });
  assert.throws(() => lesson.createRun(accessor), { code: 'ERR_S020_INPUT' });
});

test('invalid actions, forged state, replayed actions, and probe overflow cannot mutate an existing run', () => {
  const initial = lesson.createRun();
  const snapshot = JSON.stringify(initial);
  for (const action of ['unsafe-expansion', 'promote', 'probe']) {
    assert.throws(() => lesson.act(initial, action, action === 'probe' ? 'healthy' : undefined), {
      code: 'ERR_S020_STATE'
    });
  }
  assert.throws(() => lesson.act(initial, 'force'), { code: 'ERR_S020_INPUT' });
  assert.throws(() => lesson.act(initial, 'exhaust', 'healthy'), { code: 'ERR_S020_INPUT' });
  assert.throws(() => lesson.act({ ...initial }, 'exhaust'), { code: 'ERR_S020_STATE' });
  assert.throws(() => lesson.summarize(JSON.parse(snapshot)), { code: 'ERR_S020_STATE' });
  assert.equal(JSON.stringify(initial), snapshot);
  const exhausted = lesson.act(initial, 'exhaust');
  assert.throws(() => lesson.act(exhausted, 'exhaust'), { code: 'ERR_S020_STATE' });
  const rejected = lesson.act(exhausted, 'unsafe-expansion');
  assert.throws(() => lesson.act(rejected, 'unsafe-expansion'), { code: 'ERR_S020_STATE' });
  let run = lesson.act(rejected, 'promote');
  assert.throws(() => lesson.act(run, 'promote'), { code: 'ERR_S020_STATE' });
  assert.throws(() => lesson.act(run, 'probe', '<script>pass</script>'), { code: 'ERR_S020_INPUT' });
  for (let count = 0; count < 3; count += 1) run = lesson.act(run, 'probe', 'healthy');
  const full = JSON.stringify(run);
  assert.throws(() => lesson.act(run, 'probe', 'healthy'), { code: 'ERR_S020_BOUND' });
  assert.equal(JSON.stringify(run), full);
  assert.equal(run.trace.length, 6);
  assert.equal(run.samples.length, 12);
});

test('inputs are copied, all state and results are deeply frozen, and the trace is deterministic', () => {
  const config = { ...lesson.DEFAULTS };
  const first = lesson.createRun(config);
  config.allowance = 6;
  assert.equal(first.config.allowance, 4);
  let run = lesson.act(blocked(), 'probe', 'healthy');
  for (const value of [run, run.config, run.rejection, run.trace, run.trace[0], run.samples,
    run.samples[0], lesson.summarize(run), lesson.DEFAULTS, lesson.LIMITS, lesson.OBSERVATIONS]) {
    assert.ok(Object.isFrozen(value));
  }
  assert.throws(() => { run.reservedUnits = 0; }, TypeError);
  assert.throws(() => { run.samples[0].outcome = 'failure'; }, TypeError);
  assert.throws(() => run.trace.push({}), TypeError);
  assert.deepEqual(run, lesson.act(blocked(), 'probe', 'healthy'));
  assert.equal(first.trace.length, 0);
  assert.equal(lesson.summarize(first).verdict, 'UNKNOWN');
  run = lesson.act(run, 'probe', 'healthy');
  assert.deepEqual(run.trace.map((event) => event.step), [1, 2, 3, 4, 5]);
});
