(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LongWork = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_INPUT = Object.freeze({
    mode: 'drain',
    condition: 'normal',
    budgetMs: 18000,
    drainMs: 8000,
    hostLimitMs: 16000,
  });
  const OPERATION_ID = 'synthetic-operation-042';
  const MAX_RUNS = 6;
  const MODES = Object.freeze(['drain', 'durable']);
  const CONDITIONS = Object.freeze(['normal', 'forced-stop', 'delayed-retry', 'missing-proof']);
  const OUTCOMES = Object.freeze(['completed', 'interrupted', 'unknown']);
  const sessions = new WeakSet();

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function keysMatch(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype
      && Reflect.ownKeys(value).length === keys.length
      && keys.every((key) => Object.hasOwn(value, key));
  }

  function invalid(message, field) {
    const error = new TypeError(message);
    error.field = field || '';
    throw error;
  }

  function validateInput(input) {
    if (!keysMatch(input, Object.keys(DEFAULT_INPUT))) {
      invalid('Use exactly the five declared controls; no missing or extra fields.');
    }
    if (!MODES.includes(input.mode)) invalid('Mode must be drain or durable.', 'mode');
    if (!CONDITIONS.includes(input.condition)) invalid('Choose a declared synthetic condition.', 'condition');
    for (const [field, minimum, maximum] of [
      ['budgetMs', 1, 60000], ['drainMs', 0, 12000], ['hostLimitMs', 1, 30000],
    ]) {
      if (typeof input[field] !== 'number' || !Number.isSafeInteger(input[field])
          || Object.is(input[field], -0) || input[field] < minimum || input[field] > maximum) {
        invalid(`${field} must be an integer from ${minimum} to ${maximum} ms.`, field);
      }
    }
    return { ...input };
  }

  function rehearse(rawInput) {
    const input = validateInput(rawInput);
    const trace = [];
    const checks = [];
    const note = (atMs, text) => trace.push({
      atMs, operationId: OPERATION_ID, originalDeadlineMs: input.budgetMs, text,
    });
    const check = (id, verdict, detail) => checks.push({ id, verdict, detail });
    let elapsedMs;
    let retryElapsedMs = null;
    let completedUnits = null;
    let persistedUnits = 0;
    let responseObserved = false;
    let activeWorkInterrupted = false;

    note(0, `Admitted ${OPERATION_ID}: 12 units; original deadline ${input.budgetMs} ms from start 0.`);

    if (input.mode === 'drain') {
      const forcedAt = ['forced-stop', 'delayed-retry'].includes(input.condition) ? 6000 : Infinity;
      const stopAt = Math.min(input.hostLimitMs, 4000 + input.drainMs, forcedAt);
      if (stopAt >= 4000) note(4000, 'Stop new v1 admission; the old HTTP operation stays on v1.');
      check('host-limit', input.hostLimitMs >= 12000 ? 'pass' : 'fail',
        `HTTP requires 12000 ms; declared per-request host limit is ${input.hostLimitMs} ms.`);
      check('drain-or-checkpoint', input.drainMs >= 8000 ? 'pass' : 'fail',
        `8000 ms remains at cutover; declared drain window is ${input.drainMs} ms.`);
      if (12000 <= stopAt) {
        elapsedMs = 12000;
        responseObserved = true;
        note(elapsedMs, 'The same v1 HTTP operation returns its completion envelope before retirement.');
      } else {
        elapsedMs = stopAt;
        activeWorkInterrupted = true;
        note(stopAt, 'Active old HTTP work terminates at the first forced, host or drain boundary.');
      }
      if (input.condition === 'delayed-retry') {
        const retryAt = 8000;
        retryElapsedMs = Math.min(12000, input.hostLimitMs);
        elapsedMs = retryAt + retryElapsedMs;
        responseObserved = input.hostLimitMs >= 12000;
        note(retryAt, `Retry the same operation on v2; carry deadline ${input.budgetMs} ms, never restart it.`);
        note(elapsedMs, responseObserved
          ? 'Retry completion envelope arrives; the earlier HTTP interruption remains recorded.'
          : 'Retry also reaches its per-request host limit without completion.');
      }
    } else {
      check('host-limit', input.hostLimitMs >= 4000 ? 'pass' : 'fail',
        `Checkpoint and HTTP acceptance need 4000 ms; declared HTTP limit is ${input.hostLimitMs} ms.`);
      if (input.hostLimitMs < 4000) {
        elapsedMs = input.hostLimitMs;
        activeWorkInterrupted = true;
        check('drain-or-checkpoint', 'fail', 'The host stops before a durable handoff is established.');
        note(elapsedMs, 'HTTP terminates before durable acceptance; no checkpoint or continuation is assumed.');
      } else {
        persistedUnits = 4;
        check('drain-or-checkpoint', 'pass',
          '4 units, operation ID and original deadline persist before retirement; HTTP drain is not used.');
        note(4000, 'Persist 4 units and the original operation/deadline. HTTP 202 is acceptance, not completion.');
        note(5000, 'Retire the old HTTP host after durable acceptance; no active operation remains there.');
        const resumeAt = input.condition === 'delayed-retry' ? 14000 : 6000;
        note(resumeAt, `Successor resumes the same operation from unit 4; deadline remains ${input.budgetMs} ms.`);
        if (input.condition === 'forced-stop') {
          elapsedMs = 8000;
          activeWorkInterrupted = true;
          note(elapsedMs, 'Force-stop the active successor. Only 4 checkpointed units remain proved; no further recovery is demonstrated.');
        } else {
          elapsedMs = resumeAt + 8000;
          responseObserved = true;
          if (input.condition === 'delayed-retry') retryElapsedMs = 8000;
          note(elapsedMs, 'Successor completion envelope arrives after the remaining 8 units.');
        }
      }
    }

    check('active-work', activeWorkInterrupted ? 'fail' : 'pass',
      activeWorkInterrupted
        ? 'An active request or worker was terminated. A later receipt cannot erase that interruption.'
        : 'No active work is discarded in this synthetic trace.');
    if (responseObserved && input.condition !== 'missing-proof') {
      completedUnits = 12;
      check('result-proof', 'pass', 'Receipt proves the same operation ID and all 12 ordered work units.');
      note(elapsedMs, 'Synthetic receipt validates operation identity and exactly 12 of 12 work units.');
    } else {
      check('result-proof', 'unknown', responseObserved
        ? 'Envelope timing is known, but result identity and work-unit proof are missing.'
        : 'No completed-operation receipt is available.');
      if (responseObserved) note(elapsedMs, 'Envelope has no operation/result proof. Correct completion remains unknown.');
    }
    // A known interruption takes precedence without turning other unknown checks into passes.
    const budgetVerdict = elapsedMs > input.budgetMs ? 'fail' : responseObserved ? 'pass' : 'unknown';
    check('original-budget', budgetVerdict,
      `${elapsedMs} ms elapsed from original start 0; deadline stays ${input.budgetMs} ms, including retries.`);
    if (input.budgetMs < elapsedMs) {
      note(input.budgetMs, 'Original user deadline expires before the observed completion/termination; retry clocks do not replace it.');
    }
    trace.sort((left, right) => left.atMs - right.atMs);
    const status = checks.some((item) => item.verdict === 'fail') ? 'interrupted'
      : checks.some((item) => item.verdict === 'unknown') ? 'unknown' : 'completed';
    return freeze({
      input, operationId: OPERATION_ID, originalStartMs: 0, originalDeadlineMs: input.budgetMs,
      elapsedMs, retryElapsedMs, completedUnits, persistedUnits, requiredUnits: 12,
      remainingFromCheckpoint: 12 - persistedUnits, status, checks, trace,
      nativeResult: 'unknown',
    });
  }

  function makeSession(phase, history, activeId, error, errorField) {
    const state = freeze({
      phase, history, activeId, error: error || '', errorField: errorField || '',
    });
    sessions.add(state);
    return state;
  }

  function createSession() {
    return makeSession('ready', [], null);
  }

  function rejected(state, message, field) {
    return makeSession('error', state.history, null, message, field);
  }

  function dispatch(state, action) {
    if (!sessions.has(state)) invalid('Unrecognized or forged session; create a fresh session.');
    if (!action || typeof action.type !== 'string') invalid('A declared action is required.');
    const keys = action.type === 'RUN' ? ['type', 'input']
      : action.type === 'CHECK' ? ['type', 'prediction'] : ['type'];
    if (!keysMatch(action, keys)) invalid('Action fields must match its declared contract.');
    if (action.type === 'RESET') return createSession();
    if (action.type === 'EDIT') return makeSession('ready', state.history, null);
    if (action.type === 'RUN') {
      if (state.history.length >= MAX_RUNS) {
        return rejected(state, 'Six runs are retained. Reset explicitly before starting another run.');
      }
      let result;
      try {
        result = rehearse(action.input);
      } catch (error) {
        return rejected(state, error.message, error.field);
      }
      const record = { id: state.history.length + 1, result, verification: null };
      return makeSession('observed', [...state.history, record], record.id);
    }
    if (action.type === 'CHECK') {
      if (state.phase !== 'observed' || state.activeId === null) {
        return rejected(state, 'Run once before checking; a run can be checked only once.');
      }
      if (!OUTCOMES.includes(action.prediction)) return rejected(state, 'Choose a declared prediction.');
      const history = state.history.map((record) => record.id !== state.activeId ? record : {
        ...record,
        verification: {
          prediction: action.prediction,
          verdict: action.prediction === record.result.status ? 'pass' : 'fail',
        },
      });
      return makeSession('checked', history, state.activeId);
    }
    invalid('Unknown action; no state was changed.');
  }

  return Object.freeze({
    DEFAULT_INPUT, OPERATION_ID, MAX_RUNS, MODES, CONDITIONS, OUTCOMES,
    rehearse, createSession, dispatch,
  });
}));
