'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('..\\model.js');
const config = (changes = {}) => ({ ...model.DEFAULTS, ...changes });
const last = (state) => state.history.at(-1);
const run = (changes = {}) => last(model.run(model.createState(), config(changes)));

test('complete synchronization and exclusive ownership allow assignment', () => {
  const result = run();
  assert.equal(result.verdict, 'success', 'the loadable model must permit the fully synchronized, exclusively owned handoff');
  assert.equal(result.route, 'shard-b');
  assert.equal(result.assignmentAllowed, true);
  assert.deepEqual(result.synchronizedIds, result.requiredIds);
  assert.equal(result.metrics.missingCommitted, 0);
  assert.equal(result.metrics.candidateWriters, 1);
  assert.equal(result.metrics.newWriteEffects, 1);
  assert.equal(result.metrics.staleWriterAccepted, 0);
  assert.equal(result.metrics.duplicateEffects, 0);
  assert.deepEqual(result.writeProbes.map((probe) => probe.outcome), ['accepted', 'rejected']);
  assert.equal(result.writeProbes[0].operationId, result.writeProbes[1].operationId);
  assert.equal(result.destinationIds.filter((id) => id === result.writeProbes[0].operationId).length, 1);
  assert.deepEqual(result.activeWriters, ['shard-b']);
  assert.equal(result.writerEpoch, 2);
  assert.ok(result.trace.findIndex((entry) => entry.stage === 'synchronize') < result.trace.findIndex((entry) => entry.stage === 'assign'));
});

test('assignment before synchronization retains source and exposes missing committed effects', () => {
  const result = run({ assignment: 'before-sync' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.assignmentAllowed, false);
  assert.equal(result.route, 'shard-a');
  assert.deepEqual(result.activeWriters, ['shard-a']);
  assert.equal(result.writerEpoch, 1);
  assert.equal(result.metrics.missingCommitted, 2);
  assert.equal(result.metrics.newWriteEffects, 0);
  assert.equal(result.metrics.staleWriterAccepted, null);
  assert.equal(result.metrics.duplicateEffects, null);
  assert.deepEqual(result.writeProbes, []);
  assert.equal(result.gates.find((gate) => gate.id === 'synchronization-order').status, 'fail');
  assert.ok(result.trace.findIndex((entry) => entry.stage === 'assign') < result.trace.findIndex((entry) => entry.stage === 'synchronize'));
});

test('snapshot-only candidate cannot hide writes committed while it was copied', () => {
  const result = run({ initialCommitted: 2, writesDuringCopy: 3, synchronization: 'snapshot-only' });
  assert.deepEqual(result.copiedIds, ['effect-1', 'effect-2']);
  assert.deepEqual(result.requiredIds, ['effect-1', 'effect-2', 'effect-3', 'effect-4', 'effect-5']);
  assert.equal(result.metrics.requiredCommitted, 5);
  assert.equal(result.metrics.copiedCommitted, 2);
  assert.equal(result.metrics.missingCommitted, 3);
  assert.equal(result.verdict, 'failure');
  assert.equal(result.route, 'shard-a');
});

test('synchronized data never compensates for two candidate writer owners', () => {
  const result = run({ ownership: 'ambiguous' });
  assert.equal(result.metrics.missingCommitted, 0);
  assert.equal(result.metrics.candidateWriters, 2);
  assert.deepEqual(result.candidateWriters, ['shard-a', 'shard-b']);
  assert.equal(result.verdict, 'failure');
  assert.equal(result.assignmentAllowed, false);
  assert.deepEqual(result.activeWriters, ['shard-a']);
  assert.equal(result.metrics.newWriteEffects, 0);
  assert.equal(result.metrics.duplicateEffects, null);
});

test('unobserved data or ownership stays unknown, blocks assignment, and does not invent probe results', () => {
  for (const changes of [
    { synchronization: 'unobserved' },
    { ownership: 'unobserved' },
    { synchronization: 'unobserved', ownership: 'unobserved' },
  ]) {
    const result = run(changes);
    assert.equal(result.verdict, 'unknown');
    assert.equal(result.assignmentAllowed, false);
    assert.equal(result.route, 'shard-a');
    assert.equal(result.metrics.newWriteEffects, 0);
    assert.equal(result.metrics.staleWriterAccepted, null);
    assert.equal(result.metrics.duplicateEffects, null);
    if (changes.synchronization === 'unobserved') {
      assert.equal(result.synchronizedIds, null);
      assert.equal(result.metrics.missingCommitted, null);
    }
    if (changes.ownership === 'unobserved') assert.equal(result.metrics.candidateWriters, null);
  }
});

test('known failures dominate unknown observations', () => {
  assert.equal(run({ synchronization: 'unobserved', ownership: 'ambiguous' }).verdict, 'failure');
  assert.equal(run({ assignment: 'before-sync', ownership: 'unobserved' }).verdict, 'failure');
  assert.equal(run({ synchronization: 'snapshot-only', ownership: 'unobserved' }).verdict, 'failure');
});

test('all 324 bounded combinations are deterministic and never accept ambiguous or unobserved handoff', () => {
  let cases = 0;
  for (let initialCommitted = 1; initialCommitted <= 6; initialCommitted += 1) {
    for (let writesDuringCopy = 1; writesDuringCopy <= 3; writesDuringCopy += 1) {
      for (const assignment of ['before-sync', 'after-sync']) {
        for (const synchronization of ['complete', 'snapshot-only', 'unobserved']) {
          for (const ownership of ['exclusive', 'ambiguous', 'unobserved']) {
            const input = { initialCommitted, writesDuringCopy, assignment, synchronization, ownership };
            const result = model.evaluate(input);
            assert.deepEqual(result, model.evaluate(input));
            const success = assignment === 'after-sync' && synchronization === 'complete' && ownership === 'exclusive';
            const failure = assignment === 'before-sync' || synchronization === 'snapshot-only' || ownership === 'ambiguous';
            assert.equal(result.verdict, success ? 'success' : failure ? 'failure' : 'unknown');
            assert.equal(result.assignmentAllowed, success);
            assert.equal(result.route, success ? 'shard-b' : 'shard-a');
            assert.equal(result.metrics.requiredCommitted, initialCommitted + writesDuringCopy);
            assert.equal(new Set(result.requiredIds).size, result.requiredIds.length);
            cases += 1;
          }
        }
      }
    }
  }
  assert.equal(cases, 324);
});

test('numeric types, bounds, enums, extra fields, prototypes and accessors are guarded', () => {
  for (const initialCommitted of [0, 7, 1.5, NaN, Infinity, '3', null, undefined]) {
    assert.throws(() => model.evaluate(config({ initialCommitted })), /initialCommitted/);
  }
  for (const writesDuringCopy of [0, 4, 1.5, NaN, '2', null]) {
    assert.throws(() => model.evaluate(config({ writesDuringCopy })), /writesDuringCopy/);
  }
  for (const key of ['assignment', 'synchronization', 'ownership']) {
    for (const invalid of ['', 'COMPLETE', 'unexpected', null, 2]) {
      assert.throws(() => model.evaluate(config({ [key]: invalid })), new RegExp(key));
    }
  }
  for (const input of [null, [], {}, Object.assign(Object.create({ foreign: true }), config()), config({ extra: true })]) {
    assert.throws(() => model.evaluate(input), /config|field|plain/i);
  }
  const accessor = config();
  Object.defineProperty(accessor, 'ownership', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.throws(() => model.evaluate(accessor), /data|accessor/i);
  assert.throws(() => model.evaluate(config(), 0), /attempt/);
  assert.throws(() => model.evaluate(config(), 9), /attempt/);
});

test('state is immutable, earlier results are retained, and attempt nine is rejected without mutation', () => {
  const original = model.createState();
  let state = original;
  for (let index = 0; index < model.MAX_ATTEMPTS; index += 1) {
    const before = JSON.stringify(state);
    const next = model.run(state, config({ assignment: index % 2 ? 'before-sync' : 'after-sync' }));
    assert.equal(JSON.stringify(state), before);
    assert.equal(next.history.length, index + 1);
    assert.deepEqual(next.history.slice(0, -1), state.history);
    assert.equal(Object.isFrozen(next.history.at(-1).trace), true);
    state = next;
  }
  assert.deepEqual(original.history, []);
  const full = JSON.stringify(state);
  assert.throws(() => model.run(state, config()), /8|limit/i);
  assert.equal(JSON.stringify(state), full);
  assert.throws(() => { state.history[0].route = 'forged'; }, TypeError);
});

test('forged history, metrics, routes and state shape are rejected rather than trusted', () => {
  const valid = model.run(model.createState(), config());
  const clone = () => JSON.parse(JSON.stringify(valid));
  const mutations = [
    (state) => { state.schemaVersion = 2; },
    (state) => { state.extra = 1; },
    (state) => { state.history[0].route = 'shard-a'; },
    (state) => { state.history[0].metrics.missingCommitted = 99; },
    (state) => { state.history[0].attempt = 2; },
    (state) => { state.history[0].trace = []; },
    (state) => { state.history[0].config.ownership = 'ambiguous'; },
    (state) => { state.history[0].requiredIds.push('forged'); },
  ];
  for (const mutate of mutations) {
    const forged = clone();
    mutate(forged);
    const before = JSON.stringify(forged);
    assert.throws(() => model.run(forged, config()), /state|history/i);
    assert.equal(JSON.stringify(forged), before);
  }
  assert.throws(() => model.run(null, config()), /state/);
  assert.throws(() => model.run({ schemaVersion: 1, history: [null] }, config()), /history/);
  assert.throws(() => model.run({ schemaVersion: 1, history: Array(2) }, config()), /history/);
  assert.throws(() => model.run({ schemaVersion: 1, history: Array(1000000000) }, config()), /history/);
});
