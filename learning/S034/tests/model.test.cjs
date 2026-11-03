'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, HISTORY_LIMIT, compare, createLesson } = require('..\\rotation.js');

test('compatible v1/v2 key overlap preserves every existing cookie journey', () => {
  const result = compare({ ...DEFAULTS });
  assert.equal(result.migration, 'success', 'compatible key overlap must preserve authentication across v1/v2');
  assert.deepEqual(result.counts, { attempted: 4, accepted: 4, rejected: 0, unknown: 0 });
  assert.equal(result.tamperRejected, true);
});

test('all supported cookie/token, policy, count and observation combinations obey the oracle', () => {
  let combinations = 0;
  for (const credential of ['cookie', 'token']) {
    for (const rotation of ['overlap', 'drop-old']) {
      for (const observation of ['complete', 'missing']) {
        for (let profiles = 1; profiles <= 8; profiles += 1) {
          const result = compare({ credential, rotation, profiles, observation });
          const attempted = profiles * 2;
          const unknown = observation === 'missing' ? 1 : 0;
          const observed = attempted - unknown;
          assert.deepEqual(result.counts, {
            attempted, accepted: rotation === 'overlap' ? observed : 0,
            rejected: rotation === 'drop-old' ? observed : 0, unknown,
          });
          assert.equal(result.migration, rotation === 'drop-old' ? 'failure' : unknown ? 'unknown' : 'success');
          assert.equal(result.verifier, unknown ? 'unverified' : 'pass');
          assert.equal(result.successPercent, 100 * result.counts.accepted / attempted);
          assert.equal(result.counts.accepted + result.counts.rejected + unknown, attempted);
          assert.equal(result.trace.length, attempted);
          assert.equal(result.trace.filter((entry) => entry.from === 'v1').length, profiles);
          assert.equal(result.trace.filter((entry) => entry.from === 'v2').length, profiles);
          assert.ok(result.trace.every((entry) => entry.credential === credential));
          assert.equal(result.guardChecks.filter((entry) => entry.probe === 'tampered fixture' && entry.outcome === 'rejected').length, 2);
          assert.equal(result.guardChecks.filter((entry) => entry.probe === 'own-issued valid fixture' && entry.outcome === 'accepted').length, 2);
          assert.equal(result.tamperRejected, true);
          assert.deepEqual(compare({ credential, rotation, profiles, observation }), result);
          combinations += 1;
        }
      }
    }
  }
  assert.equal(combinations, 64);
});

test('negative verifier success never launders rejected sessions into migration success', () => {
  const result = compare({ ...DEFAULTS, rotation: 'drop-old' });
  assert.equal(result.verifier, 'pass');
  assert.equal(result.migration, 'failure');
  assert.equal(result.userImpact, 'interrupted transition');
  assert.equal(result.successPercent, 0);
  assert.match(result.verifierReason, /not migration success/);
});

test('observed authentication failure takes precedence over missing evidence', () => {
  const result = compare({ ...DEFAULTS, profiles: 1, rotation: 'drop-old', observation: 'missing' });
  assert.deepEqual(result.counts, { attempted: 2, accepted: 0, rejected: 1, unknown: 1 });
  assert.equal(result.migration, 'failure');
  assert.equal(result.verifier, 'unverified');
});

test('wrong types, out-of-bounds inputs, unsupported controls and extra fields cannot mutate history', () => {
  const lesson = createLesson();
  const invalid = [null, undefined, [], 'cookie', 1, {}, Object.create(DEFAULTS),
    { ...DEFAULTS, credential: 'bearer' }, { ...DEFAULTS, rotation: 'bypass' },
    { ...DEFAULTS, observation: 'assume-success' }, { ...DEFAULTS, extra: true },
    ...[0, 9, -1, 1.5, '2', true, null, NaN, Infinity].map((profiles) => ({ ...DEFAULTS, profiles }))];
  for (const config of invalid) {
    assert.throws(() => lesson.run(config), /Provide exactly|Choose|Profiles/);
    assert.deepEqual(lesson.snapshot(), { history: [], current: null, remaining: 8 });
  }
  const accessor = { ...DEFAULTS };
  Object.defineProperty(accessor, 'profiles', { get() { throw new Error('must not execute'); } });
  assert.throws(() => lesson.run(accessor), /data, not accessors/);
  assert.throws(() => lesson.run({ ...DEFAULTS, [Symbol('extra')]: true }), /Provide exactly/);
  const missing = { ...DEFAULTS };
  delete missing.observation;
  assert.throws(() => lesson.run(missing), /Provide exactly/);
  assert.equal(lesson.run({ ...DEFAULTS }).current.id, 'run-01');
});

test('immutable histories retain failure and unknown after reset and further comparison', () => {
  const lesson = createLesson();
  const failed = lesson.run({ ...DEFAULTS, rotation: 'drop-old' });
  const uncertain = lesson.run({ ...DEFAULTS, observation: 'missing' });
  const reset = lesson.reset();
  assert.equal(reset.current, null);
  assert.equal(reset.remaining, 6);
  assert.deepEqual(reset.history.map((run) => run.migration), ['failure', 'unknown']);
  assert.deepEqual(reset.history[0], failed.current);
  assert.deepEqual(reset.history[1], uncertain.current);
  assert.throws(() => { reset.history[0].counts.rejected = 0; }, TypeError);
  assert.throws(() => reset.history.pop(), TypeError);
  assert.throws(() => { reset.history[1].trace[0].outcome = 'accepted'; }, TypeError);
  const config = { ...DEFAULTS };
  const third = lesson.run(config);
  config.profiles = 8;
  assert.equal(third.current.configuration.profiles, 2);
  assert.equal(third.current.id, 'run-03');
  assert.equal(third.history[0].counts.rejected, 4);
});

test('the eight-run state limit cannot be bypassed by reset or a modified snapshot', () => {
  const lesson = createLesson();
  for (let index = 0; index < HISTORY_LIMIT; index += 1) lesson.run({ ...DEFAULTS });
  const before = lesson.snapshot();
  assert.equal(before.remaining, 0);
  assert.equal(before.current.id, 'run-08');
  assert.throws(() => lesson.run({ ...DEFAULTS }), /History limit/);
  assert.deepEqual(lesson.snapshot(), before);
  lesson.reset();
  assert.throws(() => lesson.run({ ...DEFAULTS }), /History limit/);
  assert.equal(lesson.snapshot().history.length, 8);
  assert.equal(lesson.snapshot().current, null);
});
