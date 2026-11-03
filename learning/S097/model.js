(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StandbyPromise = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const MAX_ATTEMPTS = 6;
  const RETENTION_SECONDS = 300;
  const ROLLBACK_AT_SECONDS = 240;
  const REQUIRED_CAPACITY = 10;
  const issuedSessions = new WeakSet();
  const BUDGETS = [6, 24];
  const ANSWERS = ['promise-met', 'promise-violated', 'unverified'];
  const PHASE_NAMES = ['Reactivate capacity', 'Warm up', 'Validate readiness and compatibility', 'Restore routing'];
  const FIXTURES = freeze({
    'warm-ready': {
      label: 'Warm retained standby',
      coverage: 'Ready throughout 0–300 s inclusive.',
      readinessThroughout: true,
      minimumReadyCapacity: 12,
      recoveredCapacity: 12,
      compatible: true,
      durations: [0, 0, 2, 2],
    },
    'cold-gap': {
      label: 'Cold rollback standby',
      coverage: 'Ready 0–180 s; cold 180–258 s; ready 258–300 s.',
      readinessThroughout: false,
      minimumReadyCapacity: 0,
      recoveredCapacity: 12,
      compatible: true,
      durations: [4, 12, 2, 2],
    },
    'missing-evidence': {
      label: 'Unobserved standby',
      coverage: 'Readiness and compatible-capacity coverage unobserved.',
      readinessThroughout: null,
      minimumReadyCapacity: null,
      recoveredCapacity: 12,
      compatible: null,
      durations: [0, null, 2, 2],
    },
    'capacity-shortfall': {
      label: 'Insufficient retained capacity',
      coverage: 'Fresh probes throughout 0–300 s, but only 6 usable units.',
      readinessThroughout: true,
      minimumReadyCapacity: 6,
      recoveredCapacity: 6,
      compatible: true,
      durations: [0, 0, 2, 2],
    },
  });

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function reject(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    throw error;
  }

  function exactObject(value, keys) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const actual = Reflect.ownKeys(value);
    return actual.length === keys.length && actual.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return keys.includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    });
  }

  function exactArray(value, length) {
    if (!Array.isArray(value) || value.length !== length) return false;
    const keys = Reflect.ownKeys(value);
    return keys.length === length + 1 && keys.every((key) => {
      if (key === 'length') return true;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)
        && Number(key) < length && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    });
  }

  function sameTree(actual, expected) {
    if (expected === null || typeof expected !== 'object') return actual === expected;
    if (Array.isArray(expected)) {
      return exactArray(actual, expected.length)
        && expected.every((item, index) => sameTree(actual[index], item));
    }
    const keys = Object.keys(expected);
    return exactObject(actual, keys) && keys.every((key) => sameTree(actual[key], expected[key]));
  }

  function validateInput(input) {
    if (!exactObject(input, ['fixture', 'budgetSeconds', 'answer'])
        || typeof input.fixture !== 'string'
        || !Object.hasOwn(FIXTURES, input.fixture)
        || !BUDGETS.includes(input.budgetSeconds)
        || !ANSWERS.includes(input.answer)) {
      reject('ERR_INPUT', 'Choose a named fixture, exactly 6 or 24 synthetic seconds, and a listed answer.');
    }
  }

  function inspect(fixtureId, budgetSeconds) {
    const fixture = FIXTURES[fixtureId];
    let cumulative = 0;
    const phases = fixture.durations.map((durationSeconds, index) => {
      cumulative = cumulative === null || durationSeconds === null ? null : cumulative + durationSeconds;
      return { name: PHASE_NAMES[index], durationSeconds, cumulativeSeconds: cumulative };
    });
    const timing = cumulative === null ? 'unknown' : cumulative <= budgetSeconds ? 'success' : 'failure';
    const failures = [];
    const unknowns = [];
    if (fixture.readinessThroughout === false) failures.push('Readiness was lost inside the promised 0–300 s retention window.');
    if (fixture.readinessThroughout === null) unknowns.push('Readiness coverage throughout retention is unobserved.');
    if (fixture.minimumReadyCapacity === null) unknowns.push('Minimum ready retained capacity is unobserved.');
    else if (fixture.minimumReadyCapacity < REQUIRED_CAPACITY) {
      failures.push(`Minimum ready retained capacity ${fixture.minimumReadyCapacity} is below required ${REQUIRED_CAPACITY} units.`);
    }
    if (fixture.recoveredCapacity < REQUIRED_CAPACITY) failures.push('Recovered capacity cannot serve the declared demand.');
    if (fixture.compatible === null) unknowns.push('Fresh compatibility validation is unobserved.');
    if (fixture.compatible === false) failures.push('The recovered destination is incompatible.');
    const retentionAcceptance = failures.length ? 'failure' : unknowns.length ? 'unknown' : 'success';
    if (timing === 'failure') failures.push(`Recovery ${cumulative} s exceeds the original ${budgetSeconds} s budget.`);
    if (timing === 'unknown') unknowns.push('Warm-up duration and completed recovery time are unobserved.');
    const acceptance = failures.length ? 'failure' : unknowns.length ? 'unknown' : 'success';
    return {
      fixture: fixtureId,
      label: fixture.label,
      retentionSeconds: RETENTION_SECONDS,
      rollbackAtSeconds: ROLLBACK_AT_SECONDS,
      requiredCapacity: REQUIRED_CAPACITY,
      coverage: fixture.coverage,
      readinessThroughout: fixture.readinessThroughout,
      minimumReadyCapacity: fixture.minimumReadyCapacity,
      recoveredCapacity: fixture.recoveredCapacity,
      compatible: fixture.compatible,
      phases,
      recoverySeconds: cumulative,
      timing,
      retentionAcceptance,
      acceptance,
      reasons: [...failures, ...unknowns].length ? [...failures, ...unknowns]
        : ['Fresh ready compatible capacity throughout retention and recovery timing meet this synthetic promise.'],
    };
  }

  function evaluate(input) {
    validateInput(input);
    const selected = inspect(input.fixture, input.budgetSeconds);
    const expectedAnswer = {
      success: 'promise-met', failure: 'promise-violated', unknown: 'unverified',
    }[selected.acceptance];
    const comparison = [inspect('warm-ready', input.budgetSeconds), inspect('cold-gap', input.budgetSeconds)];
    return freeze({
      acceptance: selected.acceptance,
      verifier: input.answer === expectedAnswer ? 'pass' : 'fail',
      expectedAnswer,
      selected,
      comparison,
      coldDelaySeconds: comparison[1].recoverySeconds - comparison[0].recoverySeconds,
    });
  }

  function validateSession(session) {
    if (!issuedSessions.has(session)
        || !exactObject(session, ['schemaVersion', 'phase', 'history', 'current'])
        || session.schemaVersion !== 1 || !['ready', 'checked'].includes(session.phase)
        || !Array.isArray(session.history) || session.history.length > MAX_ATTEMPTS
        || !exactArray(session.history, session.history.length)) {
      reject('ERR_STATE', 'The bounded rehearsal state is invalid.');
    }
    session.history.forEach((record, index) => {
      if (!exactObject(record, ['attempt', 'input', 'result']) || record.attempt !== index + 1) {
        reject('ERR_STATE', 'History identity or sequence was altered.');
      }
      let expected;
      try {
        expected = evaluate(record.input);
      } catch {
        reject('ERR_STATE', 'A retained input was altered.');
      }
      if (!sameTree(record.result, expected)) reject('ERR_STATE', 'Retained outcome or evidence was altered.');
    });
    if (session.phase === 'ready' ? session.current !== null
      : !session.history.length || !sameTree(session.current, session.history[session.history.length - 1])) {
      reject('ERR_STATE', 'The current decision does not match the retained phase.');
    }
  }

  function issueSession(value) {
    issuedSessions.add(value);
    return freeze(value);
  }

  function createSession() {
    return issueSession({ schemaVersion: 1, phase: 'ready', history: [], current: null });
  }

  function decide(session, input) {
    validateSession(session);
    if (session.phase !== 'ready') reject('ERR_STATE', 'Reset the current rehearsal before another decision.');
    if (session.history.length === MAX_ATTEMPTS) reject('ERR_HISTORY_LIMIT', 'The six-check session is full; reset cannot renew its allowance.');
    const result = evaluate(input);
    const record = freeze({ attempt: session.history.length + 1, input: { ...input }, result });
    return issueSession({ schemaVersion: 1, phase: 'checked', history: [...session.history, record], current: record });
  }

  function resetSession(session) {
    validateSession(session);
    return issueSession({ schemaVersion: 1, phase: 'ready', history: [...session.history], current: null });
  }

  function totals(session) {
    validateSession(session);
    const counts = { attempted: session.history.length, success: 0, failure: 0, unknown: 0 };
    session.history.forEach((record) => { counts[record.result.acceptance] += 1; });
    return freeze({ ...counts, evidence: counts.attempted ? 'synthetic-only' : 'none' });
  }

  return freeze({ MAX_ATTEMPTS, RETENTION_SECONDS, ROLLBACK_AT_SECONDS, REQUIRED_CAPACITY,
    createSession, evaluate, decide, resetSession, totals });
}));
