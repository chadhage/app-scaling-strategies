'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const lesson = require('../lesson.js');

const representative = Object.freeze({
  mode: 'representative', fixture: 'transaction-rejected', budgetMs: 150, isolated: true
});
const observe = changes => lesson.run(lesson.createSession(), { ...representative, ...changes }).history[0];

test('a shallow probe cannot hide a rejected representative transaction', () => {
  const result = observe({});
  assert.equal(result.endpoint.status, 200);
  assert.equal(result.outcome, 'failure', 'healthy HTTP 200 must not approve a rejected business transaction');
  assert.equal(result.ready, false);
  assert.deepEqual(result.metrics, { passed: 2, failed: 1, unmeasured: 0, journeyMs: 100 });
  assert.equal(result.steps[2].status, 409);
  assert.equal(result.steps[2].observation, 'failure');
  assert.deepEqual(result.effects, { fixtureCommits: 0, externalWrites: 0, receipt: null });
});

test('shallow success leaves every business assertion unmeasured', () => {
  for (const fixture of ['healthy', 'login-denied', 'read-wrong-owner', 'transaction-rejected', 'transaction-unobserved']) {
    const result = observe({ mode: 'shallow', fixture });
    assert.equal(result.endpoint.status, 200);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.ready, false);
    assert.deepEqual(result.metrics, { passed: 0, failed: 0, unmeasured: 3, journeyMs: null });
    assert.ok(result.steps.every(step => step.observation === 'not-run'));
    assert.equal(result.effects.fixtureCommits, 0);
    assert.equal(result.effects.externalWrites, 0);
  }
});

test('only the full healthy path within budget succeeds with a fixture-only receipt', () => {
  for (const budgetMs of [100, 150, 500]) {
    const result = observe({ fixture: 'healthy', budgetMs });
    assert.equal(result.outcome, 'success');
    assert.equal(result.ready, true);
    assert.deepEqual(result.metrics, { passed: 3, failed: 0, unmeasured: 0, journeyMs: 100 });
    assert.deepEqual(result.steps.map(step => step.name), ['login', 'read', 'transaction']);
    assert.ok(result.steps.every(step => step.observation === 'success'));
    assert.deepEqual(result.effects, { fixtureCommits: 1, externalWrites: 0, receipt: 'fixture-v1-run-1' });
  }
  const tooSlow = observe({ fixture: 'healthy', budgetMs: 99 });
  assert.equal(tooSlow.outcome, 'failure');
  assert.equal(tooSlow.ready, false);
  assert.equal(tooSlow.metrics.passed, 3);
  assert.match(tooSlow.reason, /budget/i);
});

test('login and read failures stop later fixture effects', () => {
  const login = observe({ fixture: 'login-denied' });
  assert.equal(login.outcome, 'failure');
  assert.equal(login.steps[0].status, 403);
  assert.deepEqual(login.steps.map(step => step.observation), ['failure', 'not-run', 'not-run']);
  assert.deepEqual(login.metrics, { passed: 0, failed: 1, unmeasured: 2, journeyMs: null });
  const read = observe({ fixture: 'read-wrong-owner' });
  assert.equal(read.outcome, 'failure');
  assert.equal(read.steps[1].status, 200);
  assert.match(read.steps[1].detail, /owner/i);
  assert.deepEqual(read.steps.map(step => step.observation), ['success', 'failure', 'not-run']);
  assert.equal(read.effects.fixtureCommits, 0);
  assert.equal(login.effects.externalWrites, 0);
});

test('unobserved transaction receipt, commit count and latency stay unknown', () => {
  const result = observe({ fixture: 'transaction-unobserved' });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.ready, false);
  assert.equal(result.steps[2].observation, 'unknown');
  assert.equal(result.steps[2].status, null);
  assert.equal(result.steps[2].durationMs, null);
  assert.deepEqual(result.metrics, { passed: 2, failed: 0, unmeasured: 1, journeyMs: null });
  assert.deepEqual(result.effects, { fixtureCommits: null, externalWrites: 0, receipt: null });
});

test('isolation guard runs before the endpoint and any business step', () => {
  for (const mode of ['shallow', 'representative']) {
    const result = observe({ mode, fixture: 'healthy', isolated: false });
    assert.equal(result.outcome, 'failure');
    assert.equal(result.ready, false);
    assert.deepEqual(result.endpoint, { status: null, durationMs: null, observation: 'not-run' });
    assert.ok(result.steps.every(step => step.observation === 'not-run'));
    assert.deepEqual(result.effects, { fixtureCommits: 0, externalWrites: 0, receipt: null });
  }
});

test('strict input guards reject invalid types, ranges, shapes and unsafe coercion', () => {
  const session = lesson.createSession();
  const before = JSON.stringify(session);
  const invalid = [
    null, undefined, [], 'representative', 1,
    {}, { ...representative, extra: true }, { ...representative, mode: 'health' },
    { ...representative, mode: '__proto__' }, { ...representative, fixture: 'production' },
    { ...representative, fixture: 'toString' }, { ...representative, isolated: 'true' },
    { ...representative, isolated: 1 }, { ...representative, budgetMs: '150' },
    ...[NaN, Infinity, -Infinity, 0, 49, 501, 100.5, null, false].map(budgetMs => ({ ...representative, budgetMs })),
    Object.assign(Object.create({ inherited: true }), representative),
    { ...representative, [Symbol('hidden')]: true }
  ];
  const accessor = { ...representative };
  Object.defineProperty(accessor, 'budgetMs', { enumerable: true, get() { throw new Error('must not evaluate getters'); } });
  invalid.push(accessor);
  for (const input of invalid) {
    assert.throws(() => lesson.run(session, input), error => error.code === 'INPUT', `must reject ${typeof input}`);
    assert.equal(JSON.stringify(session), before);
  }
  assert.doesNotThrow(() => observe({ fixture: 'healthy', budgetMs: 50 }));
  assert.throws(() => lesson.evaluate(representative, 0), error => error.code === 'STATE');
  assert.throws(() => lesson.evaluate(representative, 7), error => error.code === 'STATE');
});

test('immutable bounded history retains every outcome and reset is deterministic', () => {
  let session = lesson.createSession();
  const first = session;
  const configurations = [
    { ...representative, mode: 'shallow' }, representative,
    { ...representative, fixture: 'healthy' },
    { ...representative, fixture: 'transaction-unobserved' },
    { ...representative, isolated: false },
    { ...representative, fixture: 'healthy', budgetMs: 99 }
  ];
  for (const config of configurations) session = lesson.run(session, config);
  assert.deepEqual(first, { version: 1, history: [] });
  assert.equal(session.history.length, lesson.MAX_RUNS);
  assert.deepEqual(session.history.map(result => result.outcome), ['unknown', 'failure', 'success', 'unknown', 'failure', 'failure']);
  assert.deepEqual(session.history.map(result => result.id), [1, 2, 3, 4, 5, 6]);
  assert.equal(session.history[2].effects.receipt, 'fixture-v1-run-3');
  assert.ok(Object.isFrozen(session) && Object.isFrozen(session.history));
  assert.ok(Object.isFrozen(session.history[0].config) && Object.isFrozen(session.history[0].steps[0]));
  assert.throws(() => session.history.push({}), TypeError);
  const before = JSON.stringify(session);
  assert.throws(() => lesson.run(session, representative), error => error.code === 'HISTORY_FULL');
  assert.equal(JSON.stringify(session), before);
  assert.deepEqual(lesson.createSession(), first);
  assert.deepEqual(observe({}), observe({}));
});

test('malformed, forged and sparse state is rejected without changing its history', () => {
  const good = lesson.run(lesson.createSession(), representative);
  const copy = () => JSON.parse(JSON.stringify(good));
  const badOutcome = copy();
  badOutcome.history[0].outcome = 'success';
  const badMetrics = copy();
  badMetrics.history[0].metrics.passed = 3;
  const badReceipt = copy();
  badReceipt.history[0].effects.receipt = 'real-order';
  const badId = copy();
  badId.history[0].id = 2;
  const sparse = { version: 1, history: new Array(1) };
  const extra = copy();
  extra.history.extra = true;
  const invalid = [null, [], {}, { version: 2, history: [] }, { version: 1, history: [], extra: true },
    { version: 1, history: '[]' }, sparse, extra, badOutcome, badMetrics, badReceipt, badId,
    { version: 1, history: new Array(7).fill(good.history[0]) }];
  for (const state of invalid) {
    const before = JSON.stringify(state);
    assert.throws(() => lesson.run(state, representative), error => error.code === 'STATE');
    assert.equal(JSON.stringify(state), before);
  }
  assert.doesNotThrow(() => lesson.run(copy(), representative));
});
