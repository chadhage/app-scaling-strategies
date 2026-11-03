'use strict';

(function expose(root) {
  const DEFAULTS = Object.freeze({
    credential: 'cookie', rotation: 'overlap', profiles: 2, observation: 'complete',
  });
  const HISTORY_LIMIT = 8;
  const fields = Object.keys(DEFAULTS);

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function configuration(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== fields.length
        || !fields.every((field) => Object.hasOwn(input, field))) {
      throw new TypeError('Provide exactly credential, rotation, profiles and observation.');
    }
    const config = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!Object.hasOwn(descriptor, 'value')) throw new TypeError('Configuration must contain data, not accessors.');
      config[field] = descriptor.value;
    }
    if (!['cookie', 'token'].includes(config.credential)) throw new TypeError('Choose cookie or token fixtures.');
    if (!['overlap', 'drop-old'].includes(config.rotation)) throw new TypeError('Choose overlap or incompatible rotation.');
    if (!Number.isInteger(config.profiles) || config.profiles < 1 || config.profiles > 8) {
      throw new RangeError('Profiles must be a whole number from 1 to 8.');
    }
    if (!['complete', 'missing'].includes(config.observation)) throw new TypeError('Choose complete or one missing observation.');
    return freeze(config);
  }

  function validates(policy, fixture) {
    return fixture.integrity === 'valid' && policy.accepts.includes(fixture.keyLabel);
  }

  function compare(input) {
    const config = configuration(input);
    const policies = {
      v1: { signs: 'fixture-old', accepts: config.rotation === 'overlap' ? ['fixture-old', 'fixture-next'] : ['fixture-old'] },
      v2: { signs: 'fixture-next', accepts: config.rotation === 'overlap' ? ['fixture-old', 'fixture-next'] : ['fixture-next'] },
    };
    const trace = [];
    for (let profile = 1; profile <= config.profiles; profile += 1) {
      for (const [from, to] of [['v1', 'v2'], ['v2', 'v1']]) {
        const keyLabel = policies[from].signs;
        const missing = config.observation === 'missing' && profile === config.profiles && to === 'v1';
        const accepted = validates(policies[to], { integrity: 'valid', keyLabel });
        trace.push({
          profile: `synthetic-${String(profile).padStart(2, '0')}`,
          credential: config.credential, from, to, keyLabel,
          outcome: missing ? 'unknown' : accepted ? 'accepted' : 'rejected',
          reason: missing ? 'No validation reply observed; cannot infer success.'
            : accepted ? 'Valid fixture; receiving version retains its key label.'
              : 'Authentication rejected: receiving version does not accept this key label.',
        });
      }
    }
    const guardChecks = Object.entries(policies).flatMap(([version, policy]) => [
      { version, probe: 'own-issued valid fixture', outcome: validates(policy, { integrity: 'valid', keyLabel: policy.signs }) ? 'accepted' : 'rejected' },
      { version, probe: 'tampered fixture', outcome: validates(policy, { integrity: 'tampered', keyLabel: policy.signs }) ? 'accepted' : 'rejected' },
    ]);
    const counts = { attempted: trace.length, accepted: 0, rejected: 0, unknown: 0 };
    trace.forEach((entry) => { counts[entry.outcome] += 1; });
    const tamperRejected = guardChecks.filter((entry) => entry.probe === 'tampered fixture')
      .every((entry) => entry.outcome === 'rejected');
    const migration = counts.rejected > 0 || !tamperRejected ? 'failure' : counts.unknown > 0 ? 'unknown' : 'success';
    return freeze({
      configuration: config, policies, trace, guardChecks, counts, tamperRejected, migration,
      verifier: counts.unknown > 0 ? 'unverified' : 'pass',
      verifierReason: counts.unknown > 0 ? 'One missing observation prevents a complete verification.'
        : config.rotation === 'drop-old' ? 'Expected incompatible-key rejection observed; this is not migration success.'
          : 'All declared cross-version continuity and tamper assertions satisfied.',
      userImpact: migration === 'failure' ? 'interrupted transition'
        : migration === 'unknown' ? 'unverified transition' : 'uninterrupted transition',
      successPercent: 100 * counts.accepted / counts.attempted,
      cleanup: 'No resources created; local page-session data only.',
    });
  }

  function createLesson() {
    let history = [];
    let current = null;
    const snapshot = () => freeze({ history: [...history], current, remaining: HISTORY_LIMIT - history.length });
    return Object.freeze({
      snapshot,
      run(input) {
        if (history.length >= HISTORY_LIMIT) throw new RangeError('History limit reached: eight runs. Reset cannot erase evidence or reopen capacity.');
        const result = freeze({ id: `run-${String(history.length + 1).padStart(2, '0')}`, ...compare(input) });
        history = [...history, result];
        current = result;
        return snapshot();
      },
      reset() {
        current = null;
        return snapshot();
      },
    });
  }

  const api = Object.freeze({ DEFAULTS, HISTORY_LIMIT, compare, createLesson });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeyContinuity = api;
}(typeof globalThis === 'object' ? globalThis : this));
