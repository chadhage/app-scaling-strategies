'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, summarize, createLesson, packets, limits } = require('./model.js');
const clone = (value) => structuredClone(value);
const errorCode = (code) => (error) => error.code === code;
const expectedSummary = {
  measuredOriginalJourneys: 12, declaredOriginalJourneys: 12, unmeasuredOriginalJourneys: 0,
  measuredTransitionEvents: 1, declaredTransitionEvents: 1, requests: 24, http200Requests: 24,
  movement: { observed: 5, unchanged: 1, contrary: 1, unknown: 5 },
  completions: { successful: 10, failed: 1, unknown: 1 },
  wholeJourneys: { uninterrupted: 7, failed: 1, interrupted: 1, 'over-budget': 1, unknown: 2 },
  successfulMigrations: 1, unchangedSuccessfulJourneys: 1,
};

test('observed same-original movement does not demand an unchanged data tier move', () => {
  const result = evaluate(packets[0]);
  assert.equal(result.movement, 'observed');
  assert.equal(result.successfulMigration, true);
  assert.equal(result.wholeJourney.outcome, 'uninterrupted');
});

test('unchanged successful HTTP 200 users never inflate successful migration', () => {
  const result = evaluate(packets[1]);
  assert.equal(result.movement, 'unchanged');
  assert.equal(result.wholeJourney.completion, 'successful');
  assert.equal(result.unchangedSuccessful, true);
  assert.equal(result.successfulMigration, false);
});

test('all twelve fixed original classifications and counts have distinct shapes', () => {
  const expected = [
    ['observed', 'successful', 'uninterrupted'],
    ['unchanged', 'successful', 'uninterrupted'],
    ['unknown', 'successful', 'uninterrupted'],
    ['unknown', 'unknown', 'unknown'],
    ['unknown', 'successful', 'uninterrupted'],
    ['unknown', 'successful', 'uninterrupted'],
    ['contrary', 'successful', 'uninterrupted'],
    ['observed', 'failed', 'failed'],
    ['observed', 'successful', 'interrupted'],
    ['observed', 'successful', 'over-budget'],
    ['unknown', 'successful', 'uninterrupted'],
    ['observed', 'successful', 'unknown'],
  ];
  const results = packets.map(evaluate);
  assert.deepEqual(results.map((result) => [result.movement, result.wholeJourney.completion, result.wholeJourney.outcome]), expected);
  assert.deepEqual(summarize(results), expectedSummary);
  assert.equal(results.filter((result) => result.successfulMigration).length, 1);
  assert.equal(results.filter((result) => result.unchangedSuccessful).length, 1);
});

test('new-version-only, new attempts, partial required tiers, correlation and timing stay unknown', () => {
  for (const index of [2, 3, 4, 5, 10]) {
    const result = evaluate(packets[index]);
    assert.equal(result.movement, 'unknown', packets[index].label);
    assert.equal(result.successfulMigration, false, packets[index].label);
  }
  assert.equal(evaluate(packets[3]).wholeJourney.completion, 'unknown');
});

test('every required origin/target identity, tier, stamp and typed time must be present', () => {
  const fields = ['id', 'userId', 'journeyId', 'attemptId', 'correlationId', 'transitionId', 'tier', 'phase', 'observedAtMs', 'deployment', 'version'];
  for (const tier of ['frontend', 'api']) {
    for (const phase of ['before', 'after']) {
      for (const field of fields) {
        const packet = clone(packets[0]);
        delete packet.traces.find((trace) => trace.tier === tier && trace.phase === phase)[field];
        const result = evaluate(packet);
        assert.equal(result.movement, 'unknown', `${tier} ${phase} missing ${field}`);
        assert.equal(result.successfulMigration, false);
      }
    }
  }
});

test('wrongly typed, wrong-origin and out-of-window traces cannot become observed movement', () => {
  for (const value of ['1200', true, null, NaN, Infinity, -1, 6001, 1050, 1600]) {
    const packet = clone(packets[0]);
    packet.traces.find((trace) => trace.tier === 'api' && trace.phase === 'after').observedAtMs = value;
    assert.equal(evaluate(packet).movement, 'unknown', `target time ${String(value)}`);
  }
  for (const value of [1000, 1100, -1, '900']) {
    const packet = clone(packets[0]);
    packet.traces.find((trace) => trace.tier === 'frontend' && trace.phase === 'before').observedAtMs = value;
    assert.equal(evaluate(packet).movement, 'unknown');
  }
  const packet = clone(packets[0]);
  packet.traces.find((trace) => trace.tier === 'api' && trace.phase === 'before').version = 'v3';
  assert.equal(evaluate(packet).movement, 'unknown');
});

test('known wrong targets and only-partial declared movement are contrary, not migration success', () => {
  assert.equal(evaluate(packets[6]).movement, 'contrary');
  const packet = clone(packets[0]);
  Object.assign(packet.traces.find((trace) => trace.tier === 'api' && trace.phase === 'after'), { deployment: 'blue', version: 'v1' });
  const result = evaluate(packet);
  assert.equal(result.movement, 'contrary');
  assert.equal(result.wholeJourney.completion, 'successful');
  assert.equal(result.successfulMigration, false);
});

test('irrelevant data-tier movement, healthy probes and requests do not replace required evidence', () => {
  const packet = clone(packets[0]);
  packet.traces = packet.traces.filter((trace) => trace.tier !== 'data');
  packet.traces.forEach((trace) => { delete trace.healthy; });
  packet.requests = [];
  const result = evaluate(packet);
  assert.equal(result.movement, 'observed');
  assert.equal(result.successfulMigration, true);
  assert.equal(result.tierEvidence.find((tier) => tier.tier === 'data').movement, 'not-required');
  const unchanged = clone(packets[1]);
  unchanged.requests.forEach((request) => { request.version = 'v2'; });
  assert.equal(evaluate(unchanged).movement, 'unchanged');
  assert.equal(evaluate(unchanged).successfulMigration, false);
});

test('duplicate, replayed, cross-tier-reused and ambiguous trace records cannot prove migration', () => {
  for (const replacement of ['same-id', 'another-id', 'cross-tier']) {
    const packet = clone(packets[0]);
    const target = packet.traces.find((trace) => trace.tier === 'api' && trace.phase === 'after');
    if (replacement === 'cross-tier') target.id = packet.traces[0].id;
    else {
      const duplicate = clone(target);
      if (replacement === 'another-id') duplicate.id = 'S148-replayed-new-id';
      packet.traces.push(duplicate);
    }
    assert.equal(evaluate(packet).movement, 'unknown', replacement);
    assert.equal(evaluate(packet).successfulMigration, false);
  }
  const packet = clone(packets[0]);
  packet.requests.push(clone(packet.requests[0]));
  assert.deepEqual(evaluate(packet).requests, { total: 2, http200: 2, invalid: true });
});

test('fixed original declarations cannot be rewritten, coerced or filled in implicitly', () => {
  const mutations = [
    (packet) => { delete packet.original.startedAtMs; },
    (packet) => { delete packet.original.transition.endedAtMs; },
    (packet) => { packet.original.budgetMs = '2000'; },
    (packet) => { packet.original.tiers[1].movementRequired = 'true'; },
    (packet) => { packet.original.tiers[1].target.version = 'v3'; },
    (packet) => { packet.original.correlationId = 'S148-other'; },
    (packet) => { delete packet.original; },
    (packet) => { packet.id = 'case-foreign'; },
  ];
  for (const mutate of mutations) {
    const packet = clone(packets[6]);
    mutate(packet);
    const result = evaluate(packet);
    assert.equal(result.contractTrusted, false);
    assert.equal(result.movement, 'unknown');
    assert.equal(result.wholeJourney.outcome, 'unknown');
    assert.equal(result.successfulMigration, false);
  }
  for (const input of [null, undefined, [], true, 'case-01']) assert.equal(evaluate(input).movement, 'unknown');
});

test('terminal correctness is typed, scoped, stateful and independent of routing movement', () => {
  for (const field of ['userId', 'journeyId', 'attemptId', 'correlationId', 'transitionId', 'observedAtMs', 'completed', 'authenticated', 'stateToken', 'businessEffects', 'uiReady']) {
    const packet = clone(packets[0]);
    delete packet.completion[field];
    const result = evaluate(packet);
    assert.equal(result.movement, 'observed', field);
    assert.equal(result.wholeJourney.completion, 'unknown', field);
    assert.equal(result.wholeJourney.outcome, 'unknown', field);
    assert.equal(result.successfulMigration, false, field);
  }
  for (const [field, value] of [['completed', 'true'], ['authenticated', 1], ['uiReady', 'true'], ['businessEffects', '1'], ['observedAtMs', '1500']]) {
    const packet = clone(packets[0]);
    packet.completion[field] = value;
    assert.equal(evaluate(packet).wholeJourney.completion, 'unknown');
    assert.equal(evaluate(packet).successfulMigration, false);
  }
  for (const [field, value] of [['authenticated', false], ['uiReady', false], ['stateToken', 'S148-lost-state'], ['businessEffects', 2], ['completed', false]]) {
    const packet = clone(packets[0]);
    packet.completion[field] = value;
    const result = evaluate(packet);
    assert.equal(result.movement, 'observed');
    assert.equal(result.wholeJourney.outcome, 'failed');
    assert.equal(result.successfulMigration, false);
  }
});

test('later recovery retains interruption, unknown and state failure without restarting the original budget', () => {
  const interrupted = evaluate(packets[8]).wholeJourney;
  assert.equal(interrupted.completion, 'successful');
  assert.equal(interrupted.retainedInterruption, true);
  assert.equal(interrupted.outcome, 'interrupted');
  assert.deepEqual(interrupted.budget, { originalMs: 2000, elapsedMs: 1500, status: 'within' });
  const unknown = evaluate(packets[11]).wholeJourney;
  assert.equal(unknown.completion, 'successful');
  assert.equal(unknown.retainedUnknown, true);
  assert.equal(unknown.outcome, 'unknown');
  assert.equal(unknown.retainedObservations.find((item) => item.kind === 'unknown').observedAtMs, 1050);
  const budget = evaluate(packets[9]).wholeJourney;
  assert.equal(budget.completion, 'successful');
  assert.deepEqual(budget.budget, { originalMs: 2000, elapsedMs: 2600, status: 'exceeded' });
  const packet = clone(packets[8]);
  packet.completion.observedAtMs = 2600;
  const both = evaluate(packet).wholeJourney;
  assert.equal(both.outcome, 'interrupted');
  assert.equal(both.retainedInterruption, true);
  assert.equal(both.budget.status, 'exceeded');
  packet.observations[1].kind = 'state-loss';
  const failed = evaluate(packet).wholeJourney;
  assert.equal(failed.retainedStateFailure, true);
  assert.equal(failed.completion, 'successful');
  assert.equal(failed.outcome, 'failed');
});

test('malformed, replayed or uncorrelated oracle observations retain uncertainty', () => {
  const variants = [
    null,
    [{ kind: 'correct' }],
    [clone(packets[0].observations[0]), clone(packets[0].observations[0])],
    [{ ...packets[0].observations[0], correlationId: 'S148-foreign' }],
    [{ ...packets[0].observations[0], observedAtMs: '900' }],
    [{ ...packets[0].observations[0], observedAtMs: 1600 }],
  ];
  for (const observations of variants) {
    const packet = clone(packets[0]);
    packet.observations = observations;
    const result = evaluate(packet);
    assert.equal(result.wholeJourney.retainedUnknown, true);
    assert.equal(result.wholeJourney.outcome, 'unknown');
    assert.equal(result.successfulMigration, false);
  }
});

test('all fixture identities, times and evidence remain fixed, frozen and deterministic', () => {
  const before = JSON.stringify(packets);
  assert.throws(() => { packets[0].original.budgetMs = 1; }, TypeError);
  assert.throws(() => { packets[0].traces[0].version = 'v3'; }, TypeError);
  const first = packets.map(evaluate);
  assert.deepEqual(packets.map(evaluate), first);
  assert.equal(JSON.stringify(packets), before);
  assert.throws(() => { first[0].successfulMigration = 'true'; }, TypeError);
  assert.throws(() => summarize(first.map((result) => ({ ...result, successfulMigration: 'true' }))), errorCode('ERR_RESULTS'));
});

test('measurement requires literal true and the current scoped one-use inspection', () => {
  const lesson = createLesson();
  const inspection = lesson.inspect();
  const initial = lesson.snapshot();
  for (const command of [
    undefined, null, {}, [],
    ...[false, 'true', 1, new Boolean(true)].map((approved) => ({ approved, inspectionId: inspection.id })),
    { approved: true, inspectionId: 1 },
    { approved: true, inspectionId: inspection.id, packet: packets[0] },
    Object.create({ approved: true, inspectionId: inspection.id }),
  ]) {
    assert.throws(() => lesson.measure(command), errorCode('ERR_CONFIRMATION'));
    assert.deepEqual(lesson.snapshot(), initial);
  }
  assert.throws(() => lesson.measure({ approved: true, inspectionId: 'S148-foreign' }), errorCode('ERR_INSPECTION'));
  const measured = lesson.measure({ approved: true, inspectionId: inspection.id });
  assert.deepEqual(measured.summary, expectedSummary);
  assert.throws(() => lesson.measure({ approved: true, inspectionId: inspection.id }), errorCode('ERR_REPLAY'));
  assert.deepEqual(lesson.snapshot(), measured);
});

test('selection, reset and new inspection do not reuse stale inspection or invent originals', () => {
  const lesson = createLesson();
  const old = lesson.inspect();
  lesson.select('case-02');
  assert.throws(() => lesson.measure({ approved: true, inspectionId: old.id }), errorCode('ERR_INSPECTION'));
  for (const id of [undefined, null, 'unknown', 2, true]) assert.throws(() => lesson.select(id), errorCode('ERR_SELECTION'));
  const first = lesson.inspect();
  const measured = lesson.measure({ approved: true, inspectionId: first.id });
  assert.equal(measured.summary.measuredOriginalJourneys, 1);
  assert.equal(measured.summary.successfulMigrations, 0);
  assert.equal(measured.summary.unchangedSuccessfulJourneys, 1);
  const second = lesson.inspect();
  const repeated = lesson.measure({ approved: true, inspectionId: second.id });
  assert.equal(repeated.summary.measuredOriginalJourneys, 1);
  assert.equal(repeated.summary.requests, 2);
  assert.equal(repeated.summary.measuredTransitionEvents, 1);
  const reset = lesson.reset();
  assert.equal(reset.summary.measuredOriginalJourneys, 0);
  assert.equal(reset.inspectionId, null);
  assert.equal(reset.history.length, 2);
  assert.equal(reset.history[0].results[0].unchangedSuccessful, true);
  assert.throws(() => lesson.measure({ approved: true, inspectionId: second.id }), errorCode('ERR_REPLAY'));
});

test('retained history preserves original interruption and unknown after reset', () => {
  const lesson = createLesson();
  for (const id of ['case-09', 'case-12']) {
    lesson.select(id);
    lesson.measure({ approved: true, inspectionId: lesson.inspect().id });
  }
  const reset = lesson.reset();
  assert.equal(reset.history[0].results[0].wholeJourney.retainedInterruption, true);
  assert.equal(reset.history[1].results[0].wholeJourney.retainedUnknown, true);
  assert.equal(reset.history[0].results[0].wholeJourney.budget.originalMs, 2000);
  assert.equal(reset.history[1].results[0].wholeJourney.outcome, 'unknown');
  assert.throws(() => reset.history.pop(), TypeError);
});

test('measurement, inspection and retained history bounds cannot be bypassed with reset', () => {
  const lesson = createLesson();
  for (let index = 0; index < limits.maxMeasurements; index++) {
    lesson.select('case-01');
    lesson.measure({ approved: true, inspectionId: lesson.inspect().id });
    if (index % 3 === 0) lesson.reset();
  }
  assert.equal(lesson.snapshot().measurements, 24);
  assert.equal(lesson.snapshot().history.length, 8);
  assert.equal(lesson.snapshot().history[0].measurement, 17);
  assert.throws(() => lesson.measure({ approved: true, inspectionId: lesson.inspect().id }), errorCode('ERR_BOUND'));
  while (lesson.snapshot().inspections < limits.maxInspections) lesson.inspect();
  lesson.reset();
  assert.throws(() => lesson.inspect(), errorCode('ERR_BOUND'));
});

test('oversized or untyped evidence arrays cannot produce a successful migration', () => {
  for (const traces of [null, 'healthy', Array(25).fill(packets[0].traces[0])]) {
    const packet = clone(packets[0]);
    packet.traces = traces;
    assert.equal(evaluate(packet).movement, 'unknown');
    assert.equal(evaluate(packet).successfulMigration, false);
  }
  const packet = clone(packets[0]);
  packet.observations = Array(17).fill(packet.observations[0]);
  assert.equal(evaluate(packet).wholeJourney.outcome, 'unknown');
  assert.throws(() => summarize(Array(13).fill(evaluate(packets[0]))), errorCode('ERR_RESULTS'));
});
