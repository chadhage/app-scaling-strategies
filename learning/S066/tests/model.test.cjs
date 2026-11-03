'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson, fixtures } = require('../model.js');
const defaults = { receipt: 'unavailable', recovery: 'same-key' };

function run(config = defaults) {
  const lesson = createLesson();
  lesson.begin(config);
  lesson.fault();
  lesson.reconcile();
  lesson.recover();
  const state = lesson.snapshot();
  assert.ok(state.result, 'Recovery must produce an attributed result.');
  return { lesson, state };
}
function unchanged(lesson, action, expression) {
  const before = lesson.snapshot();
  assert.throws(action, expression);
  assert.deepEqual(lesson.snapshot(), before, 'Rejected action must not mutate private state.');
}

test('fixture is bounded, synthetic and immutable; new lesson has no evidence', () => {
  const lesson = createLesson();
  assert.equal(lesson.snapshot().phase, 'idle');
  assert.deepEqual(lesson.snapshot().history, []);
  assert.equal(lesson.snapshot().result, null);
  assert.equal(fixtures.operations.length, 3);
  assert.equal(fixtures.maxAttempts, 6);
  assert.ok(Object.isFrozen(fixtures.operations[0]));
  assert.equal(fixtures.label, 'Training rehearsal - synthetic data - not a live Azure result');
});

test('commit, fault, reconcile and recovery are distinct ordered actions', () => {
  const lesson = createLesson();
  lesson.begin(defaults);
  assert.equal(lesson.snapshot().phase, 'committing');
  lesson.fault();
  assert.equal(lesson.snapshot().phase, 'uncertain');
  lesson.reconcile();
  assert.equal(lesson.snapshot().phase, 'reconciled');
  lesson.recover();
  assert.equal(lesson.snapshot().phase, 'complete');
});

test('lost commit acknowledgements leave all three outcomes unresolved, not failed', () => {
  const lesson = createLesson();
  lesson.begin(defaults);
  lesson.fault();
  const state = lesson.snapshot();
  assert.equal(state.original.length, 3);
  assert.deepEqual(state.original.map((row) => row.outcome), ['unresolved', 'unresolved', 'unresolved']);
  assert.equal(state.interruptedResponses, 3);
  assert.equal(state.result, null);
  assert.match(state.trace.join('\n'), /acknowledgements.*lost/i);
});

test('reconciliation distinguishes a commit receipt, terminal abort and unavailable evidence', () => {
  const lesson = createLesson();
  lesson.begin(defaults);
  lesson.fault();
  lesson.reconcile();
  const rows = lesson.snapshot().original;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.outcome), ['committed', 'failed', 'unresolved']);
  assert.match(rows[1].evidence, /terminal abort/i);
  assert.match(rows[2].evidence, /unavailable.*not.*abort/i);
  assert.deepEqual(rows.map((row) => [row.effectMin, row.effectMax]), [[1, 1], [0, 0], [0, 1]]);
});

test('default safe recovery holds uncertainty, retries confirmed abort once, and never claims PASS', () => {
  const { state } = run();
  assert.deepEqual(state.result.originalCounts, { committed: 1, failed: 1, unresolved: 1 });
  assert.deepEqual(state.result.counts, { committed: 2, failed: 0, unresolved: 1 });
  assert.deepEqual(state.result.effects, { min: 2, max: 3, intended: 3 });
  assert.deepEqual(state.result.duplicates, { min: 0, max: 0 });
  assert.equal(state.result.gate, 'UNKNOWN');
  assert.equal(state.result.recoveryImpact, 'UNVERIFIED');
  assert.equal(state.result.interruptedResponses, 3);
  assert.deepEqual(state.result.rows.map((row) => row.addedEffects), [0, 1, 0]);
  assert.match(state.result.rows[0].action, /reuse.*receipt/i);
  assert.match(state.result.rows[2].action, /hold/i);
});

for (const [receipt, originalCounts] of [
  ['committed', { committed: 2, failed: 1, unresolved: 0 }],
  ['aborted', { committed: 1, failed: 2, unresolved: 0 }],
]) {
  test(`authoritative ${receipt} receipt permits exactly-once synthetic recovery without erasing original failures`, () => {
    const { state } = run({ receipt, recovery: 'same-key' });
    assert.deepEqual(state.result.originalCounts, originalCounts);
    assert.deepEqual(state.result.counts, { committed: 3, failed: 0, unresolved: 0 });
    assert.deepEqual(state.result.effects, { min: 3, max: 3, intended: 3 });
    assert.deepEqual(state.result.duplicates, { min: 0, max: 0 });
    assert.equal(state.result.gate, 'PASS');
    assert.equal(state.result.recoveryImpact, 'RECOVERED');
    assert.equal(state.result.interruptedResponses, 3);
    assert.equal(state.result.uninterruptedMigrationProven, false);
  });
}

test('holding a confirmed abort fails the intended-effect contract even with no duplicates', () => {
  const { state } = run({ receipt: 'unavailable', recovery: 'hold' });
  assert.deepEqual(state.result.counts, { committed: 1, failed: 1, unresolved: 1 });
  assert.deepEqual(state.result.effects, { min: 1, max: 2, intended: 3 });
  assert.deepEqual(state.result.duplicates, { min: 0, max: 0 });
  assert.equal(state.result.gate, 'FAIL');
  assert.equal(state.result.recoveryImpact, 'INTERRUPTED');
});

test('blind fresh-key retry duplicates the known commit and preserves ambiguous duplicate risk', () => {
  const { state } = run({ receipt: 'unavailable', recovery: 'new-key' });
  assert.deepEqual(state.result.originalCounts, { committed: 1, failed: 1, unresolved: 1 });
  assert.deepEqual(state.result.counts, { committed: 1, failed: 1, unresolved: 1 });
  assert.deepEqual(state.result.effects, { min: 4, max: 5, intended: 3 });
  assert.deepEqual(state.result.duplicates, { min: 1, max: 2 });
  assert.equal(state.result.gate, 'FAIL');
  assert.equal(state.result.rows[0].outcome, 'failed');
  assert.equal(state.result.rows[2].outcome, 'unresolved');
  assert.equal(state.result.interruptedResponses, 3);
});

test('all nine configurations have deterministic explicit counts and bounds', () => {
  const expected = {
    'unavailable/same-key': ['UNKNOWN', [2, 0, 1], [2, 3], [0, 0]],
    'committed/same-key': ['PASS', [3, 0, 0], [3, 3], [0, 0]],
    'aborted/same-key': ['PASS', [3, 0, 0], [3, 3], [0, 0]],
    'unavailable/hold': ['FAIL', [1, 1, 1], [1, 2], [0, 0]],
    'committed/hold': ['FAIL', [2, 1, 0], [2, 2], [0, 0]],
    'aborted/hold': ['FAIL', [1, 2, 0], [1, 1], [0, 0]],
    'unavailable/new-key': ['FAIL', [1, 1, 1], [4, 5], [1, 2]],
    'committed/new-key': ['FAIL', [1, 2, 0], [5, 5], [2, 2]],
    'aborted/new-key': ['FAIL', [2, 1, 0], [4, 4], [1, 1]],
  };
  for (const receipt of fixtures.receipts) {
    for (const recovery of fixtures.recoveries) {
      const { state } = run({ receipt, recovery });
      const result = state.result;
      const compact = [result.gate, Object.values(result.counts),
        [result.effects.min, result.effects.max], Object.values(result.duplicates)];
      assert.deepEqual(compact, expected[`${receipt}/${recovery}`], `${receipt}/${recovery}`);
      assert.deepEqual(run({ receipt, recovery }).state, state);
      assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), 3);
      assert.equal(result.rows.length, 3);
      assert.equal(result.interruptedResponses, 3);
    }
  }
});

test('strict config rejects coercion, extra/inherited/symbol/accessor properties without invoking getters', () => {
  let getterCalls = 0;
  const accessor = { recovery: 'same-key' };
  Object.defineProperty(accessor, 'receipt', { enumerable: true, get() { getterCalls++; return 'unavailable'; } });
  const bad = [
    undefined, null, [], 'unavailable', 0,
    {}, { receipt: 'unavailable' }, { ...defaults, extra: true },
    { ...defaults, receipt: 'missing' }, { ...defaults, recovery: 'SAME-KEY' },
    { ...defaults, receipt: new String('committed') }, { ...defaults, recovery: 1 },
    Object.create(defaults), Object.assign(Object.create({ extra: true }), defaults),
    { ...defaults, [Symbol('extra')]: 1 }, accessor,
  ];
  for (const config of bad) {
    const lesson = createLesson();
    unchanged(lesson, () => lesson.begin(config), /configuration/i);
  }
  assert.equal(getterCalls, 0);
  const nonEnumerable = { recovery: 'same-key' };
  Object.defineProperty(nonEnumerable, 'receipt', { value: 'committed' });
  unchanged(createLesson(), () => createLesson().begin(nonEnumerable), /configuration/i);
  const lesson = createLesson();
  lesson.begin(Object.assign(Object.create(null), defaults));
  assert.equal(lesson.snapshot().phase, 'committing');
});

test('out-of-order, skipped, duplicate and argument-smuggled actions reject without mutation', () => {
  const lesson = createLesson();
  for (const name of ['fault', 'reconcile', 'recover', 'next']) unchanged(lesson, () => lesson[name](), /phase/i);
  unchanged(lesson, () => lesson.begin(), /argument/i);
  unchanged(lesson, () => lesson.begin(defaults, 'extra'), /argument/i);
  lesson.begin(defaults);
  unchanged(lesson, () => lesson.begin(defaults), /phase/i);
  unchanged(lesson, () => lesson.fault('extra'), /argument/i);
  unchanged(lesson, () => lesson.recover(), /phase/i);
  lesson.fault();
  unchanged(lesson, () => lesson.fault(), /phase/i);
  unchanged(lesson, () => lesson.reconcile('extra'), /argument/i);
  lesson.reconcile();
  unchanged(lesson, () => lesson.reconcile(), /phase/i);
  unchanged(lesson, () => lesson.recover('extra'), /argument/i);
  lesson.recover();
  unchanged(lesson, () => lesson.recover(), /phase/i);
  unchanged(lesson, () => lesson.next('extra'), /argument/i);
  unchanged(lesson, () => lesson.reset('extra'), /argument/i);
});

test('prediction verifier is separate; wrong, correct, duplicate and invalid guesses do not rewrite outcomes', () => {
  const { lesson, state } = run({ receipt: 'unavailable', recovery: 'new-key' });
  for (const guess of [undefined, '', 'fail', null, 1, new String('FAIL')]) {
    unchanged(lesson, () => lesson.predict(guess), /prediction/i);
  }
  unchanged(lesson, () => lesson.predict(), /argument/i);
  unchanged(lesson, () => lesson.predict('FAIL', 'extra'), /argument/i);
  lesson.predict('FAIL');
  assert.deepEqual(lesson.snapshot().result, state.result);
  assert.deepEqual(lesson.snapshot().prediction, { expected: 'FAIL', selected: 'FAIL', correct: true });
  assert.deepEqual(lesson.snapshot().history[0].prediction, lesson.snapshot().prediction);
  unchanged(lesson, () => lesson.predict('FAIL'), /already/i);
  const wrong = run().lesson;
  wrong.predict('PASS');
  assert.equal(wrong.snapshot().prediction.correct, false);
  assert.equal(wrong.snapshot().result.gate, 'UNKNOWN');
  unchanged(createLesson(), () => createLesson().predict('PASS'), /phase/i);
});

test('new attempts retain full history; six is a hard cap; reset alone clears all proof', () => {
  const { lesson, state } = run();
  assert.equal(lesson.snapshot().history.length, 1);
  const first = lesson.snapshot().history[0];
  for (let attempt = 2; attempt <= fixtures.maxAttempts; attempt++) {
    lesson.next();
    assert.equal(lesson.snapshot().phase, 'idle');
    assert.equal(lesson.snapshot().result, null);
    assert.equal(lesson.snapshot().prediction, null);
    assert.deepEqual(lesson.snapshot().config, defaults);
    assert.deepEqual(lesson.snapshot().history[0], first);
    lesson.begin({ receipt: 'committed', recovery: 'same-key' });
    lesson.fault(); lesson.reconcile(); lesson.recover();
    assert.equal(lesson.snapshot().history.length, attempt);
  }
  unchanged(lesson, () => lesson.next(), /six|capacity/i);
  assert.deepEqual(lesson.snapshot().history[0].result, state.result);
  lesson.reset();
  assert.deepEqual(lesson.snapshot(), createLesson().snapshot());
  for (const stage of ['committing', 'uncertain', 'reconciled']) {
    lesson.begin(defaults);
    if (stage !== 'committing') lesson.fault();
    if (stage === 'reconciled') lesson.reconcile();
    lesson.reset();
    assert.deepEqual(lesson.snapshot(), createLesson().snapshot());
  }
});

test('detached deeply frozen snapshots cannot change configuration, evidence or retained history', () => {
  const config = { ...defaults };
  const lesson = createLesson();
  lesson.begin(config);
  config.receipt = 'aborted';
  assert.equal(lesson.snapshot().config.receipt, 'unavailable');
  lesson.fault(); lesson.reconcile(); lesson.recover();
  const first = lesson.snapshot();
  const second = lesson.snapshot();
  assert.ok(first.result, 'Completed snapshot includes recovery proof.');
  assert.notStrictEqual(first, second);
  for (const value of [
    first, first.config, first.original, first.original[0], first.result, first.result.rows[0],
    first.result.counts, first.result.effects, first.history, first.history[0],
    first.history[0].result, first.history[0].trace,
  ]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { first.result.rows[0].effectMin = 99; }, TypeError);
  assert.throws(() => first.history.pop(), TypeError);
  assert.deepEqual(lesson.snapshot(), second);
});
