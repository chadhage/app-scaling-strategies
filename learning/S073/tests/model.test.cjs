'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('..\\model.js');
const input = (overrides = {}) => ({ ...lesson.DEFAULTS, ...overrides });
const observed = (overrides = {}) => lesson.run(lesson.configure(lesson.create(), input(overrides)));

test('all 162 finite inputs are deterministic and success requires exact state within budget', () => {
  let tested = 0;
  for (const cache of lesson.OPTIONS.cache) {
    for (const recovery of lesson.OPTIONS.recovery) {
      for (const durable of lesson.OPTIONS.durable) {
        for (const budgetMs of lesson.OPTIONS.budgetMs) {
          const config = { cache, recovery, durable, budgetMs };
          const result = lesson.evaluate(config);
          assert.deepEqual(result, lesson.evaluate(config));
          assert.ok(lesson.CLASSIFICATIONS.includes(result.classification));
          const expected = cache === 'available' ? 'SUCCESS' : cache === 'unknown' ? 'UNKNOWN'
            : recovery !== 'durable' ? 'FAILURE' : budgetMs < 110 ? 'FAILURE'
              : durable === 'correct' ? 'SUCCESS' : durable === 'unknown' ? 'UNKNOWN' : 'FAILURE';
          assert.equal(result.classification, expected, JSON.stringify(config));
          if (result.classification === 'SUCCESS') {
            assert.deepEqual(result.profile, lesson.REQUIRED);
            assert.equal(result.requiredStateValid, true);
            assert.ok(result.elapsedMs <= budgetMs);
          }
          if (result.profile && Object.keys(result.profile).length === 0) {
            assert.equal(result.classification, 'FAILURE');
            assert.equal(result.requiredStateValid, false);
          }
          assert.equal(result.trace.at(-1).source, 'assertion');
          tested += 1;
        }
      }
    }
  }
  assert.equal(tested, 162);
});

test('stale, wrong, empty and unavailable durable receipts fail with specific evidence', () => {
  const reasons = { stale: 'STALE_PROFILE', wrong: 'WRONG_PROFILE', empty: 'EMPTY_PROFILE', unavailable: 'DURABLE_UNAVAILABLE' };
  for (const [durable, reason] of Object.entries(reasons)) {
    const result = lesson.evaluate(input({ durable }));
    assert.equal(result.classification, 'FAILURE');
    assert.equal(result.reason, reason);
    assert.equal(result.requiredStateValid, false);
    assert.equal(result.elapsedMs, 110);
    assert.deepEqual(result.trace.map((event) => event.source), ['cache', 'durable recovery', 'assertion']);
  }
});

test('profile verification includes all declared fields, not just an ID or nonempty object', () => {
  assert.deepEqual(lesson.evaluate(input()).profile, {
    id: 'synthetic-profile-073', revision: 7, label: 'Sample learner 073',
    preferences: { theme: 'dark' }, savedItems: ['synthetic-item-1', 'synthetic-item-2'],
  });
  assert.equal(lesson.evaluate(input({ durable: 'stale' })).profile.id, lesson.REQUIRED.id);
  assert.equal(lesson.evaluate(input({ durable: 'stale' })).requiredStateValid, false);
  assert.equal(lesson.evaluate(input({ durable: 'wrong' })).profile.revision, 7);
  assert.equal(lesson.evaluate(input({ durable: 'wrong' })).requiredStateValid, false);
});

test('known missed budget is failure despite unknown returned-state evidence', () => {
  const result = lesson.evaluate(input({ durable: 'unknown', budgetMs: 80 }));
  assert.equal(result.classification, 'FAILURE');
  assert.equal(result.reason, 'BUDGET_EXCEEDED');
  assert.equal(result.requiredStateValid, null);
  assert.equal(result.elapsedMs, 110);
  assert.equal(result.profile, null);
});

test('unknown cache does not invent a durable receipt and available cache does not use a fallback', () => {
  for (const recovery of lesson.OPTIONS.recovery) {
    const missing = lesson.evaluate(input({ cache: 'unknown', recovery }));
    assert.equal(missing.classification, 'UNKNOWN');
    assert.equal(missing.elapsedMs, null);
    assert.equal(missing.profile, null);
    assert.equal(missing.trace.some((event) => event.source === 'durable recovery'), false);
    const baseline = lesson.evaluate(input({ cache: 'available', recovery, durable: 'empty', budgetMs: 80 }));
    assert.equal(baseline.classification, 'SUCCESS');
    assert.equal(baseline.elapsedMs, 10);
    assert.deepEqual(baseline.profile, lesson.REQUIRED);
    assert.equal(baseline.trace.length, 2);
  }
});

test('strict config guards reject missing, extra, coerced, unbounded and accessor input', () => {
  const invalid = [
    null, undefined, [], {}, 'lost', 1,
    { ...input(), extra: true }, { ...input(), cache: 'LOST' }, { ...input(), recovery: '__proto__' },
    { ...input(), durable: 'fake' }, { ...input(), budgetMs: '110' },
    ...[NaN, Infinity, -1, 0, 110.5, 111, 1000000].map((budgetMs) => input({ budgetMs })),
    Object.assign(Object.create({ inherited: true }), input()),
    { ...input(), [Symbol('extra')]: true },
  ];
  for (const config of invalid) assert.throws(() => lesson.evaluate(config), RangeError);
  let getterCalled = false;
  const accessor = input();
  Object.defineProperty(accessor, 'cache', { get() { getterCalled = true; return 'lost'; } });
  assert.throws(() => lesson.evaluate(accessor), RangeError);
  assert.equal(getterCalled, false);
  assert.deepEqual(lesson.validateConfig(Object.assign(Object.create(null), input())), lesson.DEFAULTS);
});

test('initial state has no recovery proof, no result and no counted success', () => {
  const state = lesson.create();
  assert.equal(state.phase, 'configuring');
  assert.equal(state.current, null);
  assert.deepEqual(state.history, []);
  assert.deepEqual(lesson.summary(state), { total: 0, SUCCESS: 0, FAILURE: 0, UNKNOWN: 0 });
});

test('forged or serialized state cannot enter any transition', () => {
  for (const fake of [null, {}, JSON.parse(JSON.stringify(lesson.create()))]) {
    for (const action of [
      () => lesson.configure(fake, input()), () => lesson.run(fake), () => lesson.check(fake, 'SUCCESS'),
      () => lesson.next(fake), () => lesson.reset(fake), () => lesson.summary(fake),
    ]) assert.throws(action, /current lesson state/);
  }
});

test('phase guards prevent pre-run check, repeated run and configuration after observation', () => {
  const ready = lesson.create();
  assert.throws(() => lesson.check(ready, 'SUCCESS'), /observed phase/);
  assert.throws(() => lesson.next(ready), /checked phase/);
  const state = lesson.run(ready);
  assert.equal(state.history.length, 1, 'Unchecked attempts are retained immediately');
  assert.throws(() => lesson.run(state), /configuring phase/);
  assert.throws(() => lesson.configure(state, input()), /configuring phase/);
  assert.throws(() => lesson.next(state), /checked phase/);
  assert.equal(state.history[0].predictionCorrect, null);
});

test('prediction checking is strict, one-shot, and never changes the measured impact', () => {
  const state = observed({ recovery: 'empty' });
  for (const prediction of ['', 'success', ' FAILURE ', null, undefined]) {
    assert.throws(() => lesson.check(state, prediction), /Choose SUCCESS, FAILURE or UNKNOWN/);
  }
  const wrong = lesson.check(state, 'SUCCESS');
  assert.equal(wrong.current.predictionCorrect, false);
  assert.equal(wrong.current.result, state.current.result);
  assert.equal(wrong.current.result.classification, 'FAILURE');
  assert.throws(() => lesson.check(wrong, 'FAILURE'), /observed phase/);
  assert.deepEqual(lesson.summary(wrong), { total: 1, SUCCESS: 0, FAILURE: 1, UNKNOWN: 0 });
});

test('new attempts retain exact earlier results and reset only current controls', () => {
  const checked = lesson.check(observed({ durable: 'unknown', budgetMs: 110 }), 'UNKNOWN');
  const ready = lesson.next(checked);
  assert.equal(ready.phase, 'configuring');
  assert.equal(ready.current, null);
  assert.equal(ready.history, checked.history);
  assert.equal(ready.history[0].result.classification, 'UNKNOWN');
  assert.deepEqual(ready.config, lesson.DEFAULTS);
  const later = lesson.run(ready);
  assert.equal(later.history[0], checked.history[0]);
  assert.equal(later.current.attempt, 2);
});

test('six bounded attempts include failures and unknowns without overwriting history', () => {
  let state = lesson.create();
  const previous = [];
  for (let i = 0; i < 6; i += 1) {
    const durable = ['correct', 'unknown', 'empty'][i % 3];
    state = lesson.run(lesson.configure(state, input({ durable })));
    state = lesson.check(state, state.current.result.classification);
    previous.push(state.current);
    if (i < 5) state = lesson.next(state);
  }
  assert.deepEqual(state.history, previous);
  assert.throws(() => lesson.next(state), /Six attempts are retained/);
  assert.deepEqual(lesson.summary(state), { total: 6, SUCCESS: 2, FAILURE: 2, UNKNOWN: 2 });
  const reset = lesson.reset(state);
  assert.equal(reset.history.length, 0);
  assert.equal(reset.current, null);
  assert.deepEqual(reset.config, lesson.DEFAULTS);
  assert.equal(state.history.length, 6, 'Reset never mutates a retained prior state');
});

test('deep freezing prevents control, fixture, returned profile and history tampering', () => {
  const state = observed();
  for (const action of [
    () => { state.phase = 'checked'; },
    () => { state.config.cache = 'available'; },
    () => { state.current.result.profile.savedItems.pop(); },
    () => { lesson.REQUIRED.preferences.theme = 'light'; },
    () => { state.history.push(state.current); },
    () => { state.current.result.trace[0].message = 'forged'; },
  ]) assert.throws(action, TypeError);
});
