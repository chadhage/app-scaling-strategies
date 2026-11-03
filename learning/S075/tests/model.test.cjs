'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('..\\fixtures.js');
const { createLesson } = require('..\\model.js');
const config = (changes = {}) => ({ ...fixtures.defaults, ...changes });
function run(changes = {}) {
  const lesson = createLesson();
  lesson.expand(config(changes));
  lesson.processBatch();
  lesson.verify();
  return lesson;
}
function unchanged(lesson, action, pattern) {
  const before = lesson.snapshot();
  assert.throws(action, pattern);
  assert.deepEqual(lesson.snapshot(), before);
}

test('loadable model starts with no inferred ownership, delivery or success evidence', () => {
  const state = createLesson().snapshot();
  assert.equal(state.phase, 'idle');
  assert.equal(state.result, null);
  assert.equal(state.deliveries, null);
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.totals, { success: 0, failure: 0, unknown: 0 });
});

test('adding consumers is a real state transition, not an idle success-shaped stub', () => {
  const lesson = createLesson();
  const state = lesson.expand(config());
  assert.equal(state.phase, 'expanded');
  assert.deepEqual(state.consumers, ['consumer-0', 'consumer-1']);
  assert.equal(state.assignments.length, 3);
  assert.equal(state.result, null);
  assert.equal(state.deliveries, null);
});

test('one or two added consumers receive exclusive current locks and actually process work', () => {
  for (const additions of ['one', 'two']) {
    const state = run({ additions }).snapshot();
    assert.equal(state.phase, 'verified');
    assert.equal(state.result.verdict, 'PASS');
    assert.equal(state.result.ownership, 'PASS');
    assert.deepEqual(state.result.metrics, {
      attemptedEvents: 6, deliveryCount: 6, deliveryDuplicates: 0, effectCount: 6,
      duplicateOwnerPartitions: 0, invalidLockClaims: 0, missingEvents: 0,
      duplicateEffects: 0, suppressedDeliveries: 0, newConsumerEvents: additions === 'one' ? 2 : 4,
      success: 6, failure: 0, unknown: 0,
    });
    for (const consumer of state.consumers.slice(1)) {
      assert.ok(state.deliveries.some((delivery) => delivery.consumer === consumer));
    }
  }
});

test('redelivery is counted separately and the effect-key ledger suppresses the repeated effect', () => {
  const state = run({ delivery: 'redelivery' }).snapshot();
  assert.equal(state.result.verdict, 'PASS');
  assert.equal(state.result.metrics.deliveryCount, 7);
  assert.equal(state.result.metrics.deliveryDuplicates, 1);
  assert.equal(state.result.metrics.effectCount, 6);
  assert.equal(state.result.metrics.duplicateEffects, 0);
  assert.equal(state.result.metrics.suppressedDeliveries, 1);
  assert.equal(state.result.events.find((event) => event.eventId === 'E03').deliveries, 2);
});

test('deduplication off exposes duplicate business effects, not a successful retry', () => {
  const state = run({ delivery: 'redelivery', dedup: 'off' }).snapshot();
  assert.equal(state.result.verdict, 'FAIL');
  assert.equal(state.result.metrics.duplicateEffects, 1);
  assert.equal(state.result.metrics.failure, 1);
  assert.equal(state.result.metrics.success, 5);
  assert.equal(state.result.events.find((event) => event.eventId === 'E03').effects, 2);
});

test('duplicate ownership fails even when deduplication keeps exactly six effects', () => {
  const state = run({ additions: 'two', ownership: 'overlap' }).snapshot();
  assert.equal(state.result.verdict, 'FAIL');
  assert.equal(state.result.ownership, 'FAIL');
  assert.equal(state.result.metrics.duplicateOwnerPartitions, 2);
  assert.equal(state.result.metrics.invalidLockClaims, 2);
  assert.equal(state.result.metrics.effectCount, 6);
  assert.equal(state.result.metrics.duplicateEffects, 0);
  assert.equal(state.result.metrics.deliveryDuplicates, 4);
  assert.equal(state.result.metrics.failure, 4);
});

test('overlapping owners without deduplication expose both independent correctness faults', () => {
  const state = run({ ownership: 'overlap', dedup: 'off' }).snapshot();
  assert.equal(state.result.verdict, 'FAIL');
  assert.equal(state.result.metrics.duplicateOwnerPartitions, 1);
  assert.equal(state.result.metrics.duplicateEffects, 2);
  assert.equal(state.result.metrics.effectCount, 8);
});

test('expired stale locks fail even when there is one owner and six effects', () => {
  const state = run({ ownership: 'stale-lock' }).snapshot();
  assert.equal(state.result.verdict, 'FAIL');
  assert.equal(state.result.metrics.duplicateOwnerPartitions, 0);
  assert.equal(state.result.metrics.invalidLockClaims, 1);
  assert.equal(state.result.metrics.effectCount, 6);
  assert.equal(state.result.metrics.failure, 2);
});

test('missing E04 remains in the denominator and fails with zero effects', () => {
  const state = run({ delivery: 'missing' }).snapshot();
  assert.equal(state.result.verdict, 'FAIL');
  assert.equal(state.result.metrics.attemptedEvents, 6);
  assert.equal(state.result.metrics.missingEvents, 1);
  assert.equal(state.result.metrics.success, 5);
  assert.equal(state.result.metrics.failure, 1);
  assert.equal(state.result.events.find((event) => event.eventId === 'E04').effects, 0);
});

test('unobserved ownership holds UNKNOWN despite six observed effects', () => {
  const state = run({ ownership: 'unobserved' }).snapshot();
  assert.equal(state.result.verdict, 'UNKNOWN');
  assert.equal(state.result.ownership, 'UNKNOWN');
  assert.equal(state.result.metrics.duplicateOwnerPartitions, null);
  assert.equal(state.result.metrics.newConsumerEvents, null);
  assert.equal(state.result.metrics.effectCount, 6);
  assert.equal(state.result.metrics.unknown, 6);
});

test('unobserved delivery is UNKNOWN, never invented as zero missing or duplicate effects', () => {
  const state = run({ delivery: 'unobserved' }).snapshot();
  assert.equal(state.result.verdict, 'UNKNOWN');
  assert.equal(state.result.metrics.deliveryCount, null);
  assert.equal(state.result.metrics.missingEvents, null);
  assert.equal(state.result.metrics.duplicateEffects, null);
  assert.equal(state.result.metrics.unknown, 6);
});

test('known ownership failure takes precedence over unavailable delivery evidence', () => {
  const state = run({ ownership: 'overlap', delivery: 'unobserved' }).snapshot();
  assert.equal(state.result.verdict, 'FAIL');
  assert.equal(state.result.ownership, 'FAIL');
  assert.equal(state.result.metrics.unknown, 6);
  assert.equal(state.result.metrics.duplicateOwnerPartitions, 1);
});

test('all 64 bounded combinations preserve event attribution, deterministic outcomes and new capacity scope', () => {
  let count = 0;
  for (const additions of fixtures.choices.additions) for (const ownership of fixtures.choices.ownership) {
    for (const delivery of fixtures.choices.delivery) for (const dedup of fixtures.choices.dedup) {
      const input = { additions, ownership, delivery, dedup };
      const state = run(input).snapshot();
      const fail = ['overlap', 'stale-lock'].includes(ownership) || delivery === 'missing'
        || (delivery === 'redelivery' && dedup === 'off');
      const unknown = ownership === 'unobserved' || delivery === 'unobserved';
      assert.equal(state.result.verdict, fail ? 'FAIL' : unknown ? 'UNKNOWN' : 'PASS', JSON.stringify(input));
      const metrics = state.result.metrics;
      assert.equal(metrics.success + metrics.failure + metrics.unknown, 6);
      assert.deepEqual(state.result.events.map((event) => event.eventId), fixtures.events.map((event) => event.id));
      assert.deepEqual(state, run(input).snapshot());
      count++;
    }
  }
  assert.equal(count, 64);
});

test('strict input records reject malformed enums, extra fields, symbols, getters and wrong types without mutation', () => {
  const invalid = [null, [], 'exclusive', 2, {}, config({ additions: 2 }), config({ ownership: 'EXCLUSIVE' }),
    config({ delivery: ' complete' }), config({ dedup: true }), { ...config(), arbitraryEndpoint: 'not-allowed' },
    Object.assign(Object.create({ additions: 'one' }), config()), { ...config(), [Symbol('extra')]: 'no' }];
  const getter = config();
  Object.defineProperty(getter, 'ownership', { enumerable: true, get() { throw new Error('Getter must never run'); } });
  invalid.push(getter);
  for (const input of invalid) {
    const lesson = createLesson();
    unchanged(lesson, () => lesson.expand(input), /Invalid input/);
  }
});

test('out-of-order and repeated actions reject without mutation at every phase', () => {
  const lesson = createLesson();
  unchanged(lesson, () => lesson.processBatch(), /Phase/);
  unchanged(lesson, () => lesson.verify(), /Phase/);
  unchanged(lesson, () => lesson.checkPrediction('PASS'), /Phase/);
  unchanged(lesson, () => lesson.newAttempt(), /Phase/);
  lesson.expand(config());
  unchanged(lesson, () => lesson.expand(config()), /Phase/);
  unchanged(lesson, () => lesson.verify(), /Phase/);
  lesson.processBatch();
  unchanged(lesson, () => lesson.processBatch(), /Phase/);
  lesson.verify();
  unchanged(lesson, () => lesson.verify(), /Phase/);
  unchanged(lesson, () => lesson.checkPrediction(''), /Invalid prediction/);
  unchanged(lesson, () => lesson.checkPrediction('pass'), /Invalid prediction/);
  lesson.checkPrediction('PASS');
  unchanged(lesson, () => lesson.checkPrediction('PASS'), /Phase/);
});

test('learning prediction is separate from measured outcome and history retains complete evidence', () => {
  const lesson = run({ delivery: 'redelivery', dedup: 'off' });
  const before = lesson.snapshot();
  const checked = lesson.checkPrediction('PASS');
  assert.equal(checked.phase, 'checked');
  assert.deepEqual(checked.result, before.result);
  assert.deepEqual(checked.prediction, { expected: 'PASS', observed: 'FAIL', correct: false });
  assert.equal(checked.history.length, 1);
  assert.deepEqual(checked.history[0].result, before.result);
  assert.deepEqual(checked.history[0].deliveries, before.deliveries);
  assert.deepEqual(checked.history[0].effects, before.effects);
  assert.deepEqual(checked.totals, { success: 0, failure: 1, unknown: 0 });
  lesson.newAttempt();
  const next = lesson.snapshot();
  assert.equal(next.phase, 'idle');
  assert.equal(next.config, null);
  assert.equal(next.trace.length, 0);
  assert.deepEqual(next.history, checked.history);
  assert.deepEqual(next.totals, checked.totals);
});

test('six attempts retain failures and unknowns without eviction; explicit reset clears everything', () => {
  const lesson = createLesson();
  for (let index = 0; index < 6; index++) {
    lesson.expand(config(index % 2 ? { ownership: 'unobserved' } : { ownership: 'overlap' }));
    lesson.processBatch();
    lesson.verify();
    lesson.checkPrediction(index % 2 ? 'UNKNOWN' : 'FAIL');
    if (index < 5) lesson.newAttempt();
  }
  const state = lesson.snapshot();
  assert.equal(state.history.length, 6);
  assert.deepEqual(state.totals, { success: 0, failure: 3, unknown: 3 });
  unchanged(lesson, () => lesson.newAttempt(), /History full/);
  unchanged(lesson, () => lesson.expand(config()), /Phase/);
  assert.deepEqual(lesson.reset(), createLesson().snapshot());
  assert.deepEqual(lesson.reset(), createLesson().snapshot());
});

test('snapshots, input objects and instances cannot mutate another run or immutable fixtures', () => {
  assert.ok(Object.isFrozen(fixtures.events[0]));
  const input = config();
  const lesson = createLesson();
  const expanded = lesson.expand(input);
  input.ownership = 'overlap';
  expanded.assignments[0].claims[0].epoch = 99;
  expanded.config.dedup = 'off';
  assert.equal(lesson.snapshot().config.ownership, 'exclusive');
  assert.equal(lesson.snapshot().assignments[0].claims[0].epoch, 2);
  assert.deepEqual(createLesson().snapshot().history, []);
  lesson.processBatch();
  lesson.verify();
  const snapshot = lesson.checkPrediction('PASS');
  snapshot.history[0].result.verdict = 'FAIL';
  assert.equal(lesson.snapshot().history[0].result.verdict, 'PASS');
});
