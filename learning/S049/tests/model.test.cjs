'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DEFAULT_CONFIG, BOUNDS, createLesson } = require(path.join(__dirname, '..', 'model.js'));

function observed(overrides = {}) {
  const lesson = createLesson();
  lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG, ...overrides });
  lesson.retry();
  return lesson;
}

function unchangedOnError(lesson, command, argument) {
  const before = lesson.snapshot();
  if (arguments.length === 3) assert.throws(() => lesson[command](argument));
  else assert.throws(() => lesson[command]());
  assert.deepEqual(lesson.snapshot(), before);
}

test('a committed POST remains one effect after its response is lost', () => {
  const lesson = createLesson();
  const state = lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG });
  assert.equal(state.phase, 'ambiguous');
  assert.equal(state.postCount, 1);
  assert.deepEqual(state.effects, [{
    effectId: 'synth-effect-1', key: 'synth-key-A', operation: 'synth-order', units: 10,
  }]);
  assert.deepEqual(state.client, { status: 'unresolved', effectId: null, units: null });
  assert.equal(state.result, null);
  assert.match(state.trace[1].event, /lost after commit/i);
});

test('same key and payload replay the original result, not a second effect', () => {
  const state = observed().snapshot();
  assert.equal(state.phase, 'observed');
  assert.equal(state.postCount, 2);
  assert.equal(state.effects.length, 1);
  assert.equal(state.result.outcome, 'success');
  assert.equal(state.result.correctClientResult, true);
  assert.deepEqual(state.client, { status: 'confirmed', effectId: 'synth-effect-1', units: 10 });
  assert.match(state.trace[3].event, /replay/i);
});

test('no deduplication duplicates the business effect despite using the same key', () => {
  const state = observed({ deduplication: 'none' }).snapshot();
  assert.equal(state.effects.length, 2);
  assert.equal(state.effects[1].effectId, 'synth-effect-2');
  assert.equal(state.result.outcome, 'failure');
  assert.ok(state.result.reasons.some((reason) => /duplicate/i.test(reason)));
});

test('a new key represents a new operation to even the atomic ledger', () => {
  const state = observed({ retryKey: 'new' }).snapshot();
  assert.equal(state.effects.length, 2);
  assert.equal(state.effects[1].key, 'synth-key-B');
  assert.equal(state.result.outcome, 'failure');
});

test('a changed payload with the same key is rejected without another commit', () => {
  const state = observed({ retryPayload: 'changed' }).snapshot();
  assert.equal(state.effects.length, 1);
  assert.equal(state.client.status, 'rejected-conflict');
  assert.equal(state.result.correctClientResult, false);
  assert.equal(state.result.outcome, 'failure');
  assert.match(state.trace[3].event, /409.*conflict/i);
});

test('a missing key is rejected by atomic enforcement, not treated as safe retry', () => {
  const state = observed({ retryKey: 'missing' }).snapshot();
  assert.equal(state.effects.length, 1);
  assert.equal(state.client.status, 'rejected-missing-key');
  assert.equal(state.result.outcome, 'failure');
  assert.match(state.trace[3].event, /400.*missing/i);
});

test('another lost response preserves explicit uncertainty even with one effect', () => {
  const state = observed({ retryResponse: 'lost' }).snapshot();
  assert.equal(state.effects.length, 1);
  assert.equal(state.client.status, 'unresolved');
  assert.equal(state.result.correctClientResult, null);
  assert.equal(state.result.outcome, 'unknown');
  assert.match(state.result.reasons.join(' '), /unresolved/i);
});

test('known duplicate effects dominate an unresolved client', () => {
  const state = observed({ retryKey: 'new', retryResponse: 'lost' }).snapshot();
  assert.equal(state.client.status, 'unresolved');
  assert.equal(state.result.outcome, 'failure');
  assert.equal(state.result.effectCount, 2);
});

test('a known budget breach fails even with one correct replay or a lost response', () => {
  for (const retryResponse of ['received', 'lost']) {
    const state = observed({ retryAfterMs: 101, deadlineMs: 100, retryResponse }).snapshot();
    assert.equal(state.effects.length, 1);
    assert.equal(state.result.withinBudget, false);
    assert.equal(state.result.outcome, 'failure');
    assert.ok(state.result.reasons.some((reason) => /deadline/i.test(reason)));
  }
});

test('the original inclusive deadline is never restarted by retry', () => {
  for (const [retryAfterMs, deadlineMs] of [[0, 1], [1, 1], [1000, 1000]]) {
    const state = observed({ retryAfterMs, deadlineMs }).snapshot();
    assert.equal(state.result.outcome, 'success');
    assert.equal(state.result.elapsedMs, retryAfterMs);
    assert.equal(state.result.deadlineMs, deadlineMs);
    assert.equal(state.result.withinBudget, true);
  }
});

test('all fixed retry combinations obey independent effect and client assertions', () => {
  for (const deduplication of ['atomic', 'none']) {
    for (const retryKey of ['same', 'new', 'missing']) {
      for (const retryPayload of ['same', 'changed']) {
        for (const retryResponse of ['received', 'lost']) {
          for (const retryAfterMs of [30, 101]) {
            const state = observed({
              deduplication, retryKey, retryPayload, retryResponse, retryAfterMs,
            }).snapshot();
            const duplicate = deduplication === 'none' || retryKey === 'new';
            const rejected = deduplication === 'atomic'
              && (retryKey === 'missing' || (retryKey === 'same' && retryPayload === 'changed'));
            const expected = duplicate || retryAfterMs > 100
              || (rejected && retryResponse === 'received')
              ? 'failure' : retryResponse === 'lost' ? 'unknown' : 'success';
            assert.equal(state.effects.length, duplicate ? 2 : 1);
            assert.equal(state.result.outcome, expected);
            assert.equal(state.result.postAttempts, 2);
            assert.ok(state.trace.length <= BOUNDS.maxTrace);
            assert.ok(state.effects.length <= BOUNDS.maxEffects);
          }
        }
      }
    }
  }
});

test('strict configuration rejects shape, type, enum and numeric violations atomically', () => {
  const invalid = [
    null, undefined, [], new Date(), 'atomic', {}, { ...DEFAULT_CONFIG, extra: true },
    { ...DEFAULT_CONFIG, deduplication: 'Atomic' },
    { ...DEFAULT_CONFIG, retryKey: 'real-key' },
    { ...DEFAULT_CONFIG, retryPayload: '<script>' },
    { ...DEFAULT_CONFIG, retryResponse: 'maybe' },
  ];
  for (const field of ['retryAfterMs', 'deadlineMs']) {
    for (const value of ['30', NaN, Infinity, -1, 0.5, 1001, null, true]) {
      invalid.push({ ...DEFAULT_CONFIG, [field]: value });
    }
  }
  invalid.push({ ...DEFAULT_CONFIG, deadlineMs: 0 });
  const accessor = { ...DEFAULT_CONFIG };
  Object.defineProperty(accessor, 'retryKey', { enumerable: true, get() { throw new Error('getter used'); } });
  invalid.push(accessor);
  const symbolField = { ...DEFAULT_CONFIG, [Symbol('extra')]: true };
  invalid.push(symbolField);
  const lesson = createLesson();
  for (const config of invalid) unchangedOnError(lesson, 'commitAndLoseResponse', config);
});

test('private configuration is detached from caller inputs and snapshots are deeply immutable', () => {
  const lesson = createLesson();
  const config = { ...DEFAULT_CONFIG };
  const state = lesson.commitAndLoseResponse(config);
  config.retryKey = 'new';
  assert.equal(lesson.snapshot().config.retryKey, 'same');
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.effects[0]));
  assert.throws(() => { state.effects[0].units = 999; }, TypeError);
  assert.throws(() => { state.config.retryKey = 'new'; }, TypeError);
  lesson.retry();
  assert.equal(lesson.snapshot().effects.length, 1);
});

test('out-of-order and repeated actions cannot change the current attempt', () => {
  const lesson = createLesson();
  unchangedOnError(lesson, 'retry');
  unchangedOnError(lesson, 'checkPrediction', 'success');
  unchangedOnError(lesson, 'newAttempt');
  lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG });
  unchangedOnError(lesson, 'commitAndLoseResponse', { ...DEFAULT_CONFIG });
  unchangedOnError(lesson, 'checkPrediction', 'unknown');
  unchangedOnError(lesson, 'newAttempt');
  lesson.retry();
  unchangedOnError(lesson, 'retry');
  unchangedOnError(lesson, 'commitAndLoseResponse', { ...DEFAULT_CONFIG });
  unchangedOnError(lesson, 'newAttempt');
  for (const prediction of ['', null, undefined, 'Success', '<script>', 1]) {
    unchangedOnError(lesson, 'checkPrediction', prediction);
  }
  lesson.checkPrediction('success');
  unchangedOnError(lesson, 'checkPrediction', 'success');
  unchangedOnError(lesson, 'retry');
});

test('commands reject extra arguments instead of silently ignoring them', () => {
  const lesson = createLesson();
  assert.throws(() => lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG }, 'extra'));
  lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG });
  assert.throws(() => lesson.retry({ retryKey: 'new' }));
  lesson.retry();
  assert.throws(() => lesson.checkPrediction('success', 'extra'));
  lesson.checkPrediction('success');
  assert.throws(() => lesson.newAttempt('extra'));
  assert.throws(() => lesson.reset('extra'));
  assert.throws(() => lesson.snapshot('extra'));
});

test('prediction scoring is separate from success, failure and unknown user impact', () => {
  for (const config of [{}, { retryKey: 'new' }, { retryResponse: 'lost' }]) {
    const lesson = observed(config);
    const before = lesson.snapshot();
    const selected = before.result.outcome === 'success' ? 'failure' : 'success';
    const after = lesson.checkPrediction(selected);
    assert.equal(after.phase, 'complete');
    assert.deepEqual(after.result, before.result);
    assert.deepEqual(after.effects, before.effects);
    assert.deepEqual(after.prediction, { selected, correct: false });
    assert.equal(after.history.length, 1);
    assert.deepEqual(after.history[0].result, before.result);
  }
});

test('new attempts retain complete immutable history and restore default controls', () => {
  const lesson = observed({ retryKey: 'new' });
  lesson.checkPrediction('failure');
  const first = lesson.snapshot().history[0];
  lesson.newAttempt();
  assert.equal(lesson.snapshot().phase, 'configure');
  assert.deepEqual(lesson.snapshot().config, DEFAULT_CONFIG);
  assert.equal(lesson.snapshot().effects.length, 0);
  lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG });
  lesson.retry();
  lesson.checkPrediction('success');
  assert.equal(lesson.snapshot().history.length, 2);
  assert.deepEqual(lesson.snapshot().history[0], first);
  assert.equal(lesson.snapshot().history[1].runId, 2);
  assert.ok(Object.isFrozen(lesson.snapshot().history[0].trace));
});

test('six attempts are retained without eviction and a seventh is blocked', () => {
  const lesson = createLesson();
  for (let index = 0; index < BOUNDS.maxRuns; index += 1) {
    if (index > 0) lesson.newAttempt();
    lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG });
    lesson.retry();
    lesson.checkPrediction('success');
  }
  assert.deepEqual(lesson.snapshot().history.map((row) => row.runId), [1, 2, 3, 4, 5, 6]);
  unchangedOnError(lesson, 'newAttempt');
  assert.equal(lesson.snapshot().history.length, 6);
});

test('explicit reset from every phase returns the exact baseline without history', () => {
  const baseline = createLesson().snapshot();
  for (const phase of ['configure', 'ambiguous', 'observed', 'complete']) {
    const lesson = createLesson();
    if (phase !== 'configure') lesson.commitAndLoseResponse({ ...DEFAULT_CONFIG, retryKey: 'new' });
    if (['observed', 'complete'].includes(phase)) lesson.retry();
    if (phase === 'complete') lesson.checkPrediction('failure');
    assert.deepEqual(lesson.reset(), baseline);
    assert.deepEqual(lesson.snapshot(), baseline);
  }
});

test('repeat executions produce identical traces, effects and results', () => {
  const config = { deduplication: 'none', retryPayload: 'changed', retryResponse: 'lost' };
  const first = observed(config);
  const second = observed(config);
  assert.deepEqual(first.snapshot(), second.snapshot());
  first.checkPrediction('failure');
  second.checkPrediction('failure');
  assert.deepEqual(first.snapshot(), second.snapshot());
});
