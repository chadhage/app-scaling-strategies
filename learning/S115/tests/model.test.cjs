'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const model = require(path.join('..', 'model.js'));

const input = (fixtureId = 'warm-ready', budgetMs = 6000) => ({ fixtureId, budgetMs });
const measured = (fixtureId, budgetMs) => model.inspect(model.createState(), input(fixtureId, budgetMs));
const completed = (fixtureId, budgetMs) => model.rehearse(measured(fixtureId, budgetMs));
const check = (measurement, key) => measurement.checks.find((value) => value.key === key);
const errorCode = (code) => (error) => error instanceof model.LessonError && error.code === code;

test('shallow 200 cannot certify required dependency readiness', () => {
  const state = model.inspect(model.createState(), {
    fixtureId: 'dependency-denied', budgetMs: 6000,
  });
  assert.equal(state.current.readiness, 'failure',
    'a shallow healthy endpoint is not complete standby readiness');
});

  test('one original SC-S115 lesson exposes eight immutable fictional fixtures', () => {
    assert.equal(model.BANNER, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(model.FIXTURES.length, 8);
    assert.equal(new Set(model.FIXTURES.map((value) => value.id)).size, 8);
    assert.deepEqual(model.BUDGETS, [6000, 24000]);
    assert.equal(model.MAX_CHECKS, 10);
    for (const fixture of model.FIXTURES) {
      assert.match(fixture.activeRegion, /fictional active/);
      assert.match(fixture.passiveRegion, /fictional passive/);
      assert.equal(fixture.shallowStatus, 200);
      assert.ok(Object.isFrozen(fixture.initial));
      assert.ok(Object.isFrozen(fixture.recoveryPhases));
    }
  });

  test('an idle session supplies no readiness or client evidence', () => {
    const state = model.createState();
    assert.equal(state.phase, 'idle');
    assert.equal(state.current, null);
    assert.deepEqual(model.totals(state), {
      checks: 0, success: 0, failure: 0, unknown: 0,
      clientAttempts: 0, clientSuccess: 0, clientFailure: 0, clientUnknown: 0,
    });
  });

  test('warm readiness measures all five required dimensions rather than a shallow status', () => {
    const state = measured('warm-ready', 6000);
    assert.equal(state.current.readiness, 'success');
    assert.equal(state.current.shallowHealth, 'success');
    assert.deepEqual(state.current.initial.checks.map((value) => value.key),
      ['compute', 'cache', 'dependency', 'authentication', 'state']);
    assert.ok(state.current.initial.checks.every((value) => value.verdict === 'success'));
    assert.deepEqual(check(state.current.initial, 'compute').measured,
      { readyInstances: 2, requiredInstances: 2, capacityUnits: 12, demandUnits: 10 });
    assert.deepEqual(check(state.current.initial, 'cache').measured,
      { canaryHit: true, payloadRevision: 7, latencyMs: 8 });
    assert.deepEqual(check(state.current.initial, 'state').measured,
      { profileRevision: 7, sessionRevision: 3, committedEffectCount: 1 });
    assert.equal(state.current.recovery, null);
    assert.equal(state.current.clientOutcome, 'unknown');
    assert.equal(state.history.length, 0);
  });

  test('warm recovery records original budgets, destination, session, state and one effect', () => {
    const state = completed('warm-ready', 6000);
    const current = state.current;
    assert.equal(state.phase, 'complete');
    assert.equal(current.outcome, 'success');
    assert.equal(current.recovery.measuredMs, 4000);
    assert.equal(current.recovery.eligible, true);
    assert.deepEqual(current.recovery.phases.map((phase) => phase.durationMs), [0, 0, 2000, 2000]);
    assert.deepEqual(current.journeys.map((journey) => journey.elapsedMs), [4100, 4150]);
    for (const journey of current.journeys) {
      assert.equal(journey.budgetMs, 6000);
      assert.equal(journey.verdict, 'success');
      assert.match(journey.destination, /Region Birch \(fictional passive\)/);
      assert.equal(journey.sessionAccepted, true);
      assert.equal(journey.profileRevision, 7);
      assert.equal(journey.sessionRevision, 3);
    }
    assert.equal(current.journeys[1].effectCount, 1);
    assert.equal(state.history[0], current);
  });

  test('cold standby is not ready initially even with a healthy shallow 200', () => {
    const state = measured('cold-ready', 6000);
    assert.equal(state.current.shallowStatus, 200);
    assert.equal(state.current.readiness, 'failure');
    assert.equal(check(state.current.initial, 'compute').measured.capacityUnits, 0);
    assert.equal(check(state.current.initial, 'cache').verdict, 'failure');
    assert.equal(check(state.current.initial, 'dependency').verdict, 'success');
    assert.deepEqual(state.current.comparison.map((value) => value.recovery.measuredMs), [4000, 20000]);
    assert.deepEqual(state.current.comparison.map((value) => value.clientOutcome), ['success', 'failure']);
  });

  test('cold eventual completion under six seconds retains both client interruptions', () => {
    const state = completed('cold-ready', 6000);
    assert.equal(state.current.recovered.readiness, 'success');
    assert.equal(state.current.readiness, 'failure');
    assert.equal(state.current.recovery.measuredMs, 20000);
    assert.deepEqual(state.current.recovery.phases.map((phase) => phase.durationMs), [4000, 12000, 2000, 2000]);
    assert.equal(state.current.recovery.verdict, 'failure');
    assert.deepEqual(state.current.journeys.map((journey) => journey.elapsedMs), [20100, 20150]);
    assert.ok(state.current.journeys.every((journey) => journey.verdict === 'failure'));
    assert.deepEqual(model.totals(state), {
      checks: 1, success: 0, failure: 1, unknown: 0,
      clientAttempts: 2, clientSuccess: 0, clientFailure: 2, clientUnknown: 0,
    });
  });

  test('cold client recovery can meet a larger budget without repairing initial readiness', () => {
    const state = completed('cold-ready', 24000);
    assert.equal(state.current.clientOutcome, 'success');
    assert.equal(state.current.recovery.verdict, 'success');
    assert.equal(state.current.readiness, 'failure');
    assert.equal(state.current.outcome, 'failure');
    assert.ok(state.current.journeys.every((journey) => journey.budgetMs === 24000));
  });

  for (const [fixtureId, key] of [
    ['compute-short', 'compute'], ['cache-incompatible', 'cache'],
    ['dependency-denied', 'dependency'], ['auth-denied', 'authentication'], ['state-behind', 'state'],
  ]) {
    test(`${fixtureId}: independent required ${key} failure blocks alternate admission`, () => {
      const state = completed(fixtureId, 24000);
      assert.equal(state.current.shallowHealth, 'success');
      assert.equal(check(state.current.initial, key).verdict, 'failure');
      assert.equal(check(state.current.recovered, key).verdict, 'failure');
      assert.equal(state.current.readiness, 'failure');
      assert.equal(state.current.recovery.eligible, false);
      assert.equal(state.current.recovery.measuredMs, null);
      assert.equal(state.current.recovery.templateTotalMs, 4000);
      assert.equal(state.current.outcome, 'failure');
      assert.ok(state.current.journeys.every((journey) =>
        journey.verdict === 'failure' && journey.destination === null && journey.elapsedMs === null));
    });
  }

  test('a known dependency denial stays failure when its latency is missing', () => {
    const state = measured('dependency-denied', 6000);
    const dependency = check(state.current.initial, 'dependency');
    assert.equal(dependency.measured.access, false);
    assert.equal(dependency.measured.latencyMs, null);
    assert.equal(dependency.verdict, 'failure');
  });

  test('missing full-path evidence stays unknown and cannot borrow warm reference success', () => {
    const state = completed('unobserved', 6000);
    assert.equal(state.current.shallowHealth, 'success');
    assert.ok(state.current.initial.checks.every((value) => value.verdict === 'unknown'));
    assert.equal(state.current.readiness, 'unknown');
    assert.equal(state.current.recovery.eligible, null);
    assert.equal(state.current.recovery.measuredMs, null);
    assert.equal(state.current.recovery.templateTotalMs, null);
    assert.equal(state.current.outcome, 'unknown');
    assert.ok(state.current.journeys.every((journey) => journey.verdict === 'unknown' && journey.destination === null));
    assert.equal(state.current.comparison[0].outcome, 'success');
    assert.equal(model.totals(state).clientUnknown, 2);
  });

  test('reset retains earlier failed budgets and client outcomes alongside later success', () => {
    let state = completed('cold-ready', 6000);
    const original = state.current;
    state = model.reset(state);
    state = model.inspect(state, input('cold-ready', 24000));
    state = model.rehearse(state);
    assert.equal(state.history[0], original);
    assert.equal(state.history[0].budgetMs, 6000);
    assert.equal(state.history[0].clientOutcome, 'failure');
    assert.equal(state.history[1].budgetMs, 24000);
    assert.equal(state.history[1].clientOutcome, 'success');
    assert.deepEqual(model.totals(state), {
      checks: 2, success: 0, failure: 2, unknown: 0,
      clientAttempts: 4, clientSuccess: 2, clientFailure: 2, clientUnknown: 0,
    });
  });

  test('reset after measurement preserves an unknown unfinished check without inventing client attempts', () => {
    const state = model.reset(measured('warm-ready', 6000));
    assert.equal(state.phase, 'idle');
    assert.equal(state.current, null);
    assert.equal(state.history[0].status, 'reset-before-recovery');
    assert.equal(state.history[0].outcome, 'unknown');
    assert.equal(state.history[0].readiness, 'success');
    assert.equal(state.history[0].clientOutcome, 'not-attempted');
    assert.deepEqual(state.history[0].journeys, []);
    assert.equal(model.totals(state).clientAttempts, 0);
    assert.equal(model.totals(state).unknown, 1);
  });

  test('ten-check bounded history cannot be renewed by reset', () => {
    let state = model.createState();
    for (let index = 0; index < model.MAX_CHECKS; index++) {
      state = model.inspect(state, input());
      state = model.rehearse(state);
      state = model.reset(state);
    }
    assert.equal(state.history.length, 10);
    assert.deepEqual(state.history.map((record) => record.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(model.totals(state).clientAttempts, 20);
    assert.throws(() => model.inspect(state, input()), errorCode('ERR_LIMIT'));
    state = model.reset(state);
    assert.equal(state.history.length, 10);
    assert.throws(() => model.inspect(state, input()), errorCode('ERR_LIMIT'));
  });

  test('unfinished resets also consume the unchanged ten-check allowance', () => {
    let state = model.createState();
    for (let index = 0; index < model.MAX_CHECKS; index++) {
      state = model.reset(model.inspect(state, input()));
    }
    assert.equal(model.totals(state).unknown, 10);
    assert.equal(model.totals(state).clientAttempts, 0);
    assert.throws(() => model.inspect(state, input()), errorCode('ERR_LIMIT'));
  });

  test('primitives and non-plain input records are rejected without advancing state', () => {
    const state = model.createState();
    for (const value of [null, undefined, true, 0, 'warm-ready', [], () => {}, new Date(), new Map(), Object.create(null)]) {
      assert.throws(() => model.inspect(state, value), errorCode('ERR_INPUT'));
    }
    assert.equal(state.phase, 'idle');
    assert.equal(model.totals(state).checks, 0);
    assert.equal(model.inspect(state, input()).phase, 'measured');
  });

  test('missing, extra, inherited, symbol and accessor input fields are rejected', () => {
    const state = model.createState();
    let getterCalls = 0;
    const accessor = { budgetMs: 6000, get fixtureId() { getterCalls++; return 'warm-ready'; } };
    for (const value of [
      {}, { fixtureId: 'warm-ready' }, { budgetMs: 6000 },
      { ...input(), region: 'live-target' }, { ...input(), [Symbol('extra')]: true },
      Object.create(input()), accessor,
    ]) {
      assert.throws(() => model.inspect(state, value), errorCode('ERR_INPUT'));
    }
    assert.equal(getterCalls, 0);
    assert.equal(state.current, null);
  });

  test('fixture IDs cannot be coerced, trimmed or replaced by arbitrary identifiers', () => {
    const state = model.createState();
    for (const fixtureId of [undefined, null, true, 1, {}, ['warm-ready'], 'warm-ready ', 'WARM-READY', '', '__proto__']) {
      assert.throws(() => model.inspect(state, { fixtureId, budgetMs: 6000 }), errorCode('ERR_INPUT'));
    }
  });

  test('budgets reject coercion, non-finite, fractional and out-of-enum numbers', () => {
    const state = model.createState();
    for (const budgetMs of [
      undefined, null, false, '6000', '24000', 6000n, NaN, Infinity, -Infinity,
      0, -1, 4000, 6000.1, 24000.01, 1e6, {}, [6000],
    ]) {
      assert.throws(() => model.inspect(state, { fixtureId: 'warm-ready', budgetMs }), errorCode('ERR_INPUT'));
    }
  });

  test('forged and serialized state is rejected by every state API', () => {
    const original = model.createState();
    for (const value of [null, undefined, false, {}, { ...original }, JSON.parse(JSON.stringify(original))]) {
      assert.throws(() => model.inspect(value, input()), errorCode('ERR_STATE'));
      assert.throws(() => model.rehearse(value), errorCode('ERR_STATE'));
      assert.throws(() => model.reset(value), errorCode('ERR_STATE'));
      assert.throws(() => model.totals(value), errorCode('ERR_STATE'));
    }
  });

  test('stale issued states cannot fork, rewind or replay a successful transition', () => {
    const idle = model.createState();
    const inspected = model.inspect(idle, input());
    assert.throws(() => model.inspect(idle, input()), errorCode('ERR_STATE'));
    assert.throws(() => model.reset(idle), errorCode('ERR_STATE'));
    const finished = model.rehearse(inspected);
    assert.throws(() => model.rehearse(inspected), errorCode('ERR_STATE'));
    const reset = model.reset(finished);
    assert.throws(() => model.reset(finished), errorCode('ERR_STATE'));
    assert.equal(reset.history.length, 1);
  });

  test('premature or duplicate operator actions preserve the current issued state', () => {
    const idle = model.createState();
    assert.throws(() => model.rehearse(idle), errorCode('ERR_PHASE'));
    const inspected = model.inspect(idle, input());
    assert.throws(() => model.inspect(inspected, input('cold-ready', 24000)), errorCode('ERR_PHASE'));
    assert.equal(inspected.current.budgetMs, 6000);
    const finished = model.rehearse(inspected);
    assert.throws(() => model.rehearse(finished), errorCode('ERR_PHASE'));
    assert.throws(() => model.inspect(finished, input()), errorCode('ERR_PHASE'));
    assert.equal(model.totals(finished).checks, 1);
  });

  test('states, measurements, fixture signals and retained records are deeply immutable', () => {
    const state = completed('warm-ready', 6000);
    assert.throws(() => { state.current.budgetMs = 24000; }, TypeError);
    assert.throws(() => { state.current.initial.checks[0].measured.capacityUnits = 100; }, TypeError);
    assert.throws(() => { state.history.push(state.current); }, TypeError);
    assert.throws(() => { model.FIXTURES[0].initial.authentication.sessionAccepted = false; }, TypeError);
    assert.equal(state.current.budgetMs, 6000);
    assert.equal(model.FIXTURES[0].initial.authentication.sessionAccepted, true);
  });

  test('check and client totals conserve success, failure and unknown attribution', () => {
    let state = model.createState();
    for (const fixtureId of ['warm-ready', 'cold-ready', 'unobserved', 'auth-denied']) {
      state = model.reset(model.rehearse(model.inspect(state, input(fixtureId))));
    }
    const counts = model.totals(state);
    assert.equal(counts.checks, counts.success + counts.failure + counts.unknown);
    assert.equal(counts.clientAttempts, counts.clientSuccess + counts.clientFailure + counts.clientUnknown);
    assert.equal(counts.clientAttempts, 8);
    assert.equal(counts.clientFailure, 4);
    assert.equal(counts.clientUnknown, 2);
  });
