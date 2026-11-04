'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CheckoutLesson = api;
})(globalThis, function () {
  const MAX_ACTIONS = 16;
  const MAX_RUNS = 4;
  const INTENT = {
    checkoutId: 'CHECKOUT-DEMO-01', clientId: 'CLIENT-DEMO-01',
    cartId: 'CART-DEMO-01', key: 'KEY-DEMO-01', orderId: 'ORDER-DEMO-01',
    effectId: 'EFFECT-DEMO-01', paymentId: 'PAYMENT-DEMO-01',
  };
  const INITIAL = {
    attemptId: 'ATTEMPT-DEMO-01', route: 'ROUTE-v1-DATA', key: INTENT.key,
    ack: 'missing', response: null, interruption: 'response-lost', effectOutcome: 'unknown',
  };

  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    }
    return value;
  }
  function freeze(value) {
    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function fictionalRecord(idField, id, overrides = {}) {
    return {
      [idField]: id, orderId: INTENT.orderId, checkoutId: INTENT.checkoutId,
      clientId: INTENT.clientId, cartId: INTENT.cartId, key: INTENT.key, ...overrides,
    };
  }
  function fictionalLedger(label) {
    return {
      label,
      orders: [fictionalRecord('orderId', INTENT.orderId)],
      effects: [fictionalRecord('effectId', INTENT.effectId)],
      payments: [fictionalRecord('paymentId', INTENT.paymentId)],
      finalState: { checkoutId: INTENT.checkoutId, clientId: INTENT.clientId, cartId: INTENT.cartId },
      retry: {
        attemptId: 'ATTEMPT-DEMO-02', route: 'ROUTE-v2-DATA', key: INTENT.key,
        ack: 'present',
        response: {
          statusCode: 200, result: 'recorded', orderId: INTENT.orderId,
          checkoutId: INTENT.checkoutId, clientId: INTENT.clientId, cartId: INTENT.cartId,
        },
      },
    };
  }
  const LEDGERS = {
    'kept-key': fictionalLedger('Same key; one matching order and correct client result'),
    'fresh-key': fictionalLedger('Different key; duplicated order/effect/payment marker'),
    'wrong-response': fictionalLedger('One order; acknowledged response names the wrong order'),
    'lost-state': fictionalLedger('One order; prior cart state does not survive'),
    'wrong-identity': fictionalLedger('One order; client identity does not survive'),
    unacknowledged: fictionalLedger('One matching order; retry acknowledgement is still missing'),
    unobserved: fictionalLedger('Retry reply and ledger observations unavailable'),
  };
  const second = {
    orderId: 'ORDER-DEMO-02', key: 'KEY-DEMO-02',
  };
  LEDGERS['fresh-key'].orders.push(fictionalRecord('orderId', second.orderId, second));
  LEDGERS['fresh-key'].effects.push(fictionalRecord('effectId', 'EFFECT-DEMO-02', second));
  LEDGERS['fresh-key'].payments.push(fictionalRecord('paymentId', 'PAYMENT-DEMO-02', second));
  LEDGERS['fresh-key'].retry.key = second.key;
  LEDGERS['fresh-key'].retry.response.orderId = second.orderId;
  LEDGERS['wrong-response'].retry.response.orderId = 'ORDER-DEMO-OTHER';
  LEDGERS['lost-state'].finalState.cartId = 'CART-DEMO-OTHER';
  LEDGERS['wrong-identity'].finalState.clientId = 'CLIENT-DEMO-OTHER';
  for (const id of ['unacknowledged', 'unobserved']) {
    LEDGERS[id].retry.ack = 'missing';
    LEDGERS[id].retry.response = null;
  }
  for (const field of ['orders', 'effects', 'payments', 'finalState']) LEDGERS.unobserved[field] = null;
  freeze(INTENT);
  freeze(INITIAL);
  freeze(LEDGERS);
  const LEDGER_IDS = freeze(Object.keys(LEDGERS));

  function hold(code, message) {
    const error = new Error(`${code}: Safe hold - ${message}`);
    error.name = 'LessonGuardError';
    error.code = code;
    throw error;
  }
  function dataOnly(value, code, depth = 0, ancestors = new Set()) {
    if (depth > 18) hold(code, 'data nesting exceeds the fixed lesson contract.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string' && value.length <= 256) return;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return;
    if (typeof value !== 'object' || ancestors.has(value)) hold(code, 'expected finite acyclic typed DATA.');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
      hold(code, 'inherited or non-plain DATA is not accepted.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (array) {
      const length = descriptors.length.value;
      if (length > 32 || keys.length !== length + 1) hold(code, 'sparse or extended arrays are not accepted.');
      for (let i = 0; i < length; i++) {
        if (!Object.hasOwn(descriptors, String(i))) hold(code, 'array observations must be dense.');
      }
    } else if (keys.length > 24) hold(code, 'record exceeds the fixed field budget.');
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        hold(code, 'accessors, symbols and hidden fields are not accepted.');
      }
      dataOnly(descriptor.value, code, depth + 1, ancestors);
    }
    ancestors.delete(value);
  }
  function exactRecord(value, fields, code) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
      hold(code, `expected exactly the fields ${fields.join(', ')}.`);
    }
  }
  function commandData(command) {
    dataOnly(command, 'ERR_INPUT');
    if (command === null || typeof command !== 'object' || Array.isArray(command)) {
      hold('ERR_INPUT', 'expected an exact command record.');
    }
    const fields = {
      load: ['type', 'checkoutId'], retry: ['type'], inspect: ['type'], select: ['type', 'ledgerId'],
    };
    if (typeof command.type !== 'string' || !Object.hasOwn(fields, command.type)) {
      hold('ERR_INPUT', 'choose an exact load, retry, inspect or select command.');
    }
    exactRecord(command, fields[command.type], 'ERR_INPUT');
    if (command.type === 'load' && command.checkoutId !== INTENT.checkoutId) {
      hold('ERR_INPUT', 'checkout token must be exactly CHECKOUT-DEMO-01; no coercion or trimming.');
    }
    if (command.type === 'select' && (typeof command.ledgerId !== 'string' || !LEDGER_IDS.includes(command.ledgerId))) {
      hold('ERR_INPUT', 'choose an exact fixed ledger ID after inspection.');
    }
    return copy(command);
  }
  function recordMatches(records, idField, id) {
    if (records === null) return null;
    return records.length === 1 && records.every((record) =>
      record[idField] === id && record.orderId === INTENT.orderId
      && record.checkoutId === INTENT.checkoutId && record.clientId === INTENT.clientId
      && record.cartId === INTENT.cartId && record.key === INTENT.key);
  }
  function measure(ledgerId, runId) {
    const ledger = LEDGERS[ledgerId];
    const orderCorrect = recordMatches(ledger.orders, 'orderId', INTENT.orderId);
    const effectCorrect = recordMatches(ledger.effects, 'effectId', INTENT.effectId);
    const paymentCorrect = recordMatches(ledger.payments, 'paymentId', INTENT.paymentId);
    const identityPreserved = ledger.finalState === null ? null : ledger.finalState.clientId === INTENT.clientId;
    const statePreserved = ledger.finalState === null ? null
      : ledger.finalState.checkoutId === INTENT.checkoutId && ledger.finalState.cartId === INTENT.cartId;
    const sameKey = ledger.retry.key === INITIAL.key;
    const response = ledger.retry.response;
    const responseCorrect = response === null ? null
      : ledger.retry.ack === 'present' && response.statusCode === 200 && response.result === 'recorded'
      && response.orderId === INTENT.orderId && response.checkoutId === INTENT.checkoutId
      && response.clientId === INTENT.clientId && response.cartId === INTENT.cartId;
    const checks = {
      ORDER_MISMATCH_OR_COUNT: orderCorrect, EFFECT_MISMATCH_OR_COUNT: effectCorrect,
      PAYMENT_MARKER_MISMATCH_OR_COUNT: paymentCorrect, KEY_CHANGED: sameKey,
      IDENTITY_CHANGED: identityPreserved, STATE_CHANGED: statePreserved, CLIENT_RESULT_MISMATCH: responseCorrect,
    };
    const knownFailures = Object.keys(checks).filter((key) => checks[key] === false);
    const finalUnknowns = Object.keys(checks).filter((key) => checks[key] === null);
    const outcome = knownFailures.length ? 'negative' : finalUnknowns.length ? 'unknown' : 'positive';
    const correctness = [orderCorrect, effectCorrect, paymentCorrect, identityPreserved, statePreserved];
    return {
      runId, ledgerId, measuredFrom: 'fixed-fictional-ledger', outcome,
      counts: {
        orders: ledger.orders === null ? null : ledger.orders.length,
        effects: ledger.effects === null ? null : ledger.effects.length,
        paymentMarkers: ledger.payments === null ? null : ledger.payments.length,
        attempts: 2,
      },
      oneCorrectOrder: correctness.includes(false) ? false : correctness.includes(null) ? null : true,
      sameKey, identityPreserved, statePreserved, retryAck: ledger.retry.ack,
      clientOutcome: responseCorrect === null ? 'unresolved' : outcome === 'positive' ? 'correct' : 'incorrect',
      interruptionCount: 1, initialInterruption: INITIAL.interruption,
      unknownObservations: [
        'first response (lost)',
        'first attempt effect outcome at response-loss boundary',
        ...finalUnknowns,
        ...(ledger.retry.ack === 'missing' ? ['retry acknowledgement missing; client completion unresolved'] : []),
      ],
      reasonCodes: [
        'RESPONSE_LOSS_RETAINED', ...knownFailures,
        ...(finalUnknowns.length ? ['EXPLICIT_UNRESOLVED_OUTCOME'] : []),
        ...(outcome === 'positive' ? ['ONE_CORRECT_ORDER_AND_CLIENT_RESULT'] : []),
      ],
    };
  }
  function createState() {
    return freeze({ version: 1, phase: 'ready', active: null, history: [], runs: [] });
  }
  function apply(state, command) {
    if (state.history.length >= MAX_ACTIONS) hold('ERR_LIMIT', 'sixteen actions reached; explicit reset is required.');
    const next = copy(state);
    switch (command.type) {
      case 'load':
        if (!['ready', 'measured'].includes(state.phase)) hold('ERR_STATE', 'finish the current run before loading another.');
        if (state.runs.length >= MAX_RUNS) hold('ERR_LIMIT', 'four measured runs reached; explicit reset is required.');
        next.active = {
          checkoutId: INTENT.checkoutId, initial: copy(INITIAL), retryRevealed: false,
          inspected: false, ledgerId: null, result: null,
        };
        next.phase = 'lost';
        break;
      case 'retry':
        if (state.phase !== 'lost') hold('ERR_STATE', 'load response-loss DATA before revealing retry DATA.');
        next.active.retryRevealed = true;
        next.phase = 'retried';
        break;
      case 'inspect':
        if (state.phase !== 'retried') hold('ERR_STATE', 'reveal retry DATA before inspecting its alternative ledgers.');
        next.active.inspected = true;
        next.phase = 'inspected';
        break;
      case 'select':
        if (state.phase !== 'inspected') hold('ERR_STATE', 'inspect all fixed ledger observations before measuring a selection.');
        next.active.ledgerId = command.ledgerId;
        next.active.result = measure(command.ledgerId, next.runs.length + 1);
        next.runs.push(copy(next.active.result));
        next.phase = 'measured';
        break;
    }
    next.history.push({ sequence: next.history.length + 1, command: copy(command) });
    return freeze(next);
  }
  function equivalent(left, right) {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left).sort();
    const other = Object.keys(right).sort();
    return keys.length === other.length && keys.every((key, index) => key === other[index] && equivalent(left[key], right[key]));
  }
  function validateState(state) {
    dataOnly(state, 'ERR_STATE');
    exactRecord(state, ['version', 'phase', 'active', 'history', 'runs'], 'ERR_STATE');
    if (state.version !== 1 || !['ready', 'lost', 'retried', 'inspected', 'measured'].includes(state.phase)
        || !Array.isArray(state.history) || state.history.length > MAX_ACTIONS || !Array.isArray(state.runs)) {
      hold('ERR_STATE', 'unsupported state version, phase or history budget.');
    }
    let replay = createState();
    for (const [index, event] of state.history.entries()) {
      exactRecord(event, ['sequence', 'command'], 'ERR_STATE');
      if (event.sequence !== index + 1) hold('ERR_STATE', 'history sequence must be complete and ordered.');
      try {
        replay = apply(replay, commandData(event.command));
      } catch {
        hold('ERR_STATE', 'retained history cannot be replayed under the fixed contract.');
      }
    }
    if (!equivalent(state, replay)) hold('ERR_STATE', 'phase, observations and results must exactly match retained history replay.');
  }
  function execute(state, command) {
    validateState(state);
    return apply(state, commandData(command));
  }
  return freeze({ INTENT, INITIAL, LEDGERS, LEDGER_IDS, MAX_ACTIONS, MAX_RUNS, createState, execute });
});
