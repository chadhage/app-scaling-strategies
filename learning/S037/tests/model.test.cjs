'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createLesson, readPayload, encodePayload, EXPECTED, MAX_ACTIONS, MAX_RUNS,
} = require('../model.js');
const compatible = () => ({ reader: 'dual', writer: 'schema1', payload: 'intact' });
const clone = (value) => JSON.parse(JSON.stringify(value));

test('compatible mixed readers preserve existing state before transition', () => {
  assert.equal(typeof createLesson, 'function');
  const result = createLesson().transition({
    reader: 'dual', writer: 'schema1', payload: 'intact',
  });
  assert.equal(result.verdict, 'success');
  assert.equal(result.successful, 3);
  assert.equal(result.failed, 0);
  assert.equal(result.unknown, 0);
  assert.equal(result.applied, true);
  assert.equal(result.activeAfter, 'v2');
  assert.equal(result.rows.length, 3);
  result.rows.forEach((row) => assert.deepEqual(row.observed, EXPECTED));
});

test('initial state has no observations and declares finite limits', () => {
  const state = createLesson().snapshot();
  assert.equal(state.activeVersion, 'v1');
  assert.equal(state.run, 1);
  assert.equal(state.current, null);
  assert.equal(state.history.length, 0);
  assert.deepEqual(state.totals, { successful: 0, failed: 0, unknown: 0, resetSignals: 0 });
  assert.deepEqual(state.limits, { actions: 12, runs: 12 });
});

test('rollback rereads candidate bytes with the old reader and retains both results', () => {
  const lesson = createLesson();
  const settings = compatible();
  const forward = lesson.transition(settings);
  settings.writer = 'schema2';
  const back = lesson.rollback();
  assert.equal(back.verdict, 'success');
  assert.equal(back.action, 'rollback');
  assert.equal(back.readCount, 1);
  assert.equal(back.activeBefore, 'v2');
  assert.equal(back.activeAfter, 'v1');
  assert.equal(back.writerPayload, forward.writerPayload);
  assert.equal(back.settings.writer, 'schema1');
  assert.equal(back.rows[0].reader, 'legacy');
  assert.deepEqual(back.rows[0].observed, EXPECTED);
  assert.deepEqual(lesson.snapshot().history, [forward, back]);
});

test('schema-2-only candidate fails existing and candidate schema 1 reads', () => {
  const lesson = createLesson();
  const result = lesson.transition({ ...compatible(), reader: 'schema2-only' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.successful, 1);
  assert.equal(result.failed, 2);
  assert.equal(result.unknown, 0);
  assert.equal(result.resetSignals, 0);
  assert.equal(result.applied, false);
  assert.equal(result.userOutcome, 'safe-abort-before-exposure');
  assert.equal(lesson.snapshot().activeVersion, 'v1');
});

test('new-schema writes block coexistence and rollback despite two good candidate reads', () => {
  const result = createLesson().transition({ ...compatible(), writer: 'schema2' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.successful, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.rows[2].status, 'rejected');
  assert.match(result.rows[2].reason, /legacy cannot read schema 2/);
  assert.equal(result.activeAfter, 'v1');
});

test('silent resets expose empty cart and reset step as data loss, never success', () => {
  const result = createLesson().transition({ ...compatible(), reader: 'reset-on-error' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.resetSignals, 2);
  assert.equal(result.failed, 2);
  assert.equal(result.successful, 1);
  for (const row of result.rows.slice(0, 2)) {
    assert.equal(row.status, 'lost');
    assert.equal(row.reset, true);
    assert.deepEqual(row.observed.cart, []);
    assert.equal(row.observed.checkoutStep, 0);
    assert.match(row.reason, /Silent reset detected/);
  }
  assert.equal(result.fixturePayload, encodePayload('schema1'));
  assert.equal(result.existingPayload, encodePayload('schema1'));
});

test('unavailable is unknown, malformed is a known failure, neither permits transition', () => {
  const missing = createLesson().transition({ ...compatible(), payload: 'unavailable' });
  const broken = createLesson().transition({ ...compatible(), payload: 'malformed' });
  assert.equal(missing.verdict, 'unknown');
  assert.equal(missing.unknown, 1);
  assert.equal(missing.failed, 0);
  assert.equal(missing.successful, 2);
  assert.equal(missing.rows[0].observed, null);
  assert.equal(broken.verdict, 'failure');
  assert.equal(broken.failed, 1);
  assert.equal(broken.unknown, 0);
  assert.match(broken.rows[0].reason, /Malformed JSON/);
  assert.equal(broken.resetSignals, 0);
  assert.equal(missing.applied, false);
  assert.equal(broken.applied, false);
});

test('a known failure does not hide a simultaneous unknown observation', () => {
  const result = createLesson().transition({
    reader: 'schema2-only', writer: 'schema1', payload: 'unavailable',
  });
  assert.equal(result.verdict, 'failure');
  assert.deepEqual([result.successful, result.failed, result.unknown], [1, 1, 1]);
});

for (const reader of ['dual', 'schema2-only', 'reset-on-error']) {
  for (const writer of ['schema1', 'schema2']) {
    for (const payload of ['intact', 'malformed', 'unavailable']) {
      test(`deterministic full configuration matrix: ${reader}/${writer}/${payload}`, () => {
        const settings = { reader, writer, payload };
        const input = JSON.stringify(settings);
        const first = createLesson().transition(settings);
        const second = createLesson().transition(settings);
        assert.deepEqual(first, second);
        assert.equal(JSON.stringify(settings), input);
        assert.equal(first.readCount, 3);
        assert.equal(first.successful + first.failed + first.unknown, 3);
        assert.equal(first.fixturePayload, encodePayload('schema1'));
        const expectedPass = reader === 'dual' && writer === 'schema1' && payload === 'intact';
        assert.equal(first.applied, expectedPass);
        assert.equal(first.activeAfter, expectedPass ? 'v2' : 'v1');
      });
    }
  }
}

test('later good reads and reset preserve earlier failures without claiming current evidence', () => {
  const lesson = createLesson();
  const failed = lesson.transition({ ...compatible(), writer: 'schema2' });
  const good = lesson.transition(compatible());
  const reset = lesson.reset();
  assert.equal(reset.run, 2);
  assert.equal(reset.activeVersion, 'v1');
  assert.equal(reset.current, null);
  assert.equal(reset.candidatePayload, null);
  assert.deepEqual(reset.history, [failed, good]);
  assert.equal(reset.totals.failed, 1);
  assert.equal(reset.totals.successful, 5);
  assert.equal(reset.fixturePayload, encodePayload('schema1'));
  assert.equal(failed.verdict, 'failure');
});

const invalidSettings = [
  undefined, null, '', [], {}, { reader: 'dual' }, { ...compatible(), reader: 'DUAL' },
  { ...compatible(), writer: 1 }, { ...compatible(), payload: 'custom' },
  { ...compatible(), extra: true }, { ...compatible(), [Symbol('extra')]: true },
  Object.assign(Object.create({ inherited: true }), compatible()),
  Object.assign(Object.create(null), compatible()),
];
invalidSettings.forEach((input, index) => {
  test(`invalid settings ${index + 1} leave all state untouched`, () => {
    const lesson = createLesson();
    const before = lesson.snapshot();
    assert.throws(() => lesson.transition(input), /declared reader, writer and payload/);
    assert.deepEqual(lesson.snapshot(), before);
  });
});

test('accessor settings are rejected without invoking their getters', () => {
  let invoked = false;
  const input = { writer: 'schema1', payload: 'intact' };
  Object.defineProperty(input, 'reader', {
    enumerable: true, get() { invoked = true; return 'dual'; },
  });
  assert.throws(() => createLesson().transition(input), RangeError);
  assert.equal(invoked, false);
});

test('wrong-state commands and invalid commands after success preserve the full snapshot', () => {
  const lesson = createLesson();
  const before = lesson.snapshot();
  assert.throws(() => lesson.rollback(), /requires a successful transition/);
  assert.deepEqual(lesson.snapshot(), before);
  lesson.transition(compatible());
  const active = lesson.snapshot();
  assert.throws(() => lesson.transition(compatible()), /requires v1 active/);
  assert.throws(() => lesson.transition({ ...compatible(), payload: 'invalid' }), RangeError);
  assert.deepEqual(lesson.snapshot(), active);
});

test('12-action limit rejects further actions without evicting records or reset bypass', () => {
  const lesson = createLesson();
  for (let count = 0; count < MAX_ACTIONS; count += 1) {
    lesson.transition({ ...compatible(), writer: 'schema2' });
  }
  const before = lesson.snapshot();
  assert.equal(before.history.length, 12);
  assert.equal(before.history[0].attempt, 1);
  assert.throws(() => lesson.transition(compatible()), /12-action/);
  assert.throws(() => lesson.rollback(), /12-action/);
  assert.deepEqual(lesson.snapshot(), before);
  lesson.reset();
  const reset = lesson.snapshot();
  assert.equal(reset.current, null);
  assert.deepEqual(reset.history, before.history);
  assert.throws(() => lesson.transition(compatible()), /12-action/);
  assert.deepEqual(lesson.snapshot(), reset);
});

test('12-run limit rejects reset non-destructively', () => {
  const lesson = createLesson();
  for (let run = 1; run < MAX_RUNS; run += 1) lesson.reset();
  const before = lesson.snapshot();
  assert.equal(before.run, 12);
  assert.throws(() => lesson.reset(), /12-run/);
  assert.deepEqual(lesson.snapshot(), before);
});

test('returned history, decoded observations and expected fixture are deeply immutable', () => {
  const lesson = createLesson();
  const result = lesson.transition(compatible());
  const state = lesson.snapshot();
  assert.throws(() => state.history.push(result), TypeError);
  assert.throws(() => result.rows[0].observed.cart[0].quantity = 99, TypeError);
  assert.throws(() => EXPECTED.cart[0].sku = 'DEMO-OTHER', TypeError);
  assert.throws(() => result.settings.writer = 'schema2', TypeError);
  assert.equal(lesson.snapshot().history.length, 1);
  assert.equal(lesson.snapshot().fixturePayload, encodePayload('schema1'));
});

test('real JSON serializers roundtrip both supported envelopes without coercion', () => {
  for (const writer of ['schema1', 'schema2']) {
    const bytes = encodePayload(writer);
    assert.equal(typeof bytes, 'string');
    assert.deepEqual(readPayload('dual', bytes).observed, EXPECTED);
    assert.equal(readPayload('dual', bytes).status, 'preserved');
  }
  assert.equal(readPayload('legacy', encodePayload('schema1')).status, 'preserved');
  assert.equal(readPayload('schema2-only', encodePayload('schema2')).status, 'preserved');
  assert.equal(readPayload('reset-on-error', encodePayload('schema2')).reset, false);
  assert.throws(() => encodePayload('schema3'), RangeError);
  assert.throws(() => readPayload('anything', null), RangeError);
});

test('untrusted payload shape, type, version and size guards fail explicitly', () => {
  const bad = [
    undefined, 0, true, {}, '', 'x'.repeat(2049), '{', 'null', '[]', '{}',
    '{"schema":3}', '{"schema":"1"}',
  ];
  for (const bytes of bad) assert.equal(readPayload('dual', bytes).status, 'rejected');
  assert.equal(readPayload('dual', null).status, 'unknown');
  const callerObject = {};
  readPayload('dual', callerObject);
  assert.equal(Object.isFrozen(callerObject), false);
});

test('missing, extra and invalid nested fields are not silently defaulted', () => {
  const original = JSON.parse(encodePayload('schema1'));
  const variants = [
    { ...original, extra: true }, { ...original, schema: '1' },
    { ...original, sessionId: null }, { ...original, checkoutStep: '2' },
    { ...original, checkoutStep: -1 }, { ...original, checkoutStep: 5 },
    { ...original, cart: null }, { ...original, cart: [{ sku: 'DEMO-PEN', quantity: '2' }] },
    { ...original, cart: [{ sku: 'DEMO-PEN', quantity: 0 }] },
    { ...original, cart: [{ sku: 'DEMO-PEN', quantity: 100 }] },
    { ...original, cart: [{ sku: 'DEMO-PEN', quantity: 2, extra: true }] },
    { ...original, cart: Array(5).fill(original.cart[0]) },
  ];
  const missing = clone(original);
  delete missing.checkoutStep;
  variants.push(missing);
  for (const payload of variants) {
    assert.equal(readPayload('dual', JSON.stringify(payload)).status, 'rejected');
  }
  const modern = JSON.parse(encodePayload('schema2'));
  for (const payload of [
    { ...modern, flow: { step: 2, extra: true } },
    { ...modern, flow: { step: 2.5 } },
    { ...modern, items: [{ code: 'DEMO-PEN', units: 2, extra: true }] },
    { ...modern, items: [{ code: 'REAL-CREDENTIAL', units: 2 }] },
  ]) {
    assert.equal(readPayload('dual', JSON.stringify(payload)).status, 'rejected');
  }
});

test('valid-but-different session, quantity, cart and step fail the state oracle', () => {
  const original = JSON.parse(encodePayload('schema1'));
  for (const payload of [
    { ...original, sessionId: 'synthetic-session-999' },
    { ...original, cart: [{ sku: 'DEMO-PEN', quantity: 1 }] },
    { ...original, cart: [] }, { ...original, checkoutStep: 0 },
  ]) {
    const result = readPayload('dual', JSON.stringify(payload));
    assert.equal(result.status, 'lost');
    assert.equal(result.reset, false);
  }
});
