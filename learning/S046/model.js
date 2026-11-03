(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S046 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    cursor: 'saved', scenario: 'complete', replayPolicy: 'deduplicate',
    reconnectMs: '40', budgetMs: '100',
  });
  const MAX_ATTEMPTS = 8;
  const EVENTS = Object.freeze([
    'evt-amber', 'evt-birch', 'evt-cedar', 'evt-delta', 'evt-elm', 'evt-fir',
  ].map((id, index) => Object.freeze({ id, data: `Synthetic notice ${index + 1}` })));
  const fields = Object.keys(DEFAULTS);
  const choices = {
    cursor: ['saved', 'stale', 'tail'],
    scenario: ['complete', 'expired', 'duplicate', 'reordered', 'partial', 'rejected'],
    replayPolicy: ['deduplicate', 'render-all'],
  };
  const labels = {
    cursor: 'Resume cursor', scenario: 'Stream condition', replayPolicy: 'Replay handling',
    reconnectMs: 'Reconnect delay', budgetMs: 'Original budget',
  };
  const states = new WeakSet();

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function inputError(field, message) {
    const error = new Error(message);
    error.name = 'InputError';
    error.field = field;
    throw error;
  }

  function validateInput(raw) {
    if (!raw || Object.getPrototypeOf(raw) !== Object.prototype
        || Reflect.ownKeys(raw).length !== fields.length
        || fields.some((field) => !Object.hasOwn(raw, field))) {
      inputError(null, 'Provide exactly the five declared configuration fields.');
    }
    const result = {};
    for (const field of fields) {
      const property = Object.getOwnPropertyDescriptor(raw, field);
      if (!Object.hasOwn(property, 'value') || typeof property.value !== 'string') {
        inputError(field, `${labels[field]}: use a declared text value, not a coerced value.`);
      }
      const value = property.value;
      if (choices[field]) {
        if (!choices[field].includes(value)) inputError(field, `${labels[field]}: choose a declared option.`);
        result[field] = value;
      } else {
        const minimum = field === 'budgetMs' ? 1 : 0;
        if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) < minimum || Number(value) > 2000) {
          inputError(field, `${labels[field]}: enter a whole number ${minimum}-2000 without spaces or exponents.`);
        }
        result[field] = Number(value);
      }
    }
    return freeze(result);
  }

  function initialTrace() {
    return EVENTS.slice(0, 3).map((event, index) => ({
      atMs: (index - 2) * 20, kind: 'old-visible-event', detail: `${event.id}: ${event.data}`,
    }));
  }

  function assess(raw) {
    const configuration = validateInput(raw);
    const expectedIds = EVENTS.map((event) => event.id);
    const streamOpen = configuration.scenario !== 'rejected';
    const observationComplete = streamOpen && configuration.scenario !== 'partial';
    const requestCursor = configuration.cursor === 'saved' ? EVENTS[2].id
      : configuration.cursor === 'stale' ? EVENTS[1].id : null;
    let wire = configuration.cursor === 'tail' ? EVENTS.slice(5)
      : EVENTS.slice(configuration.cursor === 'saved' ? 3 : 2);
    if (configuration.scenario === 'expired') wire = wire.filter((event) => expectedIds.indexOf(event.id) >= 4);
    if (configuration.scenario === 'duplicate') {
      const index = wire.findIndex((event) => event.id === EVENTS[3].id);
      if (index !== -1) wire.splice(index + 1, 0, wire[index]);
    }
    if (configuration.scenario === 'reordered') {
      const first = wire.findIndex((event) => event.id === EVENTS[3].id);
      const second = wire.findIndex((event) => event.id === EVENTS[4].id);
      if (first !== -1 && second !== -1) [wire[first], wire[second]] = [wire[second], wire[first]];
    }
    if (configuration.scenario === 'partial') wire = wire.slice(0, -1);
    if (!streamOpen) wire = [];

    const trace = [...initialTrace(), {
      atMs: 0, kind: 'cutover', detail: 'Old stream disconnected after evt-cedar; original clock remains at zero.',
    }, {
      atMs: configuration.reconnectMs, kind: streamOpen ? 'stream-open' : 'stream-rejected',
      detail: `${requestCursor ? `Last-Event-ID: ${requestCursor}` : 'No Last-Event-ID; subscribe at live tail'}. A new connection does not prove continuity.`,
    }];
    const visibleIds = expectedIds.slice(0, 3);
    const seen = new Set(visibleIds);
    let wireReplays = 0;
    let suppressedReplays = 0;
    let firstVisibleGapMs = null;
    for (const [index, event] of wire.entries()) {
      const atMs = configuration.reconnectMs + (index + 1) * 20;
      if (seen.has(event.id)) {
        wireReplays++;
        if (configuration.replayPolicy === 'deduplicate') {
          suppressedReplays++;
          trace.push({ atMs, kind: 'replay-suppressed', detail: `${event.id}: already rendered; no second visible effect.` });
          continue;
        }
      }
      if (firstVisibleGapMs === null && !expectedIds.slice(0, 3).includes(event.id)) firstVisibleGapMs = atMs;
      seen.add(event.id);
      visibleIds.push(event.id);
      trace.push({ atMs, kind: 'new-visible-event', detail: `${event.id}: ${event.data}` });
    }
    const visibleSet = new Set(visibleIds);
    const lastObservedIndex = Math.max(...visibleIds.map((id) => expectedIds.indexOf(id)));
    // A later observed ID proves a hole; an unobserved tail is not a proven loss.
    const missingIds = expectedIds.filter((id, index) =>
      !visibleSet.has(id) && (observationComplete || index <= lastObservedIndex));
    const unobservedIds = expectedIds.filter((id, index) =>
      !visibleSet.has(id) && !observationComplete && index > lastObservedIndex);
    const visibleDuplicates = visibleIds.length - visibleSet.size;
    const inversions = visibleIds.slice(1).filter((id, index) =>
      expectedIds.indexOf(id) < expectedIds.indexOf(visibleIds[index])).length;
    const observedThroughMs = configuration.reconnectMs + wire.length * 20;
    const recoveryMs = observationComplete ? observedThroughMs : null;
    const budgetBreached = observedThroughMs > configuration.budgetMs;
    const checks = [
      {
        id: 'stream-open', status: streamOpen ? 'PASS' : 'FAIL',
        detail: streamOpen ? `New stream opened at ${configuration.reconnectMs} ms; continuity is checked separately.`
          : `New stream rejected at ${configuration.reconnectMs} ms; no successful migration.`,
      },
      {
        id: 'completeness', status: missingIds.length ? 'FAIL' : observationComplete ? 'PASS' : 'UNKNOWN',
        detail: missingIds.length ? `Missing user-visible IDs: ${missingIds.join(', ')}.`
          : observationComplete ? 'All six required user-visible IDs are present.'
            : `Unobserved tail: ${unobservedIds.join(', ') || 'not fully witnessed'}; absence is not success.`,
      },
      {
        id: 'order', status: inversions ? 'FAIL' : observationComplete ? 'PASS' : 'UNKNOWN',
        detail: `${inversions} observed ordering inversion(s); ${observationComplete ? 'complete log inspected' : 'tail remains unverified'}.`,
      },
      {
        id: 'duplicates', status: visibleDuplicates ? 'FAIL' : observationComplete ? 'PASS' : 'UNKNOWN',
        detail: `${visibleDuplicates} duplicate visible event(s); ${wireReplays} wire replay(s), ${suppressedReplays} suppressed.`,
      },
      {
        id: 'original-budget', status: budgetBreached ? 'FAIL' : observationComplete ? 'PASS' : 'UNKNOWN',
        detail: `First new visible gap ${firstVisibleGapMs === null ? 'unobserved' : `${firstVisibleGapMs} ms`}; `
          + `recovery ${recoveryMs === null ? 'unverified' : `${recoveryMs} ms`}; `
          + `observed through ${observedThroughMs} ms / original ${configuration.budgetMs} ms. No clock restart at open.`,
      },
      {
        id: 'observation', status: observationComplete ? 'PASS' : 'UNKNOWN',
        detail: observationComplete ? 'Declared finite six-event fixture fully observed.'
          : 'Final observation is unavailable; this is not a verified complete stream.',
      },
    ];
    const outcome = checks.some((check) => check.status === 'FAIL') ? 'failure'
      : checks.some((check) => check.status === 'UNKNOWN') ? 'unknown' : 'success';
    const impact = {
      success: 'Uninterrupted synthetic transition',
      failure: 'Interrupted synthetic transition',
      unknown: 'Unverified synthetic transition',
    }[outcome];
    return freeze({
      outcome, impact, configuration, requestCursor, streamOpen, observationComplete,
      expectedIds, wireIds: wire.map((event) => event.id), visibleIds, missingIds, unobservedIds,
      wireReplays, suppressedReplays, visibleDuplicates, inversions,
      firstVisibleGapMs, recoveryMs, observedThroughMs, checks, trace,
    });
  }

  function mint(value) {
    freeze(value);
    states.add(value);
    return value;
  }

  function requireState(state, phase, action) {
    if (!state || !states.has(state)) throw new Error('Use an authentic rehearsal state.');
    if (phase && state.phase !== phase) throw new Error(`${action} requires ${phase}; current phase is ${state.phase}.`);
  }

  function create() {
    return mint({ phase: 'idle', input: null, result: null, trace: [], history: [] });
  }

  function start(state, raw) {
    requireState(state, 'idle', 'Start');
    if (state.history.length >= MAX_ATTEMPTS) throw new Error('Eight retained attempts reached; explicitly reset before starting again.');
    validateInput(raw);
    return mint({ ...state, phase: 'streaming', input: { ...raw }, trace: initialTrace() });
  }

  function cutOver(state) {
    requireState(state, 'streaming', 'Cut over');
    return mint({
      ...state, phase: 'disconnected',
      trace: [...state.trace, { atMs: 0, kind: 'cutover', detail: 'Old stream disconnected; retain evt-cedar and the original budget.' }],
    });
  }

  function resume(state) {
    requireState(state, 'disconnected', 'Resume');
    const result = assess(state.input);
    const record = { attempt: state.history.length + 1, result };
    return mint({ ...state, phase: 'complete', result, trace: result.trace, history: [...state.history, record] });
  }

  function another(state) {
    requireState(state, 'complete', 'Another attempt');
    if (state.history.length >= MAX_ATTEMPTS) throw new Error('Eight retained attempts reached; explicit reset is required. No history was removed.');
    return mint({ phase: 'idle', input: null, result: null, trace: [], history: state.history });
  }

  function reset(state) {
    requireState(state);
    return create();
  }

  function totals(state) {
    requireState(state);
    const counts = { attempted: state.history.length, success: 0, failure: 0, unknown: 0 };
    state.history.forEach((record) => counts[record.result.outcome]++);
    return counts;
  }
  return Object.freeze({ DEFAULTS, EVENTS, MAX_ATTEMPTS, validateInput, assess, create, start, cutOver, resume, another, reset, totals });
}));
