'use strict';

(function expose(root) {
  const LIMITS = Object.freeze({ timeout: 12, readyAfter: 20, archives: 3, runId: 1000 });
  const DEFAULTS = Object.freeze({ timeout: 3, readyAfter: 5, routing: 'intact', receipt: 'success' });
  const routingValues = ['intact', 'drift', 'missing'];
  const receiptValues = ['success', 'failure', 'unknown'];

  function record(value, keys, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Object.getOwnPropertySymbols(value).length
        || Object.getOwnPropertyNames(value).sort().join('|') !== keys.slice().sort().join('|')
        || keys.some((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
        })) {
      throw new TypeError(`${label} must contain exactly ${keys.join(', ')} as plain data.`);
    }
  }

  function integer(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${label} must be a whole number from ${minimum} to ${maximum}.`);
    }
  }

  function list(value, maximum, label) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > maximum || Object.getOwnPropertySymbols(value).length
        || Object.getOwnPropertyNames(value).filter((key) => key !== 'length').join('|')
          !== Array.from({ length: value.length }, (_, index) => String(index)).join('|')) {
      throw new TypeError(`${label} must be a bounded dense array.`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`${label} must contain data, not accessors.`);
      }
    }
  }

  function config(input) {
    record(input, ['timeout', 'readyAfter', 'routing', 'receipt'], 'Configuration');
    integer(input.timeout, 1, LIMITS.timeout, 'Timeout');
    integer(input.readyAfter, 1, LIMITS.readyAfter, 'Readiness delay');
    if (!routingValues.includes(input.routing)) throw new TypeError('Routing witness must be intact, drift or missing.');
    if (!receiptValues.includes(input.receipt)) throw new TypeError('Receipt witness must be success, failure or unknown.');
  }

  function freeze(value) {
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
    }
    return Object.freeze(value);
  }

  function replay(run, archived) {
    list(run.actions, LIMITS.timeout, 'Run actions');
    const commandRouting = { production: 100, candidate: 0 };
    const migrations = { attempted: 0, completed: 0 };
    if (run.config === null) {
      if (archived || run.actions.length) throw new TypeError('An empty run cannot contain actions or be archived.');
      return {
        phase: 'idle', elapsed: 0, reason: 'NOT_STARTED', error: '', verdict: 'unknown',
        userOutcome: 'unverified - no preparation or migration', candidateEligible: false,
        commandRouting, observedRouting: null, migrations, events: [],
        counts: { attempted: 0, successful: 0, interruptions: 0, unknown: 0 },
      };
    }
    config(run.config);
    let phase = 'warming';
    let elapsed = 0;
    let reason = 'WARMING';
    const observedRouting = run.config.routing === 'missing' ? null
      : run.config.routing === 'drift' ? { production: 90, candidate: 10 }
        : { production: 100, candidate: 0 };
    const events = [];
    const observe = (action) => events.push({
      sequence: events.length + 1, action, elapsed, phase, reason,
      commandRouting: { ...commandRouting },
      observedRouting: observedRouting ? { ...observedRouting } : null,
      receipt: run.config.receipt,
    });
    observe('start');
    for (const [index, action] of run.actions.entries()) {
      if (phase !== 'warming') throw new TypeError('Actions after a terminal result are invalid.');
      if (action === 'advance') {
        elapsed += 1;
        // Expiry wins at the exact boundary; readiness must arrive before the deadline.
        if (elapsed >= run.config.timeout) {
          phase = 'aborted';
          reason = 'WARM_UP_TIMEOUT';
        } else if (elapsed >= run.config.readyAfter) {
          phase = 'ready';
          reason = 'READY_BEFORE_DEADLINE';
        }
      } else if (action === 'abort' || action === 'archive-abort') {
        if (action === 'archive-abort' && (!archived || index !== run.actions.length - 1)) {
          throw new TypeError('Reset abort is valid only as the last archived action.');
        }
        phase = 'aborted';
        reason = action === 'abort' ? 'OPERATOR_ABORT' : 'RESET_ABORT';
      } else {
        throw new TypeError('Unknown preparation action.');
      }
      observe(action);
    }
    if (archived && phase === 'warming') throw new TypeError('Archive must explicitly terminate preparation.');
    const counts = {
      attempted: events.length,
      successful: events.filter((event) => event.receipt === 'success').length,
      interruptions: events.filter((event) => event.receipt === 'failure').length,
      unknown: events.filter((event) => event.receipt === 'unknown').length,
    };
    const failed = run.config.routing === 'drift' || counts.interruptions > 0;
    const missing = run.config.routing === 'missing' || counts.unknown > 0;
    const verdict = failed ? 'failure' : missing || phase === 'warming' ? 'unknown' : 'success';
    const userOutcome = counts.interruptions ? 'interrupted production journey observed'
      : run.config.routing === 'drift' ? 'unverified - routing continuity failed'
        : missing ? 'unverified - continuity evidence missing'
          : phase === 'aborted' ? 'safe abort before exposure'
            : phase === 'ready' ? 'unverified - preparation only, no migration'
              : 'unverified - preparation in progress';
    return {
      phase, elapsed, reason, verdict, userOutcome, counts, commandRouting, observedRouting, migrations, events,
      candidateEligible: phase === 'ready' && verdict === 'success',
      error: phase === 'aborted' ? `${reason}: preparation stopped at ${elapsed}s; candidate remains ineligible.` : '',
    };
  }

  function validate(state) {
    record(state, ['version', 'runId', 'current', 'history', 'evicted'], 'State');
    if (state.version !== 1) throw new TypeError('Unsupported state version.');
    integer(state.runId, 1, LIMITS.runId, 'Run identifier');
    list(state.history, LIMITS.archives, 'History');
    if (state.history.length !== Math.min(state.runId - 1, LIMITS.archives)
        || state.evicted !== Math.max(0, state.runId - 1 - LIMITS.archives)) {
      throw new TypeError('History and eviction counts must match the run sequence.');
    }
    record(state.current, ['config', 'actions'], 'Current run');
    const current = replay(state.current, false);
    const history = state.history.map((run, index) => {
      record(run, ['runId', 'config', 'actions'], 'Archived run');
      if (run.runId !== state.runId - state.history.length + index) {
        throw new TypeError('Archived run identifiers must be contiguous.');
      }
      return { runId: run.runId, config: { ...run.config }, actions: [...run.actions], ...replay(run, true) };
    });
    return { current, history };
  }

  const copy = (value) => JSON.parse(JSON.stringify(value));

  function create() {
    return freeze({ version: 1, runId: 1, current: { config: null, actions: [] }, history: [], evicted: 0 });
  }

  function start(state, input) {
    validate(state);
    if (state.current.config !== null) throw new Error('Archive and reset before starting another run.');
    config(input);
    const next = copy(state);
    next.current.config = { ...input };
    return freeze(next);
  }

  function action(state, name) {
    const { current } = validate(state);
    if (current.phase !== 'warming') throw new Error('This action requires an actively warming run.');
    const next = copy(state);
    next.current.actions.push(name);
    return freeze(next);
  }

  const advance = (state) => action(state, 'advance');
  const abort = (state) => action(state, 'abort');

  function archiveReset(state) {
    const { current } = validate(state);
    if (current.phase === 'idle') return state;
    if (state.runId === LIMITS.runId) throw new RangeError('Run limit reached. Reload explicitly to clear page-memory history.');
    const next = copy(state);
    if (current.phase === 'warming') next.current.actions.push('archive-abort');
    next.history.push({ runId: state.runId, ...next.current });
    if (next.history.length > LIMITS.archives) {
      next.history.shift();
      next.evicted += 1;
    }
    next.runId += 1;
    next.current = { config: null, actions: [] };
    return freeze(next);
  }

  function inspect(state) {
    const { current, history } = validate(state);
    return freeze({
      runId: state.runId, config: state.current.config ? { ...state.current.config } : null,
      actions: [...state.current.actions], ...current, history, evicted: state.evicted,
    });
  }

  const api = Object.freeze({ LIMITS, DEFAULTS, create, start, advance, abort, archiveReset, inspect });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarmupLesson = api;
}(globalThis));
