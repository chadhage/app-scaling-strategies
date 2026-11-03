(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScaleOutRehearsal = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    cpuUnits: 140, memoryUnits: 100, offeredRps: 120, latencyBudgetMs: 250,
    profile: 'metric-rule', fault: 'none'
  });
  const RULE = Object.freeze({
    cpuThreshold: 70, memoryThreshold: 75, windows: 2, windowSeconds: 10,
    warmupWindows: 2, maxInstances: 4
  });
  const MAX_EVENTS = 80;
  const profiles = ['metric-rule', 'http-slot-unsupported', 'unverified-rule'];
  const faults = ['none', 'metrics-unknown', 'capacity-unknown', 'provision-failure', 'journey-unknown', 'journey-failure'];

  function initial() {
    return {
      schemaVersion: 1, mode: 'synthetic-only', clockSeconds: 0,
      input: { ...DEFAULTS }, capacity: { requested: 2, confirmedReady: 2, pending: null },
      breachStreak: 0, transitions: [], observations: [], journeys: [], events: [],
      lastResult: { verdict: 'NOT_RUN', message: 'No synthetic observation yet.' }
    };
  }

  function finish(state, type, verdict, message, details) {
    state.lastResult = { verdict, message };
    state.events.push({
      sequence: state.events.length + 1, atSeconds: state.clockSeconds,
      type, verdict, message, ...(details || {})
    });
    return state;
  }

  function exactKeys(event, keys) {
    return Object.keys(event).length === keys.length
      && keys.every((key) => Object.hasOwn(event, key));
  }

  function integer(value, minimum, maximum) {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
  }

  function normalize(event) {
    if (!exactKeys(event, ['type', ...Object.keys(DEFAULTS)])) {
      return { error: 'Apply requires exactly the six declared input fields; unknown or missing fields are rejected.' };
    }
    const input = {
      cpuUnits: integer(event.cpuUnits, 0, 1200),
      memoryUnits: integer(event.memoryUnits, 0, 1200),
      offeredRps: integer(event.offeredRps, 0, 1000),
      latencyBudgetMs: integer(event.latencyBudgetMs, 80, 1000),
      profile: event.profile, fault: event.fault
    };
    if (Object.values(input).includes(null)) {
      return { error: 'Use whole numbers: CPU/memory 0–1200, offered load 0–1000, and latency budget 80–1000. Blank and non-numeric inputs are invalid.' };
    }
    if (!profiles.includes(input.profile) || !faults.includes(input.fault)) {
      return { error: 'Unknown profile or observation condition. No supported configuration is inferred.' };
    }
    return { input };
  }

  function support(input) {
    if (input.profile === 'http-slot-unsupported') {
      return {
        verdict: 'UNSUPPORTED',
        message: 'The HTTP automatic-scaling-with-slot fixture is unsupported here. It is not the CPU/memory metric rule; no execution or native support is invented.'
      };
    }
    if (input.profile === 'unverified-rule') {
      return { verdict: 'UNKNOWN', message: 'Native metric/profile/slot eligibility is unverified. No rule execution, capacity change, or client success is invented.' };
    }
    return null;
  }

  function pressure(state) {
    const ready = state.capacity.confirmedReady;
    const rawCpuPct = Number((state.input.cpuUnits / ready).toFixed(2));
    const rawMemoryPct = Number((state.input.memoryUnits / ready).toFixed(2));
    return {
      rawCpuPct, rawMemoryPct, cpuPct: Math.min(100, rawCpuPct), memoryPct: Math.min(100, rawMemoryPct),
      saturated: rawCpuPct >= 100 || rawMemoryPct >= 100,
      queueRps: Math.max(0, state.input.offeredRps - ready * 100)
    };
  }

  function advance(state) {
    state.clockSeconds += RULE.windowSeconds;
    const unknownCapacity = state.input.fault === 'capacity-unknown';
    const unknownMetrics = state.input.fault === 'metrics-unknown' || unknownCapacity;
    let decision;
    let message;
    let becameReady = false;
    if (!unknownCapacity && state.capacity.pending) {
      const pending = state.capacity.pending;
      const transition = state.transitions.find((entry) => entry.id === pending.id);
      if (state.input.fault === 'provision-failure') {
        transition.status = 'FAILED';
        transition.failedAt = state.clockSeconds;
        state.capacity.pending = null;
        state.breachStreak = 0;
        decision = 'PROVISION_FAILED';
        message = 'The synthetic provisioning observation failed. Requested intent is retained; no additional ready capacity is claimed.';
      } else {
        pending.remainingWindows -= 1;
        if (pending.remainingWindows === 0) {
          state.capacity.confirmedReady = pending.target;
          transition.status = 'READY';
          transition.readyAt = state.clockSeconds;
          state.capacity.pending = null;
          becameReady = true;
        }
      }
    }
    const measured = pressure(state);
    const triggerMetrics = unknownMetrics ? [] : [
      ...(measured.cpuPct >= RULE.cpuThreshold ? ['CPU'] : []),
      ...(measured.memoryPct >= RULE.memoryThreshold ? ['memory'] : [])
    ];
    if (unknownMetrics) {
      state.breachStreak = 0;
      decision = 'UNKNOWN';
      message = unknownCapacity
        ? 'Effective capacity is UNKNOWN. Last-confirmed capacity is historical, warm-up is paused, and no completion is invented.'
        : 'CPU/memory observations are missing. The breach streak is broken, not treated as low demand.';
    } else if (!decision) {
      if (becameReady) {
        state.breachStreak = 0;
        decision = 'READY';
        message = 'The added instance is now observed ready. Metric percentages use this effective pool; client outcomes still require separate observations.';
      } else if (state.capacity.pending) {
        state.breachStreak = 0;
        decision = 'WARMING';
        message = 'The requested instance is still warming. Requested capacity is not effective capacity; no duplicate request is issued.';
      } else if (!triggerMetrics.length) {
        state.breachStreak = 0;
        decision = 'NO_BREACH';
        message = 'Neither resource meets its threshold. No scale-out request is made.';
      } else if (state.capacity.confirmedReady >= RULE.maxInstances) {
        state.breachStreak = 0;
        decision = 'AT_LIMIT';
        message = 'A resource threshold is breached at the four-instance fixture limit. More capacity is not fabricated.';
      } else {
        state.breachStreak += 1;
        if (state.breachStreak < RULE.windows) {
          decision = 'WATCH';
          message = `${triggerMetrics.join(' and ')} meets the threshold for one window. A second consecutive breach is required.`;
        } else {
          const target = state.capacity.confirmedReady + 1;
          const id = `transition-${state.transitions.length + 1}`;
          state.capacity.requested = target;
          state.capacity.pending = { id, target, remainingWindows: RULE.warmupWindows };
          state.transitions.push({
            id, requestedAt: state.clockSeconds, from: state.capacity.confirmedReady,
            to: target, triggerMetrics, status: 'WARMING', readyAt: null, failedAt: null
          });
          state.breachStreak = 0;
          decision = 'SCALE_OUT_REQUESTED';
          message = `${triggerMetrics.join(' and ')} triggered scale-out after two consecutive windows. One instance is requested, not yet ready.`;
        }
      }
    }
    state.observations.push({
      id: `window-${state.observations.length + 1}`, atSeconds: state.clockSeconds,
      input: { ...state.input }, requested: state.capacity.requested,
      readyObserved: unknownCapacity ? null : state.capacity.confirmedReady,
      lastConfirmedReady: state.capacity.confirmedReady,
      cpuPct: unknownMetrics ? null : measured.cpuPct,
      memoryPct: unknownMetrics ? null : measured.memoryPct,
      rawCpuPct: unknownMetrics ? null : measured.rawCpuPct,
      rawMemoryPct: unknownMetrics ? null : measured.rawMemoryPct,
      saturated: unknownMetrics ? null : measured.saturated,
      queueRps: unknownCapacity ? null : measured.queueRps,
      decision, triggerMetrics, breachStreak: state.breachStreak, message
    });
    return finish(state, 'tick', decision, message);
  }

  function observe(state) {
    if (state.input.offeredRps === 0) {
      return finish(state, 'observe', 'NOT_OBSERVED', 'Offered load is zero. No journeys are attempted and no success rate is available.');
    }
    const measured = pressure(state);
    const phase = state.capacity.pending ? 'warming'
      : state.capacity.confirmedReady > 2 ? 'post-scale' : 'baseline';
    const transitionId = state.capacity.pending?.id
      || state.transitions.filter((entry) => entry.status === 'READY').at(-1)?.id || null;
    const serviceRps = state.capacity.confirmedReady * 100;
    const resourcePenalty = measured.saturated
      ? 300 + Math.ceil(Math.max(measured.rawCpuPct, measured.rawMemoryPct) - 100) : 0;
    const latencyMs = 80 + Math.ceil(measured.queueRps / serviceRps * 1000) + resourcePenalty;
    const start = state.journeys.length;
    for (let index = 0; index < 10; index += 1) {
      const unknown = state.input.fault === 'capacity-unknown'
        || (state.input.fault === 'journey-unknown' && index === 0);
      const incorrect = state.input.fault === 'journey-failure' && index === 0;
      const reasons = unknown ? ['Missing client/routing observation; completion and latency are unknown.'] : [
        ...(latencyMs > state.input.latencyBudgetMs ? ['Latency budget exceeded.'] : []),
        ...(incorrect ? ['Incorrect cart state and duplicate synthetic business effect despite HTTP 200.'] : [])
      ];
      state.journeys.push({
        id: `attempt-${start + index + 1}`, clientId: `client-${index + 1}`,
        sessionId: `session-${index + 1}`, cartId: `cart-${index + 1}`,
        atSeconds: state.clockSeconds, phase, transitionId,
        input: { ...state.input }, readyObserved: unknown ? null : state.capacity.confirmedReady,
        instance: unknown ? null : 1 + index % state.capacity.confirmedReady,
        queueRps: unknown ? null : measured.queueRps,
        latencyMs: unknown ? null : latencyMs, budgetMs: state.input.latencyBudgetMs,
        httpStatus: unknown ? null : 200, completed: unknown ? null : true,
        authenticated: unknown ? null : true, stateCorrect: unknown ? null : !incorrect,
        effects: unknown ? null : incorrect ? 2 : 1,
        outcome: unknown ? 'UNKNOWN' : reasons.length ? 'INTERRUPTED' : 'UNINTERRUPTED', reasons
      });
    }
    const batch = state.journeys.slice(start);
    const interrupted = batch.filter((entry) => entry.outcome === 'INTERRUPTED').length;
    const unknown = batch.filter((entry) => entry.outcome === 'UNKNOWN').length;
    return finish(state, 'observe', interrupted ? 'INTERRUPTED' : unknown ? 'UNKNOWN' : 'OBSERVED',
      `Ten ${phase} synthetic journeys observed: ${10 - interrupted - unknown} uninterrupted, ${interrupted} interrupted, ${unknown} unknown. Earlier observations remain unchanged.`);
  }

  function reduce(previous, event) {
    const state = JSON.parse(JSON.stringify(previous));
    if (state.events.length >= MAX_EVENTS) {
      state.lastResult = { verdict: 'LIMIT', message: 'The 80-command limit is reached. Existing evidence is retained; archive/reset for a new run.' };
      return state;
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return finish(state, 'invalid', 'INVALID', 'Expected one declared operation object.');
    }
    if (event.type === 'apply') {
      const validated = normalize(event);
      if (validated.error) return finish(state, 'apply', 'INVALID', validated.error);
      state.input = validated.input;
      state.breachStreak = 0;
      const gate = support(state.input);
      return finish(state, 'apply', gate?.verdict || 'APPLIED',
        gate?.message || 'Inputs applied. A new consecutive-rule evaluation starts; prior observations and any in-progress target remain unchanged.',
        { input: { ...state.input } });
    }
    if (!['tick', 'observe'].includes(event.type) || !exactKeys(event, ['type'])) {
      return finish(state, 'invalid', 'INVALID', 'Unknown operation or extra fields. Only apply, tick, and observe are admitted.');
    }
    const gate = support(state.input);
    if (gate) return finish(state, event.type, gate.verdict, gate.message);
    return event.type === 'tick' ? advance(state) : observe(state);
  }

  function summarize(state) {
    const count = (items, predicate) => items.filter(predicate).length;
    const users = {
      attempts: state.journeys.length,
      completed: count(state.journeys, (entry) => entry.completed === true),
      uninterrupted: count(state.journeys, (entry) => entry.outcome === 'UNINTERRUPTED'),
      interrupted: count(state.journeys, (entry) => entry.outcome === 'INTERRUPTED'),
      unknown: count(state.journeys, (entry) => entry.outcome === 'UNKNOWN')
    };
    users.verdict = users.interrupted ? 'INTERRUPTED' : users.unknown ? 'UNKNOWN'
      : users.attempts ? 'OBSERVED_UNINTERRUPTED' : 'NOT_OBSERVED';
    const latencies = state.journeys.map((entry) => entry.latencyMs).filter((value) => value !== null);
    users.maxLatencyMs = latencies.length ? Math.max(...latencies) : null;
    const transition = {
      requested: state.transitions.length,
      ready: count(state.transitions, (entry) => entry.status === 'READY'),
      failed: count(state.transitions, (entry) => entry.status === 'FAILED'),
      baselineSamples: count(state.journeys, (entry) => entry.phase === 'baseline'),
      warmingSamples: count(state.journeys, (entry) => entry.phase === 'warming'),
      postScaleSamples: count(state.journeys, (entry) => entry.phase === 'post-scale'),
      addedInstanceSamples: count(state.journeys, (entry) => entry.phase === 'post-scale' && entry.instance > 2)
    };
    const gate = support(state.input);
    const capacity = {
      requested: state.capacity.requested,
      effectiveReady: state.input.fault === 'capacity-unknown' || gate?.verdict === 'UNKNOWN'
        ? null : state.capacity.confirmedReady,
      lastConfirmedReady: state.capacity.confirmedReady, maximum: RULE.maxInstances,
      warming: state.capacity.pending ? state.capacity.pending.target - state.capacity.confirmedReady : 0,
      saturationWindows: count(state.observations, (entry) => entry.saturated === true),
      queuedWindows: count(state.observations, (entry) => entry.queueRps > 0)
    };
    let verdict = 'INCOMPLETE';
    let message = 'Observe a baseline or warming sample, an added ready instance, and post-scale journeys using that instance.';
    if (!state.events.length) {
      verdict = 'NOT_RUN';
      message = 'No commands or user observations yet.';
    } else if (users.interrupted || transition.failed || capacity.saturationWindows
        || capacity.queuedWindows || state.journeys.some((entry) => entry.queueRps > 0)) {
      verdict = 'FAIL';
      message = 'Retained interruption, failed capacity transition, saturation, or queuing violates the fixture envelope. See the separate user counts; pressure alone does not prove interrupted users.';
    } else if (gate) {
      verdict = gate.verdict;
      message = gate.message;
    } else if (users.unknown || state.observations.some((entry) => entry.decision === 'UNKNOWN')) {
      verdict = 'UNKNOWN';
      message = 'Some retained metric, effective-capacity, or journey observations are unknown. A later healthy sample does not retroactively fill them.';
    } else if (transition.ready && transition.baselineSamples + transition.warmingSamples > 0
        && transition.postScaleSamples > 0 && transition.addedInstanceSamples > 0) {
      verdict = 'PASS';
      message = 'The preemptive synthetic rule/capacity exercise and all sampled journeys passed the declared fixture checks. This is not a native Azure result or a reliability guarantee.';
    }
    return {
      rule: { ...RULE, consecutive: state.breachStreak, lastDecision: state.observations.at(-1)?.decision || 'NOT_RUN' },
      capacity, users, transition, verification: { verdict, message },
      nativeProof: false, productionNode24Validated: false, parentComplete: false
    };
  }
  return { DEFAULTS, RULE, MAX_EVENTS, initial, reduce, summarize };
}));
