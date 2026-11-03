(function (root, factory) {
  'use strict';
  const fixtures = typeof module === 'object' && module.exports
    ? require('./fixtures.js') : root.S060Fixtures;
  const model = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.S060Model = model;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const MAX_HISTORY = fixtures.maxHistory;
  const authentic = new WeakSet();
  const freeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const seal = (state) => {
    freeze(state);
    authentic.add(state);
    return state;
  };
  function requireState(state) {
    if (!authentic.has(state)) throw new TypeError('Expected an authentic S060 model state.');
  }
  function validateAction(action) {
    if (!action || Object.getPrototypeOf(action) !== Object.prototype) {
      throw new TypeError('Invalid action: expected a plain object.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(action);
    if (Reflect.ownKeys(action).some((key) => typeof key !== 'string'
        || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) {
      throw new TypeError('Invalid action: only enumerable data fields are supported.');
    }
    const fields = {
      evolve: ['type', 'mode'], recover: ['type', 'path', 'observation'], reset: ['type'],
    };
    const expected = Object.hasOwn(fields, action.type) ? fields[action.type] : null;
    if (!expected || Object.keys(action).length !== expected.length
        || !expected.every((key) => Object.hasOwn(action, key))) {
      throw new TypeError('Invalid action: unsupported type or fields.');
    }
    const oneOf = (name, values) => {
      if (!values.includes(action[name])) throw new RangeError(`${name}: unsupported value.`);
    };
    if (action.type === 'evolve') oneOf('mode', ['compatible', 'irreversible']);
    if (action.type === 'recover') {
      oneOf('path', ['rollback', 'forward']);
      oneOf('observation', ['complete', 'missing-row', 'unavailable']);
    }
  }
  function createState() {
    return seal({ phase: 'ready', mode: null, activeVersion: 'v1', schema: 'v1',
      committed: fixtures.baseline, history: [], result: null });
  }
  function readRows(state) {
    return state.committed.map((row) => ({
      id: row.id,
      currency: Object.hasOwn(row, 'totalCents') ? 'USD' : row.currency,
      minorUnits: Object.hasOwn(row, 'totalCents') ? row.totalCents : row.minorUnits,
    }));
  }
  function totals(rows) {
    return rows.reduce((result, row) => {
      result[row.currency] = (result[row.currency] || 0) + row.minorUnits;
      return result;
    }, {});
  }
  function recovery(state, action) {
    const blocked = state.mode === 'irreversible' && action.path === 'rollback';
    const version = blocked ? 'v2' : action.path === 'rollback' ? 'v1' : 'v2.1';
    const expectedIds = state.committed.map((row) => row.id);
    const expectedTotals = fixtures.expected[state.mode];
    let rows = null;
    if (!blocked && action.observation !== 'unavailable') {
      rows = readRows(state);
      if (action.observation === 'missing-row') rows = rows.slice(0, -1);
    }
    const observedIds = rows ? rows.map((row) => row.id) : null;
    const observedTotals = rows ? totals(rows) : null;
    const latencyMs = rows ? 7 : null;
    const dataPreserved = state.committed === fixtures[state.mode];
    const correct = rows && dataPreserved
      && JSON.stringify(observedIds) === JSON.stringify(expectedIds)
      && JSON.stringify(observedTotals) === JSON.stringify(expectedTotals)
      && latencyMs <= fixtures.budgetMs;
    const outcome = blocked ? 'safe-abort' : !rows ? 'unknown' : correct ? 'success' : 'failure';
    const reasons = {
      'safe-abort': 'Unsafe reversal rejected: v1 requires totalCents and USD-only values; v2-only records include EUR. Choose explicit forward recovery.',
      unknown: 'Observation unavailable: the attempted recovery remains unverified and stays in the denominator.',
      failure: 'Synthetic interrupted journey: missing a committed row in the read result. Durable records are unchanged; recovery did not hide the failure.',
      success: action.path === 'rollback'
        ? 'Compatible application rollback: v1 reads all committed IDs and totals; the expanded schema stays in place. No down migration.'
        : 'Explicit forward recovery: v2.1 reads all committed IDs and currency totals without reversing the v2-only data contract.',
    };
    const result = {
      sequence: state.history.length + 1, mode: state.mode, path: action.path,
      observation: action.observation, outcome, attempted: !blocked, activeVersion: version,
      schema: state.schema, expectedIds, expectedTotals, observedIds, observedTotals,
      latencyMs, budgetMs: fixtures.budgetMs, dataPreserved, reason: reasons[outcome],
    };
    return seal({ ...state, phase: blocked ? 'evolved' : 'recovered', activeVersion: version,
      history: [...state.history, result], result });
  }
  function transition(state, action) {
    requireState(state);
    validateAction(action);
    if (action.type === 'reset') {
      return seal({ phase: 'ready', mode: null, activeVersion: 'v1', schema: 'v1',
        committed: fixtures.baseline, history: state.history, result: null });
    }
    if (state.history.length >= MAX_HISTORY) {
      throw new RangeError(`History limit: ${MAX_HISTORY} retained decisions. Reload for a new, empty workbook.`);
    }
    if (action.type === 'evolve') {
      if (state.phase !== 'ready') throw new RangeError('Schema evolution requires ready state; reset the rehearsal first.');
      return seal({ ...state, phase: 'evolved', mode: action.mode, activeVersion: 'v2',
        schema: action.mode === 'compatible' ? 'expanded' : 'v2-only',
        committed: fixtures[action.mode], result: null });
    }
    if (state.phase !== 'evolved') throw new RangeError('Recovery requires evolved state; evolve and commit the v2 fixture first.');
    return recovery(state, action);
  }
  function summarize(state) {
    requireState(state);
    const count = (outcome) => state.history.filter((entry) => entry.outcome === outcome).length;
    const attempted = state.history.filter((entry) => entry.attempted).length;
    const success = count('success');
    return freeze({
      attempted, success, failure: count('failure'), unknown: count('unknown'),
      safeAborts: count('safe-abort'), successFraction: attempted ? `${success}/${attempted}` : null,
    });
  }
  return Object.freeze({ BANNER, MAX_HISTORY, createState, transition, summarize });
}));
