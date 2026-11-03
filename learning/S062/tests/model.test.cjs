'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('..\\model.js');
const config = (changes = {}) => ({ ...api.DEFAULTS, ...changes });
const clone = (value) => JSON.parse(JSON.stringify(value));
function complete(changes = {}, initial = api.createState()) {
  return api.transition(api.transition(initial, 'baseline', config(changes)), 'scale');
}
const sample = (state) => api.inspect(state).samples[1];

test('loadable model exposes the complete callable exercise surface', () => {
  for (const key of ['createState', 'transition', 'inspect', 'parseConfig']) assert.equal(typeof api[key], 'function');
  assert.equal(api.inspect(api.createState()).phase, 'draft');
  const view = api.inspect(complete());
  assert.equal(view.phase, 'complete');
  assert.equal(view.samples.length, 2);
  assert.equal(view.history.length, 1);
});

test('default scale-out multiplies both per-instance pools and measures both budgets', () => {
  const view = api.inspect(complete());
  assert.equal(view.outcome, 'success');
  assert.deepEqual(view.metrics, { attempted: 2, success: 2, failure: 0, unknown: 0, pending: 0 });
  assert.deepEqual(view.samples.map((item) => item.demand), [30, 80]);
  assert.deepEqual(view.samples.map((item) => item.latencyMs), [130, 214]);
  assert.deepEqual(
    ['frontendConnections', 'apiConnections', 'accepted', 'refused', 'headroom'].map((key) => view.samples[1][key]),
    [20, 60, 80, 0, 40],
  );
  assert.equal(view.samples[1].forecast, 'within-limit');
});

test('aggregate exhaustion fails despite small individual pools and a healthy baseline', () => {
  const view = api.inspect(complete({ frontendInstances: 4, apiInstances: 5 }));
  assert.equal(view.outcome, 'failure');
  assert.deepEqual(view.metrics, { attempted: 2, success: 1, failure: 1, unknown: 0, pending: 0 });
  assert.equal(view.samples[0].outcome, 'success');
  const scaled = view.samples[1];
  assert.equal(scaled.demand, 140);
  assert.equal(scaled.accepted, 120);
  assert.equal(scaled.refused, 20);
  assert.equal(scaled.headroom, -20);
  assert.equal(scaled.latencyMs, 514);
  assert.equal(scaled.forecast, 'over-limit');
  assert.match(scaled.reason, /connection exhaustion.*journey latency/i);
});

test('tuning pool sizes preserves the original failing attempt and exact configuration', () => {
  const failed = complete({ frontendInstances: 4, apiInstances: 5 });
  const prior = clone(failed);
  const tuned = complete(
    { frontendInstances: 4, apiInstances: 5, frontendPool: 5, apiPool: 10 },
    api.transition(failed, 'again'),
  );
  const view = api.inspect(tuned);
  assert.equal(view.outcome, 'success');
  assert.equal(sample(tuned).demand, 70);
  assert.equal(sample(tuned).latencyMs, 198);
  assert.deepEqual(view.history.map((run) => run.outcome), ['failure', 'success']);
  assert.equal(view.history[0].config.frontendPool, 10);
  assert.equal(view.history[0].samples[1].refused, 20);
  assert.deepEqual(failed, prior);
});

test('both inclusive boundaries pass; latency alone can fail without exhaustion', () => {
  const boundary = { frontendInstances: 2, apiInstances: 2, connectionLimit: 60, journeyBudget: 280 };
  const passing = sample(complete(boundary));
  assert.equal(passing.outcome, 'success');
  assert.equal(passing.headroom, 0);
  assert.equal(passing.refused, 0);
  assert.equal(passing.latencyMs, 280);
  const slow = sample(complete({ ...boundary, journeyBudget: 279 }));
  assert.equal(slow.outcome, 'failure');
  assert.equal(slow.refused, 0);
  assert.match(slow.reason, /journey latency/);
  assert.doesNotMatch(slow.reason, /exhaustion/);
});

test('withheld scaled telemetry remains unknown even when the configured ceiling exceeds the limit', () => {
  const state = complete({ frontendInstances: 4, apiInstances: 5, observation: 'withhold-scaled' });
  const view = api.inspect(state);
  const scaled = sample(state);
  assert.equal(scaled.pending, false);
  assert.equal(scaled.demand, 140);
  assert.equal(scaled.forecast, 'over-limit');
  assert.equal(scaled.observed, false);
  for (const key of ['accepted', 'refused', 'headroom', 'latencyMs']) assert.equal(scaled[key], null, key);
  assert.equal(scaled.outcome, 'unknown');
  assert.equal(view.outcome, 'unknown');
  assert.deepEqual(view.metrics, { attempted: 2, success: 1, failure: 0, unknown: 1, pending: 0 });
});

test('empty and partial samples never pass, while a known failure dominates uncertainty', () => {
  const empty = api.inspect(api.createState());
  assert.equal(empty.outcome, 'unknown');
  assert.deepEqual(empty.metrics, { attempted: 0, success: 0, failure: 0, unknown: 2, pending: 2 });
  const baseline = api.inspect(api.transition(api.createState(), 'baseline', config()));
  assert.equal(baseline.samples[0].outcome, 'success');
  assert.equal(baseline.outcome, 'unknown');
  assert.deepEqual(baseline.metrics, { attempted: 1, success: 1, failure: 0, unknown: 1, pending: 1 });
  const failed = api.inspect(complete({ connectionLimit: 20, observation: 'withhold-scaled' }));
  assert.equal(failed.outcome, 'failure');
  assert.deepEqual(failed.metrics, { attempted: 2, success: 0, failure: 1, unknown: 1, pending: 0 });
});

test('canonical numeric strings are normalized but ambiguous and out-of-range values are rejected', () => {
  const raw = Object.fromEntries(Object.entries(config()).map(([key, value]) => [key, String(value)]));
  assert.deepEqual(api.parseConfig(raw), config());
  for (const value of ['', ' ', '01', '1e2', '+2', '-1', '1.0', '2 ', '0x10', 'Infinity', NaN, Infinity, -0, 1.1, null, true, [], {}]) {
    assert.throws(() => api.parseConfig(config({ frontendPool: value })), /input|integer|range/i, String(value));
  }
  for (const [key, values] of Object.entries({
    frontendInstances: [0, 9], apiInstances: [0, 9], frontendPool: [0, 41],
    apiPool: [0, 41], connectionLimit: [0, 641], journeyBudget: [79, 2001],
  })) {
    for (const value of values) assert.throws(() => api.parseConfig(config({ [key]: value })), /range/i, key);
  }
});

test('configuration shape, preset, and actual scale-out are guarded', () => {
  for (const invalid of [null, [], {}, { ...config(), unknown: 1 }, { ...config(), observation: 'assume-success' }]) {
    assert.throws(() => api.parseConfig(invalid), /config|input|preset/i);
  }
  const missing = config();
  delete missing.apiPool;
  assert.throws(() => api.parseConfig(missing), /config|input/i);
  assert.throws(() => api.parseConfig(config({ frontendInstances: 1, apiInstances: 1 })), /scale/i);
  const inherited = Object.create({ ...config() });
  assert.throws(() => api.parseConfig(inherited), /config|input/i);
});

test('phase, payload and unknown-action guards reject without mutating state', () => {
  const draft = api.createState();
  const baseline = api.transition(draft, 'baseline', config());
  const finished = api.transition(baseline, 'scale');
  for (const [state, action, input] of [
    [draft, 'scale'], [draft, 'again'], [baseline, 'baseline', config()],
    [baseline, 'again'], [finished, 'scale'], [finished, 'baseline', config()],
    [baseline, 'scale', {}], [finished, 'again', {}], [draft, 'reset', {}],
    [draft, 'invented'], [draft, null],
  ]) {
    const before = clone(state);
    assert.throws(() => api.transition(state, action, input), /phase|action|payload/i);
    assert.deepEqual(state, before);
  }
});

test('exact replayed journal shape rejects forged or impossible state', () => {
  const baseline = clone(api.transition(api.createState(), 'baseline', config()));
  const sparse = { schemaVersion: 1, journal: Array(1) };
  for (const state of [
    null, [], {}, { schemaVersion: 2, journal: [] },
    { schemaVersion: 1, journal: [], override: true }, sparse,
    { schemaVersion: 1, journal: [{ action: 'scale' }] },
    { schemaVersion: 1, journal: [{ action: 'baseline', config: config(), outcome: 'success' }] },
    { schemaVersion: 1, journal: [{ action: 'baseline', config: config({ frontendPool: '10' }) }] },
    { schemaVersion: 1, journal: [{ action: 'baseline', config: config() }, { action: 'baseline', config: config() }] },
  ]) {
    assert.throws(() => api.inspect(state), /state|journal|phase|config|integer/i);
    assert.throws(() => api.transition(state, 'reset'), /state|journal|phase|config|integer/i);
  }
  assert.equal(api.inspect(baseline).phase, 'baseline');
  const taggedArray = { schemaVersion: 1, journal: Object.assign([], { forged: true }) };
  assert.throws(() => api.inspect(taggedArray), /journal/i);
});

test('state, derived records and caller inputs cannot alias mutable history', () => {
  const input = config();
  const state = api.transition(api.createState(), 'baseline', input);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.journal), true);
  assert.equal(Object.isFrozen(state.journal[0].config), true);
  input.frontendPool = 40;
  assert.equal(api.inspect(state).config.frontendPool, 10);
  const view = api.inspect(complete());
  assert.equal(Object.isFrozen(view.history[0].samples[1]), true);
  assert.throws(() => { view.history[0].samples[1].accepted = 999; }, TypeError);
});

test('six attempts are retained without eviction and explicit reset returns complete defaults', () => {
  let state = api.createState();
  for (let index = 0; index < api.MAX_ATTEMPTS; index += 1) {
    if (index) state = api.transition(state, 'again');
    state = complete({ observation: index % 2 ? 'withhold-scaled' : 'complete' }, state);
  }
  const view = api.inspect(state);
  assert.equal(view.history.length, 6);
  assert.throws(() => api.transition(state, 'again'), /history|six|limit/i);
  assert.equal(view.history[0].attempt, 1);
  assert.equal(view.history[5].attempt, 6);
  assert.equal(state.journal.length, 17);
  const reset = api.inspect(api.transition(state, 'reset'));
  assert.equal(reset.phase, 'draft');
  assert.equal(reset.attempt, 1);
  assert.equal(reset.config, null);
  assert.deepEqual(reset.history, []);
  assert.equal(reset.metrics.pending, 2);
});

test('bounded input extrema stay finite, deterministic and within the modeled accepted-connection cap', () => {
  const changes = {
    frontendInstances: 8, apiInstances: 8, frontendPool: 40, apiPool: 40,
    connectionLimit: 1, journeyBudget: 2000,
  };
  const first = api.inspect(complete(changes));
  assert.equal(first.outcome, 'failure');
  assert.equal(first.samples[1].demand, 640);
  assert.equal(first.samples[1].accepted, 1);
  assert.equal(first.samples[1].refused, 639);
  assert.equal(first.samples[1].latencyMs, 128280);
  assert.deepEqual(first, api.inspect(complete(changes)));
  assert.ok(first.samples.every((item) => Number.isSafeInteger(item.latencyMs) && item.accepted <= 1));
});
