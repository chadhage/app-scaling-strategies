(function (root, factory) {
  'use strict';
  const fixtures = typeof module === 'object' && module.exports
    ? require('./fixtures.js') : root.CommitFixtures066;
  const api = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'CommitLesson066', { value: api });
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const copy = (value) => {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    }
    return value;
  };
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function requireArguments(args, count) {
    if (args.length !== count) throw new Error(`Expected exactly ${count} argument(s).`);
  }
  function configuration(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
      throw new Error('Configuration must be an exact plain data object.');
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 2 || !keys.includes('receipt') || !keys.includes('recovery')) {
      throw new Error('Configuration requires only receipt and recovery.');
    }
    const result = {};
    for (const [key, allowed] of [['receipt', fixtures.receipts], ['recovery', fixtures.recoveries]]) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
          || typeof descriptor.value !== 'string' || !allowed.includes(descriptor.value)) {
        throw new Error('Configuration values must be exact enumerable primitive string choices.');
      }
      result[key] = descriptor.value;
    }
    return result;
  }
  const counts = (rows) => rows.reduce((total, row) => {
    total[row.outcome]++;
    return total;
  }, { committed: 0, failed: 0, unresolved: 0 });
  const initial = (history = []) => ({
    phase: 'idle', config: copy(fixtures.defaults), attempt: null, interruptedResponses: 0,
    original: [], result: null, history, trace: [], prediction: null,
  });
  function originalRow(operation, receipt) {
    const knownCommit = receipt === 'committed';
    const knownAbort = receipt === 'aborted';
    return {
      id: operation.id, key: operation.key, payload: operation.payload,
      outcome: knownCommit ? 'committed' : knownAbort ? 'failed' : 'unresolved',
      effectMin: knownCommit ? 1 : 0, effectMax: knownAbort ? 0 : 1,
      evidence: knownCommit ? 'Authoritative durable commit receipt (synthetic fixture).'
        : knownAbort ? 'Authoritative terminal abort receipt; original attempt cannot later commit (fixture assumption).'
          : 'Lookup unavailable; not an abort receipt. Original effect may be zero or one.',
    };
  }
  function recoverRow(original, policy) {
    let addedEffects = 0;
    let submittedKey = null;
    let action = 'Hold; no new submission.';
    if (policy === 'new-key') {
      addedEffects = 1;
      submittedKey = `SYN-RETRY-${original.id}`;
      action = 'Blind fresh-key retry; new receipt confirms one additional effect.';
    } else if (policy === 'same-key') {
      if (original.outcome === 'committed') action = 'Reuse committed receipt; do not reapply.';
      else if (original.outcome === 'failed') {
        addedEffects = 1;
        submittedKey = original.key;
        action = 'Retry terminal abort once with original key and unchanged payload.';
      } else action = 'Hold unresolved operation; unavailable evidence cannot authorize retry.';
    }
    const effectMin = original.effectMin + addedEffects;
    const effectMax = original.effectMax + addedEffects;
    return {
      ...copy(original), originalOutcome: original.outcome, action, submittedKey, addedEffects,
      effectMin, effectMax,
      duplicateMin: Math.max(0, effectMin - 1), duplicateMax: Math.max(0, effectMax - 1),
      outcome: effectMin > 1 || effectMax === 0 ? 'failed'
        : effectMin === 1 && effectMax === 1 ? 'committed' : 'unresolved',
    };
  }
  function createLesson() {
    let state = initial();
    function phase(expected) {
      if (state.phase !== expected) throw new Error(`Action requires ${expected} phase; current phase is ${state.phase}.`);
    }
    function snapshot() {
      requireArguments(arguments, 0);
      return freeze(copy(state));
    }
    function begin(config) {
      requireArguments(arguments, 1);
      phase('idle');
      const checked = configuration(config);
      if (state.history.length >= fixtures.maxAttempts) throw new Error('Six-attempt capacity reached; explicitly reset.');
      state.config = checked;
      state.attempt = state.history.length + 1;
      state.phase = 'committing';
      state.trace.push(`Attempt ${state.attempt}: issue three synthetic commits with fixed original keys and payloads.`);
      return snapshot();
    }
    function fault() {
      requireArguments(arguments, 0);
      phase('committing');
      state.phase = 'uncertain';
      state.interruptedResponses = fixtures.interruptedResponses;
      state.original = fixtures.operations.map((operation) => ({
        ...originalRow(operation, 'unavailable'),
        evidence: 'Commit acknowledgement lost; timeout alone proves neither commit nor abort.',
      }));
      state.trace.push('Failover during commit: all three acknowledgements are lost; three client responses interrupted.');
      state.trace.push('Before authoritative reconciliation: 0 committed, 0 failed, 3 unresolved.');
      return snapshot();
    }
    function reconcile() {
      requireArguments(arguments, 0);
      phase('uncertain');
      state.original = fixtures.operations.map((operation) =>
        originalRow(operation, operation.receipt === 'selected' ? state.config.receipt : operation.receipt));
      state.phase = 'reconciled';
      for (const row of state.original) state.trace.push(`${row.id}: ${row.outcome}. ${row.evidence}`);
      state.trace.push('Only a terminal abort proves non-commit; absent/unavailable records are not terminal proof.');
      return snapshot();
    }
    function recover() {
      requireArguments(arguments, 0);
      phase('reconciled');
      const rows = state.original.map((row) => recoverRow(row, state.config.recovery));
      const recoveredCounts = counts(rows);
      const gate = recoveredCounts.failed ? 'FAIL' : recoveredCounts.unresolved ? 'UNKNOWN' : 'PASS';
      state.result = {
        originalCounts: counts(state.original), counts: recoveredCounts, rows, gate,
        effects: {
          min: rows.reduce((sum, row) => sum + row.effectMin, 0),
          max: rows.reduce((sum, row) => sum + row.effectMax, 0), intended: fixtures.operations.length,
        },
        duplicates: {
          min: rows.reduce((sum, row) => sum + row.duplicateMin, 0),
          max: rows.reduce((sum, row) => sum + row.duplicateMax, 0),
        },
        interruptedResponses: state.interruptedResponses,
        recoveryImpact: gate === 'PASS' ? 'RECOVERED' : gate === 'FAIL' ? 'INTERRUPTED' : 'UNVERIFIED',
        uninterruptedMigrationProven: false,
        cleanup: 'Local memory only; no database, cloud resource or external effect to clean up.',
      };
      for (const row of rows) state.trace.push(`${row.id}: ${row.action} Effects ${row.effectMin}..${row.effectMax}; ${row.outcome}.`);
      state.trace.push(`Effect reconciliation gate ${gate}. Original failures and all three interrupted responses are retained.`);
      state.phase = 'complete';
      state.history.push(copy({
        attempt: state.attempt, config: state.config, original: state.original,
        result: state.result, trace: state.trace, prediction: null,
      }));
      return snapshot();
    }
    function predict(selected) {
      requireArguments(arguments, 1);
      phase('complete');
      if (typeof selected !== 'string' || !['PASS', 'FAIL', 'UNKNOWN'].includes(selected)) {
        throw new Error('Prediction must be exactly PASS, FAIL or UNKNOWN.');
      }
      if (state.prediction) throw new Error('Prediction already checked for this attempt.');
      state.prediction = { expected: state.result.gate, selected, correct: selected === state.result.gate };
      state.history[state.history.length - 1].prediction = copy(state.prediction);
      return snapshot();
    }
    function next() {
      requireArguments(arguments, 0);
      phase('complete');
      if (state.history.length >= fixtures.maxAttempts) throw new Error('Six-attempt capacity reached; explicitly reset.');
      state = initial(state.history);
      return snapshot();
    }
    function reset() {
      requireArguments(arguments, 0);
      state = initial();
      return snapshot();
    }
    return Object.freeze({
      snapshot, begin, fault, reconcile, recover, predict, next, reset,
    });
  }
  return Object.freeze({ createLesson, fixtures });
}));
