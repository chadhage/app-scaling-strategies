'use strict';

(function publish(root) {
  const ALPHA = 0.05;
  const TARGET = 0.00001;
  const MAX_ATTEMPTS = 12;
  const UNITS = ['REQUEST', 'USER', 'EVENT', 'JOURNEY'];
  const CONCLUSIONS = {
    CONDITIONAL_BOUND_MET: 'Conditional illustrative bound met — not certification',
    INSUFFICIENT_EVIDENCE: 'Insufficient qualifying sample',
    ASSUMPTIONS_UNQUALIFIED: 'Independence or comparability unqualified',
    OBSERVED_INTERRUPTION: 'Original interruption retained',
    UNKNOWN_EVIDENCE: 'Unknown started outcome retained',
    NO_EVIDENCE: 'No attempted transition evidence',
    WRONG_DENOMINATOR: 'Wrong counting unit for the journey denominator',
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function objectKeys(value, keys) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const actual = Reflect.ownKeys(value);
    return actual.length === keys.length && keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    });
  }
  function plainArray(value) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const keys = Reflect.ownKeys(value);
    return keys.length === value.length + 1 && keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === 'string' && (key === 'length' || /^(0|[1-9]\d*)$/.test(key))
        && descriptor && Object.hasOwn(descriptor, 'value');
    });
  }
  function same(value, expected) {
    if (expected === null || typeof expected !== 'object') return Object.is(value, expected);
    if (Array.isArray(expected)) {
      return plainArray(value) && value.length === expected.length
        && expected.every((item, index) => same(value[index], item));
    }
    return objectKeys(value, Object.keys(expected))
      && Object.keys(expected).every((key) => same(value[key], expected[key]));
  }
  function upperBound(n) {
    if (!Number.isSafeInteger(n) || n < 1 || n > 1000000000) {
      throw new Error('A bounded positive typed integer n is required; no empty-sample bound.');
    }
    return -Math.expm1(Math.log(ALPHA) / n);
  }
  const minimumN = Math.ceil(Math.log(ALPHA) / Math.log1p(-TARGET));
  const illustration = freeze({
    method: 'one-sided 95 percent zero-failure binomial',
    confidenceLevel: 0.95,
    alpha: ALPHA,
    targetInterruptionProbability: TARGET,
    minimumN,
    previousN: minimumN - 1,
    previousUpper: upperBound(minimumN - 1),
    minimumUpper: upperBound(minimumN),
    previousFails: upperBound(minimumN - 1) > TARGET,
    minimumPasses: upperBound(minimumN) <= TARGET,
    qualifyingUnit: 'independent comparable completely observed Bernoulli transition JOURNEY',
    scope: 'Conditional mathematical illustration only; not confidence from aggregate counts or an Azure SLA/certification.',
  });
  const boundary = {
    unit: 'JOURNEY',
    eventBoundary: 'One declared user journey crossing a deployment or capacity transition.',
    observationWindow: 'Fixed fictional original-start to declared original-budget outcome.',
    attribution: 'All started original outcomes count; later usability recovery is a separate observation.',
  };
  const qualify = {
    independent: true, comparable: true, completeObservation: true, provenByCounts: false,
    declaration: 'Independence and comparability are stipulated for this fictional illustration, not measured or inferred from counts.',
  };
  function fixed(id, label, evidenceClass, counts, journeys, assumptions, population, representation) {
    return { id, label, evidenceClass, counts, journeys, assumptions, boundary: { ...boundary, population }, representation };
  }
  const summaries = (started) => ({
    started, uninterrupted: started, interrupted: 0, unknown: 0, originals: [], recoveries: [],
  });
  const smallOriginals = (second, fourth = 'uninterrupted') => [
    { id: 'J149-1', outcome: 'uninterrupted', reason: 'Complete original fictional journey met all declared criteria.' },
    { id: 'J149-2', outcome: second, reason: second === 'interrupted' ? 'Original fictional timeout exceeded its declared journey budget.' : 'Original started outcome was not observed.' },
    { id: 'J149-3', outcome: 'uninterrupted', reason: 'Complete original fictional journey met all declared criteria.' },
    { id: 'J149-4', outcome: fourth, reason: fourth === 'unknown' ? 'Original started outcome was not observed.' : 'Complete original fictional journey met all declared criteria.' },
  ];
  const recovery = [{ originalId: 'J149-2', laterOutcome: 'uninterrupted', countsAsOriginalSuccess: false }];
  const shared = {
    independent: false, comparable: true, completeObservation: true, provenByCounts: false,
    declaration: 'One shared fictional event and repeated exposure do not establish independent transition trials.',
  };
  const PROFILES = freeze([
    fixed('qualified-minimum', '299,572 stipulated qualifying journeys', 'positive',
      { requests: 5991440, users: 299572, events: 299572 }, summaries(299572), { ...qualify },
      '299,572 fictional distinct users, one journey in each stipulated independent comparable event.',
      'Fixed fictional count summary only; no individual trials are generated, executed or observed.'),
    fixed('qualified-one-short', '299,571 — exactly one trial short', 'negative',
      { requests: 5991420, users: 299571, events: 299571 }, summaries(299571), { ...qualify },
      '299,571 fictional distinct users, one journey in each stipulated independent comparable event.',
      'Fixed fictional count summary only; no individual trials are generated, executed or observed.'),
    fixed('request-heavy-small', '6,000,000 requests; only 1,000 journeys', 'negative',
      { requests: 6000000, users: 1000, events: 1000 }, summaries(1000), { ...qualify },
      '1,000 fictional users and stipulated comparable independent journey events; many diagnostic requests.',
      'Fixed fictional count summary; request throughput is not additional journey evidence.'),
    fixed('correlated-single-event', '299,572 journeys in one correlated event', 'unknown',
      { requests: 5991440, users: 149786, events: 1 }, summaries(299572), { ...shared },
      '149,786 fictional users with two journeys each in one shared transition event.',
      'Fixed fictional count summary with explicit dependence; no effective independent n is invented.'),
    fixed('incomparable-contexts', '299,572 journeys; incomparable contexts', 'unknown',
      { requests: 5991440, users: 299572, events: 299572 }, summaries(299572),
      { ...qualify, comparable: false, declaration: 'Fictional host/protocol/cohort contexts differ; comparability is explicitly unqualified.' },
      'Fictional host, protocol and cohort contexts with no established comparable observation contract.',
      'Fixed fictional count summary; distinct events alone do not prove comparable Bernoulli trials.'),
    fixed('interrupted-recovered', 'Four starts; original interruption then recovery', 'negative',
      { requests: 80, users: 4, events: 1 },
      { started: 4, uninterrupted: 3, interrupted: 1, unknown: 0, originals: smallOriginals('interrupted'), recoveries: recovery },
      { ...shared }, 'Four fictional original journeys crossing one shared event.',
      'Four fixed original outcome records and one separate later usability record.'),
    fixed('unknown-recovered', 'Four starts; unknown original then recovery', 'unknown',
      { requests: 80, users: 4, events: 1 },
      { started: 4, uninterrupted: 3, interrupted: 0, unknown: 1, originals: smallOriginals('unknown'), recoveries: recovery },
      { ...shared, completeObservation: false }, 'Four fictional original journeys; one original outcome remains unobserved.',
      'Four fixed original outcome records; later usability cannot fill the missing original outcome.'),
    fixed('failure-and-unknown', 'Four starts; interruption and unknown retained', 'negative',
      { requests: 80, users: 4, events: 1 },
      { started: 4, uninterrupted: 2, interrupted: 1, unknown: 1, originals: smallOriginals('interrupted', 'unknown'), recoveries: recovery },
      { ...shared, completeObservation: false }, 'Four fictional original journeys; interruption and missing outcome coexist.',
      'Four fixed original outcomes; a known interruption does not erase the separate uncertainty.'),
    fixed('empty-transition-sample', 'Successful diagnostic requests; no journey starts', 'unknown',
      { requests: 6000000, users: 1000, events: 1 }, summaries(0), { ...shared },
      'Fictional diagnostic users remained outside any declared attempted transition journey.',
      'Fixed diagnostic count summary only; no transition sample or successful migration is claimed.'),
  ]);
  function getProfile(id) {
    if (typeof id !== 'string') throw new Error('Invalid fixed profile: a typed listed ID is required.');
    const profile = PROFILES.find((entry) => entry.id === id);
    if (!profile) throw new Error('Invalid fixed profile: choose a listed fictional record.');
    return profile;
  }
  function validateProfile(value) {
    const descriptor = value && Object.getOwnPropertyDescriptor(value, 'id');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string'
        || !same(value, getProfile(descriptor.value))) {
      throw new Error('Invalid typed or altered fixed evidence profile; counts and assumptions are not editable.');
    }
    const { journeys } = value;
    if (journeys.started !== journeys.uninterrupted + journeys.interrupted + journeys.unknown
        || !Object.values(value.counts).every((count) => Number.isSafeInteger(count) && count >= 0)) {
      throw new Error('Original started-outcome accounting mismatch.');
    }
    if (journeys.originals.length) {
      const count = (outcome) => journeys.originals.filter((item) => item.outcome === outcome).length;
      if (journeys.originals.length !== journeys.started || count('uninterrupted') !== journeys.uninterrupted
          || count('interrupted') !== journeys.interrupted || count('unknown') !== journeys.unknown) {
        throw new Error('Original outcome records cannot disappear from the denominator.');
      }
    }
    return true;
  }
  PROFILES.forEach(validateProfile);
  function evaluate(id, basis) {
    const profile = getProfile(id);
    if (typeof basis !== 'string' || !UNITS.includes(basis)) throw new Error('Invalid fixed counting unit.');
    const { journeys, assumptions } = profile;
    const started = journeys.started;
    const selectedCount = basis === 'JOURNEY' ? started : profile.counts[{ REQUEST: 'requests', USER: 'users', EVENT: 'events' }[basis]];
    let status;
    let n = null;
    let upper = null;
    if (basis !== 'JOURNEY') status = 'WRONG_DENOMINATOR';
    else if (!started) status = 'NO_EVIDENCE';
    else if (journeys.interrupted) status = 'OBSERVED_INTERRUPTION';
    else if (journeys.unknown || !assumptions.completeObservation) status = 'UNKNOWN_EVIDENCE';
    else if (!assumptions.independent || !assumptions.comparable) status = 'ASSUMPTIONS_UNQUALIFIED';
    else {
      n = started;
      upper = upperBound(n);
      status = upper <= TARGET ? 'CONDITIONAL_BOUND_MET' : 'INSUFFICIENT_EVIDENCE';
    }
    const warnings = [
      'All counts and assumptions are fixed fictional teaching DATA ONLY; no trials run.',
      'Zero observed failures is not five-nines proof.',
      'Conditional illustration only — not a real Azure SLA, certification or confidence inferred from aggregate counts.',
      'REQUEST, USER and EVENT are diagnostic units; all started transition JOURNEY outcomes stay in the denominator.',
      'Retained exercises reuse fixed records, not extra independent trials; never pool them.',
    ];
    if (basis !== 'JOURNEY') warnings.push(`Wrong denominator: the selected ${basis} count cannot replace attempted transition journeys.`);
    if (!started) warnings.push('Insufficient evidence: an empty transition sample is not 100% success.');
    if (journeys.interrupted) warnings.push('An original interruption remains counted after later recovery; the zero-failure bound is inapplicable.');
    if (journeys.unknown || !assumptions.completeObservation) warnings.push('Insufficient evidence: unknown started outcomes remain counted; complete observation is unqualified.');
    if (!assumptions.independent) warnings.push('Insufficient evidence: correlated requests, users and transitions sharing events are not independent comparable trials.');
    if (!assumptions.comparable) warnings.push('Insufficient evidence: contexts are not comparable; a large event count does not establish applicability.');
    if (status === 'INSUFFICIENT_EVIDENCE') warnings.push(`Insufficient evidence: ${started.toLocaleString('en-US')} qualifying fictional journeys fall short of the illustrative minimum 299,572.`);
    if (n !== null) warnings.push('This bound is conditional on explicitly stipulated independence, comparability and complete observation; none is proven by counts here.');
    return freeze({
      schema: 'S149/evidence/v1', profileId: id, evidenceClass: profile.evidenceClass,
      selected: { unit: basis, count: selectedCount, isJourneyDenominator: basis === 'JOURNEY' },
      diagnostics: [
        { unit: 'REQUEST', count: profile.counts.requests, role: 'Diagnostic requests, not independent transition trials.' },
        { unit: 'USER', count: profile.counts.users, role: 'Distinct diagnostic users, not an interchangeable trial denominator.' },
        { unit: 'EVENT', count: profile.counts.events, role: 'Transition clusters/contexts, not assumed independent comparable user journeys.' },
      ],
      boundary: clone(profile.boundary), representation: profile.representation,
      journeys: {
        ...clone(journeys),
        accountedOutcomes: journeys.uninterrupted + journeys.interrupted + journeys.unknown,
        successFraction: started ? journeys.uninterrupted / started : null,
        observedInterruptionFraction: started ? journeys.interrupted / started : null,
        unknownFraction: started ? journeys.unknown / started : null,
        unknownExcluded: false, recoveryReplacesOriginal: false,
      },
      assumptions: clone(assumptions),
      confidence: {
        method: 'one-sided 95 percent zero-failure binomial',
        confidenceLevel: 0.95, alpha: ALPHA, targetInterruptionProbability: TARGET,
        qualifyingUnit: illustration.qualifyingUnit, qualifyingN: n,
        upperInterruptionProbability: upper, thresholdMet: upper === null ? null : upper <= TARGET,
        status, conclusion: CONCLUSIONS[status], certification: false, countsProveAssumptions: false,
        illustration: clone(illustration),
      },
      warnings,
    });
  }
  function initial() {
    return { schema: 'S149/session/v1', revision: 0, journal: [], activeAttempt: null, attempts: [] };
  }
  function applyEvent(state, event) {
    if (event.action === 'select') {
      if (state.activeAttempt !== null) throw new Error('Archive/reset the active exercise before selecting another record.');
      if (state.attempts.length >= MAX_ATTEMPTS) throw new Error('Twelve-exercise bound reached; retained history is not truncated.');
      const assessment = evaluate(event.profileId, event.basis);
      if (typeof event.expected !== 'string' || !Object.hasOwn(CONCLUSIONS, event.expected)) throw new Error('Invalid fixed expected conclusion.');
      const number = state.attempts.length + 1;
      state.attempts.push({ number, profileId: event.profileId, basis: event.basis, expected: event.expected, assessment: clone(assessment), result: null });
      state.activeAttempt = number;
    } else if (event.action === 'check') {
      if (state.activeAttempt === null) throw new Error('Select and inspect a fixed record before checking.');
      const attempt = state.attempts[state.activeAttempt - 1];
      if (attempt.result !== null) throw new Error('This revision was already checked; archive/reset before a new answer.');
      const actual = attempt.assessment.confidence.status;
      const matched = attempt.expected === actual;
      attempt.result = { verdict: matched ? 'PASS' : 'FAIL', expected: attempt.expected, actual, matched };
    } else if (event.action === 'reset') {
      if (state.activeAttempt === null) throw new Error('No active exercise to archive in the retained journal.');
      state.activeAttempt = null;
    }
  }
  function eventKeys(action) {
    return action === 'select' ? ['seq', 'action', 'profileId', 'basis', 'expected'] : ['seq', 'action'];
  }
  function project(journal) {
    if (!plainArray(journal) || journal.length > MAX_ATTEMPTS * 3) throw new Error('Invalid bounded retained journal.');
    const state = initial();
    for (let index = 0; index < journal.length; index++) {
      const event = journal[index];
      const descriptor = event && Object.getOwnPropertyDescriptor(event, 'action');
      const action = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
      if (!['select', 'check', 'reset'].includes(action) || !objectKeys(event, eventKeys(action))
          || !Number.isSafeInteger(event.seq) || event.seq !== index + 1) {
        throw new Error('Invalid typed, reordered or replayed journal event.');
      }
      applyEvent(state, event);
      state.journal.push(clone(event));
      state.revision = index + 1;
    }
    return state;
  }
  function validateSession(value) {
    if (!objectKeys(value, ['schema', 'revision', 'journal', 'activeAttempt', 'attempts'])
        || value.schema !== 'S149/session/v1' || !Number.isSafeInteger(value.revision)
        || !plainArray(value.attempts) || value.attempts.length > MAX_ATTEMPTS
        || !same(value, project(value.journal))) {
      throw new Error('Invalid typed session or evidence changed outside its retained journal replay.');
    }
    return true;
  }
  function dispatch(session, command) {
    validateSession(session);
    const descriptor = command && Object.getOwnPropertyDescriptor(command, 'action');
    const action = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
    const keys = action === 'select' ? ['action', 'revision', 'profileId', 'basis', 'expected'] : ['action', 'revision'];
    if (!['select', 'check', 'reset'].includes(action) || !objectKeys(command, keys)) throw new Error('Invalid typed fixed command shape.');
    if (!Number.isSafeInteger(command.revision) || command.revision !== session.revision) throw new Error('Stale or invalid typed revision; nothing changed.');
    if (action === 'reset' && session.activeAttempt === null) return session;
    if (action === 'select' && session.attempts.length >= MAX_ATTEMPTS) throw new Error('Twelve-exercise bound reached; retained history is not truncated.');
    const { revision: ignored, ...payload } = command;
    return freeze(project([...session.journal, { seq: session.revision + 1, ...payload }]));
  }
  function summary(session) {
    validateSession(session);
    const checked = session.attempts.filter((attempt) => attempt.result !== null);
    const answerFailures = checked.filter((attempt) => !attempt.result.matched).length;
    const unchecked = session.attempts.length - checked.length;
    return freeze({
      attempts: session.attempts.length, checked: checked.length, unchecked, answerFailures,
      teachingVerdict: answerFailures ? 'FAIL' : !checked.length || unchecked ? 'UNKNOWN' : 'PASS',
      evidenceStatuses: session.attempts.map((attempt) => attempt.assessment.confidence.status),
      reliabilityPooling: false, certification: false,
    });
  }
  const api = freeze({
    profiles: PROFILES, units: UNITS, conclusions: CONCLUSIONS, illustration, maxAttempts: MAX_ATTEMPTS,
    upperBound, getProfile, validateProfile, evaluate, validateSession, dispatch, summary,
    createSession: () => freeze(initial()),
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S149 = api;
})(globalThis);
