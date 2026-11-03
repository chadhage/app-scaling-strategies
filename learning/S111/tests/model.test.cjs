'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const model = require(path.join(__dirname, '..', 'model.js'));

function measured(fixture = 'redundant', scopeClaim = 'application-worker') {
  let state = model.createState();
  state = model.transition(state, 'begin', { fixture, scopeClaim });
  assert.equal(state.phase, 'baseline', 'begin must enter the explicit baseline observation step');
  state = model.transition(state, 'observe-baseline');
  state = model.transition(state, 'record-loss');
  state = model.transition(state, 'measure');
  assert.equal(state.phase, 'measured');
  return state;
}

test('authored worker loss preserves declared workload and state on surviving versions', () => {
  const state = measured();
  const run = state.runs[0];
  assert.equal(run.measurement.observedCapacityRps, 80);
  assert.equal(run.measurement.demandRps, 60);
  assert.deepEqual(run.measurement.counts, { successes: 6, interruptions: 0, unknown: 0 });
  assert.equal(run.assessment.contract, 'positive');
  assert.equal(run.assessment.scopeClaim, 'positive');
  assert.equal(run.assessment.overall, 'positive');
  assert.deepEqual(run.assessment.outageTolerance, {
    node: 'unverified', zone: 'unverified', region: 'unverified',
  });
});

test('insufficient surviving capacity produces measured interruptions', () => {
  const run = measured('capacity-shortfall').runs[0];
  assert.equal(run.measurement.observedCapacityRps, 40);
  assert.deepEqual(run.measurement.counts, { successes: 4, interruptions: 2, unknown: 0 });
  assert.equal(run.assessment.contract, 'negative');
  assert.equal(run.assessment.overall, 'negative');
});

test('HTTP 200 does not hide incompatible surviving fixture state', () => {
  const run = measured('state-mismatch').runs[0];
  assert.equal(run.measurement.observedCapacityRps, 80);
  assert.deepEqual(run.measurement.counts, { successes: 5, interruptions: 1, unknown: 0 });
  assert.equal(run.measurement.journeys[5].httpStatus, 200);
  assert.equal(run.measurement.journeys[5].stateMatches, false);
  assert.equal(run.assessment.contract, 'negative');
});

test('missing capacity, state and journeys remain unknown rather than inferred healthy', () => {
  const run = measured('missing-observations').runs[0];
  assert.equal(run.measurement.observedCapacityRps, null);
  assert.equal(run.measurement.stateGate, 'unknown');
  assert.deepEqual(run.measurement.counts, { successes: 3, interruptions: 0, unknown: 3 });
  assert.equal(run.assessment.contract, 'unknown');
  assert.equal(run.assessment.overall, 'unknown');
});

for (const scopeClaim of ['node', 'zone', 'region']) {
  test(`${scopeClaim} loss claim is rejected without changing positive workload measurements`, () => {
    const run = measured('redundant', scopeClaim).runs[0];
    assert.equal(run.assessment.contract, 'positive');
    assert.equal(run.assessment.scopeClaim, 'negative');
    assert.equal(run.assessment.overall, 'negative');
    assert.equal(run.assessment.observedFailure, 'application-worker');
    assert.equal(run.assessment.outageTolerance[scopeClaim], 'unverified');
    assert.equal(run.measurement.workers[0].workerId, 'worker-b');
    assert.equal(run.measurement.workers[0].observedServing, true);
    assert.match(run.assessment.scopeEvidence[scopeClaim], /observed serving/);
  });
}

test('baseline and recorded loss cannot substitute for post-loss measurements', () => {
  let state = model.transition(model.createState(), 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' });
  assert.equal(state.runs[0].baseline, null);
  state = model.transition(state, 'observe-baseline');
  assert.equal(state.runs[0].baseline.observedCapacityRps, 120);
  assert.equal(state.runs[0].baseline.contract, 'positive');
  state = model.transition(state, 'record-loss');
  assert.equal(state.runs[0].measurement, null);
  assert.equal(state.runs[0].assessment, null);
  assert.deepEqual(state.runs[0].loss, {
    type: 'application-worker', workerId: 'worker-a', lostWorkerCount: 1,
    operation: 'Authored absent-worker record only; no process or resource operation.',
  });
});

test('fixed topology separates an application worker from its shared node and zone', () => {
  const [a, b, c, d] = model.TOPOLOGY;
  assert.equal(a.node, b.node);
  assert.equal(a.zone, b.zone);
  assert.equal(a.region, c.region);
  assert.notEqual(b.node, c.node);
  assert.notEqual(b.zone, c.zone);
  assert.notEqual(a.region, d.region);
  assert.match(d.role, /unverified/);
  assert.equal(model.TOPOLOGY.length, 4);
  assert.ok(Object.isFrozen(model.TOPOLOGY));
});

for (const fixture of ['redundant', 'capacity-shortfall', 'state-mismatch', 'missing-observations']) {
  test(`${fixture} recovery and reset retain original loss results`, () => {
    const before = measured(fixture);
    const originalMeasurement = before.runs[0].measurement;
    const originalAssessment = before.runs[0].assessment;
    let state = model.transition(before, 'recover');
    assert.equal(state.phase, 'recovered');
    assert.equal(state.runs[0].recovery.observedCapacityRps, 120);
    assert.equal(state.runs[0].recovery.contract, 'positive');
    assert.deepEqual(state.runs[0].recovery.counts, { successes: 6, interruptions: 0, unknown: 0 });
    assert.deepEqual(state.runs[0].measurement, originalMeasurement);
    assert.deepEqual(state.runs[0].assessment, originalAssessment);
    state = model.transition(state, 'reset');
    assert.equal(state.phase, 'ready');
    assert.equal(state.current, null);
    assert.equal(state.runs[0].reset, true);
    assert.equal(state.runs[0].closedFrom, 'recovered');
    state = model.transition(state, 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' });
    assert.equal(state.runs.length, 2);
    assert.deepEqual(state.runs[0].measurement, originalMeasurement);
    assert.deepEqual(state.runs[0].assessment, originalAssessment);
    assert.equal(before.phase, 'measured');
    assert.equal(before.runs[0].recovery, null);
    assert.ok(Object.isFrozen(state.runs[0].measurement.journeys[0]));
  });
}

test('reset before measurement retains an honest abandoned unknown run', () => {
  let state = model.transition(model.createState(), 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' });
  state = model.transition(state, 'reset');
  assert.equal(state.runs[0].assessment, null);
  assert.equal(state.runs[0].measurement, null);
  assert.equal(state.runs[0].closedFrom, 'baseline');
  assert.equal(state.events.length, 2);
  assert.equal(model.validateState(state), true);
});

test('wrong input types, enums, extra keys and accessors are rejected atomically', () => {
  const state = model.createState();
  const before = JSON.stringify(state);
  const badInputs = [
    null, [], 'redundant', true, 1, undefined, {},
    { fixture: 'unknown', scopeClaim: 'application-worker' },
    { fixture: 'redundant', scopeClaim: 'zone-outage' },
    { fixture: true, scopeClaim: 'application-worker' },
    { fixture: 'redundant', scopeClaim: 1 },
    { fixture: 'redundant', scopeClaim: 'application-worker', terminate: true },
    Object.create({ fixture: 'redundant', scopeClaim: 'application-worker' }),
    { get fixture() { throw new Error('getter must never run'); }, scopeClaim: 'application-worker' },
  ];
  for (const input of badInputs) {
    assert.throws(() => model.transition(state, 'begin', input), { code: 'ERR_S111_INPUT' });
    assert.equal(JSON.stringify(state), before);
  }
  for (const action of [null, 1, true, [], {}, 'terminate-process']) {
    assert.throws(() => model.transition(state, action), { code: 'ERR_S111_INPUT' });
  }
  assert.throws(() => model.transition(state, 'reset', {}), { code: 'ERR_S111_INPUT' });
});

test('every repeated or out-of-order action is rejected without changing evidence', () => {
  let state = model.createState();
  for (const action of ['observe-baseline', 'record-loss', 'measure', 'recover', 'reset']) {
    assert.throws(() => model.transition(state, action), { code: 'ERR_S111_ORDER' });
  }
  state = model.transition(state, 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' });
  const stages = [
    ['baseline', 'observe-baseline'], ['loss-ready', 'record-loss'],
    ['awaiting-measurement', 'measure'], ['measured', 'recover'],
  ];
  for (const [phase, allowed] of stages) {
    assert.equal(state.phase, phase);
    const before = JSON.stringify(state);
    for (const action of ['observe-baseline', 'record-loss', 'measure', 'recover'].filter(value => value !== allowed)) {
      assert.throws(() => model.transition(state, action), { code: 'ERR_S111_ORDER' });
      assert.equal(JSON.stringify(state), before);
    }
    assert.throws(() => model.transition(state, 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' }), { code: 'ERR_S111_ORDER' });
    state = model.transition(state, allowed);
  }
  assert.throws(() => model.transition(state, 'recover'), { code: 'ERR_S111_ORDER' });
});

test('forged state, outcomes, history and counters cannot enter the reducer', () => {
  const valid = measured();
  const variants = [
    value => { value.version = 2; },
    value => { value.current = true; },
    value => { value.phase = 'ready'; },
    value => { value.runs[0].measurement.observedCapacityRps = 1000; },
    value => { value.runs[0].assessment.overall = 'unknown'; },
    value => { value.runs[0].measurement.journeys[0].outcome = 'unknown'; },
    value => { value.events[0].seq = 2; },
    value => { value.events[0].input.fixture = 'missing-observations'; },
    value => { value.events[2].action = 'recover'; },
    value => { value.events.push({ seq: 5, action: 'measure', input: null }); },
    value => { value.runs[0].unownedEvidence = true; },
  ];
  for (const forge of variants) {
    const value = JSON.parse(JSON.stringify(valid));
    forge(value);
    assert.throws(() => model.transition(value, 'recover'), { code: 'ERR_S111_STATE' });
  }
  for (const value of [null, [], true, {}, { ...valid, events: Array(37).fill(null) }]) {
    assert.throws(() => model.transition(value, 'recover'), { code: 'ERR_S111_STATE' });
  }
  const accessor = JSON.parse(JSON.stringify(valid));
  let accessorRead = false;
  Object.defineProperty(accessor.events, '0', { enumerable: false, get() { accessorRead = true; return valid.events[0]; } });
  assert.throws(() => model.transition(accessor, 'recover'), { code: 'ERR_S111_STATE' });
  assert.equal(accessorRead, false);
});

test('valid JSON round trips and repeat execution give identical immutable observations', () => {
  const first = measured('state-mismatch', 'zone');
  const second = measured('state-mismatch', 'zone');
  assert.deepEqual(first, second);
  const roundTrip = JSON.parse(JSON.stringify(first));
  assert.equal(model.validateState(roundTrip), true);
  assert.deepEqual(model.transition(roundTrip, 'recover'), model.transition(first, 'recover'));
  assert.throws(() => { first.runs[0].assessment.overall = 'positive'; }, TypeError);
});

test('six complete rehearsals retain all 36 events and reject extra admission', () => {
  let state = model.createState();
  for (let index = 0; index < 6; index++) {
    state = model.transition(state, 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' });
    for (const action of ['observe-baseline', 'record-loss', 'measure', 'recover', 'reset']) state = model.transition(state, action);
  }
  assert.equal(state.runs.length, 6);
  assert.equal(state.events.length, 36);
  assert.equal(model.validateState(state), true);
  const before = JSON.stringify(state);
  assert.throws(() => model.transition(state, 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' }), { code: 'ERR_S111_LIMIT' });
  assert.equal(JSON.stringify(state), before);
});
