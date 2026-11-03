'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const lesson = require(process.env.S028_MODEL_PATH
  ? path.resolve(process.env.S028_MODEL_PATH) : '../warmup.js');

test('deadline explicitly aborts warm-up instead of leaving preparation pending', () => {
  let state = lesson.start(lesson.create(), {
    timeout: 3, readyAfter: 5, routing: 'intact', receipt: 'success',
  });
  for (let second = 0; second < 3; second += 1) state = lesson.advance(state);
  const result = lesson.inspect(state);
  assert.equal(result.phase, 'aborted', 'expired warm-up must explicitly abort');
  assert.equal(result.reason, 'WARM_UP_TIMEOUT');
  assert.equal(result.verdict, 'success');
  assert.equal(result.userOutcome, 'safe abort before exposure');
  assert.deepEqual(result.commandRouting, { production: 100, candidate: 0 });
  assert.equal(result.migrations.completed, 0);
});

const defaults = { timeout: 3, readyAfter: 5, routing: 'intact', receipt: 'success' };
const begin = (overrides = {}) => lesson.start(lesson.create(), { ...defaults, ...overrides });
const clone = (value) => JSON.parse(JSON.stringify(value));
const finish = (state) => {
  while (lesson.inspect(state).phase === 'warming') state = lesson.advance(state);
  return state;
};

function rejectsAtomically(state, operation) {
  const before = JSON.stringify(state);
  assert.throws(operation);
  assert.equal(JSON.stringify(state), before);
}

test('empty state is unknown, immutable and cannot advance or abort', () => {
  const state = lesson.create();
  const view = lesson.inspect(state);
  assert.equal(view.phase, 'idle');
  assert.equal(view.verdict, 'unknown');
  assert.deepEqual(view.counts, { attempted: 0, successful: 0, interruptions: 0, unknown: 0 });
  assert.deepEqual(view.migrations, { attempted: 0, completed: 0 });
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.current.actions));
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.history));
  rejectsAtomically(state, () => lesson.advance(state));
  rejectsAtomically(state, () => lesson.abort(state));
  assert.strictEqual(lesson.archiveReset(state), state);
});

test('operator abort is immediate, visible and terminal', () => {
  const warming = begin();
  const aborted = lesson.abort(warming);
  const view = lesson.inspect(aborted);
  assert.equal(view.elapsed, 0);
  assert.equal(view.phase, 'aborted');
  assert.equal(view.reason, 'OPERATOR_ABORT');
  assert.match(view.error, /OPERATOR_ABORT/);
  assert.equal(view.userOutcome, 'safe abort before exposure');
  assert.equal(view.candidateEligible, false);
  assert.equal(view.counts.attempted, 2);
  assert.equal(lesson.inspect(warming).phase, 'warming');
  for (const operation of [
    () => lesson.advance(aborted), () => lesson.abort(aborted), () => lesson.start(aborted, defaults),
  ]) rejectsAtomically(aborted, operation);
  rejectsAtomically(warming, () => lesson.start(warming, defaults));
});

test('early readiness is eligible preparation but never completed migration', () => {
  const state = finish(begin({ timeout: 4, readyAfter: 2 }));
  const view = lesson.inspect(state);
  assert.equal(view.phase, 'ready');
  assert.equal(view.elapsed, 2);
  assert.equal(view.verdict, 'success');
  assert.equal(view.candidateEligible, true);
  assert.equal(view.userOutcome, 'unverified - preparation only, no migration');
  assert.equal(view.error, '');
  assert.deepEqual(view.counts, { attempted: 3, successful: 3, interruptions: 0, unknown: 0 });
  assert.deepEqual(view.migrations, { attempted: 0, completed: 0 });
  rejectsAtomically(state, () => lesson.advance(state));
  rejectsAtomically(state, () => lesson.abort(state));
});

test('all 240 bounded deadline/readiness pairs have an exact deterministic boundary', () => {
  for (let timeout = 1; timeout <= 12; timeout += 1) {
    for (let readyAfter = 1; readyAfter <= 20; readyAfter += 1) {
      const state = finish(begin({ timeout, readyAfter }));
      const view = lesson.inspect(state);
      assert.equal(view.elapsed, Math.min(timeout, readyAfter));
      assert.equal(view.phase, readyAfter < timeout ? 'ready' : 'aborted');
      assert.equal(view.reason, readyAfter < timeout ? 'READY_BEFORE_DEADLINE' : 'WARM_UP_TIMEOUT');
      assert.equal(view.candidateEligible, readyAfter < timeout);
      assert.equal(view.counts.attempted, view.elapsed + 1);
      assert.equal(view.counts.attempted, view.counts.successful + view.counts.interruptions + view.counts.unknown);
      for (const event of view.events) {
        assert.deepEqual(event.commandRouting, { production: 100, candidate: 0 });
        assert.deepEqual(event.observedRouting, { production: 100, candidate: 0 });
      }
      assert.deepEqual(view.migrations, { attempted: 0, completed: 0 });
      assert.deepEqual(lesson.inspect(clone(state)), view);
    }
  }
});

test('each routing/receipt witness yields measured success, failure or unknown', () => {
  for (const routing of ['intact', 'drift', 'missing']) {
    for (const receipt of ['success', 'failure', 'unknown']) {
      const view = lesson.inspect(finish(begin({ timeout: 1, routing, receipt })));
      const expected = routing === 'drift' || receipt === 'failure' ? 'failure'
        : routing === 'missing' || receipt === 'unknown' ? 'unknown' : 'success';
      assert.equal(view.verdict, expected);
      assert.equal(view.counts.attempted, 2);
      assert.equal(view.counts.successful, receipt === 'success' ? 2 : 0);
      assert.equal(view.counts.interruptions, receipt === 'failure' ? 2 : 0);
      assert.equal(view.counts.unknown, receipt === 'unknown' ? 2 : 0);
      assert.equal(view.userOutcome === 'safe abort before exposure', expected === 'success');
      assert.equal(view.candidateEligible, false);
      assert.deepEqual(view.commandRouting, { production: 100, candidate: 0 });
      assert.deepEqual(view.observedRouting, routing === 'missing' ? null
        : routing === 'drift' ? { production: 90, candidate: 10 } : { production: 100, candidate: 0 });
      assert.deepEqual(view.migrations, { attempted: 0, completed: 0 });
    }
  }
});

test('warming remains unknown and failed continuity cannot be masked by readiness', () => {
  assert.equal(lesson.inspect(begin()).verdict, 'unknown');
  assert.equal(lesson.inspect(begin({ receipt: 'failure' })).verdict, 'failure');
  for (const overrides of [{ routing: 'drift' }, { receipt: 'failure' }, { routing: 'missing' }, { receipt: 'unknown' }]) {
    const view = lesson.inspect(finish(begin({ timeout: 4, readyAfter: 1, ...overrides })));
    assert.equal(view.phase, 'ready');
    assert.notEqual(view.verdict, 'success');
    assert.equal(view.candidateEligible, false);
  }
});

test('reset aborts warming explicitly and archives complete inputs, actions and trace', () => {
  const state = lesson.advance(begin());
  const reset = lesson.archiveReset(state);
  const view = lesson.inspect(reset);
  assert.equal(view.runId, 2);
  assert.equal(view.phase, 'idle');
  assert.equal(view.history.length, 1);
  assert.equal(view.evicted, 0);
  const archived = view.history[0];
  assert.deepEqual(archived.config, defaults);
  assert.deepEqual(archived.actions, ['advance', 'archive-abort']);
  assert.equal(archived.reason, 'RESET_ABORT');
  assert.equal(archived.phase, 'aborted');
  assert.equal(archived.counts.attempted, 3);
  assert.deepEqual(archived.events.slice(0, -1), lesson.inspect(state).events);
  assert.equal(archived.events.at(-1).action, 'archive-abort');
  assert.equal(lesson.inspect(state).phase, 'warming');
  assert.strictEqual(lesson.archiveReset(reset), reset);
});

test('failed and unknown runs survive a later successful safe-abort run', () => {
  let state = lesson.archiveReset(finish(begin({ timeout: 1, receipt: 'failure' })));
  state = lesson.archiveReset(finish(lesson.start(state, { ...defaults, timeout: 1, receipt: 'unknown' })));
  state = lesson.archiveReset(finish(lesson.start(state, { ...defaults, timeout: 1 })));
  const view = lesson.inspect(state);
  assert.deepEqual(view.history.map((run) => run.verdict), ['failure', 'unknown', 'success']);
  assert.deepEqual(view.history.map((run) => run.counts.interruptions), [2, 0, 0]);
  assert.deepEqual(view.history.map((run) => run.counts.unknown), [0, 2, 0]);
  assert.deepEqual(view.history.map((run) => run.runId), [1, 2, 3]);
  const previous = clone(view.history);
  state = lesson.archiveReset(lesson.abort(lesson.start(state, defaults)));
  const later = lesson.inspect(state);
  assert.equal(later.evicted, 1);
  assert.deepEqual(later.history.slice(0, 2), previous.slice(1));
  assert.deepEqual(later.history.map((run) => run.runId), [2, 3, 4]);
});

test('invalid numeric inputs are rejected without coercion or partial start', () => {
  for (const key of ['timeout', 'readyAfter']) {
    for (const value of [0, -1, 1.5, NaN, Infinity, -Infinity, '3', null, undefined, true, 1n, Symbol('3'), {}, []]) {
      const state = lesson.create();
      rejectsAtomically(state, () => lesson.start(state, { ...defaults, [key]: value }));
    }
    const state = lesson.create();
    rejectsAtomically(state, () => lesson.start(state, { ...defaults, [key]: lesson.LIMITS[key] + 1 }));
  }
});

test('unknown enums, extra fields, prototypes, symbols and accessors are rejected', () => {
  for (const input of [
    null, [], {}, Object.create(defaults), { ...defaults, extra: true },
    { ...defaults, routing: '100/0' }, { ...defaults, receipt: 'ok' },
    { ...defaults, [Symbol('extra')]: true },
    Object.defineProperty({ ...defaults }, 'timeout', { value: 3, enumerable: false }),
    Object.defineProperty({ ...defaults }, 'receipt', { get() { throw new Error('must not execute'); } }),
  ]) {
    const state = lesson.create();
    rejectsAtomically(state, () => lesson.start(state, input));
  }
  const input = { ...defaults };
  const state = lesson.start(lesson.create(), input);
  input.timeout = 1;
  assert.equal(lesson.inspect(state).config.timeout, 3);
  assert.ok(Object.isFrozen(state.current.config));
});

test('strict state schema rejects forged current state and impossible action replay', () => {
  const invalid = [
    null, [], {}, { ...clone(lesson.create()), extra: 1 },
    { ...clone(lesson.create()), version: 2 },
    { ...clone(lesson.create()), runId: 0 },
    { ...clone(lesson.create()), evicted: '0' },
    { ...clone(lesson.create()), current: { config: null, actions: ['advance'] } },
    { ...clone(begin()), current: { config: defaults, actions: ['promote'] } },
    { ...clone(begin()), current: { config: defaults, actions: ['archive-abort'] } },
    { ...clone(begin()), current: { config: defaults, actions: ['abort', 'advance'] } },
    { ...clone(begin()), current: { config: defaults, actions: ['advance', 'advance', 'advance', 'advance'] } },
    { ...clone(begin()), current: { config: defaults, actions: Array(13).fill('advance') } },
    { ...clone(begin()), current: { config: defaults, actions: new Array(1) } },
    { ...clone(begin()), current: { config: defaults, actions: Object.assign([], { extra: 'advance' }) } },
    { ...clone(begin()), current: { config: defaults, actions: Object.defineProperty(['advance'], '0', { enumerable: false }) } },
  ];
  for (const state of invalid) {
    assert.throws(() => lesson.inspect(state));
    assert.throws(() => lesson.archiveReset(state));
    assert.throws(() => lesson.advance(state));
    assert.throws(() => lesson.abort(state));
    assert.throws(() => lesson.start(state, defaults));
  }
});

test('archived state is revalidated instead of trusting IDs or precomputed results', () => {
  const valid = lesson.archiveReset(lesson.abort(begin()));
  const mutations = [
    (state) => { state.history[0].runId = 2; },
    (state) => { state.history[0].actions = []; },
    (state) => { state.history[0].config = null; },
    (state) => { state.history[0].verdict = 'success'; },
    (state) => { state.history[0].config.timeout = NaN; },
    (state) => { state.history = []; },
    (state) => { state.evicted = 1; },
    (state) => { state.runId = 3; },
    (state) => { state.history[0].actions = ['archive-abort', 'abort']; },
    (state) => { state.history[0].actions[0] = 'promote'; },
    (state) => { state.history[0].actions = new Array(1); },
  ];
  for (const mutate of mutations) {
    const state = clone(valid);
    mutate(state);
    assert.throws(() => lesson.inspect(state));
    assert.throws(() => lesson.archiveReset(state));
  }
  assert.equal(lesson.inspect(valid).history[0].verdict, 'success');
});

test('run/history bounds have counted eviction and explicit run-ID exhaustion', () => {
  let state = lesson.create();
  for (let id = 1; id < lesson.LIMITS.runId; id += 1) {
    state = lesson.archiveReset(lesson.abort(lesson.start(state, defaults)));
  }
  const view = lesson.inspect(state);
  assert.equal(view.runId, 1000);
  assert.equal(view.history.length, 3);
  assert.equal(view.evicted, 996);
  assert.deepEqual(view.history.map((run) => run.runId), [997, 998, 999]);
  assert.strictEqual(lesson.archiveReset(state), state);
  state = lesson.abort(lesson.start(state, defaults));
  rejectsAtomically(state, () => lesson.archiveReset(state));
  assert.match(lesson.inspect(state).error, /OPERATOR_ABORT/);
});

test('state, view and archived data are deeply frozen and deterministic', () => {
  const state = lesson.archiveReset(finish(begin()));
  const view = lesson.inspect(state);
  assert.ok(Object.isFrozen(state.history[0].config));
  assert.ok(Object.isFrozen(view.history[0].events[0].commandRouting));
  assert.throws(() => { state.history[0].config.timeout = 1; }, TypeError);
  assert.throws(() => { view.history[0].events[0].receipt = 'failure'; }, TypeError);
  assert.deepEqual(lesson.inspect(clone(state)), view);
});
