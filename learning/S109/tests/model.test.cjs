'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const run = (level, strategy, state = model.initial()) => model.transition(
  model.transition(state, { type: 'rehearse', level, strategy }), { type: 'inspect' },
);

test('the standalone stub and final model expose the same loadable API', () => {
  for (const name of ['initial', 'transition', 'summarize']) assert.equal(typeof model[name], 'function');
  assert.equal(model.BANNER, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(model.MAX_ATTEMPTS, 6);
  assert.equal(model.summarize(model.initial()).phase, 'ready');
});

test('raising outbound demand requires inspection and preserves negative budget evidence', () => {
  const original = model.initial();
  const pending = model.transition(original, { type: 'rehearse', level: 'raised', strategy: 'direct' });
  const before = model.summarize(pending);
  assert.equal(before.phase, 'pending');
  assert.equal(before.current.demand, 96);
  assert.equal(before.current.connections, 96);
  assert.equal(before.current.result, 'pending');
  assert.equal(before.current.observation, null);
  assert.equal(before.counts.positive, 0);
  const complete = model.summarize(model.transition(pending, { type: 'inspect' }));
  assert.equal(complete.current.result, 'negative');
  assert.deepEqual(complete.current.observation, {
    capacity: 64, modelPorts: 96, journeys: 20, completed: 12, failed: 8, p95Ms: 240,
    syntheticSnat: { used: 64, capacity: 64, label: 'Fictional SNAT data only' },
  });
  assert.equal(complete.current.capacityResult, 'negative');
  assert.equal(complete.current.journeyResult, 'negative');
  assert.equal(complete.nativeSnat.status, 'unverified');
  assert.equal(complete.nativeSnat.signal, null);
  assert.deepEqual(model.summarize(original).history, []);
});

test('baseline and pooling positives use fixed fictional observations, never native SNAT proof', () => {
  const baseline = model.summarize(run('baseline', 'direct'));
  const raised = model.summarize(run('raised', 'pooled'));
  assert.equal(baseline.current.result, 'positive');
  assert.equal(baseline.current.connections, 12);
  assert.equal(raised.current.demand, 96);
  assert.equal(raised.current.connections, 24);
  assert.equal(raised.current.observation.modelPorts, 24);
  assert.equal(raised.current.observation.completed, 20);
  assert.equal(raised.current.observation.failed, 0);
  assert.equal(raised.current.observation.p95Ms, 90);
  assert.equal(raised.current.result, 'positive');
  assert.equal(raised.nativeSnat.status, 'unverified');
  assert.equal(raised.nativeSnat.signal, null);
});

test('port headroom cannot hide failed journeys or over-budget latency', () => {
  const view = model.summarize(run('ceiling', 'pooled'));
  assert.equal(view.current.capacityResult, 'positive');
  assert.equal(view.current.journeyResult, 'negative');
  assert.equal(view.current.result, 'negative');
  assert.equal(view.current.observation.failed, 4);
  assert.equal(view.current.observation.p95Ms, 175);
});

test('all eight fixed fixture combinations have exact verdicts and unknown native SNAT', () => {
  const verdicts = {
    baseline: { direct: 'positive', pooled: 'positive' },
    raised: { direct: 'negative', pooled: 'positive' },
    ceiling: { direct: 'negative', pooled: 'negative' },
    missing: { direct: 'unknown', pooled: 'unknown' },
  };
  for (const [level, strategies] of Object.entries(verdicts)) {
    for (const [strategy, verdict] of Object.entries(strategies)) {
      const current = model.summarize(run(level, strategy));
      assert.equal(current.current.result, verdict, `${level}/${strategy}`);
      assert.deepEqual(current.nativeSnat, {
        status: 'unverified', signal: null,
        reason: 'No native Azure SNAT evidence supplied. App counts, model ports and fictional SNAT data are not proof.',
      });
      if (level === 'missing') {
        assert.equal(current.current.observation.capacity, null);
        assert.equal(current.current.observation.completed, null);
        assert.equal(current.current.observation.failed, null);
        assert.equal(current.current.observation.p95Ms, null);
        assert.equal(current.current.observation.syntheticSnat, null);
        assert.equal(current.current.capacityResult, 'unknown');
        assert.equal(current.current.journeyResult, 'unknown');
      }
    }
  }
});

test('history retains failed, positive, unknown and pending attempts without inflation', () => {
  let state = run('raised', 'direct');
  state = run('raised', 'pooled', state);
  state = run('missing', 'pooled', state);
  state = model.transition(state, { type: 'rehearse', level: 'ceiling', strategy: 'pooled' });
  const view = model.summarize(state);
  assert.equal(view.attempts, 4);
  assert.deepEqual(view.counts, { positive: 1, negative: 1, unknown: 1, pending: 1 });
  assert.equal(view.history.length, 7);
  assert.deepEqual(view.history.filter((row) => row.type === 'inspect').map((row) => row.result),
    ['negative', 'positive', 'unknown']);
  assert.deepEqual(model.summarize(model.initial()).counts,
    { positive: 0, negative: 0, unknown: 0, pending: 0 });
});

test('exact typed input, malformed histories and forged states fail without mutation', () => {
  const state = run('raised', 'direct');
  const snapshot = JSON.stringify(state);
  const good = { type: 'rehearse', level: 'raised', strategy: 'pooled' };
  const accessor = { ...good };
  Object.defineProperty(accessor, 'level', { get() { throw new Error('getter executed'); }, enumerable: true });
  const invalid = [
    null, undefined, true, 4, 'rehearse', [], {}, { ...good, level: 4 },
    { ...good, level: '4' }, { ...good, level: ' raised ' }, { ...good, strategy: 'Direct' },
    { ...good, connections: 96 }, { ...good, nativeSnat: 'verified' },
    { type: 'inspect', extra: false }, { type: 'reset' },
    Object.assign(Object.create({ inherited: true }), good), accessor,
    { ...good, [Symbol('hidden')]: 1 },
  ];
  for (const command of invalid) {
    assert.throws(() => model.transition(state, command), { code: 'INPUT' });
    assert.equal(JSON.stringify(state), snapshot);
  }
  const forged = [
    null, {}, { ...state, schemaVersion: '1' }, { ...state, current: { result: 'positive' } },
    { schemaVersion: 1, history: [{ type: 'inspect' }] },
    { schemaVersion: 1, history: [{ type: 'rehearse', level: 'raised', strategy: 'pooled' }, { type: 'inspect' }, { type: 'inspect' }] },
    { schemaVersion: 1, history: new Array(1) },
    { schemaVersion: 1, history: Array(14).fill({ type: 'inspect' }) },
    { schemaVersion: 1, history: Object.assign([], { extra: 1 }) },
  ];
  for (const candidate of forged) {
    assert.throws(() => model.summarize(candidate), { code: 'STATE' });
    assert.throws(() => model.transition(candidate, good), { code: 'STATE' });
  }
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.history));
  assert.ok(state.history.every(Object.isFrozen));
});

test('out-of-order actions and the six-attempt limit retain state', () => {
  assert.throws(() => model.transition(model.initial(), { type: 'inspect' }), { code: 'ORDER' });
  const pending = model.transition(model.initial(), { type: 'rehearse', level: 'raised', strategy: 'direct' });
  assert.throws(() => model.transition(pending, { type: 'rehearse', level: 'raised', strategy: 'pooled' }), { code: 'ORDER' });
  let state = model.transition(pending, { type: 'inspect' });
  assert.throws(() => model.transition(state, { type: 'inspect' }), { code: 'ORDER' });
  for (let count = 1; count < 6; count++) state = run('raised', 'pooled', state);
  const before = JSON.stringify(state);
  assert.equal(model.summarize(state).history.length, 12);
  assert.throws(() => model.transition(state, { type: 'rehearse', level: 'baseline', strategy: 'direct' }), { code: 'LIMIT' });
  assert.equal(JSON.stringify(state), before);
  const detachedView = model.summarize(state);
  detachedView.history.splice(0);
  assert.equal(model.summarize(state).history.length, 12);
});
