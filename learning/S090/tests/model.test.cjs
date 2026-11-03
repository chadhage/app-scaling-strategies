'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson, FIXTURES, LIMITS } = require('..\\model.js');
const begin = (fixture = 'all-dependencies') => {
  const lesson = createLesson();
  lesson.begin(fixture);
  return lesson;
};
const attempt = (lesson) => lesson.act('attempt-retirement').current.lastAttempt;
const unchangedError = (lesson, operation, code) => {
  const before = lesson.snapshot();
  assert.throws(operation, (error) => error.code === code);
  assert.deepEqual(lesson.snapshot(), before);
};
const resolve = (lesson) => {
  for (const action of ['stop-admission', 'drain-users', 'finish-work', 'transfer-ownership',
    'advance-tick', 'advance-tick']) lesson.act(action);
};

test('loadable module has the complete API, explicit idle state and fixed bounds', () => {
  const lesson = createLesson();
  for (const name of ['snapshot', 'begin', 'act', 'checkPrediction', 'newRehearsal', 'reset']) {
    assert.equal(typeof lesson[name], 'function');
  }
  assert.equal(lesson.snapshot().phase, 'idle');
  assert.equal(lesson.snapshot().current, null);
  assert.deepEqual(lesson.snapshot().history, []);
  assert.deepEqual(lesson.snapshot().totals, { attempts: 0, success: 0, failure: 0, unknown: 0 });
  assert.deepEqual(LIMITS, { rehearsals: 4, attempts: 6, trace: 14, ticks: 2 });
});

test('named fixtures initialize only their declared observations and lifecycle', () => {
  for (const [name, values] of Object.entries(FIXTURES)) {
    const current = begin(name).snapshot().current;
    assert.deepEqual(current.inventory, values, name);
    assert.equal(current.lifecycle, name === 'all-dependencies' || name === 'traffic-only' ? 'ACTIVE'
      : ['retention-only', 'ready'].includes(name) ? 'RETAINED' : 'DRAINING', name);
    assert.equal(current.oldCapacity, 'AVAILABLE');
    assert.equal(current.trace.length, 1);
    assert.equal(current.lastAttempt, null);
  }
});

test('early retirement fails safely with every dependency unchanged', () => {
  const lesson = begin();
  const before = lesson.snapshot().current;
  const result = attempt(lesson);
  assert.equal(result.outcome, 'FAILURE');
  assert.equal(result.decision, 'REJECTED');
  assert.equal(result.verifier, 'PASS');
  assert.deepEqual(result.blockers, ['new-admissions', 'pinned-users', 'pending-work', 'state-ownership', 'rollback-retention']);
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(lesson.snapshot().current.inventory, before.inventory);
  assert.equal(lesson.snapshot().current.lifecycle, 'ACTIVE');
  assert.equal(lesson.snapshot().current.oldCapacity, 'AVAILABLE');
  assert.equal(lesson.snapshot().current.migrationCertified, false);
  assert.deepEqual(lesson.snapshot().totals, { attempts: 1, success: 0, failure: 1, unknown: 0 });
});

for (const [fixture, blocker] of Object.entries({
  'traffic-only': 'new-admissions', 'users-only': 'pinned-users', 'work-only': 'pending-work',
  'ownership-only': 'state-ownership', 'retention-only': 'rollback-retention',
})) {
  test(`${fixture} independently rejects retirement`, () => {
    const lesson = begin(fixture);
    const before = lesson.snapshot().current.inventory;
    const result = attempt(lesson);
    assert.equal(result.outcome, 'FAILURE');
    assert.deepEqual(result.blockers, [blocker]);
    assert.equal(result.decision, 'REJECTED');
    assert.deepEqual(lesson.snapshot().current.inventory, before);
    assert.equal(lesson.snapshot().current.oldCapacity, 'AVAILABLE');
  });
}

test('missing inventory is UNKNOWN, not zero or permission to retire', () => {
  const lesson = begin('unobserved');
  const result = attempt(lesson);
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.decision, 'HELD_UNVERIFIED');
  assert.equal(result.verifier, 'PASS');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.unknown.length, 5);
  assert.equal(lesson.snapshot().current.oldCapacity, 'AVAILABLE');
  assert.deepEqual(lesson.snapshot().totals, { attempts: 1, success: 0, failure: 0, unknown: 1 });
});

test('a known work blocker dominates unknown observations without concealing them', () => {
  const result = attempt(begin('mixed-unknown'));
  assert.equal(result.outcome, 'FAILURE');
  assert.deepEqual(result.blockers, ['pending-work']);
  assert.deepEqual(result.unknown, ['new-admissions', 'pinned-users', 'state-ownership', 'rollback-retention']);
  assert.equal(result.decision, 'REJECTED');
});

test('ordered drain and exact retention expiry permit a teaching-only retirement and retain failures', () => {
  const lesson = begin();
  attempt(lesson);
  for (const action of ['stop-admission', 'drain-users', 'finish-work', 'transfer-ownership']) lesson.act(action);
  assert.equal(lesson.snapshot().current.lifecycle, 'RETAINED');
  assert.deepEqual(attempt(lesson).blockers, ['rollback-retention']);
  lesson.act('advance-tick');
  assert.equal(attempt(lesson).outcome, 'FAILURE');
  lesson.act('advance-tick');
  const result = attempt(lesson);
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.decision, 'SIMULATED_RETIRED');
  assert.equal(result.verifier, 'PASS');
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.unknown, []);
  assert.equal(lesson.snapshot().current.lifecycle, 'RETIRED');
  assert.equal(lesson.snapshot().current.oldCapacity, 'RETIRED_IN_TRACE');
  assert.equal(lesson.snapshot().current.migrationCertified, false);
  assert.deepEqual(lesson.snapshot().totals, { attempts: 4, success: 1, failure: 3, unknown: 0 });
});

test('retention deadline equality is required; desired drain does not shorten it', () => {
  const lesson = begin('retention-only');
  assert.equal(attempt(lesson).outcome, 'FAILURE');
  lesson.act('advance-tick');
  assert.equal(lesson.snapshot().current.tick, 1);
  assert.equal(attempt(lesson).outcome, 'FAILURE');
  lesson.act('advance-tick');
  assert.equal(lesson.snapshot().current.tick, 2);
  assert.equal(attempt(lesson).outcome, 'SUCCESS');
});

test('out-of-order, repeated and unobserved resolution commands are atomic state errors', () => {
  const lesson = begin();
  unchangedError(lesson, () => lesson.act('drain-users'), 'ERR_STATE');
  unchangedError(lesson, () => lesson.act('transfer-ownership'), 'ERR_STATE');
  lesson.act('stop-admission');
  unchangedError(lesson, () => lesson.act('stop-admission'), 'ERR_STATE');
  lesson.act('drain-users');
  unchangedError(lesson, () => lesson.act('drain-users'), 'ERR_STATE');
  const unknown = begin('unobserved');
  for (const action of ['stop-admission', 'drain-users', 'finish-work', 'transfer-ownership', 'advance-tick']) {
    unchangedError(unknown, () => unknown.act(action), 'ERR_STATE');
  }
  unchangedError(begin('ready'), () => begin('ready').act('advance-tick'), 'ERR_STATE');
});

test('unknown observations resolve only through the named synthetic observation', () => {
  const lesson = begin('mixed-unknown');
  assert.equal(attempt(lesson).outcome, 'FAILURE');
  lesson.act('observe-inventory');
  assert.deepEqual(lesson.snapshot().current.inventory, { newAdmissions: 0, users: 0, work: 1, stateOwners: 0, retentionUntil: 0 });
  assert.equal(attempt(lesson).outcome, 'FAILURE');
  lesson.act('finish-work');
  assert.equal(attempt(lesson).outcome, 'SUCCESS');
  const unobserved = begin('unobserved');
  attempt(unobserved);
  unobserved.act('observe-inventory');
  assert.equal(attempt(unobserved).outcome, 'SUCCESS');
  assert.deepEqual(unobserved.snapshot().totals, { attempts: 2, success: 1, failure: 0, unknown: 1 });
});

test('input allowlists reject invalid values, types and prototype keys without coercion', () => {
  for (const value of ['', 'not-a-fixture', '__proto__', 'constructor', null, 1, {}, ['ready']]) {
    const lesson = createLesson();
    unchangedError(lesson, () => lesson.begin(value), 'ERR_INPUT');
  }
  for (const value of ['', 'retire-real-resource', '__proto__', null, 0, {}, ['attempt-retirement']]) {
    const lesson = begin();
    unchangedError(lesson, () => lesson.act(value), 'ERR_INPUT');
  }
  const lesson = begin();
  attempt(lesson);
  for (const value of ['', 'PASS', '__proto__', null, true, ['FAILURE']]) {
    unchangedError(lesson, () => lesson.checkPrediction(value), 'ERR_INPUT');
  }
});

test('idle, duplicate begin, unattempted next and retired commands reject without mutation', () => {
  const idle = createLesson();
  unchangedError(idle, () => idle.act('attempt-retirement'), 'ERR_STATE');
  unchangedError(idle, () => idle.checkPrediction('SUCCESS'), 'ERR_STATE');
  unchangedError(idle, () => idle.newRehearsal(), 'ERR_STATE');
  const lesson = begin();
  unchangedError(lesson, () => lesson.begin('ready'), 'ERR_STATE');
  unchangedError(lesson, () => lesson.newRehearsal(), 'ERR_STATE');
  const retired = begin('ready');
  attempt(retired);
  for (const action of ['attempt-retirement', 'stop-admission', 'observe-inventory']) {
    unchangedError(retired, () => retired.act(action), 'ERR_STATE');
  }
});

test('prediction uses the measured attempt and never alters denominators', () => {
  const lesson = begin();
  unchangedError(lesson, () => lesson.checkPrediction('SUCCESS'), 'ERR_STATE');
  attempt(lesson);
  lesson.checkPrediction('SUCCESS');
  assert.deepEqual(lesson.snapshot().current.prediction, { attempt: 1, expected: 'SUCCESS', observed: 'FAILURE', correct: false });
  assert.deepEqual(lesson.snapshot().totals, { attempts: 1, success: 0, failure: 1, unknown: 0 });
  unchangedError(lesson, () => lesson.checkPrediction('FAILURE'), 'ERR_STATE');
  attempt(lesson);
  lesson.checkPrediction('FAILURE');
  assert.equal(lesson.snapshot().current.prediction.correct, true);
  const unknown = begin('unobserved');
  attempt(unknown);
  unknown.checkPrediction('UNKNOWN');
  assert.equal(unknown.snapshot().current.prediction.correct, true);
});

test('new rehearsals preserve full failed/unknown/success history without eviction', () => {
  const lesson = begin();
  attempt(lesson);
  const failed = lesson.snapshot().current;
  lesson.newRehearsal();
  assert.deepEqual(lesson.snapshot().history, [failed]);
  lesson.begin('unobserved');
  attempt(lesson);
  const unknown = lesson.snapshot().current;
  lesson.newRehearsal();
  lesson.begin('ready');
  attempt(lesson);
  lesson.newRehearsal();
  assert.deepEqual(lesson.snapshot().history.slice(0, 2), [failed, unknown]);
  assert.equal(lesson.snapshot().history[2].lastAttempt.outcome, 'SUCCESS');
  assert.deepEqual(lesson.snapshot().totals, { attempts: 3, success: 1, failure: 1, unknown: 1 });
  assert.equal(lesson.snapshot().phase, 'idle');
});

test('six attempts and four rehearsals are hard bounds, not silently dropped samples', () => {
  const lesson = begin();
  for (let index = 0; index < LIMITS.attempts; index++) attempt(lesson);
  assert.equal(lesson.snapshot().current.attempts.length, 6);
  unchangedError(lesson, () => lesson.act('attempt-retirement'), 'ERR_LIMIT');
  resolve(lesson);
  assert.ok(lesson.snapshot().current.trace.length <= LIMITS.trace);
  lesson.newRehearsal();
  for (let index = 1; index < LIMITS.rehearsals; index++) {
    lesson.begin('ready');
    attempt(lesson);
    lesson.newRehearsal();
  }
  assert.equal(lesson.snapshot().history.length, 4);
  assert.equal(lesson.snapshot().totals.attempts, 9);
  unchangedError(lesson, () => lesson.begin('ready'), 'ERR_LIMIT');
});

test('snapshots and presets cannot mutate the model or another rehearsal', () => {
  const lesson = begin();
  const snapshot = lesson.snapshot();
  snapshot.current.inventory.users = 0;
  snapshot.current.trace.push({ fake: true });
  snapshot.history.push({ fake: true });
  assert.equal(lesson.snapshot().current.inventory.users, 2);
  assert.equal(lesson.snapshot().current.trace.length, 1);
  assert.deepEqual(lesson.snapshot().history, []);
  assert.ok(Object.isFrozen(FIXTURES));
  assert.ok(Object.isFrozen(FIXTURES['all-dependencies']));
  assert.throws(() => { FIXTURES['all-dependencies'].users = 0; }, TypeError);
  assert.deepEqual(begin().snapshot().current.inventory, FIXTURES['all-dependencies']);
});

test('reset clears current/history/counters and reproduces the same deterministic trace', () => {
  const lesson = begin();
  attempt(lesson);
  lesson.checkPrediction('FAILURE');
  const first = lesson.snapshot().current;
  lesson.newRehearsal();
  lesson.begin('ready');
  attempt(lesson);
  lesson.reset();
  assert.deepEqual(lesson.snapshot(), createLesson().snapshot());
  lesson.begin('all-dependencies');
  attempt(lesson);
  lesson.checkPrediction('FAILURE');
  assert.deepEqual(lesson.snapshot().current, first);
});
