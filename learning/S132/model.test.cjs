'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const lesson = require('./model.js');
const copy = (data) => JSON.parse(JSON.stringify(data));
const start = (scenarioId = 'compatible', budgetMs = 2000) => ({ type: 'start', scenarioId, budgetMs });
const conduct = (scenarioId = 'compatible', budgetMs = 2000, initial = lesson.createState()) =>
  [start(scenarioId, budgetMs), { type: 'cutover' }, { type: 'callback' }, { type: 'finish' }]
    .reduce((state, action) => lesson.execute(state, action), initial);
const reject = (action, code) => assert.throws(action, (error) => error.code === code);

test('fixed fictional DATA, immutable snapshots and deterministic ordered actions', () => {
  assert.equal(Object.keys(lesson.SCENARIOS).length, 12);
  for (const [id, fixed] of Object.entries(lesson.SCENARIOS)) {
    assert.equal(fixed.trace.dataOnly, true);
    assert.equal(Object.isFrozen(fixed.trace.callback), true);
    const initial = lesson.createState();
    const before = copy(initial);
    let state = lesson.execute(initial, start(id));
    assert.deepEqual(initial, before);
    assert.equal(state.phase, 'started');
    assert.equal(state.active.trace.started.atMs, 0);
    assert.equal(state.active.trace.started.version, 'v1');
    assert.equal(state.active.budgetMs, 2000);
    assert.equal(state.active.trace.callback, null);
    assert.equal(state.active.result, null);
    state = lesson.execute(state, { type: 'cutover' });
    assert.equal(state.phase, 'cutover');
    assert.equal(state.active.trace.cutover.atMs, 500);
    assert.equal(state.active.result, null);
    state = lesson.execute(state, { type: 'callback' });
    assert.equal(state.phase, 'callback');
    assert.equal(state.active.trace.completion, null);
    assert.equal(state.active.result, null, 'callback status is not end-to-end sign-in evidence');
    state = lesson.execute(state, { type: 'finish' });
    assert.equal(state.phase, 'measured');
    assert.equal(state.history.length, 4);
    assert.equal(state.runs.length, 1);
    assert.equal(Object.isFrozen(state.runs[0].result.checks), true);
    assert.deepEqual(state, conduct(id));
    assert.deepEqual(state.active.trace, fixed.trace);
  }
});

test('the complete original journey is positive with intended identity, valid state and legitimate session rotation', () => {
  const state = conduct();
  const { trace, result } = state.active;
  assert.equal(result.classification, 'positive');
  assert.equal(result.continuousSignIn, true);
  assert.equal(result.elapsedMs, 1800);
  assert.equal(result.budgetMs, 2000);
  assert.equal(result.checks.length, 15);
  assert.equal(result.checks.every((check) => check.status === 'positive'), true);
  assert.deepEqual(result.failedChecks, []);
  assert.deepEqual(result.unknownChecks, []);
  assert.notEqual(trace.started.pendingSessionId, trace.callback.issuedSession);
  assert.equal(trace.completion.sessionId, trace.callback.issuedSession);
  assert.equal(trace.completion.identity, trace.started.expectedIdentity);
  assert.equal(trace.completion.page, trace.started.returnPage);
  assert.match(result.claim, /One fixed fictional original journey/);
  assert.match(result.claim, /not a live sign-in/);
});

for (const [preset, check] of [
  ['lost-state', 'callback-state'], ['state-mismatch', 'callback-state'],
  ['wrong-identity', 'intended-identity'], ['session-mismatch', 'signed-in-session'],
  ['forced-restart', 'no-forced-restart'], ['slow-200', 'original-journey-budget'],
  ['incompatible-state-version', 'state-version-contract'], ['wrong-route', 'callback-route'],
  ['wrong-page', 'signed-in-page'],
]) {
  test(`HTTP 200 cannot conceal ${preset}; detect ${check}`, () => {
    const { trace, result } = conduct(preset).active;
    assert.equal(trace.callback.httpStatus, 200);
    assert.equal(trace.completion.version, 'v2');
    assert.equal(result.classification, 'negative');
    assert.equal(result.continuousSignIn, false);
    assert.equal(result.failedChecks.includes(check), true);
    assert.match(result.claim, /continuity failed/);
    if (preset === 'wrong-identity') assert.equal(trace.callback.identity, trace.completion.identity);
    if (preset === 'forced-restart') {
      assert.equal(trace.completion.signedIn, true);
      assert.notEqual(trace.completion.journeyId, trace.started.journeyId);
      assert.equal(result.elapsedMs, 1800);
    }
  });
}

test('original time origin, pinned budgets and inclusive boundaries are preserved', () => {
  assert.equal(conduct('compatible', 1800).active.result.classification, 'positive');
  assert.equal(conduct('compatible', 1799).active.result.classification, 'negative');
  const slow = conduct('slow-200', 2000).active;
  assert.equal(slow.trace.callback.atMs, 1400);
  assert.equal(slow.trace.cutover.atMs, 500);
  assert.equal(slow.result.elapsedMs, 4200);
  assert.equal(slow.result.classification, 'negative');
  assert.equal(conduct('slow-200', 4200).active.result.classification, 'positive');
  assert.equal(conduct('slow-200', 4199).active.result.classification, 'negative');
});

test('unknown observations remain unknown even with a signed-in v2 page', () => {
  for (const id of ['callback-unobserved', 'timing-unobserved']) {
    const { trace, result } = conduct(id).active;
    assert.equal(trace.completion.signedIn, true);
    assert.equal(trace.completion.version, 'v2');
    assert.equal(result.classification, 'unknown');
    assert.equal(result.continuousSignIn, false);
    assert.equal(result.unknownChecks.length > 0, true);
    assert.deepEqual(result.failedChecks, []);
  }
  const timing = conduct('timing-unobserved').active;
  assert.equal(timing.trace.callback.httpStatus, 200);
  assert.equal(timing.result.elapsedMs, null);
  assert.equal(timing.result.unknownChecks.includes('original-journey-budget'), true);
  const partial = copy(lesson.SCENARIOS['callback-unobserved'].trace);
  partial.completion.identity = 'fictional-person-elm';
  const measured = lesson.measureJourney(partial, 2000);
  assert.equal(measured.classification, 'negative');
  assert.equal(measured.unknownChecks.includes('callback-state'), true);
  assert.equal(measured.failedChecks.includes('intended-identity'), true);
});

test('known wrong chronology cannot be certified away by a within-budget completion', () => {
  const beforeCutover = copy(lesson.SCENARIOS.compatible.trace);
  beforeCutover.callback.atMs = 400;
  assert.equal(lesson.measureJourney(beforeCutover, 2000).failedChecks.includes('transition-order'), true);
  const beforeCallback = copy(lesson.SCENARIOS.compatible.trace);
  beforeCallback.completion.atMs = 1200;
  assert.equal(lesson.measureJourney(beforeCallback, 2000).failedChecks.includes('transition-order'), true);
});

test('exact command types, keys, preset allowlist and integer budgets reject coercion without mutation', () => {
  const state = lesson.createState();
  const before = copy(state);
  for (const invalid of ['2000', true, null, NaN, Infinity, 2000.5, 999, 5001, -1, 2000n, new Number(2000)]) {
    reject(() => lesson.execute(state, start('compatible', invalid)), 'ERR_INPUT');
    assert.deepEqual(state, before);
  }
  for (const invalid of [
    null, 'start', [], { type: true }, { type: 'START' }, { type: 'constructor' },
    { ...start(), extra: false }, start('constructor'), start('__proto__'), start(' compatible'),
    start(['compatible']), { type: 'callback', budgetMs: 5000 },
    Object.assign(Object.create({ type: 'start' }), { scenarioId: 'compatible', budgetMs: 2000 }),
  ]) {
    reject(() => lesson.execute(state, invalid), 'ERR_INPUT');
    assert.deepEqual(state, before);
  }
});

test('trace DATA is exact, finite, typed and descriptor-safe, not user identity input', () => {
  for (const change of [
    (data) => { data.dataOnly = 'true'; },
    (data) => { data.callback.httpStatus = '200'; },
    (data) => { data.callback.acceptsV1State = 'true'; },
    (data) => { data.completion.forcedRestart = 'false'; },
    (data) => { data.completion.identity = 'actual-user-input'; },
    (data) => { data.callback.callbackState = {}; },
    (data) => { data.callback.atMs = NaN; },
    (data) => { data.completion.atMs = '1800'; },
    (data) => { data.started.atMs = 500; },
    (data) => { data.cutover.toVersion = 'v3'; },
    (data) => { data.callback.extra = true; },
    (data) => { delete data.completion.sessionId; },
  ]) {
    const data = copy(lesson.SCENARIOS.compatible.trace);
    change(data);
    reject(() => lesson.measureJourney(data, 2000), 'ERR_INPUT');
  }
  let invoked = 0;
  const accessor = copy(lesson.SCENARIOS.compatible.trace);
  Object.defineProperty(accessor.callback, 'identity', { get() { invoked++; return 'fictional-person-river'; } });
  reject(() => lesson.measureJourney(accessor, 2000), 'ERR_INPUT');
  const input = { type: 'start', scenarioId: 'compatible' };
  Object.defineProperty(input, 'budgetMs', { get() { invoked++; return 2000; } });
  reject(() => lesson.execute(lesson.createState(), input), 'ERR_INPUT');
  assert.equal(invoked, 0);
});

test('out-of-order commands leave original state and retained actions intact', () => {
  for (const state of [lesson.createState(), lesson.execute(lesson.createState(), start())]) {
    const before = copy(state);
    for (const type of state.phase === 'idle' ? ['cutover', 'callback', 'finish'] : ['callback', 'finish', 'start']) {
      reject(() => lesson.execute(state, type === 'start' ? start('lost-state', 5000) : { type }), 'ERR_STATE');
      assert.deepEqual(state, before);
    }
  }
  const callback = [start(), { type: 'cutover' }, { type: 'callback' }].reduce((state, action) => lesson.execute(state, action), lesson.createState());
  reject(() => lesson.execute(callback, { type: 'callback' }), 'ERR_STATE');
  assert.equal(callback.active.result, null);
});

test('state snapshots must match deterministic replay of retained typed history', () => {
  const measured = conduct();
  for (const corrupt of [
    (data) => { data.phase = 'idle'; },
    (data) => { data.schemaVersion = '1'; },
    (data) => { data.active.budgetMs = 5000; },
    (data) => { data.active.trace.callback.callbackState = 'fictional-state-other'; },
    (data) => { data.active.result.classification = 'unknown'; },
    (data) => { data.runs[0].result.checks[0].status = 'negative'; },
    (data) => { data.history.shift(); },
    (data) => { data.history[1].type = 'finish'; },
    (data) => { data.history[0].budgetMs = '2000'; },
    (data) => { data.runs = []; },
    (data) => { data.history.extra = true; },
    (data) => { delete data.history[1]; },
    (data) => { data[Symbol('hidden')] = true; },
    (data) => { data.active = data; },
  ]) {
    const forged = copy(measured);
    corrupt(forged);
    reject(() => lesson.execute(forged, start()), 'ERR_STATE');
  }
  let invoked = 0;
  const forged = copy(measured);
  Object.defineProperty(forged, 'history', { get() { invoked++; return []; } });
  reject(() => lesson.execute(forged, start()), 'ERR_STATE');
  assert.equal(invoked, 0);
  assert.equal(lesson.execute(copy(measured), start()).phase, 'started');
});

test('four complete comparisons retain all positive, negative and unknown history without pruning', () => {
  let state = lesson.createState();
  const ids = ['lost-state', 'callback-unobserved', 'compatible', 'forced-restart'];
  for (const id of ids) state = conduct(id, 2000, state);
  assert.equal(state.history.length, 16);
  assert.equal(state.runs.length, 4);
  assert.deepEqual(state.runs.map((run) => run.scenarioId), ids);
  assert.deepEqual(state.runs.map((run) => run.result.classification), ['negative', 'unknown', 'positive', 'negative']);
  const before = copy(state);
  reject(() => lesson.execute(state, start()), 'ERR_LIMIT');
  assert.deepEqual(state, before);
  assert.equal(lesson.createState().history.length, 0, 'explicit reset is a new empty local snapshot');
});
