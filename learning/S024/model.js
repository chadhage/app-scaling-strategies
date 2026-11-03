(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S024 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    scope: 'staging', setting: 'target', identity: 'denied', network: 'blocked', background: 'suppressed'
  });
  const LIMITS = Object.freeze({ validations: 6, history: 3, runId: 1000 });
  const choices = {
    scope: ['staging', 'effective'],
    setting: ['target', 'sticky-staging', 'unobserved'],
    identity: ['granted', 'denied', 'unobserved'],
    network: ['reachable', 'blocked', 'unobserved'],
    background: ['suppressed', 'enabled']
  };
  const keys = Object.keys(choices);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function record(value, names) {
    return value !== null && typeof value === 'object'
      && Object.getPrototypeOf(value) === Object.prototype
      && Reflect.ownKeys(value).length === names.length
      && names.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
      });
  }
  function list(value, minimum, maximum) {
    return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
      && value.length >= minimum && value.length <= maximum
      && Reflect.ownKeys(value).length === value.length + 1
      && Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
      }).every(Boolean);
  }
  function same(actual, expected) {
    if (Array.isArray(expected)) {
      return list(actual, expected.length, expected.length)
        && expected.every((value, index) => same(actual[index], value));
    }
    if (expected !== null && typeof expected === 'object') {
      const names = Object.keys(expected);
      return record(actual, names) && names.every((key) => same(actual[key], expected[key]));
    }
    return actual === expected;
  }
  function configuration(input) {
    if (!record(input, keys) || !keys.every((key) => choices[key].includes(input[key]))) {
      throw new Error('Invalid configuration: use exactly the five declared control choices.');
    }
    return Object.fromEntries(keys.map((key) => [key, input[key]]));
  }
  const observedStatus = (value, pass, fail) => value === pass ? 'pass' : value === fail ? 'fail' : 'unknown';
  function attempt(input, step) {
    const config = configuration(input);
    const target = config.scope === 'effective';
    const blocked = config.background === 'enabled';
    const dependency = target ? 'orders-prod-fixture' : 'orders-stage-fixture';
    const setting = !target ? dependency : config.setting === 'target' ? dependency
      : config.setting === 'sticky-staging' ? 'orders-stage-fixture' : 'unobserved';
    const checks = [
      {
        key: 'setting',
        status: !target ? 'pass' : observedStatus(config.setting, 'target', 'sticky-staging'),
        expected: dependency, observed: setting
      },
      {
        key: 'identity',
        status: !target ? 'pass' : observedStatus(config.identity, 'granted', 'denied'),
        expected: `candidate-mi granted access to ${dependency}`,
        observed: `candidate-mi: ${target ? config.identity : 'granted'}`
      },
      {
        key: 'network',
        status: !target ? 'pass' : observedStatus(config.network, 'reachable', 'blocked'),
        expected: `candidate-subnet can reach ${dependency}`,
        observed: `candidate-subnet: ${target ? config.network : 'reachable'}`
      },
      {
        key: 'background', status: blocked ? 'fail' : 'pass',
        expected: 'candidate suppressed; production remains the sole worker',
        observed: blocked ? 'enabled request BLOCKED before execution' : 'suppressed; 0 candidate starts'
      }
    ];
    if (blocked) {
      for (const check of checks.slice(0, 3)) {
        check.status = 'skipped';
        check.observed = 'not checked (background-work safety guard)';
      }
    }
    const failures = checks.filter((check) => check.status === 'fail').map((check) => check.key);
    const missing = checks.filter((check) => check.status === 'unknown').map((check) => check.key);
    const verdict = failures.length ? 'failure' : !target || missing.length ? 'unknown' : 'success';
    const explanation = blocked
      ? 'Safety failure: candidate work was requested while production is active. Validation blocked before dependency checks or candidate execution.'
      : failures.length ? `Observed effective-target failure: ${failures.join(', ')}.`
        : !target ? 'Staging checks passed, but effective production settings and target access were not observed.'
          : missing.length ? `Unknown effective-target evidence: ${missing.join(', ')}.`
            : 'All effective-target checks passed with candidate background work suppressed. Synthetic readiness only.';
    return {
      step, config, verdict, blocked, explanation,
      targetSettingsObserved: target && !blocked && missing.length === 0,
      candidateIdentity: 'candidate-mi', candidateNetwork: 'candidate-subnet',
      checks, productionBackgroundWorkers: 1, candidateBackgroundStarts: 0,
      duplicateBackgroundStarts: 0, preventedDuplicateStarts: blocked ? 1 : 0
    };
  }
  function summary(attempts) {
    const failed = attempts.filter((entry) => entry.verdict === 'failure').length;
    const unknown = attempts.filter((entry) => entry.verdict === 'unknown').length;
    return {
      verdict: failed ? 'failure' : unknown || attempts.length === 0 ? 'unknown' : 'success',
      validations: attempts.length,
      successful: attempts.filter((entry) => entry.verdict === 'success').length,
      failed, unknown,
      blocked: attempts.filter((entry) => entry.blocked).length,
      checksPassed: attempts.reduce((count, entry) =>
        count + entry.checks.filter((check) => check.status === 'pass').length, 0),
      productionBackgroundWorkers: 1, candidateBackgroundStarts: 0, duplicateBackgroundStarts: 0,
      preventedDuplicateStarts: attempts.reduce((count, entry) => count + entry.preventedDuplicateStarts, 0)
    };
  }
  function validAttempts(attempts, minimum) {
    return list(attempts, minimum, LIMITS.validations) && attempts.every((entry, index) => {
      if (!record(entry, Object.keys(attempt(DEFAULTS, 1)))) return false;
      try { return same(entry, attempt(entry.config, index + 1)); } catch { return false; }
    });
  }
  function guard(state) {
    const invalid = () => { throw new Error('Invalid state: expected a complete canonical bounded S024 run and history.'); };
    if (!record(state, ['version', 'runId', 'attempts', 'history', 'evictedRuns'])
      || state.version !== 1 || !Number.isInteger(state.runId) || state.runId < 1 || state.runId > LIMITS.runId
      || !Number.isInteger(state.evictedRuns) || state.evictedRuns !== Math.max(0, state.runId - 1 - LIMITS.history)
      || !list(state.history, Math.min(LIMITS.history, state.runId - 1), Math.min(LIMITS.history, state.runId - 1))
      || !validAttempts(state.attempts, 0)) invalid();
    for (const [index, run] of state.history.entries()) {
      if (!record(run, ['runId', 'attempts', 'summary'])
        || run.runId !== state.runId - state.history.length + index
        || !validAttempts(run.attempts, 1) || !same(run.summary, summary(run.attempts))) invalid();
    }
  }
  const create = () => freeze({ version: 1, runId: 1, attempts: [], history: [], evictedRuns: 0 });
  function validate(state, input) {
    guard(state);
    const config = configuration(input);
    if (state.attempts.length >= LIMITS.validations) {
      throw new Error('Run limit: six validations reached. Archive/reset before another validation.');
    }
    const next = clone(state);
    next.attempts.push(attempt(config, next.attempts.length + 1));
    return freeze(next);
  }
  function summarize(state) {
    guard(state);
    return freeze(summary(state.attempts));
  }
  function compare(input) {
    const config = configuration(input);
    return freeze([
      {
        key: 'Dependency setting', staging: 'orders-stage-fixture', production: 'orders-prod-fixture',
        effective: config.setting === 'target' ? 'orders-prod-fixture'
          : config.setting === 'sticky-staging' ? 'orders-stage-fixture' : 'unobserved',
        rule: 'Declared target setting must be checked; a retained slot-only staging value is not production-ready.'
      },
      {
        key: 'Identity', staging: 'candidate-mi', production: 'production-mi',
        effective: `candidate-mi (${config.identity})`,
        rule: 'Slot-bound, not swapped. Test target access using the candidate identity, not an assumed production identity.'
      },
      {
        key: 'Network', staging: 'candidate-subnet', production: 'production-subnet',
        effective: `candidate-subnet (${config.network})`,
        rule: 'Slot-bound, not swapped. The retained candidate network must reach the target dependency.'
      },
      {
        key: 'Background work', staging: 'suppressed', production: '1 active production worker',
        effective: config.background === 'suppressed' ? 'suppressed (0 candidate starts)' : 'requested enabled — BLOCKED (0 starts)',
        rule: 'Suppress candidate background work before validating target settings; production keeps the only active worker.'
      }
    ]);
  }
  function reset(state) {
    guard(state);
    if (state.attempts.length === 0) return freeze(clone(state));
    if (state.runId >= LIMITS.runId) throw new Error('Run ID limit reached. Reload explicitly to clear page-memory history.');
    const next = clone(state);
    next.history.push({ runId: next.runId, attempts: next.attempts, summary: summary(next.attempts) });
    if (next.history.length > LIMITS.history) {
      next.history.shift();
      next.evictedRuns += 1;
    }
    next.runId += 1;
    next.attempts = [];
    return freeze(next);
  }
  return Object.freeze({ DEFAULTS, LIMITS, create, validate, summarize, compare, reset });
}));
