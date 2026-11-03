'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

test('saved Last-Event-ID resumes every ordered visible event within the original budget', () => {
  const result = model.assess(model.DEFAULTS);
  assert.equal(result.outcome, 'success');
  assert.deepEqual(result.visibleIds, [
    'evt-amber', 'evt-birch', 'evt-cedar', 'evt-delta', 'evt-elm', 'evt-fir',
  ]);
  assert.equal(result.streamOpen, true);
  assert.equal(result.recoveryMs, 100);
});

const input = (overrides = {}) => ({ ...model.DEFAULTS, ...overrides });
const check = (result, id) => result.checks.find((item) => item.id === id).status;
const finish = (state, overrides = {}) => model.resume(model.cutOver(model.start(state, input(overrides))));

test('fixture IDs are opaque and explicitly ordered, and defaults are deterministic', () => {
  const first = model.assess(input());
  assert.deepEqual(model.assess(input()), first);
  assert.deepEqual(model.EVENTS.map((event) => event.id), first.expectedIds);
  assert.equal(first.requestCursor, 'evt-cedar');
  assert.deepEqual(first.wireIds, ['evt-delta', 'evt-elm', 'evt-fir']);
  assert.equal(first.firstVisibleGapMs, 60);
  assert.equal(first.observedThroughMs, 100);
  assert.equal(first.checks.every((item) => item.status === 'PASS'), true);
  assert.equal(Object.isFrozen(first.trace[0]), true);
  assert.equal(Object.isFrozen(model.EVENTS[0]), true);
});

test('an open stream after retention expiry fails completeness, not stream establishment', () => {
  const result = model.assess(input({ scenario: 'expired' }));
  assert.equal(result.streamOpen, true);
  assert.equal(check(result, 'stream-open'), 'PASS');
  assert.equal(check(result, 'completeness'), 'FAIL');
  assert.deepEqual(result.missingIds, ['evt-delta']);
  assert.equal(check(result, 'order'), 'PASS');
  assert.equal(check(result, 'original-budget'), 'PASS');
  assert.equal(result.outcome, 'failure');
  assert.equal(result.impact, 'Interrupted synthetic transition');
});

test('tail-only subscription cannot hide missing IDs behind a healthy new connection', () => {
  const result = model.assess(input({ cursor: 'tail' }));
  assert.equal(result.requestCursor, null);
  assert.equal(result.streamOpen, true);
  assert.deepEqual(result.wireIds, ['evt-fir']);
  assert.deepEqual(result.missingIds, ['evt-delta', 'evt-elm']);
  assert.equal(result.outcome, 'failure');
});

test('an older cursor safely replays an ID only when visible effects are deduplicated', () => {
  const safe = model.assess(input({ cursor: 'stale', budgetMs: '120' }));
  assert.equal(safe.outcome, 'success');
  assert.equal(safe.requestCursor, 'evt-birch');
  assert.equal(safe.wireReplays, 1);
  assert.equal(safe.suppressedReplays, 1);
  assert.equal(safe.visibleDuplicates, 0);
  assert.equal(safe.firstVisibleGapMs, 80);
  assert.equal(safe.recoveryMs, 120);
  const unsafe = model.assess(input({ cursor: 'stale', replayPolicy: 'render-all', budgetMs: '120' }));
  assert.equal(unsafe.visibleDuplicates, 1);
  assert.equal(check(unsafe, 'duplicates'), 'FAIL');
  assert.equal(unsafe.outcome, 'failure');
});

test('wire duplicates remain measurable when suppressed and fail if rendered twice', () => {
  const safe = model.assess(input({ scenario: 'duplicate', budgetMs: '120' }));
  assert.equal(safe.outcome, 'success');
  assert.equal(safe.wireReplays, 1);
  assert.equal(safe.suppressedReplays, 1);
  assert.equal(safe.visibleIds.length, 6);
  const unsafe = model.assess(input({
    scenario: 'duplicate', replayPolicy: 'render-all', budgetMs: '120',
  }));
  assert.equal(unsafe.visibleIds.length, 7);
  assert.equal(unsafe.visibleDuplicates, 1);
  assert.equal(unsafe.outcome, 'failure');
});

test('complete but out-of-order visible events fail independently of missing IDs', () => {
  const result = model.assess(input({ scenario: 'reordered' }));
  assert.deepEqual(result.missingIds, []);
  assert.equal(check(result, 'completeness'), 'PASS');
  assert.equal(check(result, 'order'), 'FAIL');
  assert.equal(result.inversions, 1);
  assert.equal(result.outcome, 'failure');
});

test('the original budget is inclusive and never restarted when a new stream opens', () => {
  assert.equal(model.assess(input()).outcome, 'success');
  const over = model.assess(input({ reconnectMs: '41' }));
  assert.equal(over.streamOpen, true);
  assert.equal(over.firstVisibleGapMs, 61);
  assert.equal(over.recoveryMs, 101);
  assert.equal(check(over, 'original-budget'), 'FAIL');
  assert.equal(over.outcome, 'failure');
  const silence = model.assess(input({ reconnectMs: '81' }));
  assert.equal(silence.firstVisibleGapMs, 101);
  assert.equal(silence.outcome, 'failure');
  assert.equal(model.assess(input({ reconnectMs: '0', budgetMs: '60' })).outcome, 'success');
  assert.equal(model.assess(input({ reconnectMs: '2000', budgetMs: '2000' })).outcome, 'failure');
  const replayConsumesBudget = model.assess(input({ cursor: 'stale' }));
  assert.equal(replayConsumesBudget.suppressedReplays, 1);
  assert.equal(replayConsumesBudget.recoveryMs, 120);
  assert.equal(replayConsumesBudget.outcome, 'failure');
});

test('a partially observed prefix is unknown rather than successful or falsely missing', () => {
  const result = model.assess(input({ scenario: 'partial' }));
  assert.equal(result.streamOpen, true);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.impact, 'Unverified synthetic transition');
  assert.equal(result.recoveryMs, null);
  assert.equal(result.firstVisibleGapMs, 60);
  assert.equal(result.observedThroughMs, 80);
  assert.deepEqual(result.missingIds, []);
  assert.deepEqual(result.unobservedIds, ['evt-fir']);
  assert.equal(check(result, 'completeness'), 'UNKNOWN');
  assert.equal(check(result, 'original-budget'), 'UNKNOWN');
  assert.equal(check(result, 'observation'), 'UNKNOWN');
  const noSuffixObserved = model.assess(input({ cursor: 'tail', scenario: 'partial' }));
  assert.equal(noSuffixObserved.firstVisibleGapMs, null);
  assert.equal(noSuffixObserved.outcome, 'unknown');
  assert.deepEqual(noSuffixObserved.unobservedIds, ['evt-delta', 'evt-elm', 'evt-fir']);
});

test('observed duplicate and budget failures dominate incomplete tail uncertainty', () => {
  const duplicate = model.assess(input({
    cursor: 'stale', scenario: 'partial', replayPolicy: 'render-all', budgetMs: '200',
  }));
  assert.equal(check(duplicate, 'observation'), 'UNKNOWN');
  assert.equal(check(duplicate, 'duplicates'), 'FAIL');
  assert.equal(duplicate.outcome, 'failure');
  const late = model.assess(input({ scenario: 'partial', budgetMs: '79' }));
  assert.equal(late.recoveryMs, null);
  assert.equal(late.observedThroughMs, 80);
  assert.equal(check(late, 'original-budget'), 'FAIL');
  assert.equal(late.outcome, 'failure');
});

test('stream rejection is an explicit failure with no invented completion time', () => {
  const result = model.assess(input({ scenario: 'rejected' }));
  assert.equal(result.streamOpen, false);
  assert.equal(check(result, 'stream-open'), 'FAIL');
  assert.equal(result.recoveryMs, null);
  assert.equal(result.firstVisibleGapMs, null);
  assert.equal(result.outcome, 'failure');
  assert.deepEqual(result.visibleIds, ['evt-amber', 'evt-birch', 'evt-cedar']);
});

test('all declared combinations stay bounded and cannot convert unknown or failed checks to success', () => {
  for (const cursor of ['saved', 'stale', 'tail']) {
    for (const scenario of ['complete', 'expired', 'duplicate', 'reordered', 'partial', 'rejected']) {
      for (const replayPolicy of ['deduplicate', 'render-all']) {
        for (const reconnectMs of ['0', '40', '2000']) {
          for (const budgetMs of ['1', '100', '2000']) {
            const result = model.assess({ cursor, scenario, replayPolicy, reconnectMs, budgetMs });
            assert.ok(result.visibleIds.length >= 3 && result.visibleIds.length <= 8);
            assert.ok(result.wireIds.length <= 5);
            assert.ok(result.trace.length <= 10);
            assert.equal(result.checks.length, 6);
            if (result.outcome === 'success') {
              assert.equal(result.checks.every((item) => item.status === 'PASS'), true);
              assert.deepEqual(result.visibleIds, result.expectedIds);
              assert.ok(result.firstVisibleGapMs <= Number(budgetMs));
              assert.ok(result.recoveryMs <= Number(budgetMs));
            } else if (result.outcome === 'unknown') {
              assert.equal(result.checks.some((item) => item.status === 'FAIL'), false);
              assert.equal(result.checks.some((item) => item.status === 'UNKNOWN'), true);
            } else {
              assert.equal(result.checks.some((item) => item.status === 'FAIL'), true);
            }
          }
        }
      }
    }
  }
});

test('strict numeric validation rejects coercion, whitespace, exponents, signs and out-of-range values', () => {
  for (const field of ['reconnectMs', 'budgetMs']) {
    for (const value of ['', ' ', ' 40', '40 ', '+1', '-1', '-0', '00', '1.0', '1.5', '1e2', '0x10', 'NaN', 'Infinity', '2001', '9999999999999999999999999', true, 40, null, [], {}, '<svg>']) {
      assert.throws(() => model.assess(input({ [field]: value })), (error) =>
        error.name === 'InputError' && error.field === field);
    }
  }
  assert.throws(() => model.assess(input({ budgetMs: '0' })), /1-2000/);
  assert.equal(model.validateInput(input({ reconnectMs: '0', budgetMs: '2000' })).budgetMs, 2000);
});

test('configuration is exact plain data with declared enums, without accessors or inherited values', () => {
  for (const bad of [null, [], 'input', 1, {}, { ...input(), extra: '' }, Object.create(input()), Object.assign(Object.create(null), input())]) {
    assert.throws(() => model.assess(bad), /exactly the five/);
  }
  const missing = input();
  delete missing.cursor;
  assert.throws(() => model.assess(missing), /exactly the five/);
  const symbol = input();
  symbol[Symbol('extra')] = '';
  assert.throws(() => model.assess(symbol), /exactly the five/);
  for (const field of ['cursor', 'scenario', 'replayPolicy']) {
    for (const value of ['unknown', '__proto__', '<img>', 'saved ', null, 0]) {
      assert.throws(() => model.assess(input({ [field]: value })), (error) => error.field === field);
    }
  }
  const accessor = input();
  Object.defineProperty(accessor, 'cursor', { enumerable: true, get() { throw new Error('Accessor must not run'); } });
  assert.throws(() => model.assess(accessor), /not a coerced value/);
});

test('phase guards reject invalid actions, fabricated states and double completion', () => {
  const idle = model.create();
  assert.throws(() => model.cutOver(idle), /requires streaming/);
  assert.throws(() => model.resume(idle), /requires disconnected/);
  assert.throws(() => model.another(idle), /requires complete/);
  assert.throws(() => model.start({ ...idle }, input()), /authentic rehearsal state/);
  assert.throws(() => model.reset(null), /authentic rehearsal state/);
  assert.throws(() => model.start(idle, input({ budgetMs: '0' })), /1-2000/);
  assert.deepEqual(model.totals(idle), { attempted: 0, success: 0, failure: 0, unknown: 0 });
  const raw = input();
  const started = model.start(idle, raw);
  raw.scenario = 'expired';
  assert.equal(started.input.scenario, 'complete');
  assert.throws(() => { started.input.scenario = 'expired'; }, TypeError);
  assert.throws(() => { started.phase = 'complete'; }, TypeError);
  assert.throws(() => model.start(started, input()), /requires idle/);
  assert.throws(() => model.resume(started), /requires disconnected/);
  const cutover = model.cutOver(started);
  assert.throws(() => model.cutOver(cutover), /requires streaming/);
  const complete = model.resume(cutover);
  assert.equal(complete.result.outcome, 'success');
  assert.throws(() => model.resume(complete), /requires disconnected/);
  assert.equal(complete.history.length, 1);
  assert.equal(Object.isFrozen(complete.history[0].result), true);
});

test('all eight results are retained with attribution, and the ninth is blocked without pruning', () => {
  let state = model.create();
  const scenarios = ['complete', 'expired', 'partial', 'complete', 'expired', 'partial', 'complete', 'expired'];
  for (const [index, scenario] of scenarios.entries()) {
    state = finish(state, { scenario });
    assert.equal(state.history.length, index + 1);
    assert.equal(state.history[index].attempt, index + 1);
    if (index < 7) {
      const previousHistory = state.history;
      state = model.another(state);
      assert.equal(state.phase, 'idle');
      assert.equal(state.result, null);
      assert.deepEqual(state.trace, []);
      assert.equal(state.history, previousHistory);
    }
  }
  assert.deepEqual(model.totals(state), { attempted: 8, success: 3, failure: 3, unknown: 2 });
  assert.throws(() => model.another(state), /No history was removed/);
  assert.equal(state.history.length, 8);
  const reset = model.reset(state);
  assert.equal(reset.phase, 'idle');
  assert.deepEqual(reset.history, []);
  assert.deepEqual(reset.trace, []);
  assert.equal(reset.input, null);
  assert.equal(reset.result, null);
  assert.equal(state.history.length, 8);
  assert.equal(finish(reset).result.outcome, 'success');
});
