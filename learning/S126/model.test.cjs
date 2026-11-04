'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const lesson = require('./model.js');
const command = (type) => ({ type });
const clone = (value) => JSON.parse(JSON.stringify(value));
const prepare = (fixture = 'healthy') => lesson.execute(lesson.createState(), { type: 'prepare', fixture, token: 'v2' });
function eligible(fixture = 'healthy') {
  let state = prepare(fixture);
  state = lesson.execute(state, command('inspect'));
  return lesson.execute(state, command('preview'));
}
function canary(fixture = 'healthy') {
  const split = lesson.execute(eligible(fixture), { type: 'split', allocation: '80/20/0' });
  return lesson.execute(split, command('measure'));
}
function promoted(fixture = 'healthy') {
  const split = lesson.execute(canary(fixture), { type: 'split', allocation: '0/100/0' });
  return lesson.execute(split, command('measure'));
}
function retirement(fixture = 'healthy') {
  const audited = lesson.execute(promoted(fixture), command('audit-old'));
  return lesson.execute(audited, command('retire'));
}

test('recording a valid fictional candidate changes phase without certifying readiness', () => {
  const state = lesson.execute(lesson.createState(), {
    type: 'prepare', fixture: 'healthy', token: 'v2',
  });
  assert.equal(state.phase, 'prepared');
  assert.equal(state.candidateRecorded, true);
  assert.equal(state.readinessResult, 'unobserved');
  assert.equal(state.previewResult, 'unobserved');
  assert.equal(state.metrics.attempted, 0);
  assert.deepEqual(state.desiredWeights, [100, 0, 0]);
  assert.match(state.history[0].summary, /no readiness/);
});

test('fictional revisions and allocations are fixed, distinct, immutable DATA', () => {
  assert.deepEqual(lesson.revisions.map((row) => row.software), ['v1', 'v2', 'v3']);
  assert.equal(new Set(lesson.revisions.map((row) => row.revision)).size, 3);
  for (const row of lesson.revisions) assert.equal(row.immutableTeachingRecord, true);
  for (const weights of Object.values(lesson.allocations)) {
    assert.equal(weights.reduce((sum, value) => sum + value, 0), 100);
    assert.equal(weights[2], 0);
  }
  assert.equal(Object.isFrozen(lesson.revisions[0]), true);
  assert.throws(() => { lesson.revisions[0].software = 'native'; }, TypeError);
  assert.throws(() => { lesson.allocations['80/20/0'][0] = 0; }, TypeError);
});

test('readiness separately checks ALL replicas, dependency, state, fresh capacity and provisioning', () => {
  const good = lesson.execute(prepare(), command('inspect'));
  assert.equal(good.phase, 'ready');
  assert.equal(good.readinessResult, 'pass');
  assert.equal(good.previewResult, 'unobserved');
  const failed = lesson.execute(prepare('probe-only'), command('inspect'));
  assert.equal(failed.readinessResult, 'fail');
  assert.equal(failed.phase, 'prepared');
  assert.deepEqual(failed.lastData.readiness[0].readiness, [true, true]);
  assert.equal(failed.lastData.readiness[0].dependency, 'fail');
  const unknown = lesson.execute(prepare('readiness-unknown'), command('inspect'));
  assert.equal(unknown.readinessResult, 'unknown');
  assert.equal(unknown.phase, 'prepared');
  assert.equal(unknown.metrics.attempted, 0);
});

test('preview authorization is necessary despite zero ordinary preview allocation', async (t) => {
  for (const [fixture, expected] of [
    ['healthy', 'pass'], ['preview-leak', 'fail'], ['callback-broken', 'fail'], ['preview-unknown', 'unknown'],
  ]) await t.test(fixture, () => {
    const state = eligible(fixture);
    assert.equal(state.previewResult, expected);
    const paths = state.lastData.paths;
    assert.equal(paths.length, 7);
    assert.equal(paths.some((row) => row.path === 'selected-login'), true);
    assert.equal(paths.some((row) => row.path === 'selected-callback'), true);
    assert.equal(paths.filter((row) => row.path === 'production-navigation').length, 2);
    assert.equal(paths.filter((row) => row.expectedStatus === 403).length, 3);
    assert.equal(state.lastData.labelIsNotAuthorization, true);
    const split = lesson.execute(state, { type: 'split', allocation: '80/20/0' });
    assert.equal(split.phase, expected === 'pass' ? 'canary-unmeasured' : 'ready');
    if (expected !== 'pass') {
      assert.equal(split.history.at(-1).result, 'held');
      assert.equal(split.metrics.attempted, 0);
      assert.deepEqual(split.desiredWeights, [100, 0, 0]);
    }
  });
});

test('operator weight choices are not effective routing, user migration or compute scaling observations', () => {
  const state = lesson.execute(eligible(), { type: 'split', allocation: '80/20/0' });
  assert.equal(state.phase, 'canary-unmeasured');
  assert.deepEqual(state.desiredWeights, [80, 20, 0]);
  assert.equal(state.observedWeights, null);
  assert.deepEqual(state.lastObservedWeights, [100, 0, 0]);
  assert.equal(state.routeResult, 'unobserved');
  assert.equal(state.previewResult, 'unobserved');
  assert.equal(state.metrics.attempted, 0);
  const measured = lesson.execute(state, command('measure'));
  assert.equal(measured.canaryResult, 'pass');
  assert.equal(measured.previewResult, 'pass');
  assert.equal(measured.lastData.requests.filter((row) => row.observedRevision === 'fiction-old-r1').length, 8);
  assert.deepEqual(measured.metrics, { attempted: 2, successful: 2, interrupted: 0, unknown: 0 });
  assert.match(measured.userImpact, /not proof that all real users migrated/);
});

test('unmeasured or negative canary cannot promote and repeated samples cannot inflate journeys', () => {
  const early = lesson.execute(eligible(), { type: 'split', allocation: '0/100/0' });
  assert.equal(early.phase, 'ready');
  assert.equal(early.history.at(-1).result, 'held');
  const failed = canary('candidate-fault');
  assert.equal(failed.canaryResult, 'fail');
  assert.equal(failed.metrics.interrupted, 1);
  const held = lesson.execute(failed, { type: 'split', allocation: '0/100/0' });
  assert.equal(held.phase, 'canary-measured');
  assert.deepEqual(held.metrics, failed.metrics);
  const repeated = lesson.execute(held, command('measure'));
  assert.deepEqual(repeated.metrics, failed.metrics);
  assert.equal(repeated.history.at(-1).result, 'held');
  assert.equal(repeated.history.length, failed.history.length + 2);
});

test('healthy measured promotion and independent drain gates retire exactly one record', () => {
  const state = retirement();
  assert.equal(state.phase, 'retired');
  assert.deepEqual(state.lifecycle, { old: 'retired', canary: 'active', preview: 'active' });
  assert.equal(state.promotionResult, 'pass');
  assert.equal(state.auditResult, 'pass');
  assert.equal(state.retirement, 'allowed for old teaching record only');
  assert.deepEqual(state.metrics, { attempted: 5, successful: 5, interrupted: 0, unknown: 0 });
  assert.equal(state.lastData.nativeOperation, false);
  assert.equal(state.lastData.remainingActiveRevisions.length, 2);
  assert.equal(state.history.length, 9);
  const checked = lesson.execute(state, command('preview'));
  assert.equal(checked.phase, 'retired');
  assert.equal(checked.previewResult, 'pass');
  assert.equal(checked.lastData.paths[1].observedRevision, 'fiction-preview-r3');
  assert.equal(checked.lastData.paths[2].observedRevision, 'fiction-canary-r2');
  assert.equal(checked.lastData.paths[5].observedStatus, 403);
  assert.deepEqual(checked.metrics, state.metrics);
});

test('preview authorization is remeasured after each split and cannot be reused across promotion', () => {
  const first = canary('preview-after-promotion');
  assert.equal(first.canaryResult, 'pass');
  assert.equal(first.previewResult, 'pass');
  const split = lesson.execute(first, { type: 'split', allocation: '0/100/0' });
  assert.equal(split.previewResult, 'unobserved');
  const measured = lesson.execute(split, command('measure'));
  assert.equal(measured.routeResult, 'pass');
  assert.equal(measured.latestJourneys.verdict, 'pass');
  assert.equal(measured.previewResult, 'fail');
  assert.equal(measured.promotionResult, 'fail');
  assert.equal(measured.lastData.paths[5].observedStatus, 200);
  assert.deepEqual(measured.metrics, { attempted: 5, successful: 5, interrupted: 0, unknown: 0 });
  const held = lesson.execute(lesson.execute(measured, command('audit-old')), command('retire'));
  assert.equal(held.lifecycle.old, 'active');
  assert.equal(held.retirement, 'held; never inferred from zero weight');
  const recovered = lesson.execute(measured, command('rollback'));
  assert.equal(recovered.previewResult, 'pass');
  assert.equal(recovered.lastData.paths[5].observedStatus, 403);
  assert.equal(recovered.lastData.paths[2].observedRevision, 'fiction-old-r1');
  assert.deepEqual(recovered.history.slice(0, measured.history.length), measured.history);
});

test('zero old weight and successful probes cannot replace actual routing, migration or work gates', async (t) => {
  for (const [fixture, result, unknown] of [
    ['pinned-old', 'fail', 1], ['route-unknown', 'unknown', 0],
    ['journey-unknown', 'unknown', 1], ['old-work', 'fail', 0], ['drain-unknown', 'unknown', 0],
  ]) await t.test(fixture, () => {
    const state = retirement(fixture);
    assert.deepEqual(state.desiredWeights, [0, 100, 0]);
    assert.equal(state.phase, 'promotion-measured');
    assert.equal(state.lifecycle.old, 'active');
    assert.equal(state.history.at(-1).result, 'held');
    assert.equal(state.history.at(-1).verifier, result);
    assert.equal(state.metrics.attempted, 5);
    assert.equal(state.metrics.unknown, unknown);
    if (fixture === 'old-work') {
      assert.equal(state.promotionResult, 'pass');
      assert.equal(state.history.at(-2).data.old.jobs, 1);
      assert.equal(state.metrics.successful, 5);
    }
    if (fixture === 'pinned-old') {
      assert.deepEqual(state.observedWeights, [0, 100, 0]);
      assert.equal(state.history.at(-3).data.journeys.observations[0].outcome, 'unknown');
      assert.equal(state.history.at(-3).data.requests[0].observedRevision, 'fiction-old-r1');
    }
  });
});

test('unknown current route is never replaced by the last known routing data', () => {
  const state = promoted('route-unknown');
  assert.equal(state.observedWeights, null);
  assert.deepEqual(state.lastObservedWeights, [80, 20, 0]);
  assert.equal(state.routeResult, 'unknown');
  assert.equal(state.promotionResult, 'unknown');
  assert.equal(state.metrics.successful, 5);
  const unaudited = lesson.execute(state, command('retire'));
  assert.equal(unaudited.lifecycle.old, 'active');
  assert.equal(unaudited.verifier, 'unknown');
});

test('premature retirement records a safe hold without inventing user attempts or native operations', () => {
  const state = lesson.execute(lesson.createState(), command('retire'));
  assert.equal(state.phase, 'baseline');
  assert.equal(state.lifecycle.old, 'active');
  assert.equal(state.safeHolds, 1);
  assert.equal(state.metrics.attempted, 0);
  assert.match(state.userImpact, /no completed user migration/);
  assert.equal(state.history[0].data.gates.every((gate) => gate.result === 'pass'), false);
});

test('compatible rollback uses fresh old checks and preserves the entire interrupted denominator', () => {
  const failed = canary('candidate-fault');
  const state = lesson.execute(failed, command('rollback'));
  assert.equal(state.phase, 'rolled-back');
  assert.equal(state.rollbackResult, 'pass');
  assert.deepEqual(state.observedWeights, [100, 0, 0]);
  assert.deepEqual(state.metrics, { attempted: 4, successful: 3, interrupted: 1, unknown: 0 });
  assert.deepEqual(state.history.slice(0, failed.history.length), failed.history);
  assert.equal(state.lastData.gates.every((gate) => gate.result === 'pass'), true);
  assert.equal(state.lastData.readiness[0].fresh, true);
  assert.equal(state.latestJourneys.observations.every((row) => row.observedRevision === 'fiction-old-r1'), true);
  assert.match(state.userImpact, /failures before recovery remain counted/);
});

test('false or unknown rollback compatibility holds; no rollback resurrects a retired record', () => {
  for (const [fixture, expected, metric] of [
    ['rollback-incompatible', 'fail', 'interrupted'], ['rollback-unknown', 'unknown', 'unknown'],
  ]) {
    const before = canary(fixture);
    const held = lesson.execute(before, command('rollback'));
    assert.equal(held.phase, 'canary-measured');
    assert.equal(held.rollbackResult, expected);
    assert.equal(held.history.at(-1).result, 'held');
    assert.equal(held.metrics[metric], 1);
    assert.deepEqual(held.metrics, before.metrics);
    assert.deepEqual(held.observedWeights, [80, 20, 0]);
  }
  const retired = retirement();
  const held = lesson.execute(retired, command('rollback'));
  assert.equal(held.phase, 'retired');
  assert.equal(held.lifecycle.old, 'retired');
  assert.deepEqual(held.metrics, retired.metrics);
  assert.match(held.history.at(-1).summary, /retired DATA cannot/);
});

test('exact typed action tokens, shapes and types reject coercion, injection and inherited allowlist names', () => {
  const state = lesson.createState();
  const before = JSON.stringify(state);
  for (const invalid of [
    null, undefined, [], 'inspect', 1, { type: true }, {},
    { type: 'delete' }, { type: 'inspect', force: true },
    { type: 'prepare', fixture: 'healthy', token: 2 },
    { type: 'prepare', fixture: 'healthy', token: ' v2' },
    { type: 'prepare', fixture: 'healthy', token: 'v2 ' },
    { type: 'prepare', fixture: 'healthy', token: '<script>v2</script>' },
    { type: 'prepare', fixture: ['healthy'], token: 'v2' },
    { type: 'prepare', fixture: 'toString', token: 'v2' },
    { type: 'prepare', fixture: 'healthy', token: 'v2', revision: 'native' },
    { type: 'split', allocation: [80, 20, 0] },
    { type: 'split', allocation: '80/20/0 ' },
    { type: 'split', allocation: '__proto__' },
    Object.assign(Object.create(null), { type: 'inspect' }),
    Object.assign(Object.create({ injected: true }), { type: 'inspect' }),
  ]) {
    assert.throws(() => lesson.execute(state, invalid), { code: 'ERR_INPUT' });
    assert.equal(JSON.stringify(state), before);
  }
});

test('accessors, hidden keys, symbols, cycles and sparse arrays are rejected without evaluating getters', () => {
  let getterCalled = false;
  const getter = Object.defineProperty({}, 'type', { enumerable: true, get() { getterCalled = true; return 'inspect'; } });
  const hidden = Object.defineProperty({ type: 'inspect' }, 'force', { value: true });
  const symbol = { type: 'inspect', [Symbol('force')]: true };
  const cycle = { type: 'inspect' }; cycle.self = cycle;
  for (const command of [getter, hidden, symbol, cycle]) assert.throws(() => lesson.execute(lesson.createState(), command), { code: 'ERR_INPUT' });
  assert.equal(getterCalled, false);
  const state = clone(lesson.createState());
  state.history = Array(1);
  assert.throws(() => lesson.execute(state, command('inspect')), { code: 'ERR_STATE' });
});

test('derived phases, observations, histories and denominators must equal deterministic replay', () => {
  const original = promoted();
  const before = JSON.stringify(original);
  const corruptions = [
    (state) => { state.phase = 'retired'; },
    (state) => { state.lifecycle.old = 'retired'; },
    (state) => { state.metrics.successful = 100; },
    (state) => { state.metrics.attempted = '5'; },
    (state) => { state.observedWeights[0] = 1; },
    (state) => { state.lastData.journeys.observations[0].observedState = 'forged'; },
    (state) => { state.history[2].data.paths[5].observedStatus = 200; },
    (state) => { state.history[0].command.fixture = 'old-work'; },
    (state) => { state.history.shift(); },
    (state) => { state.schemaVersion = NaN; },
    (state) => { state.metrics.attempted = Infinity; },
    (state) => { state.extraField = true; },
  ];
  for (const change of corruptions) {
    const corrupted = clone(original);
    change(corrupted);
    assert.throws(() => lesson.execute(corrupted, command('audit-old')), { code: 'ERR_STATE' });
    assert.equal(JSON.stringify(original), before);
  }
  assert.deepEqual(lesson.execute(clone(original), command('audit-old')), lesson.execute(original, command('audit-old')));
});

test('twenty retained actions are bounded, never pruned; reset creates a fresh immutable rehearsal', () => {
  let state = lesson.createState();
  for (let index = 0; index < lesson.limit; index++) state = lesson.execute(state, command('retire'));
  const history = clone(state.history);
  assert.equal(state.history.length, 20);
  assert.equal(state.safeHolds, 20);
  assert.throws(() => lesson.execute(state, command('inspect')), { code: 'ERR_LIMIT' });
  assert.deepEqual(state.history, history);
  assert.equal(state.metrics.attempted, 0);
  assert.equal(Object.isFrozen(state.history[0].data.gates[0]), true);
  assert.equal(lesson.createState().history.length, 0);
});

test('every allowlisted fixture produces deterministic replayable state without global mutation', () => {
  for (const fixture of lesson.fixtureNames) {
    const first = eligible(fixture);
    const second = eligible(fixture);
    assert.deepEqual(first, second);
    assert.deepEqual(lesson.execute(clone(first), command('retire')), lesson.execute(second, command('retire')));
  }
});
