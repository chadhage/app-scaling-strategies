(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('.\\fixtures.js'));
  else root.S146Model = factory(root.S146Fixtures);
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';

  const MAX_RUNS = 12;
  const MAX_EVENTS = 84;
  const MAX_CLOCK_MS = 10000;
  const PHASES = fixtures.PHASES;
  const PRESETS = fixtures.PRESETS.map(({ id }) => id);
  const RECORD_KEYS = [
    'requestId', 'atMs', 'clockId', 'epoch', 'resourceId', 'version', 'observationId',
  ];

  function invalid(message) {
    throw new TypeError(`Invalid fixed rehearsal data: ${message}`);
  }

  function shape(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(`${label} must be a plain record`);
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) => !keys.includes(key))) invalid(`${label} has unexpected fields`);
    if (keys.some((key) => !Object.hasOwn(value, key)
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) invalid(`${label} must contain data fields only`);
  }

  function list(value, maximum, label, exact) {
    if (!Array.isArray(value) || value.length > maximum
        || (exact !== undefined && value.length !== exact)
        || Object.getPrototypeOf(value) !== Array.prototype
        || Reflect.ownKeys(value).length !== value.length + 1
        || Object.keys(value).length !== value.length) invalid(`${label} must be a bounded dense list`);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid(`${label} must contain data entries only`);
    }
  }

  function id(value, label, nullable = false) {
    if (nullable && value === null) return;
    if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value)) invalid(`${label} must be an exact typed identity`);
  }

  function choice(value, choices, label, nullable = false) {
    if (nullable && value === null) return;
    if (typeof value !== 'string' || !choices.includes(value)) invalid(`${label} is unsupported`);
  }

  function time(value, label, nullable = false) {
    if (nullable && value === null) return;
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CLOCK_MS) invalid(`${label} must be an integer fictional clock in 0..${MAX_CLOCK_MS}`);
  }

  function flag(value, label) {
    if (value !== null && typeof value !== 'boolean') invalid(`${label} must be true, false, or null`);
  }

  function record(value, label) {
    time(value.atMs, `${label}.atMs`, true);
    for (const key of RECORD_KEYS.filter((key) => key !== 'atMs')) id(value[key], `${label}.${key}`, true);
  }

  function sameClock(left, right) {
    return left.clockId !== null && left.epoch !== null
      && left.clockId === right.clockId && left.epoch === right.epoch;
  }

  function scoped(value, trace) {
    return value.requestId === trace.request.id
      && value.resourceId === trace.resource.id && value.version === trace.resource.version;
  }

  function observedRecord(value, trace) {
    return value.observationId !== null && value.atMs !== null
      && value.clockId !== null && value.epoch !== null && scoped(value, trace);
  }

  function validateTrace(trace) {
    shape(trace, [
      'schemaVersion', 'dataKind', 'fixtureId', 'resource', 'request',
      'windows', 'injection', 'detection', 'recovery', 'journeys',
    ], 'trace');
    if (trace.schemaVersion !== 1 || trace.dataKind !== 'fixed-fictional-teaching-data-only') invalid('trace schema/data kind');
    id(trace.fixtureId, 'fixtureId');
    shape(trace.resource, ['id', 'version'], 'resource');
    id(trace.resource.id, 'resource.id');
    id(trace.resource.version, 'resource.version');
    shape(trace.request, ['id', 'fault', 'phase', 'atMs', 'clockId', 'epoch'], 'request');
    id(trace.request.id, 'request.id');
    choice(trace.request.fault, ['TRACE'], 'request.fault');
    choice(trace.request.phase, PHASES, 'request.phase');
    time(trace.request.atMs, 'request.atMs');
    id(trace.request.clockId, 'request.clockId');
    id(trace.request.epoch, 'request.epoch');
    list(trace.windows, 7, 'windows', 7);
    trace.windows.forEach((window, index) => {
      shape(window, [
        'phase', 'startMs', 'endMs', 'clockId', 'epoch', 'resourceId', 'version', 'observationId',
      ], `window ${index}`);
      if (window.phase !== PHASES[index]) invalid('windows must contain each phase once in lifecycle order');
      time(window.startMs, 'window.startMs', true);
      time(window.endMs, 'window.endMs', true);
      if ((window.startMs === null) !== (window.endMs === null)
          || (window.startMs !== null && window.startMs >= window.endMs)) invalid('phase bounds must be a valid half-open pair or both null');
      for (const key of ['clockId', 'epoch', 'resourceId', 'version', 'observationId']) id(window[key], `window.${key}`, true);
      const previous = trace.windows[index - 1];
      if (previous && previous.endMs !== null && window.startMs !== null
          && sameClock(previous, window) && previous.resourceId === window.resourceId
          && previous.version === window.version && previous.endMs > window.startMs) invalid('observed lifecycle windows overlap');
    });
    shape(trace.injection, [...RECORD_KEYS, 'fault', 'occurred', 'phase'], 'injection');
    record(trace.injection, 'injection');
    choice(trace.injection.fault, ['TRACE'], 'injection.fault');
    flag(trace.injection.occurred, 'injection.occurred');
    choice(trace.injection.phase, PHASES, 'injection.phase', true);
    shape(trace.detection, [...RECORD_KEYS, 'detected'], 'detection');
    record(trace.detection, 'detection');
    flag(trace.detection.detected, 'detection.detected');
    shape(trace.recovery, [...RECORD_KEYS, 'recovered'], 'recovery');
    record(trace.recovery, 'recovery');
    flag(trace.recovery.recovered, 'recovery.recovered');
    list(trace.journeys, 3, 'journeys', 3);
    trace.journeys.forEach((journey, index) => {
      shape(journey, [...RECORD_KEYS, 'id', 'window', 'result'], `journey ${index}`);
      record(journey, `journey ${index}`);
      id(journey.id, 'journey.id');
      if (journey.window !== ['before', 'during', 'after'][index]) invalid('journey sampling windows must be before, during, after');
      choice(journey.result, ['continuous', 'interrupted', 'unknown'], 'journey.result');
    });
    const identities = [...trace.windows, trace.injection, trace.detection, trace.recovery, ...trace.journeys]
      .map(({ observationId }) => observationId).filter((value) => value !== null);
    if (new Set(identities).size !== identities.length) invalid('duplicate observation identities cannot establish separate evidence');
    if (new Set(trace.journeys.map(({ id: journeyId }) => journeyId)).size !== 3) invalid('duplicate journey identities');
  }

  function windowObserved(window, trace) {
    return window.observationId !== null && window.startMs !== null && window.endMs !== null
      && window.clockId !== null && window.epoch !== null
      && window.resourceId === trace.resource.id && window.version === trace.resource.version;
  }

  function coverageRow(trace, window) {
    const injection = trace.injection;
    let reason;
    if (injection.occurred !== true) reason = injection.occurred === false ? 'observed-fault-did-not-occur' : 'fault-occurrence-unknown';
    else if (injection.observationId === null) reason = 'injection-observation-missing';
    else if (injection.atMs === null) reason = 'injection-time-unknown';
    else if (!windowObserved(window, trace)) reason = 'phase-window-or-scope-unobserved';
    else if (!scoped(injection, trace)) reason = 'injection-resource-version-or-request-mismatch';
    else if (!sameClock(injection, window)) reason = 'fault-clock-or-epoch-unaligned';
    else if (injection.phase === null) reason = 'actual-phase-observation-unknown';
    else if (injection.phase !== window.phase) reason = 'actual-observation-in-another-phase';
    else if (injection.atMs < window.startMs || injection.atMs >= window.endMs) reason = 'outside-half-open-phase-window';
    else reason = 'observed-injection-inside-joined-half-open-window';
    return {
      phase: window.phase,
      window: [window.startMs, window.endMs],
      windowObserved: windowObserved(window, trace),
      coverage: reason === 'observed-injection-inside-joined-half-open-window' ? 'COVERED' : 'UNCOVERED',
      reason,
    };
  }

  function detectionResult(trace) {
    const event = trace.detection;
    if (event.detected === null || !observedRecord(event, trace)) return 'UNKNOWN';
    if (event.detected === false) return 'NOT_DETECTED';
    if (observedRecord(trace.injection, trace)
        && (!sameClock(event, trace.injection) || event.atMs < trace.injection.atMs)) return 'UNKNOWN';
    return 'OBSERVED';
  }

  function recoveryResult(trace) {
    const event = trace.recovery;
    if (event.recovered === null || !observedRecord(event, trace)) return 'UNKNOWN';
    if (event.recovered === false) return 'FAILED';
    for (const previous of [trace.injection, trace.detection]) {
      if (observedRecord(previous, trace)
          && (!sameClock(event, previous) || event.atMs < previous.atMs)) return 'UNKNOWN';
    }
    return 'RECOVERED';
  }

  function journeyResult(journey, trace, recovery) {
    if (!observedRecord(journey, trace) || journey.result === 'unknown') {
      return { id: journey.id, impact: 'UNKNOWN', reason: 'journey-observation-or-scope-unknown' };
    }
    // An observed interruption survives uncertain placement; uncertain placement never proves continuity.
    if (journey.result === 'interrupted') {
      return { id: journey.id, impact: 'INTERRUPTED', reason: 'observed-interruption-retained' };
    }
    const injection = trace.injection;
    if (injection.occurred !== true || !observedRecord(injection, trace) || !sameClock(journey, injection)) {
      return { id: journey.id, impact: 'UNKNOWN', reason: 'journey-cannot-be-joined-to-actual-fault-time' };
    }
    const placed = journey.window === 'before' ? journey.atMs < injection.atMs
      : recovery === 'RECOVERED' && sameClock(journey, trace.recovery)
        && (journey.window === 'during'
          ? journey.atMs >= injection.atMs && journey.atMs <= trace.recovery.atMs
          : journey.atMs >= trace.recovery.atMs);
    return {
      id: journey.id,
      impact: placed ? 'NO_OBSERVED_INTERRUPTION' : 'UNKNOWN',
      reason: placed ? 'one-continuous-fixed-sample-only' : 'sample-label-does-not-establish-actual-placement',
    };
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function evaluate(trace) {
    validateTrace(trace);
    const matrix = trace.windows.map((window) => coverageRow(trace, window));
    const requested = matrix.find(({ phase }) => phase === trace.request.phase);
    const detected = detectionResult(trace);
    const recovery = recoveryResult(trace);
    const journeys = trace.journeys.map((journey) => journeyResult(journey, trace, recovery));
    const impact = journeys.some((journey) => journey.impact === 'INTERRUPTED') ? 'INTERRUPTED'
      : journeys.some((journey) => journey.impact === 'UNKNOWN') ? 'UNKNOWN' : 'NO_OBSERVED_INTERRUPTION';
    const outcome = requested.coverage === 'UNCOVERED' ? 'UNCOVERED'
      : impact === 'INTERRUPTED' ? 'INTERRUPTED'
        : detected === 'NOT_DETECTED' || recovery === 'FAILED' ? 'FAULT_HANDLING_FAILED'
          : impact === 'UNKNOWN' || detected === 'UNKNOWN' || recovery === 'UNKNOWN' ? 'UNKNOWN'
            : 'OBSERVED_NO_INTERRUPTION';
    return freeze({
      fixtureId: trace.fixtureId,
      requestedPhase: trace.request.phase,
      coverage: requested.coverage,
      reason: requested.reason,
      actualCoveredPhases: matrix.filter((row) => row.coverage === 'COVERED').map(({ phase }) => phase),
      detected, recovery, impact, outcome, matrix, journeys,
    });
  }

  function validateCommand(command) {
    if (!command || typeof command !== 'object') invalid('command must be a record');
    const type = Object.getOwnPropertyDescriptor(command, 'type');
    if (!type || !Object.hasOwn(type, 'value')) invalid('command.type must be a data field');
    if (command.type === 'select') {
      shape(command, ['type', 'phase', 'preset'], 'select command');
      choice(command.phase, PHASES, 'command.phase');
      choice(command.preset, PRESETS, 'command.preset');
    } else {
      shape(command, ['type'], 'command');
      choice(command.type, ['conduct', 'inspect', 'measure', 'discard'], 'command.type');
    }
  }

  function summarize(history) {
    const coveredPhases = PHASES.filter((phase) => history.some((row) => row.result.actualCoveredPhases.includes(phase)));
    const interruptedRuns = history.filter((row) => row.result.impact === 'INTERRUPTED').length;
    const unknownImpactRuns = history.filter((row) => row.result.impact === 'UNKNOWN').length;
    const uncoveredRuns = history.filter((row) => row.result.coverage === 'UNCOVERED').length;
    const unknownHandlingRuns = history.filter((row) => row.result.detected === 'UNKNOWN' || row.result.recovery === 'UNKNOWN').length;
    return {
      totalRuns: history.length,
      uniqueFixtures: new Set(history.map(({ fixtureId }) => fixtureId)).size,
      coveredPhases, uncoveredPhases: PHASES.filter((phase) => !coveredPhases.includes(phase)),
      interruptedRuns, unknownImpactRuns, uncoveredRuns, unknownHandlingRuns,
      retainedOutcome: interruptedRuns ? 'INTERRUPTED'
        : unknownImpactRuns || uncoveredRuns || unknownHandlingRuns ? 'UNKNOWN'
          : history.length ? 'OBSERVED_NO_INTERRUPTION' : 'NOT_MEASURED',
    };
  }

  function replay(session) {
    shape(session, ['schemaVersion', 'events'], 'session');
    if (session.schemaVersion !== 1) invalid('session schemaVersion');
    list(session.events, MAX_EVENTS, 'session.events');
    let stage = 'idle';
    let current = null;
    let result = null;
    const history = [];
    for (const event of session.events) {
      validateCommand(event);
      if (event.type === 'select') {
        if (history.length >= MAX_RUNS) invalid('twelve-run limit reached; explicit reset required');
        current = { phase: event.phase, preset: event.preset, trace: fixtures.getFixture(event.phase, event.preset) };
        result = null;
        stage = 'selected';
      } else if (event.type === 'discard') {
        if (stage === 'idle') invalid('no unfinished or current selection to discard');
        current = null;
        result = null;
        stage = 'idle';
      } else {
        const required = { conduct: 'selected', inspect: 'conducted', measure: 'inspected' }[event.type];
        if (stage !== required) invalid(`${event.type} requires ${required}; replayed stage is ${stage}`);
        if (event.type === 'conduct') stage = 'conducted';
        if (event.type === 'inspect') stage = 'inspected';
        if (event.type === 'measure') {
          result = evaluate(current.trace);
          history.push({
            runId: `R${String(history.length + 1).padStart(2, '0')}`,
            phase: current.phase, preset: current.preset, fixtureId: current.trace.fixtureId, result,
          });
          stage = 'measured';
        }
      }
    }
    return freeze({ stage, current, result, history, summary: summarize(history), eventCount: session.events.length });
  }

  function createSession() {
    return freeze({ schemaVersion: 1, events: [] });
  }

  function advance(session, command) {
    replay(session);
    validateCommand(command);
    if (session.events.length >= MAX_EVENTS) invalid('eighty-four-event limit reached; explicit reset required');
    const next = { schemaVersion: 1, events: [...session.events, { ...command }] };
    replay(next);
    return freeze(next);
  }

  return Object.freeze({ evaluate, createSession, advance, replay, MAX_RUNS, MAX_EVENTS, MAX_CLOCK_MS });
}));
