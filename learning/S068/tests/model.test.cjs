'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const fixture = require('../fixture.js');
const config = (patch = {}) => ({ ...fixture.defaults, ...patch });
const assess = (patch = {}) => model.assessBuild(model.createState(), config(patch));
const run = (patch = {}) => {
  const state = assess(patch);
  assert.equal(state.phase, 'ready');
  return model.runLoad(state);
};

test('the stub is loadable and exposes the complete planned API', () => {
  for (const name of ['createState', 'assessBuild', 'runLoad', 'checkPrediction', 'newAttempt']) {
    assert.equal(typeof model[name], 'function');
  }
  const initial = model.createState();
  assert.equal(initial.phase, 'configure');
  assert.equal(initial.result, null);
  assert.deepEqual(initial.history, []);
  assert.ok(Object.isFrozen(initial));
  assert.ok(Object.isFrozen(initial.history));
});

test('permitted synthetic online build passes with measurable nonzero boundary locks', () => {
  const state = run({ operation: 'online' });
  assert.equal(state.phase, 'observed');
  assert.equal(state.result.verdict, 'PASS');
  assert.equal(state.result.impact, 'BUDGET_MET');
  assert.deepEqual(state.result.receipts.map((item) => item.lockWaitMs), [1, 0, 0, 1]);
  assert.deepEqual(state.result.receipts.map((item) => item.latencyMs), [3, 2, 2, 3]);
  assert.deepEqual(state.result.metrics, {
    attempted: 4, observed: 4, failed: 0, unknown: 0, maxLatencyMs: 3, maxLockWaitMs: 1,
  });
  assert.equal(state.config.operation, 'online');
});

test('blocking observation fails a tight budget but can meet a looser declared budget', () => {
  const failed = run();
  assert.equal(failed.result.verdict, 'FAIL');
  assert.equal(failed.result.impact, 'INTERRUPTED');
  assert.deepEqual(failed.result.receipts.map((item) => item.latencyMs), [14, 10, 6, 2]);
  assert.deepEqual(failed.result.metrics, {
    attempted: 4, observed: 4, failed: 3, unknown: 0, maxLatencyMs: 14, maxLockWaitMs: 12,
  });
  const loose = run({ budgetMs: '15' });
  assert.equal(loose.result.verdict, 'PASS');
  assert.equal(loose.result.metrics.maxLockWaitMs, 12);
  assert.equal(loose.result.metrics.failed, 0);
});

test('enforcing the budget rejects a predicted violating build before observing any users', () => {
  const rejected = assess({ guard: 'enforce' });
  assert.equal(rejected.phase, 'terminal');
  assert.equal(rejected.plan.disposition, 'REJECTED');
  assert.equal(rejected.plan.predictedMaxLatencyMs, 14);
  assert.equal(rejected.result.verdict, 'REJECTED');
  assert.equal(rejected.result.impact, 'NOT_EXERCISED');
  assert.deepEqual(rejected.result.metrics, {
    attempted: 0, observed: 0, failed: 0, unknown: 0, maxLatencyMs: null, maxLockWaitMs: null,
  });
  assert.throws(() => model.runLoad(rejected), /phase/i);
  assert.equal(run({ guard: 'enforce', budgetMs: '15' }).result.verdict, 'PASS');
});

test('unsupported and unknown online capability never silently fall back or count as success', () => {
  const unsupported = assess({ operation: 'online', capability: 'unsupported' });
  assert.equal(unsupported.phase, 'terminal');
  assert.equal(unsupported.result.verdict, 'REJECTED');
  assert.equal(unsupported.result.impact, 'NOT_EXERCISED');
  assert.equal(unsupported.config.operation, 'online');
  assert.equal(unsupported.plan.predictedMaxLatencyMs, null);
  assert.equal(unsupported.result.metrics.attempted, 0);
  const unknown = assess({ operation: 'online', capability: 'unknown' });
  assert.equal(unknown.phase, 'terminal');
  assert.equal(unknown.result.verdict, 'UNKNOWN');
  assert.equal(unknown.result.impact, 'UNVERIFIED');
  assert.equal(unknown.result.metrics.observed, 0);
  assert.throws(() => model.runLoad(unknown), /phase/i);
  assert.equal(run({ capability: 'unsupported', budgetMs: '15' }).result.verdict, 'PASS');
});

test('missing receipts stay unknown; known budget violations dominate without hiding missing data', () => {
  const unknown = run({ operation: 'online', coverage: 'missing' });
  assert.equal(unknown.result.verdict, 'UNKNOWN');
  assert.equal(unknown.result.impact, 'UNVERIFIED');
  assert.equal(unknown.result.metrics.attempted, 4);
  assert.equal(unknown.result.metrics.observed, 3);
  assert.equal(unknown.result.metrics.unknown, 1);
  assert.equal(unknown.result.receipts[3].latencyMs, null);
  assert.equal(unknown.result.receipts[3].withinBudget, null);
  const failed = run({ coverage: 'missing' });
  assert.equal(failed.result.verdict, 'FAIL');
  assert.equal(failed.result.metrics.failed, 3);
  assert.equal(failed.result.metrics.unknown, 1);
});

test('all 48 finite configurations have independently derived honest outcomes', () => {
  const totals = { PASS: 0, FAIL: 0, UNKNOWN: 0, REJECTED: 0 };
  for (const operation of fixture.choices.operation) {
    for (const capability of fixture.choices.capability) {
      for (const budgetMs of fixture.choices.budgetMs) {
        for (const guard of fixture.choices.guard) {
          for (const coverage of fixture.choices.coverage) {
            const input = { operation, capability, budgetMs, guard, coverage };
            const terminal = operation === 'online' && capability !== 'permitted'
              || operation === 'blocking' && guard === 'enforce' && budgetMs === '5';
            const planned = model.assessBuild(model.createState(), input);
            assert.equal(planned.phase, terminal ? 'terminal' : 'ready');
            const state = terminal ? planned : model.runLoad(planned);
            const expected = operation === 'online' && capability === 'unsupported' ? 'REJECTED'
              : operation === 'online' && capability === 'unknown' ? 'UNKNOWN'
                : operation === 'blocking' && guard === 'enforce' && budgetMs === '5' ? 'REJECTED'
                  : operation === 'blocking' && budgetMs === '5' ? 'FAIL'
                    : coverage === 'missing' ? 'UNKNOWN' : 'PASS';
            assert.equal(state.result.verdict, expected, JSON.stringify(input));
            const metrics = state.result.metrics;
            assert.equal(metrics.attempted, metrics.observed + metrics.unknown);
            if (expected === 'PASS') {
              assert.equal(metrics.observed, 4);
              assert.equal(metrics.failed + metrics.unknown, 0);
              assert.ok(metrics.maxLatencyMs <= Number(budgetMs));
            }
            if (terminal) assert.equal(metrics.attempted, 0);
            totals[expected]++;
          }
        }
      }
    }
  }
  assert.deepEqual(totals, { PASS: 10, FAIL: 6, UNKNOWN: 18, REJECTED: 14 });
});

test('strict finite input validation rejects malformed objects without calling accessors or mutating state', () => {
  const state = model.createState();
  let getterCalls = 0;
  const accessor = config();
  Object.defineProperty(accessor, 'budgetMs', { get() { getterCalls++; return '5'; } });
  const invalid = [
    null, [], 'online', { ...config(), extra: 'x' }, Object.create(config()), accessor,
    Object.assign(Object.create({ operation: 'online' }), config()),
    { ...config(), budgetMs: 5 }, { ...config(), budgetMs: '5.0' },
    { ...config(), budgetMs: '' }, { ...config(), budgetMs: 'Infinity' },
    { ...config(), operation: '<script>' }, { ...config(), capability: 'PERMITTED' },
    { ...config(), guard: undefined }, { ...config(), coverage: null },
    { ...config(), [Symbol('extra')]: 'x' },
    JSON.parse('{"operation":"online","capability":"permitted","budgetMs":"5","guard":"observe","coverage":"complete","__proto__":{}}'),
  ];
  for (const input of invalid) assert.throws(() => model.assessBuild(state, input), /configuration/i);
  assert.equal(getterCalls, 0);
  assert.equal(state.phase, 'configure');
  assert.deepEqual(state.history, []);
});

test('untrusted states, wrong phases and replayed actions cannot advance or duplicate results', () => {
  const initial = model.createState();
  assert.throws(() => model.assessBuild({ ...initial }, config()), /state/i);
  assert.throws(() => model.runLoad(initial), /phase/i);
  assert.throws(() => model.checkPrediction(initial, 'FAIL'), /phase/i);
  assert.throws(() => model.newAttempt(initial), /phase/i);
  const ready = assess();
  assert.equal(ready.phase, 'ready');
  assert.throws(() => model.assessBuild(ready, config()), /phase/i);
  const observed = model.runLoad(ready);
  assert.throws(() => model.runLoad(observed), /phase/i);
  for (const value of ['', 'pass', null, 1, {}, ' FAIL ']) {
    assert.throws(() => model.checkPrediction(observed, value), /prediction/i);
  }
  const checked = model.checkPrediction(observed, 'FAIL');
  assert.throws(() => model.checkPrediction(checked, 'FAIL'), /phase/i);
  assert.equal(checked.history.length, 1);
});

test('learning mismatch is separate from immutable actual impact and retained history', () => {
  const observed = run();
  const checked = model.checkPrediction(observed, 'PASS');
  assert.equal(checked.phase, 'checked');
  assert.equal(checked.feedback.matches, false);
  assert.equal(checked.feedback.actual, 'FAIL');
  assert.equal(checked.result.verdict, 'FAIL');
  assert.equal(checked.result.impact, 'INTERRUPTED');
  assert.equal(checked.history[0].result.verdict, 'FAIL');
  assert.ok(Object.isFrozen(checked.history[0]));
  assert.ok(Object.isFrozen(checked.result.receipts[0]));
  assert.throws(() => { checked.result.metrics.failed = 0; }, TypeError);
  const next = model.newAttempt(checked);
  assert.equal(next.phase, 'configure');
  assert.equal(next.attempt, 2);
  assert.equal(next.config, null);
  assert.equal(next.result, null);
  assert.deepEqual(next.history, checked.history);
  assert.equal(model.createState().history.length, 0);
});

test('six checked attempts are bounded; rejected attempts retain their honest zero-sample result', () => {
  let state = model.createState();
  for (let i = 0; i < 6; i++) {
    state = model.assessBuild(state, config({ guard: 'enforce' }));
    assert.equal(state.phase, 'terminal');
    state = model.checkPrediction(state, 'REJECTED');
    assert.equal(state.feedback.matches, true);
    assert.equal(state.history.length, i + 1);
    state = model.newAttempt(state);
  }
  assert.throws(() => model.assessBuild(state, config()), /six|6|history/i);
  assert.equal(state.history.length, 6);
  for (const item of state.history) {
    assert.equal(item.result.verdict, 'REJECTED');
    assert.equal(item.result.metrics.attempted, 0);
  }
});
