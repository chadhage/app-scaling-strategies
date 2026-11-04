'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { profiles, DATA_MODE, TIERS } = require('..\\fixtures.js');
const { validateWindow, measureWindow, summarizeHistory, createState, transition } = require('..\\lesson.js');
const clone = (value) => structuredClone(value);
const command = (state, type, extra = {}) => transition(state, {
  type, expectedRevision: state.revision, ...(state.run ? { runId: state.run.id } : {}), ...extra,
});
function measured(profile) {
  let state = transition(createState(), { type: 'conduct', expectedRevision: 0, profile });
  state = command(state, 'inspect');
  return command(state, 'measure');
}
function rejectsUnchanged(state, input, code = 'ERR_S144_INPUT') {
  const before = JSON.stringify(state);
  assert.throws(() => transition(state, input), { code });
  assert.equal(JSON.stringify(state), before);
}

test('boundary: measure the exact combined shared pool, not isolated successes', () => {
  const actual = measureWindow(profiles.boundary);
  assert.equal(actual.shared.observedConnections, 12);
  assert.deepEqual(Object.keys(actual).sort(), [
    'schemaVersion', 'sourceId', 'dataMode', 'profileId', 'windowId', 'isolated', 'load',
    'shared', 'downstream', 'diagnostics', 'journeys', 'throughput', 'counts', 'verdict', 'bottleneck',
  ].sort());
  assert.equal(actual.dataMode, DATA_MODE);
  assert.equal(actual.sourceId, 'S144');
  assert.deepEqual(actual.isolated, { passingTierIds: TIERS, measuredTierCount: 5, certifiesCombined: false });
  assert.deepEqual(actual.load, {
    simultaneous: true, windowMs: 10000, tierIds: TIERS,
    requestCount: 2000, requestCountIsJourneyDenominator: false,
  });
  assert.deepEqual(actual.shared, {
    resourceId: 'database-connections', windowId: 'combined-initial',
    contributors: profiles.boundary.contributors, observedConnections: 12,
    knownLowerBound: 12, budget: 12, status: 'pass',
  });
  assert.deepEqual(actual.downstream, {
    queueDepth: { observed: 4, budget: 4, status: 'pass' },
    workerWaitMs: { observed: 400, budget: 400, status: 'pass' },
  });
  assert.deepEqual(actual.throughput, {
    windowMs: 10000, successfulJourneys: 3, unknownJourneys: 0,
    knownLowerBoundPerSecond: 0.3, possibleSuccessfulJourneys: 3, minimumPerWindow: 3, status: 'pass',
  });
  assert.deepEqual(actual.counts, { attempted: 3, successful: 3, interrupted: 0, unknown: 0 });
  assert.deepEqual(actual.diagnostics, {
    http: 200, ready: true, averageMs: 80, requestCount: 2000, certifiesContinuity: false,
  });
  assert.deepEqual(actual.bottleneck, {
    observedResource: null, sharedBudgetStatus: 'pass', observedWaitJourneyIds: [],
    unresolvedJourneyIds: [], rootCause: 'unobserved', isolatedSuccessIsCausalProof: false,
  });
  assert.equal(actual.verdict, 'pass');
  for (const row of actual.journeys) {
    assert.equal(row.completedMs, 1500);
    assert.equal(row.budgetMs, 1500);
    assert.equal(row.outcome, 'success');
    assert.deepEqual(row.failures, []);
    assert.deepEqual(row.missing, []);
    assert.deepEqual(Object.keys(row).sort(), [
      'id', 'requiredTiers', 'elapsedMs', 'completedMs', 'http', 'clientResult', 'stateCorrect',
      'effectCount', 'expectedEffects', 'versions', 'waitResource', 'budgetMs', 'outcome', 'failures', 'missing',
    ].sort());
  }
});

test('overload: all isolated tiers pass, but the exact concurrent pool and downstream budgets fail', () => {
  const actual = measureWindow(profiles.overload);
  assert.equal(actual.isolated.passingTierIds.length, 5);
  assert.equal(actual.shared.observedConnections, 16);
  assert.equal(actual.shared.status, 'fail');
  assert.deepEqual(actual.downstream, {
    queueDepth: { observed: 8, budget: 4, status: 'fail' },
    workerWaitMs: { observed: 600, budget: 400, status: 'fail' },
  });
  assert.deepEqual(actual.counts, { attempted: 3, successful: 0, interrupted: 2, unknown: 1 });
  assert.deepEqual(actual.journeys.map((row) => row.outcome), ['interrupted', 'interrupted', 'unknown']);
  assert.deepEqual(actual.journeys[0].failures, ['original-latency-budget']);
  assert.deepEqual(actual.journeys[1].failures, [
    'client-visible-error', 'lost-client-state', 'missing-or-duplicate-effect',
  ]);
  assert.deepEqual(actual.journeys[2].missing, ['client-completion', 'client-state', 'effect-count', 'tier-versions']);
  assert.equal(actual.throughput.possibleSuccessfulJourneys, 1);
  assert.equal(actual.throughput.status, 'fail');
  assert.equal(actual.bottleneck.observedResource, 'database-connections');
  assert.deepEqual(actual.bottleneck.observedWaitJourneyIds, ['initial-browse', 'initial-checkout']);
  assert.deepEqual(actual.bottleneck.unresolvedJourneyIds, ['initial-export']);
  assert.equal(actual.bottleneck.rootCause, 'unobserved');
  assert.equal(actual.verdict, 'fail');
});

test('thresholds: equality passes and exactly one additional unit fails each declared budget', () => {
  const capacity = clone(profiles.boundary);
  capacity.contributors[0].connections = 6;
  assert.equal(measureWindow(capacity).shared.observedConnections, 13);
  assert.equal(measureWindow(capacity).shared.status, 'fail');
  const queue = clone(profiles.boundary);
  queue.queue.depth = 5;
  assert.equal(measureWindow(queue).downstream.queueDepth.status, 'fail');
  assert.equal(measureWindow(queue).bottleneck.observedResource, 'worker-queue');
  const wait = clone(profiles.boundary);
  wait.queue.workerWaitMs = 401;
  assert.equal(measureWindow(wait).downstream.workerWaitMs.status, 'fail');
  const client = clone(profiles.boundary);
  client.journeys[0].elapsedMs = 1501;
  client.journeys[0].completedMs = 1501;
  assert.equal(measureWindow(client).journeys[0].outcome, 'interrupted');
  assert.equal(measureWindow(client).throughput.status, 'fail');
  for (const input of [capacity, queue, wait, client]) assert.equal(measureWindow(input).verdict, 'fail');
});

test('observation gap: known failure overrides missing evidence, not an unobserved cause', () => {
  const actual = measureWindow(profiles.gap);
  assert.equal(actual.verdict, 'fail');
  assert.equal(actual.shared.observedConnections, null);
  assert.equal(actual.shared.knownLowerBound, 4);
  assert.equal(actual.shared.status, 'unknown');
  assert.equal(actual.downstream.queueDepth.status, 'unknown');
  assert.equal(actual.bottleneck.observedResource, null);
  assert.equal(actual.bottleneck.rootCause, 'unobserved');
  assert.deepEqual(actual.counts, { attempted: 3, successful: 1, interrupted: 1, unknown: 1 });
  assert.equal(actual.journeys[0].completedMs, 1501);
  assert.equal(actual.journeys[2].completedMs, null);
  assert.equal(actual.journeys[2].effectCount, null);
});

test('unknown: absence is not zero failures, zero final throughput, or successful completion', () => {
  const actual = measureWindow(profiles.unknown);
  assert.equal(actual.verdict, 'unknown');
  assert.deepEqual(actual.counts, { attempted: 3, successful: 0, interrupted: 0, unknown: 3 });
  assert.equal(actual.shared.observedConnections, null);
  assert.equal(actual.shared.status, 'unknown');
  assert.equal(actual.throughput.status, 'unknown');
  assert.equal(actual.throughput.knownLowerBoundPerSecond, 0);
  assert.equal(actual.throughput.possibleSuccessfulJourneys, 3);
  assert.equal(actual.diagnostics.http, 200);
  assert.equal(actual.diagnostics.certifiesContinuity, false);
});

test('a known lower bound breach stays a failure even with other contributors unobserved', () => {
  const input = clone(profiles.unknown);
  input.contributors[0].connections = 13;
  const actual = measureWindow(input);
  assert.equal(actual.shared.observedConnections, null);
  assert.equal(actual.shared.knownLowerBound, 13);
  assert.equal(actual.shared.status, 'fail');
  assert.equal(actual.verdict, 'fail');
  assert.equal(actual.counts.interrupted, 0);
  assert.equal(actual.counts.unknown, 3);
});

test('a known timeout remains interrupted when its completion and effect are unknown', () => {
  const input = clone(profiles.unknown);
  input.journeys[0].elapsedMs = 1501;
  const row = measureWindow(input).journeys[0];
  assert.equal(row.outcome, 'interrupted');
  assert.deepEqual(row.failures, ['original-latency-budget']);
  assert.equal(row.completedMs, null);
  assert.ok(row.missing.includes('client-completion'));
});

test('client correctness and required tier evidence cannot be replaced by HTTP 200', () => {
  for (const mutate of [
    (input) => { input.journeys[0].stateCorrect = false; },
    (input) => { input.journeys[0].effectCount = 2; },
    (input) => { input.journeys[0].versions.api = 'v1'; },
    (input) => { input.journeys[0].clientResult = 'error'; },
  ]) {
    const input = clone(profiles.boundary);
    mutate(input);
    assert.equal(measureWindow(input).journeys[0].http, 200);
    assert.equal(measureWindow(input).journeys[0].outcome, 'interrupted');
    assert.equal(measureWindow(input).verdict, 'fail');
  }
});

test('typed fixed inputs reject strings, nonfinite numbers, altered limits, and malformed joined records', () => {
  const mutations = [
    (input) => { input.contributors[0].connections = '5'; },
    (input) => { input.contributors[0].connections = NaN; },
    (input) => { input.contributors[0].connections = Infinity; },
    (input) => { input.queue.depth = -1; },
    (input) => { input.queue.workerWaitMs = 0.5; },
    (input) => { input.limits.journeyMs = 1600; },
    (input) => { input.simultaneous = 'true'; },
    (input) => { input.tiers[2].windowId = 'another-window'; },
    (input) => { input.contributors[1].id = input.contributors[0].id; },
    (input) => { input.queue.windowId = 'another-window'; },
    (input) => { input.journeys[1].id = input.journeys[0].id; },
    (input) => { input.journeys[0].requiredTiers.pop(); },
    (input) => { input.journeys[0].versions.worker = 'v2'; },
    (input) => { input.journeys[0].stateCorrect = 'true'; },
    (input) => { input.journeys[0].completedMs = 1501; },
    (input) => { input.journeys[0].expectedEffects = 0; },
    (input) => { input.tiers.pop(); },
    (input) => { input.extra = true; },
    (input) => { input.dataMode = 'live'; },
  ];
  for (const mutate of mutations) {
    const input = clone(profiles.boundary);
    mutate(input);
    assert.throws(() => validateWindow(input), { code: 'ERR_S144_INPUT' });
  }
  for (const input of Object.values(profiles)) assert.equal(validateWindow(input), input);
});

test('typed commands and forged state are rejected without mutation', () => {
  const state = createState();
  for (const input of [
    { type: 'conduct', expectedRevision: '0', profile: 'boundary' },
    { type: 'conduct', expectedRevision: NaN, profile: 'boundary' },
    { type: 'conduct', expectedRevision: Infinity, profile: 'boundary' },
    { type: 'conduct', expectedRevision: 0, profile: 1 },
    { type: 'conduct', expectedRevision: 0, profile: 'mitigated' },
    { type: 'conduct', expectedRevision: 0, profile: 'constructor' },
    { type: 'conduct', expectedRevision: 0, profile: 'boundary', extra: true },
    { type: 'accept', expectedRevision: 0 },
    null,
  ]) rejectsUnchanged(state, input);
  assert.throws(() => transition(clone(state), { type: 'reset', expectedRevision: 0 }), { code: 'ERR_S144_INPUT' });
});

test('order, exact run ownership, and stale/replayed revisions gate every measurement', () => {
  let state = createState();
  rejectsUnchanged(state, { type: 'measure', expectedRevision: 0, runId: 'run-1' }, 'ERR_S144_ORDER');
  state = transition(state, { type: 'conduct', expectedRevision: 0, profile: 'overload' });
  rejectsUnchanged(state, { type: 'measure', expectedRevision: 1, runId: 'run-1' }, 'ERR_S144_ORDER');
  rejectsUnchanged(state, { type: 'inspect', expectedRevision: 1, runId: 'run-2' }, 'ERR_S144_ORDER');
  const inspect = { type: 'inspect', expectedRevision: 1, runId: 'run-1' };
  state = transition(state, inspect);
  rejectsUnchanged(state, inspect, 'ERR_S144_ORDER');
  state = command(state, 'measure');
  rejectsUnchanged(state, { type: 'measure', expectedRevision: state.revision, runId: 'run-1' }, 'ERR_S144_ORDER');
  assert.equal(state.history.length, 1);
});

test('unrelated successful probe changes no measurement, cause, completion, or retained history', () => {
  const state = measured('gap');
  const probed = command(state, 'probe');
  assert.equal(probed.history, state.history);
  assert.deepEqual(probed.probe, {
    windowId: 'unrelated-probe', http: 200, ready: true,
    certifiesCombined: false, resolvesOriginalCompletion: false, establishesCause: false,
  });
  assert.equal(probed.history[0].report.bottleneck.rootCause, 'unobserved');
  assert.equal(probed.history[0].report.journeys[2].completedMs, null);
  rejectsUnchanged(probed, { type: 'probe', expectedRevision: probed.revision, runId: probed.run.id }, 'ERR_S144_ORDER');
});

test('fresh combined mitigation passes while original interruption and unknown remain retained', () => {
  let state = measured('overload');
  const first = state.history[0];
  state = command(state, 'mitigate');
  assert.equal(state.phase, 'conducted');
  assert.equal(state.history[0], first);
  assert.equal(state.run.id, 'run-2');
  state = command(state, 'inspect');
  state = command(state, 'measure');
  assert.equal(state.history[1].report.shared.observedConnections, 11);
  assert.equal(state.history[1].report.verdict, 'pass');
  assert.equal(state.history[0], first);
  assert.deepEqual(summarizeHistory(state.history), {
    windows: 2, attempted: 6, successful: 3, interrupted: 2, unknown: 1, verdict: 'fail',
    retainedInterruptedIds: ['run-1/initial-browse', 'run-1/initial-checkout'],
    retainedUnknownIds: ['run-1/initial-export'], failedRunIds: ['run-1'],
  });
  rejectsUnchanged(state, { type: 'mitigate', expectedRevision: state.revision, runId: 'run-2' }, 'ERR_S144_ORDER');
  rejectsUnchanged(state, { type: 'conduct', expectedRevision: state.revision, profile: 'boundary' }, 'ERR_S144_ORDER');
});

test('a fresh pass cannot resolve the original wholly unknown window', () => {
  let state = measured('unknown');
  state = command(state, 'mitigate');
  state = command(state, 'inspect');
  state = command(state, 'measure');
  const history = summarizeHistory(state.history);
  assert.equal(history.verdict, 'unknown');
  assert.equal(history.successful, 3);
  assert.equal(history.unknown, 3);
  assert.equal(history.retainedUnknownIds.length, 3);
});

test('identification distinguishes shared failure, observed in-budget behavior, and unobserved bottleneck', () => {
  for (const [profile, expected] of [
    ['overload', 'database-connections'], ['boundary', 'within-observed-budgets'],
    ['gap', 'unobserved'], ['unknown', 'unobserved'],
  ]) {
    const state = measured(profile);
    const wrong = command(state, 'identify', { choice: 'worker-queue' });
    assert.equal(wrong.feedback.correct, false);
    assert.equal(wrong.history, state.history);
    const correct = command(wrong, 'identify', { choice: expected });
    assert.equal(correct.feedback.correct, true);
    assert.equal(correct.feedback.expected, expected);
    rejectsUnchanged(correct, {
      type: 'identify', expectedRevision: correct.revision, runId: correct.run.id, choice: true,
    });
  }
});

test('explicit reset alone clears history while keeping monotonic revision and unique run IDs', () => {
  const state = measured('overload');
  const reset = transition(state, { type: 'reset', expectedRevision: state.revision });
  assert.equal(reset.phase, 'idle');
  assert.deepEqual(reset.history, []);
  assert.equal(reset.revision, state.revision + 1);
  assert.equal(reset.nextRun, 2);
  rejectsUnchanged(reset, { type: 'conduct', expectedRevision: 0, profile: 'boundary' }, 'ERR_S144_ORDER');
  const again = transition(reset, { type: 'conduct', expectedRevision: reset.revision, profile: 'boundary' });
  assert.equal(again.run.id, 'run-2');
});

test('all fixed fixtures, reports, and issued states have immutable nested records', () => {
  const state = measured('overload');
  assert.ok(Object.isFrozen(profiles.overload.contributors[0]));
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.history[0]));
  assert.ok(Object.isFrozen(state.history[0].report.journeys[0].failures));
  assert.throws(() => { profiles.boundary.contributors[0].connections = 999; }, TypeError);
  assert.throws(() => { state.history[0].report.journeys[2].completedMs = 1; }, TypeError);
});
