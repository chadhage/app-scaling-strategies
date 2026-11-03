'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('..\\model.js');

test('resolved dependencies permit retirement only after all four clients are accounted for', () => {
  let state = model.createState();
  for (const action of ['route', 'resolve', 'retire']) state = model.step(state, action);
  assert.equal(state.result.outcome, 'success');
  assert.equal(state.result.oldDestination, 'retired');
  assert.equal(state.result.metrics.attempted, 4);
  assert.equal(state.result.metrics.completed, 4);
  assert.equal(state.result.metrics.interrupted, 0);
  assert.equal(state.result.metrics.unknown, 0);
});

function run(overrides = {}) {
  let state = model.createState({ ...model.DEFAULTS, ...overrides });
  for (const action of ['route', 'resolve', 'retire']) state = model.step(state, action);
  return state;
}

test('moving fresh arrivals leaves all old dependencies visible and usable', () => {
  const ready = model.createState();
  const routed = model.step(ready, 'route');
  assert.equal(ready.phase, 'ready');
  assert.equal(routed.newAdmissions, 'candidate');
  assert.equal(routed.oldDestination, 'usable');
  assert.equal(routed.dependencies.required, 3);
  assert.deepEqual(routed.metrics, { attempted: 4, completed: 1, interrupted: 0, unknown: 0, required: 3 });
  assert.deepEqual(routed.clients.filter((client) => client.status === 'required').map((client) => client.id),
    ['keepalive-1', 'pinned-1', 'work-1']);
});

for (const [key, value, client] of [
  ['connection', 'stale', 'keepalive-1'], ['cookie', 'stale', 'pinned-1'], ['work', 'pending', 'work-1'],
]) {
  test(`independent ${key} dependency blocks guarded retirement`, () => {
    const state = run({ [key]: value });
    assert.equal(state.result.outcome, 'safe-abort');
    assert.equal(state.result.retirement, 'blocked');
    assert.equal(state.oldDestination, 'usable');
    assert.equal(state.result.userImpact, 'no retirement interruption; required clients retained');
    assert.equal(state.result.cleanup, 'old destination retained');
    assert.deepEqual(state.dependencies.rows.filter((row) => row.status === 'required').map((row) => row.client), [client]);
    assert.equal(state.metrics.required, 1);
    assert.equal(state.metrics.completed, 3);
    assert.equal(state.metrics.interrupted, 0);
  });
}

test('guarded all-stale scenario preserves each still-required client without claiming migration', () => {
  const state = run({ connection: 'stale', cookie: 'stale', work: 'pending' });
  assert.equal(state.result.outcome, 'safe-abort');
  assert.equal(state.oldDestination, 'usable');
  assert.deepEqual(state.metrics, { attempted: 4, completed: 1, interrupted: 0, unknown: 0, required: 3 });
});

test('forced retirement interrupts each required client and keeps the failed inventory', () => {
  const state = run({ connection: 'stale', cookie: 'stale', work: 'pending', retirement: 'force' });
  assert.equal(state.result.outcome, 'failure');
  assert.equal(state.oldDestination, 'retired');
  assert.equal(state.dependencies.required, 3);
  assert.equal(state.metrics.interrupted, 3);
  assert.equal(state.metrics.required, 0);
  assert.deepEqual(state.clients.filter((client) => client.status === 'interrupted').map((client) => client.id),
    ['keepalive-1', 'pinned-1', 'work-1']);
});

test('missing final work receipt blocks guarded retirement with an unknown started client', () => {
  const state = run({ receipt: 'missing' });
  assert.equal(state.result.outcome, 'unknown');
  assert.equal(state.oldDestination, 'usable');
  assert.deepEqual(state.metrics, { attempted: 4, completed: 3, interrupted: 0, unknown: 1, required: 0 });
  assert.equal(state.dependencies.required, 0);
  assert.equal(state.dependencies.unknown, 1);
  assert.deepEqual(state.clients.find((client) => client.id === 'work-1'),
    { id: 'work-1', destination: 'old', status: 'unknown' });
});

test('forced retirement with no known dependency cannot turn missing evidence into success', () => {
  const state = run({ receipt: 'missing', retirement: 'force' });
  assert.equal(state.result.outcome, 'unknown');
  assert.equal(state.oldDestination, 'retired');
  assert.equal(state.metrics.completed, 3);
  assert.equal(state.metrics.unknown, 1);
});

test('known interruption takes precedence over an unknown client', () => {
  const state = run({ connection: 'stale', receipt: 'missing', retirement: 'force' });
  assert.equal(state.result.outcome, 'failure');
  assert.deepEqual(state.metrics, { attempted: 4, completed: 2, interrupted: 1, unknown: 1, required: 0 });
});

test('missing receipt never erases known pending work', () => {
  const state = run({ work: 'pending', receipt: 'missing', retirement: 'force' });
  assert.equal(state.result.outcome, 'failure');
  assert.equal(state.metrics.interrupted, 1);
  assert.equal(state.metrics.unknown, 0);
});

test('all 32 bounded configurations conserve clients and enforce the retirement gate', () => {
  let count = 0;
  for (const connection of model.CHOICES.connection)
    for (const cookie of model.CHOICES.cookie)
      for (const work of model.CHOICES.work)
        for (const receipt of model.CHOICES.receipt)
          for (const retirement of model.CHOICES.retirement) {
            const state = run({ connection, cookie, work, receipt, retirement });
            const { attempted, completed, interrupted, unknown, required } = state.metrics;
            assert.equal(attempted, 4);
            assert.equal(completed + interrupted + unknown + required, attempted);
            assert.equal(state.trace.length, 3);
            assert.equal(state.history.length, 1);
            assert.equal(new Set(state.clients.map((client) => client.id)).size, 4);
            if (state.result.outcome === 'success') {
              assert.equal(completed, 4);
              assert.equal(state.dependencies.required + state.dependencies.unknown, 0);
              assert.equal(state.oldDestination, 'retired');
            }
            if (retirement === 'guarded' && state.dependencies.required + state.dependencies.unknown > 0) {
              assert.equal(state.oldDestination, 'usable');
              assert.equal(interrupted, 0);
              assert.notEqual(state.result.outcome, 'success');
            }
            count++;
          }
  assert.equal(count, 32);
});

test('strict inputs reject missing, extra, malformed, boxed and accessor choices', () => {
  const bad = [
    null, [], {}, 'reconnect', { ...model.DEFAULTS, connection: 'RECONNECT' },
    { ...model.DEFAULTS, cookie: false }, { ...model.DEFAULTS, work: 1 },
    { ...model.DEFAULTS, receipt: new String('verified') },
    { ...model.DEFAULTS, retirement: 'bypass' }, { ...model.DEFAULTS, extra: true },
    { ...model.DEFAULTS, [Symbol('extra')]: true },
    Object.assign(Object.create(null), model.DEFAULTS),
    Object.defineProperty({ ...model.DEFAULTS }, 'work', { get() { throw new Error('must not evaluate accessor'); } }),
  ];
  for (const config of bad) assert.throws(() => model.createState(config), TypeError);
  assert.deepEqual(model.createState().config, model.DEFAULTS);
});

test('forged, cloned, missing and primitive states are rejected without advancing real state', () => {
  const ready = model.createState();
  for (const state of [null, {}, { ...ready }, JSON.parse(JSON.stringify(ready)), 'ready', 1]) {
    assert.throws(() => model.step(state, 'route'), TypeError);
    assert.throws(() => model.nextAttempt(state), TypeError);
    assert.throws(() => model.reset(state), TypeError);
  }
  assert.equal(ready.phase, 'ready');
  assert.deepEqual(ready.trace, []);
});

test('invalid actions and phase bypasses preserve the immutable state', () => {
  const ready = model.createState();
  for (const action of ['resolve', 'retire', 'toString', '__proto__', null, [], new String('route')]) {
    assert.throws(() => model.step(ready, action), /out of order/);
  }
  assert.throws(() => model.nextAttempt(ready), /Finish/);
  assert.throws(() => model.checkPrediction(ready, 'success'), /after/);
  const routed = model.step(ready, 'route');
  assert.throws(() => model.step(routed, 'route'), /out of order/);
  assert.throws(() => model.configure(routed, model.DEFAULTS), /locked/);
  const completed = run();
  assert.throws(() => model.step(completed, 'retire'), /out of order/);
  assert.equal(completed.history.length, 1);
});

test('configuration and results are deeply immutable and external config changes have no effect', () => {
  const input = { ...model.DEFAULTS };
  const state = model.createState(input);
  input.retirement = 'force';
  assert.equal(state.config.retirement, 'guarded');
  for (const mutate of [
    () => { state.phase = 'resolved'; },
    () => { state.dependencies.rows[0].status = 'resolved'; },
    () => { state.history.push({}); },
    () => { state.config.connection = 'stale'; },
  ]) assert.throws(mutate, TypeError);
});

test('prediction verdict is separate from failure, cannot duplicate history, and is one-shot', () => {
  const failed = run({ connection: 'stale', retirement: 'force' });
  assert.throws(() => model.checkPrediction(failed, ''), /Choose/);
  const correct = model.checkPrediction(failed, 'failure');
  assert.equal(correct.prediction.correct, true);
  assert.equal(correct.result.outcome, 'failure');
  assert.equal(correct.history, failed.history);
  assert.throws(() => model.checkPrediction(correct, 'success'), /once/);
  assert.equal(model.checkPrediction(failed, 'success').prediction.correct, false);
});

test('six retained mixed outcomes are never silently pruned and explicit reset restores exact defaults', () => {
  let state = model.createState();
  const configs = [{}, { connection: 'stale', retirement: 'force' }, { receipt: 'missing' },
    { cookie: 'stale' }, {}, { work: 'pending', retirement: 'force' }];
  for (let index = 0; index < configs.length; index++) {
    state = model.configure(state, { ...model.DEFAULTS, ...configs[index] });
    for (const action of ['route', 'resolve', 'retire']) state = model.step(state, action);
    assert.equal(state.history.length, index + 1);
    if (index < configs.length - 1) state = model.nextAttempt(state);
  }
  assert.deepEqual(state.history.map((result) => result.outcome),
    ['success', 'failure', 'unknown', 'safe-abort', 'success', 'failure']);
  const retained = JSON.stringify(state.history);
  assert.throws(() => model.nextAttempt(state), /Six results/);
  assert.equal(JSON.stringify(state.history), retained);
  state = model.reset(model.checkPrediction(state, 'failure'));
  assert.deepEqual(state, model.createState());
});
