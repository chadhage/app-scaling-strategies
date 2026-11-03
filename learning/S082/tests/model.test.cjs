'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('../model.js');
const input = (overrides = {}) => ({
  epoch: 'stale', field: 'both', guard: 'enforced', observation: 'complete', ...overrides,
});
const entryFor = (overrides) => lesson.deliver(lesson.createState(), input(overrides)).records[0];

test('all 36 fixed configurations have independently calculated epoch-rule outcomes', () => {
  const counts = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
  for (const epoch of ['stale', 'current', 'future']) {
    for (const field of ['routing', 'readiness', 'both']) {
      for (const guard of ['enforced', 'bypassed']) {
        for (const observation of ['complete', 'missing']) {
          const entry = entryFor({ epoch, field, guard, observation });
          const applied = epoch === 'current' || guard === 'bypassed';
          const expected = observation === 'missing' ? 'UNKNOWN'
            : epoch !== 'current' && applied ? 'FAIL' : 'PASS';
          assert.equal(entry.verdict, expected);
          assert.equal(entry.command.disposition, applied ? 'APPLIED' : 'REJECTED');
          assert.equal(entry.before.epoch, 12);
          if (observation === 'missing') {
            assert.equal(entry.after, null);
            assert.deepEqual(entry.metrics, { routingChanges: null, readinessChanges: null, protectedChanges: null });
          } else {
            const route = Number(applied && field !== 'readiness');
            const ready = Number(applied && field !== 'routing');
            assert.deepEqual(entry.after.routing, route ? { blue: 100, green: 0 } : { blue: 25, green: 75 });
            assert.deepEqual(entry.after.readiness, { blue: true, green: !ready });
            assert.deepEqual(entry.metrics, { routingChanges: route, readinessChanges: ready, protectedChanges: route + ready });
            assert.equal(entry.after.epoch, 12);
            assert.equal(entry.after.deployment, 'green-e12');
          }
          counts[entry.verdict]++;
        }
      }
    }
  }
  assert.deepEqual(counts, { PASS: 12, FAIL: 6, UNKNOWN: 18 });
});

test('a stale bypass visibly fails and correct interpretation cannot rewrite it', () => {
  const delivered = lesson.deliver(lesson.createState(), input({ guard: 'bypassed' }));
  const checked = lesson.interpret(delivered, 'FAIL');
  assert.equal(checked.records[0].command.reason, 'GUARD_BYPASSED');
  assert.equal(checked.records[0].verdict, 'FAIL');
  assert.equal(checked.records[0].metrics.protectedChanges, 2);
  assert.deepEqual(checked.records[0].learner, { answer: 'FAIL', correct: true });
  assert.equal(delivered.records[0].learner, null);
});

test('a visible rejection without after evidence stays UNKNOWN after a wrong answer', () => {
  const delivered = lesson.deliver(lesson.createState(), input({ observation: 'missing' }));
  const checked = lesson.interpret(delivered, 'PASS');
  assert.equal(checked.records[0].command.reason, 'STALE_EPOCH');
  assert.equal(checked.records[0].verdict, 'UNKNOWN');
  assert.equal(checked.records[0].after, null);
  assert.deepEqual(checked.records[0].learner, { answer: 'PASS', correct: false });
});

test('strict inputs reject unknown values, extra keys, accessors and unsupported shapes without consuming state', () => {
  const state = lesson.createState();
  const accessor = input();
  Object.defineProperty(accessor, 'epoch', { get() { throw new Error('must not execute'); } });
  const invalid = [
    null, undefined, [], 'stale', 11, Object.create(null),
    input({ epoch: 11 }), input({ field: 'all' }), input({ guard: 'auto' }),
    input({ observation: 'partial' }), input({ endpoint: 'https://s082.invalid' }),
    { ...input(), [Symbol('extra')]: true }, accessor,
  ];
  for (const value of invalid) assert.throws(() => lesson.deliver(state, value), { code: 'INPUT' });
  assert.deepEqual(state, { phase: 'ready', records: [] });
  assert.equal(lesson.deliver(state, input()).records.length, 1);
});

test('forged, cloned, foreign and out-of-order states cannot advance', () => {
  const state = lesson.createState();
  for (const candidate of [null, {}, { ...state }, JSON.parse(JSON.stringify(state)), { phase: 'ready', records: [] }]) {
    assert.throws(() => lesson.deliver(candidate, input()), { code: 'STATE' });
  }
  assert.throws(() => lesson.interpret(state, 'PASS'), { code: 'ORDER' });
  assert.throws(() => lesson.nextAttempt(state), { code: 'ORDER' });
  const delivered = lesson.deliver(state, input());
  assert.throws(() => lesson.deliver(delivered, input()), { code: 'ORDER' });
  assert.throws(() => lesson.nextAttempt(delivered), { code: 'ORDER' });
  assert.throws(() => lesson.interpret(delivered, 'success'), { code: 'ANSWER' });
  const checked = lesson.interpret(delivered, 'PASS');
  assert.throws(() => lesson.interpret(checked, 'PASS'), { code: 'ORDER' });
  assert.equal(lesson.nextAttempt(checked).phase, 'ready');
});

test('state, nested snapshots and input copies are immutable and attempts are independent', () => {
  const controls = input({ guard: 'bypassed' });
  const delivered = lesson.deliver(lesson.createState(), controls);
  controls.epoch = 'current';
  assert.equal(delivered.records[0].input.epoch, 'stale');
  assert.throws(() => { delivered.records[0].after.readiness.green = true; }, TypeError);
  assert.throws(() => { delivered.records.push({}); }, TypeError);
  assert.throws(() => { lesson.baseline.epoch = 13; }, TypeError);
  const checked = lesson.interpret(delivered, 'FAIL');
  const next = lesson.deliver(lesson.nextAttempt(checked), input());
  assert.deepEqual(next.records[1].before, lesson.baseline);
  assert.deepEqual(next.records[1].after, lesson.baseline);
  assert.strictEqual(next.records[0], checked.records[0]);
  assert.equal(checked.records.length, 1);
});

test('six attempts are retained without eviction and explicit reset creates empty independent memory', () => {
  let state = lesson.createState();
  for (let id = 1; id <= 6; id++) {
    state = lesson.interpret(lesson.deliver(state, input()), 'PASS');
    assert.deepEqual(state.records.map((entry) => entry.id), Array.from({ length: id }, (_, index) => index + 1));
    if (id < 6) state = lesson.nextAttempt(state);
  }
  assert.throws(() => lesson.nextAttempt(state), { code: 'LIMIT' });
  assert.equal(state.records.length, 6);
  assert.equal(lesson.createState().records.length, 0);
  assert.equal(state.records.length, 6);
});
