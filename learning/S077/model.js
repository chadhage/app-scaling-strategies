(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Lesson077 = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const states = new WeakSet();
  const freeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const fixture = freeze({
    messageId: 'MSG-077', businessKey: 'ORDER-077:credit', amount: 10, maxAttempts: 6,
  });
  const seal = (state) => {
    freeze(state);
    states.add(state);
    return state;
  };
  const reject = (message, field) => {
    const error = new Error(message);
    if (field) error.field = field;
    throw error;
  };
  const requireState = (state, phase) => {
    if (!states.has(state)) reject('Use an unmodified state created by this rehearsal.');
    if (phase && state.phase !== phase) reject(`This action requires phase ${phase}; current phase is ${state.phase}.`);
  };
  const validateConfig = (config) => {
    if (!config || typeof config !== 'object' || Object.getPrototypeOf(config) !== Object.prototype
        || Reflect.ownKeys(config).length !== 2
        || !['handler', 'firstOutcome'].every((key) =>
          Object.hasOwn(config, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(config, key), 'value'))) {
      reject('Choose exactly handler and firstOutcome; no additional inputs are accepted.');
    }
    if (!['ledger', 'blind'].includes(config.handler)) reject('Choose a listed handler.', 'handler');
    if (!['committed', 'not-committed', 'unresolved'].includes(config.firstOutcome)) {
      reject('Choose a listed first business outcome.', 'firstOutcome');
    }
    return { handler: config.handler, firstOutcome: config.firstOutcome };
  };
  const ready = (history) => seal({
    phase: 'ready', config: null, deliveries: [], effects: [], events: [], result: null, history,
  });
  const createRehearsal = () => ready([]);
  const delivery = (number, outcome, lock) => ({
    delivery: number, messageId: fixture.messageId, businessKey: fixture.businessKey, lock, outcome,
  });
  const effect = (number, deliveredBy) => ({
    effectId: `E${number}`, delivery: deliveredBy, messageId: fixture.messageId,
    businessKey: fixture.businessKey, amount: fixture.amount,
  });
  const deliver = (state, input) => {
    requireState(state, 'ready');
    if (state.history.length >= fixture.maxAttempts) reject('Six attempts are retained; explicitly reset rehearsal and history.');
    const config = validateConfig(input);
    const committed = config.firstOutcome === 'committed';
    const outcome = committed ? 'applied' : config.firstOutcome;
    const first = committed
      ? 'Delivery #1 committed +10 synthetic units; acknowledgement lost.'
      : config.firstOutcome === 'not-committed'
        ? 'Delivery #1 failed before commit; observed no business effect, no acknowledgement.'
        : 'Delivery #1 outcome unresolved; absence of evidence is not evidence of no effect.';
    return seal({
      ...state, phase: 'locked', config, deliveries: [delivery(1, outcome, 'held')],
      effects: committed ? [effect(1, 1)] : [], events: [first],
    });
  };
  const expireLock = (state) => {
    requireState(state, 'locked');
    return seal({
      ...state, phase: 'expired',
      deliveries: state.deliveries.map((entry) => ({ ...entry, lock: 'expired' })),
      events: [...state.events, 'Modeled lock expired. The same message can be delivered again; expiry itself creates no business effect.'],
    });
  };
  const redeliver = (state) => {
    requireState(state, 'expired');
    const unresolvedEffects = state.config.firstOutcome === 'unresolved' ? 1 : 0;
    const protectedHandler = state.config.handler === 'ledger';
    const outcome = protectedHandler && unresolvedEffects ? 'held-unresolved'
      : protectedHandler && state.effects.length ? 'duplicate-suppressed' : 'applied';
    const effects = outcome === 'applied'
      ? [...state.effects, effect(state.effects.length + 1, 2)] : state.effects;
    const deliveries = [...state.deliveries, delivery(2, outcome, 'new-lock')];
    const knownEffects = effects.length;
    const duplicateEffects = Math.max(0, knownEffects - 1);
    const verdict = duplicateEffects ? 'FAIL' : unresolvedEffects ? 'UNKNOWN'
      : knownEffects === 1 ? 'PASS' : 'FAIL';
    const reason = verdict === 'FAIL'
      ? 'The same business key received two known credits. Repeated delivery became a duplicate business effect.'
      : verdict === 'UNKNOWN'
        ? 'The first business outcome is unresolved. A missing record cannot prove zero effects or successful processing.'
        : 'Two deliveries produced exactly one known intended effect; repeat delivery is not repeat business work.';
    const impact = verdict === 'FAIL' ? 'duplicate business effect observed'
      : verdict === 'UNKNOWN' ? 'unresolved business outcome; no success claim' : 'one intended effect observed';
    const result = {
      attempt: state.history.length + 1, mode: 'synthetic', config: state.config, verdict, reason, impact,
      deliveries: deliveries.length, repeatedDeliveries: deliveries.length - 1,
      knownEffects, duplicateEffects, unresolvedEffects, knownTotal: knownEffects * fixture.amount,
      possibleEffects: [knownEffects, knownEffects + unresolvedEffects],
      deliveryLedger: deliveries, businessLedger: effects,
    };
    const events = [...state.events, `Delivery #2: ${outcome}. ${reason}`];
    return seal({ ...state, phase: 'complete', deliveries, effects, events, result, history: [...state.history, result] });
  };
  const newAttempt = (state) => {
    requireState(state, 'complete');
    if (state.history.length >= fixture.maxAttempts) reject('Six attempts are retained; explicitly reset rehearsal and history.');
    return ready(state.history);
  };
  const reset = (state) => {
    requireState(state);
    return createRehearsal();
  };
  const checkPrediction = (state, choice) => {
    requireState(state, 'complete');
    if (!['PASS', 'FAIL', 'UNKNOWN'].includes(choice)) reject('Choose PASS, FAIL or UNKNOWN.', 'prediction');
    return freeze({
      correct: state.result.verdict === choice, chosen: choice, expected: state.result.verdict,
      explanation: state.result.reason,
    });
  };
  return freeze({ fixture, createRehearsal, deliver, expireLock, redeliver, newAttempt, reset, checkPrediction });
}));
