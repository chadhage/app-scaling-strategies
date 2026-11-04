(function (root) {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const HISTORY_LIMIT = 12;
  const OLD_REVISION = 'lesson-api--r1';
  const CANDIDATE_REVISION = 'lesson-api--r2';
  const CHANGE_KIND = 'Software revision replacement, not compute-capacity scaling';
  const FIXTURES = Object.freeze([
    'ready', 'provision-failed', 'replicas-short', 'startup-failed', 'probe-failed',
    'readiness-unknown', 'traffic-mismatch', 'traffic-unknown', 'session-lost',
    'work-interrupted', 'work-unknown', 'journey-unknown', 'latency-breach',
  ]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  function failure(code, message) {
    const error = new TypeError(message);
    error.code = code;
    return error;
  }
  function inspectJson(value, depth = 0, stack = new Set(), budget = { remaining: 15000 }) {
    if (--budget.remaining < 0 || depth > 16) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'string') return value.length <= 2000;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object' || stack.has(value)) return false;
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) return false;
    const entries = array ? keys.filter((key) => key !== 'length') : keys;
    if (array && (value.length > 64 || entries.length !== value.length
        || entries.some((key, index) => key !== String(index)))) return false;
    stack.add(value);
    for (const key of entries) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
          || !inspectJson(descriptor.value, depth + 1, stack, budget)) return false;
    }
    stack.delete(value);
    return true;
  }
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }
  function assertCommand(command) {
    if (!inspectJson(command) || command === null || Array.isArray(command)
        || !['update', 'readiness', 'traffic', 'continuity'].includes(command.type)) {
      throw failure('ERR_COMMAND', 'Invalid command: use an exact, typed lesson action.');
    }
    const expected = command.type === 'update' ? ['fixture', 'type', 'version'] : ['type'];
    if (canonical(Object.keys(command).sort()) !== canonical(expected)) {
      throw failure('ERR_COMMAND', 'Invalid command: unexpected or missing fields.');
    }
    if (command.type === 'update') {
      if (typeof command.version !== 'string' || command.version !== 'v2') {
        throw failure('ERR_COMMAND', 'Candidate software token must be exactly v2; no whitespace or coercion.');
      }
      if (typeof command.fixture !== 'string' || !FIXTURES.includes(command.fixture)) {
        throw failure('ERR_COMMAND', 'Select a known fixed observation fixture.');
      }
    }
  }
  function baseline() {
    return {
      schemaVersion: 1, oldRevision: OLD_REVISION, oldImage: 'fictional-image-v1',
      phase: 'baseline', fixture: null, candidate: null, readiness: 'unobserved',
      trafficResult: 'unobserved', traffic: { old: 100, candidate: 0 },
      lastTraffic: { old: 100, candidate: 0 }, oldLifecycle: 'active',
      candidateLifecycle: 'not-recorded', sessions: 'unobserved', work: 'unobserved',
      journeys: { attempted: 0, passed: 0, failed: 0, unknown: 0 },
      completed: false, safeHolds: 0, outcome: 'unobserved', history: [],
      replicaTarget: { before: 2, after: 2, minimum: 2, maximum: 2 },
      changeKind: CHANGE_KIND,
      message: 'Record a fixed candidate; nominal update is not readiness or observed replacement.',
      data: null,
    };
  }
  function fixtureData(name) {
    const data = {
      readiness: {
        provisioning: 'succeeded', requiredReplicas: 2, observedReplicaCount: 2,
        replicas: [
          { id: 'candidate-replica-1', startup: 'passed', readiness: 'passed' },
          { id: 'candidate-replica-2', startup: 'passed', readiness: 'passed' },
        ],
      },
      traffic: {
        intended: { old: 0, candidate: 100 }, observed: { old: 0, candidate: 100 },
        oldLifecycle: 'inactive', candidateLifecycle: 'active',
      },
      journeys: [1, 2].map((id) => ({
        id: `journey-${id}`, observed: true, expectedRevision: CANDIDATE_REVISION,
        observedRevision: CANDIDATE_REVISION, status: 200,
        identityBefore: `user-${id}`, identityAfter: `user-${id}`,
        sessionBefore: `session-${id}`, sessionAfter: `session-${id}`,
        stateBefore: 'cart:3', stateAfter: 'cart:3', durationMs: id === 1 ? 140 : 180, budgetMs: 400,
      })),
      oldWork: {
        id: 'work-17', startedOn: OLD_REVISION, observed: true, completed: true,
        statePreserved: true, effectId: 'effect-17', committedEffectCount: 1,
        durationMs: 220, budgetMs: 400,
      },
    };
    if (name === 'provision-failed') {
      data.readiness.provisioning = 'failed';
      data.readiness.observedReplicaCount = 0;
      data.readiness.replicas = [];
    }
    if (name === 'replicas-short') {
      data.readiness.observedReplicaCount = 1;
      data.readiness.replicas.pop();
    }
    if (name === 'startup-failed') data.readiness.replicas[1].startup = 'failed';
    if (name === 'probe-failed') data.readiness.replicas[1].readiness = 'failed';
    if (name === 'readiness-unknown') {
      data.readiness.provisioning = 'unknown';
      data.readiness.observedReplicaCount = null;
      data.readiness.replicas = null;
    }
    if (name === 'traffic-mismatch') {
      data.traffic.observed = { old: 100, candidate: 0 };
      data.traffic.oldLifecycle = 'active';
      data.traffic.candidateLifecycle = 'ready';
    }
    if (name === 'traffic-unknown') {
      data.traffic.observed = null;
      data.traffic.oldLifecycle = 'unknown';
      data.traffic.candidateLifecycle = 'unknown';
    }
    if (name === 'session-lost') {
      data.journeys[0].sessionAfter = 'lost';
      data.journeys[0].stateAfter = 'cart:0';
    }
    if (name === 'work-interrupted') {
      data.oldWork.completed = false;
      data.oldWork.committedEffectCount = 0;
    }
    if (name === 'work-unknown') {
      Object.assign(data.oldWork, {
        observed: false, completed: null, statePreserved: null, committedEffectCount: null, durationMs: null,
      });
    }
    if (name === 'journey-unknown') {
      Object.assign(data.journeys[1], {
        observed: false, observedRevision: null, status: null, identityAfter: null,
        sessionAfter: null, stateAfter: null, durationMs: null,
      });
    }
    if (name === 'latency-breach') data.journeys[1].durationMs = 610;
    return data;
  }
  const DATA = freeze(Object.fromEntries(FIXTURES.map((name) => [name, fixtureData(name)])));
  const combined = (results) => results.includes('negative') ? 'negative'
    : results.includes('unknown') ? 'unknown' : 'positive';
  const measured = (value, pass) => value === null ? 'unknown' : pass(value) ? 'positive' : 'negative';
  function probeResult(replicas, field) {
    if (replicas === null || replicas.length === 0) return 'unknown';
    return combined(replicas.map((replica) => replica[field] === 'passed' ? 'positive'
      : replica[field] === 'failed' ? 'negative' : 'unknown'));
  }
  function readinessResult(data) {
    const checks = {
      provisioning: data.provisioning === 'succeeded' ? 'positive'
        : data.provisioning === 'failed' ? 'negative' : 'unknown',
      requiredReplicas: measured(data.observedReplicaCount, (count) => count === data.requiredReplicas
        && data.replicas !== null && data.replicas.length === data.requiredReplicas),
      startupProbes: probeResult(data.replicas, 'startup'),
      readinessProbes: probeResult(data.replicas, 'readiness'),
    };
    return { result: combined(Object.values(checks)), checks, observation: clone(data) };
  }
  function journeyResult(data) {
    if (!data.observed) return 'unknown';
    return combined([
      measured(data.observedRevision, (value) => value === data.expectedRevision),
      measured(data.status, (value) => value === 200),
      measured(data.identityAfter, (value) => value === data.identityBefore),
      measured(data.sessionAfter, (value) => value === data.sessionBefore),
      measured(data.stateAfter, (value) => value === data.stateBefore),
      measured(data.durationMs, (value) => value <= data.budgetMs),
    ]);
  }
  function workResult(data) {
    if (!data.observed) return 'unknown';
    return combined([
      measured(data.completed, (value) => value === true),
      measured(data.statePreserved, (value) => value === true),
      measured(data.committedEffectCount, (value) => value === 1),
      measured(data.durationMs, (value) => value <= data.budgetMs),
    ]);
  }
  function reduce(state, command) {
    const next = clone(state);
    const hold = (reason) => {
      next.safeHolds++;
      next.outcome = 'negative';
      next.message = `Safe hold: ${reason} No additional user exposure or successful continuity is claimed.`;
      next.data = { guard: reason };
    };
    if (command.type === 'update') {
      if (state.phase !== 'baseline' || state.candidate !== null) {
        hold('The fixed candidate is recorded once; reset before choosing another observation fixture.');
      } else {
        next.fixture = command.fixture;
        next.candidate = { revision: CANDIDATE_REVISION, image: 'fictional-image-v2', version: 'v2' };
        next.candidateLifecycle = 'provisioning';
        next.phase = 'awaiting-readiness';
        next.outcome = 'unknown';
        next.message = 'Nominal software update DATA recorded. Readiness and traffic transition remain unobserved; old revision still serves 100%.';
        next.data = { oldRevision: OLD_REVISION, oldImage: state.oldImage, candidate: clone(next.candidate),
          replicaTarget: clone(state.replicaTarget), changeKind: CHANGE_KIND };
      }
    } else if (command.type === 'readiness') {
      if (state.phase !== 'awaiting-readiness') {
        hold('Inspect readiness once, after recording the candidate.');
      } else {
        const evidence = readinessResult(DATA[state.fixture].readiness);
        next.readiness = evidence.result;
        next.outcome = evidence.result;
        next.data = evidence;
        next.phase = evidence.result === 'positive' ? 'ready-awaiting-traffic' : 'readiness-held';
        next.candidateLifecycle = evidence.result === 'positive' ? 'ready'
          : evidence.result === 'negative' ? 'readiness-failed' : 'unknown';
        next.message = evidence.result === 'positive'
          ? 'Ready DATA permits replacement, but no traffic transition is observed yet. Last/current old ingress remains 100%.'
          : `${evidence.result.toUpperCase()} readiness DATA: replacement is not permitted; old revision remains active at 100%.`;
      }
    } else if (command.type === 'traffic') {
      if (state.phase !== 'ready-awaiting-traffic' || state.readiness !== 'positive') {
        hold('Positive observed readiness must precede traffic transition inspection.');
      } else {
        const data = DATA[state.fixture].traffic;
        const result = data.observed === null ? 'unknown'
          : data.observed.old === 0 && data.observed.candidate === 100
            && data.oldLifecycle === 'inactive' && data.candidateLifecycle === 'active' ? 'positive' : 'negative';
        next.trafficResult = result;
        next.traffic = clone(data.observed);
        if (data.observed !== null) next.lastTraffic = clone(data.observed);
        next.oldLifecycle = data.oldLifecycle;
        next.candidateLifecycle = data.candidateLifecycle;
        next.phase = result === 'positive' ? 'switched-awaiting-continuity' : 'traffic-unverified';
        next.outcome = result;
        next.data = { result, observation: clone(data) };
        next.message = result === 'positive'
          ? 'Observed synthetic old 0% / candidate 100% and old inactive. Sessions, state and old work remain unverified.'
          : `${result.toUpperCase()} traffic DATA: intended replacement is not verified. Last known routing is not current unknown evidence.`;
      }
    } else if (command.type === 'continuity') {
      if (state.phase !== 'switched-awaiting-continuity' || state.trafficResult !== 'positive') {
        hold('Positive observed traffic replacement must precede continuity verification.');
      } else {
        const data = DATA[state.fixture];
        const journeys = data.journeys.map((observation) => ({ result: journeyResult(observation), observation: clone(observation) }));
        next.journeys = {
          attempted: journeys.length,
          passed: journeys.filter((journey) => journey.result === 'positive').length,
          failed: journeys.filter((journey) => journey.result === 'negative').length,
          unknown: journeys.filter((journey) => journey.result === 'unknown').length,
        };
        next.sessions = combined(journeys.map((journey) => journey.result));
        next.work = workResult(data.oldWork);
        next.outcome = combined([next.sessions, next.work]);
        next.completed = next.outcome === 'positive';
        next.phase = next.completed ? 'verified-synthetic'
          : next.outcome === 'negative' ? 'continuity-failed' : 'continuity-unknown';
        next.data = { sessions: { result: next.sessions, journeys },
          oldWork: { result: next.work, observation: clone(data.oldWork) }, counts: clone(next.journeys) };
        next.message = `${next.outcome.toUpperCase()} synthetic continuity: sessions/state ${next.sessions}; old work/effects ${next.work}. Native ACA and D-S125 remain unverified.`;
      }
    }
    next.history.push({
      sequence: state.history.length + 1, command: clone(command),
      beforePhase: state.phase, afterPhase: next.phase, outcome: next.outcome,
      message: next.message, data: clone(next.data),
    });
    return freeze(next);
  }
  function assertState(state) {
    try {
      if (!inspectJson(state) || state === null || Array.isArray(state)
          || !Array.isArray(state.history) || state.history.length > HISTORY_LIMIT) throw new Error();
      let expected = baseline();
      for (const entry of state.history) {
        if (entry === null || typeof entry !== 'object') throw new Error();
        assertCommand(entry.command);
        expected = reduce(expected, entry.command);
      }
      if (canonical(state) !== canonical(expected)) throw new Error();
    } catch {
      throw failure('ERR_STATE', 'Invalid state: fixed DATA, counters and retained history must match deterministic replay.');
    }
  }
  function createState() { return freeze(baseline()); }
  function execute(state, command) {
    assertState(state);
    assertCommand(command);
    if (state.history.length >= HISTORY_LIMIT) {
      throw failure('ERR_HISTORY_LIMIT', `All ${HISTORY_LIMIT} actions are retained. Reset the rehearsal before another action.`);
    }
    return reduce(state, command);
  }
  const api = Object.freeze({ BANNER, HISTORY_LIMIT, FIXTURES, CHANGE_KIND, createState, execute });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AcaRevisionLesson = api;
}(globalThis));
