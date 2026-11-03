(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S059 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULT = Object.freeze({ schema: 'retries-v1', value: 2, reader: 'compatible' });
  const MAX_HISTORY = 16;
  const SUCCESS_AT = 3;
  const UNCHECKED = 'Blocked: inspect this exact draft before publication.';

  function exactObject(value, fields, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype
        || Reflect.ownKeys(value).length !== fields.length
        || !fields.every((field) => Object.hasOwn(value, field))) {
      throw new TypeError(`Invalid ${label}: expected exactly ${fields.join(', ')}.`);
    }
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        throw new TypeError(`Invalid ${label}: data properties are required.`);
      }
    }
  }

  function configCopy(input) {
    exactObject(input, ['schema', 'value', 'reader'], 'configuration');
    if (!['retries-v1', 'attempts-v2'].includes(input.schema)) {
      throw new TypeError('Invalid configuration schema.');
    }
    if (!['compatible', 'reinterpreted', 'unobserved'].includes(input.reader)) {
      throw new TypeError('Invalid new-code reader.');
    }
    const minimum = input.schema === 'retries-v1' ? 0 : 1;
    if (!Number.isInteger(input.value) || input.value < minimum || input.value > 4) {
      throw new TypeError(`Invalid retryBudget value: ${input.schema} requires an integer ${minimum}–4.`);
    }
    return { schema: input.schema, value: input.value, reader: input.reader };
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function createState() {
    return freeze({
      version: 1, draft: { ...DEFAULT }, check: null, published: null, history: [], nextId: 1,
    });
  }

  function observed(code, totalAttempts, meaning) {
    const journey = totalAttempts >= SUCCESS_AT ? 'success' : 'failure';
    const usedAttempts = Math.min(totalAttempts, SUCCESS_AT);
    return {
      code, status: 'observed', meaning, totalAttempts, usedAttempts, journey,
      reason: journey === 'success'
        ? `Synthetic dependency succeeds on attempt ${SUCCESS_AT}.`
        : `Budget exhausted after ${usedAttempts} attempts; attempt ${SUCCESS_AT} was required.`,
    };
  }

  function evaluate(input) {
    const config = configCopy(input);
    const legacy = config.schema === 'retries-v1';
    const expectedTotalAttempts = config.value + (legacy ? 1 : 0);
    const old = legacy ? observed('old-v1', config.value + 1, 'extra retries after first attempt') : {
      code: 'old-v1', status: 'unsupported', meaning: 'unrecognized schema',
      totalAttempts: null, usedAttempts: 0, journey: 'failure',
      reason: 'Old code explicitly rejects attempts-v2; it was not upgraded.',
    };
    const candidate = config.reader === 'unobserved' ? {
      code: 'new-v2', status: 'unobserved', meaning: 'not observed',
      totalAttempts: null, usedAttempts: null, journey: 'unknown',
      reason: 'Missing new-reader observation; no successful journey can be inferred.',
    } : observed('new-v2',
      legacy && config.reader === 'compatible' ? config.value + 1 : config.value,
      legacy && config.reader === 'compatible' ? 'extra retries after first attempt' : 'total attempts');
    const readings = [old, candidate];
    const knownMismatch = readings.some((row) => row.status === 'unsupported'
      || (row.status === 'observed' && row.totalAttempts !== expectedTotalAttempts));
    const compatibility = knownMismatch ? 'FAIL'
      : readings.some((row) => row.status === 'unobserved') ? 'UNKNOWN' : 'PASS';
    const metrics = {
      attempted: 2,
      successful: readings.filter((row) => row.journey === 'success').length,
      failed: readings.filter((row) => row.journey === 'failure').length,
      unknown: readings.filter((row) => row.journey === 'unknown').length,
    };
    const verdict = compatibility === 'FAIL' || metrics.failed > 0 ? 'FAIL'
      : compatibility === 'UNKNOWN' || metrics.unknown > 0 ? 'UNKNOWN' : 'PASS';
    let reason;
    if (old.status === 'unsupported') reason = old.reason;
    else if (knownMismatch) reason = 'The same shared setting has divergent meanings; publication is blocked even if both probes succeed.';
    else if (metrics.failed) reason = 'Approved meanings agree where observed, but the synthetic journey cannot finish within its attempt budget.';
    else if (metrics.unknown) reason = candidate.reason;
    else reason = 'Both versions honor the approved shared meaning and complete the two synthetic journeys.';
    return freeze({
      config, setting: 'retryBudget', expectedTotalAttempts, fixtureSuccessAt: SUCCESS_AT,
      compatibility, verdict, reason, readings, metrics,
      userImpact: metrics.failed ? 'synthetic-interruption' : metrics.unknown ? 'unverified' : 'synthetic-success',
      cleanup: 'no-external-resources',
      trace: [
        `Draft only: both readers receive retryBudget=${config.value}, schema=${config.schema}.`,
        `Approved meaning permits ${expectedTotalAttempts} total attempts; dependency succeeds on attempt ${SUCCESS_AT}.`,
        ...readings.map((row) => `${row.code}: ${row.meaning}; total attempts=${row.totalAttempts === null ? 'not established' : row.totalAttempts}; journey=${row.journey}. ${row.reason}`),
        `Compatibility=${compatibility}; gate=${verdict}; successes=${metrics.successful}, failures=${metrics.failed}, unknowns=${metrics.unknown}.`,
      ],
    });
  }

  function publicationReason(check) {
    return check === null ? UNCHECKED
      : check.verdict === 'PASS' ? 'Published the exact inspected synthetic configuration.'
        : `Blocked: ${check.verdict}. ${check.reason}`;
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function validateState(state) {
    try {
      exactObject(state, ['version', 'draft', 'check', 'published', 'history', 'nextId'], 'state');
      configCopy(state.draft);
      if (state.version !== 1 || !Array.isArray(state.history)
          || state.history.length > MAX_HISTORY || state.nextId !== state.history.length + 1) {
        throw new TypeError('Invalid state version, history or sequence.');
      }
      let published = null;
      let latestInspection = null;
      for (let index = 0; index < state.history.length; index++) {
        const entry = state.history[index];
        exactObject(entry, ['id', 'action', 'config', 'evaluation', 'outcome', 'reason'], 'history record');
        configCopy(entry.config);
        if (entry.id !== index + 1 || !['inspect', 'publish'].includes(entry.action)) {
          throw new TypeError('Invalid history sequence or action.');
        }
        const expected = evaluate(entry.config);
        if (entry.action === 'inspect') {
          if (!same(entry.evaluation, expected) || entry.outcome !== expected.verdict
              || entry.reason !== expected.reason) throw new TypeError('Invalid history inspection.');
          latestInspection = expected;
        } else {
          if (entry.evaluation !== null && (!same(entry.evaluation, expected)
              || !same(entry.evaluation, latestInspection))) {
            throw new TypeError('Invalid history publication check.');
          }
          const outcome = entry.evaluation && entry.evaluation.verdict === 'PASS' ? 'published' : 'blocked';
          if (entry.outcome !== outcome || entry.reason !== publicationReason(entry.evaluation)) {
            throw new TypeError('Invalid history publication outcome.');
          }
          if (outcome === 'published') published = configCopy(entry.config);
        }
      }
      if (state.check !== null && (!same(state.check, evaluate(state.draft))
          || !same(state.check, latestInspection))) throw new TypeError('Invalid state check.');
      if (state.published !== null) configCopy(state.published);
      if (!same(state.published, published)) throw new TypeError('Invalid state publication.');
    } catch (error) {
      throw new TypeError(`Invalid state: ${error.message}`);
    }
  }

  function transition(state, action) {
    validateState(state);
    if (!action || Object.getPrototypeOf(action) !== Object.prototype) {
      throw new TypeError('Invalid action.');
    }
    exactObject(action, action.type === 'edit' ? ['type', 'config'] : ['type'], 'action');
    if (!['edit', 'inspect', 'publish'].includes(action.type)) throw new TypeError('Invalid action type.');
    if (action.type === 'edit') {
      return freeze({ ...state, draft: configCopy(action.config), check: null });
    }
    if (state.history.length === MAX_HISTORY) {
      throw new RangeError('History is full (16 actions). Explicitly reset to start a new rehearsal; no record was dropped.');
    }
    const evaluation = action.type === 'inspect' ? evaluate(state.draft) : state.check;
    const outcome = action.type === 'inspect' ? evaluation.verdict
      : evaluation && evaluation.verdict === 'PASS' ? 'published' : 'blocked';
    const entry = {
      id: state.nextId, action: action.type, config: configCopy(state.draft), evaluation,
      outcome, reason: action.type === 'inspect' ? evaluation.reason : publicationReason(evaluation),
    };
    return freeze({
      ...state,
      check: action.type === 'inspect' ? evaluation : state.check,
      published: outcome === 'published' ? configCopy(state.draft) : state.published,
      history: [...state.history, entry],
      nextId: state.nextId + 1,
    });
  }
  return Object.freeze({ DEFAULT, MAX_HISTORY, createState, evaluate, transition });
}));
