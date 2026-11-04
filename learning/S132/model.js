(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SignInLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_ACTIONS = 16;
  const MAX_RUNS = 4;
  const fail = (code, message) => {
    const error = new Error(message);
    error.code = code;
    throw error;
  };
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const STARTED = freeze({
    journeyId: 'fictional-journey-river',
    expectedIdentity: 'fictional-person-river',
    pendingSessionId: 'fictional-session-pending-river',
    callbackState: 'fictional-state-river',
    returnPage: 'fictional-signed-in-home',
    version: 'v1', route: 'old', atMs: 0,
  });
  const CUTOVER = freeze({ fromVersion: 'v1', toVersion: 'v2', callbackRoute: 'new', atMs: 500 });
  const CALLBACK = freeze({
    httpStatus: 200, callbackState: 'fictional-state-river',
    journeyId: 'fictional-journey-river', identity: 'fictional-person-river',
    issuedSession: 'fictional-session-auth-river',
    version: 'v2', route: 'new', acceptsV1State: true, atMs: 1400,
  });
  const COMPLETION = freeze({
    signedIn: true, journeyId: 'fictional-journey-river', identity: 'fictional-person-river',
    sessionId: 'fictional-session-auth-river', page: 'fictional-signed-in-home',
    version: 'v2', route: 'new', forcedRestart: false, atMs: 1800,
  });
  const scenario = (label, description, callback = {}, completion = {}) => ({
    label, description,
    trace: { dataOnly: true, started: STARTED, cutover: CUTOVER, callback: { ...CALLBACK, ...callback }, completion: { ...COMPLETION, ...completion } },
  });
  const SCENARIOS = freeze({
    compatible: scenario('Compatible original sign-in', 'Original state and identity bind a newly issued authenticated session; the correct final page completes at 1800 ms.'),
    'lost-state': scenario('Lost callback state', 'A callback HTTP 200 is observed, but the original callback state is explicitly missing.', { callbackState: 'missing' }, { signedIn: false }),
    'state-mismatch': scenario('Mismatched callback state', 'HTTP 200 and a signed-in page do not repair a different callback state.', { callbackState: 'fictional-state-other' }),
    'wrong-identity': scenario('Wrong signed-in identity', 'Callback and final page agree with each other, but both identify the wrong fictional person.', { identity: 'fictional-person-elm', issuedSession: 'fictional-session-auth-elm' }, { identity: 'fictional-person-elm', sessionId: 'fictional-session-auth-elm' }),
    'session-mismatch': scenario('Final session mismatch', 'The final signed-in session differs from the authenticated session issued by the callback.', {}, { sessionId: 'fictional-session-auth-elm' }),
    'forced-restart': scenario('Forced restart', 'The user eventually signs in, but only a restarted journey finishes; original continuity failed.', {}, { journeyId: 'fictional-journey-restarted', forcedRestart: true }),
    'slow-200': scenario('Slow successful completion', 'HTTP 200 at 1400 ms precedes completion at 4200 ms. Compare 4200 ms with the budget pinned at the original start.', {}, { atMs: 4200 }),
    'incompatible-state-version': scenario('Incompatible state version', 'A v2 callback label does not mean v2 can consume v1 callback state.', { acceptsV1State: false }, { signedIn: false }),
    'wrong-route': scenario('Old callback route', 'The callback is still on old/v1; a later v2 page cannot prove the intended callback transition.', { version: 'v1', route: 'old' }),
    'wrong-page': scenario('Wrong final page', 'The intended identity signs in but does not reach the original return page.', {}, { page: 'fictional-sign-in-page' }),
    'callback-unobserved': scenario('Unobserved callback correlation', 'A final signed-in v2 page is present, but callback identity, state, session and route observations are unknown.', { httpStatus: null, callbackState: null, journeyId: null, identity: null, issuedSession: null, version: null, route: null, acceptsV1State: null, atMs: null }),
    'timing-unobserved': scenario('Unobserved original completion time', 'The final identity and session are present but there is no original completion time; the agreed budget is unknown.', {}, { atMs: null }),
  });

  // Inspect descriptors before reading caller-owned DATA; never invoke accessors.
  function canonical(value, code = 'ERR_INPUT') {
    const ancestors = new Set();
    let nodes = 0;
    function visit(item, depth) {
      if (++nodes > 10000 || depth > 20) fail(code, 'Safe hold: DATA exceeds the bounded structure.');
      if (item === null || typeof item === 'boolean') return JSON.stringify(item);
      if (typeof item === 'string' && item.length <= 512) return JSON.stringify(item);
      if (typeof item === 'number' && Number.isSafeInteger(item)) return JSON.stringify(item);
      if (!item || typeof item !== 'object' || ancestors.has(item)) fail(code, 'Safe hold: expected finite plain teaching DATA without cycles.');
      ancestors.add(item);
      try {
        const keys = Reflect.ownKeys(item);
        if (keys.some((key) => typeof key !== 'string')) fail(code, 'Safe hold: symbol keys are not accepted.');
        const descriptors = Object.getOwnPropertyDescriptors(item);
        if (keys.some((key) => !Object.hasOwn(descriptors[key], 'value'))) fail(code, 'Safe hold: accessors are not accepted.');
        if (Array.isArray(item)) {
          if (Object.getPrototypeOf(item) !== Array.prototype || item.length > 32 ||
              keys.length !== item.length + 1 ||
              !keys.every((key) => key === 'length' || /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < item.length)) {
            fail(code, 'Safe hold: expected a bounded dense plain DATA array.');
          }
          return `[${Array.from({ length: item.length }, (_, index) => visit(descriptors[index].value, depth + 1)).join(',')}]`;
        }
        if (Object.getPrototypeOf(item) !== Object.prototype || keys.length > 20) fail(code, 'Safe hold: expected a plain DATA record.');
        return `{${keys.sort().map((key) => `${JSON.stringify(key)}:${visit(descriptors[key].value, depth + 1)}`).join(',')}}`;
      } finally {
        ancestors.delete(item);
      }
    }
    return visit(value, 0);
  }
  function record(value, keys, code = 'ERR_INPUT') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
        Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
      fail(code, 'Safe hold: expected the exact DATA record keys.');
    }
  }
  function budget(value) {
    if (!Number.isInteger(value) || value < 1000 || value > 5000) fail('ERR_INPUT', 'Use an integer original journey budget from 1000 through 5000 ms; no coercion.');
  }
  function command(value) {
    canonical(value);
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'type') ||
        !['start', 'cutover', 'callback', 'finish'].includes(value.type)) {
      fail('ERR_INPUT', 'Choose one exact operator action.');
    }
    record(value, value.type === 'start' ? ['type', 'scenarioId', 'budgetMs'] : ['type']);
    if (value.type === 'start') {
      if (typeof value.scenarioId !== 'string' || !Object.hasOwn(SCENARIOS, value.scenarioId)) fail('ERR_INPUT', 'Choose one exact fixed fictional trace preset.');
      budget(value.budgetMs);
    }
  }
  const nullable = (value, allowed) => value === null || allowed.includes(value);
  function trace(value) {
    canonical(value);
    record(value, ['dataOnly', 'started', 'cutover', 'callback', 'completion']);
    if (value.dataOnly !== true || canonical(value.started) !== canonical(STARTED) || canonical(value.cutover) !== canonical(CUTOVER)) {
      fail('ERR_INPUT', 'Use the fixed fictional original-start and cutover DATA records.');
    }
    record(value.callback, Object.keys(CALLBACK));
    record(value.completion, Object.keys(COMPLETION));
    const cb = value.callback;
    const end = value.completion;
    const journeys = ['fictional-journey-river', 'fictional-journey-restarted'];
    const identities = ['fictional-person-river', 'fictional-person-elm'];
    const sessions = ['fictional-session-auth-river', 'fictional-session-auth-elm'];
    const valid =
      nullable(cb.httpStatus, [200, 500]) &&
      nullable(cb.callbackState, ['fictional-state-river', 'fictional-state-other', 'missing']) &&
      nullable(cb.journeyId, journeys) && nullable(end.journeyId, journeys) &&
      nullable(cb.identity, identities) && nullable(end.identity, identities) &&
      nullable(cb.issuedSession, sessions) && nullable(end.sessionId, sessions) &&
      nullable(cb.version, ['v1', 'v2']) && nullable(end.version, ['v1', 'v2']) &&
      nullable(cb.route, ['old', 'new']) && nullable(end.route, ['old', 'new']) &&
      nullable(cb.acceptsV1State, [true, false]) && nullable(end.signedIn, [true, false]) &&
      nullable(end.forcedRestart, [true, false]) &&
      nullable(end.page, ['fictional-signed-in-home', 'fictional-sign-in-page']) &&
      [cb.atMs, end.atMs].every((time) => time === null || Number.isInteger(time) && time >= 0 && time <= 10000);
    if (!valid) fail('ERR_INPUT', 'Use exact typed fictional identity/session/state/version/route/time DATA; unknown is null, not a coercible string.');
  }
  const match = (actual, expected) => actual === null || expected === null ? 'unknown' : actual === expected ? 'positive' : 'negative';
  const combine = (values) => values.includes('negative') ? 'negative' : values.includes('unknown') ? 'unknown' : 'positive';
  const observed = (value) => value === null ? 'unknown (unobserved)' : String(value);
  function measureJourney(value, budgetMs) {
    budget(budgetMs);
    trace(value);
    const start = value.started;
    const cb = value.callback;
    const end = value.completion;
    const checks = [];
    const add = (id, status, actual, expected) => checks.push({ id, status, observed: actual, expected });
    add('callback-http', match(cb.httpStatus, 200), observed(cb.httpStatus), 'Observed callback HTTP 200; necessary, not sufficient.');
    add('callback-state', match(cb.callbackState, start.callbackState), observed(cb.callbackState), start.callbackState);
    add('original-journey', combine([match(cb.journeyId, start.journeyId), match(end.journeyId, start.journeyId)]), `callback=${observed(cb.journeyId)}; final=${observed(end.journeyId)}`, start.journeyId);
    add('intended-identity', combine([match(cb.identity, start.expectedIdentity), match(end.identity, start.expectedIdentity)]), `callback=${observed(cb.identity)}; final=${observed(end.identity)}`, start.expectedIdentity);
    add('issued-session', match(cb.issuedSession, 'fictional-session-auth-river'), observed(cb.issuedSession), 'fictional-session-auth-river for the intended identity; legitimate pending-to-authenticated session rotation.');
    add('signed-in-session', match(end.sessionId, cb.issuedSession), `issued=${observed(cb.issuedSession)}; final=${observed(end.sessionId)}`, 'Final authenticated session equals the issued authenticated session.');
    add('state-version-contract', match(cb.acceptsV1State, true), observed(cb.acceptsV1State), 'v2 explicitly consumes original v1 callback state DATA.');
    add('callback-version', match(cb.version, value.cutover.toVersion), observed(cb.version), 'v2');
    add('callback-route', match(cb.route, value.cutover.callbackRoute), observed(cb.route), 'new');
    add('signed-in-completion', match(end.signedIn, true), observed(end.signedIn), 'Observed final signed-in page completion, not just callback HTTP success.');
    add('signed-in-page', match(end.page, start.returnPage), observed(end.page), start.returnPage);
    add('final-version-route', combine([match(end.version, 'v2'), match(end.route, 'new')]), `version=${observed(end.version)}; route=${observed(end.route)}`, 'v2 on new routing DATA.');
    add('no-forced-restart', match(end.forcedRestart, false), observed(end.forcedRestart), 'false; eventually signing in after restart is not continuous original sign-in.');
    const callbackOrder = cb.atMs === null ? 'unknown' : cb.atMs >= value.cutover.atMs ? 'positive' : 'negative';
    const finalOrder = cb.atMs === null || end.atMs === null ? 'unknown' : end.atMs >= cb.atMs ? 'positive' : 'negative';
    add('transition-order', combine([callbackOrder, finalOrder]), `start=0; cutover=500; callback=${observed(cb.atMs)}; final=${observed(end.atMs)} ms`, 'Original start <= cutover <= callback <= final completion.');
    const elapsedMs = end.atMs === null ? null : end.atMs - start.atMs;
    add('original-journey-budget', elapsedMs === null ? 'unknown' : elapsedMs <= budgetMs ? 'positive' : 'negative', `${observed(elapsedMs)} ms from original start; pinned budget=${budgetMs} ms`, 'Original completion <= agreed budget; never reset at cutover, callback or restart.');
    const classification = combine(checks.map((check) => check.status));
    return freeze({
      classification, continuousSignIn: classification === 'positive', elapsedMs, budgetMs, checks,
      failedChecks: checks.filter((check) => check.status === 'negative').map((check) => check.id),
      unknownChecks: checks.filter((check) => check.status === 'unknown').map((check) => check.id),
      claim: classification === 'positive'
        ? 'One fixed fictional original journey met the declared contract; not a live sign-in or an all-user guarantee.'
        : classification === 'negative'
          ? 'Original fictional sign-in continuity failed; HTTP status/new version cannot erase the detected failure.'
          : 'Original fictional sign-in continuity is unknown; missing observations are not positive evidence.',
    });
  }
  const empty = () => ({ schemaVersion: 1, phase: 'idle', active: null, history: [], runs: [] });
  function reduce(state, action) {
    if (state.history.length >= MAX_ACTIONS) fail('ERR_LIMIT', 'Safe hold: sixteen actions/four runs are retained. Reset explicitly; no history is pruned.');
    const next = { ...state, history: [...state.history, { ...action }], runs: [...state.runs] };
    if (action.type === 'start') {
      if (!['idle', 'measured'].includes(state.phase)) fail('ERR_STATE', 'Safe hold: finish the current original journey before starting another.');
      if (state.runs.length >= MAX_RUNS) fail('ERR_LIMIT', 'Safe hold: four measured runs are retained. Reset explicitly.');
      next.phase = 'started';
      next.active = {
        runId: state.runs.length + 1, scenarioId: action.scenarioId, budgetMs: action.budgetMs,
        trace: { dataOnly: true, started: STARTED, cutover: null, callback: null, completion: null }, result: null,
      };
    } else {
      const required = { cutover: 'started', callback: 'cutover', finish: 'callback' }[action.type];
      if (state.phase !== required) fail('ERR_STATE', `Safe hold: ${action.type} requires phase ${required}; no records or history changed.`);
      next.active = { ...state.active, trace: { ...state.active.trace } };
      const fixed = SCENARIOS[state.active.scenarioId].trace;
      if (action.type === 'cutover') {
        next.phase = 'cutover';
        next.active.trace.cutover = fixed.cutover;
      } else if (action.type === 'callback') {
        next.phase = 'callback';
        next.active.trace.callback = fixed.callback;
      } else {
        next.phase = 'measured';
        next.active.trace.completion = fixed.completion;
        next.active.result = measureJourney(next.active.trace, next.active.budgetMs);
        next.runs.push(next.active);
      }
    }
    return next;
  }
  function stateGuard(state) {
    const serialized = canonical(state, 'ERR_STATE');
    record(state, ['schemaVersion', 'phase', 'active', 'history', 'runs'], 'ERR_STATE');
    if (state.schemaVersion !== 1 || !Array.isArray(state.history) || state.history.length > MAX_ACTIONS) {
      fail('ERR_STATE', 'Safe hold: invalid state schema or retained action count.');
    }
    let replay = empty();
    try {
      for (const action of state.history) {
        command(action);
        replay = reduce(replay, action);
      }
    } catch (_) {
      fail('ERR_STATE', 'Safe hold: retained history does not replay as ordered typed operator actions.');
    }
    if (serialized !== canonical(replay, 'ERR_STATE')) fail('ERR_STATE', 'Safe hold: phase, pinned input, trace or results do not match retained history.');
  }
  const createState = () => freeze(empty());
  const execute = (state, action) => {
    stateGuard(state);
    command(action);
    return freeze(reduce(state, action));
  };
  return freeze({ createState, execute, measureJourney, SCENARIOS, MAX_ACTIONS, MAX_RUNS });
}));
