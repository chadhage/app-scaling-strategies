'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DEFAULTS, createState, transition } = require('..\\model.js');

const config = (changes = {}) => ({ ...DEFAULTS, ...changes });
function finish(changes = {}, initial = createState()) {
  let state = transition(initial, 'start', config(changes));
  for (let index = 0; index < 4; index += 1) state = transition(state, 'step');
  return state;
}

test('baseline: the stub is loadable and declares conservative initial state', () => {
  const state = createState();
  assert.equal(state.phase, 'ready');
  assert.equal(state.current, null);
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.config, {
    routing: 'mixed', requirement: 'base', policy: 'contract-aware', oldCondition: 'supported',
  });
});

test('S052 supported old contract: four requests succeed under mixed effective routing', () => {
  const state = finish();
  assert.equal(state.current.outcome, 'success');
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.current.rows.map((row) => row.backend), ['old', 'new', 'old', 'new']);
  assert.deepEqual(state.current.metrics, {
    attempted: 4, success: 4, failure: 0, unknown: 0, responses200: 4,
    oldRequests: 2, newRequests: 2, optionalUnavailable: 0, rejectedSilentSuccess: 0,
  });
  assert.equal(state.current.rows[0].view.displayName, 'Aster');
  assert.equal(state.current.rows[0].contract, 'profile.v1');
  assert.equal(state.current.rows[1].contract, 'profile.v2');
  assert.equal(state.current.oldCompatibility, 'demonstrated in this synthetic attempt');
  assert.equal(state.history.length, 1);
});

test('optional timeZone remains explicitly unavailable on the supported old API', () => {
  const state = finish({ requirement: 'optional-timezone' });
  assert.equal(state.current.outcome, 'success');
  assert.equal(state.current.metrics.optionalUnavailable, 2);
  for (const row of state.current.rows.filter((item) => item.backend === 'old')) {
    assert.equal(row.feature, 'unavailable-optional');
    assert.equal(row.view.timeZone, null);
    assert.equal(row.frontendResult, 'rendered-feature-unavailable');
    assert.match(row.reason, /optional.*unavailable/i);
  }
  assert.equal(state.current.rows[1].view.timeZone, 'Etc/UTC');
});

test('required feature absence fails even when every response is HTTP 200', () => {
  const state = finish({ requirement: 'required-timezone' });
  assert.equal(state.current.outcome, 'failure');
  assert.equal(state.current.metrics.responses200, 4);
  assert.equal(state.current.metrics.failure, 2);
  assert.equal(state.current.metrics.success, 2);
  assert.equal(state.current.rows[0].frontendResult, 'explicit-unsupported');
  assert.match(state.current.rows[0].reason, /required.*timeZone.*unavailable/i);
});

test('status-only success-shaped fallback is rejected by an independent contract check', () => {
  const state = finish({ requirement: 'required-timezone', policy: 'status-only' });
  assert.equal(state.current.outcome, 'failure');
  assert.equal(state.current.metrics.rejectedSilentSuccess, 2);
  assert.equal(state.current.rows[0].frontendResult, 'claims-success');
  assert.equal(state.current.rows[0].outcome, 'failure');
  assert.match(state.current.rows[0].reason, /silent success rejected/i);
});

test('a malformed HTTP 200 old contract fails base and optional journeys', () => {
  for (const requirement of ['base', 'optional-timezone']) {
    for (const policy of ['contract-aware', 'status-only']) {
      const state = finish({ oldCondition: 'malformed', requirement, policy });
      assert.equal(state.current.outcome, 'failure');
      assert.equal(state.current.metrics.failure, 2);
      assert.match(state.current.rows[0].reason, /displayName/);
      assert.equal(state.current.rows[0].httpStatus, 200);
      assert.equal(state.current.rows[0].view, null);
    }
  }
});

test('withheld old observation is unknown, while observed timeout is a known failure', () => {
  const unknown = finish({ oldCondition: 'unobserved', requirement: 'required-timezone' });
  assert.equal(unknown.current.outcome, 'unknown');
  assert.equal(unknown.current.metrics.unknown, 2);
  assert.equal(unknown.current.metrics.success, 2);
  assert.equal(unknown.current.rows[0].httpStatus, null);
  assert.equal(unknown.current.rows[0].observation, 'missing');
  assert.equal(unknown.current.rows[0].feature, 'unverified');
  const failed = finish({ oldCondition: 'timeout' });
  assert.equal(failed.current.outcome, 'failure');
  assert.equal(failed.current.metrics.failure, 2);
  assert.equal(failed.current.metrics.unknown, 0);
  assert.equal(failed.current.rows[0].observation, 'timeout');
});

test('new-only success has zero old coverage and cannot prove old compatibility', () => {
  const state = finish({ routing: 'new-only', requirement: 'required-timezone', oldCondition: 'timeout' });
  assert.equal(state.current.outcome, 'success');
  assert.equal(state.current.metrics.oldRequests, 0);
  assert.equal(state.current.metrics.newRequests, 4);
  assert.equal(state.current.oldCompatibility, 'not established: no old API requests');
  assert.deepEqual(state.current.rows.map((row) => row.backend), ['new', 'new', 'new', 'new']);
});

test('old-only required-feature failure is not rescued by desired new routing', () => {
  const state = finish({ routing: 'old-only', requirement: 'required-timezone' });
  assert.equal(state.current.outcome, 'failure');
  assert.equal(state.current.metrics.failure, 4);
  assert.equal(state.current.metrics.newRequests, 0);
  assert.equal(state.current.metrics.oldRequests, 4);
});

test('an unfinished prefix remains unknown and is not retained as a completed result', () => {
  let state = transition(createState(), 'start', config());
  state = transition(state, 'step');
  assert.equal(state.phase, 'running');
  assert.equal(state.current.cursor, 1);
  assert.equal(state.current.outcome, 'unknown');
  assert.equal(state.current.metrics.attempted, 1);
  assert.equal(state.current.metrics.success, 1);
  assert.equal(state.history.length, 0);
});

test('prediction verifier is separate from unchanged user outcomes', () => {
  const completed = finish({ requirement: 'required-timezone', policy: 'status-only' });
  const wrong = transition(completed, 'predict', 'success');
  assert.deepEqual(wrong.prediction, { expected: 'success', actual: 'failure', verdict: 'FAIL' });
  assert.equal(wrong.current.outcome, 'failure');
  assert.deepEqual(wrong.history, completed.history);
  const right = transition(wrong, 'predict', 'failure');
  assert.deepEqual(right.prediction, { expected: 'failure', actual: 'failure', verdict: 'PASS' });
  assert.equal(right.current.outcome, 'failure');
  assert.equal(right.history[0].outcome, 'failure');
});

test('strict config guards reject coercion, missing/extra keys and prototype tricks', () => {
  const bad = [
    null, undefined, [], 'mixed', {}, { ...config(), routing: ' mixed' },
    { ...config(), requirement: 'REQUIRED-TIMEZONE' }, { ...config(), policy: 1 },
    { ...config(), oldCondition: 'unknown' }, { ...config(), ignored: true },
    Object.assign(Object.create({ routing: 'mixed' }), config()),
    { ...config(), policy: { toString() { return 'contract-aware'; } } },
  ];
  for (const input of bad) assert.throws(() => transition(createState(), 'start', input), /configuration/i);
});

test('state and action guards reject forged state and out-of-order transitions', () => {
  const initial = createState();
  assert.throws(() => transition({}, 'reset'), /state/i);
  assert.throws(() => transition({ ...initial }, 'start', config()), /state/i);
  for (const action of ['step', 'again', 'predict', 'unknown', null]) {
    assert.throws(() => transition(initial, action, action === 'predict' ? 'success' : undefined));
  }
  const active = transition(initial, 'start', config());
  assert.throws(() => transition(active, 'start', config()), /phase/i);
  assert.throws(() => transition(active, 'predict', 'success'), /phase/i);
  assert.throws(() => transition(active, 'again'), /phase/i);
  assert.throws(() => transition(active, 'step', {}), /payload/i);
  assert.throws(() => transition(active, 'reset', 'surprise'), /payload/i);
  const done = finish();
  assert.throws(() => transition(done, 'step'), /phase/i);
  for (const prediction of ['', 'Success', ' success', null, [], {}, 0]) {
    assert.throws(() => transition(done, 'predict', prediction), /prediction/i);
  }
  assert.equal(active.current.cursor, 0);
});

test('minted state, response fixtures and completed history cannot be mutated', () => {
  const state = finish();
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.history), true);
  assert.equal(Object.isFrozen(state.current.rows[0].body), true);
  assert.throws(() => { state.config.routing = 'new-only'; }, TypeError);
  assert.throws(() => { state.current.rows[0].body.displayName = 'Changed'; }, TypeError);
  assert.throws(() => { state.history.pop(); }, TypeError);
});

test('another attempt retains failed and unknown outcomes and blocks ninth rather than pruning', () => {
  let state = createState();
  const outcomes = [];
  for (let index = 0; index < 8; index += 1) {
    const changes = index % 3 === 0 ? { requirement: 'required-timezone' }
      : index % 3 === 1 ? { oldCondition: 'unobserved' } : {};
    state = finish(changes, state);
    outcomes.push(state.current.outcome);
    assert.equal(state.history.length, index + 1);
    assert.equal(state.current.id, index + 1);
    assert.deepEqual(state.history.map((item) => item.outcome), outcomes);
    if (index < 7) state = transition(state, 'again');
  }
  assert.throws(() => transition(state, 'again'), /history.*8.*reset/i);
  assert.deepEqual(state.history.map((item) => item.outcome), [
    'failure', 'unknown', 'success', 'failure', 'unknown', 'success', 'failure', 'unknown',
  ]);
});

test('explicit reset from every phase clears all data and restores exact defaults', () => {
  const active = transition(createState(), 'start', config({ routing: 'old-only' }));
  const done = transition(finish({ requirement: 'required-timezone' }), 'predict', 'failure');
  for (const state of [createState(), active, done]) {
    const reset = transition(state, 'reset');
    assert.equal(reset.phase, 'ready');
    assert.equal(reset.current, null);
    assert.equal(reset.prediction, null);
    assert.deepEqual(reset.config, DEFAULTS);
    assert.deepEqual(reset.history, []);
    assert.equal(finish({}, reset).current.id, 1);
  }
});
