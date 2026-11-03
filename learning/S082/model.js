(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StaleEpochLesson = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const baseline = freeze({
    epoch: 12, deployment: 'green-e12',
    routing: { blue: 25, green: 75 },
    readiness: { blue: true, green: true },
  });
  const options = freeze({
    epoch: ['stale', 'current', 'future'],
    field: ['routing', 'readiness', 'both'],
    guard: ['enforced', 'bypassed'],
    observation: ['complete', 'missing'],
  });
  const maxAttempts = 6;
  const issued = new WeakSet();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function reject(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function issue(phase, records) {
    const state = freeze({ phase, records });
    issued.add(state);
    return state;
  }
  function requirePhase(state, phase) {
    if (!issued.has(state)) reject('STATE', 'Use an unmodified state issued by this lesson; importing state is unsupported.');
    if (state.phase !== phase) reject('ORDER', `This action requires phase ${phase}; current phase is ${state.phase}.`);
  }
  function readInput(input) {
    const keys = input && typeof input === 'object' ? Reflect.ownKeys(input) : [];
    if (!input || Object.getPrototypeOf(input) !== Object.prototype
        || keys.length !== 4 || keys.some((key) => !Object.hasOwn(options, key))) {
      reject('INPUT', 'Choose exactly the four declared synthetic controls.');
    }
    const clean = {};
    for (const key of Object.keys(options)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')
          || typeof descriptor.value !== 'string' || !options[key].includes(descriptor.value)) {
        reject('INPUT', `Invalid ${key}; choose one of the declared options.`);
      }
      clean[key] = descriptor.value;
    }
    return clean;
  }
  function createState() {
    return issue('ready', []);
  }
  function record(id, input) {
    const epoch = { stale: 11, current: 12, future: 13 }[input.epoch];
    const matched = epoch === baseline.epoch;
    const applied = matched || input.guard === 'bypassed';
    const after = clone(baseline);
    if (applied && input.field !== 'readiness') after.routing = { blue: 100, green: 0 };
    if (applied && input.field !== 'routing') after.readiness.green = false;
    const observed = input.observation === 'complete';
    const routingChanges = Number(JSON.stringify(after.routing) !== JSON.stringify(baseline.routing));
    const readinessChanges = Number(JSON.stringify(after.readiness) !== JSON.stringify(baseline.readiness));
    const protectedChanges = routingChanges + readinessChanges;
    const verdict = !observed ? 'UNKNOWN' : !matched && (applied || protectedChanges) ? 'FAIL' : 'PASS';
    const reason = matched ? 'MATCHED_EPOCH' : applied ? 'GUARD_BYPASSED'
      : epoch < baseline.epoch ? 'STALE_EPOCH' : 'FUTURE_EPOCH';
    const requested = {};
    if (input.field !== 'readiness') requested.routing = { blue: 100, green: 0 };
    if (input.field !== 'routing') requested.readiness = { green: false };
    const explanation = verdict === 'UNKNOWN'
      ? 'After observation is missing. A rejection alone cannot prove that current routing and readiness stayed unchanged.'
      : verdict === 'FAIL'
        ? 'The unsafe bypass applied a mismatched epoch and changed protected state. Handler acceptance is not safety.'
        : matched
          ? 'Matching-epoch comparison applied only its selected fields. Epoch equality is not migration or readiness certification.'
          : 'The mismatched command was rejected. Observed epoch, deployment, routing and readiness are unchanged.';
    return {
      id, input,
      command: { epoch, deployment: `green-e${epoch}`, target: input.field, requested,
        disposition: applied ? 'APPLIED' : 'REJECTED', reason },
      before: clone(baseline), after: observed ? after : null,
      metrics: {
        routingChanges: observed ? routingChanges : null,
        readinessChanges: observed ? readinessChanges : null,
        protectedChanges: observed ? protectedChanges : null,
      },
      verdict, explanation, learner: null,
    };
  }
  function deliver(state, input) {
    requirePhase(state, 'ready');
    if (state.records.length >= maxAttempts) reject('LIMIT', 'History is full; reset explicitly. No attempts are evicted.');
    const clean = readInput(input);
    return issue('delivered', [...state.records, record(state.records.length + 1, clean)]);
  }
  function interpret(state, answer) {
    requirePhase(state, 'delivered');
    if (!['PASS', 'FAIL', 'UNKNOWN'].includes(answer)) reject('ANSWER', 'Choose PASS, FAIL or UNKNOWN.');
    const records = state.records.slice();
    const current = records[records.length - 1];
    records[records.length - 1] = {
      ...current, learner: { answer, correct: answer === current.verdict },
    };
    return issue('checked', records);
  }
  function nextAttempt(state) {
    requirePhase(state, 'checked');
    if (state.records.length >= maxAttempts) reject('LIMIT', 'History is full; reset explicitly. No attempts are evicted.');
    return issue('ready', state.records);
  }
  return freeze({ createState, deliver, interpret, nextAttempt, baseline, options, maxAttempts });
}));
