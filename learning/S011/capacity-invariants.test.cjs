'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRehearsal, transition, CONDITIONS } = require('./scale-out.js');

function ready(input = {}) {
  let state = transition(createRehearsal(), 'request', {
    targetInstances: 4, demandRps: 160, connectionLimit: 100, condition: 'healthy', ...input
  });
  state = transition(transition(state, 'observe'), 'observe');
  return transition(state, 'verify');
}
const admit = (state, sharePercent) => transition(state, 'admit', { sharePercent });

test('a mathematically exact five-instance pool boundary is not rejected by binary arithmetic', () => {
  const state = admit(ready({ targetInstances: 5, demandRps: 200 }), 60);
  assert.equal(state.lastResult.verdict, 'PASS');
  assert.equal(state.totals.attemptedTransitions, 12);
  assert.equal(state.capacity.eligible, 5);
  assert.ok(state.lastResult.assertions.filter((item) => item.id.startsWith('load-')).every((item) => item.status === 'pass'));
});

test('three, four, five, and six-instance requests stay bounded and independently observable', () => {
  for (const [targetInstances, demandRps, share] of [[3, 100, 40], [4, 160, 50], [5, 200, 60], [6, 200, 60]]) {
    const state = admit(ready({ targetInstances, demandRps, connectionLimit: 120 }), share);
    assert.equal(state.capacity.requested, targetInstances);
    assert.equal(state.capacity.deployed, targetInstances);
    assert.equal(state.capacity.ready, targetInstances);
    assert.equal(state.lastResult.verdict, 'PASS', `target=${targetInstances}`);
    assert.equal(state.totals.attemptedTransitions + state.totals.oldOnlyJourneys, 20);
  }
});

test('the measured sample distribution can block a requested distribution that fits', () => {
  const state = admit(ready({ demandRps: 140 }), 43);
  const requested = state.lastResult.assertions.find((item) => item.id === 'load-old');
  const measured = state.lastResult.assertions.find((item) => item.id === 'sample-load-old');
  assert.equal(requested.status, 'pass');
  assert.equal(measured.status, 'fail');
  assert.equal(measured.observed, 84);
  assert.equal(state.lastResult.verdict, 'BLOCKED');
  assert.equal(state.clients.length, 0);
});

test('observed traffic share is measured from clients and not copied from the requested value', () => {
  const state = admit(ready({ demandRps: 120 }), 49);
  assert.equal(state.lastResult.verdict, 'PASS');
  assert.equal(state.load.requestedNewSharePercent, 49);
  assert.equal(state.load.observedNewSharePercent, 45);
  assert.equal(state.clients.filter((client) => client.affected).length, 9);
});

test('30-second evidence is accepted but older evidence is blocked', () => {
  const atBoundary = transition(ready(), 'add-slot');
  assert.equal(admit(atBoundary, 50).lastResult.verdict, 'PASS');
  const expired = transition(atBoundary, 'add-slot');
  assert.equal(admit(expired, 50).lastResult.verdict, 'BLOCKED');
});

test('the six-instance aggregate pool limit does not silently expand with compute', () => {
  const state = ready({ targetInstances: 6 });
  assert.equal(state.connections.projected, 120);
  assert.equal(state.connections.observed, 120);
  assert.equal(state.connections.limit, 100);
  assert.equal(state.lastResult.verdict, 'FAIL');
  assert.equal(admit(state, 50).capacity.eligible, 2);
});

test('all supported condition traces are deterministic and partition every affected outcome', () => {
  for (const condition of CONDITIONS) {
    const first = admit(ready({ condition }), 50);
    const second = admit(ready({ condition }), 50);
    assert.deepEqual(first, second, condition);
    const totals = first.totals;
    assert.equal(totals.attemptedTransitions,
      totals.successfulTransitions + totals.interruptedTransitions + totals.unknownTransitions);
    assert.equal(first.result.nativeProof, false);
    assert.equal(first.result.parentComplete, false);
    if (['unready', 'provisioning-failure', 'capacity-unknown'].includes(condition)) {
      assert.equal(first.clients.length, 0);
      assert.equal(first.result.successRate, null);
    }
  }
});

test('a frozen request cannot be quietly replaced by a second request', () => {
  const previous = ready();
  const state = transition(previous, 'request', {
    targetInstances: 6, demandRps: 200, connectionLimit: 120, condition: 'healthy'
  });
  assert.equal(state.lastResult.verdict, 'BLOCKED');
  assert.deepEqual(state.configuration, previous.configuration);
  assert.deepEqual(state.capacity, previous.capacity);
});

test('the bounded slot counter never adds compute or clears history', () => {
  let state = ready();
  const oldHistory = JSON.stringify(state.history);
  for (let count = 0; count < 4; count += 1) state = transition(state, 'add-slot');
  assert.equal(state.slots, 4);
  assert.equal(state.lastResult.verdict, 'BLOCKED');
  assert.equal(state.capacity.requested, 4);
  assert.equal(state.capacity.ready, 4);
  assert.equal(state.capacity.eligible, 2);
  assert.equal(JSON.stringify(state.history.slice(0, 4)), oldHistory);
});

test('unsupported state is an explicit programming error, not a fabricated fresh success', () => {
  for (const state of [null, {}, { schemaVersion: 1, sourceId: 'S012' }]) {
    assert.throws(() => transition(state, 'observe'), /Expected a state created by S011/);
  }
});

test('a known broken connection cannot pass the complete-journey budget assertion', () => {
  const state = admit(ready({ condition: 'broken-connection' }), 50);
  const budget = state.lastResult.assertions.find((item) => item.id === 'journey-budget');
  assert.equal(budget.status, 'fail');
  assert.equal(budget.expected, 800);
  assert.equal(budget.missingCompletions, 1);
  assert.equal(budget.overBudgetCompletions, 0);
  assert.equal(state.totals.unknownTransitions, 0);
});
