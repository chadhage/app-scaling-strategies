'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const lesson = require(path.join(__dirname, '..', 'model.js'));

function act(state, type, fields = {}) {
  return lesson.transition(state, { type, epoch: state.epoch, revision: state.revision, ...fields });
}

function inspected(id) {
  let state = act(lesson.initialState(), 'conduct', { fixtureId: id });
  state = act(state, 'inspect', { runId: 'run-1' });
  return state;
}

const failureCases = [
  ['empty-success', 'nonempty-response'],
  ['silent-logout', 'authentication'],
  ['lost-state', 'preserved-state'],
  ['duplicate-effect', 'exactly-one-effect'],
  ['broken-ui', 'usable-compatible-ui'],
];

test('empty-success client failure cannot pass through HTTP 200', () => {
  const report = lesson.evaluateFixture('empty-success');
  assert.equal(report.clientVerdict, 'CLIENT-SIDE FAILURE');
  assert.equal(report.originalImpact.interrupted, 1);
});

test('all five injected source acceptance failures are detected', () => {
  for (const id of ['empty-success', 'silent-logout', 'lost-state', 'duplicate-effect', 'broken-ui']) {
    const fixture = lesson.fixtures.find((item) => item.id === id);
    assert.ok(fixture.journeys.every((journey) => journey.attempts.every(
      (attempt) => attempt.server.httpStatus === 200 && attempt.server.ready === true,
    )));
    assert.equal(lesson.evaluateFixture(id).clientVerdict, 'CLIENT-SIDE FAILURE', id);
  }
});

test('missing client observations remain unknown instead of health-only success', () => {
  const report = lesson.evaluateFixture('missing-observation');
  assert.equal(report.clientVerdict, 'UNKNOWN');
  assert.deepEqual(report.assertionSummary, { denominator: 5, pass: 0, fail: 0, unknown: 5 });
});

test('each supplied observed failure has its exact failed client assertion, separate conformance and impact', () => {
  for (const [id, requirement] of failureCases) {
    const report = lesson.evaluateFixture(id);
    assert.deepEqual(report.assertionSummary, { denominator: 5, pass: 4, fail: 1, unknown: 0 });
    assert.equal(report.assertions.find((item) => item.requirement === requirement).verdict, 'FAIL', id);
    assert.equal(report.detectedAcceptanceFailure, true);
    assert.equal(report.expectedNegativeConformance.applies, true);
    assert.equal(report.expectedNegativeConformance.verdict, 'PASS');
    assert.deepEqual(report.originalImpact, {
      denominator: 1, completed: 0, interrupted: 1, unknown: 0, laterRecoveryObserved: 0,
    });
    assert.deepEqual(report.transportSummary, {
      denominator: 1, http200: 1, ready: 1, reportedRequestsPerSecond: [240],
    });
  }
});

test('positive control proves ten exact client assertions across two original journeys', () => {
  const report = lesson.evaluateFixture('positive-control');
  assert.equal(report.clientVerdict, 'CLIENT-SIDE CORRECT');
  assert.deepEqual(report.assertionSummary, { denominator: 10, pass: 10, fail: 0, unknown: 0 });
  assert.deepEqual(report.originalImpact, {
    denominator: 2, completed: 2, interrupted: 0, unknown: 0, laterRecoveryObserved: 0,
  });
  assert.equal(report.detectedAcceptanceFailure, false);
  assert.equal(report.expectedNegativeConformance.verdict, 'NOT-APPLICABLE');
  assert.ok(report.journeys.every((journey) => journey.originalExactlyOneEffectObserved === true));
});

test('unknown observations are absent, not null-valued observations of an actual failure', () => {
  const report = lesson.evaluateFixture('missing-observation');
  assert.deepEqual(report.originalImpact, {
    denominator: 1, completed: 0, interrupted: 0, unknown: 1, laterRecoveryObserved: 0,
  });
  assert.ok(report.assertions.every((item) => item.verdict === 'UNKNOWN' && item.observed.available === false));
  assert.equal(report.journeys[0].originalExactlyOneEffectObserved, null);
  assert.equal(report.detectedAcceptanceFailure, false);
  assert.equal(report.expectedNegativeConformance.verdict, 'NOT-APPLICABLE');
  const logout = lesson.evaluateFixture('silent-logout');
  const auth = logout.assertions.find((item) => item.requirement === 'authentication');
  assert.equal(auth.observed.available, true);
  assert.equal(auth.observed.identity, null);
  assert.equal(auth.verdict, 'FAIL');
});

test('later correct observations retain original interruption and original unknown with separate denominators', () => {
  const report = lesson.evaluateFixture('later-recovery');
  assert.equal(report.clientVerdict, 'CLIENT-SIDE FAILURE');
  assert.deepEqual(report.assertionSummary, { denominator: 20, pass: 14, fail: 1, unknown: 5 });
  assert.deepEqual(report.originalImpact, {
    denominator: 2, completed: 0, interrupted: 1, unknown: 1, laterRecoveryObserved: 2,
  });
  assert.deepEqual(report.transportSummary, {
    denominator: 4, http200: 4, ready: 4, reportedRequestsPerSecond: [240, 240, 240, 240],
  });
  assert.deepEqual(report.journeys.map((journey) => journey.originalOutcome), ['interrupted', 'unknown']);
  assert.deepEqual(report.journeys.map((journey) => journey.laterRecoveryObserved), [true, true]);
  assert.deepEqual(report.journeys.map((journey) => journey.attempts[1].observationOutcome), ['completed', 'completed']);
  assert.equal(report.journeys[1].originalExactlyOneEffectObserved, null);
});

test('assertion/report/impact shapes are exact and all denominators reconcile without retry inflation', () => {
  const reportKeys = [
    'schema', 'fixtureId', 'fixtureKind', 'clientVerdict', 'detectedAcceptanceFailure',
    'expectedNegativeConformance', 'assertionSummary', 'transportSummary', 'originalImpact', 'journeys', 'assertions',
  ].sort();
  for (const fixture of lesson.fixtures) {
    const report = lesson.evaluateFixture(fixture.id);
    assert.deepEqual(Object.keys(report).sort(), reportKeys);
    const attempts = fixture.journeys.flatMap((journey) => journey.attempts);
    assert.equal(report.assertionSummary.denominator, attempts.length * 5);
    assert.equal(report.assertionSummary.pass + report.assertionSummary.fail + report.assertionSummary.unknown, report.assertionSummary.denominator);
    assert.equal(report.originalImpact.denominator, fixture.journeys.length);
    assert.equal(report.originalImpact.completed + report.originalImpact.interrupted + report.originalImpact.unknown, report.originalImpact.denominator);
    assert.equal(report.transportSummary.denominator, attempts.length);
    assert.equal(new Set(report.assertions.map((item) => item.assertionId)).size, report.assertions.length);
    for (const assertion of report.assertions) {
      assert.deepEqual(Object.keys(assertion).sort(), [
        'assertionId', 'journeyId', 'attemptId', 'requirement', 'verdict', 'expected', 'observed', 'explanation',
      ].sort());
      assert.equal(typeof assertion.observed.available, 'boolean');
      assert.ok(['PASS', 'FAIL', 'UNKNOWN'].includes(assertion.verdict));
    }
  }
});

test('identity, keyed effect and client/API/state versions are actually asserted, not decorative trace labels', () => {
  const positive = lesson.evaluateFixture('positive-control');
  const auth = positive.assertions.find((item) => item.requirement === 'authentication');
  assert.deepEqual(Object.keys(auth.expected).sort(), ['identity', 'session', 'signedIn']);
  const state = lesson.evaluateFixture('lost-state').assertions.find((item) => item.requirement === 'preserved-state');
  assert.equal(state.expected.version, 7);
  assert.equal(state.observed.version, 6);
  assert.deepEqual(state.observed.items, []);
  const effect = lesson.evaluateFixture('duplicate-effect').assertions.find((item) => item.requirement === 'exactly-one-effect');
  assert.equal(effect.expected.count, 1);
  assert.equal(effect.observed.count, 2);
  assert.equal(effect.expected.key, effect.observed.key);
  assert.equal(effect.expected.identity, effect.observed.identity);
  const ui = lesson.evaluateFixture('broken-ui').assertions.find((item) => item.requirement === 'usable-compatible-ui');
  assert.equal(ui.expected.clientVersion, ui.observed.clientVersion);
  assert.notEqual(ui.expected.apiVersion, ui.observed.apiVersion);
  assert.notEqual(ui.expected.view, ui.observed.view);
});

test('fixtures and every report are frozen deterministic fictional data', () => {
  for (const fixture of lesson.fixtures) {
    assert.deepEqual(lesson.evaluateFixture(fixture.id), lesson.evaluateFixture(fixture.id));
    assert.ok(Object.isFrozen(fixture.journeys[0].attempts[0].observations));
    assert.throws(() => { fixture.journeys[0].attempts[0].server.httpStatus = 500; }, TypeError);
    const report = lesson.evaluateFixture(fixture.id);
    assert.throws(() => { report.originalImpact.completed = 99; }, TypeError);
    assert.throws(() => { report.assertions[0].verdict = 'PASS'; }, TypeError);
  }
  for (const id of [null, 1, true, {}, ' empty-success', 'Empty-Success', 'missing', ['empty-success']]) {
    assert.throws(() => lesson.evaluateFixture(id), { code: 'ERR_FIXTURE' });
  }
});

test('wrong learner FAIL and later learner PASS are both retained without changing the duplicate effect', () => {
  let state = inspected('duplicate-effect');
  const originalReport = JSON.stringify(state.runs[0].report);
  state = act(state, 'check', { runId: 'run-1', verdict: 'CLIENT-SIDE CORRECT' });
  state = act(state, 'check', { runId: 'run-1', verdict: 'CLIENT-SIDE FAILURE' });
  const run = state.runs[0];
  assert.deepEqual(run.checks.map((check) => check.verifierVerdict), ['FAIL', 'PASS']);
  assert.deepEqual(run.checks.map((check) => check.expectedVerdict), ['CLIENT-SIDE FAILURE', 'CLIENT-SIDE FAILURE']);
  assert.ok(run.checks.every((check) => check.originalImpact.interrupted === 1 && check.originalImpact.completed === 0));
  assert.equal(JSON.stringify(run.report), originalReport);
  assert.equal(run.report.assertions.find((item) => item.requirement === 'exactly-one-effect').observed.count, 2);
});

test('exact typed command fields reject unknown values, coercions, symbols, getters and prototypes without consuming state', () => {
  const state = lesson.initialState();
  const valid = { type: 'conduct', epoch: 0, revision: 0, fixtureId: 'empty-success' };
  const invalid = [
    null, [], 'conduct', new Date(),
    { ...valid, revision: '0' }, { ...valid, epoch: false }, { ...valid, revision: 0.5 },
    { ...valid, revision: NaN }, { ...valid, revision: Infinity },
    { ...valid, extra: true }, { type: 'conduct', epoch: 0, fixtureId: 'empty-success' },
    { ...valid, type: 'delete' }, { ...valid, type: true },
    Object.assign(Object.create({ trusted: true }), valid),
    { ...valid, [Symbol('extra')]: true },
  ];
  for (const command of invalid) assert.throws(() => lesson.transition(state, command), { code: 'ERR_COMMAND' });
  let getterRead = false;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'fixtureId', { enumerable: true, get() { getterRead = true; return 'empty-success'; } });
  assert.throws(() => lesson.transition(state, accessor), { code: 'ERR_COMMAND' });
  assert.equal(getterRead, false);
  assert.equal(lesson.transition(state, valid).runs[0].fixtureId, 'empty-success');
});

test('phase and run guards prevent uninspected checks, cross-run commands and silent trace replacement', () => {
  let state = lesson.initialState();
  assert.throws(() => act(state, 'inspect', { runId: 'run-1' }), { code: 'ERR_RUN' });
  state = act(state, 'conduct', { fixtureId: 'empty-success' });
  assert.throws(() => act(state, 'conduct', { fixtureId: 'positive-control' }), { code: 'ERR_PHASE' });
  assert.throws(() => act(state, 'check', { runId: 'run-1', verdict: 'CLIENT-SIDE FAILURE' }), { code: 'ERR_PHASE' });
  assert.throws(() => act(state, 'inspect', { runId: 'run-2' }), { code: 'ERR_RUN' });
  state = act(state, 'inspect', { runId: 'run-1' });
  assert.throws(() => act(state, 'inspect', { runId: 'run-1' }), { code: 'ERR_PHASE' });
  for (const verdict of ['', null, true, 1, ['UNKNOWN'], 'PASS', 'CLIENT-SIDE FAILURE ']) {
    assert.throws(() => act(state, 'check', { runId: 'run-1', verdict }), { code: 'ERR_VERDICT' });
  }
  state = act(state, 'check', { runId: 'run-1', verdict: 'CLIENT-SIDE FAILURE' });
  state = act(state, 'conduct', { fixtureId: 'positive-control' });
  assert.throws(() => act(state, 'inspect', { runId: 'run-1' }), { code: 'ERR_RUN' });
  assert.equal(state.runs[0].report.clientVerdict, 'CLIENT-SIDE FAILURE');
  assert.equal(state.runs[1].fixtureId, 'positive-control');
});

test('stale commands, spent state handles and commands from the prior reset epoch cannot be replayed', () => {
  const first = lesson.initialState();
  const command = { type: 'conduct', epoch: 0, revision: 0, fixtureId: 'empty-success' };
  const next = lesson.transition(first, command);
  assert.throws(() => lesson.transition(next, command), { code: 'ERR_REPLAY' });
  assert.throws(() => lesson.transition(first, command), { code: 'ERR_STATE_HANDLE' });
  const reset = lesson.reset(next);
  assert.equal(reset.epoch, 1);
  assert.equal(reset.revision, 0);
  assert.throws(() => lesson.transition(reset, command), { code: 'ERR_REPLAY' });
  assert.throws(() => lesson.reset(next), { code: 'ERR_STATE_HANDLE' });
  assert.equal(act(reset, 'conduct', { fixtureId: 'positive-control' }).runs.length, 1);
});

test('reports and claimed outcomes must exactly replay their journal; display snapshots are not advanceable handles', () => {
  const state = inspected('missing-observation');
  const altered = structuredClone(state);
  altered.runs[0].report.originalImpact.unknown = 0;
  altered.runs[0].report.originalImpact.completed = 1;
  assert.throws(() => act(altered, 'check', { runId: 'run-1', verdict: 'CLIENT-SIDE CORRECT' }), { code: 'ERR_STATE_REPLAY' });
  const reordered = structuredClone(state);
  reordered.journal.reverse();
  assert.throws(() => act(reordered, 'check', { runId: 'run-1', verdict: 'UNKNOWN' }), { code: 'ERR_STATE_REPLAY' });
  assert.throws(() => act(structuredClone(state), 'check', { runId: 'run-1', verdict: 'UNKNOWN' }), { code: 'ERR_STATE_HANDLE' });
  const forgedChecks = structuredClone(state);
  forgedChecks.runs[0].checks.push({ verifierVerdict: 'PASS' });
  assert.throws(() => act(forgedChecks, 'check', { runId: 'run-1', verdict: 'UNKNOWN' }), { code: 'ERR_STATE_REPLAY' });
  assert.equal(act(state, 'check', { runId: 'run-1', verdict: 'UNKNOWN' }).runs[0].checks[0].verifierVerdict, 'PASS');
});

test('state validation rejects non-data structures without running accessors or accepting malformed arrays', () => {
  const state = lesson.initialState();
  const command = { type: 'conduct', epoch: 0, revision: 0, fixtureId: 'empty-success' };
  let read = false;
  const accessor = { schema: lesson.VERSION, epoch: 0, revision: 0, journal: [] };
  Object.defineProperty(accessor, 'runs', { enumerable: true, get() { read = true; return []; } });
  assert.throws(() => lesson.transition(accessor, command), { code: 'ERR_STATE' });
  assert.equal(read, false);
  const sparse = structuredClone(state);
  sparse.journal.length = 1;
  assert.throws(() => lesson.transition(sparse, command), { code: 'ERR_STATE' });
  const cycle = structuredClone(state);
  cycle.runs.push(cycle);
  assert.throws(() => lesson.transition(cycle, command), { code: 'ERR_STATE' });
  const symbol = { ...state, [Symbol('hidden')]: true };
  assert.throws(() => lesson.transition(symbol, command), { code: 'ERR_STATE' });
  const fakeSchema = { ...state, schema: 'S147/lesson-v2' };
  assert.throws(() => lesson.transition(fakeSchema, command), { code: 'ERR_STATE' });
  assert.equal(lesson.transition(state, command).revision, 1);
});

test('eight runs and forty commands retain every wrong/right check, fail closed at limits and reset only rehearsal state', () => {
  let state = lesson.initialState();
  for (let index = 0; index < lesson.MAX_RUNS; index += 1) {
    state = act(state, 'conduct', { fixtureId: 'later-recovery' });
    const runId = `run-${index + 1}`;
    state = act(state, 'inspect', { runId });
    for (const verdict of ['CLIENT-SIDE CORRECT', 'UNKNOWN', 'CLIENT-SIDE FAILURE']) {
      state = act(state, 'check', { runId, verdict });
    }
  }
  assert.equal(state.revision, 40);
  assert.equal(state.journal.length, lesson.MAX_COMMANDS);
  assert.equal(state.runs.length, 8);
  const before = JSON.stringify(state);
  assert.throws(() => act(state, 'conduct', { fixtureId: 'positive-control' }), { code: 'ERR_LIMIT' });
  assert.throws(() => act(state, 'check', { runId: 'run-8', verdict: 'CLIENT-SIDE FAILURE' }), { code: 'ERR_LIMIT' });
  assert.equal(JSON.stringify(state), before);
  assert.ok(state.runs.every((run) => run.checks.length === 3 && run.report.originalImpact.unknown === 1));
  assert.ok(state.runs.every((run) => run.report.originalImpact.interrupted === 1 && run.report.originalImpact.laterRecoveryObserved === 2));
  const reset = lesson.reset(state);
  assert.deepEqual(reset, { schema: lesson.VERSION, epoch: 1, revision: 0, journal: [], runs: [] });
  assert.equal(state.runs.length, 8);
});
