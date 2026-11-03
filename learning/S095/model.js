'use strict';

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S095Lesson = api;
}(typeof window === 'object' ? window : globalThis, function createLesson() {
  const MAX_ATTEMPTS = 6;
  const ORIGINAL_BUDGET_MS = 250;
  const FIXTURES = [
    { value: 'healthy-survivor', label: 'Observed healthy + compatible survivor' },
    { value: 'incompatible-survivor', label: 'Healthy HTTP 200, incompatible saved state' },
    { value: 'missing-evidence', label: 'Missing gate / routing / client / recovery observations' },
  ];
  const ACTIONS = [
    { value: 'gate-candidate', label: 'Remove candidate admission; wait for fresh recovery proof' },
    { value: 'keep-candidate', label: 'Keep candidate admitting during the partition (unsafe)' },
    { value: 'reopen-unverified', label: 'Remove, then reopen before recovery proof (unsafe)' },
  ];
  const PREDICTIONS = ['success', 'failure', 'unknown'];
  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  function dataOnly(value, label) {
    const ancestors = new Set();
    let nodes = 0;
    function visit(item, depth) {
      nodes += 1;
      if (nodes > 6000 || depth > 20) throw new TypeError(`${label}: bounded plain data required.`);
      if (item === null || typeof item === 'boolean') return;
      if (typeof item === 'string' && item.length <= 2000) return;
      if (typeof item === 'number' && Number.isFinite(item) && !Object.is(item, -0)) return;
      if (typeof item !== 'object' || !item) throw new TypeError(`${label}: no coercion or executable values.`);
      const array = Array.isArray(item);
      if (!array && Object.getPrototypeOf(item) !== Object.prototype) throw new TypeError(`${label}: plain objects only.`);
      if (ancestors.has(item) || Object.getOwnPropertySymbols(item).length) throw new TypeError(`${label}: cyclic or symbolic data rejected.`);
      const names = Object.getOwnPropertyNames(item);
      if (array && (Object.getPrototypeOf(item) !== Array.prototype || item.length > 1000
          || names.length !== item.length + 1 || !names.includes('length'))) {
        throw new TypeError(`${label}: dense bounded arrays only.`);
      }
      ancestors.add(item);
      for (const key of names) {
        if (array && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable
            || (array && !/^(0|[1-9]\d*)$/.test(key))) {
          throw new TypeError(`${label}: getters, hidden fields and array properties rejected.`);
        }
        visit(descriptor.value, depth + 1);
      }
      ancestors.delete(item);
    }
    visit(value, 0);
  }
  function keys(value, expected, label) {
    if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
        || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) {
      throw new TypeError(`${label}: exact fields ${expected.join(', ')} required.`);
    }
  }
  function inputContract(input) {
    dataOnly(input, 'Input');
    keys(input, ['fixture', 'action', 'prediction'], 'Input');
    for (const [key, values] of [
      ['fixture', FIXTURES.map((item) => item.value)],
      ['action', ACTIONS.map((item) => item.value)],
      ['prediction', PREDICTIONS],
    ]) {
      if (typeof input[key] !== 'string' || !values.includes(input[key])) {
        throw new TypeError(`Input: choose an allowed ${key}; arbitrary values are not accepted.`);
      }
    }
    return { fixture: input.fixture, action: input.action, prediction: input.prediction };
  }
  function classify(journey) {
    const facts = ['destination', 'epoch', 'status', 'elapsedMs', 'sessionPreserved', 'savedStatePreserved', 'effects'];
    if (facts.some((key) => journey[key] === null)) return 'unknown';
    return journey.destination === journey.intendedDestination
      && journey.epoch === (journey.destination === 'candidate-v2' ? 2 : 1)
      && journey.status === 200 && journey.elapsedMs <= ORIGINAL_BUDGET_MS
      && journey.sessionPreserved && journey.savedStatePreserved && journey.effects === 1 ? 'success' : 'failure';
  }
  function count(journeys) {
    return {
      attempted: journeys.length,
      successes: journeys.filter((item) => item.outcome === 'success').length,
      interruptions: journeys.filter((item) => item.outcome === 'failure').length,
      unknown: journeys.filter((item) => item.outcome === 'unknown').length,
    };
  }
  function journey(id, intendedDestination, observed, compatible, recovery, index) {
    const candidate = intendedDestination === 'candidate-v2';
    const passes = recovery || (!candidate && compatible);
    const result = {
      id, phase: recovery ? 'recovery-validation' : 'partition',
      intendedDestination,
      destination: observed ? intendedDestination : null,
      epoch: observed ? (candidate ? 2 : 1) : null,
      status: observed ? (candidate && !recovery ? 503 : 200) : null,
      elapsedMs: observed ? (recovery ? 95 + index * 5 : 110 + index * 5) : null,
      sessionPreserved: observed ? true : null,
      savedStatePreserved: observed ? passes : null,
      effects: observed ? (passes ? 1 : 0) : null,
      outcome: 'unknown',
      reason: !observed ? 'Client and effective destination observations are absent.'
        : recovery ? 'Fresh required-path, readiness, capacity and compatibility validation; probe only, not ordinary admission.'
          : candidate ? 'Required candidate path is partitioned: HTTP 503 and no required business effect.'
            : compatible ? 'Retained old-v1 preserves session, saved state, one effect and the original 250 ms budget.'
              : 'HTTP 200 is not enough: old-v1 cannot interpret saved state and the required effect is absent.',
    };
    result.outcome = classify(result);
    return result;
  }
  function evaluate(input, number) {
    const observed = input.fixture !== 'missing-evidence';
    const compatible = input.fixture !== 'incompatible-survivor';
    const gated = input.action === 'gate-candidate';
    const action = ACTIONS.find((item) => item.value === input.action);
    const journeys = Array.from({ length: 4 }, (_, index) => journey(
      `arrival-${index + 1}`, gated || index % 2 === 1 ? 'old-v1' : 'candidate-v2',
      observed, compatible, false, index,
    ));
    const probes = Array.from({ length: 2 }, (_, index) => journey(
      `recovery-check-${index + 1}`, 'candidate-v2', observed, true, true, index,
    ));
    const counts = count(journeys);
    const transitionCounts = count(journeys.filter((item) => item.intendedDestination === 'candidate-v2'));
    const recoveryCounts = count(probes);
    const assertions = {
      candidateRemovedDuringPartition: observed ? (gated ? 'success' : 'failure') : 'unknown',
      retainedUsableCompatibleDestination: observed ? (compatible ? 'success' : 'failure') : 'unknown',
      completePartitionJourneys: observed ? (counts.interruptions === 0 ? 'success' : 'failure') : 'unknown',
      recoveryEvidence: observed ? 'success' : 'unknown',
    };
    const outcomes = Object.values(assertions);
    const safety = outcomes.includes('failure') ? 'failure' : outcomes.includes('unknown') ? 'unknown' : 'success';
    const explanation = safety === 'unknown'
      ? `UNKNOWN: commands are not observations. Effective admission, survivor usability, four client outcomes and recovery proof are missing. ${transitionCounts.attempted} intended candidate trials remain counted without success credit.`
      : safety === 'success'
        ? 'SUCCESS: candidate admission is removed during the partition; retained compatible old-v1 serves all four complete journeys. Fresh recovery proof is retained. Old-only arrivals and validation probes are not completed migration.'
        : !gated
          ? `FAILURE: ${action.label}. Required-path failure reaches new candidate arrivals. All ${counts.interruptions} earlier interruptions remain after later removal and recovery validation.`
          : 'FAILURE: removing candidate admission is necessary but insufficient. The retained destination is healthy HTTP 200 yet incompatible; all four saved-state/effect journeys are interrupted.';
    return {
      number, mode: 'synthetic', sourceId: 'S095', fixtureVersion: 's095-v1',
      input: { ...input }, originalJourneyBudgetMs: ORIGINAL_BUDGET_MS,
      admissionInstruction: gated ? 'Safe required-dependency gate choice; observed survivor and recovery evidence still required.'
        : 'Unsafe instruction: required candidate dependency is still partitioned when admission is allowed.',
      duringPartition: {
        requiredCandidateDependency: 'partitioned (fixed teaching fault record)',
        candidateAdmission: observed ? (gated ? 'removed' : 'eligible') : 'unknown',
        intendedRouting: { oldV1Percent: gated ? 100 : 50, candidateV2Percent: gated ? 0 : 50 },
        observedRouting: { oldV1Percent: observed ? (gated ? 100 : 50) : null, candidateV2Percent: observed ? (gated ? 0 : 50) : null },
        observedCandidateArrivals: observed ? journeys.filter((item) => item.destination === 'candidate-v2').length : null,
      },
      survivor: {
        destination: 'old-v1', epoch: 1, requiredPath: observed ? 'reachable' : 'unknown',
        healthy: observed ? true : null, compatible: observed ? compatible : null,
        capacitySufficient: observed ? true : null, retained: observed ? true : null,
      },
      assertions, safety, explanation, journeys, counts, transitionCounts,
      transitionEvidence: transitionCounts.attempted === 0 ? 'No transition evidence'
        : `${transitionCounts.successes}/${transitionCounts.attempted} uninterrupted transitions; failures and unknowns remain in the denominator.`,
      recovery: {
        requiredCandidateDependency: observed ? 'reachable' : 'unknown',
        freshReadiness: observed ? true : null, compatible: observed ? true : null,
        capacitySufficient: observed ? true : null, outcome: observed ? 'success' : 'unknown',
        probes, counts: recoveryCounts,
        limit: 'Two validation probes only; excluded from ordinary-user and migration counts.',
      },
      current: {
        candidateAdmission: observed ? 'removed' : 'unknown',
        observedRouting: { oldV1Percent: observed ? 100 : null, candidateV2Percent: observed ? 0 : null },
        survivorRetained: observed ? true : null, futureReadmissionEligible: observed ? true : null,
        ordinaryReadmissionExecuted: false,
      },
      learning: input.prediction === safety ? 'pass' : 'fail',
      trace: [
        { step: 0, event: 'Fictional baseline', detail: 'Last-known old-v1 epoch 1 and candidate-v2 epoch 2, 50/50 eligibility; reserve sufficient and compatible only when observed by the selected fixture.' },
        { step: 1, event: 'Candidate-only required-path partition', detail: 'Fixed fault record marks required service path partitioned on candidate-v2 only. No packets, resources or real connections are modified.' },
        { step: 2, event: 'Admission instruction', detail: input.action === 'reopen-unverified'
          ? 'Removal command followed by premature reopening BEFORE required-path recovery proof (teaching data).' : `${action.label} (teaching data).` },
        { step: 3, event: 'Effective partition admission', detail: observed ? `Candidate ${gated ? 'REMOVED' : 'ELIGIBLE'}; old-v1 ${gated ? 100 : 50}%, candidate-v2 ${gated ? 0 : 50}%.` : 'UNKNOWN: no effective gate or routing observation; command acknowledgement is not proof.' },
        { step: 4, event: 'Four original-budget arrivals', detail: `${counts.successes} successes, ${counts.interruptions} interruptions, ${counts.unknown} unknowns; ${transitionCounts.attempted} intended candidate transition trials.` },
        { step: 5, event: 'Later removal and required-path repair', detail: observed ? 'Candidate is now removed; required path is observed reachable. This does not rewrite the partition window.' : 'Commands recorded; effective removal and required-path recovery remain UNKNOWN.' },
        { step: 6, event: 'Fresh recovery validation', detail: observed ? 'Readiness, capacity and compatibility plus two candidate validation probes observed. No ordinary readmission is executed.' : 'Two validation outcomes, fresh readiness, capacity and compatibility are UNKNOWN; do not readmit on command alone.' },
        { step: 7, event: 'Retained evidence', detail: 'All partition outcomes and earlier admission decisions remain in the ledger. Recovery probes never inflate migration credit; no resources exist to clean up.' },
      ],
    };
  }
  function sameData(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
        || Array.isArray(left) !== Array.isArray(right)) return false;
    const a = Object.keys(left).sort();
    const b = Object.keys(right).sort();
    return a.length === b.length && a.every((key, index) => key === b[index] && sameData(left[key], right[key]));
  }
  function stateContract(state) {
    dataOnly(state, 'State');
    keys(state, ['version', 'attempts'], 'State');
    if (state.version !== 1 || !Array.isArray(state.attempts) || state.attempts.length > MAX_ATTEMPTS) {
      throw new TypeError('State: version 1 and at most six canonical attempts required.');
    }
    return state.attempts.map((attempt, index) => {
      if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) throw new TypeError('State: canonical attempt required.');
      const canonicalAttempt = evaluate(inputContract(attempt.input), index + 1);
      if (!sameData(attempt, canonicalAttempt)) throw new TypeError('State integrity: forged, reordered or modified result rejected.');
      return canonicalAttempt;
    });
  }
  function emptyState() {
    return freeze({ version: 1, attempts: [] });
  }
  function rehearse(state, input) {
    const attempts = stateContract(state);
    const validInput = inputContract(input);
    if (attempts.length === MAX_ATTEMPTS) throw new RangeError('History limit: six attempts retained. Reset rehearsal explicitly; no failure or unknown was discarded.');
    return freeze({ version: 1, attempts: [...attempts, evaluate(validInput, attempts.length + 1)] });
  }
  function summarize(state) {
    const attempts = stateContract(state);
    const allJourneys = attempts.flatMap((attempt) => attempt.journeys);
    return freeze({
      attempts: attempts.length,
      safety: {
        successes: attempts.filter((attempt) => attempt.safety === 'success').length,
        failures: attempts.filter((attempt) => attempt.safety === 'failure').length,
        unknown: attempts.filter((attempt) => attempt.safety === 'unknown').length,
      },
      learning: {
        passes: attempts.filter((attempt) => attempt.learning === 'pass').length,
        failures: attempts.filter((attempt) => attempt.learning === 'fail').length,
      },
      journeys: count(allJourneys),
      transitions: count(allJourneys.filter((item) => item.intendedDestination === 'candidate-v2')),
    });
  }
  return freeze({ MAX_ATTEMPTS, ORIGINAL_BUDGET_MS, FIXTURES, ACTIONS, PREDICTIONS, emptyState, rehearse, summarize });
}));
