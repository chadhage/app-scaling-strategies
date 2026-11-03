'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson, MAX_STEPS, ACTIONS, OBSERVATIONS, CLIENTS } = require('../affinity.js');

const command = (action, observation = 'complete') => ({ action, observation });

function safeRemoval() {
  const lesson = createLesson();
  lesson.step(command('externalize'));
  lesson.step(command('remove-affinity'));
  return lesson;
}

test('verified externalization before affinity removal preserves both clients on both workers', () => {
  const lesson = createLesson();
  lesson.step({ action: 'externalize', observation: 'complete' });
  lesson.step({ action: 'remove-affinity', observation: 'complete' });
  const result = lesson.step({ action: 'probe', observation: 'complete' });
  assert.equal(result.verdict, 'success', 'the complete cross-worker probe must preserve state');
  assert.equal(lesson.view().affinity, 'off');
  assert.deepEqual(result.metrics, { attempted: 4, preserved: 4, failed: 0, unknown: 0 });
  assert.deepEqual([...new Set(result.trace.map((row) => row.worker))], ['worker-a', 'worker-b']);
});

test('pinned local success does not authorize removal and does not reset sessions', () => {
  const lesson = createLesson();
  const baseline = lesson.step(command('probe'));
  assert.equal(baseline.verdict, 'success');
  assert.equal(baseline.metrics.preserved, 4);
  assert.ok(baseline.trace.every((row) => row.worker === 'worker-a'));
  const blocked = lesson.step(command('remove-affinity'));
  assert.equal(blocked.verdict, 'failure');
  assert.equal(blocked.userImpact, 'safe-abort-before-exposure');
  assert.equal(blocked.applied, false);
  assert.equal(blocked.unit, 'guard');
  assert.equal(blocked.trace.length, 0);
  assert.match(blocked.message, /Unsupported local-state removal/);
  assert.deepEqual(blocked.before, blocked.after);
  assert.deepEqual(lesson.step(command('probe')).trace, baseline.trace);
  assert.equal(lesson.view().history.length, 3);
  assert.equal(lesson.view().summary.failure, 1);
});

test('unsafe off/local preview detects HTTP 200 state loss without applying it', () => {
  const lesson = createLesson();
  const result = lesson.step(command('preview-unsafe'));
  assert.equal(result.kind, 'counterexample');
  assert.equal(result.applied, false);
  assert.equal(result.verdict, 'failure');
  assert.equal(result.userImpact, 'hypothetical-interruption');
  assert.deepEqual(result.metrics, { attempted: 4, preserved: 2, failed: 2, unknown: 0 });
  assert.ok(result.trace.every((row) => row.httpStatus === 200));
  assert.ok(result.trace.filter((row) => row.worker === 'worker-b').every((row) => row.observed === null && row.outcome === 'failed'));
  assert.deepEqual(result.before, result.after);
  assert.equal(lesson.view().affinity, 'on');
  assert.equal(lesson.view().storage, 'local');
  assert.equal(lesson.view().verified, false);
  assert.equal(lesson.step(command('probe')).metrics.preserved, 4);
});

test('complete externalization verifies both records while still pinned', () => {
  const lesson = createLesson();
  const migration = lesson.step(command('externalize'));
  assert.equal(migration.verdict, 'success');
  assert.equal(migration.unit, 'state-records');
  assert.equal(migration.applied, true);
  assert.deepEqual(migration.metrics, { attempted: 2, preserved: 2, failed: 0, unknown: 0 });
  assert.deepEqual(migration.after, { storage: 'shared', affinity: 'on', verified: true });
  const before = lesson.step(command('probe'));
  assert.equal(before.verdict, 'success');
  assert.ok(before.trace.every((row) => row.worker === 'worker-a'));
  lesson.step(command('remove-affinity'));
  const after = lesson.step(command('probe'));
  assert.equal(after.verdict, 'success');
  assert.deepEqual(after.trace.map((row) => `${row.client}/${row.worker}`), [
    'client-1/worker-a', 'client-1/worker-b', 'client-2/worker-a', 'client-2/worker-b',
  ]);
  assert.deepEqual(after.trace.map((row) => row.observed), before.trace.map((row) => row.observed));
});

for (const [observation, expectedVerdict] of [['mismatch', 'failure'], ['missing', 'unknown']]) {
  test(`${observation} migration receipts cannot commit or authorize removal`, () => {
    const lesson = createLesson();
    const initialProbe = lesson.step(command('probe'));
    const result = lesson.step(command('externalize', observation));
    assert.equal(result.verdict, expectedVerdict);
    assert.equal(result.applied, false);
    assert.equal(result.userImpact, 'safe-abort-before-exposure');
    assert.deepEqual(result.before, result.after);
    assert.equal(lesson.view().verified, false);
    assert.equal(lesson.view().storage, 'local');
    assert.equal(lesson.step(command('remove-affinity')).verdict, 'failure');
    assert.deepEqual(lesson.step(command('probe')).trace, initialProbe.trace);
    assert.equal(lesson.step(command('externalize')).verdict, 'success');
    assert.equal(lesson.step(command('remove-affinity')).verdict, 'success');
    assert.equal(lesson.step(command('probe')).metrics.preserved, 4);
    assert.equal(lesson.view().history[1].verdict, expectedVerdict);
  });
}

for (const [observation, verdict, field] of [['missing', 'unknown', 'unknown'], ['mismatch', 'failure', 'failed']]) {
  test(`${observation} probe stays distinct and does not corrupt stored records`, () => {
    const lesson = safeRemoval();
    const result = lesson.step(command('probe', observation));
    assert.equal(result.verdict, verdict);
    assert.equal(result.metrics.preserved, 3);
    assert.equal(result.metrics[field], 1);
    assert.equal(result.trace.at(-1).httpStatus, observation === 'missing' ? null : 200);
    const complete = lesson.step(command('probe'));
    assert.equal(complete.verdict, 'success');
    assert.equal(complete.metrics.preserved, 4);
    assert.equal(lesson.view().history[2].verdict, verdict);
    assert.equal(lesson.view().summary[verdict], 1);
    assert.deepEqual(complete.trace.at(-1).observed, CLIENTS[1].expected);
  });
}

test('unknown, failure and counterexample history remains ordered after successful recovery', () => {
  const lesson = createLesson();
  lesson.step(command('preview-unsafe'));
  lesson.step(command('externalize', 'missing'));
  lesson.step(command('externalize', 'mismatch'));
  lesson.step(command('externalize'));
  lesson.step(command('remove-affinity'));
  lesson.step(command('probe', 'missing'));
  lesson.step(command('probe', 'mismatch'));
  const success = lesson.step(command('probe'));
  assert.equal(success.verdict, 'success');
  const snapshot = lesson.view();
  assert.deepEqual(snapshot.history.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(snapshot.summary, { success: 3, failure: 3, unknown: 2 });
  assert.equal(snapshot.history[0].trace[1].outcome, 'failed');
  assert.equal(snapshot.last, success);
});

test('restoring affinity preserves verified shared state and negative history', () => {
  const lesson = safeRemoval();
  lesson.step(command('probe', 'mismatch'));
  const restoration = lesson.step(command('restore-affinity'));
  assert.equal(restoration.verdict, 'success');
  assert.deepEqual(restoration.after, { affinity: 'on', storage: 'shared', verified: true });
  assert.ok(lesson.step(command('probe')).trace.every((row) => row.worker === 'worker-a'));
  lesson.step(command('remove-affinity'));
  assert.equal(lesson.step(command('probe')).metrics.preserved, 4);
  assert.equal(lesson.view().summary.failure, 1);
});

test('repeated or out-of-sequence state changes are explicit non-mutating failures', () => {
  const lesson = createLesson();
  assert.equal(lesson.step(command('restore-affinity')).verdict, 'failure');
  lesson.step(command('externalize'));
  for (const action of ['externalize', 'restore-affinity']) {
    const result = lesson.step(command(action));
    assert.equal(result.verdict, 'failure');
    assert.equal(result.applied, false);
    assert.deepEqual(result.before, result.after);
  }
  lesson.step(command('remove-affinity'));
  for (const action of ['externalize', 'remove-affinity']) {
    const result = lesson.step(command(action));
    assert.equal(result.verdict, 'failure');
    assert.equal(result.applied, false);
    assert.deepEqual(result.before, result.after);
  }
  assert.equal(lesson.step(command('probe')).metrics.preserved, 4);
});

test('malformed commands including accessors, symbols and inherited fields cannot mutate state', () => {
  const lesson = safeRemoval();
  let getterCalled = false;
  const accessor = { observation: 'complete' };
  Object.defineProperty(accessor, 'action', { get() { getterCalled = true; return 'probe'; }, enumerable: true });
  const malformed = [
    null, undefined, true, 3, '', [], 'probe', new String('probe'),
    {}, { action: 'probe' }, { observation: 'complete' },
    command('Probe'), command('probe '), command('<img src=x onerror=alert(1)>'),
    command('probe', ''), command('probe', 'complete '), command('probe', null),
    command('probe', 0), command('probe', ['complete']), command('probe', {}),
    command('remove-affinity', 'missing'), command('restore-affinity', 'mismatch'),
    command('preview-unsafe', 'missing'),
    { ...command('probe'), extra: true },
    { ...command('probe'), [Symbol('extra')]: true },
    Object.create(command('probe')), accessor,
  ];
  for (const invalid of malformed) {
    const before = lesson.view();
    assert.throws(() => lesson.step(invalid), TypeError);
    assert.deepEqual(lesson.view(), before);
  }
  assert.equal(getterCalled, false);
  assert.equal(lesson.step(Object.assign(Object.create(null), command('probe'))).verdict, 'success');
});

test('returned API, records, views, traces and histories cannot bypass guards', () => {
  const lesson = createLesson();
  const event = lesson.step(command('probe'));
  const snapshot = lesson.view();
  for (const mutation of [
    () => { lesson.step = () => {}; },
    () => { snapshot.affinity = 'off'; },
    () => { snapshot.verified = true; },
    () => { snapshot.history.push({}); },
    () => { event.trace[0].observed.revision = 0; },
    () => { CLIENTS[0].expected.cart = 0; },
    () => { ACTIONS.push('bypass'); },
    () => { OBSERVATIONS.push('pretend-success'); },
  ]) assert.throws(mutation, TypeError);
  assert.equal(lesson.step(command('remove-affinity')).verdict, 'failure');
  assert.equal(lesson.step(command('probe')).metrics.preserved, 4);
});

test('run is bounded without silently dropping evidence; reset creates a separate untested run', () => {
  const lesson = createLesson();
  lesson.step(command('preview-unsafe'));
  for (let index = 1; index < MAX_STEPS; index += 1) lesson.step(command('probe'));
  const full = lesson.view();
  assert.equal(full.history.length, 16);
  assert.equal(full.stepsRemaining, 0);
  assert.throws(() => lesson.step(command('externalize')), /16-step run is full/);
  assert.deepEqual(lesson.view(), full);
  const reset = lesson.reset();
  assert.equal(reset.runNumber, 2);
  assert.deepEqual(reset.summary, { success: 0, failure: 0, unknown: 0 });
  assert.deepEqual(reset.history, []);
  assert.equal(reset.last, null);
  assert.equal(reset.stepsRemaining, 16);
  assert.equal(reset.storage, 'local');
  assert.equal(reset.affinity, 'on');
  assert.equal(reset.verified, false);
  assert.equal(full.history[0].verdict, 'failure');
  assert.equal(lesson.step(command('remove-affinity')).verdict, 'failure');
});

test('identical bounded commands produce identical synthetic traces and results', () => {
  const commands = [
    command('probe'), command('remove-affinity'), command('preview-unsafe'),
    command('externalize', 'missing'), command('externalize', 'mismatch'),
    command('externalize'), command('probe'), command('remove-affinity'),
    command('probe', 'missing'), command('probe', 'mismatch'), command('probe'),
    command('restore-affinity'), command('probe'),
  ];
  const first = createLesson();
  const second = createLesson();
  for (const input of commands) assert.deepEqual(first.step(input), second.step(input));
  assert.deepEqual(first.view(), second.view());
});

test('classic browser script exports the same guarded API without CommonJS', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const context = vm.createContext({});
  new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'affinity.js'), 'utf8')).runInContext(context);
  assert.equal(typeof context.S033Affinity.createLesson, 'function');
  assert.equal(vm.runInContext("S033Affinity.createLesson().step({action:'remove-affinity',observation:'complete'}).verdict", context), 'failure');
});
