'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLesson, act, LIMITS } = require('..\\model.js');
const fixtures = require('..\\fixtures.js');
const config = (changes = {}) => ({
  migration: 'faithful', observation: 'complete', oldConsumers: 2, oldWork: 1, ...changes,
});
const begin = (changes) => act(createLesson(), 'begin', config(changes));
const expand = (changes) => act(begin(changes), 'expand');
const migrate = (changes) => act(expand(changes), 'migrate');
const last = (state) => state.current?.events?.at(-1);
const noOldDependencies = { oldConsumers: 0, oldWork: 0 };
const full = (changes) => act(migrate({ ...noOldDependencies, ...changes }), 'contract');

test('the stub and fixtures load with the declared callable API', () => {
  assert.equal(typeof createLesson, 'function');
  assert.equal(typeof act, 'function');
  assert.equal(fixtures.length, 4);
  assert.deepEqual(LIMITS, { attempts: 6, events: 12, records: 4, oldConsumers: 4, oldWork: 3 });
});

test('initial state is empty, issued and recursively immutable', () => {
  const state = createLesson();
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.history));
  assert.equal(state.current, null);
  assert.deepEqual(state.history, []);
});

test('begin locks exact bounded configuration and four unexpanded records', () => {
  const state = begin();
  assert.equal(state.current?.phase, 'baseline');
  assert.deepEqual(state.current.config, config());
  assert.equal(state.current.oldConsumers, 2);
  assert.equal(state.current.newConsumers, 2);
  assert.equal(state.current.oldWork, 1);
  assert.equal(state.current.check, null);
  assert.equal(state.current.events.length, 1);
  assert.ok(state.current.rows.every((row, i) => row.legacyLabel === fixtures[i].label
    && !Object.hasOwn(row, 'modernLabel')));
  assert.equal(last(state).impact, 'NO_MIGRATION');
});

test('expand is additive and both reader contracts pass during overlap', () => {
  const state = expand();
  assert.equal(state.current?.phase, 'expanded');
  assert.ok(state.current.rows.every((row, i) => row.legacyLabel === fixtures[i].label && row.modernLabel === null));
  assert.equal(state.current.check.gate, 'PASS');
  assert.equal(state.current.check.observed, 8);
  assert.equal(state.current.check.passed, 8);
  assert.equal(state.current.check.failed, 0);
  assert.equal(state.current.check.unknown, 0);
  assert.equal(state.current.check.reads.filter((read) => read.reader === 'old').length, 4);
  assert.ok(state.current.check.reads.filter((read) => read.reader === 'new')
    .every((read) => read.reason.includes('legacy fallback')));
  assert.equal(last(state).impact, 'NO_MIGRATION');
});

test('faithful migration copies four values while eight old/new journeys stay valid', () => {
  const state = migrate();
  assert.equal(state.current?.phase, 'migrated');
  assert.equal(state.current.copiedRows, 4);
  assert.ok(state.current.rows.every((row, i) => row.legacyLabel === fixtures[i].label
    && row.modernLabel === fixtures[i].label));
  assert.equal(state.current.check.gate, 'PASS');
  assert.deepEqual([state.current.check.observed, state.current.check.passed,
    state.current.check.failed, state.current.check.unknown], [8, 8, 0, 0]);
  assert.equal(state.current.migrationCheck, state.current.check);
  assert.equal(last(state).impact, 'NO_MIGRATION');
});

test('contract before expand is a recorded safe abort, never data removal', () => {
  const state = act(begin(), 'contract');
  assert.equal(last(state)?.decision, 'BLOCKED');
  assert.equal(state.current.phase, 'baseline');
  assert.match(last(state).message, /expand.*migrate/i);
  assert.equal(last(state).gate, 'FAIL');
  assert.equal(last(state).impact, 'SAFE_ABORT');
  assert.ok(state.current.rows.every((row) => Object.hasOwn(row, 'legacyLabel')));
});

test('contract after expand but before migration is also blocked', () => {
  const state = act(expand(), 'contract');
  assert.equal(last(state)?.decision, 'BLOCKED');
  assert.equal(state.current.phase, 'expanded');
  assert.ok(state.current.rows.every((row) => row.modernLabel === null && Object.hasOwn(row, 'legacyLabel')));
});

test('remaining old consumers alone prevent contraction', () => {
  const state = act(migrate({ oldWork: 0 }), 'contract');
  assert.equal(last(state)?.decision, 'BLOCKED');
  assert.match(last(state).message, /2 old consumers/);
  assert.equal(last(state).impact, 'SAFE_ABORT');
  assert.equal(state.current.phase, 'migrated');
  assert.ok(state.current.rows.every((row) => Object.hasOwn(row, 'legacyLabel')));
});

test('remaining old work alone prevents contraction even with zero old consumers', () => {
  const state = act(migrate({ oldConsumers: 0, oldWork: 2 }), 'contract');
  assert.equal(last(state)?.decision, 'BLOCKED');
  assert.match(last(state).message, /2 old work/);
  assert.equal(state.current.oldConsumers, 0);
  assert.ok(state.current.rows.every((row) => Object.hasOwn(row, 'legacyLabel')));
});

test('only ordered verified migration plus consumer upgrade and work completion permits contraction', () => {
  let state = migrate();
  state = act(state, 'upgrade');
  state = act(state, 'drain');
  state = act(state, 'contract');
  assert.equal(state.current?.phase, 'contracted');
  assert.equal(state.current.oldConsumers, 0);
  assert.equal(state.current.newConsumers, 4);
  assert.equal(state.current.oldWork, 0);
  assert.equal(state.current.completedOldWork, 1);
  assert.ok(state.current.rows.every((row, i) => !Object.hasOwn(row, 'legacyLabel')
    && row.modernLabel === fixtures[i].label));
  assert.equal(state.current.check.observed, 4);
  assert.equal(state.current.check.passed, 4);
  assert.equal(last(state).gate, 'PASS');
  assert.equal(last(state).decision, 'ALLOWED');
  assert.equal(last(state).impact, 'UNINTERRUPTED');
});

test('upgrading consumers does not silently finish old work', () => {
  const upgraded = act(migrate(), 'upgrade');
  assert.equal(upgraded.current?.oldConsumers, 0);
  assert.equal(upgraded.current.newConsumers, 4);
  assert.equal(upgraded.current.oldWork, 1);
  const blocked = act(upgraded, 'contract');
  assert.equal(last(blocked).decision, 'BLOCKED');
  assert.match(last(blocked).message, /1 old work/);
});

test('a corrupt migration is an interrupted new-reader journey, not a row-count success', () => {
  const state = migrate({ migration: 'corrupt-first' });
  assert.equal(state.current?.copiedRows, 4);
  assert.equal(state.current.check.gate, 'FAIL');
  assert.deepEqual([state.current.check.observed, state.current.check.passed,
    state.current.check.failed, state.current.check.unknown], [8, 7, 1, 0]);
  assert.equal(state.current.check.reads.find((read) => read.status === 'FAIL').reader, 'new');
  assert.equal(last(state).impact, 'INTERRUPTED');
  const blocked = act(state, 'contract');
  assert.equal(last(blocked).decision, 'BLOCKED');
  assert.equal(last(blocked).impact, 'INTERRUPTED');
  assert.match(last(blocked).message, /failed/);
  assert.throws(() => act(state, 'upgrade'), /verified migration/);
});

test('partial faithful observations are unknown even without consumer or work dependencies', () => {
  const state = migrate({ ...noOldDependencies, observation: 'partial' });
  assert.equal(state.current?.check?.gate, 'UNKNOWN');
  assert.deepEqual([state.current.check.observed, state.current.check.passed,
    state.current.check.failed, state.current.check.unknown], [2, 2, 0, 6]);
  assert.ok(state.current.check.reads.filter((read) => read.status === 'UNKNOWN')
    .every((read) => read.actual === null));
  const blocked = act(state, 'contract');
  assert.equal(last(blocked).gate, 'UNKNOWN');
  assert.equal(last(blocked).impact, 'UNKNOWN');
  assert.equal(last(blocked).decision, 'BLOCKED');
  assert.equal(blocked.current.phase, 'migrated');
});

test('no observations cannot infer failure or success from the selected corrupt fixture', () => {
  const state = migrate({ ...noOldDependencies, migration: 'corrupt-first', observation: 'none' });
  assert.equal(state.current?.check?.gate, 'UNKNOWN');
  assert.deepEqual([state.current.check.observed, state.current.check.passed,
    state.current.check.failed, state.current.check.unknown], [0, 0, 0, 8]);
  assert.ok(state.current.check.reads.every((read) => read.status === 'UNKNOWN' && read.actual === null));
  assert.equal(last(act(state, 'contract')).impact, 'UNKNOWN');
});

test('one known mismatch dominates partial uncertainty and is retained after a blocked contract', () => {
  const state = migrate({ migration: 'corrupt-first', observation: 'partial' });
  assert.equal(state.current?.check?.gate, 'FAIL');
  assert.deepEqual([state.current.check.passed, state.current.check.failed, state.current.check.unknown], [1, 1, 6]);
  const blocked = act(state, 'contract');
  assert.equal(last(blocked).impact, 'INTERRUPTED');
  assert.equal(blocked.current.interrupted, true);
});

test('old work finishes explicitly using the retained legacy structure and cannot finish twice', () => {
  const state = act(migrate({ oldConsumers: 0, oldWork: 3 }), 'drain');
  assert.equal(state.current?.oldWork, 0);
  assert.equal(state.current.completedOldWork, 3);
  assert.match(last(state).message, /3 old work/);
  assert.throws(() => act(state, 'drain'), /old work/);
});

test('forged, cloned, null or foreign states are rejected without touching issued state', () => {
  const state = begin();
  for (const invalid of [null, {}, [], JSON.parse(JSON.stringify(state)), { ...state }]) {
    assert.throws(() => act(invalid, 'expand'), /issued immutable S054/);
  }
  assert.equal(state.current?.phase, 'baseline');
});

test('configuration types, exact keys, enums and integer ranges are strict', () => {
  const invalid = [
    null, [], {}, config({ migration: 'guess' }), config({ observation: 'guess' }),
    config({ oldConsumers: '' }), config({ oldConsumers: '2' }), config({ oldConsumers: -1 }),
    config({ oldConsumers: 5 }), config({ oldConsumers: 1.5 }), config({ oldConsumers: NaN }),
    config({ oldWork: '' }), config({ oldWork: Infinity }), config({ oldWork: 4 }),
    config({ oldWork: -1 }), config({ oldWork: 0.1 }), config({ extra: true }),
    Object.assign(Object.create({ inherited: true }), config()),
  ];
  for (const value of invalid) assert.throws(() => act(createLesson(), 'begin', value), /Configuration|Migration|Observation|Old/);
});

test('phase guards and locked inputs reject out-of-order actions without mutations', () => {
  const idle = createLesson();
  for (const action of ['expand', 'migrate', 'upgrade', 'drain', 'contract', 'newAttempt']) {
    assert.throws(() => act(idle, action), /active attempt/);
  }
  const baseline = begin();
  const before = JSON.stringify(baseline);
  assert.throws(() => act(baseline, 'begin', config()), /already active/);
  assert.throws(() => act(baseline, 'migrate'), /expanded/);
  assert.throws(() => act(baseline, 'upgrade'), /migrated/);
  assert.throws(() => act(baseline, 'drain'), /migrated/);
  assert.equal(JSON.stringify(baseline), before);
  const contracted = full();
  assert.equal(contracted.current?.phase, 'contracted');
  for (const action of ['expand', 'migrate', 'upgrade', 'drain', 'contract']) {
    assert.throws(() => act(contracted, action), /contracted|requires/);
  }
});

test('six attempts retain independent configurations, checks and safe-abort traces with no eviction', () => {
  let state = createLesson();
  for (let i = 0; i < LIMITS.attempts; i++) {
    state = act(state, 'begin', config({ oldConsumers: i % 5 }));
    state = act(state, 'contract');
    assert.equal(state.current?.id, i + 1);
    if (i < LIMITS.attempts - 1) state = act(state, 'newAttempt');
  }
  assert.equal(state.history.length, 5);
  assert.equal(state.history[0].config.oldConsumers, 0);
  assert.equal(state.history[4].config.oldConsumers, 4);
  assert.ok(state.history.every((attempt) => attempt.events.at(-1).decision === 'BLOCKED'));
  assert.throws(() => act(state, 'newAttempt'), /History full/);
  assert.throws(() => act(act(state, 'reset'), 'newAttempt'), /active attempt/);
});

test('explicit reset clears work, defaults, errors-independent model state and all retained history', () => {
  const prior = act(migrate({ migration: 'corrupt-first' }), 'newAttempt');
  const reset = act(prior, 'reset');
  assert.ok(Object.isFrozen(reset));
  assert.equal(reset.current, null);
  assert.deepEqual(reset.history, []);
  assert.equal(prior.history[0].interrupted, true);
  assert.equal(act(reset, 'begin', config()).current.id, 1);
});

test('a twelve-event bound rejects further commands without evicting any trace', () => {
  let state = begin();
  for (let i = 1; i < LIMITS.events; i++) state = act(state, 'contract');
  assert.equal(state.current?.events?.length, 12);
  const before = JSON.stringify(state);
  assert.throws(() => act(state, 'contract'), /Event limit/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(act(state, 'newAttempt').history[0].events.length, 12);
});

test('an unknown migration never authorizes upgrading dependent old consumers', () => {
  const state = migrate({ observation: 'partial' });
  assert.equal(state.current?.check?.gate, 'UNKNOWN');
  assert.throws(() => act(state, 'upgrade'), /verified migration/);
  assert.equal(state.current.oldConsumers, 2);
});

test('nested configurations, rows, checks and history are frozen and previous states remain unchanged', () => {
  const initial = begin();
  assert.equal(initial.current?.phase, 'baseline');
  assert.ok(Object.isFrozen(initial.current?.rows));
  assert.ok(Object.isFrozen(initial.current.config));
  assert.ok(Object.isFrozen(initial.current.rows[0]));
  assert.throws(() => { initial.current.oldConsumers = 0; }, TypeError);
  assert.throws(() => { initial.current.rows[0].legacyLabel = 'tampered'; }, TypeError);
  const migrated = act(act(initial, 'expand'), 'migrate');
  assert.equal(initial.current.phase, 'baseline');
  assert.ok(Object.isFrozen(migrated.current.check.reads[0]));
  assert.ok(Object.isFrozen(act(migrated, 'newAttempt').history[0].events));
});

test('failure history survives a later successful attempt and the model is deterministic', () => {
  let state = act(migrate({ migration: 'corrupt-first' }), 'newAttempt');
  state = act(state, 'begin', config(noOldDependencies));
  state = act(act(act(state, 'expand'), 'migrate'), 'contract');
  assert.equal(state.history[0]?.interrupted, true);
  assert.equal(last(state).impact, 'UNINTERRUPTED');
  assert.equal(state.history[0].events.at(-1).impact, 'INTERRUPTED');
  assert.deepEqual(full(), full());
});

test('unknown commands and unexpected action payloads are rejected strictly', () => {
  const state = begin();
  for (const action of ['forceContract', '', null, {}, 'toString']) {
    assert.throws(() => act(state, action), /Action/);
  }
  assert.throws(() => act(state, 'expand', {}), /payload/);
  assert.throws(() => act(state, 'reset', config()), /payload/);
});
