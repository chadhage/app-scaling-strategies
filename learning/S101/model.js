(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StableEndpointLesson = api;
}(globalThis, function () {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const constants = freeze({
    endpoint: 'https://profiles.training.invalid/api/getProfile',
    apiContract: 'profile.v1',
    backendReleases: { blue: 'release-blue-17', green: 'release-green-42' },
    callers: ['browser-v1', 'service-v1'],
    conditions: ['compatible', 'breaking-contract', 'authentication-loss', 'navigation-loss',
      'endpoint-change', 'stale-route', 'missing-observation', 'over-budget'],
    budgetMs: 100,
    maxRuns: 8,
    maxActions: 40,
  });
  function createState() {
    return freeze(initial());
  }
  function initial() {
    return { schemaVersion: 1, runId: 1, phase: 'prepared', backend: 'blue',
      condition: 'compatible', history: [] };
  }
  function reject(code, message) {
    const error = new Error(message);
    error.name = 'LessonGuardError';
    error.code = code;
    throw error;
  }
  function plain(value) {
    return value !== null && typeof value === 'object'
      && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  }
  function exact(value, keys, code) {
    if (!plain(value) || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
        })) reject(code, 'Expected an exact plain typed record; extra fields and accessors are rejected.');
  }
  function dense(value, max, code) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) {
      reject(code, 'Expected a bounded dense array.');
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        reject(code, 'Sparse arrays and accessors are rejected.');
      }
    }
  }
  function same(actual, expected) {
    if (Array.isArray(expected)) {
      dense(actual, expected.length, 'ERR_LESSON_STATE');
      return actual.length === expected.length
        && expected.every((value, index) => same(actual[index], value));
    }
    if (expected !== null && typeof expected === 'object') {
      const keys = Object.keys(expected);
      exact(actual, keys, 'ERR_LESSON_STATE');
      return keys.every((key) => same(actual[key], expected[key]));
    }
    return Object.is(actual, expected);
  }
  function commandGuard(command, code = 'ERR_LESSON_INPUT') {
    if (!plain(command)) reject(code, 'Choose a supported typed operator action.');
    const descriptor = Object.getOwnPropertyDescriptor(command, 'type');
    if (!descriptor || !Object.hasOwn(descriptor, 'value')
        || !['configure', 'switch', 'measure', 'rollback', 'reset'].includes(descriptor.value)) {
      reject(code, 'Choose a supported typed operator action.');
    }
    exact(command, descriptor.value === 'configure' ? ['type', 'condition'] : ['type'], code);
    if (command.type === 'configure' && (typeof command.condition !== 'string'
        || !constants.conditions.includes(command.condition))) {
      reject(code, 'Choose one of the eight declared synthetic conditions.');
    }
  }
  function observed(backend) {
    return {
      endpoint: constants.endpoint, backendRelease: constants.backendReleases[backend],
      apiContract: constants.apiContract, httpStatus: 200,
      payload: { profileId: 'synthetic-007', displayName: 'Synthetic Learner', roles: ['reader'] },
      authentication: { signedIn: true, subject: 'synthetic-007' },
      navigation: { page: '/dashboard/profile', displayedName: 'Synthetic Learner' },
      elapsedMs: backend === 'blue' ? 20 : 35,
    };
  }
  function afterObservation(condition, caller) {
    if (condition === 'missing-observation' && caller === 'service-v1') return null;
    const after = observed(condition === 'stale-route' ? 'blue' : 'green');
    if (condition === 'compatible') after.payload.preferredLocale = 'en';
    if (condition === 'breaking-contract') {
      after.apiContract = 'profile.v2';
      after.payload = { profileId: 'synthetic-007', fullName: 'Synthetic Learner', roles: ['reader'] };
      after.navigation.displayedName = 'Unknown profile';
    }
    if (condition === 'authentication-loss') {
      after.authentication = { signedIn: false, subject: null };
    }
    if (condition === 'navigation-loss') after.navigation.page = '/sign-in';
    if (condition === 'endpoint-change') {
      after.endpoint = 'https://green.profiles.training.invalid/api/getProfile';
    }
    if (condition === 'over-budget') after.elapsedMs = 120;
    return after;
  }
  function validProfile(observation) {
    const payload = observation.payload;
    return observation.apiContract === constants.apiContract
      && typeof payload.profileId === 'string' && payload.profileId === 'synthetic-007'
      && typeof payload.displayName === 'string' && payload.displayName === 'Synthetic Learner'
      && Array.isArray(payload.roles) && payload.roles.length > 0
      && payload.roles.every((role) => typeof role === 'string') && payload.roles.includes('reader');
  }
  function callerResult(id, condition) {
    const before = observed('blue');
    const after = afterObservation(condition, id);
    const checks = after === null
      ? { endpoint: null, backendChange: null, http: null, contract: null,
        authentication: null, navigation: null, budget: null }
      : {
        endpoint: before.endpoint === constants.endpoint && after.endpoint === constants.endpoint,
        backendChange: before.backendRelease === constants.backendReleases.blue
          && after.backendRelease === constants.backendReleases.green,
        http: before.httpStatus === 200 && after.httpStatus === 200,
        contract: validProfile(before) && validProfile(after),
        authentication: before.authentication.signedIn === true
          && after.authentication.signedIn === true
          && before.authentication.subject === after.authentication.subject
          && after.authentication.subject === 'synthetic-007',
        navigation: before.navigation.page === '/dashboard/profile'
          && after.navigation.page === '/dashboard/profile'
          && after.navigation.displayedName === after.payload.displayName,
        budget: Number.isFinite(before.elapsedMs) && Number.isFinite(after.elapsedMs)
          && before.elapsedMs >= 0 && after.elapsedMs >= 0
          && before.elapsedMs + after.elapsedMs <= constants.budgetMs,
      };
    let outcome = 'positive';
    if (!after) outcome = 'unknown';
    else if (Object.entries(checks).some(([key, value]) => key !== 'backendChange' && !value)) {
      outcome = 'negative';
    } else if (!checks.backendChange) outcome = 'not-transitioned';
    return { id, before, after, checks, outcome,
      verifier: outcome === 'positive' ? 'pass' : outcome === 'unknown' ? 'unverified' : 'fail',
      journeyMs: after ? before.elapsedMs + after.elapsedMs : null };
  }
  function measurement(state) {
    const callers = constants.callers.map((id) => callerResult(id, state.condition));
    const outcome = ['negative', 'unknown', 'not-transitioned', 'positive']
      .find((candidate) => callers.some((caller) => caller.outcome === candidate));
    const impact = {
      positive: 'Uninterrupted successful transition', negative: 'Interrupted transition',
      unknown: 'Unverified result', 'not-transitioned': 'No completed migration',
    }[outcome];
    return { runId: state.runId, condition: state.condition, configuredBackend: state.backend,
      callers, outcome, impact,
      verifier: outcome === 'positive' ? 'pass' : outcome === 'unknown' ? 'unverified' : 'fail' };
  }
  function reduce(state, command) {
    if (state.history.length >= constants.maxActions) {
      reject('ERR_LESSON_LIMIT', 'Forty-action session limit reached. Evidence is retained; reload starts a new session.');
    }
    const next = { ...state };
    const event = { sequence: state.history.length + 1, runId: state.runId,
      command: { ...command }, measurement: null };
    if (command.type === 'configure' || command.type === 'switch') {
      if (state.phase !== 'prepared') {
        reject('ERR_LESSON_STATE', 'Reset before selecting or switching another candidate.');
      }
      if (command.type === 'configure') next.condition = command.condition;
      else { next.backend = 'green'; next.phase = 'switched'; }
    } else if (command.type === 'measure') {
      if (state.phase !== 'switched') {
        reject('ERR_LESSON_STATE', 'Switch to green before measuring; measure only once per run.');
      }
      event.measurement = measurement(state);
      next.phase = 'measured';
    } else if (command.type === 'rollback') {
      if (!['switched', 'measured'].includes(state.phase) || state.backend !== 'green') {
        reject('ERR_LESSON_STATE', 'Only an exposed green route can be restored to blue.');
      }
      next.backend = 'blue'; next.phase = 'restored';
    } else if (command.type === 'reset') {
      if (state.runId >= constants.maxRuns) {
        reject('ERR_LESSON_LIMIT', 'Eight-run session limit reached. Evidence is retained; reload starts a new session.');
      }
      next.runId += 1; next.backend = 'blue'; next.phase = 'prepared'; next.condition = 'compatible';
    }
    next.history = [...state.history, event];
    return next;
  }
  function stateGuard(state) {
    exact(state, ['schemaVersion', 'runId', 'phase', 'backend', 'condition', 'history'],
      'ERR_LESSON_STATE');
    if (state.schemaVersion !== 1 || !Number.isInteger(state.runId) || state.runId < 1
        || state.runId > constants.maxRuns
        || !['prepared', 'switched', 'measured', 'restored'].includes(state.phase)
        || !['blue', 'green'].includes(state.backend)
        || !constants.conditions.includes(state.condition)) {
      reject('ERR_LESSON_STATE', 'State fields must match the declared typed rehearsal schema.');
    }
    dense(state.history, constants.maxActions, 'ERR_LESSON_STATE');
    // Replay verifies the complete bounded provenance, not just success-shaped state fields.
    let replay = initial();
    for (const event of state.history) {
      exact(event, ['sequence', 'runId', 'command', 'measurement'], 'ERR_LESSON_STATE');
      commandGuard(event.command, 'ERR_LESSON_STATE');
      const next = reduce(replay, event.command);
      if (!same(event, next.history.at(-1))) {
        reject('ERR_LESSON_STATE', 'Recorded observation or action provenance was altered.');
      }
      replay = next;
    }
    if (!same(state, replay)) reject('ERR_LESSON_STATE', 'Current state disagrees with retained action history.');
    return replay;
  }
  function act(state, command) {
    const verified = stateGuard(state);
    commandGuard(command);
    return freeze(reduce(verified, command));
  }
  function results(state) {
    const verified = stateGuard(state);
    return freeze(verified.history.filter((event) => event.measurement !== null)
      .map((event) => event.measurement));
  }
  function summary(state) {
    const totals = { attempted: 0, successful: 0, interrupted: 0, unknown: 0, notTransitioned: 0 };
    const fields = { positive: 'successful', negative: 'interrupted', unknown: 'unknown',
      'not-transitioned': 'notTransitioned' };
    for (const record of results(state)) {
      for (const caller of record.callers) {
        totals.attempted += 1;
        totals[fields[caller.outcome]] += 1;
      }
    }
    return freeze(totals);
  }
  return freeze({ constants, createState, act, results, summary });
}));
