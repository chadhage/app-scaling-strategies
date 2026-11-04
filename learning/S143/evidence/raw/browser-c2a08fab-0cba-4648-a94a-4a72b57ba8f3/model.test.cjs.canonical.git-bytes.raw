'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const action = (state, type) => model.execute(state, { type });
const start = (presetId = 'within-budget', state = model.createState()) => model.execute(state, { type: 'start', presetId });
function conduct(presetId, state = model.createState(), through = 'measure') {
  let current = start(presetId, state);
  for (const type of ['slow', 'reconnect', 'observe', 'measure']) {
    current = action(current, type);
    if (type === through) break;
  }
  return current;
}
function rejected(state, command, code) {
  let caught;
  assert.throws(() => model.execute(state, command), (error) => {
    caught = error;
    return error instanceof model.LessonError && error.code === code;
  });
  return caught;
}
const expected = {
  'within-budget': ['PASS', 2900, 2900, 700, 100],
  'exact-deadline': ['PASS', 3000, 3000, 800, 0],
  'one-ms-over': ['FAIL', 3001, 3001, 801, -1],
  'per-attempt-reset': ['FAIL', 3700, 3700, 1500, -700],
  'missing-final-time': ['UNKNOWN', null, 2200, null, 800],
  'missing-completion': ['UNKNOWN', null, 3000, 800, 0],
  'late-unknown': ['FAIL', null, 3201, null, -201],
  'reconnect-failed': ['FAIL', null, 2200, null, 800],
  'incorrect-200': ['FAIL', 2900, 2900, 700, 100],
  'unsupported-condition': ['FAIL', 2900, 2900, 700, 100],
};

test('starting a supplied slow-client trace retains the original journey', () => {
  const state = model.execute(model.createState(), { type: 'start', presetId: 'within-budget' });
  assert.equal(state.phase, 'started');
  assert.deepEqual(state.current.original, {
    journeyId: 'journey-amber', clientId: 'client-amber', initialVersion: 'fixture-v1',
    startMs: 1000, budgetMs: 3000, deadlineMs: 4000,
  });
});

for (const [presetId, [verdict, elapsed, known, finalAttempt, remaining]] of Object.entries(expected)) {
  test(`${presetId}: exact original ${verdict}, cumulative DATA and retained interrupted attempt`, () => {
    const state = conduct(presetId);
    const view = model.inspect(state);
    assert.equal(state.phase, 'measured');
    assert.equal(view.verdict, verdict);
    assert.equal(view.verifier, 'MATCH');
    assert.equal(view.measured, true);
    assert.equal(view.cumulative.elapsedMs, elapsed);
    assert.equal(view.cumulative.knownElapsedMs, known);
    assert.equal(state.current.knownElapsedMs, known);
    assert.equal(view.cumulative.finalAttemptMs, finalAttempt);
    assert.equal(view.cumulative.remainingAtKnownObservationMs, remaining);
    assert.equal(view.cumulative.remainingAtCompletionMs, elapsed === null ? null : 3000 - elapsed);
    assert.equal(view.cumulative.completedAtMs, elapsed === null ? null : 1000 + elapsed);
    assert.equal(view.cumulative.perAttemptWithinBudget, finalAttempt === null ? null : true);
    assert.deepEqual(view.original, model.ORIGINAL);
    assert.equal(state.current.attempts.length, presetId === 'reconnect-failed' ? 1 : 2);
    assert.deepEqual(state.current.interruptions, [{
      attemptId: 'attempt-1', atMs: 2500, kind: 'connection-interrupted', retained: true,
    }]);
    assert.equal(state.current.attempts[0].clientWaitMs, 800);
    assert.equal(state.current.attempts[0].serviceMs, 700);
    assert.equal(state.current.attempts[0].completed, false);
    assert.equal(state.current.attempts[0].completedAtMs, null);
    assert.equal(state.current.recovery.toVersion, 'fixture-v2');
    assert.equal(view.nativeResult, 'unverified');
    assert.equal(state.outcomes[0].nativeResult, 'unverified');
    assert.deepEqual(state.outcomes[0].trace, state.current);
    assert.equal(view.impact, verdict === 'PASS' ? 'recovered-after-interruption' : verdict === 'FAIL' ? 'interrupted' : 'unknown-after-interruption');
    assert.equal(view.checks.length, 6);
    assert.deepEqual(view.checks.map((check) => check.id), [
      'supported-condition', 'connection-recovery', 'original-deadline', 'final-response', 'final-completion', 'correct-result',
    ]);
  });
}

test('explicit original output shapes and each phase keep the same start/deadline/budget', () => {
  let state = start();
  assert.deepEqual(Object.keys(state), [
    'schemaVersion', 'phase', 'runCount', 'current', 'journal', 'history', 'outcomes', 'rejections',
  ]);
  assert.deepEqual(Object.keys(state.current), [
    'run', 'presetId', 'original', 'profile', 'attempts', 'recovery', 'final', 'knownElapsedMs', 'interruptions', 'verdict', 'records',
  ]);
  for (const type of ['slow', 'reconnect', 'observe', 'measure']) {
    state = action(state, type);
    assert.deepEqual(state.current.original, {
      journeyId: 'journey-amber', clientId: 'client-amber', initialVersion: 'fixture-v1',
      startMs: 1000, budgetMs: 3000, deadlineMs: 4000,
    });
    assert.ok(state.history.every((record) => record.originalStartMs === 1000
      && record.originalDeadlineMs === 4000 && record.budgetMs === 3000));
  }
  assert.deepEqual(Object.keys(model.inspect(state).cumulative), [
    'clientWaitKnownMs', 'serviceKnownMs', 'backoffKnownMs', 'reconnectKnownMs',
    'knownElapsedMs', 'completedAtMs', 'elapsedMs', 'remainingAtKnownObservationMs',
    'remainingAtCompletionMs', 'finalAttemptMs', 'perAttemptWithinBudget', 'unknownFinalTiming',
  ]);
});

test('all component sums, both attempts and timeline observations are visible; no per-attempt deadline reset', () => {
  const view = model.inspect(conduct('one-ms-over'));
  assert.deepEqual(view.cumulative, {
    clientWaitKnownMs: 1000, serviceKnownMs: 1301, backoffKnownMs: 400, reconnectKnownMs: 300,
    knownElapsedMs: 3001, completedAtMs: 4001, elapsedMs: 3001,
    remainingAtKnownObservationMs: -1, remainingAtCompletionMs: -1,
    finalAttemptMs: 801, perAttemptWithinBudget: true, unknownFinalTiming: false,
  });
  assert.deepEqual(view.trace.records.map((record) => record.atMs), [1000, 2500, 3200, 4001]);
  assert.deepEqual(view.trace.attempts.map((attempt) => [attempt.version, attempt.startedAtMs]), [
    ['fixture-v1', 1000], ['fixture-v2', 3200],
  ]);
  assert.equal(view.trace.final.httpStatus, 200);
  assert.equal(view.checks.find((check) => check.id === 'original-deadline').result, 'FAIL');
});

test('good-looking observations cannot certify PASS or archive PASS before Measure', () => {
  let state = start();
  for (const type of ['slow', 'reconnect', 'observe']) {
    state = action(state, type);
    assert.equal(model.inspect(state).verdict, 'UNKNOWN');
    assert.equal(model.inspect(state).measured, false);
    assert.equal(state.outcomes.length, 0);
  }
  assert.ok(model.inspect(state).checks.every((check) => check.result === 'PASS'));
  const archived = action(state, 'reset');
  assert.equal(archived.outcomes[0].verdict, 'UNKNOWN');
  assert.equal(archived.outcomes[0].reason, 'reset-before-measure');
  assert.equal(archived.outcomes[0].cumulative.elapsedMs, 2900);
  assert.equal(archived.outcomes[0].trace.verdict, null);
});

test('missing final time retains supplied completion/HTTP DATA without guessing elapsed or zero waits', () => {
  const view = model.inspect(conduct('missing-final-time'));
  assert.equal(view.trace.final.completed, true);
  assert.equal(view.trace.final.httpStatus, 200);
  for (const key of ['clientWaitMs', 'serviceMs', 'observedAtMs', 'completedAtMs']) assert.equal(view.trace.final[key], null);
  assert.equal(view.cumulative.elapsedMs, null);
  assert.equal(view.cumulative.knownElapsedMs, 2200);
  assert.equal(view.cumulative.unknownFinalTiming, true);
  assert.equal(view.checks.find((check) => check.id === 'original-deadline').result, 'UNKNOWN');
  assert.equal(view.verdict, 'UNKNOWN');
});

test('a final observation at the exact deadline is not a final completion timestamp', () => {
  const view = model.inspect(conduct('missing-completion'));
  assert.equal(view.trace.final.observedAtMs, 4000);
  assert.equal(view.trace.final.completed, null);
  assert.equal(view.trace.final.correct, null);
  assert.equal(view.trace.final.completedAtMs, null);
  assert.equal(view.cumulative.elapsedMs, null);
  assert.equal(view.cumulative.remainingAtCompletionMs, null);
  assert.equal(view.cumulative.knownElapsedMs, 3000);
  assert.equal(view.checks.find((check) => check.id === 'final-response').result, 'PASS');
  assert.equal(view.checks.find((check) => check.id === 'original-deadline').result, 'UNKNOWN');
  assert.equal(view.verdict, 'UNKNOWN');
});

test('known cumulative overrun defeats unobserved final timing and remains after recovered version/HTTP 200', () => {
  let state = conduct('late-unknown', model.createState(), 'reconnect');
  let view = model.inspect(state);
  assert.equal(view.verdict, 'FAIL');
  assert.equal(view.measured, false);
  assert.equal(view.cumulative.knownElapsedMs, 3201);
  assert.equal(view.cumulative.remainingAtKnownObservationMs, -201);
  assert.equal(view.trace.recovery.succeeded, true);
  state = action(action(state, 'observe'), 'measure');
  view = model.inspect(state);
  assert.equal(view.trace.final.httpStatus, 200);
  assert.equal(view.trace.final.version, 'fixture-v2');
  assert.equal(view.trace.final.completed, null);
  assert.equal(view.trace.final.completedAtMs, null);
  assert.equal(view.cumulative.elapsedMs, null);
  assert.equal(view.checks.find((check) => check.id === 'original-deadline').result, 'FAIL');
  assert.equal(view.verdict, 'FAIL');
});

test('a known budget failure archives FAIL even when reset occurs before final observation', () => {
  const state = action(conduct('late-unknown', model.createState(), 'reconnect'), 'reset');
  assert.equal(state.outcomes[0].verdict, 'FAIL');
  assert.equal(state.outcomes[0].cumulative.elapsedMs, null);
  assert.equal(state.outcomes[0].trace.recovery.backoffMs, 1101);
  assert.equal(state.outcomes[0].trace.recovery.reconnectMs, 600);
  assert.equal(state.outcomes[0].trace.interruptions.length, 1);
});

test('later positive recovery and repeated resets retain earlier negative/unknown trace bytes and original interruption', () => {
  let state = action(conduct('one-ms-over'), 'reset');
  const first = JSON.stringify(state.outcomes[0]);
  state = action(conduct('missing-final-time', state), 'reset');
  state = action(conduct('within-budget', state), 'reset');
  state = action(state, 'reset');
  assert.deepEqual(state.outcomes.map((outcome) => outcome.verdict), ['FAIL', 'UNKNOWN', 'PASS']);
  assert.equal(JSON.stringify(state.outcomes[0]), first);
  assert.ok(state.outcomes.every((outcome) => outcome.trace.interruptions[0].retained === true));
  assert.equal(state.outcomes[0].cumulative.knownElapsedMs, 3001);
  assert.equal(state.outcomes[2].impact, 'recovered-after-interruption');
  assert.equal(state.current, null);
});

test('unknown, wrong, coerced and extra-field commands produce typed sanitized errors without accepting data', () => {
  const invalid = [
    undefined, null, false, 143, 'start', [], { type: 'start' }, { type: true },
    { type: 'start', presetId: true }, { type: 'start', presetId: 143 },
    { type: 'start', presetId: '__proto__' }, { type: 'start', presetId: 'unknown-<script>' },
    { type: 'start', presetId: 'within-budget', deadlineMs: 4700 },
    { type: 'reset', extra: true }, { type: 'reset-original-budget' },
    Object.create({ type: 'reset' }), { type: 'reset', [Symbol('hidden')]: true },
    { type: 'start', presetId: new String('within-budget') },
    { type: 'reset', extra: 1n }, () => 'reset',
  ];
  for (const command of invalid) {
    const prior = model.createState();
    const error = rejected(prior, command, 'ERR_COMMAND');
    assert.equal(error.state.history.length, 0);
    assert.equal(error.state.runCount, 0);
    assert.deepEqual(error.state.rejections, [{ sequence: 1, action: 'invalid-action', code: 'ERR_COMMAND' }]);
    assert.deepEqual(error.state.journal, [{ command: { type: 'invalid-command' }, error: 'ERR_COMMAND' }]);
    assert.equal(JSON.stringify(error.state).includes('unknown-<script>'), false);
    assert.deepEqual(prior, model.createState());
    assert.doesNotThrow(() => model.inspect(error.state));
  }
});

test('command and state accessors are rejected without invoking them; sparse, cyclic and exotic DATA is not trusted', () => {
  let invoked = 0;
  const command = { get type() { invoked++; return 'reset'; } };
  rejected(model.createState(), command, 'ERR_COMMAND');
  const state = clone(model.createState());
  Object.defineProperty(state, 'phase', { enumerable: true, get() { invoked++; return 'idle'; } });
  assert.throws(() => model.inspect(state), { code: 'ERR_STATE' });
  assert.equal(invoked, 0);
  const sparse = clone(model.createState());
  sparse.journal = new Array(1);
  const extra = clone(model.createState());
  extra.journal.extra = 'not-an-entry';
  const cycle = clone(model.createState());
  cycle.current = cycle;
  const symbol = clone(model.createState());
  symbol[Symbol('extra')] = true;
  const huge = clone(model.createState());
  huge.journal = Array.from({ length: 85 }, () => ({ command: { type: 'reset' }, error: null }));
  for (const value of [null, [], new Date(0), Object.create(model.createState()), sparse, extra, cycle, symbol, huge]) {
    assert.throws(() => model.inspect(value), { code: 'ERR_STATE' });
  }
});

for (const [name, change] of [
  ['original-start', (state) => { state.current.original.startMs = 3200; }],
  ['original-deadline', (state) => { state.current.original.deadlineMs = 6200; }],
  ['original-budget', (state) => { state.current.original.budgetMs = 6000; }],
  ['client-identity', (state) => { state.current.original.clientId = 'replacement-client'; }],
  ['final-version', (state) => { state.current.final.version = 'fixture-v3'; }],
  ['attempt-wait', (state) => { state.current.attempts[0].clientWaitMs = 0; }],
  ['hidden-attempt', (state) => { state.current.attempts.shift(); }],
  ['reconnect-backoff', (state) => { state.current.recovery.backoffMs = 0; }],
  ['final-time', (state) => { state.current.final.completedAtMs = 4000; }],
  ['cumulative-wait', (state) => { state.current.knownElapsedMs = 801; }],
  ['final-verdict', (state) => { state.current.verdict = 'PASS'; }],
  ['erased-interruption', (state) => { state.current.interruptions = []; }],
  ['hidden-timeline', (state) => { state.current.records = []; }],
  ['history-deadline', (state) => { state.history[0].originalDeadlineMs = 6200; }],
  ['archived-result', (state) => { state.outcomes[0].verdict = 'PASS'; }],
  ['archived-budget', (state) => { state.outcomes[0].cumulative.elapsedMs = 801; }],
  ['journal-removed', (state) => { state.journal.pop(); }],
  ['journal-extra-input', (state) => { state.journal[0].command.clockMs = 0; }],
  ['forged-rejection', (state) => { state.rejections.push({ sequence: 1, action: 'reset', code: 'ERR_PHASE' }); }],
]) {
  test(`replay rejects forged ${name} without accepting the modified result`, () => {
    const prior = conduct('one-ms-over');
    const forged = clone(prior);
    change(forged);
    const error = rejected(forged, { type: 'reset' }, 'ERR_STATE');
    assert.equal(error.state, undefined);
    assert.throws(() => model.inspect(forged), { code: 'ERR_STATE' });
    assert.equal(prior.current.verdict, 'FAIL');
    assert.equal(prior.current.original.deadlineMs, 4000);
  });
}

test('correct-result and missing final completion cannot be forged to pass in a replay-consistent journal', () => {
  for (const presetId of ['incorrect-200', 'missing-completion', 'missing-final-time', 'late-unknown']) {
    const forged = clone(conduct(presetId));
    forged.current.final.correct = true;
    forged.current.final.completed = true;
    forged.current.final.completedAtMs = 4000;
    assert.throws(() => model.inspect(forged), { code: 'ERR_STATE' });
  }
});

test('strict action order, repeat actions and new-start attempts cannot reset an active original journey', () => {
  let state = model.createState();
  for (const type of ['slow', 'reconnect', 'observe', 'measure']) {
    const error = rejected(state, { type }, 'ERR_PHASE');
    assert.equal(error.state.phase, 'idle');
  }
  state = start();
  const original = JSON.stringify(state.current.original);
  for (const command of [
    { type: 'start', presetId: 'exact-deadline' }, { type: 'observe' }, { type: 'measure' },
  ]) state = rejected(state, command, 'ERR_PHASE').state;
  assert.equal(JSON.stringify(state.current.original), original);
  assert.equal(state.runCount, 1);
  state = action(state, 'slow');
  state = rejected(state, { type: 'slow' }, 'ERR_PHASE').state;
  assert.equal(state.current.attempts.length, 1);
  assert.equal(state.current.knownElapsedMs, 1500);
  assert.equal(state.history.length, 2);
  assert.equal(state.rejections.length, 4);
});

test('first twelve sanitized rejections are retained and overflow cannot erase them or mutate accepted state', () => {
  let state = model.createState();
  for (let index = 0; index < 12; index++) state = rejected(state, { type: 'arbitrary-<script>' }, 'ERR_COMMAND').state;
  const retained = JSON.stringify(state);
  for (let index = 0; index < 5; index++) {
    const error = rejected(state, { type: 'measure' }, 'ERR_PHASE');
    assert.match(error.message, /Rejected history bound reached/);
    state = error.state;
    assert.equal(JSON.stringify(state), retained);
  }
  assert.equal(state.rejections.length, 12);
  assert.equal(state.journal.length, 12);
  assert.equal(state.history.length, 0);
  assert.equal(JSON.stringify(state).includes('arbitrary-<script>'), false);
  assert.deepEqual(action(state, 'reset'), state);
  assert.doesNotThrow(() => model.inspect(state));
});

test('twelve complete original journeys use exactly seventy-two accepted actions; rejected saturation and reset retain all', () => {
  let state = model.createState();
  for (let index = 0; index < 12; index++) state = rejected(state, { type: 'measure' }, 'ERR_PHASE').state;
  for (let index = 0; index < 12; index++) state = action(conduct('within-budget', state), 'reset');
  assert.equal(state.runCount, 12);
  assert.equal(state.history.length, 72);
  assert.equal(state.outcomes.length, 12);
  assert.equal(state.rejections.length, 12);
  assert.equal(state.journal.length, 84);
  assert.deepEqual(model.inspect(state).allowedActions, ['reset']);
  const exhausted = rejected(state, { type: 'start', presetId: 'within-budget' }, 'ERR_LIMIT').state;
  assert.deepEqual(exhausted, state);
  assert.deepEqual(action(state, 'reset'), state);
  assert.doesNotThrow(() => model.inspect(state));
});

test('early resets consume runs honestly; a new fictional attempt cannot bypass run bounds', () => {
  let state = model.createState();
  for (let index = 0; index < 12; index++) state = action(start('within-budget', state), 'reset');
  assert.equal(state.outcomes.length, 12);
  assert.ok(state.outcomes.every((outcome) => outcome.verdict === 'UNKNOWN'));
  assert.equal(state.history.length, 24);
  rejected(state, { type: 'start', presetId: 'within-budget' }, 'ERR_LIMIT');
});

test('immutable returned DATA and canonical replay are deterministic and independent of property order', () => {
  const state = conduct('within-budget');
  const view = model.inspect(state);
  for (const value of [state, state.current, state.current.original, state.outcomes[0].trace, view, view.cumulative, model.PRESETS]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { state.current.original.deadlineMs = 4700; }, TypeError);
  assert.throws(() => { model.PRESETS['within-budget'].final.serviceMs = 0; }, TypeError);
  const reordered = Object.fromEntries(Object.entries(clone(state)).reverse());
  assert.deepEqual(model.inspect(reordered), view);
  assert.deepEqual(conduct('within-budget'), state);
  assert.deepEqual(Object.keys(expected), Object.keys(model.PRESETS));
});
