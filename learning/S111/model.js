(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S111Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_RUNS = 6;
  const MAX_EVENTS = 36;
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const FIXTURES = {
    redundant: 'Surviving capacity and state',
    'capacity-shortfall': 'Insufficient surviving capacity',
    'state-mismatch': 'Candidate receipt state mismatch',
    'missing-observations': 'Missing candidate observations',
  };
  const SCOPES = ['application-worker', 'node', 'zone', 'region'];
  const TOPOLOGY = [
    { workerId: 'worker-a', version: 'old-v1', node: 'node-1', zone: 'zone-1', region: 'region-east', role: 'serving; fictional loss target' },
    { workerId: 'worker-b', version: 'old-v1', node: 'node-1', zone: 'zone-1', region: 'region-east', role: 'same-node, same-zone survivor' },
    { workerId: 'worker-c', version: 'candidate-v2', node: 'node-2', zone: 'zone-2', region: 'region-east', role: 'candidate during migration' },
    { workerId: 'worker-d', version: 'standby-v1', node: 'node-3', zone: 'zone-3', region: 'region-west', role: 'unrouted; readiness and capacity unverified' },
  ];
  const REQUIRED_STATE = {
    session: 'fixture-session-1', cart: 'fixture-cart-1', receipt: 'fixture-receipt-1',
  };

  function fail(code, message) {
    const error = new Error(message);
    error.code = `ERR_S111_${code}`;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function dataRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    });
  }

  function exactKeys(value, keys) {
    return dataRecord(value) && Object.keys(value).sort().join('|') === keys.slice().sort().join('|');
  }

  function canonical(value, depth = 0) {
    if (depth > 16) fail('STATE', 'State exceeds the bounded data depth.');
    if (value === null) return 'null';
    if (typeof value === 'string' && value.length <= 512) return JSON.stringify(value);
    if (typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
        && value.length <= MAX_EVENTS && Reflect.ownKeys(value).length === value.length + 1
        && Reflect.ownKeys(value).filter(key => key !== 'length').every((key, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return key === String(index) && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
        })) {
      return `[${Array.from(value, item => canonical(item, depth + 1)).join(',')}]`;
    }
    if (dataRecord(value) && Object.keys(value).length <= 20) {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
    }
    fail('STATE', 'State must contain bounded plain JSON data.');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function inputGuard(input) {
    if (!exactKeys(input, ['fixture', 'scopeClaim'])
        || typeof input.fixture !== 'string' || !Object.hasOwn(FIXTURES, input.fixture)
        || typeof input.scopeClaim !== 'string' || !SCOPES.includes(input.scopeClaim)) {
      fail('INPUT', 'Choose one listed fixture and one listed scope; no additional input is accepted.');
    }
  }

  function stateGate(workers) {
    const observations = workers.map(worker => {
      if (worker.state === null) return 'unknown';
      return Object.keys(REQUIRED_STATE).every(key => worker.state[key] === REQUIRED_STATE[key]) ? 'positive' : 'negative';
    });
    if (observations.includes('negative')) return 'negative';
    return observations.includes('unknown') ? 'unknown' : 'positive';
  }

  function measurement(fixture, restored = false) {
    const missing = !restored && fixture === 'missing-observations';
    const short = !restored && fixture === 'capacity-shortfall';
    const mismatch = !restored && fixture === 'state-mismatch';
    const workers = [
      { workerId: 'worker-b', observedServing: true, capacityRps: short ? 30 : 40, state: clone(REQUIRED_STATE) },
      { workerId: 'worker-c', observedServing: missing ? null : true, capacityRps: missing ? null : short ? 10 : 40,
        state: missing ? null : { ...REQUIRED_STATE, receipt: mismatch ? 'fixture-receipt-other' : REQUIRED_STATE.receipt } },
    ];
    if (restored) workers.unshift({ workerId: 'worker-a', observedServing: true, capacityRps: 40, state: clone(REQUIRED_STATE) });
    const observedCapacityRps = workers.some(worker => worker.capacityRps === null)
      ? null : workers.reduce((total, worker) => total + worker.capacityRps, 0);
    const journeys = Array.from({ length: 6 }, (_, index) => {
      const absent = missing && index >= 3;
      const failed = short && index >= 4;
      const stateMatches = absent ? null : !(mismatch && index === 5);
      const httpStatus = absent ? null : failed ? 503 : 200;
      const elapsedMs = absent ? null : failed ? 30 + index : 70 + index * 10;
      const outcome = httpStatus !== null && (httpStatus !== 200 || elapsedMs > 120 || stateMatches === false)
        ? 'interruption' : httpStatus === null || elapsedMs === null || stateMatches === null ? 'unknown' : 'success';
      return { sample: index + 1, workerId: restored && index === 0 ? 'worker-a' : index < 3 ? 'worker-b' : 'worker-c',
        version: index < 3 ? 'old-v1' : 'candidate-v2', operation: ['profile', 'cart', 'receipt'][index % 3],
        httpStatus, elapsedMs, stateMatches, outcome };
    });
    const counts = { successes: 0, interruptions: 0, unknown: 0 };
    for (const journey of journeys) {
      counts[journey.outcome === 'success' ? 'successes' : journey.outcome === 'interruption' ? 'interruptions' : 'unknown']++;
    }
    const capacityGate = observedCapacityRps === null ? 'unknown' : observedCapacityRps >= 60 ? 'positive' : 'negative';
    const observedStateGate = stateGate(workers);
    const gates = [capacityGate, observedStateGate, counts.interruptions ? 'negative' : counts.unknown ? 'unknown' : 'positive'];
    const contract = gates.includes('negative') ? 'negative' : gates.includes('unknown') ? 'unknown' : 'positive';
    return { provenance: 'fixed fictional teaching DATA ONLY', demandRps: 60, budgetMs: 120,
      observedCapacityRps, capacityGate, stateGate: observedStateGate, workers, journeys, counts, contract };
  }

  function assess(run) {
    const scopeClaim = run.scopeClaim === 'application-worker' ? 'positive' : 'negative';
    return {
      contract: run.measurement.contract, scopeClaim,
      overall: scopeClaim === 'negative' ? 'negative' : run.measurement.contract,
      observedFailure: 'application-worker', lostWorkerCount: 1,
      scopeEvidence: {
        applicationWorker: 'Authored loss record names only worker-a.',
        node: 'Same-node worker-b is observed serving; node-1 is not lost.',
        zone: 'Same-zone worker-b is observed serving; zone-1 is not lost.',
        region: 'A region-east worker is observed serving; region-east is not lost.',
      },
      outageTolerance: { node: 'unverified', zone: 'unverified', region: 'unverified' },
      limit: 'A fictional app-worker loss is not Azure node, zone or region outage proof. Region-west standby readiness is unverified.',
    };
  }

  function createState() {
    return freeze({ version: 1, phase: 'ready', current: null, runs: [], events: [] });
  }

  function reduce(state, action, input) {
    const next = clone(state);
    if (action === 'begin') {
      inputGuard(input);
      if (state.phase !== 'ready') fail('ORDER', 'Reset the active rehearsal before beginning another.');
      if (state.runs.length >= MAX_RUNS) fail('LIMIT', 'Six rehearsals are retained. Reload only when you intend to clear this session.');
      const id = state.runs.length + 1;
      next.runs.push({ id, fixture: input.fixture, scopeClaim: input.scopeClaim, phase: 'baseline',
        baseline: null, loss: null, measurement: null, assessment: null, recovery: null, reset: false, closedFrom: null });
      next.current = id;
      next.phase = 'baseline';
    } else {
      if (input !== null) fail('INPUT', 'This action accepts no input.');
      const required = { 'observe-baseline': 'baseline', 'record-loss': 'loss-ready', measure: 'awaiting-measurement', recover: 'measured' };
      if (!Object.hasOwn(required, action) && action !== 'reset') fail('INPUT', 'Unknown lesson action.');
      if (state.current === null || (action !== 'reset' && state.phase !== required[action])) {
        fail('ORDER', 'Action is out of order; the last valid state and evidence are unchanged.');
      }
      const run = next.runs[next.current - 1];
      if (action === 'observe-baseline') {
        run.baseline = measurement(run.fixture, true);
        run.phase = 'loss-ready';
      } else if (action === 'record-loss') {
        run.loss = { type: 'application-worker', workerId: 'worker-a', lostWorkerCount: 1,
          operation: 'Authored absent-worker record only; no process or resource operation.' };
        run.phase = 'awaiting-measurement';
      } else if (action === 'measure') {
        run.measurement = measurement(run.fixture);
        run.assessment = assess(run);
        run.phase = 'measured';
      } else if (action === 'recover') {
        run.recovery = measurement(run.fixture, true);
        run.phase = 'recovered';
      } else {
        run.reset = true;
        run.closedFrom = run.phase;
        next.current = null;
        next.phase = 'ready';
      }
      if (action !== 'reset') next.phase = run.phase;
    }
    if (next.events.length >= MAX_EVENTS) fail('LIMIT', 'The fixed session event limit is reached.');
    next.events.push({ seq: next.events.length + 1, action, input: input === null ? null : clone(input) });
    return next;
  }

  function validateState(state) {
    if (!exactKeys(state, ['version', 'phase', 'current', 'runs', 'events'])
        || state.version !== 1 || !Array.isArray(state.events) || state.events.length > MAX_EVENTS
        || !Array.isArray(state.runs) || state.runs.length > MAX_RUNS) {
      fail('STATE', 'Expected a bounded version-1 rehearsal state.');
    }
    try {
      const actual = canonical(state);
      let expected = createState();
      for (const [index, event] of state.events.entries()) {
        if (!exactKeys(event, ['seq', 'action', 'input']) || event.seq !== index + 1 || typeof event.action !== 'string') {
          fail('STATE', 'Retained events must be ordered, typed lesson actions.');
        }
        expected = reduce(expected, event.action, event.input);
      }
      // Replaying the bounded action log prevents forged observations or outcomes.
      if (actual !== canonical(expected)) fail('STATE', 'State does not match its retained action history.');
    } catch (error) {
      if (error.code === 'ERR_S111_STATE') throw error;
      fail('STATE', 'State contains an unreachable or malformed action history.');
    }
    return true;
  }

  function transition(state, action, input) {
    validateState(state);
    if (typeof action !== 'string') fail('INPUT', 'Action must be a listed string.');
    if (action === 'begin') inputGuard(input);
    else if (input !== undefined) fail('INPUT', 'This action accepts no input.');
    return freeze(reduce(state, action, action === 'begin' ? input : null));
  }

  return freeze({ BANNER, MAX_RUNS, MAX_EVENTS, FIXTURES, SCOPES, TOPOLOGY, REQUIRED_STATE, createState, transition, validateState });
}));
