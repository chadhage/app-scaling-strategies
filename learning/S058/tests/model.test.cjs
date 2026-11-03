'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');
const defaults = { strategy: 'pin-exact', workers: 'overlap', historyEvidence: 'complete' };
const run = (input = {}, state = model.createState()) => model.conduct(state, { ...defaults, ...input });

test('public API is loadable without missing code or tools', () => {
  for (const name of ['createState', 'conduct', 'reset']) assert.equal(typeof model[name], 'function');
  assert.equal(model.MAX_ATTEMPTS, 6);
  assert.equal(model.fixtures.length, 3);
});

test('exact pinning preserves all recorded versions and modeled continuations', () => {
  const { result } = run();
  assert.equal(result.verdict, 'PASSED');
  assert.deepEqual(result.rows.map((row) => row.worker), ['1.0', '1.0', '2.0']);
  assert.deepEqual(result.rows.map((row) => row.next), ['ShipOrder', 'ReserveStock', 'ShipOrder']);
  assert.equal(result.metrics.started, 3);
  assert.equal(result.metrics.matched, 3);
  assert.equal(result.metrics.replayedEvents, 6);
});

test('explicit branch preserves the old command sequence on a version 2.0 worker', () => {
  const { result } = run({ strategy: 'explicit-branch', workers: 'new-only' });
  assert.equal(result.verdict, 'PASSED');
  assert.deepEqual(result.rows.map((row) => row.worker), ['2.0', '2.0', '2.0']);
  assert.deepEqual(result.rows.map((row) => row.definition), ['1.0', '1.0', '2.0']);
  assert.deepEqual(result.rows[0].expected, ['ReadOrder', 'ReserveStock', 'ShipOrder']);
});

test('latest code fails old histories at the first differing recorded command', () => {
  const { result } = run({ strategy: 'latest' });
  assert.equal(result.verdict, 'FAILED');
  assert.equal(result.metrics.mismatches, 1);
  assert.equal(result.metrics.matched, 1);
  assert.equal(result.rows[0].divergence.index, 1);
  assert.equal(result.rows[0].divergence.expected, 'RiskCheck');
  assert.equal(result.rows[0].divergence.recorded, 'ReserveStock');
  assert.equal(result.rows[0].next, null);
});

test('a shorter old prefix is not enough to certify version-incompatible continuation', () => {
  const { result } = run({ strategy: 'latest' });
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1].outcome, 'version-mismatch');
  assert.equal(result.rows[1].next, null);
  assert.equal(result.metrics.blocked, 1);
  assert.equal(result.metrics.matched, 1);
});

test('exact pinning cannot continue when the required old worker is unavailable', () => {
  const { result } = run({ workers: 'new-only' });
  assert.equal(result.verdict, 'FAILED');
  assert.equal(result.metrics.blocked, 2);
  assert.equal(result.metrics.matched, 1);
  assert.deepEqual(result.rows.slice(0, 2).map((row) => row.outcome), ['worker-unavailable', 'worker-unavailable']);
});

test('incompatible recorded history fails despite an explicit matching version label', () => {
  const { result } = run({ strategy: 'explicit-branch', workers: 'new-only', historyEvidence: 'incompatible' });
  assert.equal(result.verdict, 'FAILED');
  assert.equal(result.metrics.mismatches, 1);
  assert.equal(result.rows[1].divergence.recorded, 'ChargeCard');
  assert.equal(result.rows[1].divergence.expected, 'ReserveStock');
  assert.equal(result.rows[1].divergence.index, 1);
});

test('exact pinning also detects damaged recorded commands without rewriting them', () => {
  const { result } = run({ historyEvidence: 'incompatible' });
  assert.equal(result.verdict, 'FAILED');
  assert.deepEqual(result.rows[1].recorded, ['ReadOrder', 'ChargeCard']);
  assert.equal(result.rows[1].next, null);
  assert.deepEqual(model.fixtures[1].recorded, ['ReadOrder']);
});

test('missing history observation is unknown with the full started denominator', () => {
  const { result } = run({ historyEvidence: 'missing' });
  assert.equal(result.verdict, 'UNKNOWN');
  assert.equal(result.metrics.started, 3);
  assert.equal(result.metrics.matched, 2);
  assert.equal(result.metrics.unknown, 1);
  assert.equal(result.rows[2].outcome, 'unknown');
  assert.equal(result.rows[2].next, null);
});

test('known incompatibility dominates an independent missing observation', () => {
  const { result } = run({ strategy: 'latest', historyEvidence: 'missing' });
  assert.equal(result.verdict, 'FAILED');
  assert.equal(result.metrics.unknown, 1);
  assert.equal(result.metrics.mismatches, 1);
  assert.equal(result.metrics.blocked, 1);
  assert.equal(result.metrics.started, 3);
});

test('all 18 configurations partition the denominator and create no external effects', () => {
  for (const strategy of ['pin-exact', 'explicit-branch', 'latest']) {
    for (const workers of ['overlap', 'new-only']) {
      for (const historyEvidence of ['complete', 'missing', 'incompatible']) {
        const { result } = run({ strategy, workers, historyEvidence });
        const m = result.metrics;
        assert.equal(m.started, 3);
        assert.equal(m.matched + m.mismatches + m.blocked + m.unknown, 3);
        assert.equal(m.externalEffects, 0);
        assert.equal(result.rows.length, 3);
      }
    }
  }
});

test('runs are deterministic, deeply immutable, and never mutate caller input or state', () => {
  const state = model.createState();
  const input = { ...defaults };
  const before = JSON.stringify({ state, input });
  const first = model.conduct(state, input);
  assert.equal(first.state.attempts.length, 1);
  assert.equal(JSON.stringify({ state, input }), before);
  assert.deepEqual(first, model.conduct(state, input));
  assert.ok(Object.isFrozen(first.state.attempts[0].result.rows[0].recorded));
  assert.ok(Object.isFrozen(model.fixtures[0].recorded));
});

test('a later successful choice retains the earlier failing evidence', () => {
  const first = run({ strategy: 'latest' });
  const second = run({ strategy: 'explicit-branch', workers: 'new-only' }, first.state);
  assert.equal(second.state.attempts.length, 2);
  assert.equal(second.state.attempts[0].result.verdict, 'FAILED');
  assert.equal(second.state.attempts[1].result.verdict, 'PASSED');
  assert.equal(second.result.attempt, 2);
});

test('unknown, missing, extra, and non-string operator values are rejected', () => {
  for (const input of [
    { ...defaults, strategy: 'upgrade-everything' }, { ...defaults, workers: 'none' },
    { ...defaults, historyEvidence: 'assume-complete' }, { strategy: 'pin-exact', workers: 'overlap' },
    { ...defaults, extra: true }, { ...defaults, strategy: ['pin-exact'] }, null,
  ]) {
    assert.throws(() => model.conduct(model.createState(), input), /invalid input/i);
  }
});

test('non-plain inputs and accessor properties are rejected without invoking getters', () => {
  let getterCalls = 0;
  const accessor = { ...defaults };
  Object.defineProperty(accessor, 'strategy', { get() { getterCalls += 1; return 'pin-exact'; }, enumerable: true });
  assert.throws(() => model.conduct(model.createState(), accessor), /invalid input/i);
  assert.equal(getterCalls, 0);
  assert.throws(() => model.conduct(model.createState(), Object.create(defaults)), /invalid input/i);
});

test('malformed, forged, sparse, and over-capacity state is rejected', () => {
  for (const state of [null, {}, { attempts: [], extra: true }, { attempts: [null] }, { attempts: new Array(1) }, { attempts: Array(7).fill({}) }]) {
    assert.throws(() => model.conduct(state, defaults), /invalid state/i);
  }
  const { state } = run();
  assert.equal(state.attempts.length, 1);
  const forged = structuredClone(state);
  forged.attempts[0].result.metrics.matched = 99;
  assert.throws(() => model.conduct(forged, defaults), /invalid state/i);
});

test('six attempts are bounded; rejected input preserves the retained state', () => {
  let state = model.createState();
  for (let index = 0; index < 6; index += 1) state = run({}, state).state;
  assert.equal(state.attempts.length, 6);
  const before = JSON.stringify(state);
  assert.throws(() => run({}, state), /six comparisons.*reset/i);
  assert.equal(JSON.stringify(state), before);
});

test('reset clears only the rehearsal, validates state, and restarts at attempt one', () => {
  const { state } = run({ strategy: 'latest' });
  assert.equal(state.attempts.length, 1);
  const clean = model.reset(state);
  assert.deepEqual(clean, { attempts: [] });
  assert.ok(Object.isFrozen(clean.attempts));
  assert.equal(run({}, clean).result.attempt, 1);
  assert.equal(state.attempts[0].result.verdict, 'FAILED');
  assert.throws(() => model.reset({ attempts: [null] }), /invalid state/i);
});
