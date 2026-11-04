'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

function conduct(traceId) {
  let state = model.createState();
  for (const command of [
    { type: 'initialize', traceId },
    { type: 'burst' },
    { type: 'inspect' },
    { type: 'measure' },
  ]) state = model.dispatch(state, command);
  return state;
}

test('coupled contention fails despite passing separate tiers, readiness and average throughput', () => {
  const view = model.read(conduct('contention'));
  const result = view.latestMeasurement;
  assert.equal(result.verdict, 'FAIL', 'known coupled pressure must not be masked by separate tier passes');
  assert.deepEqual(result.counts, { attempted: 4, successful: 1, interrupted: 2, unknown: 1 });
  assert.equal(result.successFraction, 0.25);
  assert.equal(result.verifierMatched, true);
  assert.equal(result.separateTierSamples.passed, 4);
  assert.equal(result.separateTierSamples.denominator, 4);
  assert.deepEqual(view.observations[0].health, { ready: true, httpStatus: 200 });
  assert.equal(view.observations[0].throughput.averageRps, 118);
  assert.deepEqual(result.failedChecks.map((item) => [item.metric, item.observed, item.maximum]), [
    ['combined shared connections', 115, 100],
    ['combined shared CPU', 90, 85],
    ['queue depth', 28, 20],
    ['queue wait', 480, 300],
    ['initialization completion', 1200, 1000],
  ]);
  assert.equal(result.latency.completedDenominator, 2);
  assert.equal(result.latency.meanMs, 1300, 'a good mean must not hide the broken connection');
  assert.equal(result.nativeProof, false);
  assert.equal(result.fiveNinesCertified, false);
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const send = (state, type) => model.dispatch(state, { type });
function recoverAndMeasure(state) {
  for (const type of ['recover', 'inspect', 'measure']) state = send(state, type);
  return state;
}

test('all declared positive boundaries are inclusive, with complete migrated journeys', () => {
  const view = model.read(conduct('within-envelope'));
  const record = view.observations[0];
  const result = view.latestMeasurement;
  assert.equal(record.sharedSampleAtMs, 800);
  assert.equal(record.demand.rps, 120);
  assert.equal(record.shared.connections, model.limits.sharedConnections);
  assert.equal(record.shared.cpuPct, model.limits.sharedCpuPct);
  assert.equal(record.queue.depth, model.limits.queueDepth);
  assert.equal(record.queue.waitMs, model.limits.queueWaitMs);
  assert.deepEqual(result.counts, { attempted: 4, successful: 4, interrupted: 0, unknown: 0 });
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.successFraction, 1);
  assert.deepEqual(result.envelopeChecks, { known: 6, failed: 0, unknown: 0 });
  assert.equal(result.latency.maxMs, 1500);
  assert.equal(result.latency.originalBudgetMs, 1500);
  assert.ok(result.journeys.every((item) => item.migrationObserved && item.outcome === 'successful'));
});

test('missing peak evidence and completed v1-only journeys stay unknown in the denominator', () => {
  let state = conduct('unobserved-peak');
  const result = model.read(state).latestMeasurement;
  assert.equal(result.verdict, 'UNKNOWN');
  assert.deepEqual(result.counts, { attempted: 4, successful: 2, interrupted: 0, unknown: 2 });
  assert.equal(result.successFraction, 0.5);
  assert.deepEqual(result.unknownChecks.map((item) => item.metric), [
    'combined shared connections', 'queue wait', 'initialization completion',
  ]);
  assert.equal(result.failedChecks.length, 0);
  assert.equal(result.journeys.find((item) => item.id === 'J3').migrationObserved, false);
  assert.equal(result.journeys.find((item) => item.id === 'J3').outcome, 'unknown');
  assert.equal(result.latency.completedDenominator, 3, 'known completion is not the migrated-success denominator');
  state = recoverAndMeasure(state);
  const later = model.read(state).latestMeasurement;
  assert.equal(later.verdict, 'UNKNOWN');
  assert.deepEqual(later.counts, result.counts);
  assert.ok(later.unknownChecks.some((item) => item.record === 'unobserved-peak-burst'));
});

test('later recovery retains original pressure, interruption, budgets and both measurements', () => {
  let state = conduct('contention');
  const first = model.read(state).latestMeasurement;
  state = send(state, 'recover');
  let view = model.read(state);
  assert.equal(view.inspectionStale, true);
  assert.deepEqual(view.latestMeasurement, first);
  assert.throws(() => send(state, 'measure'), { code: 'ERR_S142_ORDER' });
  state = send(send(state, 'inspect'), 'measure');
  view = model.read(state);
  const later = view.latestMeasurement;
  assert.equal(view.inspectionStale, false);
  assert.equal(later.verdict, 'FAIL');
  assert.deepEqual(later.counts, first.counts);
  assert.equal(later.latency.completedDenominator, 3);
  assert.equal(later.latency.maxMs, 1800);
  assert.ok(later.latency.meanMs < 1500, 'an acceptable mean is diagnostic, not continuity certification');
  assert.deepEqual(later.journeys.find((item) => item.id === 'J1').interruptions, [{ atMs: 600, code: 'user-visible-queue-timeout' }]);
  assert.deepEqual(later.journeys.find((item) => item.id === 'J3').interruptions, [{ atMs: 700, code: 'broken-required-connection' }]);
  assert.equal(later.journeys.find((item) => item.id === 'J4').outcome, 'unknown');
  assert.equal(view.observations[1].shared.connections, 40);
  assert.equal(view.observations[1].shared.cpuPct, 40);
  assert.ok(later.failedChecks.some((item) => item.record === 'contention-burst' && item.observed === 115));
  assert.deepEqual(view.current.measurements, [first, later]);
  assert.deepEqual(view.history.map((event) => event.command.type), ['initialize', 'burst', 'inspect', 'measure', 'recover', 'inspect', 'measure']);
});

test('initialization and an empty sample produce no attempted migration or success verdict', () => {
  let state = model.createState();
  assert.equal(model.read(state).latestMeasurement, null);
  assert.deepEqual(model.read(state).sessionCounts, { attempted: 0, successful: 0, interrupted: 0, unknown: 0 });
  state = model.dispatch(state, { type: 'initialize', traceId: 'within-envelope' });
  assert.equal(model.read(state).observations.length, 0);
  assert.equal(model.read(state).journeySnapshots.length, 0);
  assert.equal(model.read(state).latestMeasurement, null);
  assert.deepEqual(model.read(state).availableCommands, ['burst', 'reset']);
});

test('out-of-order or duplicate commands cannot fabricate inspection or completion', () => {
  const initial = model.createState();
  for (const type of ['burst', 'inspect', 'measure', 'recover', 'reset']) {
    assert.throws(() => send(initial, type), { code: 'ERR_S142_ORDER' });
  }
  const initialized = model.dispatch(initial, { type: 'initialize', traceId: 'within-envelope' });
  assert.throws(() => model.dispatch(initialized, { type: 'initialize', traceId: 'contention' }), { code: 'ERR_S142_ORDER' });
  const burst = send(initialized, 'burst');
  assert.throws(() => send(burst, 'recover'), { code: 'ERR_S142_ORDER' });
  assert.throws(() => send(burst, 'measure'), { code: 'ERR_S142_ORDER' });
  assert.throws(() => send(burst, 'burst'), { code: 'ERR_S142_ORDER' });
  const inspected = send(burst, 'inspect');
  assert.throws(() => send(inspected, 'inspect'), { code: 'ERR_S142_ORDER' });
  const measured = send(inspected, 'measure');
  assert.throws(() => send(measured, 'measure'), { code: 'ERR_S142_ORDER' });
  const recovered = recoverAndMeasure(measured);
  assert.throws(() => send(recovered, 'recover'), { code: 'ERR_S142_ORDER' });
});

test('a reset retains measured and unmeasured started journeys in relevant session counts', () => {
  const first = conduct('contention');
  let state = send(first, 'reset');
  let view = model.read(state);
  assert.equal(view.current.stage, 'idle');
  assert.deepEqual(view.runs[0], model.read(first).current);
  assert.equal(view.latestMeasurement, null);
  assert.deepEqual(view.sessionCounts, { attempted: 4, successful: 1, interrupted: 2, unknown: 1 });
  state = model.dispatch(state, { type: 'initialize', traceId: 'unobserved-peak' });
  state = send(state, 'burst');
  state = send(state, 'reset');
  view = model.read(state);
  assert.deepEqual(view.sessionCounts, { attempted: 8, successful: 3, interrupted: 2, unknown: 3 });
  assert.equal(view.runSummaries[1].measuredVerdicts.length, 0);
  assert.deepEqual(view.runSummaries[1].counts, { attempted: 4, successful: 2, interrupted: 0, unknown: 2 });
  assert.equal(view.history.length, 8);
});

test('reset before burst retains a separate non-exposed run with zero attempted journeys', () => {
  let state = model.dispatch(model.createState(), { type: 'initialize', traceId: 'contention' });
  state = send(state, 'reset');
  const view = model.read(state);
  assert.equal(view.runs[0].stage, 'initializing');
  assert.equal(view.runs[0].burstEntered, false);
  assert.equal(view.runs[0].measurements.length, 0);
  assert.equal(view.sessionCounts.attempted, 0);
  assert.equal(view.latestMeasurement, null);
});

test('three full runs retain exactly 23 ordered commands without truncation or extra attempts', () => {
  let state = model.createState();
  for (const [index, traceId] of ['contention', 'within-envelope', 'unobserved-peak'].entries()) {
    for (const command of [
      { type: 'initialize', traceId }, { type: 'burst' }, { type: 'inspect' }, { type: 'measure' },
      { type: 'recover' }, { type: 'inspect' }, { type: 'measure' },
    ]) state = model.dispatch(state, command);
    if (index < 2) state = send(state, 'reset');
  }
  const view = model.read(state);
  assert.equal(state.revision, 23);
  assert.equal(state.history.length, 23);
  assert.equal(state.runs.length, 3);
  assert.deepEqual(view.sessionCounts, { attempted: 12, successful: 7, interrupted: 2, unknown: 3 });
  assert.deepEqual(state.history.map((event) => event.sequence), Array.from({ length: 23 }, (_, index) => index + 1));
  assert.equal(view.runs.reduce((count, run) => count + run.measurements.length, 0), 6);
  assert.deepEqual(view.availableCommands, []);
  assert.throws(() => send(state, 'reset'), { code: 'ERR_S142_ORDER' });
  assert.equal(model.read(state).history.length, 23);
});

test('commands reject wrong types, extra fields, unknown traces and accessor/prototype tricks', () => {
  const commands = [
    null, undefined, true, 1, 'initialize', [], new Date(0), {},
    { type: true }, { type: 1 }, { type: 'unknown' },
    { type: 'burst', traceId: 'contention' }, { type: 'reset', eraseHistory: true },
    { type: 'initialize' }, { type: 'initialize', traceId: null },
    { type: 'initialize', traceId: true }, { type: 'initialize', traceId: 1 },
    { type: 'initialize', traceId: 'toString' }, { type: 'initialize', traceId: '__proto__' },
    { type: 'initialize', traceId: 'contention', sharedConnections: 0 },
    Object.assign(Object.create(null), { type: 'initialize', traceId: 'contention' }),
  ];
  for (const command of commands) assert.throws(() => model.dispatch(model.createState(), command), { code: 'ERR_S142_COMMAND' });
  let accessorRead = false;
  const command = { get type() { accessorRead = true; return 'initialize'; }, traceId: 'contention' };
  assert.throws(() => model.dispatch(model.createState(), command), { code: 'ERR_S142_COMMAND' });
  assert.equal(accessorRead, false);
});

test('top-level state is exact, typed and bounded, without executing accessor fields', () => {
  const invalid = [
    null, undefined, true, 1, [], {},
    { ...clone(model.createState()), schema: 's142-fixed-fiction/0' },
    { ...clone(model.createState()), revision: '0' },
    { ...clone(model.createState()), revision: false },
    { ...clone(model.createState()), revision: 1 },
    { ...clone(model.createState()), runs: [] },
    { ...clone(model.createState()), runs: Array(4).fill({}) },
    { ...clone(model.createState()), history: Array(24).fill({}) },
    { ...clone(model.createState()), extra: true },
    Object.assign(Object.create(null), clone(model.createState())),
  ];
  for (const state of invalid) assert.throws(() => model.read(state), { code: 'ERR_S142_STATE' });
  let read = false;
  const state = clone(model.createState());
  Object.defineProperty(state, 'revision', { enumerable: true, get() { read = true; return 0; } });
  assert.throws(() => model.read(state), { code: 'ERR_S142_STATE' });
  assert.equal(read, false);
});

test('forged state, readiness, pressure, journey counts or measurements fail fixed-source replay', () => {
  const original = conduct('contention');
  const mutate = [
    (state) => { state.runs[0].stage = 'idle'; },
    (state) => { state.runs[0].traceId = 'within-envelope'; },
    (state) => { state.runs[0].recoveryRecorded = true; },
    (state) => { state.runs[0].inspection.windows[0].shared.connections = 0; },
    (state) => { state.runs[0].inspection.windows[0].health.ready = false; },
    (state) => { state.runs[0].inspection.journeySnapshots[0].interruptions = []; },
    (state) => { state.runs[0].measurements[0].verdict = 'PASS'; },
    (state) => { state.runs[0].measurements[0].counts.unknown = 0; },
    (state) => { state.runs[0].measurements[0].counts.attempted = 3; },
    (state) => { state.runs[0].measurements[0].successFraction = 1; },
    (state) => { state.runs[0].measurements[0].failedChecks = []; },
    (state) => { state.runs[0].measurements[0].journeys[0].outcome = 'successful'; },
    (state) => { state.history[0].sequence = '1'; },
    (state) => { state.history[0].runId = '1'; },
    (state) => { state.history[1].command.type = 'measure'; },
    (state) => { state.history[2].extra = true; },
    (state) => { state.runs[0].measurements.push(state.runs[0].measurements[0]); },
  ];
  for (const edit of mutate) {
    const forged = clone(original);
    edit(forged);
    assert.throws(() => model.read(forged), { code: 'ERR_S142_STATE' });
    assert.throws(() => send(forged, 'reset'), { code: 'ERR_S142_STATE' });
  }
  assert.equal(model.read(original).latestMeasurement.verdict, 'FAIL');
});

test('sparse, extended and accessor arrays cannot bypass journal replay', () => {
  const original = conduct('contention');
  for (const edit of [
    (state) => { delete state.history[0]; },
    (state) => { state.history.extra = 'hidden'; },
    (state) => { state.runs[0].measurements.extra = 'hidden'; },
    (state) => { Object.defineProperty(state.history, '0', { enumerable: true, get() { throw new Error('must not execute'); } }); },
  ]) {
    const forged = clone(original);
    edit(forged);
    assert.throws(() => model.read(forged), { code: 'ERR_S142_STATE' });
  }
});

test('fixed data and returned projections are immutable while plain JSON replays deterministically', () => {
  const state = conduct('contention');
  const view = model.read(state);
  assert.ok(Object.isFrozen(model) && Object.isFrozen(model.limits) && Object.isFrozen(state));
  assert.ok(Object.isFrozen(view.observations[0].shared));
  assert.throws(() => { model.limits.sharedConnections = 1000; }, TypeError);
  assert.throws(() => { view.latestMeasurement.counts.unknown = 0; }, TypeError);
  assert.throws(() => { state.history.pop(); }, TypeError);
  assert.deepEqual(model.read(clone(state)), view);
  const reordered = clone(state);
  reordered.history[0].command = { traceId: 'contention', type: 'initialize' };
  assert.deepEqual(model.read(reordered), view);
  assert.deepEqual(model.read(conduct('contention')), view);
  assert.equal(model.read(conduct('within-envelope')).latestMeasurement.verdict, 'PASS');
});
