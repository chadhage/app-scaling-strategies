(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S088 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_ATTEMPTS = 6;
  const BASELINE = Object.freeze({
    routing: Object.freeze({ old: 100, candidate: 0 }),
    state: Object.freeze({ revision: 7, requiredValue: 'saved-draft-088' }),
  });
  function createState() {
    return Object.freeze({ schema: 1, history: Object.freeze([]) });
  }
  const decisions = Object.freeze(['denied', 'allowed', 'unknown']);
  const responses = Object.freeze(['explicit', 'success-shaped']);
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new TypeError(`${label} must be a plain data record.`);
    }
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))
        || actual.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      throw new TypeError(`${label} has invalid fields; only data properties are permitted.`);
    }
  }
  function validateInput(input) {
    record(input, ['decision', 'response'], 'Input');
    if (!decisions.includes(input.decision)) throw new TypeError('Input decision must be denied, allowed, or unknown.');
    if (!responses.includes(input.response)) throw new TypeError('Input response must be explicit or success-shaped.');
    if (input.response === 'success-shaped' && input.decision !== 'denied') {
      throw new TypeError('The success-shaped response fixture requires a denied decision.');
    }
  }
  function entryFor(input, sequence) {
    validateInput(input);
    const denied = input.decision === 'denied';
    const unknown = input.decision === 'unknown';
    const invalid = input.response === 'success-shaped';
    const error = { code: 'PermissionDenied', scope: 'rehearsal-088/promote-candidate' };
    const observed = unknown ? null : {
      routing: { old: denied ? 100 : 0, candidate: denied ? 0 : 100 },
      state: { ...BASELINE.state },
    };
    return {
      sequence,
      input: { decision: input.decision, response: input.response },
      operation: {
        name: 'promote-candidate',
        lease: 'rehearsal-088',
        outcome: unknown ? 'unknown' : denied ? 'failure' : 'success',
        detail: unknown
          ? 'No permission decision or effective-state observation is available; completion is unverified.'
          : denied
            ? 'Scoped PermissionDenied: the fictional promotion did not run.'
            : 'The allowed fictional promotion has a matching effective-routing observation.',
      },
      response: unknown ? null : denied ? {
        status: invalid ? 200 : 403,
        body: { ok: invalid, status: invalid ? 'succeeded' : 'failed', error },
      } : { status: 200, body: { ok: true, status: 'succeeded' } },
      before: { routing: { ...BASELINE.routing }, state: { ...BASELINE.state } },
      observed,
      lastKnown: observed || { routing: { ...BASELINE.routing }, state: { ...BASELINE.state } },
      verifier: {
        verdict: unknown ? 'unknown' : invalid ? 'fail' : 'pass',
        transition: unknown ? 'unverified' : invalid ? 'invalid-success-shaped-error' : denied ? 'safe-abort-before-exposure' : 'completed-synthetic-transition',
        reason: unknown
          ? 'Unknown: last-known state is not a new observation. No successful operation or migration is established.'
          : invalid
            ? 'Invalid success-shaped error: 200, ok true and succeeded contradict PermissionDenied. The operation failed; reject the broad success fallback.'
            : denied
              ? 'Visible failure with unchanged observed routing and required state. Safe abort before exposure; no migration is claimed.'
              : 'Only this fixed synthetic trace evidences candidate routing at 100% and preserved required state. This is not a live result.',
      },
    };
  }
  function sameTree(actual, expected) {
    if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length
          || Object.getPrototypeOf(actual) !== Array.prototype
          || Reflect.ownKeys(actual).length !== expected.length + 1) return false;
      return expected.every((value, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(actual, String(index));
        return descriptor && Object.hasOwn(descriptor, 'value') && sameTree(descriptor.value, value);
      });
    }
    try { record(actual, Object.keys(expected), 'State history'); } catch { return false; }
    return Object.keys(expected).every((key) => sameTree(actual[key], expected[key]));
  }
  function validateState(state) {
    record(state, ['schema', 'history'], 'State');
    if (state.schema !== 1 || !Array.isArray(state.history)
        || Object.getPrototypeOf(state.history) !== Array.prototype
        || state.history.length > MAX_ATTEMPTS
        || Reflect.ownKeys(state.history).length !== state.history.length + 1) {
      throw new TypeError('State history has an invalid schema, length, or array field.');
    }
    for (let index = 0; index < state.history.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(state.history, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('State history must be dense data.');
      const entry = descriptor.value;
      const inputDescriptor = entry && Object.getOwnPropertyDescriptor(entry, 'input');
      if (!inputDescriptor || !Object.hasOwn(inputDescriptor, 'value')) throw new TypeError('State history input must be data.');
      let expected;
      try { expected = entryFor(inputDescriptor.value, index + 1); } catch { throw new TypeError('State history input is invalid.'); }
      if (!sameTree(entry, expected)) throw new TypeError('State history does not match the fixed deterministic trace.');
    }
  }
  function attempt(state, input) {
    validateState(state);
    validateInput(input);
    if (state.history.length >= MAX_ATTEMPTS) throw new RangeError('The six-attempt limit is reached. Reset explicitly to begin again.');
    const history = state.history.map((entry, index) => entryFor(entry.input, index + 1));
    history.push(entryFor(input, history.length + 1));
    return freeze({ schema: 1, history });
  }
  function totals(state) {
    validateState(state);
    return state.history.reduce((result, entry) => {
      result.attempted += 1;
      result[entry.operation.outcome] += 1;
      return result;
    }, { attempted: 0, success: 0, failure: 0, unknown: 0 });
  }
  return Object.freeze({ MAX_ATTEMPTS, BASELINE, createState, attempt, totals });
}));
