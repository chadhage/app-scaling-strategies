'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const safe = {
  scope: 'effective', setting: 'target', identity: 'granted', network: 'reachable', background: 'suppressed'
};
const copy = (value) => JSON.parse(JSON.stringify(value));

test('effective target settings, retained identity/network and suppressed work produce four observed checks', () => {
  const initial = model.create();
  const next = model.validate(initial, safe);
  assert.equal(model.summarize(next).verdict, 'success');
  assert.equal(next.attempts[0].checks.length, 4);
  assert.ok(next.attempts[0].checks.every((check) => check.status === 'pass'));
  assert.equal(next.attempts[0].candidateIdentity, 'candidate-mi');
  assert.equal(next.attempts[0].candidateNetwork, 'candidate-subnet');
  assert.equal(next.attempts[0].productionBackgroundWorkers, 1);
  assert.equal(next.attempts[0].candidateBackgroundStarts, 0);
  assert.equal(next.attempts[0].duplicateBackgroundStarts, 0);
  assert.deepEqual(initial, model.create());
});

test('zero observations and successful staging-only validation cannot prove target readiness', () => {
  assert.equal(model.summarize(model.create()).verdict, 'unknown');
  const next = model.validate(model.create(), model.DEFAULTS);
  assert.equal(model.summarize(next).verdict, 'unknown');
  assert.ok(next.attempts[0].checks.every((check) => check.status === 'pass'));
  assert.equal(next.attempts[0].targetSettingsObserved, false);
  assert.match(next.attempts[0].explanation, /staging/i);
});

test('effective target validation independently exposes retained setting, identity grant and network failure', () => {
  const state = model.validate(model.create(), {
    ...safe, setting: 'sticky-staging', identity: 'denied', network: 'blocked'
  });
  const result = state.attempts[0];
  assert.equal(result.verdict, 'failure');
  assert.deepEqual(result.checks.map((check) => check.status), ['fail', 'fail', 'fail', 'pass']);
  const rows = model.compare(result.config);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].effective, 'orders-stage-fixture');
  assert.equal(rows[0].production, 'orders-prod-fixture');
  assert.equal(rows[1].effective, 'candidate-mi (denied)');
  assert.equal(rows[2].effective, 'candidate-subnet (blocked)');
  assert.match(rows[1].rule, /not swapped/i);
  assert.match(rows[2].rule, /not swapped/i);
});

test('unsafe background mode is blocked before dependency validation and never starts a second worker', () => {
  const state = model.validate(model.create(), { ...safe, background: 'enabled' });
  const attempt = state.attempts[0];
  assert.equal(attempt.verdict, 'failure');
  assert.equal(attempt.blocked, true);
  assert.equal(attempt.preventedDuplicateStarts, 1);
  assert.deepEqual(attempt.checks.map((check) => check.status), ['skipped', 'skipped', 'skipped', 'fail']);
  assert.equal(attempt.candidateBackgroundStarts, 0);
  assert.equal(attempt.duplicateBackgroundStarts, 0);
  assert.equal(model.summarize(state).blocked, 1);
});

for (const key of ['setting', 'identity', 'network']) {
  test(`missing ${key} observation stays unknown even after a later success`, () => {
    const first = model.validate(model.create(), { ...safe, [key]: 'unobserved' });
    assert.equal(first.attempts[0].verdict, 'unknown');
    assert.equal(first.attempts[0].checks.filter((check) => check.status === 'unknown').length, 1);
    const next = model.validate(first, safe);
    assert.equal(next.attempts[1].verdict, 'success');
    assert.equal(model.summarize(next).verdict, 'unknown');
    assert.equal(model.summarize(next).unknown, 1);
    assert.equal(model.summarize(next).successful, 1);
  });
}

test('a measured failure dominates unknown and recovery without rewriting prior snapshots', () => {
  const first = model.validate(model.create(), { ...safe, identity: 'denied' });
  const preserved = JSON.stringify(first);
  const next = model.validate(model.validate(first, { ...safe, network: 'unobserved' }), safe);
  assert.equal(model.summarize(next).verdict, 'failure');
  assert.equal(model.summarize(next).failed, 1);
  assert.equal(model.summarize(next).unknown, 1);
  assert.equal(model.summarize(next).successful, 1);
  assert.equal(JSON.stringify(first), preserved);
});

test('configuration accepts only exact own enum properties and rejects malformed inputs atomically', () => {
  const state = model.create();
  for (const bad of [null, [], 2, 'effective', {}, { ...safe, extra: true },
    { ...safe, scope: 'production' }, { ...safe, background: true }, { ...safe, network: 1 },
    { ...safe, identity: 'GRANTED' }, Object.assign(Object.create({ extra: true }), safe)]) {
    const before = JSON.stringify(state);
    assert.throws(() => model.validate(state, bad), /Invalid configuration/);
    assert.throws(() => model.compare(bad), /Invalid configuration/);
    assert.equal(JSON.stringify(state), before);
  }
});

test('all public state operations reject forged, malformed or noncanonical state without mutation', () => {
  const valid = model.validate(model.create(), safe);
  const forged = copy(valid);
  forged.attempts[0].verdict = 'unknown';
  const noncontiguous = copy(valid);
  noncontiguous.attempts[0].step = 2;
  const extra = copy(valid);
  extra.attempts[0].extra = true;
  const unsafeCount = copy(valid);
  unsafeCount.attempts[0].candidateBackgroundStarts = 1;
  const invalidConfig = copy(valid);
  invalidConfig.attempts[0].config.identity = 'admin';
  for (const state of [null, [], {}, { ...model.create(), extra: true }, { ...model.create(), runId: NaN },
    { ...model.create(), runId: 0 }, { ...model.create(), runId: 1.5 },
    { ...model.create(), evictedRuns: -1 }, { ...model.create(), history: [{}] },
    { ...model.create(), runId: 2 }, forged, noncontiguous, extra, unsafeCount, invalidConfig]) {
    const before = JSON.stringify(state);
    for (const operation of [
      () => model.validate(state, safe), () => model.summarize(state), () => model.reset(state)
    ]) assert.throws(operation, /Invalid state/);
    assert.equal(JSON.stringify(state), before);
  }
});

test('validation bound rejects further work without dropping a single observation', () => {
  let state = model.create();
  for (let index = 0; index < model.LIMITS.validations; index += 1) state = model.validate(state, safe);
  const before = JSON.stringify(state);
  assert.throws(() => model.validate(state, safe), /six validations/i);
  assert.equal(state.attempts.length, 6);
  assert.equal(JSON.stringify(state), before);
});

test('archive/reset preserves complete failed and unknown runs with bounded eviction and fresh unknown', () => {
  let state = model.create();
  assert.deepEqual(model.reset(state), state);
  for (let index = 0; index < 5; index += 1) {
    state = model.validate(state, { ...safe, identity: index === 4 ? 'denied' : 'unobserved' });
    state = model.reset(state);
  }
  assert.equal(state.runId, 6);
  assert.equal(state.history.length, 3);
  assert.equal(state.evictedRuns, 2);
  assert.deepEqual(state.history.map((run) => run.runId), [3, 4, 5]);
  assert.equal(state.history[2].summary.verdict, 'failure');
  assert.equal(state.history[0].summary.verdict, 'unknown');
  assert.equal(state.history[2].attempts[0].config.identity, 'denied');
  assert.equal(model.summarize(state).verdict, 'unknown');
  assert.equal(state.attempts.length, 0);
  const forged = copy(state);
  forged.history[0].summary.verdict = 'success';
  assert.throws(() => model.reset(forged), /Invalid state/);
});

test('run-ID exhaustion is explicit and preserves the final full run', () => {
  let state = model.create();
  for (let index = 1; index < model.LIMITS.runId; index += 1) state = model.reset(model.validate(state, safe));
  state = model.validate(state, safe);
  const before = JSON.stringify(state);
  assert.equal(state.runId, 1000);
  assert.throws(() => model.reset(state), /run ID limit/i);
  assert.equal(JSON.stringify(state), before);
});

test('the finite configuration matrix is deterministic, fail-closed and side-effect-free', () => {
  for (const scope of ['staging', 'effective']) {
    for (const setting of ['target', 'sticky-staging', 'unobserved']) {
      for (const identity of ['granted', 'denied', 'unobserved']) {
        for (const network of ['reachable', 'blocked', 'unobserved']) {
          for (const background of ['suppressed', 'enabled']) {
            const config = { scope, setting, identity, network, background };
            const one = model.validate(model.create(), config);
            assert.deepEqual(one, model.validate(model.create(), config));
            const attempt = one.attempts[0];
            assert.equal(attempt.candidateBackgroundStarts, 0);
            assert.equal(attempt.duplicateBackgroundStarts, 0);
            const expected = background === 'enabled' ? 'failure'
              : scope === 'staging' ? 'unknown'
                : setting === 'sticky-staging' || identity === 'denied' || network === 'blocked' ? 'failure'
                  : Object.values(config).includes('unobserved') ? 'unknown' : 'success';
            assert.equal(attempt.verdict, expected, JSON.stringify(config));
          }
        }
      }
    }
  }
});
