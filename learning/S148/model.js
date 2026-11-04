'use strict';

(function expose(root, factory) {
  const fixtures = typeof module === 'object' && module.exports ? require('./fixtures.js') : root.S148Fixtures;
  const api = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S148Model = api;
}(typeof globalThis === 'object' ? globalThis : this, (fixtures) => {
  if (!fixtures || !Array.isArray(fixtures.packets) || !fixtures.limits) {
    return Object.freeze({ loadError: 'Fixed fictional fixture assets did not load. No result can be measured.' });
  }
  const identityKeys = ['userId', 'journeyId', 'attemptId', 'correlationId', 'transitionId'];
  const movementKinds = ['observed', 'unchanged', 'contrary', 'unknown'];
  const wholeKinds = ['uninterrupted', 'failed', 'interrupted', 'over-budget', 'unknown'];
  const completionKinds = ['successful', 'failed', 'unknown'];
  const registeredResults = new WeakSet();
  const { packets, limits } = fixtures;

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function record(value) {
    return value !== null && typeof value === 'object'
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }

  function text(value) {
    return typeof value === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(value);
  }

  function time(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= limits.maxTimeMs;
  }

  function sameData(left, right) {
    if (left === right) return true;
    if (Array.isArray(right)) {
      return Array.isArray(left) && left.length === right.length
        && right.every((value, index) => sameData(left[index], value));
    }
    if (record(right)) {
      return record(left) && Object.keys(left).length === Object.keys(right).length
        && Object.keys(right).every((key) => Object.hasOwn(left, key) && sameData(left[key], right[key]));
    }
    return false;
  }

  function sameIdentity(item, original) {
    return record(item) && identityKeys.every((key) => text(item[key]) && item[key] === original[key]);
  }

  function stamp(item) {
    return record(item) && text(item.deployment) && text(item.version);
  }

  function sameStamp(left, right) {
    return left.deployment === right.deployment && left.version === right.version;
  }

  function evidenceProjection(item) {
    return Object.fromEntries(['id', ...identityKeys, 'tier', 'phase', 'observedAtMs', 'deployment', 'version', 'healthy']
      .map((key) => [key, Object.hasOwn(item, key) ? item[key] : null]));
  }

  function tierMovement(declaration, original, traces, completion) {
    if (declaration.movementRequired === false) {
      return { tier: declaration.tier, movement: 'not-required', reason: 'This declared shared tier is not required to move.', before: null, after: null };
    }
    const result = { tier: declaration.tier, movement: 'unknown', reason: 'Missing unique, correctly scoped and timed origin/target evidence.', before: null, after: null };
    if (!Array.isArray(traces) || traces.length > 24) return result;
    const relevant = traces.filter((item) => record(item) && item.tier === declaration.tier);
    const allIds = traces.filter(record).map((item) => item.id);
    const ids = relevant.map((item) => item.id);
    if (ids.some((id) => !text(id)) || new Set(ids).size !== ids.length
      || ids.some((id) => allIds.filter((candidate) => candidate === id).length !== 1)) {
      return { ...result, reason: 'Missing or replayed trace identity; repeated records are not movement.' };
    }
    const trusted = relevant.filter((item) => sameIdentity(item, original)
      && time(item.observedAtMs) && item.observedAtMs >= original.startedAtMs && stamp(item));
    const before = trusted.filter((item) => item.phase === 'before' && item.observedAtMs < original.transition.startedAtMs);
    const completionBound = sameIdentity(completion, original) && time(completion.observedAtMs) ? completion.observedAtMs : limits.maxTimeMs;
    const after = trusted.filter((item) => item.phase === 'after'
      && item.observedAtMs >= original.transition.endedAtMs && item.observedAtMs <= completionBound);
    if (before.length !== 1 || after.length !== 1) return result;
    result.before = evidenceProjection(before[0]);
    result.after = evidenceProjection(after[0]);
    if (!sameStamp(before[0], declaration.origin)) {
      return { ...result, reason: 'The required declared original deployment/version was not observed.' };
    }
    if (sameStamp(after[0], declaration.target)) {
      return { ...result, movement: 'observed', reason: 'Same original identity moved from the declared origin to the intended target after the transition.' };
    }
    if (sameStamp(after[0], declaration.origin)) {
      return { ...result, movement: 'unchanged', reason: 'Both required observations remain on the declared original deployment/version.' };
    }
    return { ...result, movement: 'contrary', reason: 'A known target stamp contradicts the intended deployment/version.' };
  }

  function wholeJourney(packet, original, contractTrusted) {
    const completion = packet.completion;
    const scopedCompletion = contractTrusted && sameIdentity(completion, original)
      && time(completion.observedAtMs) && completion.observedAtMs >= original.startedAtMs;
    const typedCompletion = scopedCompletion && typeof completion.completed === 'boolean'
      && typeof completion.authenticated === 'boolean' && typeof completion.uiReady === 'boolean'
      && text(completion.stateToken) && Number.isSafeInteger(completion.businessEffects)
      && completion.businessEffects >= 0 && completion.businessEffects <= 10;
    const correctState = typedCompletion
      ? ['authenticated', 'stateToken', 'businessEffects', 'uiReady'].every((key) => completion[key] === original.expectedState[key])
      : null;
    const terminal = typedCompletion ? (completion.completed && correctState ? 'successful' : 'failed') : 'unknown';
    const elapsedMs = scopedCompletion ? completion.observedAtMs - original.startedAtMs : null;
    const budgetStatus = elapsedMs === null ? 'unknown' : (elapsedMs <= original.budgetMs ? 'within' : 'exceeded');
    const observations = Array.isArray(packet.observations) && packet.observations.length <= 16 ? packet.observations : null;
    const retained = [];
    let interruption = false;
    let stateFailure = false;
    let uncertainty = !contractTrusted || observations === null;
    const seen = new Set();
    for (const item of observations || []) {
      const trusted = sameIdentity(item, original) && text(item.id) && !seen.has(item.id)
        && time(item.observedAtMs) && item.observedAtMs >= original.startedAtMs
        && ['correct', 'interruption', 'state-loss', 'unknown', 'recovery'].includes(item.kind)
        && (!scopedCompletion || item.observedAtMs <= completion.observedAtMs);
      if (record(item)) seen.add(item.id);
      if (!trusted) uncertainty = true;
      if (trusted && item.kind === 'interruption') interruption = true;
      if (trusted && item.kind === 'state-loss') stateFailure = true;
      if (trusted && item.kind === 'unknown') uncertainty = true;
      retained.push({
        id: record(item) && text(item.id) ? item.id : null,
        kind: record(item) && typeof item.kind === 'string' ? item.kind : 'invalid',
        observedAtMs: record(item) && time(item.observedAtMs) ? item.observedAtMs : null,
        trusted,
      });
    }
    let outcome = 'uninterrupted';
    if (interruption) outcome = 'interrupted';
    else if (terminal === 'failed' || stateFailure) outcome = 'failed';
    else if (budgetStatus === 'exceeded') outcome = 'over-budget';
    else if (terminal === 'unknown' || uncertainty || budgetStatus === 'unknown') outcome = 'unknown';
    return {
      outcome, completion: terminal, stateCorrect: correctState,
      interruption: interruption ? 'observed' : (uncertainty ? 'unknown' : 'none-observed'),
      budget: { originalMs: original.budgetMs, elapsedMs, status: budgetStatus },
      retainedInterruption: interruption, retainedStateFailure: stateFailure,
      retainedUnknown: uncertainty, retainedObservations: retained,
    };
  }

  function requestSummary(requests) {
    if (!Array.isArray(requests) || requests.length > 8) return { total: 0, http200: 0, invalid: true };
    const unique = new Map();
    let invalid = false;
    for (const item of requests) {
      if (!record(item) || !text(item.id) || unique.has(item.id)) invalid = true;
      else unique.set(item.id, item);
    }
    return { total: unique.size, http200: [...unique.values()].filter((item) => item.httpStatus === 200).length, invalid };
  }

  function evaluate(packet) {
    const input = record(packet) ? packet : {};
    const registered = packets.find((candidate) => candidate.id === input.id);
    const original = registered ? registered.original : packets[0].original;
    const contractTrusted = Boolean(registered) && sameData(input.original, original);
    const tierEvidence = original.tiers.map((declaration) => contractTrusted
      ? tierMovement(declaration, original, input.traces, input.completion)
      : { tier: declaration.tier, movement: declaration.movementRequired ? 'unknown' : 'not-required', reason: 'The fixed original declaration is missing or altered.', before: null, after: null });
    const required = tierEvidence.filter((item) => item.movement !== 'not-required');
    let movement = 'unknown';
    if (contractTrusted && required.length && required.every((item) => item.movement !== 'unknown')) {
      if (required.every((item) => item.movement === 'observed')) movement = 'observed';
      else if (required.every((item) => item.movement === 'unchanged')) movement = 'unchanged';
      else movement = 'contrary';
    }
    const whole = wholeJourney(input, original, contractTrusted);
    const result = {
      caseId: registered ? registered.id : null, original,
      movement, tierEvidence, wholeJourney: whole,
      successfulMigration: movement === 'observed' && whole.outcome === 'uninterrupted',
      unchangedSuccessful: movement === 'unchanged' && whole.outcome === 'uninterrupted',
      requests: requestSummary(input.requests),
      contractTrusted,
    };
    registeredResults.add(result);
    return freeze(result);
  }

  function problem(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function summarize(results) {
    if (!Array.isArray(results) || results.length > packets.length
      || results.some((result) => !registeredResults.has(result) || !result.caseId)) {
      problem('ERR_RESULTS', 'Only measured registered original results can be summarized.');
    }
    const unique = [...new Map(results.map((result) => [result.caseId, result])).values()];
    const counts = (kinds, select) => Object.fromEntries(kinds.map((kind) => [kind, unique.filter((result) => select(result) === kind).length]));
    return freeze({
      measuredOriginalJourneys: unique.length,
      declaredOriginalJourneys: packets.length,
      unmeasuredOriginalJourneys: packets.length - unique.length,
      measuredTransitionEvents: new Set(unique.map((result) => result.original.transition.id)).size,
      declaredTransitionEvents: 1,
      requests: unique.reduce((total, result) => total + result.requests.total, 0),
      http200Requests: unique.reduce((total, result) => total + result.requests.http200, 0),
      movement: counts(movementKinds, (result) => result.movement),
      completions: counts(completionKinds, (result) => result.wholeJourney.completion),
      wholeJourneys: counts(wholeKinds, (result) => result.wholeJourney.outcome),
      successfulMigrations: unique.filter((result) => result.successfulMigration === true).length,
      unchangedSuccessfulJourneys: unique.filter((result) => result.unchangedSuccessful === true).length,
    });
  }

  function createLesson() {
    let selected = 'cohort';
    let inspection = null;
    let inspections = 0;
    let measurements = 0;
    let generation = 1;
    let current = new Map();
    const used = new Set();
    const history = [];

    function snapshot() {
      const results = [...current.values()];
      return freeze({
        selected, generation, inspections, measurements,
        inspectionId: inspection ? inspection.id : null,
        results, summary: summarize(results), history: history.slice(), limits,
      });
    }

    function select(id) {
      if (typeof id !== 'string' || (id !== 'cohort' && !packets.some((packet) => packet.id === id))) {
        problem('ERR_SELECTION', 'Choose one of the fixed fictional packets or the fixed cohort.');
      }
      selected = id;
      inspection = null;
      return snapshot();
    }

    function inspect() {
      if (inspections >= limits.maxInspections) problem('ERR_BOUND', 'The 48-inspection lesson limit is reached. Reload for a new bounded rehearsal.');
      inspections++;
      inspection = {
        id: `S148-inspection-${generation}-${inspections}-${selected}`,
        selected,
        packets: selected === 'cohort' ? packets : packets.filter((packet) => packet.id === selected),
      };
      return freeze({ ...inspection });
    }

    function measure(command) {
      if (!record(command) || Object.keys(command).length !== 2
        || !Object.hasOwn(command, 'approved') || !Object.hasOwn(command, 'inspectionId')
        || command.approved !== true || typeof command.inspectionId !== 'string') {
        problem('ERR_CONFIRMATION', 'Inspect first and provide literal true confirmation with the current inspection ID.');
      }
      if (used.has(command.inspectionId)) problem('ERR_REPLAY', 'That inspection was already measured. Inspect again; replay cannot add journeys.');
      if (!inspection || inspection.id !== command.inspectionId || inspection.selected !== selected) {
        problem('ERR_INSPECTION', 'A fresh inspection for the current selection is required.');
      }
      if (measurements >= limits.maxMeasurements) problem('ERR_BOUND', 'The 24-measurement lesson limit is reached. Reload for a new bounded rehearsal.');
      const results = inspection.packets.map(evaluate);
      for (const result of results) current.set(result.caseId, result);
      used.add(inspection.id);
      measurements++;
      history.push(freeze({
        measurement: measurements, generation, selection: selected,
        inspectionId: inspection.id, summary: summarize(results), results,
      }));
      if (history.length > limits.maxHistory) history.shift();
      return snapshot();
    }

    function reset() {
      selected = 'cohort';
      inspection = null;
      current = new Map();
      generation++;
      return snapshot();
    }

    return freeze({ select, inspect, measure, reset, snapshot });
  }

  return freeze({ evaluate, summarize, createLesson, packets, limits });
}));
