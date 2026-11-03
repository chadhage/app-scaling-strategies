'use strict';

(function expose(root) {
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const CLIENTS = freeze(['browser', 'service']);
  const HOSTNAMES = freeze({ app: 'app.example.test', api: 'api.example.test' });
  const CERTIFICATES = freeze({
    'both-hosts': { label: 'Both hostnames / trusted / valid', hostnames: Object.values(HOSTNAMES), validity: 'pass', trust: { browser: 'pass', service: 'pass' } },
    'app-only': { label: 'App hostname only / trusted / valid', hostnames: [HOSTNAMES.app], validity: 'pass', trust: { browser: 'pass', service: 'pass' } },
    'wrong-host': { label: 'Wrong hostname / trusted / valid', hostnames: ['archive.example.test'], validity: 'pass', trust: { browser: 'pass', service: 'pass' } },
    untrusted: { label: 'Both hostnames / untrusted / valid', hostnames: Object.values(HOSTNAMES), validity: 'pass', trust: { browser: 'fail', service: 'fail' } },
    expired: { label: 'Both hostnames / trusted / expired', hostnames: Object.values(HOSTNAMES), validity: 'fail', trust: { browser: 'pass', service: 'pass' } },
    'trust-unknown': { label: 'Both hostnames / service trust unknown', hostnames: Object.values(HOSTNAMES), validity: 'pass', trust: { browser: 'pass', service: 'unknown' } },
  });
  function inventory(serviceTLS) {
    return [
      { id: 'old', eligible: true, tls: { browser: 'pass', service: 'pass' } },
      { id: 'candidate', eligible: true, tls: { browser: 'pass', service: serviceTLS } },
      { id: 'parked', eligible: false, tls: { browser: 'fail', service: 'fail' } },
    ];
  }
  const INVENTORIES = freeze({
    supported: inventory('pass'),
    incompatible: inventory('fail'),
    unobserved: inventory('unknown'),
  });
  const MAX_ATTEMPTS = 6;
  const issued = new WeakSet();

  function reject(message, code = 'ERR_LESSON_INPUT') {
    const error = new TypeError(message);
    error.code = code;
    throw error;
  }
  function record(value, keys, name) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      reject(`${name} must be a plain typed record.`);
    }
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some((key) => !keys.includes(key))
        || keys.some((key) => !Object.hasOwn(value, key)
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      reject(`${name} has missing, extra, or accessor fields.`);
    }
  }
  function selection(value) {
    record(value, ['inventoryId', 'certificateId', 'hostnameId'], 'Selection');
    for (const [key, choices] of [['inventoryId', INVENTORIES], ['certificateId', CERTIFICATES], ['hostnameId', HOSTNAMES]]) {
      if (typeof value[key] !== 'string' || !Object.hasOwn(choices, value[key])) {
        reject(`Choose a fixed ${key}; arbitrary values are not accepted.`);
      }
    }
    return { inventoryId: value.inventoryId, certificateId: value.certificateId, hostnameId: value.hostnameId };
  }
  function verdict(checks) {
    return checks.includes('fail') ? 'fail' : checks.includes('unknown') ? 'unknown' : 'pass';
  }
  function count(rows) {
    const totals = { pass: 0, fail: 0, unknown: 0, total: rows.length };
    rows.forEach((row) => { totals[row.outcome] += 1; });
    return totals;
  }
  function evaluate(input) {
    const config = selection(input);
    const requiredHostname = HOSTNAMES[config.hostnameId];
    const measurements = [];
    const excluded = [];
    for (const destination of INVENTORIES[config.inventoryId]) {
      if (!destination.eligible) {
        excluded.push(destination.id);
        continue;
      }
      const certificateId = destination.id === 'old' ? 'both-hosts' : config.certificateId;
      const certificate = CERTIFICATES[certificateId];
      for (const clientId of CLIENTS) {
        const checks = {
          hostname: certificate.hostnames.includes(requiredHostname) ? 'pass' : 'fail',
          trust: certificate.trust[clientId],
          validity: certificate.validity,
          tls: destination.tls[clientId],
        };
        measurements.push({
          destinationId: destination.id, eligible: true, clientId, certificateId,
          ...checks, outcome: verdict(Object.values(checks)),
          reasons: Object.entries(checks).filter(([, result]) => result !== 'pass').map(([check, result]) => `${check}: ${result}`),
        });
      }
    }
    return freeze({ selection: config, requiredHostname, measurements, excluded, totals: count(measurements), verdict: verdict(measurements.map((row) => row.outcome)) });
  }
  function issue(value) {
    freeze(value);
    issued.add(value);
    return value;
  }
  function guardState(state) {
    if (!issued.has(state)) reject('Use an immutable state issued by this lesson; imported or fabricated state is rejected.', 'ERR_LESSON_STATE');
  }
  function createState() {
    return issue({ schemaVersion: 1, activeAttempt: null, admitted: ['old'], history: [] });
  }
  function step(state, action) {
    guardState(state);
    record(action, ['type', 'selection'], 'Action');
    if (typeof action.type !== 'string' || !['probe', 'admit'].includes(action.type)) reject('Choose probe or admit.');
    const config = selection(action.selection);
    if (action.type === 'probe') {
      if (state.history.length >= MAX_ATTEMPTS) reject('Six rehearsal attempts used. Reset retains history and allowance; reload for a separate new rehearsal.', 'ERR_LESSON_LIMIT');
      const attempt = { number: state.history.length + 1, observation: evaluate(config), decision: null };
      return issue({ schemaVersion: 1, activeAttempt: state.history.length, admitted: ['old'], history: [...state.history, attempt] });
    }
    if (state.activeAttempt === null) reject('Rehearse checks before requesting admission.');
    const current = state.history[state.activeAttempt];
    if (Object.keys(config).some((key) => config[key] !== current.observation.selection[key])) reject('Selection changed. Rehearse this combination before requesting admission.');
    if (current.decision !== null) reject('This attempt already has a decision; rehearse another combination.');
    const allowed = current.observation.verdict === 'pass';
    const decision = {
      allowed, result: allowed ? 'admitted' : 'blocked', verifier: 'pass', userOutcome: current.observation.verdict,
      reason: allowed ? 'Every eligible destination/client check passed.' : `Candidate rejected: synthetic client outcome ${current.observation.verdict}; old remains admitted.`,
    };
    const history = state.history.map((attempt, index) => index === state.activeAttempt ? { ...attempt, decision } : attempt);
    return issue({ schemaVersion: 1, activeAttempt: state.activeAttempt, admitted: allowed ? ['old', 'candidate'] : ['old'], history });
  }
  function reset(state) {
    guardState(state);
    return issue({ schemaVersion: 1, activeAttempt: null, admitted: ['old'], history: state.history });
  }
  function totals(state) {
    guardState(state);
    return freeze(count(state.history.flatMap((attempt) => attempt.observation.measurements)));
  }

  const api = freeze({ CLIENTS, HOSTNAMES, CERTIFICATES, INVENTORIES, MAX_ATTEMPTS, evaluate, createState, step, reset, totals });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S103Lesson = api;
})(typeof globalThis === 'object' ? globalThis : this);
