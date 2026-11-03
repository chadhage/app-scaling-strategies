'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRehearsal, transition } = require('./scale-out.js');

const defaults = {
  targetInstances: 4, demandRps: 160, connectionLimit: 100, condition: 'healthy'
};
const request = (choices = {}) => transition(createRehearsal(), 'request', { ...defaults, ...choices });
const observe = (state) => transition(state, 'observe');
const ready = (choices = {}) => observe(observe(request(choices)));
const verified = (choices = {}) => transition(ready(choices), 'verify');
const admitted = (choices = {}) => transition(verified(choices), 'admit', { sharePercent: 50 });
const counts = (state) => [
  state.capacity.requested, state.capacity.deployed, state.capacity.ready, state.capacity.eligible
];

test('baseline is a frozen resource-free fixture, not a successful transition', () => {
  const state = createRehearsal();
  assert.deepEqual(counts(state), [2, 2, 2, 2]);
  assert.equal(state.result.successRate, null);
  assert.equal(state.nativeProof, false);
  assert.equal(state.parentComplete, false);
  assert.ok(Object.isFrozen(state), 'the baseline must be immutable');
});

test('requesting extra instances changes desired capacity only', () => {
  const state = request();
  assert.deepEqual(counts(state), [4, 2, 2, 2]);
  assert.equal(state.configuration.demandRps, 160);
  assert.equal(state.clients.length, 0);
});

test('deployment observation does not fabricate readiness or admission', () => {
  const state = observe(request());
  assert.deepEqual(counts(state), [4, 4, 2, 2]);
  assert.equal(state.connections.observed, 80);
  assert.equal(state.load.observedRps, 80);
});

test('complete readiness is observed before traffic eligibility', () => {
  const state = ready();
  assert.deepEqual(counts(state), [4, 4, 4, 2]);
  assert.equal(state.observations.length, 2);
  assert.equal(state.load.readyCapacityRps, 200);
  assert.equal(state.load.eligibleCapacityRps, 100);
});

test('verification records a fresh observation without increasing traffic', () => {
  const state = verified();
  assert.ok(state.verification, 'fresh complete capacity needs an explicit verification token');
  assert.equal(state.verification.observationId, state.observations.at(-1).id);
  assert.equal(state.lastResult.verdict, 'PASS');
  assert.equal(state.capacity.eligible, 2);
});

for (const stage of ['baseline', 'requested', 'deployed', 'ready']) {
  test(`increased admission is blocked at unverified ${stage} stage`, () => {
    const state = {
      baseline: createRehearsal, requested: request, deployed: () => observe(request()), ready
    }[stage]();
    const result = transition(state, 'admit', { sharePercent: 50 });
    assert.equal(result.lastResult.verdict, 'BLOCKED');
    assert.equal(result.capacity.eligible, 2);
    assert.equal(result.totals.attemptedTransitions, 0);
  });
}

test('healthy scale-out measures actual admissions and separates old-only journeys', () => {
  const state = admitted();
  assert.deepEqual(counts(state), [4, 4, 4, 4]);
  assert.equal(state.load.observedRps, 160);
  assert.equal(state.load.observedNewSharePercent, 50);
  assert.equal(state.totals.attemptedTransitions, 10);
  assert.equal(state.totals.successfulTransitions, 10);
  assert.equal(state.totals.oldOnlyJourneys, 10);
  assert.equal(state.totals.oldOnlySuccessful, 10);
  assert.equal(state.clients.length, 20);
  assert.equal(state.result.verdict, 'PASS');
  assert.equal(state.result.successRate, 1);
  for (const client of state.clients.filter((item) => item.affected)) {
    assert.match(client.instanceId, /^instance-[34]$/);
    assert.equal(client.connection, 'preserved');
    assert.equal(client.stateIntact, true);
    assert.equal(client.effectCount, 1);
    assert.ok(client.latencyMs <= 800);
  }
});

test('one unready instance prevents complete-pool verification', () => {
  const state = transition(ready({ condition: 'unready' }), 'verify');
  assert.deepEqual(counts(state), [4, 4, 3, 2]);
  assert.equal(state.lastResult.verdict, 'FAIL');
  assert.equal(state.verification, null);
  assert.ok(state.lastResult.assertions.some((item) => item.id === 'complete-pool' && item.status === 'fail'));
});

test('unknown capacity stays null with confirmed lower bounds, never invented zero', () => {
  const state = transition(observe(request({ condition: 'capacity-unknown' })), 'verify');
  assert.equal(state.capacity.deployed, null);
  assert.equal(state.capacity.ready, null);
  assert.equal(state.capacity.confirmedDeployed, 2);
  assert.equal(state.capacity.confirmedReady, 2);
  assert.equal(state.connections.observed, null);
  assert.equal(state.lastResult.verdict, 'UNVERIFIED');
});

test('known provisioning failure is a failure, not missing telemetry', () => {
  const state = observe(request({ condition: 'provisioning-failure' }));
  assert.deepEqual(counts(state), [4, 2, 2, 2]);
  assert.equal(state.lastResult.verdict, 'FAIL');
  assert.equal(state.instances.filter((item) => item.readiness === 'failed').length, 2);
});

test('aggregate connections include newly deployed pools and block excess dependency use', () => {
  const state = verified({ connectionLimit: 60 });
  assert.equal(state.connections.observed, 80);
  assert.equal(state.connections.withinLimit, false);
  assert.equal(state.lastResult.verdict, 'FAIL');
  const result = transition(state, 'admit', { sharePercent: 50 });
  assert.equal(result.lastResult.verdict, 'BLOCKED');
  assert.equal(result.capacity.eligible, 2);
});

test('total load just beyond the measured 80 percent ceiling is rejected', () => {
  const state = transition(verified({ demandRps: 161 }), 'admit', { sharePercent: 50 });
  assert.equal(state.lastResult.verdict, 'BLOCKED');
  assert.equal(state.capacity.eligible, 2);
  assert.equal(state.clients.length, 0);
  assert.ok(state.lastResult.assertions.some((item) => item.id === 'load-total' && item.status === 'fail'));
});

test('a lopsided traffic share cannot overload the new pool despite spare total capacity', () => {
  const state = transition(verified(), 'admit', { sharePercent: 75 });
  assert.equal(state.lastResult.verdict, 'BLOCKED');
  assert.ok(state.lastResult.assertions.some((item) => item.id === 'load-new' && item.observed === 120));
});

test('ready evidence expires by measured logical age', () => {
  const state = transition(verified(), 'wait');
  const result = transition(state, 'admit', { sharePercent: 50 });
  assert.equal(result.lastResult.verdict, 'BLOCKED');
  assert.ok(result.lastResult.assertions.some((item) =>
    item.id === 'freshness' && item.status === 'fail' && item.observed > 30));
  assert.equal(result.clients.length, 0);
});

test('a newer observation must be verified, and does not inherit an older approval', () => {
  const state = observe(verified());
  assert.equal(state.verification, null);
  assert.equal(transition(state, 'admit', { sharePercent: 50 }).lastResult.verdict, 'BLOCKED');
});

test('re-observation after expiration creates separate evidence and enables fresh admission', () => {
  const previous = verified();
  const snapshots = JSON.stringify(previous.observations);
  const fresh = transition(observe(transition(previous, 'wait')), 'verify');
  assert.ok(fresh.verification, 'fresh evidence must be verified');
  assert.equal(transition(fresh, 'admit', { sharePercent: 50 }).result.verdict, 'PASS');
  assert.equal(JSON.stringify(previous.observations), snapshots);
  assert.notEqual(fresh.observations.at(-1).id, previous.observations.at(-1).id);
});

test('late complete journeys are interrupted even when every instance is ready', () => {
  const state = admitted({ condition: 'slow-journey' });
  assert.equal(state.totals.attemptedTransitions, 10);
  assert.equal(state.totals.interruptedTransitions, 10);
  assert.equal(state.totals.successfulTransitions, 0);
  assert.equal(state.result.verdict, 'FAIL');
  assert.ok(state.clients.filter((item) => item.affected).every((item) => item.latencyMs > 800));
});

test('a broken required connection is an interruption, not a successful latency sample', () => {
  const state = admitted({ condition: 'broken-connection' });
  assert.equal(state.totals.interruptedTransitions, 1);
  assert.equal(state.totals.successfulTransitions, 9);
  assert.equal(state.clients.filter((item) => item.connection === 'broken').length, 1);
  assert.equal(state.result.userOutcome, 'interrupted-transition');
});

test('missing client evidence is unknown and remains in the transition denominator', () => {
  const state = admitted({ condition: 'journey-unknown' });
  assert.equal(state.totals.attemptedTransitions, 10);
  assert.equal(state.totals.unknownTransitions, 10);
  assert.equal(state.totals.interruptedTransitions, 0);
  assert.equal(state.result.verdict, 'UNVERIFIED');
  assert.equal(state.result.successRate, 0);
  assert.ok(state.clients.filter((item) => item.affected).every((item) =>
    item.latencyMs === null && item.effectCount === null && item.stateIntact === null));
});

for (const condition of ['slow-journey', 'journey-unknown']) {
  test(`recovery preserves ${condition} history and cumulative impact`, () => {
    const previous = admitted({ condition });
    const previousJSON = JSON.stringify(previous);
    let state = transition(previous, 'recover');
    assert.equal(state.activeCondition, 'healthy');
    assert.ok(state.configuration, 'the original scale request must remain recorded');
    assert.equal(state.configuration.condition, condition);
    assert.equal(state.capacity.eligible, 2);
    state = transition(observe(observe(state)), 'verify');
    state = transition(state, 'admit', { sharePercent: 50 });
    assert.equal(state.totals.attemptedTransitions, 20);
    assert.equal(state.totals.successfulTransitions, 10);
    assert.equal(state.lastResult.verdict, 'PASS');
    assert.equal(state.result.verdict, condition === 'slow-journey' ? 'FAIL' : 'UNVERIFIED');
    assert.equal(JSON.stringify(previous), previousJSON);
    assert.deepEqual(state.clients.slice(0, 20), previous.clients);
    assert.deepEqual(state.observations.slice(0, 2), previous.observations);
  });
}

test('observations and historical action snapshots cannot be retroactively rewritten', () => {
  const previous = observe(request());
  const snapshot = JSON.stringify(previous);
  const state = observe(previous);
  assert.equal(state.observations.length, 2, 'two real capacity snapshots must exist');
  assert.deepEqual(state.observations[0], previous.observations[0]);
  assert.deepEqual(state.history.slice(0, previous.history.length), previous.history);
  assert.equal(JSON.stringify(previous), snapshot);
  assert.ok(Object.isFrozen(state.observations[0].capacity));
  assert.throws(() => { state.observations[0].capacity.ready = 99; }, TypeError);
});

test('a slot addition changes slots only and never manufactures a transition success', () => {
  const previous = createRehearsal();
  const state = transition(previous, 'add-slot');
  assert.equal(state.slots, 2);
  assert.deepEqual(state.capacity, previous.capacity);
  assert.equal(state.load.readyCapacityRps, 100);
  assert.equal(state.result.verdict, 'NOT_RUN');
  assert.equal(state.totals.attemptedTransitions, 0);
  assert.match(state.lastResult.reason, /not.*compute/i);
});

test('a second admission sample requires explicit recovery and fresh verification', () => {
  const previous = admitted();
  const state = transition(previous, 'admit', { sharePercent: 50 });
  assert.equal(state.lastResult.verdict, 'BLOCKED');
  assert.deepEqual(state.clients, previous.clients);
  assert.deepEqual(state.totals, previous.totals);
});

test('a share producing no affected clients cannot establish successful scale-out', () => {
  const state = transition(verified({ demandRps: 60 }), 'admit', { sharePercent: 1 });
  assert.equal(state.lastResult.verdict, 'BLOCKED');
  assert.equal(state.result.successRate, null);
  assert.equal(state.totals.attemptedTransitions, 0);
});

for (const [field, values] of Object.entries({
  targetInstances: [2, 7, 3.5, '', '4x', '4e0', null, true],
  demandRps: [0, 301, 160.1, '', 'NaN', Infinity],
  connectionLimit: [39, 201, 60.5, '', null],
  condition: ['unknown-fixture', '', null, {}, '<script>']
})) {
  test(`invalid ${field} inputs are rejected without changing capacity`, () => {
    for (const value of values) {
      const state = request({ [field]: value });
      assert.equal(state.lastResult.verdict, 'INVALID', `${field}=${String(value)}`);
      assert.deepEqual(counts(state), [2, 2, 2, 2]);
      assert.equal(state.clients.length, 0);
    }
  });
}

test('canonical integer strings from browser controls are supported', () => {
  const state = request({ targetInstances: '4', demandRps: '160', connectionLimit: '100' });
  assert.deepEqual(counts(state), [4, 2, 2, 2]);
});

test('malformed input objects and unknown actions produce visible invalid results', () => {
  for (const input of [null, [], 42, 'request']) {
    assert.equal(transition(createRehearsal(), 'request', input).lastResult.verdict, 'INVALID');
  }
  assert.equal(transition(createRehearsal(), 'not-an-action').lastResult.verdict, 'INVALID');
});

test('malformed or out-of-range shares preserve all capacity and evidence', () => {
  for (const sharePercent of [0, 101, -1, 50.5, '', null, '50x', NaN, true, {}]) {
    const previous = verified();
    const state = transition(previous, 'admit', { sharePercent });
    assert.equal(state.lastResult.verdict, 'INVALID', `share=${String(sharePercent)}`);
    assert.deepEqual(state.capacity, previous.capacity);
    assert.deepEqual(state.observations, previous.observations);
    assert.equal(state.clients.length, 0);
  }
});

test('reset creates the original baseline without modifying retained prior snapshots', () => {
  const previous = admitted({ condition: 'slow-journey' });
  const snapshot = JSON.stringify(previous);
  const state = transition(previous, 'reset');
  assert.deepEqual(state, createRehearsal());
  assert.equal(JSON.stringify(previous), snapshot);
});
