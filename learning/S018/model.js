(function (root) {
  'use strict';
  const TIERS = Object.freeze(['frontend', 'api', 'worker']);
  const LIMITS = Object.freeze({
    commands: 24, observations: 8, archives: 6, instances: 3,
    demand: 10, latencyBudgetMs: 150, connectionLimit: 12
  });
  const fail = (message) => { throw new Error(message); };
  const isTier = (value) => TIERS.includes(value);
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  function dataTree(value, label, depth = 0, budget = { left: 30000 }) {
    if (--budget.left < 0 || depth > 16) fail(`${label}: state/data bounds exceeded.`);
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string' && value.length <= 256) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object') fail(`${label}: expected plain finite data.`);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      fail(`${label}: expected a plain data object/array.`);
    }
    if (Object.getOwnPropertySymbols(value).length) fail(`${label}: symbol fields are unsupported.`);
    const names = Object.getOwnPropertyNames(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (names.some((name) => !Object.hasOwn(descriptors[name], 'value'))) {
      fail(`${label}: accessor fields are not data.`);
    }
    if (array) {
      if (value.length > 256 || names.length !== value.length + 1
        || !Array.from({ length: value.length }, (_, index) => String(index))
          .every((name) => Object.hasOwn(descriptors, name))) {
        fail(`${label}: expected a bounded, dense array without extra fields.`);
      }
    } else if (names.length > 32) fail(`${label}: too many data fields.`);
    for (const name of names) {
      if (array && name === 'length') continue;
      dataTree(descriptors[name].value, `${label}.${name}`, depth + 1, budget);
    }
  }
  function keys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getOwnPropertyNames(value).sort().join('|') !== [...expected].sort().join('|')) {
      fail(`${label}: unexpected or missing fields in data object.`);
    }
  }
  function equal(left, right) {
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      return Object.is(left, right);
    }
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const a = Object.getOwnPropertyNames(left).sort();
    const b = Object.getOwnPropertyNames(right).sort();
    return a.length === b.length && a.every((name, index) => name === b[index] && equal(left[name], right[name]));
  }
  function actionData(action) {
    dataTree(action, 'Action');
    if (!action || typeof action !== 'object' || Array.isArray(action)) fail('Action: expected a plain object.');
    switch (action.type) {
      case 'configure':
        keys(action, ['type', 'bottleneck'], 'Configure action');
        if (!isTier(action.bottleneck)) fail('Unknown bottleneck tier.');
        return { type: 'configure', bottleneck: action.bottleneck };
      case 'scale':
        keys(action, ['type', 'tier', 'count'], 'Scale action');
        if (!isTier(action.tier)) fail('Unknown scaling tier.');
        if (!Number.isSafeInteger(action.count) || action.count < 1 || action.count > LIMITS.instances) {
          fail('Instance count must be an integer from 1 to 3.');
        }
        return { type: 'scale', tier: action.tier, count: action.count };
      case 'scale-all':
      case 'reset':
        keys(action, ['type'], 'Action');
        return { type: action.type };
      case 'observe':
        keys(action, ['type', 'proof', 'contract'], 'Observe action');
        if (!['complete', 'missing'].includes(action.proof)) fail('Unknown downstream proof condition.');
        if (!['compatible', 'incompatible'].includes(action.contract)) fail('Unknown contract condition.');
        return { type: 'observe', proof: action.proof, contract: action.contract };
      default:
        fail('Unknown action.');
    }
  }
  const newRun = (id, bottleneck) => ({
    id, bottleneck, counts: { frontend: 1, api: 1, worker: 1 },
    commands: [], observations: [], verdict: 'NOT_RUN'
  });
  const verdict = (values) => values.includes('FAIL') ? 'FAIL' : values.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
  function measure(run, action) {
    const counts = { ...run.counts };
    const capacities = Object.fromEntries(TIERS.map((tier) =>
      [tier, counts[tier] * (tier === run.bottleneck ? 6 : 12)]));
    const admitted = Math.min(LIMITS.demand, ...Object.values(capacities));
    const requestedConnections = 4 * (counts.api + counts.worker);
    const observedConnections = action.proof === 'complete' ? requestedConnections : null;
    const connectionExcess = observedConnections === null ? null
      : Math.max(0, observedConnections - LIMITS.connectionLimit);
    const window = run.observations.length + 1;
    const journeys = Array.from({ length: LIMITS.demand }, (_, index) => {
      let outcome = 'PASS';
      let reason = 'within all budgets';
      let latencyMs = 100;
      if (index >= admitted) {
        outcome = 'FAIL'; reason = 'tier deadline';
        latencyMs = LIMITS.latencyBudgetMs + 25 * (index - admitted + 1);
      } else if (action.contract === 'incompatible') {
        outcome = 'FAIL'; reason = 'incompatible tier contract';
      } else if (action.proof === 'missing') {
        outcome = 'UNKNOWN'; reason = 'missing downstream completion evidence'; latencyMs = null;
      } else if (index < connectionExcess) {
        outcome = 'FAIL'; reason = 'connection acquisition'; latencyMs = 200;
      }
      return { id: `R${run.id}-W${window}-J${String(index + 1).padStart(2, '0')}`, outcome, reason, latencyMs };
    });
    const completed = journeys.filter((journey) => journey.outcome === 'PASS').length;
    const failed = journeys.filter((journey) => journey.outcome === 'FAIL').length;
    const unknown = journeys.filter((journey) => journey.outcome === 'UNKNOWN').length;
    const assertions = {
      tierCapacity: admitted === LIMITS.demand ? 'PASS' : 'FAIL',
      connections: connectionExcess === null ? 'UNKNOWN' : connectionExcess > 0 ? 'FAIL' : 'PASS',
      contracts: action.contract === 'compatible' ? 'PASS' : 'FAIL',
      journeys: failed ? 'FAIL' : unknown ? 'UNKNOWN' : 'PASS'
    };
    return {
      window, counts, capacities, bottleneck: run.bottleneck, proof: action.proof, contract: action.contract,
      requestedConnections, observedConnections, connectionExcess, admitted, completed, failed, unknown,
      maxLatencyMs: unknown ? null : Math.max(...journeys.map((journey) => journey.latencyMs)),
      assertions, journeys, verdict: verdict(Object.values(assertions))
    };
  }
  function applyRun(run, action) {
    if (run.commands.length >= LIMITS.commands) fail('Run reached its 24-command bound; archive and reset.');
    const counts = { ...run.counts };
    let observations = [...run.observations];
    if (action.type === 'scale') {
      if (counts[action.tier] === action.count) fail('Scale must change the instance count, not repeat the same count.');
      counts[action.tier] = action.count;
    } else if (action.type === 'scale-all') {
      if (TIERS.every((tier) => counts[tier] === 2)) fail('Scale-all must change at least one tier.');
      TIERS.forEach((tier) => { counts[tier] = 2; });
    } else if (action.type === 'observe') {
      if (observations.length >= LIMITS.observations) fail('Run reached its 8-observation bound; archive and reset.');
      observations.push(measure(run, action));
    } else fail('State replay contains an unsupported run command.');
    return {
      ...run, counts, commands: [...run.commands, action], observations,
      verdict: observations.length ? verdict(observations.map((observation) => observation.verdict)) : 'NOT_RUN'
    };
  }
  function replay(run) {
    keys(run, ['id', 'bottleneck', 'counts', 'commands', 'observations', 'verdict'], 'Run state');
    if (!Number.isSafeInteger(run.id) || run.id < 1 || run.id > 1000000) fail('Run state ID is outside bounds.');
    if (!isTier(run.bottleneck)) fail('Run state has an unknown bottleneck tier.');
    if (!Array.isArray(run.commands) || run.commands.length > LIMITS.commands) fail('Run command array is invalid.');
    let expected = newRun(run.id, run.bottleneck);
    for (const action of run.commands) expected = applyRun(expected, actionData(action));
    if (!equal(run, expected)) fail('State replay mismatch: counts, history, measurements or verdict were changed.');
    return expected;
  }
  function checked(state) {
    dataTree(state, 'State');
    keys(state, ['schemaVersion', 'current', 'archives'], 'State');
    if (state.schemaVersion !== 1) fail('State schema version is unsupported.');
    if (!Array.isArray(state.archives) || state.archives.length > LIMITS.archives) fail('Archive state exceeds six runs.');
    const current = replay(state.current);
    const archives = state.archives.map(replay);
    let prior = 0;
    for (const run of archives) {
      if (run.id <= prior || run.id >= current.id || !run.commands.length) {
        fail('Archive run identity/order is invalid.');
      }
      prior = run.id;
    }
    return { schemaVersion: 1, current, archives };
  }
  function createLesson(bottleneck = 'api') {
    if (!isTier(bottleneck)) fail('Unknown bottleneck tier.');
    return freeze({ schemaVersion: 1, current: newRun(1, bottleneck), archives: [] });
  }
  function dispatch(input, rawAction) {
    const state = checked(input);
    const action = actionData(rawAction);
    if (action.type === 'reset') {
      if (state.current.id === 1000000) fail('Run ID bound reached; reload to begin a new page-memory session.');
      const archives = state.current.commands.length ? [...state.archives, state.current] : state.archives;
      return freeze({
        schemaVersion: 1, current: newRun(state.current.id + 1, 'api'), archives: archives.slice(-LIMITS.archives)
      });
    }
    if (action.type === 'configure') {
      if (state.current.commands.length) fail('Configure the bottleneck before a run has started; otherwise archive and reset.');
      return freeze({ ...state, current: newRun(state.current.id, action.bottleneck) });
    }
    return freeze({ ...state, current: applyRun(state.current, action) });
  }
  const api = Object.freeze({ LIMITS, TIERS, createLesson, dispatch });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S018Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
