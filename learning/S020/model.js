(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S020Lesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const trusted = new WeakSet();
  const DEFAULTS = Object.freeze({ allowance: 4, extraUnits: 1, budgetMs: 250 });
  const LIMITS = Object.freeze({ reserve: 2, journeysPerUnit: 2, probes: 3, archives: 4 });
  const OBSERVATIONS = Object.freeze(['healthy', 'over-budget', 'missing-observations']);

  function reject(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function retain(run) {
    freeze(run);
    trusted.add(run);
    return run;
  }

  function requireRun(run) {
    if (!run || !trusted.has(run)) {
      reject('ERR_S020_STATE', 'Use an intact run created by this lesson; imported or forged state is unsupported.');
    }
  }

  function validateConfig(config) {
    const names = ['allowance', 'budgetMs', 'extraUnits'];
    if (!config || Object.getPrototypeOf(config) !== Object.prototype
        || Reflect.ownKeys(config).length !== names.length
        || names.some((key) => !Object.hasOwn(config, key)
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(config, key), 'value'))) {
      reject('ERR_S020_INPUT', 'Configuration must contain only allowance, extraUnits, and budgetMs data fields.');
    }
    for (const [key, min, max] of [['allowance', 3, 6], ['extraUnits', 1, 3], ['budgetMs', 100, 500]]) {
      if (!Number.isSafeInteger(config[key]) || config[key] < min || config[key] > max) {
        reject('ERR_S020_INPUT', `${key} must be a whole number from ${min} to ${max}.`);
      }
    }
    return { allowance: config.allowance, extraUnits: config.extraUnits, budgetMs: config.budgetMs };
  }

  function createRun(config = DEFAULTS) {
    return retain({
      schemaVersion: 1,
      fixtureVersion: 'S020-capacity-v1',
      config: validateConfig(config),
      reservedUnits: LIMITS.reserve,
      allocatedTotal: LIMITS.reserve,
      requestedTotal: LIMITS.reserve,
      exhausted: false,
      rejection: null,
      promotion: 'not-requested',
      route: 'reserved-v1',
      probes: 0,
      samples: [],
      trace: []
    });
  }

  function act(run, action, observation) {
    requireRun(run);
    if (!['exhaust', 'unsafe-expansion', 'promote', 'probe'].includes(action)) {
      reject('ERR_S020_INPUT', 'Choose exhaust, unsafe-expansion, promote, or probe.');
    }
    if (action !== 'probe' && observation !== undefined) {
      reject('ERR_S020_INPUT', 'Only a reserved-service probe accepts an observation fixture.');
    }
    const next = { ...run, samples: [...run.samples], trace: [...run.trace] };
    let message;
    if (action === 'exhaust') {
      if (run.exhausted) reject('ERR_S020_STATE', 'The allowance is already exhausted; archive/reset to configure another run.');
      next.exhausted = true;
      next.allocatedTotal = run.config.allowance;
      next.requestedTotal = run.config.allowance;
      message = `Filled ${run.config.allowance - LIMITS.reserve} sandbox units; the ${LIMITS.reserve}-unit reserve is untouched.`;
    } else if (action === 'unsafe-expansion') {
      if (!run.exhausted || run.rejection) {
        reject('ERR_S020_STATE', 'Exhaust the allowance first; one unsafe expansion attempt is allowed per run.');
      }
      next.requestedTotal = run.config.allowance + run.config.extraUnits;
      next.rejection = {
        source: 'harness-admission-limit',
        label: 'Harness admission limit',
        requestedTotal: next.requestedTotal,
        allowedTotal: run.config.allowance,
        unsupportedUnits: run.config.extraUnits,
        nativeAzureQuota: 'untested'
      };
      message = `Rejected ${run.config.extraUnits} unsupported units before allocation. Harness admission limit, not an observed Azure quota event.`;
    } else if (action === 'promote') {
      if (!run.rejection || run.promotion !== 'not-requested') {
        reject('ERR_S020_STATE', 'Request the unsafe expansion first; one promotion attempt is allowed per run.');
      }
      next.promotion = 'blocked';
      message = 'Promotion blocked: the requested target exceeds the allowance. Existing routing stays on reserved-v1.';
    } else {
      if (!OBSERVATIONS.includes(observation)) {
        reject('ERR_S020_INPUT', 'Choose healthy, over-budget, or missing-observations.');
      }
      if (run.promotion !== 'blocked') reject('ERR_S020_STATE', 'Attempt promotion after the rejection before probing reserved service.');
      if (run.probes >= LIMITS.probes) reject('ERR_S020_BOUND', 'Three probes per run are allowed; archive/reset to continue.');
      next.probes += 1;
      for (let index = 0; index < LIMITS.reserve * LIMITS.journeysPerUnit; index += 1) {
        const missing = observation === 'missing-observations' && index >= 2;
        const slow = observation === 'over-budget' && index === 0;
        next.samples.push({
          id: next.samples.length + 1,
          probe: next.probes,
          fixture: observation,
          route: 'reserved-v1',
          httpStatus: missing ? null : 200,
          latencyMs: missing ? null : slow ? run.config.budgetMs + 1 : 100,
          businessCorrect: missing ? null : true,
          outcome: missing ? 'unknown' : slow ? 'failure' : 'success'
        });
      }
      message = `Probe ${next.probes}: ${observation}; four synthetic existing journeys. Previous failures and unknowns are retained.`;
    }
    next.trace.push({
      step: next.trace.length + 1,
      action,
      message,
      requestedTotal: next.requestedTotal,
      allocatedTotal: next.allocatedTotal,
      reservedUnits: next.reservedUnits,
      route: next.route
    });
    return retain(next);
  }

  function summarize(run) {
    requireRun(run);
    const successfulExisting = run.samples.filter((sample) => sample.outcome === 'success').length;
    const failedExisting = run.samples.filter((sample) => sample.outcome === 'failure').length;
    const unknownExisting = run.samples.filter((sample) => sample.outcome === 'unknown').length;
    const verdict = failedExisting ? 'FAIL' : !run.samples.length || unknownExisting ? 'UNKNOWN' : 'PASS';
    const reason = failedExisting ? 'At least one reserved journey exceeded its latency budget; HTTP 200 is not sufficient.'
      : unknownExisting ? 'Missing reserved-journey observations cannot establish continuity.'
        : !run.samples.length ? 'No reserved-service journeys have been observed.'
          : 'Unsafe promotion was blocked and all observed reserved journeys met their budgets.';
    return freeze({
      verdict,
      reason,
      attemptedExisting: run.samples.length,
      successfulExisting,
      failedExisting,
      unknownExisting,
      unsupportedUnits: run.rejection ? run.config.extraUnits : 0,
      unsupportedNewJourneysPerWindow: run.rejection ? run.config.extraUnits * LIMITS.journeysPerUnit : 0,
      withheldSandboxJourneysPerWindow: (run.allocatedTotal - LIMITS.reserve) * LIMITS.journeysPerUnit,
      promotedNewJourneys: 0,
      rejectionSource: run.rejection ? run.rejection.label : 'Not attempted',
      nativeAzureQuota: 'UNTESTED - no Azure operation was performed',
      userOutcome: failedExisting ? 'Interrupted reserved service'
        : unknownExisting ? 'Unverified reserved service'
          : !run.samples.length ? 'Not observed'
            : 'Reserved service preserved; expansion safely aborted before exposure',
      cleanup: 'N/A - no resources created'
    });
  }

  return Object.freeze({ DEFAULTS, LIMITS, OBSERVATIONS, createRun, act, summarize });
}));
