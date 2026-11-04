(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.S136 = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const CLIENT_ID = 'sample-client-136';
  const IDENTITY = 'fictional-user-136';
  const PROTOCOL = 'fictional-queued-ops/v1';
  const FIXTURE_IDS = ['clean', 'conflict', 'missing-ack', 'missing-effect', 'duplicate-effect', 'identity-rejected'];
  const TIMING_IDS = ['within-budget', 'offline-over-budget', 'recovery-over-budget'];
  const BUDGETS = { offlineMs: 5000, recoveryMs: 200 };
  const MAX_HISTORY = 32;
  const CHANGES = [
    { id: 'change-136-1', identity: IDENTITY, baseRevision: 7, expectedValue: 'blue' },
    { id: 'change-136-2', identity: IDENTITY, baseRevision: 7, expectedValue: 'compact' },
  ];
  const TIMINGS = {
    'within-budget': { offlineMs: 4000, recoveryMs: 120 },
    'offline-over-budget': { offlineMs: 6000, recoveryMs: 120 },
    'recovery-over-budget': { offlineMs: 4000, recoveryMs: 250 },
  };
  const ACTIONS = ['sample-offline', 'queue-changes', 'sample-online', 'synchronize', 'retry-ack', 'inspect-console', 'reset'];

  function reject(code, message) {
    const error = new Error(message);
    error.name = 'RehearsalError';
    error.code = code;
    throw error;
  }

  function requireValue(condition, code, message) {
    if (!condition) reject(code, message);
  }

  function plainData(value) {
    return value !== null && typeof value === 'object'
      && Object.getPrototypeOf(value) === Object.prototype
      && Reflect.ownKeys(value).every((key) => typeof key === 'string'
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  }

  function record(value, keys, code, label) {
    requireValue(plainData(value), code, `${label} must be a plain typed data object.`);
    requireValue(Reflect.ownKeys(value).length === keys.length
      && keys.every((key) => Object.hasOwn(value, key)), code, `${label} has missing or extra fields.`);
  }

  function integerOrUnknown(value, min, max) {
    return value === null || (Number.isSafeInteger(value) && !Object.is(value, -0)
      && value >= min && value <= max);
  }

  function enumOrUnknown(value, options) {
    return value === null || options.includes(value);
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function copy(value) { return structuredClone(value); }

  function makeObservation(fixture, timing) {
    requireValue(typeof fixture === 'string' && FIXTURE_IDS.includes(fixture),
      'ERR_ACTION_INPUT', 'Choose a listed fictional receipt fixture.');
    requireValue(typeof timing === 'string' && TIMING_IDS.includes(timing),
      'ERR_ACTION_INPUT', 'Choose a listed synthetic timing trace.');
    const observation = {
      protocol: PROTOCOL, deployment: 'v2', clientId: CLIENT_ID, identity: IDENTITY,
      timing: copy(TIMINGS[timing]),
      operations: CHANGES.map((change) => ({
        ...change, authenticated: true, observedValue: change.expectedValue,
        effectCount: 1, revision: 8, attempts: 1,
        ack: { id: change.id, status: 'accepted', identity: IDENTITY, deployment: 'v2' },
      })),
    };
    const [first, second] = observation.operations;
    if (fixture === 'conflict') {
      second.effectCount = 0;
      second.observedValue = 'remote-red';
      second.revision = 9;
      second.ack.status = 'conflict';
    } else if (fixture === 'missing-ack') {
      first.ack = null;
    } else if (fixture === 'missing-effect') {
      second.effectCount = 0;
      second.observedValue = null;
    } else if (fixture === 'duplicate-effect') {
      first.effectCount = 2;
    } else if (fixture === 'identity-rejected') {
      second.authenticated = false;
      second.effectCount = 0;
      second.observedValue = null;
      second.revision = null;
      second.ack.status = 'rejected';
    }
    return freeze(observation);
  }

  function validateObservation(observation) {
    const code = 'ERR_OBSERVATION_INPUT';
    record(observation, ['protocol', 'deployment', 'clientId', 'identity', 'timing', 'operations'], code, 'Observation');
    requireValue(enumOrUnknown(observation.protocol, [PROTOCOL, 'unsupported/v0'])
      && enumOrUnknown(observation.deployment, ['v1', 'v2'])
      && observation.clientId === CLIENT_ID
      && enumOrUnknown(observation.identity, [IDENTITY, 'fictional-other-user-136']),
    code, 'Observation identifiers must be fixed fictional typed values.');
    record(observation.timing, ['offlineMs', 'recoveryMs'], code, 'Timing');
    requireValue(Object.values(observation.timing).every((value) => integerOrUnknown(value, 0, 10000)),
      code, 'Synthetic elapsed times must be integer milliseconds or explicit unknown.');
    requireValue(Array.isArray(observation.operations) && observation.operations.length === 2
      && Reflect.ownKeys(observation.operations).length === 3
      && ['0', '1'].every((key) => Object.hasOwn(observation.operations, key)
        && Object.hasOwn(Object.getOwnPropertyDescriptor(observation.operations, key), 'value')),
      code, 'Both fixed queued operations must have evidence; omissions are not success.');
    observation.operations.forEach((operation, index) => {
      record(operation, ['id', 'identity', 'baseRevision', 'expectedValue', 'authenticated',
        'observedValue', 'effectCount', 'revision', 'attempts', 'ack'], code, 'Operation');
      requireValue(operation.id === CHANGES[index].id
        && operation.expectedValue === CHANGES[index].expectedValue
        && enumOrUnknown(operation.identity, [IDENTITY, 'fictional-other-user-136'])
        && [true, false, null].includes(operation.authenticated)
        && integerOrUnknown(operation.baseRevision, 0, 20)
        && enumOrUnknown(operation.observedValue, ['blue', 'compact', 'remote-red'])
        && integerOrUnknown(operation.effectCount, 0, 2)
        && integerOrUnknown(operation.revision, 0, 20)
        && Number.isSafeInteger(operation.attempts) && operation.attempts >= 1 && operation.attempts <= 2,
      code, 'Operation evidence has an invalid type, fixed ID, value or bound.');
      if (operation.ack !== null) {
        record(operation.ack, ['id', 'status', 'identity', 'deployment'], code, 'Acknowledgment');
        requireValue(CHANGES.some((change) => change.id === operation.ack.id)
          && ['accepted', 'conflict', 'rejected'].includes(operation.ack.status)
          && enumOrUnknown(operation.ack.identity, [IDENTITY, 'fictional-other-user-136'])
          && enumOrUnknown(operation.ack.deployment, ['v1', 'v2']),
        code, 'Acknowledgment evidence must use fixed typed receipt fields.');
      }
    });
  }

  function evaluate(observation) {
    validateObservation(observation);
    const negative = [];
    const unknown = [];
    const confirmedIds = [];
    function match(value, expected, label) {
      if (value === null) unknown.push(`${label} not observed.`);
      else if (value !== expected) negative.push(`${label} mismatch.`);
    }
    match(observation.protocol, PROTOCOL, 'Queue protocol');
    match(observation.deployment, 'v2', 'Destination deployment');
    match(observation.identity, IDENTITY, 'Queued identity');
    for (const [key, budget] of Object.entries(BUDGETS)) {
      const elapsed = observation.timing[key];
      if (elapsed === null) unknown.push(`${key} not observed.`);
      else if (elapsed > budget) negative.push(`${key} ${elapsed} ms exceeds ${budget} ms budget.`);
    }
    for (const operation of observation.operations) {
      const label = operation.id;
      match(operation.identity, IDENTITY, `${label} identity`);
      match(operation.authenticated, true, `${label} authenticated ownership`);
      match(operation.baseRevision, 7, `${label} queued base revision`);
      match(operation.revision, 8, `${label} applied revision`);
      if (operation.effectCount === null) unknown.push(`${label} effect count not observed.`);
      else if (operation.effectCount === 0) negative.push(`${label} has no confirmed effect.`);
      else if (operation.effectCount > 1) negative.push(`${label} has duplicate effects (${operation.effectCount}).`);
      match(operation.observedValue, operation.expectedValue, `${label} resulting value`);
      if (operation.ack === null) unknown.push(`${label} acknowledgment not observed; retain pending ID.`);
      else {
        match(operation.ack.id, operation.id, `${label} receipt operation ID`);
        match(operation.ack.identity, IDENTITY, `${label} receipt identity`);
        match(operation.ack.deployment, 'v2', `${label} receipt deployment`);
        if (operation.ack.status !== 'accepted') negative.push(`${label} receipt is ${operation.ack.status}; no merge or success inferred.`);
      }
      if (observation.protocol === PROTOCOL && observation.deployment === 'v2'
        && observation.identity === IDENTITY && operation.identity === IDENTITY
        && operation.authenticated === true && operation.baseRevision === 7
        && operation.revision === 8 && operation.effectCount === 1
        && operation.observedValue === operation.expectedValue && operation.ack
        && operation.ack.id === operation.id && operation.ack.status === 'accepted'
        && operation.ack.identity === IDENTITY && operation.ack.deployment === 'v2') {
        confirmedIds.push(operation.id);
      }
    }
    const verdict = negative.length ? 'negative' : unknown.length ? 'unknown' : 'positive';
    const knownEffects = observation.operations.reduce((sum, operation) => sum + (operation.effectCount ?? 0), 0);
    const unknownEffectCounts = observation.operations.filter((operation) => operation.effectCount === null).length;
    return freeze({
      verdict,
      verifier: verdict === 'positive' ? 'PASS' : verdict === 'negative' ? 'FAIL' : 'INCONCLUSIVE',
      userImpact: verdict === 'positive' ? 'completed' : verdict === 'negative' ? 'interrupted' : 'unresolved',
      reasons: [...negative, ...unknown],
      confirmedIds,
      metrics: {
        queuedChanges: 2, confirmedChanges: confirmedIds.length,
        totalEffects: unknownEffectCounts ? null : knownEffects, knownEffects, unknownEffectCounts,
        acknowledgments: observation.operations.filter((operation) => operation.ack?.status === 'accepted').length,
        conflicts: observation.operations.filter((operation) => operation.ack?.status === 'conflict').length,
        rejected: observation.operations.filter((operation) => operation.ack?.status === 'rejected').length,
        duplicateEffects: observation.operations.reduce((sum, operation) => sum + Math.max(0, (operation.effectCount ?? 0) - 1), 0),
      },
    });
  }

  function initialState() {
    return {
      phase: 'ready',
      sampleClientOnline: true,
      consoleAvailable: true,
      otherWorkersAvailable: true,
      consoleInspections: 0,
      pending: [],
      observation: null,
      result: null,
      history: [],
      omittedEntries: 0,
      sequence: 0,
      fixture: null,
      timing: null,
    };
  }

  function allowedActions(state) {
    const stage = {
      ready: 'sample-offline', offline: 'queue-changes',
      queued: 'sample-online', reconnected: 'synchronize',
    };
    const allowed = ['inspect-console', 'reset'];
    if (stage[state.phase]) allowed.unshift(stage[state.phase]);
    if (state.phase === 'observed' && state.fixture === 'missing-ack'
      && state.timing === 'within-budget' && state.result.verdict === 'unknown') allowed.unshift('retry-ack');
    return allowed;
  }

  function validateAction(action) {
    requireValue(plainData(action) && typeof action.type === 'string' && ACTIONS.includes(action.type),
      'ERR_ACTION_INPUT', 'Choose one listed operator action with a typed action object.');
    record(action, action.type === 'synchronize' ? ['type', 'fixture', 'timing'] : ['type'],
      'ERR_ACTION_INPUT', 'Action');
    if (action.type === 'synchronize') {
      requireValue(typeof action.fixture === 'string' && FIXTURE_IDS.includes(action.fixture),
        'ERR_ACTION_INPUT', 'Choose a listed fictional receipt fixture.');
      requireValue(typeof action.timing === 'string' && TIMING_IDS.includes(action.timing),
        'ERR_ACTION_INPUT', 'Choose a listed synthetic timing trace.');
    }
  }

  function createRehearsal() {
    let state = initialState();
    function snapshot() { return freeze({ ...copy(state), allowedActions: allowedActions(state) }); }
    function applyObservation(next, observation) {
      next.observation = copy(observation);
      next.result = copy(evaluate(observation));
      next.pending = CHANGES.filter((change) => !next.result.confirmedIds.includes(change.id))
        .map((change) => ({ ...copy(change), status: 'unconfirmed' }));
      next.phase = 'observed';
    }
    function act(action) {
      validateAction(action);
      requireValue(allowedActions(state).includes(action.type), 'ERR_STATE_GUARD',
        'Action is out of order. Take the sample offline, queue changes, reconnect, then synchronize. Retry only an unresolved missing acknowledgment.');
      const previousResult = copy(state.result);
      let next = copy(state);
      if (action.type === 'sample-offline') {
        next.sampleClientOnline = false;
        next.phase = 'offline';
      } else if (action.type === 'queue-changes') {
        next.pending = CHANGES.map((change) => ({ ...copy(change), status: 'queued' }));
        next.phase = 'queued';
      } else if (action.type === 'sample-online') {
        next.sampleClientOnline = true;
        next.phase = 'reconnected';
      } else if (action.type === 'synchronize') {
        applyObservation(next, makeObservation(action.fixture, action.timing));
        next.fixture = action.fixture;
        next.timing = action.timing;
      } else if (action.type === 'retry-ack') {
        const observation = copy(state.observation);
        observation.operations[0].ack = {
          id: CHANGES[0].id, status: 'accepted', identity: IDENTITY, deployment: 'v2',
        };
        observation.operations[0].attempts = 2;
        applyObservation(next, observation);
      } else if (action.type === 'inspect-console') {
        next.consoleInspections += 1;
      } else if (action.type === 'reset') {
        next = { ...initialState(), history: copy(state.history), omittedEntries: state.omittedEntries, sequence: state.sequence };
      }
      next.sequence += 1;
      next.history.push({
        sequence: next.sequence, action: action.type, phase: next.phase,
        sampleClientOnline: next.sampleClientOnline, pendingIds: next.pending.map((change) => change.id),
        result: copy(next.result), previousResult: action.type === 'reset' ? previousResult : null,
      });
      if (next.history.length > MAX_HISTORY) {
        next.history.shift();
        next.omittedEntries += 1;
      }
      state = next;
      return snapshot();
    }
    return Object.freeze({ snapshot, act });
  }

  freeze(CHANGES);
  freeze(TIMINGS);
  return freeze({ BANNER, CLIENT_ID, IDENTITY, PROTOCOL, FIXTURE_IDS, TIMING_IDS,
    BUDGETS, MAX_HISTORY, CHANGES, createRehearsal, makeObservation, evaluate });
}));
