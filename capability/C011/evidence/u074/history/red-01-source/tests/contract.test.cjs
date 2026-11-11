'use strict';

// The contract as data: the closed route table, deny by default, the shapes of ids and keys, the query vocabulary and the body schemas.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');
const { parseStrict } = require('../json.cjs');

const ID = 'rsv-00000001';
const parsed = (text) => parseStrict(text).value;

test('the route table is closed and frozen, and every non-public route has a role entry and nothing else has', () => {
  assert.equal(Object.isFrozen(contract.routes) && contract.routes.every((route) => Object.isFrozen(route)), true);
  const names = [...new Set(contract.routes.map((route) => route.name))];
  assert.deepEqual(names, ['asset.index', 'asset.page', 'asset.style', 'scope', 'me', 'reservation.create', 'reservation.list', 'reservation.read', 'reservation.release', 'allowance', 'audit', 'batch', 'operator.pool', 'operator.audit']);
  const guarded = contract.routes.filter((route) => !route.public).map((route) => route.name);
  assert.deepEqual(Object.keys(contract.roleTable).sort(), [...guarded].sort());
  for (const [name, entry] of Object.entries(contract.roleTable)) {
    assert.equal(Object.isFrozen(entry) && Object.isFrozen(entry.roles), true, name);
    assert.ok(entry.roles.length > 0 && entry.roles.every((role) => contract.roles.includes(role)), name);
  }
  assert.deepEqual(contract.roleTable.me.roles, ['visitor', 'conductor', 'operator']);
  assert.deepEqual(contract.roleTable['operator.pool'].roles, ['operator']);
  assert.deepEqual(contract.roleTable['reservation.create'].roles, ['conductor']);
  for (const route of contract.routes) {
    assert.equal(route.mutating, route.method !== 'GET', route.name);
    assert.equal(route.body !== null, route.name === 'reservation.create' || route.name === 'batch', route.name);
    assert.equal(route.public, route.name.startsWith('asset.') || route.name === 'scope', route.name);
  }
  assert.deepEqual([contract.conductors, contract.tiers, contract.priceVersion], [['conductor-a', 'conductor-b'], ['standard', 'burst'], 'p1']);
});

test('resolve finds every route and its parameters, and nothing else', () => {
  const found = (path) => contract.resolve(path);
  assert.deepEqual(found(`/v1/reservations/${ID}`).routes.map((route) => route.name), ['reservation.read']);
  assert.deepEqual(found(`/v1/reservations/${ID}`).params, { id: ID });
  assert.deepEqual(found(`/v1/reservations/${ID}/release`).routes.map((route) => [route.name, route.method]), [['reservation.release', 'POST']]);
  assert.deepEqual(found('/v1/reservations').routes.map((route) => route.method).sort(), ['GET', 'POST']);
  assert.equal(contract.allowedMethods(found('/v1/reservations').routes), 'GET, POST');
  assert.equal(contract.allowedMethods(found('/v1/me').routes), 'GET');
  for (const path of ['/v1/reservations/', '/v1/reservations/rsv-1', '/v1/reservations/RSV-00000001', `/v1/reservations/${ID}/`, `/v1/reservations/${ID}/release/`, `/v1/reservations/${ID}/other`, `/v1/reservations/rsv-${'a'.repeat(33)}`,
    '/v1/Reservations', '/V1/me', '/v1/me/', '/v1', '', '/v1/operator', '/v1/operator/pool/x', '/scope.json/', '/index.html']) assert.deepEqual(found(path), { routes: [], params: {} }, path);
  for (const [path, name] of [['/', 'asset.index'], ['/page.js', 'asset.page'], ['/style.css', 'asset.style'], ['/scope.json', 'scope'], ['/v1/allowance', 'allowance'], ['/v1/audit', 'audit'], ['/v1/batch', 'batch'],
    ['/v1/operator/pool', 'operator.pool'], ['/v1/operator/audit', 'operator.audit'], [`/v1/reservations/rsv-${'f'.repeat(32)}`, 'reservation.read'], ['/v1/reservations/rsv-12345678', 'reservation.read']]) {
    assert.deepEqual(found(path).routes.map((route) => route.name), [name], path);
  }
  assert.equal(contract.isId(ID), true);
  for (const value of ['rsv-1234567', `rsv-${'a'.repeat(33)}`, 'rsv-0000000g', 'RSV-00000001', ' rsv-00000001', 'rsv-00000001\n', 7, null, undefined, {}, []]) assert.equal(contract.isId(value), false, String(value));
  assert.equal(contract.isKey('abcdefgh'), true);
  for (const value of ['abcdefg', 'a'.repeat(65), '-abcdefgh', 'abcdefg h', 'abcdefgh\n', 'abcdefghé', 7, null, undefined]) assert.equal(contract.isKey(value), false, String(value));
  assert.equal(contract.isKey('a'.repeat(64)), true);
});

test('the query vocabulary is closed per route', () => {
  const list = contract.routes.find((route) => route.name === 'reservation.list');
  const audit = contract.routes.find((route) => route.name === 'audit');
  const me = contract.routes.find((route) => route.name === 'me');
  const query = (route, raw) => contract.parseQuery(route, raw);
  assert.deepEqual(query(list, ''), { ok: true, value: { limit: 20, offset: 0, state: null } });
  assert.deepEqual(query(list, 'limit=50&offset=1000&state=expired'), { ok: true, value: { limit: 50, offset: 1000, state: 'expired' } });
  assert.deepEqual(query(audit, 'limit=1'), { ok: true, value: { limit: 1, offset: 0, state: null } });
  for (const raw of ['limit=0', 'limit=51', 'limit=100', 'limit=-1', 'limit=+1', 'limit=1.0', 'limit=', 'limit', 'offset=1001', 'offset=10000', 'offset=-1', 'state=bogus', 'state=Reserved', 'state=', 'x=1', 'limit=1&limit=1', 'state=expired&state=expired', 'LIMIT=1']) {
    assert.deepEqual(query(list, raw), { ok: false, code: 'QUERY_REJECTED' }, raw);
  }
  assert.deepEqual(query(audit, 'state=reserved'), { ok: false, code: 'QUERY_REJECTED' });
  assert.deepEqual(query(me, ''), { ok: true, value: {} });
  assert.deepEqual(query(me, 'x=1'), { ok: false, code: 'QUERY_NOT_ALLOWED' });
});

test('the reserve body: exactly key, tier and units, in closed shapes, with the claims and server fields named', () => {
  const check = (text) => contract.validateBody('reserve', parsed(text));
  assert.deepEqual(check('{"key":"key-00000001","tier":"burst","units":50}'), { ok: true, value: { key: 'key-00000001', tier: 'burst', units: 50 } });
  assert.deepEqual(check('{"units":1,"tier":"standard","key":"key-00000001"}').value, { key: 'key-00000001', tier: 'standard', units: 1 });
  const refusal = (text, code, field) => assert.deepEqual(check(text), field === undefined ? { ok: false, code } : { ok: false, code, field }, text);
  refusal('{"key":"key-00000001","tier":"standard","units":0}', 'INPUT_INVALID', 'units');
  refusal('{"key":"key-00000001","tier":"standard","units":51}', 'INPUT_INVALID', 'units');
  refusal('{"key":"key-00000001","tier":"standard","units":1.5}', 'INPUT_INVALID', 'units');
  refusal('{"key":"key-00000001","tier":"standard","units":1e0}', 'INPUT_INVALID', 'units');
  refusal('{"key":"key-00000001","tier":"nope","units":1}', 'INPUT_INVALID', 'tier');
  refusal('{"key":"short","tier":"standard","units":1}', 'INPUT_INVALID', 'key');
  refusal('{"tier":"standard","units":1}', 'INPUT_MISSING_FIELD', 'key');
  refusal('{"key":"key-00000001","units":1}', 'INPUT_MISSING_FIELD', 'tier');
  refusal('{"key":"key-00000001","tier":"standard"}', 'INPUT_MISSING_FIELD', 'units');
  refusal('{"key":"key-00000001","tier":"standard","units":1,"extra":1}', 'INPUT_UNKNOWN_FIELD');
  refusal('{"key":"key-00000001","tier":"standard","units":1,"owner":"x"}', 'IDENTITY_CLAIM_REJECTED', 'owner');
  refusal('{"key":"key-00000001","tier":"standard","units":1,"spend":1}', 'SERVER_FIELD_REJECTED', 'spend');
  for (const name of contract.serverFields) refusal(`{"key":"key-00000001","tier":"standard","units":1,"${name}":1}`, 'SERVER_FIELD_REJECTED', name);
  for (const name of contract.claimFields) refusal(`{"key":"key-00000001","tier":"standard","units":1,"${name}":1}`, 'IDENTITY_CLAIM_REJECTED', name);
  for (const text of ['[]', '5', '"x"', 'null', 'true']) refusal(text, 'BODY_NOT_OBJECT');
  assert.deepEqual(contract.validateBody('reserve', undefined), { ok: false, code: 'BODY_NOT_OBJECT' });
});

test('the batch body: one to five operations, each a closed reserve or release', () => {
  const check = (text) => contract.validateBody('batch', parsed(text));
  const op = '{"op":"reserve","key":"key-00000001","tier":"standard","units":1}';
  assert.deepEqual(check(`{"ops":[${op},{"op":"release","id":"${ID}"}]}`), { ok: true, value: { ops: [{ op: 'reserve', key: 'key-00000001', tier: 'standard', units: 1 }, { op: 'release', id: ID }] } });
  assert.equal(check(`{"ops":[${[1, 2, 3, 4, 5].map(() => op).join(',')}]}`).ok, true);
  for (const [text, code, field] of [['{"ops":[]}', 'INPUT_INVALID', 'ops'], [`{"ops":[${[1, 2, 3, 4, 5, 6].map(() => op).join(',')}]}`, 'INPUT_INVALID', 'ops'], ['{"ops":{}}', 'INPUT_INVALID', 'ops'], ['{"ops":[5]}', 'INPUT_INVALID', 'ops'],
    ['{"ops":[null]}', 'INPUT_INVALID', 'ops'], ['{"ops":[[]]}', 'INPUT_INVALID', 'ops'], ['{"ops":[{"op":"drop"}]}', 'INPUT_INVALID', 'op'], ['{"ops":[{"op":5}]}', 'INPUT_INVALID', 'op'], ['{"ops":[{}]}', 'INPUT_INVALID', 'op'],
    ['{"ops":[{"op":"constructor"}]}', 'INPUT_INVALID', 'op'], ['{"ops":[{"op":"release"}]}', 'INPUT_MISSING_FIELD', 'id'], [`{"ops":[{"op":"release","id":"x"}]}`, 'INPUT_INVALID', 'id'],
    [`{"ops":[{"op":"release","id":"${ID}","key":"key-00000001"}]}`, 'INPUT_UNKNOWN_FIELD'], [`{"ops":[{"op":"release","id":"${ID}","owner":"x"}]}`, 'IDENTITY_CLAIM_REJECTED', 'owner'],
    ['{"ops":[{"op":"reserve","key":"key-00000001","tier":"standard","units":1,"id":"x"}]}', 'SERVER_FIELD_REJECTED', 'id'], ['{"ops":[{"op":"reserve","key":"key-00000001","tier":"standard"}]}', 'INPUT_MISSING_FIELD', 'units'],
    ['{"ops":[{"op":"reserve","key":"key-00000001","tier":"gold","units":1}]}', 'INPUT_INVALID', 'tier'], ['{}', 'INPUT_MISSING_FIELD', 'ops'], ['{"ops":[],"owner":"x"}', 'IDENTITY_CLAIM_REJECTED', 'owner'], ['{"ops":[],"more":1}', 'INPUT_UNKNOWN_FIELD'], ['[]', 'BODY_NOT_OBJECT']]) {
    const checked = check(text);
    assert.deepEqual([checked.ok, checked.code, checked.field], [false, code, field], text.slice(0, 60));
  }
  const second = contract.validateBody('batch', parsed(`{"ops":[${op},{"op":"reserve","key":"key-00000002","tier":"burst","units":"1"}]}`));
  assert.deepEqual([second.ok, second.code, second.field], [false, 'INPUT_INVALID', 'units']);
});
