'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('../fixtures.js');
const { createLesson } = require('../model.js');
const defaults = () => ({ ...fixtures.defaults });
function staged(settings = {}) {
  const lesson = createLesson();
  assert.equal(lesson.begin({ ...defaults(), ...settings }).phase, 'staged');
  return lesson;
}
function decided(settings = {}) {
  const lesson = staged(settings);
  assert.equal(lesson.verify().phase, 'verified');
  assert.equal(lesson.promote().phase, 'decided');
  return lesson;
}
const result = (settings) => decided(settings).snapshot().current;

test('loadable API and deterministic synthetic fixture begin with no promotion evidence', () => {
  const lesson = createLesson();
  for (const name of ['snapshot', 'begin', 'verify', 'promote', 'predict', 'next', 'reset']) {
    assert.equal(typeof lesson[name], 'function', name);
  }
  assert.deepEqual(lesson.snapshot(), {
    phase: 'idle', current: null, history: [], maxAttempts: 6,
    counts: { success: 0, failure: 0, unknown: 0 },
  });
  assert.equal(fixtures.committed.length, 6);
  assert.equal(Object.isFrozen(fixtures.committed[0]), true);
});

test('staging snapshots a declared boundary and exact restored receipts without activating a writer', () => {
  const state = staged().snapshot();
  assert.equal(state.current.declaredBoundary, 6);
  assert.deepEqual(state.current.receipts, fixtures.committed);
  assert.equal(state.current.promoted, false);
  assert.equal(state.current.outcome, null);
  assert.equal(state.history.length, 0);
});

test('complete receipts and exclusive current grant promote six effects to exactly one writer', () => {
  const current = result();
  assert.equal(current.verification.synchronization.status, 'PASS');
  assert.equal(current.verification.ownership.status, 'PASS');
  assert.equal(current.outcome, 'PASS');
  assert.equal(current.promoted, true);
  assert.equal(current.activatedWriter, fixtures.candidate);
  assert.equal(current.writerCount, 1);
  assert.equal(current.preservedEffects, 6);
  assert.deepEqual(current.promotedEffects, fixtures.committed);
});

test('lagging restoration fails with explicit missing committed boundaries', () => {
  const current = result({ restoration: 'behind' });
  assert.equal(current.outcome, 'FAIL');
  assert.deepEqual(current.verification.synchronization.missing, [5, 6]);
  assert.equal(current.verification.synchronization.contiguousThrough, 4);
  assert.equal(current.promoted, false);
  assert.equal(current.activatedWriter, null);
  assert.deepEqual(current.promotedEffects, []);
});

test('maximum receipt 6 does not conceal an interior committed-data gap at 4', () => {
  const current = result({ restoration: 'gap' });
  const sync = current.verification.synchronization;
  assert.equal(sync.maxReceipt, 6);
  assert.equal(sync.contiguousThrough, 3);
  assert.deepEqual(sync.missing, [4]);
  assert.equal(current.outcome, 'FAIL');
  assert.equal(current.promoted, false);
});

test('an undeclared boundary cannot authorize promotion even with complete restoration', () => {
  const current = result({ boundary: 'missing' });
  assert.equal(current.declaredBoundary, null);
  assert.equal(current.outcome, 'FAIL');
  assert.match(current.verification.synchronization.reason, /declared committed boundary/);
});

test('a stale declaration cannot hide acknowledged effects beyond its boundary', () => {
  const current = result({ boundary: 'stale' });
  assert.equal(current.declaredBoundary, 4);
  assert.equal(current.outcome, 'FAIL');
  assert.match(current.verification.synchronization.reason, /authoritative boundary 6/);
});

test('unverified restoration yields UNKNOWN, not a successful zero-gap observation', () => {
  const current = result({ restoration: 'unverified' });
  assert.equal(current.outcome, 'UNKNOWN');
  assert.equal(current.verification.synchronization.missing, null);
  assert.equal(current.verification.synchronization.observedEffects, null);
  assert.equal(current.promoted, false);
  assert.equal(current.preservedEffects, null);
});

test('a still-active previous writer rejects promotion without fabricating a fence', () => {
  const current = result({ ownership: 'old-active' });
  assert.equal(current.verification.ownership.status, 'FAIL');
  assert.equal(current.verification.ownership.potentialWriters, 2);
  assert.equal(current.verification.ownership.previousFenced, false);
  assert.equal(current.outcome, 'FAIL');
  assert.equal(current.promoted, false);
});

test('stale epochs and grants for a different candidate are invalid ownership', () => {
  for (const ownership of ['stale-grant', 'wrong-target']) {
    const current = result({ ownership });
    assert.equal(current.verification.ownership.status, 'FAIL');
    assert.equal(current.outcome, 'FAIL');
    assert.equal(current.activatedWriter, null);
    assert.equal(current.promoted, false);
  }
});

test('unknown ownership cannot authorize a writer or report completed promotion', () => {
  const current = result({ ownership: 'unverified' });
  assert.equal(current.verification.ownership.status, 'UNKNOWN');
  assert.equal(current.verification.ownership.potentialWriters, null);
  assert.equal(current.writerCount, null);
  assert.equal(current.outcome, 'UNKNOWN');
  assert.equal(current.promoted, false);
});

test('known failing synchronization or ownership dominates unavailable evidence', () => {
  assert.equal(result({ boundary: 'missing', restoration: 'unverified' }).outcome, 'FAIL');
  assert.equal(result({ restoration: 'behind', ownership: 'unverified' }).outcome, 'FAIL');
  assert.equal(result({ restoration: 'unverified', ownership: 'old-active' }).outcome, 'FAIL');
});

test('strict config and prediction guards reject malformed inputs without mutation', () => {
  const lesson = createLesson();
  const initial = lesson.snapshot();
  const accessor = { ...defaults() };
  Object.defineProperty(accessor, 'boundary', { enumerable: true, get() { throw new Error('must not invoke'); } });
  const symbolField = { ...defaults(), [Symbol('extra')]: true };
  for (const input of [
    null, undefined, [], 6, 'current', {}, { ...defaults(), extra: true },
    { ...defaults(), boundary: 6 }, { ...defaults(), boundary: 'CURRENT' },
    { ...defaults(), restoration: 'complete ' }, { ...defaults(), ownership: '__proto__' },
    Object.create(defaults()), Object.assign(Object.create(null), defaults()), accessor, symbolField,
  ]) {
    assert.throws(() => lesson.begin(input), /Invalid configuration/);
    assert.deepEqual(lesson.snapshot(), initial);
  }
  const complete = decided();
  const before = complete.snapshot();
  for (const prediction of ['', 'pass', null, 1, {}, 'PASS ']) {
    assert.throws(() => complete.predict(prediction), /Invalid prediction/);
    assert.deepEqual(complete.snapshot(), before);
  }
});

test('ordered lifecycle, immutable detached snapshots and local reset preserve guards', () => {
  const lesson = createLesson();
  for (const name of ['verify', 'promote', 'next']) assert.throws(() => lesson[name](), /Invalid phase/);
  assert.throws(() => lesson.predict('PASS'), /Invalid phase/);
  lesson.begin(defaults());
  const stagedState = lesson.snapshot();
  assert.throws(() => lesson.begin(defaults()), /Invalid phase/);
  assert.throws(() => lesson.promote(), /Invalid phase/);
  assert.throws(() => { stagedState.current.receipts[0].value = -1; }, TypeError);
  lesson.verify();
  assert.equal(stagedState.phase, 'staged');
  assert.equal(stagedState.current.verification, null);
  assert.throws(() => lesson.verify(), /Invalid phase/);
  lesson.promote();
  assert.throws(() => lesson.promote(), /Invalid phase/);
  lesson.predict('PASS');
  assert.throws(() => lesson.predict('PASS'), /Invalid phase/);
  lesson.next();
  assert.equal(lesson.snapshot().history.length, 1);
  assert.equal(lesson.reset().history.length, 0);
  assert.equal(lesson.snapshot().phase, 'idle');
});

test('learning check does not rewrite failure or unknown; six attempts retain full immutable evidence', () => {
  const lesson = createLesson();
  const scenarios = [
    [{}, 'FAIL', 'PASS'],
    [{ restoration: 'behind' }, 'FAIL', 'FAIL'],
    [{ restoration: 'unverified' }, 'UNKNOWN', 'UNKNOWN'],
    [{ ownership: 'old-active' }, 'FAIL', 'FAIL'],
    [{ ownership: 'unverified' }, 'PASS', 'UNKNOWN'],
    [{ restoration: 'gap' }, 'FAIL', 'FAIL'],
  ];
  scenarios.forEach(([settings, prediction, outcome], index) => {
    lesson.begin({ ...defaults(), ...settings });
    lesson.verify();
    lesson.promote();
    const checked = lesson.predict(prediction);
    assert.equal(checked.phase, 'checked');
    assert.equal(checked.current.outcome, outcome);
    assert.equal(checked.current.learning, prediction === outcome ? 'PASS' : 'FAIL');
    assert.equal(checked.history.length, index + 1);
    assert.deepEqual(checked.history[index], checked.current);
    assert.equal(checked.history[index].trace.length, 4);
    lesson.next();
  });
  assert.deepEqual(lesson.snapshot().counts, { success: 1, failure: 3, unknown: 2 });
  const retained = lesson.snapshot();
  assert.throws(() => lesson.begin(defaults()), /History limit/);
  assert.deepEqual(lesson.snapshot(), retained);
  assert.equal(lesson.reset().history.length, 0);
});

test('all 60 fixed combinations obey both data and ownership gates deterministically', () => {
  for (const boundary of Object.keys(fixtures.boundaries)) {
    for (const restoration of Object.keys(fixtures.restorations)) {
      for (const ownership of Object.keys(fixtures.ownership)) {
        const config = { boundary, restoration, ownership };
        const failed = boundary !== 'current' || ['behind', 'gap'].includes(restoration)
          || ['old-active', 'stale-grant', 'wrong-target'].includes(ownership);
        const unknown = restoration === 'unverified' || ownership === 'unverified';
        const expected = failed ? 'FAIL' : unknown ? 'UNKNOWN' : 'PASS';
        const current = result(config);
        assert.equal(current.outcome, expected, JSON.stringify(config));
        assert.equal(current.promoted, expected === 'PASS');
        assert.equal(current.promotedEffects.length, expected === 'PASS' ? 6 : 0);
        assert.deepEqual(current, result(config));
      }
    }
  }
});
