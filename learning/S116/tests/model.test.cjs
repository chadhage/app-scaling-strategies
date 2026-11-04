'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const input = (scenarioId = 'supported', actionId = 'verify-contract') => ({ scenarioId, actionId });
const copy = (value) => JSON.parse(JSON.stringify(value));
const check = (result, id) => result.checks.find((entry) => entry.id === id);

test('both serving regions retain one observed writer and the read-your-writes contract', () => {
  const result = model.evaluate(input());
  assert.equal(result.overall, 'positive');
  assert.equal(result.servedUsers, 2);
  assert.equal(result.observedWriter, 'region-one');
  assert.equal(result.write.effects, 1);
  assert.equal(result.write.committedRevision, 11);
  assert.deepEqual(result.routes, [
    { servingRegion: 'region-one', targetWriter: 'region-one', route: 'local' },
    { servingRegion: 'region-two', targetWriter: 'region-one', route: 'forwarded' },
  ]);
  assert.equal(check(result, 'read-your-writes').status, 'positive');
  assert.deepEqual(result.reads.map((read) => read.revision), [11, 11]);
  assert.equal(result.multiWriterSupported, false);
});

test('serving only never supplies unobserved writer or mutation proof', () => {
  for (const scenarioId of model.scenarioIds) {
    const result = model.evaluate(input(scenarioId, 'inspect-serving'));
    assert.equal(result.overall, 'unknown');
    assert.equal(result.servedUsers, 2);
    assert.equal(check(result, 'both-serving').status, 'positive');
    assert.equal(result.observedWriter, null);
    assert.equal(result.write, null);
    assert.equal(result.reads, null);
    assert.equal(check(result, 'writer-topology').status, 'unknown');
  }
});

test('stale asynchronous reader fails the declared session minimum despite active serving', () => {
  const result = model.evaluate(input('stale-reader'));
  assert.equal(result.overall, 'negative');
  assert.equal(result.servedUsers, 2);
  assert.equal(result.write.status, 'committed');
  assert.equal(result.reads[1].revision, 10);
  assert.equal(result.reads[1].replicationLagMs, 40);
  assert.equal(result.reads[1].requiredRevision, 11);
  assert.equal(check(result, 'read-your-writes').status, 'negative');
});

test('missing actual writer observations remain null and unknown', () => {
  const result = model.evaluate(input('writer-unobserved'));
  assert.equal(result.overall, 'unknown');
  assert.equal(result.observedWriter, null);
  assert.equal(result.write.observedEpoch, null);
  assert.equal(result.write.durationMs, null);
  assert.equal(result.write.effects, null);
  assert.equal(result.write.committedRevision, null);
  assert.equal(check(result, 'writer-topology').status, 'unknown');
  assert.equal(check(result, 'mutation-outcome').status, 'unknown');
});

test('fencing rejection is positive protection but a negative mutation journey', () => {
  const result = model.evaluate(input('stale-epoch'));
  assert.equal(result.overall, 'negative');
  assert.equal(result.write.observedEpoch, 6);
  assert.equal(result.write.status, 'rejected-stale-epoch');
  assert.equal(result.write.effects, 0);
  assert.equal(result.write.committedRevision, null);
  assert.equal(check(result, 'epoch-fencing').status, 'positive');
  assert.equal(check(result, 'mutation-outcome').status, 'negative');
});

test('optimistic conflict handling rejects rather than overwrites', () => {
  const result = model.evaluate(input('version-conflict'));
  assert.equal(result.overall, 'negative');
  assert.equal(result.write.expectedRevision, 9);
  assert.equal(result.write.currentRevision, 10);
  assert.equal(result.write.status, 'rejected-revision-conflict');
  assert.equal(result.write.effects, 0);
  assert.equal(check(result, 'conflict-handling').status, 'positive');
  assert.equal(check(result, 'mutation-outcome').status, 'negative');
});

test('a second serving origin is not a supported direct writer', () => {
  const result = model.evaluate(input('local-writer'));
  assert.equal(result.overall, 'negative');
  assert.equal(result.servedUsers, 2);
  assert.equal(result.write.targetWriter, 'region-two');
  assert.equal(result.write.status, 'rejected-unsupported-writer');
  assert.equal(result.write.effects, 0);
  assert.equal(result.multiWriterSupported, false);
  assert.equal(check(result, 'writer-topology').status, 'negative');
});

test('all fixed observations are deterministic and bounded measurements', () => {
  for (const scenarioId of model.scenarioIds) {
    for (const actionId of model.actionIds) {
      const result = model.evaluate(input(scenarioId, actionId));
      assert.deepEqual(result, model.evaluate(input(scenarioId, actionId)));
      assert.deepEqual(result.serving.map((entry) => entry.durationMs), [18, 24]);
      assert.equal(result.checks.length, 6);
      assert.ok(['positive', 'negative', 'unknown'].includes(result.overall));
    }
  }
});

test('input schema rejects coercion, unknown fields, symbols, inheritance and accessors', () => {
  const inherited = Object.assign(Object.create({ inherited: true }), input());
  const accessor = { actionId: 'verify-contract' };
  Object.defineProperty(accessor, 'scenarioId', { enumerable: true, get() { throw Error('getter ran'); } });
  const hidden = input();
  Object.defineProperty(hidden, 'extra', { value: undefined });
  const bad = [
    null, [], 'supported', 0, true, {}, { ...input(), scenarioId: 1 },
    { ...input(), actionId: false }, { ...input(), scenarioId: ' supported' },
    { ...input(), actionId: 'multi-write' }, { ...input(), extra: undefined },
    { ...input(), [Symbol('extra')]: 1 }, inherited, accessor, hidden,
  ];
  const state = model.createState();
  const before = copy(state);
  for (const value of bad) assert.throws(() => model.record(state, value), /input/i);
  assert.deepEqual(state, before);
});

test('replayed state rejects forged measurements, shape, sequence and current IDs', () => {
  const valid = model.record(model.createState(), input('stale-reader'));
  const variants = [];
  const mutate = (change) => { const state = copy(valid); change(state); variants.push(state); };
  mutate((state) => { state.history[0].result.overall = 'positive'; });
  mutate((state) => { state.history[0].result.write.effects = 9; });
  mutate((state) => { state.history[0].input.actionId = 'inspect-serving'; });
  mutate((state) => { state.history[0].id = 2; });
  mutate((state) => { state.currentId = '1'; });
  mutate((state) => { state.currentId = 0; });
  mutate((state) => { state.extra = undefined; });
  mutate((state) => { state.history.extra = true; });
  mutate((state) => { delete state.history[0]; });
  mutate((state) => { state.history[0].result.reads[1].revision = '10'; });
  mutate((state) => { state.history[0].result[Symbol('extra')] = 1; });
  mutate((state) => { Object.setPrototypeOf(state.history[0], { forged: true }); });
  mutate((state) => {
    Object.defineProperty(state.history[0], 'id', { enumerable: true, get() { throw Error('getter ran'); } });
  });
  for (const state of [null, [], ...variants]) {
    assert.throws(() => model.record(state, input()), /state/i);
    assert.throws(() => model.reset(state), /state/i);
    assert.throws(() => model.summarize(state), /state/i);
  }
  assert.equal(valid.history[0].result.overall, 'negative');
});

test('success and reset retain earlier negative and unknown results and the allowance', () => {
  let state = model.createState();
  for (const scenario of ['stale-reader', 'writer-unobserved', 'supported']) {
    state = model.record(state, input(scenario));
  }
  assert.deepEqual(model.summarize(state), { used: 3, remaining: 9, positive: 1, negative: 1, unknown: 1 });
  const reset = model.reset(state);
  assert.equal(reset.currentId, null);
  assert.deepEqual(reset.history, state.history);
  assert.deepEqual(model.summarize(reset), model.summarize(state));
  for (let i = reset.history.length; i < 12; i += 1) state = model.record(state, input());
  assert.equal(model.summarize(state).remaining, 0);
  assert.throws(() => model.record(state, input()), /12.*observation/i);
  assert.equal(model.reset(state).history.length, 12);
});

test('model constants and returned history are immutable', () => {
  const state = model.record(model.createState(), input());
  assert.ok(Object.isFrozen(model.contract));
  assert.ok(Object.isFrozen(model.scenarioIds));
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.history[0].result.write));
  assert.throws(() => { state.history[0].result.write.effects = 100; }, TypeError);
  assert.throws(() => { model.contract.writer = 'region-two'; }, TypeError);
});
