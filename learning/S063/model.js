(function expose(root) {
  'use strict';

  const MAX_RUNS = 6;
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const DEFAULTS = freeze({
    path: 'in-place',
    fixture: 'bounded-resize',
    readiness: 'ready',
    transaction: 'recovered',
    observation: 'complete',
    reconnectBudgetMs: 600,
    recoveryBudgetMs: 800,
  });
  const FIXTURES = freeze({
    'bounded-resize': { label: 'Bounded resize + supported parallel path', inPlace: 'supported', parallel: 'supported' },
    'restart-required': { label: 'Restart-required resize + supported parallel path', inPlace: 'not-online', parallel: 'supported' },
    'parallel-unavailable': { label: 'Bounded resize; parallel path unsupported', inPlace: 'supported', parallel: 'unsupported' },
    unverified: { label: 'Neither path qualified', inPlace: 'unverified', parallel: 'unverified' },
  });
  const OPTIONS = freeze({
    path: ['in-place', 'parallel-failover'],
    fixture: Object.keys(FIXTURES),
    readiness: ['ready', 'not-ready', 'unknown'],
    transaction: ['recovered', 'failed', 'unresolved'],
    observation: ['complete', 'missing'],
  });
  const NATIVE_LIMIT = 'UNKNOWN: no native platform, SKU, region or database operation was examined.';
  const plain = (value) => value !== null && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype;
  const dataProperty = (value, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  };
  const exactKeys = (value, keys) => plain(value)
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => dataProperty(value, key));
  const plainArray = (value) => Array.isArray(value)
    && Object.getPrototypeOf(value) === Array.prototype
    && Reflect.ownKeys(value).length === value.length + 1
    && Array.from({ length: value.length }, (_, index) => dataProperty(value, String(index))).every(Boolean);
  function sameData(actual, expected) {
    if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
    if (Array.isArray(expected)) {
      return Array.isArray(actual) && actual.length === expected.length && plainArray(actual)
        && expected.every((value, index) => sameData(actual[index], value));
    }
    return exactKeys(actual, Object.keys(expected))
      && Object.entries(expected).every(([key, value]) => sameData(actual[key], value));
  }
  function invalid(message, field, code = 'INVALID_INPUT') {
    const error = new Error(message);
    error.name = 'LessonError';
    error.code = code;
    error.field = field;
    throw error;
  }
  function validateInput(input) {
    if (!exactKeys(input, Object.keys(DEFAULTS))) invalid('Supply exactly the seven declared controls.', 'path');
    const clean = {};
    for (const [field, values] of Object.entries(OPTIONS)) {
      if (typeof input[field] !== 'string' || !values.includes(input[field])) {
        invalid(`Choose a declared ${field} value.`, field);
      }
      clean[field] = input[field];
    }
    for (const field of ['reconnectBudgetMs', 'recoveryBudgetMs']) {
      if (!Number.isSafeInteger(input[field]) || Object.is(input[field], -0)
          || input[field] < 0 || input[field] > 5000) {
        invalid('Budgets must be whole milliseconds from 0 to 5000.', field);
      }
      clean[field] = input[field];
    }
    return freeze(clean);
  }
  function transactions(outcome, attempted) {
    const rows = attempted ? [
      { id: 'tx-before', outcome: 'committed', effects: 1 },
      { id: 'tx-in-flight', outcome: outcome === 'recovered' ? 'recovered' : outcome, effects: outcome === 'recovered' ? 1 : outcome === 'failed' ? 0 : null },
      { id: 'tx-after', outcome: 'committed', effects: 1 },
    ] : [];
    return {
      population: 3, started: attempted ? 3 : 0,
      completed: rows.filter((row) => ['committed', 'recovered'].includes(row.outcome)).length,
      failed: rows.filter((row) => row.outcome === 'failed').length,
      unknown: rows.filter((row) => row.outcome === 'unresolved').length,
      notRun: attempted ? 0 : 3, rows,
    };
  }
  function evaluatePath(path, input) {
    const fixture = FIXTURES[input.fixture];
    const capability = path === 'in-place' ? fixture.inPlace : fixture.parallel;
    const operationClass = {
      supported: 'SYNTHETIC SUPPORTED', 'not-online': 'NOT ONLINE',
      unsupported: 'UNSUPPORTED', unverified: 'UNVERIFIED',
    }[capability];
    const checks = [];
    const check = (id, verdict, detail) => checks.push({ id, verdict, detail });
    const capabilityVerdict = capability === 'supported' ? 'PASSED'
      : capability === 'unverified' ? 'UNKNOWN' : 'FAILED';
    check('capability', capabilityVerdict, `${operationClass}: fixed fixture only, not a native support claim.`);
    const readiness = path === 'in-place' || input.readiness === 'ready' ? 'PASSED'
      : input.readiness === 'unknown' ? 'UNKNOWN' : 'FAILED';
    check('readiness', readiness, path === 'in-place' ? 'Parallel readiness does not apply to in-place resize.'
      : input.readiness === 'ready' ? 'Synthetic parallel capacity is synchronized and ready.'
        : input.readiness === 'unknown' ? 'Parallel synchronization/readiness is unobserved.'
          : 'Parallel capacity is not synchronized: handoff blocked.');
    const attempted = ['supported', 'not-online'].includes(capability) && readiness === 'PASSED';
    const measured = attempted && input.observation === 'complete';
    const times = capability === 'not-online' ? [2400, 3100]
      : path === 'in-place' ? [420, 560] : [180, 320];
    const reconnectMs = measured ? times[0] : null;
    const recoveryMs = measured ? times[1] : null;
    for (const [id, value, budget] of [
      ['reconnect', reconnectMs, input.reconnectBudgetMs],
      ['transaction-recovery', recoveryMs, input.recoveryBudgetMs],
    ]) {
      check(id, value === null ? 'UNKNOWN' : value <= budget ? 'PASSED' : 'FAILED',
        value === null ? `${id}: not observed; budget ${budget} ms.`
          : `${id}: ${value} ms / budget ${budget} ms.`);
    }
    const tx = transactions(input.transaction, attempted);
    check('transaction-outcomes', !attempted || tx.unknown > 0 ? 'UNKNOWN' : tx.failed > 0 ? 'FAILED' : 'PASSED',
      !attempted ? 'No transition attempted; all three transactions are not run, not successful.'
        : `${tx.completed}/${tx.started} completed; ${tx.failed} failed; ${tx.unknown} unresolved. Unknowns stay in the started denominator.`);
    const verdict = checks.some((item) => item.verdict === 'FAILED') ? 'FAILED'
      : checks.some((item) => item.verdict === 'UNKNOWN') ? 'UNKNOWN' : 'PASSED';
    const userImpact = !attempted ? 'Transition blocked; no transition-user observations are claimed.'
      : capability === 'not-online' ? 'Disruptive restart fixture: eventual recovery cannot establish an online operation.'
        : verdict === 'FAILED' ? 'Modeled users exceed a budget or have a failed transaction.'
          : verdict === 'UNKNOWN' ? 'Modeled continuity is unproven; missing evidence is not success.'
            : 'All three modeled transactions recover inside the declared budgets; not zero physical delay.';
    return {
      path, operationClass, attempted, reconnectMs, recoveryMs, transactions: tx,
      verdict, checks, userImpact, nativeQualification: NATIVE_LIMIT,
      trace: [
        `Fixture ${input.fixture}; ${path}; ${operationClass}.`,
        checks[1].detail,
        checks[2].detail,
        checks[3].detail,
        checks[4].detail,
        `${verdict}. ${userImpact}`,
      ],
    };
  }
  function evaluate(input) {
    const clean = validateInput(input);
    const comparison = OPTIONS.path.map((path) => evaluatePath(path, clean));
    return freeze({ input: clean, selected: comparison.find((item) => item.path === clean.path), comparison });
  }
  function createState() {
    return freeze({ schemaVersion: 1, history: [] });
  }
  function validateState(state) {
    if (!exactKeys(state, ['schemaVersion', 'history']) || state.schemaVersion !== 1
        || !Array.isArray(state.history) || state.history.length > MAX_RUNS || !plainArray(state.history)) {
      invalid('Invalid lesson state; reset the rehearsal.', 'clear-lesson', 'INVALID_STATE');
    }
    for (const [index, entry] of state.history.entries()) {
      if (!exactKeys(entry, ['number', 'result']) || entry.number !== index + 1
          || !exactKeys(entry.result, ['input', 'selected', 'comparison'])) {
        invalid('Invalid retained run; reset the rehearsal.', 'clear-lesson', 'INVALID_STATE');
      }
      let expected;
      try { expected = evaluate(entry.result.input); } catch {
        invalid('Invalid retained input; reset the rehearsal.', 'clear-lesson', 'INVALID_STATE');
      }
      if (!sameData(entry.result, expected)) {
        invalid('Retained results do not match their synthetic inputs.', 'clear-lesson', 'INVALID_STATE');
      }
    }
    return state;
  }
  function run(state, input) {
    validateState(state);
    if (state.history.length >= MAX_RUNS) {
      invalid('Six comparisons retained. Reset explicitly before starting another run.', 'clear-lesson', 'HISTORY_LIMIT');
    }
    const result = evaluate(input);
    return freeze({
      schemaVersion: 1,
      history: [...state.history, { number: state.history.length + 1, result }],
    });
  }
  const api = freeze({ BANNER, DEFAULTS, FIXTURES, OPTIONS, MAX_RUNS, validateInput, evaluate, createState, run });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S063 = api;
}(globalThis));
