(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SessionSerialization = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_ACTIONS = 12;
  const MAX_RUNS = 12;
  const MAX_PAYLOAD_LENGTH = 2048;
  const READERS = ['dual', 'schema2-only', 'reset-on-error'];
  const WRITERS = ['schema1', 'schema2'];
  const PAYLOADS = ['intact', 'malformed', 'unavailable'];

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const EXPECTED = freeze({
    sessionId: 'synthetic-session-037',
    cart: [{ sku: 'DEMO-PEN', quantity: 2 }],
    checkoutStep: 2,
  });
  const EMPTY = freeze({
    sessionId: 'synthetic-session-037', cart: [], checkoutStep: 0,
  });
  function keys(value, names) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && Reflect.ownKeys(value).length === names.length
      && names.every((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
      });
  }
  function selection(value) {
    if (!keys(value, ['reader', 'writer', 'payload'])
        || Object.getPrototypeOf(value) !== Object.prototype
        || !READERS.includes(value.reader) || !WRITERS.includes(value.writer)
        || !PAYLOADS.includes(value.payload)) {
      throw new RangeError('Choose one declared reader, writer and payload condition.');
    }
    return freeze({ reader: value.reader, writer: value.writer, payload: value.payload });
  }
  function encodePayload(writer) {
    if (!WRITERS.includes(writer)) throw new RangeError('Unknown writer format.');
    return writer === 'schema1'
      ? JSON.stringify({ schema: 1, ...EXPECTED })
      : JSON.stringify({
        schema: 2, session: EXPECTED.sessionId,
        items: EXPECTED.cart.map((item) => ({ code: item.sku, units: item.quantity })),
        flow: { step: EXPECTED.checkoutStep },
      });
  }
  const OLD_BYTES = encodePayload('schema1');
  const MALFORMED_BYTES = '{"schema":1,"sessionId":';
  function validSession(value) {
    return typeof value === 'string' && /^synthetic-session-\d{3}$/.test(value);
  }
  function validStep(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 4;
  }
  function validItems(items, skuKey, quantityKey) {
    return Array.isArray(items) && items.length <= 4
      && items.every((item) => keys(item, [skuKey, quantityKey])
        && typeof item[skuKey] === 'string' && /^DEMO-[A-Z]{1,12}$/.test(item[skuKey])
        && Number.isSafeInteger(item[quantityKey])
        && item[quantityKey] >= 1 && item[quantityKey] <= 99);
  }
  function canonical(payload) {
    if (payload.schema === 1
        && keys(payload, ['schema', 'sessionId', 'cart', 'checkoutStep'])
        && validSession(payload.sessionId) && validItems(payload.cart, 'sku', 'quantity')
        && validStep(payload.checkoutStep)) {
      return {
        sessionId: payload.sessionId,
        cart: payload.cart.map((item) => ({ sku: item.sku, quantity: item.quantity })),
        checkoutStep: payload.checkoutStep,
      };
    }
    if (payload.schema === 2
        && keys(payload, ['schema', 'session', 'items', 'flow'])
        && validSession(payload.session) && validItems(payload.items, 'code', 'units')
        && keys(payload.flow, ['step']) && validStep(payload.flow.step)) {
      return {
        sessionId: payload.session,
        cart: payload.items.map((item) => ({ sku: item.code, quantity: item.units })),
        checkoutStep: payload.flow.step,
      };
    }
    return null;
  }
  function readPayload(reader, bytes) {
    if (!['legacy', ...READERS].includes(reader)) throw new RangeError('Unknown reader.');
    const outcome = (status, reason, observed = null, reset = false, schema = null) =>
      freeze({ reader, status, reason, observed, reset, schema, payload: typeof bytes === 'string' ? bytes : null });
    if (bytes === null) return outcome('unknown', 'Payload unavailable: readability is unverified.');
    if (typeof bytes !== 'string' || bytes.length < 1 || bytes.length > MAX_PAYLOAD_LENGTH) {
      return outcome('rejected', 'Payload must be nonempty JSON of at most 2048 characters.');
    }
    let payload;
    try { payload = JSON.parse(bytes); } catch {
      return outcome('rejected', 'Malformed JSON: explicit read failure, no replacement session.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || ![1, 2].includes(payload.schema)) {
      return outcome('rejected', 'Unsupported schema envelope.');
    }
    const decoded = canonical(payload);
    if (!decoded) return outcome('rejected', 'Invalid payload shape, field type or bound.', null, false, payload.schema);
    const supported = reader === 'dual'
      || (reader === 'legacy' ? payload.schema === 1 : payload.schema === 2);
    if (!supported && reader !== 'reset-on-error') {
      return outcome('rejected', `Reader ${reader} cannot read schema ${payload.schema}.`, null, false, payload.schema);
    }
    const reset = !supported && reader === 'reset-on-error';
    const observed = reset ? EMPTY : decoded;
    if (JSON.stringify(observed) !== JSON.stringify(EXPECTED)) {
      return outcome('lost', reset
        ? 'Silent reset detected: expected cart quantity 2 and checkout step 2 were discarded.'
        : 'Decoded state differs from the declared session, cart or checkout step.',
      observed, reset, payload.schema);
    }
    return outcome('preserved', 'Every declared session field matches.', observed, false, payload.schema);
  }

  function createLesson() {
    let activeVersion = 'v1';
    let run = 1;
    let candidatePayload = null;
    let committedSettings = null;
    let current = null;
    const history = [];
    function capacity() {
      if (history.length >= MAX_ACTIONS) {
        throw new RangeError('The 12-action evidence limit is reached. History is retained; reload for a new page lifetime.');
      }
    }
    function record(action, settings, rows, existingPayload, writerPayload, target) {
      const successful = rows.filter((row) => row.status === 'preserved').length;
      const unknown = rows.filter((row) => row.status === 'unknown').length;
      const failed = rows.length - successful - unknown;
      const verdict = failed > 0 ? 'failure' : unknown > 0 ? 'unknown' : 'success';
      const applied = verdict === 'success';
      const result = freeze({
        attempt: history.length + 1, run, action, settings,
        activeBefore: activeVersion, activeAfter: applied ? target : activeVersion,
        verdict, applied, readCount: rows.length, successful, failed, unknown,
        resetSignals: rows.filter((row) => row.reset).length,
        userOutcome: applied ? 'synthetic-state-preserved' : 'safe-abort-before-exposure',
        cleanup: 'No resources created; in-memory evidence retained.',
        expected: EXPECTED, existingPayload, writerPayload, fixturePayload: OLD_BYTES, rows,
      });
      history.push(result);
      current = result;
      activeVersion = result.activeAfter;
      return result;
    }
    function transition(input) {
      const settings = selection(input);
      capacity();
      if (activeVersion !== 'v1') throw new Error('Transition requires v1 active. Roll back or reset first.');
      const existingPayload = settings.payload === 'intact' ? OLD_BYTES
        : settings.payload === 'malformed' ? MALFORMED_BYTES : null;
      const writerPayload = encodePayload(settings.writer);
      const probe = (name, reader, bytes) => freeze({ name, ...readPayload(reader, bytes) });
      const rows = [
        probe('v2 reads existing v1 payload', settings.reader, existingPayload),
        probe('v2 reads its candidate output', settings.reader, writerPayload),
        probe('v1 reads candidate output (coexistence / rollback)', 'legacy', writerPayload),
      ];
      const result = record('transition', settings, rows, existingPayload, writerPayload, 'v2');
      if (result.applied) {
        candidatePayload = writerPayload;
        committedSettings = settings;
      }
      return result;
    }
    function rollback() {
      capacity();
      if (activeVersion !== 'v2' || candidatePayload === null) {
        throw new Error('Rollback requires a successful transition with v2 active.');
      }
      const rows = [freeze({
        name: 'v1 rereads the retained candidate output',
        ...readPayload('legacy', candidatePayload),
      })];
      const result = record('rollback', committedSettings, rows, OLD_BYTES, candidatePayload, 'v1');
      if (result.applied) {
        candidatePayload = null;
        committedSettings = null;
      }
      return result;
    }
    function snapshot() {
      return freeze({
        activeVersion, run, current, history: history.slice(),
        fixturePayload: OLD_BYTES, candidatePayload,
        limits: { actions: MAX_ACTIONS, runs: MAX_RUNS },
        totals: history.reduce((total, result) => ({
          successful: total.successful + result.successful,
          failed: total.failed + result.failed,
          unknown: total.unknown + result.unknown,
          resetSignals: total.resetSignals + result.resetSignals,
        }), { successful: 0, failed: 0, unknown: 0, resetSignals: 0 }),
      });
    }
    function reset() {
      if (run >= MAX_RUNS) throw new RangeError('The 12-run limit is reached. Reload for a new page lifetime.');
      run += 1;
      activeVersion = 'v1';
      candidatePayload = null;
      committedSettings = null;
      current = null;
      return snapshot();
    }
    return Object.freeze({ transition, rollback, reset, snapshot });
  }
  return freeze({ createLesson, readPayload, encodePayload, EXPECTED, MAX_ACTIONS, MAX_RUNS });
}));
