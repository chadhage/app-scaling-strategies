'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { createStallObserver, observationProblems } = require('./u059-stall-observer.cjs');
const { ORIGINAL, exercise, assertObserved } = require('./u059-stall-fixture.cjs');

function fixture(extra = {}) {
  let ticks = 0;
  const calls = [];
  const observer = createStallObserver({
    requestedTicks: 5, now: () => ticks,
    block: (requested) => { calls.push(requested); ticks += requested; },
    ...extra,
  });
  return { observer, calls };
}

test('U059 RED replay: retained preload consumes before arming; identical oracle passes current preload', () => {
  const red = exercise(ORIGINAL);
  assert.equal(red.unarmedClockCalls, 2);
  assert.equal(red.armedClockCalls, 0);
  assert.throws(() => assertObserved(red), /must not be consumed before observation is armed/);
  assertObserved(exercise());
});

test('U059 observer: pre-arm connections cannot consume the request and repeated connections cannot duplicate it', () => {
  const { observer, calls } = fixture();
  observer.connection();
  assert.deepEqual(calls, []);
  observer.arm();
  for (let connection = 0; connection < 20; connection += 1) observer.connection();
  assert.deepEqual(calls, [5]);
  assert.deepEqual(observationProblems(observer.snapshot(), 5), []);
  assert.deepEqual([observer.snapshot().clockBefore, observer.snapshot().clockAfter], [0, 5], 'injected clock proves the declared work without a native-duration bound');
});

test('U059 observer: reset arms a new exactly-once phase and snapshots cannot mutate later facts', () => {
  const { observer, calls } = fixture();
  observer.arm(); observer.connection();
  const first = observer.snapshot();
  assert.throws(() => { first.completions = 99; }, TypeError);
  observer.arm(); observer.connection();
  assert.deepEqual(calls, [5, 5]);
  assert.equal(observer.snapshot().phase, first.phase + 1);
  assert.deepEqual(observationProblems(observer.snapshot(), 5), []);
});

test('U059 observer: two interleaved instances preserve independent phases and counts', () => {
  for (const reverse of [false, true]) {
    const first = fixture();
    const second = fixture();
    const order = reverse ? [second, first] : [first, second];
    first.observer.arm(); second.observer.arm();
    order[0].observer.connection();
    assert.deepEqual(order[1].calls, []);
    order[1].observer.connection();
    first.observer.arm();
    assert.equal(first.observer.snapshot().phase, 2);
    assert.equal(second.observer.snapshot().phase, 1);
    assert.deepEqual(second.calls, [5]);
  }
});

test('U059 observer: missing/unarmed/incomplete/duplicated requests fail by name even with large diagnostic lag', () => {
  const { observer } = fixture();
  observer.arm(); observer.connection();
  const complete = observer.snapshot();
  assert.deepEqual(observationProblems(complete, 5), [], 'zero or small native lag is irrelevant to complete facts');
  const cases = [
    [null, 'STALL_OBSERVATION_MISSING'],
    [{ ...complete, armed: false }, 'STALL_NOT_ARMED'],
    [{ ...complete, requests: 0 }, 'STALL_REQUEST_MISMATCH'],
    [{ ...complete, starts: 0 }, 'STALL_NOT_EXERCISED_ONCE'],
    [{ ...complete, blockCalls: 0 }, 'STALL_NOT_EXERCISED_ONCE'],
    [{ ...complete, completions: 0 }, 'STALL_NOT_EXERCISED_ONCE'],
    [{ ...complete, completions: 2 }, 'STALL_NOT_EXERCISED_ONCE'],
  ];
  for (const [facts, reason] of cases) assert.ok(observationProblems(facts, 5).includes(reason), reason);
  assert.ok(observationProblems({ ...complete, completions: 0, nativeLagMs: 999999 }, 5).includes('STALL_NOT_EXERCISED_ONCE'));
});

test('U059 observer: a throwing block is incomplete and invalid adapters refuse explicitly', () => {
  const { observer } = fixture({ block() { throw new Error('fixture block failed'); } });
  observer.arm();
  assert.throws(() => observer.connection(), /fixture block failed/);
  assert.equal(observer.snapshot().completions, 0);
  assert.ok(observationProblems(observer.snapshot(), 5).includes('STALL_NOT_EXERCISED_ONCE'));
  assert.throws(() => fixture({ requestedTicks: 0 }), /Invalid counted stall adapters/);
});

test('U059 scope: native lag/elapsed duration never decide load success; arming precedes readiness delivery', () => {
  const load = fs.readFileSync(require.resolve('./load.test.cjs'), 'utf8');
  const preload = fs.readFileSync(require.resolve('./stall.preload.cjs'), 'utf8');
  assert.doesNotMatch(load, /Math\.max\(\.\.\.lags\)|STALL_MS\s*\*\s*0\.9|lagMaxMs\s*[<>]=?/);
  assert.match(load, /observationProblems\(facts, STALL_MS\)/);
  assert.ok(preload.indexOf("message?.type === 'listening') observer.arm()") < preload.indexOf('return send.call'));
  assert.match(preload, /prependListener\('message'/);
});
