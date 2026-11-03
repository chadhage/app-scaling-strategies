'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const model = require('../model.js');
const copy = (value) => JSON.parse(JSON.stringify(value));
function run({ observation = 'complete', retireTarget = 'script', retire = false, initial = model.createState() } = {}) {
  let state = model.transition(initial, 'start', { observation, retireTarget });
  state = model.transition(state, 'deploy');
  if (retire) state = model.transition(state, 'retire');
  state = model.transition(state, 'load-old');
  return model.transition(state, 'load-new');
}

test('baseline is importable and a full deterministic attempt is callable', () => {
  assert.equal(model.inspect(model.createState()).outcome, 'unknown');
  const state = run();
  assert.equal(model.inspect(state).phase, 'complete');
  assert.equal(model.inspect(state).rows.length, 4);
});

test('cached old HTML resolves old immutable assets after deployment', () => {
  const view = model.inspect(run());
  assert.equal(view.outcome, 'success');
  assert.equal(view.cachedHtml, 'v1');
  assert.equal(view.publishedHtml, 'v2');
  assert.deepEqual(view.rows.map((row) => row.path), [
    '/assets/app.a17c.js', '/assets/site.a17c.css', '/assets/app.b28d.js', '/assets/site.b28d.css',
  ]);
  assert.deepEqual(view.rows.map((row) => row.status), ['200', '200', '200', '200']);
  assert.deepEqual(view.metrics, { planned: 4, attempted: 4, success: 4, failure: 0, unknown: 0, pending: 0 });
});

test('early old-script retirement is a visible failure even when new HTML works', () => {
  const view = model.inspect(run({ retire: true }));
  assert.equal(view.outcome, 'failure');
  assert.equal(view.oldOutcome, 'failure');
  assert.equal(view.newOutcome, 'success');
  assert.deepEqual(view.rows.map((row) => row.status), ['404', '200', '200', '200']);
  assert.equal(view.metrics.failure, 1);
  assert.equal(view.metrics.success, 3);
  assert.deepEqual(view.retiredPaths, ['/assets/app.a17c.js']);
});

test('removing all old assets leaves immutable new assets untouched', () => {
  const view = model.inspect(run({ retire: true, retireTarget: 'all-old' }));
  assert.equal(view.outcome, 'failure');
  assert.deepEqual(view.rows.map((row) => row.status), ['404', '404', '200', '200']);
  assert.equal(view.metrics.failure, 2);
  assert.equal(view.assets.filter((asset) => asset.available && asset.html === 'v2').length, 2);
});

test('withheld old-script observation remains unknown, even if the script was retired', () => {
  for (const retire of [false, true]) {
    const view = model.inspect(run({ retire, observation: 'withhold-old-script' }));
    assert.equal(view.outcome, 'unknown');
    assert.equal(view.oldOutcome, 'unknown');
    assert.equal(view.newOutcome, 'success');
    assert.equal(view.rows[0].status, 'unobserved');
    assert.equal(view.metrics.unknown, 1);
    assert.equal(view.metrics.success, 3);
    assert.equal(view.metrics.failure, 0);
  }
});

test('known missing stylesheet dominates the unknown old script without dropping it', () => {
  const view = model.inspect(run({ retire: true, retireTarget: 'all-old', observation: 'withhold-old-script' }));
  assert.equal(view.outcome, 'failure');
  assert.equal(view.metrics.failure, 1);
  assert.equal(view.metrics.unknown, 1);
  assert.equal(view.metrics.success, 2);
});

test('deployment and a partial successful old-page load cannot establish aggregate success', () => {
  let state = model.transition(model.createState(), 'start', { ...model.DEFAULTS });
  state = model.transition(state, 'deploy');
  assert.equal(model.inspect(state).rows.length, 0);
  assert.equal(model.inspect(state).outcome, 'unknown');
  state = model.transition(state, 'load-old');
  const view = model.inspect(state);
  assert.equal(view.oldOutcome, 'success');
  assert.equal(view.outcome, 'unknown');
  assert.equal(view.metrics.success, 2);
  assert.equal(view.metrics.pending, 2);
  assert.equal(view.metrics.unknown, 2);
});

test('a known old-page failure is exposed before the new-page comparison', () => {
  let state = model.transition(model.createState(), 'start', { ...model.DEFAULTS });
  state = model.transition(model.transition(state, 'deploy'), 'retire');
  state = model.transition(state, 'load-old');
  assert.equal(model.inspect(state).outcome, 'failure');
  assert.equal(model.inspect(state).metrics.pending, 2);
});

test('completed attempts retain failure, unknown and recovery success; six is a hard cap', () => {
  let state = run({ retire: true });
  state = run({ observation: 'withhold-old-script', initial: model.transition(state, 'again') });
  state = run({ initial: model.transition(state, 'again') });
  assert.deepEqual(model.inspect(state).history.map((item) => item.outcome), ['failure', 'unknown', 'success']);
  for (let index = 0; index < 3; index += 1) state = run({ initial: model.transition(state, 'again') });
  const before = copy(state);
  assert.equal(model.inspect(state).history.length, 6);
  assert.throws(() => model.transition(state, 'again'), /six|limit/i);
  assert.deepEqual(state, before);
});

test('exact configurations reject unknown, coerced, missing and extra inputs without mutation', () => {
  const state = model.createState();
  for (const config of [null, [], {}, 'complete', { observation: 'complete', retireTarget: 1 },
    { observation: 'hidden', retireTarget: 'script' },
    { observation: 'complete', retireTarget: 'script', url: 'https://invalid.example' }]) {
    assert.throws(() => model.transition(state, 'start', config), /configuration/i);
  }
  assert.deepEqual(state, model.createState());
});

test('out-of-order, duplicate, unknown and payload-bearing commands fail closed', () => {
  const ready = model.createState();
  for (const action of ['deploy', 'retire', 'load-old', 'load-new', 'again', 'invent', null]) {
    assert.throws(() => model.transition(ready, action), /action|phase/i);
  }
  const cached = model.transition(ready, 'start', { ...model.DEFAULTS });
  for (const action of ['start', 'retire', 'load-old', 'load-new', 'again']) {
    assert.throws(() => model.transition(cached, action, action === 'start' ? { ...model.DEFAULTS } : undefined), /phase/i);
  }
  assert.throws(() => model.transition(cached, 'deploy', {}), /payload/i);
  const deployed = model.transition(cached, 'deploy');
  assert.throws(() => model.transition(deployed, 'deploy'), /phase/i);
  const retired = model.transition(deployed, 'retire');
  assert.throws(() => model.transition(retired, 'retire'), /phase/i);
  const complete = run();
  for (const action of ['deploy', 'retire', 'load-old', 'load-new']) {
    assert.throws(() => model.transition(complete, action), /phase/i);
  }
});

test('forged action sequences, identities, history, bounds and extra state keys are rejected', () => {
  const good = run();
  const invalid = [
    { ...copy(good), extra: true }, { ...copy(good), version: '1' },
    { ...copy(good), history: [copy(good.current)] }, { ...copy(good), current: null, history: [null] },
  ];
  const wrongId = copy(good); wrongId.current.id = 7; invalid.push(wrongId);
  const wrongActions = copy(good); wrongActions.current.actions = ['cache', 'retire', 'load-old', 'load-new']; invalid.push(wrongActions);
  const extraConfig = copy(good); extraConfig.current.config.extra = true; invalid.push(extraConfig);
  const extraAttempt = copy(good); extraAttempt.current.trace = []; invalid.push(extraAttempt);
  const excess = copy(good); excess.history = Array(7).fill(copy(good.current)); invalid.push(excess);
  for (const state of invalid) {
    assert.throws(() => model.inspect(state), /state|configuration|attempt|history|phase|limit/i);
    assert.throws(() => model.transition(state, 'reset'), /state|configuration|attempt|history|phase|limit/i);
  }
});

test('transitions are pure, outputs frozen, and reset explicitly clears all state', () => {
  const ready = model.createState();
  const before = copy(ready);
  const finished = run({ initial: ready, retire: true });
  assert.deepEqual(ready, before);
  assert.ok(Object.isFrozen(finished) && Object.isFrozen(finished.current.actions));
  assert.throws(() => { finished.current.config.observation = 'complete'; }, TypeError);
  assert.deepEqual(model.transition(finished, 'reset'), model.createState());
});

test('all eight bounded observation/retirement combinations conserve the denominator', () => {
  for (const observation of ['complete', 'withhold-old-script']) {
    for (const retireTarget of ['script', 'all-old']) {
      for (const retire of [false, true]) {
        const view = model.inspect(run({ observation, retireTarget, retire }));
        const { success, failure, unknown } = view.metrics;
        assert.equal(success + failure + unknown, 4);
        assert.equal(view.newOutcome, 'success');
        assert.equal(view.outcome, failure ? 'failure' : unknown ? 'unknown' : 'success');
        assert.equal(model.inspect(run({ observation, retireTarget, retire })).outcome, view.outcome);
      }
    }
  }
});
