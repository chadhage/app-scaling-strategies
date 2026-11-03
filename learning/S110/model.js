(function expose(root) {
  'use strict';

  const LIMITS = Object.freeze({ maxRuns: 6, maxEvents: 24, requiredSamples: 3, latencyBudgetMs: 120 });
  const sample = (pop, cohort, effectiveEpoch, effectiveOrigin, response, latencyMs) =>
    ({ pop, cohort, effectiveEpoch, effectiveOrigin, response, latencyMs });
  const goodSamples = () => [
    sample('POP Amber', 'returning browsers', 2, 'origin-v2', 200, 85),
    sample('POP Birch', 'new browsers', 2, 'origin-v2', 200, 100),
    sample('POP Cedar', 'API cohort', 2, 'origin-v2', 200, 95),
  ];
  const fixtures = {
    converged: { label: 'Observed propagation + zero old work', samples: goodSamples(), oldWork: 0 },
    partial: {
      label: 'One POP still routes to the old origin',
      samples: [
        sample('POP Amber', 'returning browsers', 2, 'origin-v2', 200, 85),
        sample('POP Birch', 'new browsers', 1, 'origin-v1', 200, 70),
        sample('POP Cedar', 'API cohort', 2, 'origin-v2', 200, 95),
      ],
      oldWork: 1,
    },
    missing: {
      label: 'Missing required POP and old-work observations',
      samples: [
        sample('POP Amber', 'returning browsers', 2, 'origin-v2', 200, 85),
        sample('POP Birch', 'new browsers', 2, 'origin-v2', 200, 100),
        sample('POP Cedar', 'API cohort', null, null, null, null),
      ],
      oldWork: null,
    },
    draining: { label: 'Sampled routes converged, but old work remains', samples: goodSamples(), oldWork: 2 },
    slow: {
      label: 'Converged routes with one latency failure',
      samples: [
        sample('POP Amber', 'returning browsers', 2, 'origin-v2', 200, 85),
        sample('POP Birch', 'new browsers', 2, 'origin-v2', 200, 180),
        sample('POP Cedar', 'API cohort', 2, 'origin-v2', 200, 95),
      ],
      oldWork: 0,
    },
    failed: {
      label: 'Converged routes with one failed request',
      samples: [
        sample('POP Amber', 'returning browsers', 2, 'origin-v2', 200, 85),
        sample('POP Birch', 'new browsers', 2, 'origin-v2', 503, 90),
        sample('POP Cedar', 'API cohort', 2, 'origin-v2', 200, 95),
      ],
      oldWork: 0,
    },
  };
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const FIXTURES = freeze(fixtures);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function objectWithKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype
        || Object.getOwnPropertySymbols(value).length
        || Object.getOwnPropertyNames(value).length !== keys.length
        || keys.some((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
        })) {
      throw new TypeError(`${label} must be a plain data object with exactly: ${keys.join(', ')}.`);
    }
  }

  function safeData(value, ancestors = new Set(), depth = 0) {
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string' && value.length <= 500) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object' || depth > 16 || ancestors.has(value)
        || Object.getOwnPropertySymbols(value).length) throw new TypeError('State must contain bounded, acyclic data.');
    const keys = Object.getOwnPropertyNames(value);
    if (Array.isArray(value)) {
      if (value.length > LIMITS.maxEvents || keys.length !== value.length + 1
          || keys.some((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))) {
        throw new TypeError('State arrays must be dense and bounded without extra fields.');
      }
    } else if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError('State objects must be plain data.');
    }
    ancestors.add(value);
    for (const key of keys.filter((key) => key !== 'length' || !Array.isArray(value))) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('State accessors and hidden fields are unsupported.');
      }
      safeData(descriptor.value, ancestors, depth + 1);
    }
    ancestors.delete(value);
  }

  function validateCommand(command) {
    const descriptor = command && Object.getOwnPropertyDescriptor(command, 'type');
    const type = descriptor && descriptor.value;
    if (type === 'propagate') {
      objectWithKeys(command, ['type', 'fixture'], 'Propagation command');
      if (typeof command.fixture !== 'string' || !Object.hasOwn(FIXTURES, command.fixture)) {
        throw new TypeError('Choose one of the six fixed fictional traces.');
      }
    } else if (type === 'sample' || type === 'check') {
      objectWithKeys(command, ['type'], 'Operator command');
    } else {
      throw new TypeError('Unknown operator command; use propagate, sample or check.');
    }
  }

  function createState() {
    return { version: 1, runs: 0, active: null, history: [] };
  }

  function measure(samples, oldWork) {
    const metrics = {
      attempted: LIMITS.requiredSamples, observed: 0, successful: 0,
      interrupted: 0, unknown: 0, pending: 0, migrated: 0,
    };
    for (const item of samples) {
      if ([item.effectiveEpoch, item.effectiveOrigin, item.response, item.latencyMs].includes(null)) {
        metrics.unknown++;
        continue;
      }
      metrics.observed++;
      if (item.response === 200 && item.latencyMs <= LIMITS.latencyBudgetMs) metrics.successful++;
      else metrics.interrupted++;
      if (item.effectiveEpoch === 2 && item.effectiveOrigin === 'origin-v2') metrics.migrated++;
    }
    const stale = samples.some((item) => item.effectiveEpoch !== null
      && (item.effectiveEpoch !== 2 || item.effectiveOrigin !== 'origin-v2'));
    const missingRoute = samples.some((item) => item.effectiveEpoch === null || item.effectiveOrigin === null);
    const gates = {
      propagation: stale ? 'negative' : missingRoute ? 'unknown' : 'positive',
      drain: oldWork === null ? 'unknown' : oldWork === 0 ? 'positive' : 'negative',
      journeys: metrics.interrupted ? 'negative' : metrics.unknown ? 'unknown' : 'positive',
    };
    const result = Object.values(gates).includes('negative') ? 'negative'
      : Object.values(gates).includes('unknown') ? 'unknown' : 'positive';
    return { metrics, gates, result };
  }

  function transition(state, command) {
    validateCommand(command);
    if (state.history.length >= LIMITS.maxEvents) throw new RangeError('The 24-event limit is reached. Reset explicitly.');
    const next = clone(state);
    if (command.type === 'propagate') {
      if (next.active && next.active.phase !== 'complete') throw new Error('Complete the current sampled retirement check first.');
      if (next.runs >= LIMITS.maxRuns) throw new RangeError('The six-run limit is reached. Reset explicitly.');
      next.runs++;
      next.active = {
        run: next.runs, fixture: command.fixture, phase: 'changed',
        desiredEpoch: 2, desiredPercent: 100, desiredOrigin: 'origin-v2',
        oldOrigin: 'retained', samples: [], oldWork: null,
        metrics: { attempted: 0, observed: 0, successful: 0, interrupted: 0, unknown: 0, pending: 3, migrated: 0 },
        gates: { propagation: 'unknown', drain: 'unknown', journeys: 'unknown' },
        checkedWithoutSamples: false, decision: 'not-checked', result: 'unknown',
        reason: 'Nominal 100% configuration is not observed propagation or drain evidence. Retain the old origin.',
      };
    } else if (command.type === 'sample') {
      if (!next.active || next.active.phase !== 'changed') throw new Error('Sample once, after rehearsing a change.');
      const fixture = FIXTURES[next.active.fixture];
      Object.assign(next.active, {
        phase: 'sampled', samples: clone(fixture.samples), oldWork: fixture.oldWork,
        decision: 'not-checked', ...measure(fixture.samples, fixture.oldWork),
        reason: 'These are the three required authored samples, not every real edge. Check retirement separately.',
      });
    } else {
      if (!next.active || next.active.phase === 'complete') throw new Error('Rehearse a change before checking retirement.');
      if (next.active.phase === 'changed') {
        if (next.active.checkedWithoutSamples) throw new Error('This nominal-only check is already recorded. Sample next.');
        next.active.checkedWithoutSamples = true;
        next.active.decision = 'unverified';
        next.active.reason = 'UNVERIFIED: desired configuration alone cannot retire an old origin. Required observations are pending.';
      } else {
        next.active.phase = 'complete';
        if (next.active.result === 'positive') {
          next.active.oldOrigin = 'retired';
          next.active.decision = 'retired';
          next.active.reason = 'POSITIVE within this fixture: required observed routes, zero old work and journey budgets pass. Fictional retirement only.';
        } else if (next.active.result === 'negative') {
          next.active.decision = 'blocked';
          next.active.reason = 'NEGATIVE: at least one observed gate fails. Retain the old origin; failures stay recorded.';
        } else {
          next.active.decision = 'unverified';
          next.active.reason = 'UNVERIFIED: a required observation is missing. Missing work is not zero work. Retain the old origin.';
        }
      }
    }
    next.history.push({ seq: next.history.length + 1, command: clone(command), snapshot: clone(next.active) });
    return next;
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function validateState(state) {
    objectWithKeys(state, ['version', 'runs', 'active', 'history'], 'Lesson state');
    safeData(state);
    if (state.version !== 1 || !Number.isInteger(state.runs) || state.runs < 0 || state.runs > LIMITS.maxRuns
        || !Array.isArray(state.history) || state.history.length > LIMITS.maxEvents) {
      throw new TypeError('Invalid lesson version, run count or history.');
    }
    let replay = createState();
    for (const event of state.history) {
      objectWithKeys(event, ['seq', 'command', 'snapshot'], 'History event');
      replay = transition(replay, event.command);
    }
    if (canonical(replay) !== canonical(state)) throw new TypeError('State or retained history does not match the deterministic command replay.');
  }

  function apply(state, command) {
    validateState(state);
    return transition(state, command);
  }

  const api = Object.freeze({ createState, apply, FIXTURES, LIMITS });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EdgePropagationLesson = api;
}(typeof globalThis === 'object' ? globalThis : this));
