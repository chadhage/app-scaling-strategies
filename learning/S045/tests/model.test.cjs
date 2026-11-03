'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('../fixtures.js');
const { createLesson } = require('../model.js');

function config(overrides = {}) {
  return { ...fixtures.defaults, ...overrides };
}

function complete(overrides = {}, lesson = createLesson()) {
  lesson.start(config(overrides));
  lesson.cutover();
  return { lesson, state: lesson.reconnect() };
}

function check(result, id) {
  return result.checks.find((entry) => entry.id === id).outcome;
}

test('fixture explicitly contains two versioned synthetic formats and fixed bounds', () => {
  assert.equal(fixtures.schemaVersion, 1);
  assert.deepEqual(fixtures.v1.map((frame) => frame.seq), [1, 2, 3]);
  assert.deepEqual(fixtures.v2.map((frame) => frame.sequence), [4, 5, 6]);
  assert.equal(fixtures.v1.reduce((sum, frame) => sum + frame.delta, 0), 30);
  assert.equal(fixtures.expectedState, 60);
  assert.equal(fixtures.limits.attempts, 8);
  assert.ok(Object.isFrozen(fixtures.v2[0]));
});

test('start acknowledges v1 state and freezes configuration before handoff', () => {
  const lesson = createLesson();
  const input = config();
  const state = lesson.start(input);
  assert.equal(state.phase, 'connected-v1');
  assert.equal(state.attempt, 1);
  assert.equal(state.ackCursor, 3);
  assert.equal(state.ackState, 30);
  assert.equal(state.trace.length, 3);
  input.budgetMs = 1;
  assert.equal(lesson.snapshot().config.budgetMs, 100);
});

test('cutover disconnects without silently resetting acknowledged state', () => {
  const lesson = createLesson();
  lesson.start(config());
  const state = lesson.cutover();
  assert.equal(state.phase, 'disconnected');
  assert.equal(state.ackCursor, 3);
  assert.equal(state.ackState, 30);
  assert.equal(state.result, null);
  assert.ok(state.trace.some((event) => event.text.includes('v2')));
});

test('safe resume keeps ordered acknowledged messages and state within original budget', () => {
  const { state } = complete();
  assert.equal(state.phase, 'complete');
  assert.equal(state.result.impact, 'uninterrupted');
  assert.equal(state.result.requestedCursor, 3);
  assert.equal(state.result.lastAcknowledged, 6);
  assert.equal(state.result.finalState, 60);
  assert.deepEqual(state.result.visibleSequences, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(state.result.missingVisible, []);
  assert.equal(state.result.wireReplays, 0);
  assert.equal(state.result.duplicateEffects, 0);
  assert.ok(state.result.checks.every((entry) => entry.outcome === 'pass'));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].result.impact, 'uninterrupted');
});

test('rewound acknowledged messages are detected but safely suppressed', () => {
  const { state } = complete({ cursor: 'rewind' });
  assert.equal(state.result.impact, 'uninterrupted');
  assert.equal(state.result.requestedCursor, 0);
  assert.equal(state.result.wireReplays, 3);
  assert.equal(state.result.duplicateEffects, 0);
  assert.equal(state.result.finalState, 60);
  assert.deepEqual(state.result.visibleSequences, fixtures.expectedSequences);
});

test('a repeated v2 frame is distinguishable from a duplicate visible effect', () => {
  const { state } = complete({ delivery: 'repeat-4' });
  assert.equal(state.result.impact, 'uninterrupted');
  assert.equal(state.result.wireReplays, 1);
  assert.equal(state.result.duplicateEffects, 0);
  assert.equal(state.result.finalState, 60);
});

test('blind replay of acknowledged messages is an interruption, never exactly-once proof', () => {
  const { state } = complete({ cursor: 'rewind', replayProtection: 'apply-all' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(state.result.wireReplays, 3);
  assert.equal(state.result.duplicateEffects, 3);
  assert.equal(state.result.finalState, 90);
  assert.equal(check(state.result, 'duplicates'), 'fail');
  assert.equal(check(state.result, 'ordering'), 'fail');
  assert.equal(check(state.result, 'state'), 'fail');
});

test('blind duplicate v2 delivery reports the extra effect and incorrect state', () => {
  const { state } = complete({ delivery: 'repeat-4', replayProtection: 'apply-all' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(state.result.duplicateEffects, 1);
  assert.equal(state.result.finalState, 70);
});

test('missing sequence blocks later acknowledgements rather than silently skipping a gap', () => {
  const { state } = complete({ delivery: 'drop-5' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(state.result.lastAcknowledged, 4);
  assert.equal(state.result.finalState, 40);
  assert.equal(state.result.rejectedGaps, 1);
  assert.deepEqual(state.result.missingVisible, [5, 6]);
  assert.equal(check(state.result, 'complete'), 'fail');
  assert.equal(check(state.result, 'ordering'), 'fail');
});

test('out-of-order v2 delivery is rejected and remains an explicit continuity failure', () => {
  const { state } = complete({ delivery: 'reorder' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(state.result.rejectedGaps, 1);
  assert.equal(state.result.lastAcknowledged, 5);
  assert.deepEqual(state.result.missingVisible, [6]);
});

test('a cursor ahead of the acknowledgement cannot manufacture successful progress', () => {
  const { state } = complete({ cursor: 'skip' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(state.result.requestedCursor, 4);
  assert.equal(state.result.lastAcknowledged, 3);
  assert.deepEqual(state.result.missingVisible, [4, 5, 6]);
  assert.equal(state.result.rejectedGaps, 2);
});

test('lost acknowledged state fails even if the replay sequence itself is complete', () => {
  const { state } = complete({ stateRetention: 'lost' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(state.result.lastAcknowledged, 6);
  assert.equal(state.result.finalState, 30);
  assert.equal(check(state.result, 'retention'), 'fail');
  assert.equal(check(state.result, 'complete'), 'pass');
  assert.equal(check(state.result, 'state'), 'fail');
});

test('a v1-only decoder explicitly rejects the changed v2 frame schema', () => {
  const { state } = complete({ decoder: 'v1-only' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(state.result.schemaRejects, 3);
  assert.equal(state.result.lastAcknowledged, 3);
  assert.equal(check(state.result, 'versions'), 'fail');
});

test('the original recovery budget is inclusive and never restarted by reconnect', () => {
  assert.equal(complete({ gapMs: 100 }).state.result.impact, 'uninterrupted');
  assert.equal(complete({ gapMs: 101 }).state.result.impact, 'interrupted');
  assert.equal(complete({ gapMs: 0, budgetMs: 1 }).state.result.impact, 'uninterrupted');
  assert.equal(complete({ gapMs: 2000, budgetMs: 2000 }).state.result.impact, 'uninterrupted');
  const { state } = complete({ gapMs: 101 });
  assert.equal(state.result.gapMs, 101);
  assert.equal(state.result.budgetMs, 100);
  assert.equal(check(state.result, 'budget'), 'fail');
});

for (const missing of [{ cursor: 'absent' }, { observation: 'missing' }]) {
  test(`absent proof is unknown, with no fabricated state or acknowledgements: ${JSON.stringify(missing)}`, () => {
    const { state } = complete(missing);
    assert.equal(state.result.impact, 'unknown');
    assert.equal(state.result.lastAcknowledged, null);
    assert.equal(state.result.finalState, null);
    assert.equal(state.result.visibleSequences, null);
    assert.equal(state.result.missingVisible, null);
    assert.equal(state.result.duplicateEffects, null);
    assert.equal(check(state.result, 'complete'), 'unknown');
    assert.equal(check(state.result, 'state'), 'unknown');
    assert.equal(check(state.result, 'budget'), 'pass');
  });
}

test('missing evidence cannot hide a known original-budget breach', () => {
  const { state } = complete({ observation: 'missing', gapMs: 101 });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(check(state.result, 'budget'), 'fail');
  assert.equal(check(state.result, 'state'), 'unknown');
});

test('missing evidence cannot hide known loss of acknowledged state', () => {
  const { state } = complete({ cursor: 'absent', stateRetention: 'lost' });
  assert.equal(state.result.impact, 'interrupted');
  assert.equal(check(state.result, 'retention'), 'fail');
  assert.equal(check(state.result, 'state'), 'unknown');
});

test('prediction verdict is separate from unchanged interrupted impact and retained history', () => {
  const { lesson } = complete({ delivery: 'drop-5' });
  const pass = lesson.checkPrediction('interrupted');
  assert.deepEqual(pass.prediction, { expected: 'interrupted', actual: 'interrupted', verdict: 'PASS' });
  assert.equal(pass.result.impact, 'interrupted');
  assert.equal(pass.history[0].prediction.verdict, 'PASS');
  const fail = lesson.checkPrediction('uninterrupted');
  assert.equal(fail.prediction.verdict, 'FAIL');
  assert.equal(fail.result.impact, 'interrupted');
  assert.equal(fail.history.length, 1);
});

test('unknown is a valid prediction but never interchangeable with uninterrupted', () => {
  const { lesson } = complete({ observation: 'missing' });
  assert.equal(lesson.checkPrediction('uninterrupted').prediction.verdict, 'FAIL');
  assert.equal(lesson.checkPrediction('unknown').prediction.verdict, 'PASS');
  for (const invalid of ['', null, undefined, true, 'PASS', '<img src=x>']) {
    const before = lesson.snapshot();
    assert.throws(() => lesson.checkPrediction(invalid), { code: 'ERR_PREDICTION' });
    assert.deepEqual(lesson.snapshot(), before);
  }
});

test('invalid configurations are rejected atomically without coercion or untrusted accessors', () => {
  const withoutField = config();
  delete withoutField.cursor;
  let getterCalls = 0;
  const accessor = config();
  Object.defineProperty(accessor, 'gapMs', { enumerable: true, get() { getterCalls++; return 80; } });
  const cases = [
    null, undefined, [], '80', true, {}, withoutField, Object.create(config()),
    config({ extra: 1 }), { ...config(), [Symbol('extra')]: true }, accessor,
    config({ cursor: '<script>alert(1)</script>' }),
    config({ replayProtection: 'yes' }), config({ delivery: 'random' }),
    config({ decoder: 'v3' }), config({ stateRetention: true }), config({ observation: null }),
  ];
  for (const field of ['gapMs', 'budgetMs']) {
    for (const value of ['80', '', true, null, NaN, Infinity, -1, 0.5, 2001, {}, []]) {
      cases.push(config({ [field]: value }));
    }
  }
  cases.push(config({ budgetMs: 0 }));
  for (const invalid of cases) {
    const lesson = createLesson();
    const before = lesson.snapshot();
    assert.throws(() => lesson.start(invalid), { code: 'ERR_CONFIG' });
    assert.deepEqual(lesson.snapshot(), before);
  }
  assert.equal(getterCalls, 0);
});

test('phase guards prevent discarded acknowledged work and repeated reconnect side effects', () => {
  const lesson = createLesson();
  for (const action of ['cutover', 'reconnect', 'nextAttempt']) {
    assert.throws(() => lesson[action](), { code: 'ERR_PHASE' });
  }
  assert.throws(() => lesson.checkPrediction('unknown'), { code: 'ERR_PHASE' });
  lesson.start(config());
  let before = lesson.snapshot();
  assert.throws(() => lesson.start(config()), { code: 'ERR_PHASE' });
  assert.throws(() => lesson.reconnect(), { code: 'ERR_PHASE' });
  assert.throws(() => lesson.nextAttempt(), { code: 'ERR_PHASE' });
  assert.deepEqual(lesson.snapshot(), before);
  lesson.cutover();
  before = lesson.snapshot();
  assert.throws(() => lesson.cutover(), { code: 'ERR_PHASE' });
  assert.throws(() => lesson.start(config()), { code: 'ERR_PHASE' });
  assert.deepEqual(lesson.snapshot(), before);
  lesson.reconnect();
  before = lesson.snapshot();
  for (const action of ['cutover', 'reconnect']) {
    assert.throws(() => lesson[action](), { code: 'ERR_PHASE' });
  }
  assert.throws(() => lesson.start(config()), { code: 'ERR_PHASE' });
  assert.deepEqual(lesson.snapshot(), before);
});

test('snapshots are deeply frozen, deterministic and cannot mutate internal evidence', () => {
  const { lesson, state } = complete();
  const other = complete().state;
  assert.deepEqual(state, other);
  assert.ok(Object.isFrozen(state.history[0].result.checks));
  assert.throws(() => { state.result.impact = 'unknown'; }, TypeError);
  assert.throws(() => { state.config.budgetMs = 2000; }, TypeError);
  assert.throws(() => { state.trace.push({ text: 'forged' }); }, TypeError);
  assert.deepEqual(lesson.snapshot(), other);
});

test('eight completed attempts are retained without eviction; reset restores exact idle state', () => {
  const lesson = createLesson();
  const idle = lesson.snapshot();
  for (let index = 0; index < fixtures.limits.attempts; index++) {
    if (index) {
      const state = lesson.nextAttempt();
      assert.equal(state.phase, 'idle');
      assert.equal(state.result, null);
      assert.equal(state.history.length, index);
    }
    complete({ gapMs: 80 + index }, lesson);
  }
  const full = lesson.snapshot();
  assert.equal(full.history.length, 8);
  assert.deepEqual(full.history.map((entry) => entry.attempt), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(full.history[0].result.gapMs, 80);
  assert.throws(() => lesson.nextAttempt(), { code: 'ERR_LIMIT' });
  assert.deepEqual(lesson.snapshot(), full);
  assert.deepEqual(lesson.reset(), idle);
  assert.deepEqual(complete({}, lesson).state, complete().state);
});
