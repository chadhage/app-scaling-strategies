'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const model = require(process.env.S095_MODEL || path.resolve(__dirname, '..', 'model.js'));

test('removing the partitioned candidate retains compatible service and recovery evidence', () => {
  const state = model.rehearse(model.emptyState(), {
    fixture: 'healthy-survivor', action: 'gate-candidate', prediction: 'success',
  });
  const result = state.attempts[0];
  assert.equal(result.safety, 'success', 'Observed removal and retained compatible service must pass S095 safety acceptance.');
  assert.deepEqual(result.assertions, {
    candidateRemovedDuringPartition: 'success',
    retainedUsableCompatibleDestination: 'success',
    completePartitionJourneys: 'success',
    recoveryEvidence: 'success',
  });
  assert.deepEqual(result.counts, { attempted: 4, successes: 4, interruptions: 0, unknown: 0 });
  assert.deepEqual(result.transitionCounts, { attempted: 0, successes: 0, interruptions: 0, unknown: 0 });
  assert.equal(result.learning, 'pass');
});

const input = (fixture = 'healthy-survivor', action = 'gate-candidate', prediction = 'success') => ({ fixture, action, prediction });
const resultFor = (value) => model.rehearse(model.emptyState(), value).attempts[0];

test('the exact finite nine fixture/action combinations are deterministic and prediction-independent', () => {
  assert.equal(model.MAX_ATTEMPTS, 6);
  assert.equal(model.ORIGINAL_BUDGET_MS, 250);
  assert.equal(model.FIXTURES.length, 3);
  assert.equal(model.ACTIONS.length, 3);
  for (const fixture of model.FIXTURES) {
    for (const action of model.ACTIONS) {
      const expected = fixture.value === 'missing-evidence' ? 'unknown'
        : fixture.value === 'healthy-survivor' && action.value === 'gate-candidate' ? 'success' : 'failure';
      for (const prediction of model.PREDICTIONS) {
        const value = input(fixture.value, action.value, prediction);
        const a = resultFor(value);
        assert.deepEqual(a, resultFor(value));
        assert.equal(a.safety, expected);
        assert.equal(a.learning, prediction === expected ? 'pass' : 'fail');
        assert.equal(a.counts.attempted, 4);
        assert.equal(a.recovery.counts.attempted, 2);
        assert.equal(a.originalJourneyBudgetMs, 250);
        assert.equal(a.counts.successes + a.counts.interruptions + a.counts.unknown, 4);
      }
    }
  }
});

test('a false prediction changes learning only, never observed acceptance, counts or trace', () => {
  const good = resultFor(input());
  const wrong = resultFor(input('healthy-survivor', 'gate-candidate', 'failure'));
  const facts = (result) => {
    const { input: chosen, learning, ...observations } = result;
    return observations;
  };
  assert.equal(wrong.safety, 'success');
  assert.equal(wrong.learning, 'fail');
  assert.deepEqual(facts(good), facts(wrong));
});

test('both unsafe admission instructions preserve earlier interruptions after removal and repair', () => {
  for (const action of ['keep-candidate', 'reopen-unverified']) {
    const result = resultFor(input('healthy-survivor', action, 'failure'));
    assert.equal(result.safety, 'failure');
    assert.equal(result.learning, 'pass');
    assert.equal(result.duringPartition.candidateAdmission, 'eligible');
    assert.equal(result.duringPartition.observedCandidateArrivals, 2);
    assert.equal(result.current.candidateAdmission, 'removed');
    assert.equal(result.current.ordinaryReadmissionExecuted, false);
    assert.deepEqual(result.current.observedRouting, { oldV1Percent: 100, candidateV2Percent: 0 });
    assert.deepEqual(result.counts, { attempted: 4, successes: 2, interruptions: 2, unknown: 0 });
    assert.deepEqual(result.transitionCounts, { attempted: 2, successes: 0, interruptions: 2, unknown: 0 });
    assert.deepEqual(result.recovery.counts, { attempted: 2, successes: 2, interruptions: 0, unknown: 0 });
    assert.equal(result.recovery.outcome, 'success');
    assert.equal(result.recovery.freshReadiness, true);
    assert.equal(result.recovery.compatible, true);
    assert.equal(result.recovery.capacitySufficient, true);
    assert.match(result.transitionEvidence, /^0\/2 /);
    assert.ok(result.journeys.filter((journey) => journey.destination === 'candidate-v2')
      .every((journey) => journey.epoch === 2 && journey.status === 503 && journey.effects === 0 && journey.outcome === 'failure'));
    if (action === 'reopen-unverified') assert.match(result.trace[2].detail, /BEFORE required-path recovery proof/);
  }
});

test('healthy HTTP200 without compatible saved-state/effect service is four interruptions, not safe retention', () => {
  const result = resultFor(input('incompatible-survivor', 'gate-candidate', 'failure'));
  assert.equal(result.safety, 'failure');
  assert.equal(result.assertions.candidateRemovedDuringPartition, 'success');
  assert.equal(result.assertions.retainedUsableCompatibleDestination, 'failure');
  assert.equal(result.survivor.healthy, true);
  assert.equal(result.survivor.compatible, false);
  assert.deepEqual(result.counts, { attempted: 4, successes: 0, interruptions: 4, unknown: 0 });
  assert.equal(result.transitionCounts.attempted, 0);
  assert.equal(result.transitionEvidence, 'No transition evidence');
  assert.ok(result.journeys.every((journey) => journey.status === 200 && journey.elapsedMs <= 250
    && !journey.savedStatePreserved && journey.effects === 0 && journey.outcome === 'failure'));
});

test('unknown commanded candidate trials retain their denominator and never infer gate/routing/recovery success', () => {
  for (const action of model.ACTIONS) {
    const result = resultFor(input('missing-evidence', action.value, 'unknown'));
    assert.equal(result.safety, 'unknown');
    assert.equal(result.learning, 'pass');
    assert.ok(Object.values(result.assertions).every((value) => value === 'unknown'));
    assert.equal(result.duringPartition.candidateAdmission, 'unknown');
    assert.equal(result.duringPartition.observedCandidateArrivals, null);
    assert.deepEqual(result.duringPartition.observedRouting, { oldV1Percent: null, candidateV2Percent: null });
    assert.equal(result.current.candidateAdmission, 'unknown');
    assert.equal(result.current.futureReadmissionEligible, null);
    assert.equal(result.recovery.freshReadiness, null);
    assert.equal(result.survivor.compatible, null);
    assert.deepEqual(result.counts, { attempted: 4, successes: 0, interruptions: 0, unknown: 4 });
    const trials = action.value === 'gate-candidate' ? 0 : 2;
    assert.deepEqual(result.transitionCounts, { attempted: trials, successes: 0, interruptions: 0, unknown: trials });
    assert.deepEqual(result.recovery.counts, { attempted: 2, successes: 0, interruptions: 0, unknown: 2 });
    assert.ok(result.journeys.every((journey) => journey.destination === null && journey.status === null && journey.outcome === 'unknown'));
  }
});

test('old-only safety success and recovery probes never count as completed migrations', () => {
  const result = resultFor(input());
  assert.equal(result.duringPartition.observedCandidateArrivals, 0);
  assert.equal(result.survivor.requiredPath, 'reachable');
  assert.equal(result.survivor.retained, true);
  assert.equal(result.recovery.requiredCandidateDependency, 'reachable');
  assert.ok(result.journeys.every((journey) => journey.destination === 'old-v1' && journey.epoch === 1));
  assert.ok(result.recovery.probes.every((probe) => probe.destination === 'candidate-v2' && probe.epoch === 2 && probe.phase === 'recovery-validation'));
  assert.equal(result.transitionEvidence, 'No transition evidence');
  assert.equal(result.transitionCounts.successes, 0);
  assert.equal(result.transitionCounts.attempted, 0);
});

test('all result and state data are immutable and caller input cannot mutate retained evidence', () => {
  const chosen = input();
  const state = model.rehearse(model.emptyState(), chosen);
  chosen.action = 'keep-candidate';
  assert.equal(state.attempts[0].input.action, 'gate-candidate');
  function frozen(value) {
    if (!value || typeof value !== 'object') return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
  frozen(state);
  frozen(model.FIXTURES);
  frozen(model.ACTIONS);
  frozen(model.summarize(state));
  assert.throws(() => { state.attempts[0].counts.interruptions = 0; }, TypeError);
  assert.throws(() => state.attempts.push(state.attempts[0]), TypeError);
  assert.throws(() => { state.attempts[0].trace[2].detail = 'Forged'; }, TypeError);
});

test('six retained attempts aggregate failures/unknowns and reject a seventh without pruning', () => {
  let state = model.emptyState();
  const sequence = [input(), input('healthy-survivor', 'keep-candidate', 'failure'), input('missing-evidence', 'keep-candidate', 'unknown')];
  for (let index = 0; index < 6; index += 1) state = model.rehearse(state, sequence[index % 3]);
  const before = JSON.stringify(state);
  assert.deepEqual(model.summarize(state), {
    attempts: 6,
    safety: { successes: 2, failures: 2, unknown: 2 },
    learning: { passes: 6, failures: 0 },
    journeys: { attempted: 24, successes: 12, interruptions: 4, unknown: 8 },
    transitions: { attempted: 8, successes: 0, interruptions: 4, unknown: 4 },
  });
  assert.throws(() => model.rehearse(state, input()), /History limit: six attempts retained/);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(model.emptyState(), { version: 1, attempts: [] });
  assert.equal(state.attempts.length, 6);
});

test('unknown values, coercion, extra fields and executable input are strictly rejected', () => {
  const cases = [
    null, undefined, [], 'healthy-survivor', Object.create(null),
    {}, { ...input(), extra: 'field' }, { ...input(), action: 'https://example.invalid/partition' },
    { ...input(), fixture: 'healthy-survivor ' }, { ...input(), fixture: 1 },
    { ...input(), action: 'GATE-CANDIDATE' }, { ...input(), prediction: 'SUCCESS' },
    { ...input(), prediction: new String('success') }, { ...input(), action: null },
    { ...input(), prediction: () => 'success' }, { ...input(), prediction: NaN },
    { ...input(), prediction: Infinity }, { ...input(), prediction: -0 },
    { ...input(), fixture: 'x'.repeat(2001) },
  ];
  const state = model.emptyState();
  for (const invalid of cases) assert.throws(() => model.rehearse(state, invalid), TypeError);
  let reads = 0;
  const getter = { ...input() };
  Object.defineProperty(getter, 'fixture', { enumerable: true, get() { reads += 1; return 'healthy-survivor'; } });
  assert.throws(() => model.rehearse(state, getter), /getters/);
  assert.equal(reads, 0);
  const symbol = { ...input(), [Symbol('hidden')]: true };
  assert.throws(() => model.rehearse(state, symbol), /symbolic/);
  const hidden = { ...input() };
  Object.defineProperty(hidden, 'hidden', { value: true });
  assert.throws(() => model.rehearse(state, hidden), /hidden fields/);
  assert.equal(state.attempts.length, 0);
});

test('malformed and semantically forged state is rejected before any new result', () => {
  const good = model.rehearse(model.emptyState(), input());
  const clone = () => JSON.parse(JSON.stringify(good));
  const alteredCount = clone(); alteredCount.attempts[0].counts.successes = 99;
  const alteredTrace = clone(); alteredTrace.attempts[0].trace[1].detail = 'A real partition happened';
  const alteredNumber = clone(); alteredNumber.attempts[0].number = 2;
  const missingRecovery = clone(); missingRecovery.attempts[0].recovery.probes.pop();
  const extra = clone(); extra.attempts[0].nativeCertified = true;
  const missingInput = clone(); delete missingInput.attempts[0].input.action;
  const sparse = { version: 1, attempts: new Array(1) };
  const cycle = { version: 1, attempts: [] }; cycle.self = cycle;
  const candidates = [
    null, {}, { version: '1', attempts: [] }, { version: 2, attempts: [] },
    { version: 1, attempts: {} }, { version: 1, attempts: [], extra: true },
    { version: 1, attempts: [null] }, sparse, cycle,
    alteredCount, alteredTrace, alteredNumber, missingRecovery, extra, missingInput,
  ];
  for (const forged of candidates) {
    assert.throws(() => model.rehearse(forged, input()), TypeError);
    assert.throws(() => model.summarize(forged), TypeError);
  }
  const replayed = model.rehearse(clone(), input('missing-evidence', 'gate-candidate', 'unknown'));
  assert.equal(replayed.attempts.length, 2);
  assert.equal(replayed.attempts[1].number, 2);
  assert.deepEqual(replayed.attempts[0], good.attempts[0]);
});
