'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('..\\model.js');

function switched(condition = 'compatible') {
  let state = lesson.createState();
  state = lesson.act(state, { type: 'configure', condition });
  return lesson.act(state, { type: 'switch' });
}
function run(condition = 'compatible') {
  return lesson.act(switched(condition), { type: 'measure' });
}

test('prepared state is empty evidence, not 100 percent success', () => {
  const state = lesson.createState();
  assert.equal(state.phase, 'prepared');
  assert.equal(state.backend, 'blue');
  assert.deepEqual(lesson.summary(state), {
    attempted: 0, successful: 0, interrupted: 0, unknown: 0, notTransitioned: 0,
  });
});

test('operator switches backend releases, not the public endpoint or API contract', () => {
  const state = switched();
  assert.equal(state.backend, 'green');
  assert.equal(state.phase, 'switched');
  assert.equal(lesson.constants.endpoint, 'https://profiles.training.invalid/api/getProfile');
  assert.equal(lesson.constants.apiContract, 'profile.v1');
  const measured = lesson.act(state, { type: 'measure' });
  assert.deepEqual(lesson.summary(measured), {
    attempted: 2, successful: 2, interrupted: 0, unknown: 0, notTransitioned: 0,
  });
  const records = lesson.results(measured);
  assert.equal(records.length, 1);
  for (const caller of records[0].callers) {
    assert.equal(caller.before.endpoint, caller.after.endpoint);
    assert.equal(caller.before.apiContract, caller.after.apiContract);
    assert.notEqual(caller.before.backendRelease, caller.after.backendRelease);
    assert.equal(caller.outcome, 'positive');
    assert.ok(Object.values(caller.checks).every((value) => value === true));
  }
});

for (const [condition, failedCheck] of [
  ['breaking-contract', 'contract'],
  ['authentication-loss', 'authentication'],
  ['navigation-loss', 'navigation'],
  ['endpoint-change', 'endpoint'],
  ['over-budget', 'budget'],
]) {
  test(`${condition}: HTTP 200 and green release do not certify the journey`, () => {
    const state = run(condition);
    assert.equal(lesson.summary(state).interrupted, 2);
    const records = lesson.results(state);
    assert.equal(records.length, 1);
    assert.equal(records[0].outcome, 'negative');
    assert.equal(records[0].verifier, 'fail');
    assert.equal(records[0].impact, 'Interrupted transition');
    for (const caller of records[0].callers) {
      assert.equal(caller.after.httpStatus, 200);
      assert.equal(caller.after.backendRelease, lesson.constants.backendReleases.green);
      assert.equal(caller.checks[failedCheck], false);
    }
  });
}

test('configured green with observed blue is not completed migration', () => {
  const state = run('stale-route');
  assert.deepEqual(lesson.summary(state), {
    attempted: 2, successful: 0, interrupted: 0, unknown: 0, notTransitioned: 2,
  });
  const records = lesson.results(state);
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, 'not-transitioned');
  assert.equal(records[0].configuredBackend, 'green');
  assert.ok(records[0].callers.every((caller) => caller.after.backendRelease
    === lesson.constants.backendReleases.blue));
});

test('one missing completion stays unknown in the two-attempt denominator', () => {
  const state = run('missing-observation');
  assert.deepEqual(lesson.summary(state), {
    attempted: 2, successful: 1, interrupted: 0, unknown: 1, notTransitioned: 0,
  });
  const records = lesson.results(state);
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, 'unknown');
  assert.equal(records[0].verifier, 'unverified');
  assert.equal(records[0].callers[1].after, null);
});

test('rollback and reset preserve failed observations before later success', () => {
  let state = run('breaking-contract');
  const before = lesson.results(state);
  assert.equal(before.length, 1);
  const original = JSON.stringify(before);
  state = lesson.act(state, { type: 'rollback' });
  assert.equal(state.backend, 'blue');
  state = lesson.act(state, { type: 'reset' });
  assert.equal(state.phase, 'prepared');
  assert.equal(state.condition, 'compatible');
  assert.equal(JSON.stringify(lesson.results(state)), original);
  state = lesson.act(state, { type: 'switch' });
  state = lesson.act(state, { type: 'measure' });
  assert.equal(lesson.results(state).length, 2);
  assert.equal(JSON.stringify(lesson.results(state).slice(0, 1)), original);
  assert.deepEqual(lesson.summary(state), {
    attempted: 4, successful: 2, interrupted: 2, unknown: 0, notTransitioned: 0,
  });
});

test('illegal phases are typed errors and do not mutate the state', () => {
  const state = lesson.createState();
  const original = JSON.stringify(state);
  for (const type of ['measure', 'rollback']) {
    assert.throws(() => lesson.act(state, { type }), { code: 'ERR_LESSON_STATE' });
  }
  assert.equal(JSON.stringify(state), original);
  assert.throws(() => lesson.act(switched(), { type: 'switch' }),
    { code: 'ERR_LESSON_STATE' });
});

test('strict commands reject coercion, unknown keys, arrays, and unknown conditions', () => {
  const state = lesson.createState();
  for (const command of [
    null, [], 'switch', { type: 1 }, { type: 'unknown' },
    { type: 'switch', condition: 'compatible' },
    { type: 'configure', condition: null }, { type: 'configure', condition: 1 },
    { type: 'configure', condition: 'Compatible' },
    { type: 'configure', condition: '<img src=x onerror=alert(1)>' },
  ]) {
    assert.throws(() => lesson.act(state, command), { code: 'ERR_LESSON_INPUT' });
  }
  assert.equal(state.history.length, 0);
});

test('forged typed state or edited history cannot invent a passing result', () => {
  const state = run();
  for (const alter of [
    (copy) => { copy.runId = '1'; },
    (copy) => { copy.backend = 'blue'; },
    (copy) => { copy.extra = true; },
    (copy) => { copy.history.push({ sequence: 99, command: { type: 'measure' } }); },
    (copy) => { copy.history = []; },
  ]) {
    const copy = JSON.parse(JSON.stringify(state));
    alter(copy);
    assert.throws(() => lesson.act(copy, { type: 'reset' }), { code: 'ERR_LESSON_STATE' });
  }
});

test('eight runs are bounded and exhaustion does not discard history', () => {
  let state = lesson.createState();
  for (let runId = 1; runId < lesson.constants.maxRuns; runId += 1) {
    state = lesson.act(state, { type: 'switch' });
    state = lesson.act(state, { type: 'measure' });
    state = lesson.act(state, { type: 'reset' });
  }
  state = lesson.act(state, { type: 'switch' });
  state = lesson.act(state, { type: 'measure' });
  const original = JSON.stringify(state);
  assert.equal(lesson.results(state).length, 8);
  assert.throws(() => lesson.act(state, { type: 'reset' }), { code: 'ERR_LESSON_LIMIT' });
  assert.equal(JSON.stringify(state), original);
});

test('forty accepted actions are bounded without silently evicting provenance', () => {
  let state = lesson.createState();
  for (let index = 0; index < lesson.constants.maxActions; index += 1) {
    state = lesson.act(state, { type: 'configure', condition: 'compatible' });
  }
  assert.equal(state.history.length, 40);
  const original = JSON.stringify(state);
  assert.throws(() => lesson.act(state, { type: 'switch' }), { code: 'ERR_LESSON_LIMIT' });
  assert.equal(JSON.stringify(state), original);
});

test('accessors, sparse history and forged nested measurements are rejected', () => {
  let accessed = false;
  const command = { get type() { accessed = true; return 'switch'; } };
  assert.throws(() => lesson.act(lesson.createState(), command), { code: 'ERR_LESSON_INPUT' });
  assert.equal(accessed, false);
  const forged = JSON.parse(JSON.stringify(run('breaking-contract')));
  forged.history.at(-1).measurement.callers[0].checks.contract = true;
  forged.history.at(-1).measurement.callers[0].after.payload.displayName = 7;
  assert.throws(() => lesson.summary(forged), { code: 'ERR_LESSON_STATE' });
  const sparse = JSON.parse(JSON.stringify(run()));
  delete sparse.history[0];
  assert.throws(() => lesson.results(sparse), { code: 'ERR_LESSON_STATE' });
});

test('measure once per run; reset and rollback cannot fabricate transition proof', () => {
  let state = lesson.act(switched(), { type: 'rollback' });
  assert.equal(lesson.summary(state).attempted, 0);
  assert.throws(() => lesson.act(state, { type: 'measure' }), { code: 'ERR_LESSON_STATE' });
  state = lesson.act(state, { type: 'reset' });
  state = lesson.act(state, { type: 'switch' });
  state = lesson.act(state, { type: 'measure' });
  assert.throws(() => lesson.act(state, { type: 'measure' }), { code: 'ERR_LESSON_STATE' });
  assert.equal(lesson.summary(state).attempted, 2);
});

test('deterministic deeply retained records distinguish API and software versions', () => {
  const first = run();
  assert.deepEqual(first, run());
  const record = lesson.results(first)[0];
  assert.equal(record.callers[0].after.payload.preferredLocale, 'en');
  assert.equal(record.callers[0].after.apiContract, 'profile.v1');
  assert.equal(record.callers[0].after.backendRelease, 'release-green-42');
  assert.ok(Object.isFrozen(first.history));
  assert.ok(Object.isFrozen(record.callers[0].after.payload));
  assert.throws(() => { record.callers[0].after.payload.displayName = 'forged'; }, TypeError);
  const parsed = JSON.parse(JSON.stringify(first));
  const original = JSON.stringify(parsed);
  lesson.results(parsed);
  const reset = lesson.act(parsed, { type: 'reset' });
  assert.equal(JSON.stringify(parsed), original);
  assert.equal(Object.isFrozen(parsed.history[0]), false);
  assert.ok(Object.isFrozen(reset.history[0]));
});
