'use strict';

// Hostile numbers, bodies and paths: every one is a typed refusal with no effect on any number of the books. The numbers are written as raw JSON text so
// that the exact token reaches the server (an exponent, `-0`, a leading zero and a digit string are all things JSON.parse would let through or round).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bookProblems, call, get, reserve, sequentialIds, withApp } = require('./helpers.cjs');

const post = (ctx, text, headers = {}) => call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/reservations', Buffer.from(text), headers);
const asUnits = (units) => `{"key":"key-hostile-001","tier":"standard","units":${units}}`;
const noEffect = async (ctx) => {
  assert.equal((await get(ctx, 'operator', '/v1/operator/pool')).json.pool.reservedUnits, 0);
  assert.deepEqual(await bookProblems(ctx), []);
};

const SYNTAX = ['+5', '05', '007', 'NaN', 'Infinity', '-Infinity', '0x10', '.5', '5.', '٥', '5 5'];
const VALUES = ['"5"', '[5]', '{"n":5}', 'null', 'true', 'false', '-1', '0', '-0', '1.5', '5.0', '1e1', '1E1', '0.5e1', '5e0', '1e400', '51', '9007199254740992', '9007199254740993', `1${'0'.repeat(399)}`];

test('a number that is not a plain integer inside the bounds is refused: syntax errors and wrong values each with a typed code', () => withApp({}, async (ctx) => {
  for (const units of SYNTAX) {
    const refused = await post(ctx, asUnits(units));
    assert.deepEqual([refused.status, refused.json.error.code, refused.headers.connection], [400, 'BODY_INVALID_JSON', 'close'], units);
  }
  for (const units of VALUES) {
    const refused = await post(ctx, asUnits(units));
    assert.deepEqual([refused.status, refused.json.error.code, refused.json.field], [400, 'INPUT_INVALID', 'units'], units.slice(0, 20));
  }
  await noEffect(ctx);
  assert.equal((await post(ctx, asUnits('1'))).status, 200);
  const top = await post(ctx, '{"key":"key-hostile-009","tier":"standard","units":50}');
  assert.deepEqual([top.status, top.json.error.code], [409, 'LEASE_CAP_EXCEEDED']);
}));

test('a string or number in the place of the tier, and a tier outside the price table, are refused', () => withApp({}, async (ctx) => {
  for (const tier of ['"gold"', '"Standard"', '"standard "', '1', 'null', '["standard"]', '{"a":1}', '"constructor"', '"__proto__"', '"toString"']) {
    const refused = await post(ctx, `{"key":"key-hostile-002","tier":${tier},"units":1}`);
    assert.deepEqual([refused.status, refused.json.error.code, refused.json.field], [400, 'INPUT_INVALID', 'tier'], tier);
  }
  await noEffect(ctx);
}));

const BODIES = [
  ['an array', '[]', 'BODY_NOT_OBJECT'], ['a string', '"x"', 'BODY_NOT_OBJECT'], ['a number', '5', 'BODY_NOT_OBJECT'], ['null', 'null', 'BODY_NOT_OBJECT'],
  ['an empty body', '', 'BODY_INVALID_JSON'], ['only spaces', '   ', 'BODY_INVALID_JSON'], ['a BOM', '\uFEFF{"key":"key-hostile-003","tier":"standard","units":1}', 'BODY_INVALID_JSON'],
  ['trailing text', `${asUnits(1)} x`, 'BODY_INVALID_JSON'], ['two documents', `${asUnits(1)}${asUnits(1)}`, 'BODY_INVALID_JSON'], ['a trailing comma', '{"key":"key-hostile-003","tier":"standard","units":1,}', 'BODY_INVALID_JSON'],
  ['single quotes', "{'key':'key-hostile-003'}", 'BODY_INVALID_JSON'], ['a comment', '{"key":"key-hostile-003"/*x*/,"tier":"standard","units":1}', 'BODY_INVALID_JSON'],
  ['a control character in a string', '{"key":"key-hostile\u0001003","tier":"standard","units":1}', 'BODY_INVALID_JSON'], ['a bad escape', '{"key":"key-hostile\\x003","tier":"standard","units":1}', 'BODY_INVALID_JSON'],
  ['a duplicate key', '{"key":"key-hostile-003","key":"key-hostile-004","tier":"standard","units":1}', 'BODY_INVALID_JSON'],
  ['a duplicate units, the second one hostile', '{"key":"key-hostile-003","tier":"standard","units":1,"units":999}', 'BODY_INVALID_JSON'],
  ['nesting beyond the depth', '{"a":[[[[[[[1]]]]]]]}', 'BODY_INVALID_JSON'], ['__proto__', '{"__proto__":{"units":99},"key":"key-hostile-003","tier":"standard","units":1}', 'INPUT_UNKNOWN_FIELD'],
  ['constructor', '{"constructor":{"prototype":{"units":99}},"key":"key-hostile-003","tier":"standard","units":1}', 'INPUT_UNKNOWN_FIELD'],
  ['another case of a field', '{"key":"key-hostile-003","tier":"standard","Units":1}', 'INPUT_UNKNOWN_FIELD'], ['a missing tier', '{"key":"key-hostile-003","units":1}', 'INPUT_MISSING_FIELD'],
  ['a missing units', '{"key":"key-hostile-003","tier":"standard"}', 'INPUT_MISSING_FIELD'], ['an empty object', '{}', 'INPUT_MISSING_FIELD']
];

test('a malformed or hostile body is a typed refusal that closes the connection and reserves nothing', () => withApp({}, async (ctx) => {
  for (const [label, text, code] of BODIES) {
    const refused = await post(ctx, text);
    assert.deepEqual([refused.status, refused.json.error.code, refused.headers.connection], [400, code, 'close'], label);
  }
  await noEffect(ctx);
  const polluted = {};
  assert.equal(polluted.units, undefined, 'a prototype was polluted');
}));

test('the media type, the size and a body where none belongs are refused', () => withApp({}, async (ctx) => {
  const wrong = await post(ctx, asUnits(1), { 'Content-Type': 'text/plain' });
  assert.deepEqual([wrong.status, wrong.json.error.code], [415, 'MEDIA_TYPE_UNSUPPORTED']);
  const big = await post(ctx, `{"key":"key-hostile-005","tier":"standard","units":1,"pad":"${'x'.repeat(5000)}"}`);
  assert.deepEqual([big.status, big.json.error.code], [413, 'BODY_TOO_LARGE']);
  const held = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
  const body = await call(ctx, ctx.tokens['conductor-a'], 'POST', `/v1/reservations/${held.id}/release`, '{}');
  assert.deepEqual([body.status, body.json.error.code], [400, 'UNEXPECTED_BODY']);
  const charset = await post(ctx, asUnits(1), { 'Content-Type': 'application/json; charset=utf-8' });
  assert.deepEqual([charset.status, charset.json.reservation.units], [200, 1]);
}));

const VARIANTS = ['/', '.', '%20', '%00', '%2e', '%2f', '%252f', '/extra', '?x=1', '%E2%80%8B'];

test('no variant of an own id reaches the reservation: trailing characters, encodings, case, look-alikes and long ids are typed refusals', () => withApp({ app: { newId: sequentialIds() } }, async (ctx) => {
  const held = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
  assert.equal(held.id, 'rsv-00000001');
  const paths = [
    ...VARIANTS.map((variant) => `/v1/reservations/${held.id}${variant}`), '/v1/reservations/RSV-00000001', '/v1/reservations/Rsv-00000001', '/v1/reservations/%72sv-00000001',
    '/v1/reservations/rsv%2D00000001', '/v1/reservations/rsv%E2%80%9000000001', '/v1/reservations/%EF%BD%92sv-00000001', `/v1/reservations/rsv-${'0'.repeat(100)}1`,
    '/v1/reservations/../reservations/rsv-00000001', '/v1/./reservations/rsv-00000001', '//v1/reservations/rsv-00000001', `/v1/reservations/rsv-${'a'.repeat(3000)}`, '/v1/reservations/rsv-00000001/release/'
  ];
  for (const route of paths) {
    const answer = await get(ctx, 'conductor-a', route);
    assert.ok([400, 404, 405, 414].includes(answer.status), `${route.slice(0, 60)} -> ${answer.status}`);
    assert.ok(answer.json.error, route.slice(0, 60));
    assert.equal(answer.headers.connection, 'close');
  }
  assert.equal((await get(ctx, 'conductor-a', `/v1/reservations/${held.id}`)).status, 200);
}));
