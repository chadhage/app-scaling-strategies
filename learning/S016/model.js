(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OscillationRehearsal = factory();
}(globalThis, function () {
  'use strict';
  const defaults = Object.freeze({
    pattern: 'oscillating', lowRps: 60, highRps: 180,
    stabilizationWindows: 2, cooldownWindows: 2, budgetMs: 250
  });
  const conditions = ['complete', 'missing-client', 'capacity-unknown', 'state-loss', 'readiness-failed'];
  const patterns = {
    oscillating: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    rebound: [1, 0, 1, 0, 0, 0, 1, 1, 1, 1]
  };
  const messages = {
    COMMAND: 'Unknown command, observation condition or command field.',
    INPUT: 'Use only the declared pattern and bounded whole-number inputs; low demand must be below high demand.',
    LOCKED: 'Configuration is locked after the first observed window. Archive/reset to change the fixture.',
    COMPLETE: 'Ten-window trace is complete. Existing evidence is retained; archive/reset for another run.'
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const plain = (value) => value !== null && typeof value === 'object'
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const keysAre = (value, keys) => plain(value)
    && Reflect.ownKeys(value).length === keys.length
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
  const lane = () => ({ ready: 2, pending: null, lastChangeWindow: null, lowStreak: 0 });

  function initial() {
    return {
      version: 1, config: { ...defaults }, cursor: 0, previousDemand: 0,
      lanes: { immediate: lane(), stabilized: lane() }, observations: [], events: [],
      lastResult: { verdict: 'READY', message: 'Configure and advance the shared synthetic demand trace.' }
    };
  }

  function whole(value, minimum, maximum) {
    if (typeof value === 'string') {
      if (!/^(0|[1-9]\d*)$/.test(value) || value.length > 6) return null;
      value = Number(value);
    }
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
  }

  function configuration(input) {
    if (!keysAre(input, Object.keys(defaults)) || typeof input.pattern !== 'string'
      || !Object.hasOwn(patterns, input.pattern)) return null;
    const config = {
      pattern: input.pattern, lowRps: whole(input.lowRps, 20, 190),
      highRps: whole(input.highRps, 100, 400),
      stabilizationWindows: whole(input.stabilizationWindows, 1, 4),
      cooldownWindows: whole(input.cooldownWindows, 0, 5),
      budgetMs: whole(input.budgetMs, 80, 2000)
    };
    return Object.values(config).includes(null) || config.lowRps >= config.highRps ? null : config;
  }

  function normalize(state, event) {
    if (!plain(event)) return { type: 'rejected', reason: 'COMMAND' };
    if (event.type === 'configure') {
      if (!keysAre(event, ['type', ...Object.keys(defaults)])) return { type: 'rejected', reason: 'INPUT' };
      if (state.cursor) return { type: 'rejected', reason: 'LOCKED' };
      const { type: ignored, ...input } = event;
      const config = configuration(input);
      return config ? { type: 'configure', config } : { type: 'rejected', reason: 'INPUT' };
    }
    if (event.type === 'step' && keysAre(event, ['type', 'condition']) && conditions.includes(event.condition)) {
      return state.cursor === 10 ? { type: 'rejected', reason: 'COMPLETE' }
        : { type: 'step', condition: event.condition };
    }
    return { type: 'rejected', reason: 'COMMAND' };
  }

  function canonical(value, ancestors = new Set(), depth = 0) {
    if (depth > 18) throw new Error('state nesting');
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'string' && value.length <= 1000) return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    if (!Array.isArray(value) && !plain(value)) throw new Error('state type');
    if (ancestors.has(value)) throw new Error('cyclic state');
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      if (value.length > 100 || Object.keys(value).length !== value.length) throw new Error('state array');
      result = `[${value.map((entry) => canonical(entry, ancestors, depth + 1)).join(',')}]`;
    } else {
      if (Reflect.ownKeys(value).length !== Object.keys(value).length || Object.keys(value).length > 24) {
        throw new Error('state keys');
      }
      result = `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key], ancestors, depth + 1)}`).join(',')}}`;
    }
    ancestors.delete(value);
    return result;
  }

  function client(window, index, config, condition, queueRps, ready, unsafeDown) {
    const missing = ready === null || (condition === 'missing-client' && index === 0);
    const lost = unsafeDown && index === 3;
    const stateCorrect = !(condition === 'state-loss' && index === 0);
    const latencyMs = missing ? null : 80 + Math.ceil(queueRps / (ready * 100) * 1000);
    const reasons = [];
    if (missing) reasons.push('Client or effective-capacity observation is missing.');
    else {
      if (lost) reasons.push('Capacity removed with an unfinished continuation.');
      if (latencyMs > config.budgetMs) reasons.push('Original journey latency budget exceeded.');
      if (!stateCorrect) reasons.push('Business state is incorrect despite HTTP 200.');
    }
    return {
      id: `w${window}-client${index + 1}`, clientId: `client-${index + 1}`,
      kind: index === 3 ? 'continuation-or-new' : 'new',
      completed: missing ? null : !lost, httpStatus: missing || lost ? null : 200,
      latencyMs, budgetMs: config.budgetMs, stateCorrect: missing ? null : stateCorrect,
      effects: missing ? null : lost ? 0 : 1,
      outcome: missing ? 'UNKNOWN' : reasons.length ? 'INTERRUPTED' : 'UNINTERRUPTED', reasons
    };
  }

  function advanceLane(name, current, window, demand, previousDemand, config, condition) {
    const next = clone(current);
    const changes = [];
    const target = Math.ceil(demand / 100);
    let decision = 'HOLD';
    let unsafeDown = false;
    let readinessFailed = false;
    const observed = condition !== 'capacity-unknown';
    if (observed && next.pending && next.pending.readyAtWindow <= window) {
      if (condition === 'readiness-failed') {
        changes.push({ phase: 'failed', direction: 'out', from: next.ready, to: next.pending.target });
        readinessFailed = true;
      } else {
        changes.push({ phase: 'ready', direction: 'out', from: next.ready, to: next.pending.target });
        next.ready = next.pending.target;
      }
      next.pending = null;
    }
    next.lowStreak = observed && target < next.ready ? next.lowStreak + 1 : 0;
    const cooldownRemaining = name === 'stabilized' && next.lastChangeWindow !== null
      ? Math.max(0, config.cooldownWindows - (window - next.lastChangeWindow)) : 0;
    if (!observed) decision = 'CAPACITY_UNKNOWN';
    else if (readinessFailed) decision = 'READINESS_FAILED';
    else if (next.pending) decision = 'WARMING';
    else if (target === next.ready) decision = 'HOLD';
    else if (name === 'stabilized' && target < next.ready && next.lowStreak < config.stabilizationWindows) {
      decision = 'STABILIZING';
    } else if (cooldownRemaining) decision = 'COOLDOWN';
    else if (target > next.ready) {
      changes.push({ phase: 'requested', direction: 'out', from: next.ready, to: target });
      next.pending = { target, readyAtWindow: window + 1 };
      next.lastChangeWindow = window;
      decision = 'SCALE_OUT_REQUESTED';
    } else {
      unsafeDown = previousDemand > target * 100;
      changes.push({ phase: 'requested', direction: 'in', from: next.ready, to: target });
      changes.push({ phase: 'ready', direction: 'in', from: next.ready, to: target });
      next.ready = target;
      next.lastChangeWindow = window;
      decision = 'SCALE_IN';
    }
    const ready = observed ? next.ready : null;
    const queueRps = ready === null ? null : Math.max(0, demand - ready * 100);
    return {
      state: next,
      row: {
        target, ready, pendingTarget: next.pending?.target ?? null, decision,
        lowStreak: next.lowStreak, cooldownRemaining, unsafeDown, queueRps, changes,
        journeys: Array.from({ length: 4 }, (_, index) =>
          client(window, index, config, condition, queueRps, ready, unsafeDown))
      }
    };
  }

  function applyRecord(state, record) {
    const next = clone(state);
    next.events.push(clone(record));
    if (record.type === 'rejected') {
      next.lastResult = { verdict: record.reason === 'COMPLETE' ? 'LIMIT' : 'INVALID', message: messages[record.reason] };
    } else if (record.type === 'configure') {
      next.config = clone(record.config);
      next.lastResult = { verdict: 'CONFIGURED', message: 'Both lanes will use this identical declared ten-window demand trace.' };
    } else {
      const window = next.cursor + 1;
      const demand = patterns[next.config.pattern][next.cursor] ? next.config.highRps : next.config.lowRps;
      const lanes = {};
      for (const name of ['immediate', 'stabilized']) {
        const result = advanceLane(name, next.lanes[name], window, demand, next.previousDemand, next.config, record.condition);
        next.lanes[name] = result.state;
        lanes[name] = result.row;
      }
      next.cursor = window;
      next.previousDemand = demand;
      next.observations.push({ window, demandRps: demand, condition: record.condition, lanes });
      next.lastResult = { verdict: 'OBSERVED', message: `Observed shared synthetic window ${window}/10; previous outcomes remain retained.` };
    }
    return next;
  }

  function validateState(state) {
    try {
      const serialized = canonical(state);
      if (serialized.length > 180000 || !plain(state) || !Array.isArray(state.events) || state.events.length > 40) {
        throw new Error('state bounds');
      }
      let replay = initial();
      for (const record of state.events) {
        if (record.type === 'rejected') {
          if (!keysAre(record, ['type', 'reason']) || !Object.hasOwn(messages, record.reason)) throw new Error('rejection');
          if ((record.reason === 'COMPLETE' && replay.cursor !== 10)
            || (record.reason === 'LOCKED' && !replay.cursor)) throw new Error('rejection timing');
        } else if (record.type === 'configure') {
          if (!keysAre(record, ['type', 'config']) || replay.cursor || !configuration(record.config)
            || canonical(configuration(record.config)) !== canonical(record.config)) throw new Error('configuration');
        } else if (record.type === 'step') {
          if (!keysAre(record, ['type', 'condition']) || !conditions.includes(record.condition) || replay.cursor >= 10) {
            throw new Error('step');
          }
        } else throw new Error('event');
        replay = applyRecord(replay, record);
      }
      if (canonical(replay) !== serialized) throw new Error('state does not match retained events');
    } catch (error) {
      throw new TypeError(`Invalid rehearsal state: ${error.message}`);
    }
  }

  function reduce(state, event) {
    validateState(state);
    if (state.events.length === 40) throw new RangeError('Command limit reached. Copy retained evidence and archive/reset; no history was deleted.');
    return applyRecord(state, normalize(state, event));
  }

  function laneSummary(state, name) {
    const rows = state.observations.map((entry) => entry.lanes[name]);
    const journeys = rows.flatMap((row) => row.journeys);
    const changes = rows.flatMap((row) => row.changes);
    const requested = changes.filter((change) => change.phase === 'requested');
    const latencies = journeys.map((journey) => journey.latencyMs).filter((value) => value !== null);
    const queues = rows.map((row) => row.queueRps).filter((value) => value !== null);
    const interrupted = journeys.filter((journey) => journey.outcome === 'INTERRUPTED').length;
    const unknown = journeys.filter((journey) => journey.outcome === 'UNKNOWN').length;
    return {
      requestedChanges: requested.length, effectiveChanges: changes.filter((change) => change.phase === 'ready').length,
      reversals: requested.filter((change, index) => index > 0 && change.direction !== requested[index - 1].direction).length,
      unsafeTransitions: rows.filter((row) => row.unsafeDown).length,
      readinessFailures: changes.filter((change) => change.phase === 'failed').length,
      attempts: journeys.length, uninterrupted: journeys.length - interrupted - unknown, interrupted, unknown,
      maxLatencyMs: latencies.length ? Math.max(...latencies) : null,
      maxQueueRps: queues.length ? Math.max(...queues) : null,
      currentReady: rows.length ? rows.at(-1).ready : 2,
      userOutcome: !journeys.length ? 'NOT_OBSERVED' : interrupted ? 'INTERRUPTED' : unknown ? 'UNKNOWN' : 'UNINTERRUPTED'
    };
  }

  function summarize(state) {
    validateState(state);
    const immediate = laneSummary(state, 'immediate');
    const stabilized = laneSummary(state, 'stabilized');
    let verdict = 'NOT_RUN';
    let message = 'No synthetic client observations yet; configured capacity is not proof.';
    if (stabilized.interrupted || stabilized.readinessFailures) {
      verdict = 'FAIL';
      message = 'Stabilized users or readiness failed. Fewer changes cannot excuse a budget breach or erase earlier failures.';
    } else if (stabilized.unknown || immediate.unknown) {
      verdict = 'UNKNOWN';
      message = 'Missing client or capacity observations remain unknown, including after later recovery.';
    } else if (state.cursor && state.cursor < 10) {
      verdict = 'IN_PROGRESS';
      message = 'Complete all ten shared windows before judging stabilization.';
    } else if (state.cursor === 10) {
      if (stabilized.requestedChanges < immediate.requestedChanges
        && stabilized.unsafeTransitions < immediate.unsafeTransitions) {
        verdict = 'PASS';
        message = 'Synthetic stabilization reduced changes and unsafe removals with all stabilized journeys inside the original budget. Baseline interruptions remain visible.';
      } else {
        verdict = 'NOT_DEMONSTRATED';
        message = 'This trace did not demonstrate both fewer changes and fewer unsafe removals. Healthy clients alone do not prove an improvement.';
      }
    }
    return {
      windows: state.cursor, totalWindows: 10, lanes: { immediate, stabilized },
      verification: { verdict, message }
    };
  }
  return { defaults, initial, reduce, summarize };
}));
