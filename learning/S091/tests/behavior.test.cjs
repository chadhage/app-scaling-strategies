'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BANNER, LIMIT, BUDGET_MS, FIXTURES, CONCLUSIONS, createSession, runLesson, resetSession, summarize } = require('../model.js');

test('the resource-free lesson API loads and starts with a frozen empty history', () => {
  const session = createSession();
  assert.equal(session.schemaVersion, 1);
  assert.deepEqual(session.history, []);
  assert.ok(Object.isFrozen(session));
  assert.ok(Object.isFrozen(session.history));
});

test('warming crash is visibly aborted before exposure, without migration credit', () => {
  const next = runLesson(createSession(), { fixture: 'guarded-crash', conclusion: 'safe-abort' });
  assert.equal(next.history.length, 1, 'A warming crash must record one observable teaching attempt.');
  const result = next.history[0];
  assert.equal(result.outcome, 'safe-abort');
  assert.equal(result.acceptance, 'pass');
  assert.equal(result.conclusionCheck, 'pass');
  assert.equal(result.peakCandidateExposure, 0);
  assert.equal(result.transitionJourneys.length, 0);
  assert.equal(result.completedMigration, false);
  assert.equal(result.productionJourneys.filter((journey) => journey.outcome === 'success').length, 3);
  assert.deepEqual(result.trace.map((event) => event.candidateState), ['WARMING', 'CRASHED', 'CRASHED', 'ABORTED']);
});

const replay = (fixture, conclusion) => runLesson(createSession(), { fixture, conclusion });
const code = (expected) => (error) => error instanceof TypeError && error.code === expected;
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test('a safe abort cannot become completed migration because the learner says so', () => {
  const session = replay('guarded-crash', 'completed-migration');
  const result = session.history[0];
  assert.equal(result.outcome, 'safe-abort');
  assert.equal(result.acceptance, 'pass');
  assert.equal(result.conclusionCheck, 'fail');
  assert.match(result.conclusionReason, /not completed-migration/);
  assert.deepEqual(summarize(session).transitions, { attempted: 0, successes: 0, interruptions: 0, unknown: 0, successRate: null });
  assert.equal(summarize(session).safeAborts, 1);
  assert.equal(summarize(session).completedMigrations, 0);
});

test('unsafe exposure fails acceptance and retains interruptions after synthetic recovery', () => {
  const session = replay('forced-exposure', 'interrupted-transition');
  const result = session.history[0];
  assert.equal(result.acceptance, 'fail');
  assert.equal(result.conclusionCheck, 'pass');
  assert.equal(result.peakCandidateExposure, 3);
  assert.equal(result.abortStatus, 'recovery-after-exposure');
  assert.deepEqual(result.effectiveRouting, { observed: true, oldPercent: 100, candidatePercent: 0 });
  assert.ok(result.transitionJourneys.every((journey) => journey.started && journey.outcome === 'failure' && journey.httpStatus === 503));
  assert.deepEqual(summarize(session).transitions, { attempted: 3, successes: 0, interruptions: 3, unknown: 0, successRate: 0 });
  assert.equal(result.completedMigration, false);
});

test('a visible abort still fails when an old production journey exceeds its original budget', () => {
  const session = replay('production-regression', 'interrupted-transition');
  const result = session.history[0];
  assert.equal(result.abortStatus, 'acknowledged-before-exposure');
  assert.equal(result.peakCandidateExposure, 0);
  assert.equal(result.outcome, 'interrupted-transition');
  assert.equal(result.acceptance, 'fail');
  assert.equal(result.productionJourneys[0].httpStatus, 200);
  assert.equal(result.productionJourneys[0].latencyMs, 400);
  assert.equal(result.productionJourneys[0].outcome, 'failure');
  assert.deepEqual(summarize(session).production, { successes: 2, interruptions: 1, unknown: 0 });
  assert.equal(summarize(session).transitions.attempted, 0, 'Old-only production journeys do not manufacture migration trials.');
});

test('missing evidence leaves started transitions unknown and keeps them in the denominator', () => {
  const session = replay('missing-evidence', 'unknown');
  const result = session.history[0];
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.acceptance, 'unknown');
  assert.equal(result.conclusionCheck, 'pass');
  assert.equal(result.abortStatus, 'unverified');
  assert.equal(result.peakCandidateExposure, null);
  assert.deepEqual(result.effectiveRouting, { observed: false, oldPercent: null, candidatePercent: null });
  assert.ok(result.productionJourneys.every((journey) => journey.outcome === 'unknown' && journey.version === null));
  assert.ok(result.transitionJourneys.every((journey) => journey.started && journey.outcome === 'unknown' && journey.httpStatus === null));
  assert.deepEqual(summarize(session).transitions, { attempted: 3, successes: 0, interruptions: 0, unknown: 3, successRate: 0 });
  assert.equal(replay('missing-evidence', 'completed-migration').history[0].conclusionCheck, 'fail');
});

test('only the healthy comparison observes actual candidate-version success after all fixed gates', () => {
  const session = replay('healthy-migration', 'completed-migration');
  const result = session.history[0];
  assert.equal(result.outcome, 'completed-migration');
  assert.equal(result.acceptance, 'pass');
  assert.equal(result.conclusionCheck, 'pass');
  assert.equal(result.completedMigration, true);
  assert.equal(result.readiness.readyInstances, result.readiness.requiredInstances);
  for (const key of ['dependencies', 'configuration', 'authentication', 'compatibleState', 'journeysWithinBudget']) {
    assert.equal(result.readiness[key], true);
  }
  assert.deepEqual(result.trace.map((item) => item.candidateState), ['WARMING', 'READY', 'ACTIVE', 'ACTIVE']);
  assert.equal(result.trace[1].candidatePercent, 0);
  assert.deepEqual(result.effectiveRouting, { observed: true, oldPercent: 0, candidatePercent: 100 });
  assert.match(result.retention.old, /retained-standby; not retired/);
  assert.ok(result.transitionJourneys.every((journey) => journey.version === 'candidate-v2' && journey.deploymentEpoch === 2 && journey.outcome === 'success'));
  assert.deepEqual(summarize(session).transitions, { attempted: 3, successes: 3, interruptions: 0, unknown: 0, successRate: 1 });
});

test('all known successful journeys meet latency, session, state and effect assertions', () => {
  assert.equal(BUDGET_MS, 250);
  for (const fixture of FIXTURES) {
    const result = replay(fixture, 'unknown').history[0];
    for (const journey of [...result.productionJourneys, ...result.transitionJourneys]) {
      if (journey.outcome === 'success') {
        assert.equal(journey.httpStatus, 200);
        assert.ok(journey.latencyMs <= BUDGET_MS);
        assert.equal(journey.sessionPreserved, true);
        assert.equal(journey.statePreserved, true);
        assert.equal(journey.businessEffects, 1);
      }
      if (journey.outcome === 'unknown') {
        for (const key of ['version', 'deploymentEpoch', 'httpStatus', 'latencyMs', 'sessionPreserved', 'statePreserved', 'businessEffects']) {
          assert.equal(journey[key], null);
        }
      }
    }
  }
});

test('six independent replays retain all outcomes, failed predictions and unknown started journeys', () => {
  let session = createSession();
  const inputs = [
    ['guarded-crash', 'safe-abort'], ['guarded-crash', 'completed-migration'],
    ['forced-exposure', 'interrupted-transition'], ['production-regression', 'interrupted-transition'],
    ['missing-evidence', 'unknown'], ['healthy-migration', 'completed-migration'],
  ];
  for (const [fixture, conclusion] of inputs) session = runLesson(session, { fixture, conclusion });
  assert.deepEqual(summarize(session), {
    attempts: 6, safeAborts: 2, completedMigrations: 1, interruptedRuns: 2, unknownRuns: 1,
    production: { successes: 14, interruptions: 1, unknown: 3 },
    transitions: { attempted: 9, successes: 3, interruptions: 3, unknown: 3, successRate: 1 / 3 },
  });
  assert.deepEqual(session.history.map((item) => item.attempt), [1, 2, 3, 4, 5, 6]);
  assert.equal(session.history[1].conclusionCheck, 'fail');
  assert.equal(session.history[2].transitionJourneys.filter((item) => item.outcome === 'failure').length, 3);
  assert.equal(session.history[4].transitionJourneys.filter((item) => item.outcome === 'unknown').length, 3);
});

test('seventh attempts are rejected without trimming or mutating the retained ledger', () => {
  let session = createSession();
  for (let index = 0; index < LIMIT; index += 1) session = runLesson(session, { fixture: 'guarded-crash', conclusion: 'safe-abort' });
  const before = JSON.stringify(session);
  assert.throws(() => runLesson(session, { fixture: 'healthy-migration', conclusion: 'completed-migration' }), code('ERR_LESSON_LIMIT'));
  assert.equal(JSON.stringify(session), before);
  assert.equal(session.history.length, 6);
});

test('input guards reject unsupported types, extra keys, coercion, URLs and non-enumerated values', () => {
  const session = createSession();
  for (const invalid of [undefined, null, [], 'guarded-crash', 1, true, {}, { fixture: 'guarded-crash' },
    { fixture: 'guarded-crash', conclusion: 'safe-abort', extra: true },
    { fixture: ' guarded-crash', conclusion: 'safe-abort' }, { fixture: 'http://127.0.0.1', conclusion: 'safe-abort' },
    { fixture: 1, conclusion: 'safe-abort' }, { fixture: {}, conclusion: 'safe-abort' },
    { fixture: 'guarded-crash', conclusion: 'pass' }, { fixture: 'guarded-crash', conclusion: null },
    Object.create({ fixture: 'guarded-crash', conclusion: 'safe-abort' }),
    { fixture: 'guarded-crash', conclusion: 'safe-abort', [Symbol('extra')]: true }]) {
    assert.throws(() => runLesson(session, invalid), code('ERR_LESSON_INPUT'));
  }
  assert.deepEqual(session.history, []);
});

test('input and history accessors are rejected without invoking their code', () => {
  let reads = 0;
  const input = { conclusion: 'safe-abort' };
  Object.defineProperty(input, 'fixture', { enumerable: true, get() { reads += 1; return 'guarded-crash'; } });
  assert.throws(() => runLesson(createSession(), input), code('ERR_LESSON_INPUT'));
  const state = { schemaVersion: 1 };
  Object.defineProperty(state, 'history', { enumerable: true, get() { reads += 1; return []; } });
  assert.throws(() => runLesson(state, { fixture: 'guarded-crash', conclusion: 'safe-abort' }), code('ERR_LESSON_STATE'));
  assert.equal(reads, 0);
});

test('state guards reject mutable, oversized, sparse, foreign and unsupported snapshots', () => {
  const input = { fixture: 'guarded-crash', conclusion: 'safe-abort' };
  for (const state of [undefined, null, [], {}, { schemaVersion: 1, history: [] },
    freeze({ schemaVersion: 2, history: [] }), freeze({ schemaVersion: 1, history: [], extra: true }),
    freeze({ schemaVersion: 1, history: new Array(1) }),
    freeze({ schemaVersion: 1, history: Array.from({ length: 7 }, () => ({})) }),
    Object.freeze(Object.create({ schemaVersion: 1, history: Object.freeze([]) }))]) {
    assert.throws(() => runLesson(state, input), code('ERR_LESSON_STATE'));
    assert.throws(() => resetSession(state), code('ERR_LESSON_STATE'));
  }
});

test('deterministic state validation detects forged successes, changed trace, hidden fields and reordered attempts', () => {
  const original = replay('guarded-crash', 'safe-abort');
  for (const mutate of [
    (item) => { item.completedMigration = true; },
    (item) => { item.peakCandidateExposure = 3; },
    (item) => { item.productionJourneys[0].latencyMs = 999; },
    (item) => { item.input.fixture = 'healthy-migration'; },
    (item) => { item.trace[1].candidateState = 'READY'; },
    (item) => { item.attempt = 2; },
    (item) => { Object.defineProperty(item, 'outcome', { value: item.outcome, enumerable: false }); },
  ]) {
    const copy = JSON.parse(JSON.stringify(original));
    mutate(copy.history[0]);
    freeze(copy);
    assert.throws(() => runLesson(copy, { fixture: 'guarded-crash', conclusion: 'safe-abort' }), code('ERR_LESSON_STATE'));
  }
  const two = runLesson(original, { fixture: 'forced-exposure', conclusion: 'interrupted-transition' });
  const changed = freeze({ schemaVersion: 1, history: [...two.history].reverse() });
  assert.throws(() => summarize(changed), code('ERR_LESSON_STATE'));
  assert.equal(original.history[0].completedMigration, false);
});

test('deep immutable snapshots and returned summaries do not leak mutable state', () => {
  const input = { fixture: 'guarded-crash', conclusion: 'safe-abort' };
  const session = runLesson(createSession(), input);
  input.fixture = 'healthy-migration';
  assert.equal(session.history[0].input.fixture, 'guarded-crash');
  assert.throws(() => session.history.push({}), TypeError);
  assert.throws(() => { session.history[0].trace[1].action = 'changed'; }, TypeError);
  assert.throws(() => { session.history[0].productionJourneys[0].outcome = 'failure'; }, TypeError);
  assert.throws(() => { summarize(session).transitions.successes = 99; }, TypeError);
  const next = runLesson(session, { fixture: 'healthy-migration', conclusion: 'completed-migration' });
  assert.equal(next.history[0], session.history[0]);
  assert.equal(session.history.length, 1);
});

test('replays are deterministic, reset is explicit and one attempt never inherits earlier candidate routing', () => {
  const first = replay('guarded-crash', 'safe-abort');
  assert.deepEqual(first, replay('guarded-crash', 'safe-abort'));
  const migrated = replay('healthy-migration', 'completed-migration');
  const aborted = runLesson(migrated, { fixture: 'guarded-crash', conclusion: 'safe-abort' });
  assert.equal(aborted.history[1].trace[0].oldPercent, 100);
  assert.equal(aborted.history[1].trace[0].candidatePercent, 0);
  assert.deepEqual(resetSession(aborted), createSession());
  assert.equal(aborted.history.length, 2);
  assert.equal(summarize(resetSession(aborted)).transitions.successRate, null);
});

test('the public fixed envelope contains exactly the declared finite options and training banner', () => {
  assert.equal(BANNER, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(LIMIT, 6);
  assert.equal(FIXTURES.length, 5);
  assert.equal(CONCLUSIONS.length, 4);
  assert.ok(Object.isFrozen(FIXTURES) && Object.isFrozen(CONCLUSIONS));
  for (const fixture of FIXTURES) {
    const result = replay(fixture, 'unknown').history[0];
    assert.equal(result.trace.length, 4);
    assert.deepEqual(result.trace.map((item) => item.tick), [0, 1, 2, 3]);
    assert.equal(result.productionJourneys.length, 3);
    assert.ok(result.transitionJourneys.length === 0 || result.transitionJourneys.length === 3);
  }
});
